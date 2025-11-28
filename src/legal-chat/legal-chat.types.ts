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

export interface LegalQaService {
  answerQuestion(input: {
    userQuestion: string;
    conversationSummary?: string | null;
    history: { role: 'user' | 'assistant' | 'system'; content: string }[];
  }): Promise<LegalQaAnswer>;
}

export const LEGAL_QA_SERVICE = 'LEGAL_QA_SERVICE';