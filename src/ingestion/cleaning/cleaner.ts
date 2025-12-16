export type CleanerInput = {
  source: string; // "lex.bg" | "dv" | "pravilnici" | whatever you want
  title?: string;
  rawText: string;
};

export interface Cleaner {
  clean(input: CleanerInput): string;
}