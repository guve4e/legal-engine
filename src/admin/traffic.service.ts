// src/traffic/traffic.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { TrafficRepository, PageviewInsert } from '../pg/traffic.repository';
import * as crypto from 'crypto';

@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);

  constructor(private readonly repo: TrafficRepository) {}

  hashIp(ip?: string | null): string | null {
    if (!ip) return null;
    return crypto
      .createHash('sha256')
      .update(ip)
      .digest('hex')
      .slice(0, 32);
  }

  async recordPageview(input: Omit<PageviewInsert, 'ipHash'> & { ip?: string | null }) {
    try {
      await this.repo.insertPageview({
        ...input,
        ipHash: this.hashIp(input.ip ?? null),
      });
    } catch (e) {
      this.logger.warn(`Failed to record pageview: ${(e as Error).message}`);
    }
  }
}