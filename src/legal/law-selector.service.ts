import { Injectable } from '@nestjs/common';
import { LawRow } from '../pg/pg-legal.repository';
import { LegalQuestionAnalysis } from '../ai/ai.types';

@Injectable()
export class LawSelectorService {
  /**
   * Choose candidate laws based on:
   * - AI-proposed law names (lawHints)
   * - light boosts for always-relevant laws (ZANN, APK, Constitution)
   */
  selectCandidateLaws(
    allLaws: LawRow[],
    analysis: LegalQuestionAnalysis,
    opts?: { maxLaws?: number },
  ): LawRow[] {
    const maxLaws = opts?.maxLaws ?? 5;
    const lawHints = Array.isArray(analysis?.lawHints) ? analysis.lawHints : [];

    const normalizedHints = lawHints.map((h) => (h ?? '').toLowerCase()).filter(Boolean);

    const scored = allLaws.map((law) => {
      const title = `${law.law_title ?? ''} ${law.list_title ?? ''}`.toLowerCase();
      let score = 0;

      // 1) Direct match with lawHints (main signal)
      for (const hint of normalizedHints) {
        if (title.includes(hint)) score += 80;
      }

      // 2) Light boost for always-relevant laws
      if (title.includes('конституция на република българия')) score += 5;
      if (title.includes('административните нарушения и наказания')) score += 5; // ЗАНН
      if (title.includes('административнопроцесуален кодекс')) score += 5; // АПК

      return { law, score };
    });

    const positive = scored.filter((s) => s.score > 0);

    positive.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.law.id - b.law.id;
    });

    if (positive.length > 0) {
      return positive.slice(0, maxLaws).map((s) => s.law);
    }

    // fallback: stable deterministic list if AI gave no useful hints
    return [...allLaws].sort((a, b) => a.id - b.id).slice(0, maxLaws);
  }
}