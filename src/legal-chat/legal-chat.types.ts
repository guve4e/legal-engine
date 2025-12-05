export interface SupportingChunk {
  lawId: number;
  lawTitle: string;
  listTitle: string;
  sourceUrl: string;
  chunkIndex: number;
  chunkText: string;
}

export interface LegalQaAnswer {
  answer: string;
  rewrittenQuestion?: string;
  domains?: string[];
  lawHints?: string[];
  supportingChunks?: SupportingChunk[];
}


export type HistoryMode = 'summary' | 'full';

export const HISTORY_MODE: HistoryMode =
  (process.env.AIADVOCATE_HISTORY_MODE as HistoryMode) || 'summary';

export interface LegalQaService {
  answerQuestion(input: {
    userQuestion: string;
    conversationSummary?: string | null;
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }): Promise<LegalQaAnswer>;
}

export const LEGAL_QA_SERVICE = 'LEGAL_QA_SERVICE';