export interface ProcedureSelectionInput {
  slug: string;
  name: string;
  shortDescription: string;
  keywords: string[];
}

export interface ProcedureSelectionResult {
  slug: string | null;
  reason: string;
}

export interface ProcedureDraftField {
  key: string;
  label: string;
  type: 'string' | 'text' | 'date' | 'number' | 'select';
  required: boolean;
  helpText?: string;
}

export interface ProcedureDraftLawRef {
  lawName: string;
  article?: string;
  comment?: string;
}

export interface ProcedureDraftOutline {
  title: string;
  intro: string;
  body: string;
  closing: string;
}

export interface ProcedureDraftFromAi {
  slugSuggestion: string;
  name: string;
  shortDescription: string;
  domains: string[];
  lawHints: string[];
  keywords: string[];
  requiredFields: ProcedureDraftField[];
  steps: string[];
  lawRefs: ProcedureDraftLawRef[];
  documentOutline: ProcedureDraftOutline;
}