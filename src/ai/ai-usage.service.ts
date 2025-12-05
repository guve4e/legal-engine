// src/ai/ai-usage.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AiUsageRepository, AiUsageLogInput } from '../pg/ai-usage.repository';

export interface DailyUsageStat {
  day: string;              // '2025-11-28'
  callCount: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

export interface KindUsageStat {
  kind: string;
  callCount: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

// NEW: overview types
export interface AiUsageOverviewTotals {
  lastNDays: number;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;
}

export interface AiUsageOverview {
  totals: AiUsageOverviewTotals;
  daily: DailyUsageStat[];
  byKind: KindUsageStat[];
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly repo: AiUsageRepository) {}

  /**
   * Rough pricing calculator – update values if OpenAI prices change.
   * All prices are USD per 1M tokens.
   */
  computeCostUsd(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number | null {
    const pricingPer1M: Record<string, { input: number; output: number }> = {
      'gpt-4.1-mini': { input: 0.15, output: 0.6 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      // fallback
      default: { input: 0.15, output: 0.6 },
    };

    const p = pricingPer1M[model] ?? pricingPer1M.default;

    const inputCost = (inputTokens / 1_000_000) * p.input;
    const outputCost = (outputTokens / 1_000_000) * p.output;

    const total = inputCost + outputCost;
    if (!isFinite(total) || total === 0) return null;
    return Number(total.toFixed(6));
  }

  async record(input: AiUsageLogInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch (e) {
      this.logger.warn(
        `Failed to record AI usage: ${(e as Error).message}`,
      );
    }
  }

  async getDailyStats(days = 7): Promise<DailyUsageStat[]> {
    const rows = await this.repo.getDailyStats(days);
    return rows.map((r) => ({
      day: r.day,
      callCount: r.call_count,
      totalTokens: Number(r.total_tokens),
      totalCostUsd: r.total_cost_usd ? Number(r.total_cost_usd) : null,
    }));
  }

  async getKindStats(from?: Date, to?: Date): Promise<KindUsageStat[]> {
    const rows = await this.repo.getKindStats(from, to);
    return rows.map((r) => ({
      kind: r.kind,
      callCount: r.call_count,
      totalTokens: Number(r.total_tokens),
      totalCostUsd: r.total_cost_usd ? Number(r.total_cost_usd) : null,
    }));
  }

  // NEW: single aggregated overview (totals + daily + byKind)
  async getOverview(
    days = 7,
    from?: Date,
    to?: Date,
  ): Promise<AiUsageOverview> {
    const [daily, byKind] = await Promise.all([
      this.getDailyStats(days),
      this.getKindStats(from, to),
    ]);

    const base = daily.reduce(
      (acc, row) => {
        acc.totalCalls += row.callCount;
        acc.totalTokens += row.totalTokens;
        acc.totalCostUsd += row.totalCostUsd ?? 0;
        return acc;
      },
      { totalCalls: 0, totalTokens: 0, totalCostUsd: 0 },
    );

    const avgTokensPerCall =
      base.totalCalls > 0 ? base.totalTokens / base.totalCalls : 0;

    const avgCostPerCall =
      base.totalCalls > 0 ? base.totalCostUsd / base.totalCalls : 0;

    return {
      daily,
      byKind,
      totals: {
        lastNDays: days,
        totalCalls: base.totalCalls,
        totalTokens: base.totalTokens,
        totalCostUsd: Number(base.totalCostUsd.toFixed(6)),
        avgTokensPerCall,
        avgCostPerCall: Number(avgCostPerCall.toFixed(6)),
      },
    };
  }
}