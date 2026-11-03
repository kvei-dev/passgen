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

export function formatDuration(seconds) {
  if (seconds < 1) return 'instantly';
  const units = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 365],
    ['year', 1000],
  ];
  let v = seconds;
  for (const [name, step] of units) {
    if (v < step) {
      const n = Math.round(v);
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
    v /= step;
  }
  // v is now in thousands of years
  const years = v * 1000;
  if (years < 1e6) return `${Math.round(years / 1000)} thousand years`;
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`;
  if (years < 1e12) return `${Math.round(years / 1e9)} billion years`;
  return 'longer than the age of the universe';
}

export function rating(bits) {
  if (bits < 50) return { id: 'weak', label: 'Weak' };
  if (bits < 60) return { id: 'fair', label: 'Fair' };
  if (bits < 80) return { id: 'good', label: 'Good' };
  return { id: 'strong', label: 'Strong' };
}
