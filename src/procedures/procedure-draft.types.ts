// src/procedures/procedure-draft.types.ts
export interface ProcedureDraftField {
  key: string;          // "fullName", "actNumber"
  label: string;        // "Три имена"
  type: 'string' | 'text' | 'date' | 'number' | 'select';
  required: boolean;
  helpText?: string;
}

export interface ProcedureDraft {
  // basic identification
  slugSuggestion: string;       // "zan58_objection_kat"
  name: string;                 // "Възражение срещу акт по чл. 58 ЗАНН"
  shortDescription: string;

  // routing hints
  domains: string[];            // ["traffic", "other"]
  lawHints: string[];           // ["Закон за административните нарушения и наказания"]
  keywords: string[];           // ["акт","възражение","КАТ","глоба"]

  // user input schema
  requiredFields: ProcedureDraftField[];

  // human steps
  steps: string[];

  // law references for trust
  lawRefs: {
    lawName: string;            // "ЗАНН"
    article?: string;           // "чл. 44"
    comment?: string;           // "урежда срока за възражение"
  }[];

  // suggested document structure with placeholders
  documentOutline: {
    title: string;              // "ВЪЗРАЖЕНИЕ"
    intro: string;              // text with {{placeholders}}
    body: string;
    closing: string;
  };

  // for debugging / traceability
  sourceQuestion: string;
  usedChunks: {
    lawTitle: string;
    listTitle: string;
    chunkIndex: number;
  }[];
}