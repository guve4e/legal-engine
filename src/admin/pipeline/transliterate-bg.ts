// src/admin/pipeline/search/transliterate-bg.ts

// Very practical BG mapping for search. Not perfect linguistics; perfect enough for admin search.
export function latinToCyrillicBg(input: string): string {
  const s = (input || '').toLowerCase();

  // IMPORTANT: order matters (longest first)
  const rules: Array<[RegExp, string]> = [
    [/sht/g, 'щ'],
    [/sh/g, 'ш'],
    [/zh/g, 'ж'],
    [/ch/g, 'ч'],
    [/ts/g, 'ц'],
    [/yu/g, 'ю'],
    [/ya/g, 'я'],

    [/a/g, 'а'],
    [/b/g, 'б'],
    [/v/g, 'в'],
    [/g/g, 'г'],
    [/d/g, 'д'],
    [/e/g, 'е'],
    [/z/g, 'з'],
    [/i/g, 'и'],
    [/y/g, 'й'], // “y” is ambiguous; good enough for search
    [/k/g, 'к'],
    [/l/g, 'л'],
    [/m/g, 'м'],
    [/n/g, 'н'],
    [/o/g, 'о'],
    [/p/g, 'п'],
    [/r/g, 'р'],
    [/s/g, 'с'],
    [/t/g, 'т'],
    [/u/g, 'у'],
    [/f/g, 'ф'],
    [/h/g, 'х'], // h->х common in translit
  ];

  let out = s;
  for (const [re, rep] of rules) out = out.replace(re, rep);
  return out;
}

// Optional: makes Cyrillic queries match Latin titles too (rare, but nice).
export function cyrillicToLatinBg(input: string): string {
  const s = (input || '').toLowerCase();

  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
    'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sht', 'ъ': 'a',
    'ь': '', 'ю': 'yu', 'я': 'ya',
  };

  return s.replace(/[а-яё]/g, (ch) => map[ch] ?? ch);
}