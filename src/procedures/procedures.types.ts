// src/procedures/procedures.types.ts
export type ProcedureSlug =
  | 'zan58_objection'
  | 'vazrazhenie_akt_globa_kat'
  | 'nap_tax_audit_objection'
  | 'unlawful_dismissal'
// ... up to 10

export interface ProcedureField {
  key: string;                    // "fullName", "egn", "address"
  label: string;                  // като за UI
  type: 'string' | 'text' | 'date' | 'number' | 'select';
  required: boolean;
  helpText?: string;
}

export interface ProcedureMeta {
  slug: ProcedureSlug;
  name: string;                   // "Възражение по чл. 58 ЗАНН"
  shortDescription: string;
  domains: string[];              // ["traffic", "tax", ...] – reuse your domains
  lawHints: string[];             // ["Закон за административните нарушения и наказания"]
  keywords: string[];             // ["акт", "глоба", "ЗАНН", "възражение", "КАТ"]
  templateCode: string;           // link to DOCX template
  requiredFields: ProcedureField[];
  steps: string[];                // human readable steps
}