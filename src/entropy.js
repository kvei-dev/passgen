// Entropy helpers. All values are in bits.

/** log2 of the binomial coefficient C(n, k). */
export function log2Choose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  k = Math.min(k, n - k);
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log2(n - k + i) - Math.log2(i);
  return s;
}

/**
 * Number of strings of length `len` over an alphabet of size `total` that contain
 * at least one character from EACH class (class sizes given in `classSizes`;
 * classes must be disjoint subsets of the alphabet). Inclusion-exclusion.
 */
export function countWithClasses(total, classSizes, len) {
  const m = classSizes.length;
  let count = 0;
  for (let mask = 0; mask < 1 << m; mask++) {
    let removed = 0;
    let bits = 0;
    for (let i = 0; i < m; i++) {
      if (mask & (1 << i)) {
        removed += classSizes[i];
        bits++;
      }
    }
    count += (bits % 2 ? -1 : 1) * Math.pow(total - removed, len);
  }
  return count;
}

export const GUESSES_PER_SECOND = 1e10; // offline attack on a fast hash

/** Average time to crack: half the search space at GUESSES_PER_SECOND. */
export function crackSeconds(bits) {
  return Math.pow(2, bits - 1) / GUESSES_PER_SECOND;
}

/** Ukrainian plural form: 1 біт, 2 біти, 5 бітів. */
export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const bitsLabel = (n) => `${n} ${plural(n, 'біт', 'біти', 'бітів')}`;

export function formatDuration(seconds) {
  if (seconds < 1) return 'миттєво';
  const units = [
    [['секунда', 'секунди', 'секунд'], 60],
    [['хвилина', 'хвилини', 'хвилин'], 60],
    [['година', 'години', 'годин'], 24],
    [['день', 'дні', 'днів'], 365],
    [['рік', 'роки', 'років'], 1000],
  ];
  let v = seconds;
  for (const [forms, step] of units) {
    if (v < step) {
      const n = Math.round(v);
      return `${n} ${plural(n, ...forms)}`;
    }
    v /= step;
  }
  // v is now in thousands of years
  const years = v * 1000;
  if (years < 1e6) return `${Math.round(years / 1000)} тис. років`;
  if (years < 1e9) return `${Math.round(years / 1e6)} млн років`;
  if (years < 1e12) return `${Math.round(years / 1e9)} млрд років`;
  return 'довше за вік Всесвіту';
}

export function rating(bits) {
  if (bits < 50) return { id: 'weak', label: 'Слабкий' };
  if (bits < 60) return { id: 'fair', label: 'Середній' };
  if (bits < 80) return { id: 'good', label: 'Добрий' };
  return { id: 'strong', label: 'Сильний' };
}
