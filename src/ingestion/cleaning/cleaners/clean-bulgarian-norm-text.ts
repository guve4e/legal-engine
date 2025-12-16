import crypto from 'crypto';

function sha1(s: string) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

function normForDedupe(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"„]/g, '"')
    // keep BG letters + numbers + whitespace + basic punctuation
    .replace(/[^\p{L}\p{N}\s\.,\-\(\)§:]/gu, '')
    .trim();
}

function isChromeLine(line: string) {
  const t = line.trim();
  if (!t) return false;

  const chromeTokens = [
    'НОВИНИ',
    'НОРМИ',
    'ЛИЦА',
    'ИНСТИТУЦИИ',
    'Конституция',
    'Кодекси',
    'Наредби',
    'Закони',
    'Правилници по прилагане',
    'Последен брой на ДВ',
  ];

  if (chromeTokens.some((x) => t.includes(x))) return true;

  if (/^(понеделник|вторник|сряда|четвъртък|петък|събота|неделя)\b/i.test(t))
    return true;

  return false;
}

function findStartIndex(lines: string[]) {
  const re = /\b(ПРАВИЛНИК|ЗАКОН|НАРЕДБА|КОДЕКС)\b/;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i;
  }
  return 0;
}

export function cleanBulgarianNormText(raw: string): string {
  let lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !isChromeLine(l));

  lines = lines.slice(findStartIndex(lines));

  const rebuilt = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const paras = rebuilt
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const seenStrong = new Set<string>();
  const seenLoose = new Set<string>();
  const out: string[] = [];

  for (const p of paras) {
    const strong = sha1(p);
    const loose = sha1(normForDedupe(p));

    if (seenStrong.has(strong) || seenLoose.has(loose)) continue;

    seenStrong.add(strong);
    seenLoose.add(loose);
    out.push(p);
  }

  let cleaned = out.join('\n\n');
  cleaned = cleaned
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\bРаздел\b)/g, '\n$1')
    .replace(/(\bГлава\b)/g, '\n$1')
    .replace(/(\bЧл\.\s*\d+)/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}