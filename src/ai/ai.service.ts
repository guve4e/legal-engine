// src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface AiContextItem {
  citation?: string;
  text: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openAiUrl = 'https://api.openai.com/v1/chat/completions';
  private readonly model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  constructor(private readonly http: HttpService) {}

  async generateAnswer(
    question: string,
    context: AiContextItem[],
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set. Returning fallback answer.');
      return 'AI не е конфигуриран (липсва OPENAI_API_KEY). В момента виждаш само суровия контекст от базата.';
    }

    const systemPrompt = `
Ти си български виртуален юридически помощник.
Имаш достъп до откъси от закони и коментар.
Отговаряй ясно, на разговорен български, но се опирай на закона.
Ако нещо го няма в дадения контекст, кажи, че нямаш достатъчно информация.
Не измисляй членове или алинеи, които не са в контекста.
`;

    const contextText = context
      .map(
        (c, i) =>
          `Контекст ${i + 1}: ${c.citation ? c.citation + ' - ' : ''}${
            c.text
          }`,
      )
      .join('\n\n');

    const userMessage = `
Въпрос на потребителя:
${question}

Даден ти е следният юридически контекст:
${contextText}

Моля:
1) Обясни какво важи в конкретния случай.
2) Ако е уместно, посочи на кои членове/алиеи се опираш.
3) Предупреди, че това не е официална правна консултация, а помощ от AI.
`;

    try {
      const response$ = this.http.post(
        this.openAiUrl,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
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
}