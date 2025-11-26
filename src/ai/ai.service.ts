// src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AiContextItem {
  citation?: string;
  text: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openAiUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  constructor(private readonly http: HttpService) {}

  /**
   * Used for FINAL answers to the user (based on passages/chunks).
   */
  async generateAnswer(
    question: string,
    context: AiContextItem[],
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set. Returning fallback answer.');
      return 'AI не е конфигуриран (липсва OPENAI_API_KEY). В момента виждаш само суровия контекст от базата.';
    }

    // 🧠 Stronger legal system prompt
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
      const response$ = this.http.post(
        this.openAiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.2, // по-стегнат, по-малко халюцинации
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { data } = await firstValueFrom(response$);

      const answer =
        data?.choices?.[0]?.message?.content ??
        'Не успях да получа валиден отговор от модела.';

      return answer;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI: ${error.message}`,
        error.stack,
      );
      return 'Възникна грешка при комуникацията с AI модела. Опитай отново по-късно.';
    }
  }

  /**
   * NEW: Rewrite a colloquial user question into a better semantic-search query
   * for Bulgarian legal texts.
   *
   * If the API key is missing or something fails, we gracefully fall back
   * to the original question.
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
      const response$ = this.http.post(
        this.openAiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const { data } = await firstValueFrom(response$);

      const rewritten =
        data?.choices?.[0]?.message?.content?.trim() || question;

      this.logger.debug(
        `Legal search rewrite:\n  original="${question}"\n  rewritten="${rewritten}"`,
      );

      return rewritten;
    } catch (error: any) {
      this.logger.error(
        `Error while calling OpenAI for rewrite: ${error.message}`,
        error.stack,
      );
      // Fallback: just use the original
      return question;
    }
  }
}