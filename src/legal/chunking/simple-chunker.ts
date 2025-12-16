export function makeChunksByParagraphs(
  text: string,
  maxChars = 2200,
): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const p of paras) {
    if (p.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${p}` : p;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = p;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}