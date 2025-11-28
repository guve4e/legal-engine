// src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';

export interface AiContextItem {
  citation?: string;
  text: string;
}

/**
 * Result of analyzing a Bulgarian legal question.
 * - domains: high-level categories (traffic, police, labor, tax, consumer, family, criminal, other)
 * - lawHints: Bulgarian names of relevant laws/codes (e.g. "Закон за движението по пътищата")
 */
export interface LegalQuestionAnalysis {
  domains: string[];
  lawHints: string[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  constructor(private readonly openai: OpenAI) {}

  /**
   * Used for FINAL answers to the user (based on passages/chunks).
   */
  async generateAnswer(
    question: string,
    context: AiContextItem[],
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. Returning fallback answer in generateAnswer().',
      );
      return 'AI не е конфигуриран (липсва OPENAI_API_KEY). В момента виждаш само суровия контекст от базата.';
    }

    const systemPrompt = `
Ти си "AIAdvocate" – виртуален юридически помощник по българско право.

Правила:
- Отговаряш САМО на български език.
- Опираш се САМО на предоставените откъси от закони/нормативни актове.
- НЕ измисляш членове, алинеи или норми, които не присъстват в контекста.
- Ако липсва достатъчна информация в контекста, го казваш ясно и препоръчваш консултация с адвокат.
- Пишеш ясно и структурирано, без излишен жаргон.
- В края на всеки отговор добавяш кратко напомняне, че това не е официална правна консултация.
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

    const userMessage = `
Въпрос на потребителя:
${question}

По-долу са наличните откъси от български закони и свързани текстове.
Използвай само тях при анализа си:

${contextText}

Моля, дай отговор на български, като:
1) Кратко обясниш какво важи в конкретния случай според тези текстове.
2) Ако е възможно, посочиш конкретни членове/алинии, на които се опираш (само ако се виждат ясно в текста).
3) Обясниш с нормален, разбираем език, не само юридически жаргон.
4) В края изрично добавиш, че това НЕ е официална правна консултация, а помощ от AI асистент.
`.trim();

    try {
      const res = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
      });

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

      const rewritten =
        res.choices?.[0]?.message?.content?.trim() || question;

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
  async analyzeLegalQuestion(
    question: string,
  ): Promise<LegalQuestionAnalysis> {
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
}