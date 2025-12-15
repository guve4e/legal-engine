// src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { AiUsageService } from './ai-usage.service'; // 👈 нов import
import {
  AiContextItem,
  ChatTurn,
  QuestionCategory,
  LegalQuestionAnalysis, QuestionKindResult,
} from './ai.types';

import {
  ProcedureSelectionInput,
  ProcedureSelectionResult,
  ProcedureDraftFromAi,
} from '../procedures/procedure-ai.types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  constructor(
    private readonly openai: OpenAI,
    private readonly aiUsage: AiUsageService,
  ) {}

  /**
   * Used for FINAL answers to the user (based on passages/chunks).
   *
   * `opts.history` – предишни съобщения в чата (само за по-добър контекст).
   */
  async generateAnswer(
    question: string,
    context: AiContextItem[],
    opts?: { history?: ChatTurn[] },
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Returning fallback answer in generateAnswer().',
      );
      return 'AI не е конфигуриран (липсва OPENAI_API_KEY). В момента виждаш само суровия контекст от базата.';
    }

    const history = opts?.history ?? [];

    const systemPrompt = `
Ти си "AIAdvocate" – виртуален юридически помощник по българско право.

Правила:
- Отговаряш САМО на български език.
- Опираш се САМО на предоставените откъси от закони/нормативни актове (контекст).
- НЕ измисляш членове, алинеи или норми, които не присъстват в контекста.
- Ако липсва достатъчна информация в контекста, го казваш ясно и препоръчваш консултация с адвокат
  или проверка в официален източник (напр. самия закон в ДВ/lex.bg).
- Пишеш ясно и структурирано, без излишен жаргон.
- Стремиш се да дадеш ИЗЧЕРПАТЕЛЕН отговор въз основа на контекста
  (обикновено поне 3–5 абзаца, ако има достатъчно материал).
- В края на всеки отговор добавяш кратко напомняне, че това не е официална правна консултация.
- Ако текущият въпрос очевидно продължава предишен („А ако…“, „А в този случай…“),
  вземи предвид историята на разговора, но пак се опирай САМО на юридическия контекст.
`.trim();

    const contextText =
      context && context.length
        ? context
            .map(
              (c, i) =>
                `# Източник ${i + 1}\n` +
                (c.citation ? `Цитат: ${c.citation}\n` : '') +
                `Текст:\n${c.text}`,
            )
            .join('\n\n')
        : 'Няма предоставени откъси.';

    const historyText =
      history && history.length
        ? history
            .map((h, i) => {
              const who = h.role === 'user' ? 'Потребител' : 'AIAdvocate';
              return `${who} ${i + 1}:\n${h.text}`;
            })
            .join('\n\n')
        : 'Няма предишен контекст от разговора.';

    const userMessage = `
Предишен разговор (резюме на чата до момента):
${historyText}

Текущ въпрос на потребителя:
${question}

По-долу са наличните откъси от български закони и свързани текстове.
Използвай САМО тях при анализа си:

${contextText}

Моля, дай отговор на български, като следваш този формат:

1) **Общо заключение**
   - 2–4 изречения, които обобщават какво важи в случая според тези текстове.
2) **Подробности по закона**
   - Обясни по-детайлно какво следва от всеки по-важен откъс.
   - Ако в текста ясно се виждат членове/алинии, посочи ги (но НЕ измисляй такива, ако ги няма).
3) **Какво липсва / ограничения на отговора**
   - Ясно кажи какво НЕ може да бъде отговорено на база на тези откъси.
4) **Препоръка**
   - Кратко посочи към какъв тип специалист или институция е разумно да се обърне човекът при нужда.
5) **Дисклеймър**
   - В края изрично добави, че това НЕ е официална правна консултация, а помощ от AI асистент.
`.trim();

    try {
      const res = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.25,
      });

      // 🔢 metering
      const usage = (res as any).usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        const costUsd = this.aiUsage.computeCostUsd(
          this.model,
          promptTokens,
          completionTokens,
        );

        await this.aiUsage.record({
          kind: 'generateAnswer',
          model: this.model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          costUsd,
          extra: {
            questionPreview: question.slice(0, 200),
            contextCount: context.length,
          },
        });
      }

      const answer =
        res.choices?.[0]?.message?.content ??
        'Не успях да получа валиден отговор от модела.';

      return answer;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI (generateAnswer): ${error.message}`,
        error.stack,
      );
      return 'Възникна грешка при комуникацията с AI модела. Опитай отново по-късно.';
    }
  }

  /**
   * Rewrite a colloquial user question into a better semantic-search query.
   */
  async rewriteLegalSearchQuery(question: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Using original question as search query.',
      );
      return question;
    }

    const systemPrompt = `
Ти си помощник по българско право.

Задачата ти е:
- Да превърнеш разговорен въпрос на потребителя в КРАТЪК и ясен текст,
  подходящ за семантично търсене в база с БЪЛГАРСКИ закони.
- Ако е ясно за кой закон става дума, включи името му в запитването
  (напр. "Закон за движението по пътищата", "Закон за задълженията и договорите" и т.н.).
- НЕ отговаряш на въпроса, НЕ обясняваш нищо – само формулираш по-прецизно запитване.
- Пиши на български.
- Върни само една кратка линия текст, без допълнителни коментари.
`.trim();

    const userMessage = `
Първоначален въпрос:
"${question}"

Моля, преформулирай това като кратко, прецизно юридическо запитване
за семантично търсене в база от български закони.
`.trim();

    try {
      const res = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
      });

      // 🔢 metering
      const usage = (res as any).usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        const costUsd = this.aiUsage.computeCostUsd(
          this.model,
          promptTokens,
          completionTokens,
        );

        await this.aiUsage.record({
          kind: 'rewriteLegalSearchQuery',
          model: this.model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          costUsd,
          extra: {
            questionPreview: question.slice(0, 200),
          },
        });
      }

      const rewritten = res.choices?.[0]?.message?.content?.trim() || question;

      this.logger.debug(
        `Legal search rewrite:\n  original="${question}"\n  rewritten="${rewritten}"`,
      );

      return rewritten;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI for rewriteLegalSearchQuery: ${error.message}`,
        error.stack,
      );
      return question;
    }
  }

  /**
   * Analyze a Bulgarian legal question and return:
   * - high-level domains
   * - lawHints: Bulgarian names of relevant laws/codes.
   */
  async analyzeLegalQuestion(question: string): Promise<LegalQuestionAnalysis> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Returning empty legal analysis.',
      );
      return { domains: [], lawHints: [] };
    }

    const systemPrompt = `
Ти си помощник по българско право.

Задачата ти е да анализираш въпрос на потребителя и да върнеш САМО JSON
с два масива:

- "domains": списък от кратки домейни, напр:
  - "traffic" (движение по пътищата, КАТ, шофьорски книжки)
  - "police" (МВР, проверка на самоличност, задържане)
  - "labor" (трудов договор, работодател, работник, осигуровки)
  - "tax" (НАП, данъци, ДДС, публични задължения)
  - "consumer" (права на потребители, онлайн търговия, рекламации)
  - "family" (развод, брак, деца, издръжка)
  - "criminal" (НК, престъпления, наказателни дела)
  - "other" ако не е ясно.

- "lawHints": списък от БЪЛГАРСКИ НАИМЕНОВАНИЯ на закони или кодекси,
  които според теб са релевантни. Напр.:
  - "Закон за движението по пътищата"
  - "Закон за Министерството на вътрешните работи"
  - "Кодекс на труда"
  - "Закон за данък върху добавената стойност"
  - "Данъчно-осигурителен процесуален кодекс"
  - "Наказателен кодекс"
  - "Наказателно-процесуален кодекс"
  - "Закон за защита на потребителите"
  - "Семеен кодекс"
  - "Административнопроцесуален кодекс"
  - и др.

ВЪРНИ само един JSON обект, без обяснения, без допълнителен текст.
`.trim();

    const userMessage = `
Въпрос на потребителя (на български):

"${question}"

Моля, върни JSON с ключове "domains" и "lawHints".
`.trim();

    try {
      const res = await this.openai.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
      });

      // 🔢 metering
      const usage = (res as any).usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        const costUsd = this.aiUsage.computeCostUsd(
          this.model,
          promptTokens,
          completionTokens,
        );

        await this.aiUsage.record({
          kind: 'analyzeLegalQuestion',
          model: this.model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          costUsd,
          extra: {
            questionPreview: question.slice(0, 200),
          },
        });
      }

      const content = res.choices?.[0]?.message?.content;

      if (!content) {
        this.logger.warn(
          'analyzeLegalQuestion: empty content from model, returning fallback.',
        );
        return { domains: [], lawHints: [] };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        this.logger.warn(
          `analyzeLegalQuestion: failed to parse JSON, content="${content}"`,
        );
        return { domains: [], lawHints: [] };
      }

      const domains = Array.isArray(parsed.domains) ? parsed.domains : [];
      const lawHints = Array.isArray(parsed.lawHints) ? parsed.lawHints : [];

      this.logger.debug(
        `Legal question analysis:\n  domains=${JSON.stringify(
          domains,
        )}\n  lawHints=${JSON.stringify(lawHints)}`,
      );

      return { domains, lawHints };
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI for analyzeLegalQuestion: ${error.message}`,
        error.stack,
      );
      return { domains: [], lawHints: [] };
    }
  }

  async updateConversationSummary(input: {
    previousSummary?: string | null;
    lastUserMessage: string;
    lastAssistantMessage: string;
  }): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Returning empty summary in updateConversationSummary().',
      );
      return input.previousSummary ?? '';
    }

    const systemPrompt = `
Ти поддържаш КРАТКО резюме на правен разговор на български.

Правила:
- Максимум 2–3 изречения.
- Дръж само най-важното по същество (темите и контекста).
- Не включвай детайлни суми, дати, имена, освен ако не са ключови.
- Пиши само резюме, без допълнителни обяснения.
`.trim();

    const userPromptLines: string[] = [];

    if (input.previousSummary) {
      userPromptLines.push(`Досегашно резюме:\n${input.previousSummary}\n`);
    } else {
      userPromptLines.push('Досегашно резюме: (няма)\n');
    }

    userPromptLines.push('Последен въпрос от потребителя:');
    userPromptLines.push(input.lastUserMessage);
    userPromptLines.push('\nПоследен отговор от AI:');
    userPromptLines.push(input.lastAssistantMessage);
    userPromptLines.push('\nАктуализирай резюмето:');

    const userMessage = userPromptLines.join('\n');

    try {
      const res = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
      });

      // 🔢 metering
      const usage = (res as any).usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        const costUsd = this.aiUsage.computeCostUsd(
          this.model,
          promptTokens,
          completionTokens,
        );

        await this.aiUsage.record({
          kind: 'updateConversationSummary',
          model: this.model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          costUsd,
        });
      }

      const summary =
        res.choices?.[0]?.message?.content?.trim() ??
        input.previousSummary ??
        '';

      return summary;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI (updateConversationSummary): ${error.message}`,
        error.stack,
      );
      return input.previousSummary ?? '';
    }
  }

  /**
   * Евтин класификатор: определя дали въпросът е:
   *  - "legal"     → истински правен въпрос
   *  - "meta"      → въпрос за самия разговор (резюме, какво обсъждахме и т.н.)
   *  - "non-legal" → всичко останало (smalltalk, рецепти, мотивация и пр.)
   *
   * ⚠️ Сигнатурата остава същата, само реализацията е сменена да ползва chat.completions
   *    с JSON output, без новия `responses` API → няма вече TS грешки.
   */
  async classifyQuestionKind(question: string): Promise<QuestionCategory> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Returning default category "legal" in classifyQuestionKind().',
      );
      return 'legal';
    }

    const systemPrompt = `
Ти си класификатор на потребителски въпроси за правен асистент AIAdvocate.

КАТЕГОРИИ:
- "legal"  → въпрос за българско право, НАП, КАТ, съд, договори, фирми, данъци, трудово право, имоти, административни процедури и т.н.
- "meta"   → въпрос за самия чат или разговор
             (например "резюмирай накратко какво обсъждахме досега",
              "за какво говорихме преди малко", "какво беше вторият ми въпрос",
              "как работиш", "какво е AIAdvocate")
- "non-legal" → всичко останало (smalltalk, "как си", вицове, фитнес, диети,
                готвене, мотивация, спорт и т.н.)

Инструкции:
1) Определи най-подходящата категория за въпроса.
2) Върни САМО валиден JSON в този формат:
{"category": "legal" | "meta" | "non-legal"}

Без никакви обяснения, без текст преди или след JSON-а.
`.trim();

    const userMessage = `Въпрос на потребителя: """${question}"""`;

    try {
      const model = 'gpt-4o-mini';

      const res = await this.openai.chat.completions.create({
        model, // евтин модел за класификатора
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 50,
      });

      // 🔢 metering
      const usage = (res as any).usage;
      if (usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const totalTokens =
          usage.total_tokens ?? promptTokens + completionTokens;
        const costUsd = this.aiUsage.computeCostUsd(
          model,
          promptTokens,
          completionTokens,
        );

        await this.aiUsage.record({
          kind: 'classifyQuestionKind',
          model,
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalTokens,
          costUsd,
          extra: {
            questionPreview: question.slice(0, 200),
          },
        });
      }

      const raw = res.choices?.[0]?.message?.content?.trim() ?? '';

      let category: QuestionCategory = 'legal';

      try {
        const parsed = JSON.parse(raw) as QuestionKindResult;
        if (
          parsed.category === 'legal' ||
          parsed.category === 'meta' ||
          parsed.category === 'non-legal'
        ) {
          category = parsed.category;
        } else {
          this.logger.warn(
            `classifyQuestionKind: invalid category value in JSON, raw="${raw}"`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `classifyQuestionKind: failed to parse JSON, raw="${raw}"`,
        );
      }

      this.logger.debug(
        `classifyQuestionKind(): question="${question}", raw="${raw}", category=${category}`,
      );

      return category;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI for classifyQuestionKind: ${error.message}`,
        error.stack,
      );
      return 'legal';
    }
  }

  async selectBestProcedure(
    question: string,
    candidates: ProcedureSelectionInput[],
  ): Promise<ProcedureSelectionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || candidates.length === 0) {
      return {
        slug: candidates[0]?.slug ?? null,
        reason: 'no-api-or-candidates',
      };
    }

    const systemPrompt = `
Ти си асистент по българско право. Задачата ти е:

- Да избереш най-подходящата процедура от даден списък
  според въпроса на потребителя.
- Ако НЯМА подходяща, върни "slug": null.
- Върни САМО JSON: {"slug":"...", "reason":"..."}.
`.trim();

    const userMessage = `
Въпрос на потребителя:
"${question}"

Кандидат процедури:
${candidates
  .map(
    (c) =>
      `- slug: ${c.slug}\n  име: ${c.name}\n  описание: ${c.shortDescription}\n  ключови думи: ${c.keywords.join(
        ', ',
      )}`,
  )
  .join('\n\n')}

Моля, избери най-подходящата процедура (slug) или null, ако въпросът не пасва.
`;

    const res = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
      max_tokens: 150,
    });

    const raw =
      res.choices?.[0]?.message?.content ??
      '{"slug":null,"reason":"no-content"}';
    try {
      const parsed = JSON.parse(raw);
      return {
        slug: parsed.slug ?? null,
        reason: parsed.reason ?? '',
      };
    } catch {
      return { slug: null, reason: 'parse-error' };
    }
  }

  async generateProcedureDraftFromContext(input: {
    scenarioDescription: string;
    question: string;
    lawContext: AiContextItem[];
  }): Promise<ProcedureDraftFromAi> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY missing in generateProcedureDraftFromContext()',
      );
      throw new Error('AI not configured');
    }

    const systemPrompt = `
Ти си български юридически асистент и трябва да СТРУКТУРИРАШ процедура,
а не да даваш свободен текстов отговор.

Задачата:
- Получаваш описан казус (сценарий) и откъси от закони.
- Трябва да върнеш САМО JSON обект (response_format=json_object) за "чернова" на процедура.

Тази чернова ще се ползва от програмист, който ще я редактира и ще я вкара в система.
Не се притеснявай да предложиш структура, програмистът ще я променя при нужда.

Формат на JSON:
{
  "slugSuggestion": "zan58_objection_kat",
  "name": "Възражение срещу акт по чл. 58 ЗАНН",
  "shortDescription": "...",
  "domains": ["traffic", "..."],
  "lawHints": ["Закон за административните нарушения и наказания"],
  "keywords": ["акт", "АУАН", "глоба", "КАТ", "възражение"],
  "requiredFields": [
    {
      "key": "fullName",
      "label": "Три имена",
      "type": "string",
      "required": true,
      "helpText": "Както е по лична карта."
    }
    // ...
  ],
  "steps": [
    "Стъпка 1 ...",
    "Стъпка 2 ..."
  ],
  "lawRefs": [
    {
      "lawName": "Закон за административните нарушения и наказания",
      "article": "чл. 44",
      "comment": "Урежда срока за възражение срещу акт."
    }
  ],
  "documentOutline": {
    "title": "ВЪЗРАЖЕНИЕ",
    "intro": "Уважаеми ... {{issuingAuthority}}, ...",
    "body": "Описвам фактите: {{facts}} ...",
    "closing": "Моля акта да бъде отменен ... \nДата: {{currentDate}}\nПодпис: {{fullName}}"
  }
}

Правила:
- Връщаш САМО JSON, без обяснения.
- Пиши на български.
- Не измисляй закони, използвай очевидно релевантните според контекста.
`.trim();

    const contextText =
      input.lawContext && input.lawContext.length
        ? input.lawContext
            .map(
              (c, i) => `# Източник ${i + 1}\n${c.citation ?? ''}\n${c.text}`,
            )
            .join('\n\n')
        : 'Няма контекст.';

    const userMessage = `
Казус (описан от потребителя):
${input.scenarioDescription}

Оригинален въпрос:
${input.question}

Откъси от закони:
${contextText}

Моля, върни САМО един JSON обект, описващ чернова на процедура според горния формат.
`.trim();

    const res = await this.openai.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
    });

    const content = res.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from model for procedure draft');
    }

    let parsed: ProcedureDraftFromAi;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      this.logger.error(`Failed to parse procedure draft JSON: ${content}`);
      throw new Error('Invalid JSON from model in procedure draft');
    }

    return parsed;
  }
}
