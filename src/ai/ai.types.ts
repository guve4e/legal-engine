export interface AiContextItem {
  citation?: string;
  text: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type QuestionCategory = 'legal' | 'meta' | 'non-legal';

export interface LegalQuestionAnalysis {
  domains: string[];
  lawHints: string[];
}

export interface QuestionKindResult {
  category: QuestionCategory;
}