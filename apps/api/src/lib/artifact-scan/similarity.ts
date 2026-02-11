function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i <= padded.length - 3; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const gramsA = trigrams(left);
  const gramsB = trigrams(right);

  let intersection = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersection++;
  }

  const union = gramsA.size + gramsB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

export function keywordOverlap(a: string, b: string): number {
  const wordsA = new Set(
    normalize(a)
      .split(' ')
      .filter((word) => word.length >= 4)
  );
  const wordsB = new Set(
    normalize(b)
      .split(' ')
      .filter((word) => word.length >= 4)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }

  return overlap / Math.max(wordsA.size, wordsB.size);
}

export function firstLikelyTitleLine(rawText: string): string {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidate = lines.find(
    (line) => line.length >= 3 && line.length <= 120
  );
  return candidate ?? '';
}
