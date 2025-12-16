import type { Cleaner, CleanerInput } from '../cleaner';
import { cleanBulgarianNormText } from './clean-bulgarian-norm-text';

export class BulgarianNormCleaner implements Cleaner {
  // Keep options hook even if unused now (future-proof, no noise)
  constructor(private readonly _opts?: Record<string, unknown>) {}

  clean(input: CleanerInput): string {
    // later: branch by input.source if you ingest dv, etc.
    return cleanBulgarianNormText(input.rawText);
  }
}