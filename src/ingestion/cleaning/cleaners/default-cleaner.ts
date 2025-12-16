import { Cleaner, CleanerInput } from '../cleaner';

export class DefaultCleaner implements Cleaner {
  clean(input: CleanerInput): string {
    let t = input.rawText ?? '';

    // normalize line endings
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // remove common junk
    t = t.replace(/\u00A0/g, ' ');                // NBSP
    t = t.replace(/[ \t]+/g, ' ');                // collapse spaces
    t = t.replace(/\n{3,}/g, '\n\n');             // collapse empty lines

    // trim edges
    t = t.trim();

    return t;
  }
}