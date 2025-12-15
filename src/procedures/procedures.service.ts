// src/procedures/procedures.service.ts
import { Injectable } from '@nestjs/common';
import { PROCEDURES } from './procedures.config';
import { ProcedureMeta, ProcedureSlug } from './procedures.types';
import { LegalQuestionAnalysis } from '../ai/ai.types';

export interface ProcedureMatch {
  procedure: ProcedureMeta;
  score: number;
}

@Injectable()
export class ProceduresService {
  private readonly all = PROCEDURES;

  // ✅ runtime set of valid slugs
  private readonly slugSet: ReadonlySet<ProcedureSlug> = new Set(
    this.all.map((p) => p.slug),
  );

  listAll(): ProcedureMeta[] {
    return this.all;
  }

  // Keep string input because LLM/user input is string
  getBySlug(slug: string): ProcedureMeta | undefined {
    return this.all.find((p) => p.slug === slug);
  }

  // ✅ no any, no casts
  isValidSlug(slug: string): slug is ProcedureSlug {
    return (this.slugSet as ReadonlySet<string>).has(slug);
  }

  initialMatch(question: string, analysis: LegalQuestionAnalysis): ProcedureMatch[] {
    const q = question.toLowerCase();
    const domainSet = new Set((analysis.domains ?? []).map((d) => d.toLowerCase()));
    const lawHintsSet = new Set((analysis.lawHints ?? []).map((l) => l.toLowerCase()));

    const matches: ProcedureMatch[] = [];

    for (const p of this.all) {
      let score = 0;

      for (const d of p.domains) if (domainSet.has(d.toLowerCase())) score += 20;
      for (const lh of p.lawHints) if (lawHintsSet.has(lh.toLowerCase())) score += 40;
      for (const kw of p.keywords) if (q.includes(kw.toLowerCase())) score += 10;

      if (score > 0) matches.push({ procedure: p, score });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }
}