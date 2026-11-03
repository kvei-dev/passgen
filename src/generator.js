// Password generator: words + a controlled share of random characters.
// Pure functions only (no DOM). The RNG is injectable so the logic is testable;
// the default RNG is crypto.getRandomValues.
import { WORD_LISTS } from './wordlist.js';
import { log2Choose, countWithClasses, rating } from './entropy.js';

export const LIMITS = { minLength: 12, maxLength: 24, minShare: 0.2, maxShare: 0.6 };

export const DEFAULTS = {
  length: 16,
  randomShare: 0.35, // fraction of the password made of random characters
  digits: true,
  symbols: true,
  letters: false, // random letters inside the random part
  symbolSet: '!@#$%&*?+=-_.',
  capitalization: 'first', // none | first | title | random
  leet: false,
  leetCount: 1, // how many letters to substitute (random positions)
  exclude: 'normal', // off | normal | strict  (look-alike characters)
  wordList: 'large', // common (~10k familiar words) | large (~15k)
};

// Characters never produced in each mode (case-sensitive glyphs).
const EXCLUDED = {
  off: '',
  normal: 'Il1|O0\'"`',
  strict: 'Il1|O0\'"`oSBZ258.,;:',
};

// letter -> replacement candidates; the first one that is not excluded wins.
const LEET = {
  i: ['1', '!'],
  l: ['1'],
  e: ['3'],
  a: ['4', '@'],
  o: ['0'],
  s: ['5', '$'],
  t: ['7'],
};

const PREFERRED_MIN_WORD = 4;
const DIGITS = '0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------------------------------------------------------------- randomness

const buf = new Uint32Array(1);
/** Default RNG: one uniformly random uint32 from the Web Crypto CSPRNG. */
export function cryptoRng() {
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

/** Unbiased integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max, rng = cryptoRng) {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('bad max');
  const limit = Math.floor(2 ** 32 / max) * max;
  for (;;) {
    const x = rng() >>> 0;
    if (x < limit) return x % max;
  }
}

/** Uniform random k-subset of {0..n-1}, returned sorted ascending. */
function sampleSubset(n, k, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + randomInt(n - i, rng);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k).sort((x, y) => x - y);
}

// ------------------------------------------------------------------ word pool

const poolCache = new Map();

/** Words of one list that contain no excluded glyph, bucketed by length. */
function getPool(listName, mode) {
  const key = `${listName}/${mode}`;
  if (poolCache.has(key)) return poolCache.get(key);
  const excluded = new Set(EXCLUDED[mode]);
  const byLen = new Map();
  for (const w of WORD_LISTS[listName]) {
    if ([...w].some((c) => excluded.has(c))) continue;
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length).push(w);
  }
  const lens = [...byLen.keys()].sort((a, b) => a - b);
  const pool = { byLen, minLen: lens[0], maxLen: lens[lens.length - 1] };
  poolCache.set(key, pool);
  return pool;
}

/** Pick a word uniformly among those with length in [lo, hi], not yet used. */
function pickWord(pool, lo, hi, used, rng) {
  lo = Math.max(lo, pool.minLen);
  hi = Math.min(hi, pool.maxLen);
  const lists = [];
  let total = 0;
  for (let len = lo; len <= hi; len++) {
    const l = pool.byLen.get(len);
    if (l) {
      lists.push(l);
      total += l.length;
    }
  }
  if (total === 0) throw new Error('no word fits the length budget');
  for (;;) {
    let idx = randomInt(total, rng);
    for (const l of lists) {
      if (idx < l.length) {
        if (used.has(l[idx])) break; // duplicate: draw again (negligible effect)
        used.add(l[idx]);
        return { word: l[idx], bits: Math.log2(total) };
      }
      idx -= l.length;
    }
  }
}

// ------------------------------------------------------------------- options

function normalize(input) {
  const o = { ...DEFAULTS, ...input };
  o.length = Math.round(Math.min(LIMITS.maxLength, Math.max(LIMITS.minLength, o.length)));
  o.randomShare = Math.min(LIMITS.maxShare, Math.max(LIMITS.minShare, o.randomShare));
  if (!(o.exclude in EXCLUDED)) throw new Error(`unknown exclude mode: ${o.exclude}`);
  if (!(o.wordList in WORD_LISTS)) throw new Error(`unknown word list: ${o.wordList}`);
  if (!['none', 'first', 'title', 'random'].includes(o.capitalization)) {
    throw new Error(`unknown capitalization: ${o.capitalization}`);
  }
  o.leetCount = Math.max(0, Math.round(o.leetCount));
  return o;
}

/** Character classes for the random part, minus excluded glyphs, de-duplicated. */
function buildClasses(o) {
  const excluded = new Set(EXCLUDED[o.exclude]);
  const seen = new Set();
  const take = (chars) => {
    const out = [];
    for (const c of chars) {
      if (excluded.has(c) || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  };
  const classes = [];
  if (o.digits) classes.push(take(DIGITS));
  if (o.symbols) {
    // only printable ASCII punctuation; letters/digits/space are not "symbols"
    classes.push(take([...o.symbolSet].filter((c) => /[!-/:-@[-`{-~]/.test(c))));
  }
  if (o.letters) classes.push(take(LETTERS));
  const nonEmpty = classes.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) throw new Error('enable at least one random character class');
  return nonEmpty;
}

// ------------------------------------------------------------------ generate

/**
 * Generate one password.
 * @returns {{password, length, entropyBits, words, wordCount, randomCount,
 *            randomShare, leetApplied, segments}}
 *   segments: [{text, kind: 'word' | 'random'}] for colouring in the UI.
 */
export function generate(options = {}, rng = cryptoRng) {
  const o = normalize(options);
  const pool = getPool(o.wordList, o.exclude);
  const classes = buildClasses(o);
  const excluded = new Set(EXCLUDED[o.exclude]);

  // 1. Split the length budget between random characters and words.
  const L = o.length;
  const r = Math.min(Math.max(Math.round(L * o.randomShare), 1), L - pool.minLen);
  const W = L - r;

  // 2. Choose how many words, then pick them so the total fits the budget.
  // Prefer words of >= 4 letters (3-letter words carry little entropy and look
  // like noise); fall back to the pool minimum only when the budget forces it.
  const { maxLen } = pool;
  const minLen = W >= PREFERRED_MIN_WORD ? Math.max(PREFERRED_MIN_WORD, pool.minLen) : pool.minLen;
  const kMin = Math.ceil(W / maxLen);
  const kMax = Math.floor(W / minLen);
  const k = Math.min(kMax, Math.max(kMin, W >= 8 ? 2 : 1, Math.round(W / 5.5)));

  let bits = 0;
  const used = new Set();
  const words = [];
  let budget = W;
  for (let i = 0; i < k; i++) {
    const left = k - i; // words still to pick, including this one
    let lo;
    let hi;
    if (left === 1) {
      // last word: use (almost) the whole remaining budget; <= 2 chars of slack
      lo = Math.max(minLen, budget - 2);
      hi = budget;
    } else {
      lo = Math.max(minLen, budget - (left - 1) * maxLen);
      hi = Math.min(maxLen, budget - (left - 1) * minLen);
    }
    const pick = pickWord(pool, lo, hi, used, rng);
    words.push(pick.word);
    bits += pick.bits;
    budget -= pick.word.length;
  }
  const wordChars = W - budget;
  const randomCount = L - wordChars; // = r + slack (0..2)

  // 3. Optional leet substitutions at random positions.
  let leetApplied = 0;
  const chars = words.map((w) => [...w]);
  if (o.leet && o.leetCount > 0) {
    const eligible = [];
    chars.forEach((cs, wi) =>
      cs.forEach((c, ci) => {
        const rep = (LEET[c] || []).find((x) => !excluded.has(x));
        if (rep) eligible.push({ wi, ci, rep });
      }),
    );
    const c = Math.min(o.leetCount, eligible.length);
    if (c > 0) {
      for (const idx of sampleSubset(eligible.length, c, rng)) {
        const e = eligible[idx];
        chars[e.wi][e.ci] = e.rep;
      }
      bits += log2Choose(eligible.length, c);
      leetApplied = c;
    }
  }

  // 4. Capitalisation (never produces an excluded glyph such as "I" or "O").
  const canCap = (cs) => /[a-z]/.test(cs[0]) && !excluded.has(cs[0].toUpperCase());
  chars.forEach((cs, i) => {
    if (!canCap(cs)) return;
    let up = false;
    if (o.capitalization === 'title') up = true;
    else if (o.capitalization === 'first') up = i === 0;
    else if (o.capitalization === 'random') {
      up = randomInt(2, rng) === 1;
      bits += 1;
    }
    if (up) cs[0] = cs[0].toUpperCase();
  });
  const wordTexts = chars.map((cs) => cs.join(''));

  // 5. Random part: uniform over strings that contain every enabled class.
  const alphabet = classes.flat();
  const required = randomCount >= classes.length ? classes : [];
  const classOf = new Map();
  classes.forEach((cl, i) => cl.forEach((c) => classOf.set(c, i)));
  let randomChars;
  for (;;) {
    randomChars = Array.from({ length: randomCount }, () => alphabet[randomInt(alphabet.length, rng)]);
    const present = new Set(randomChars.map((c) => classOf.get(c)));
    if (required.every((_, i) => present.has(i))) break;
  }
  bits += Math.log2(
    countWithClasses(
      alphabet.length,
      required.map((c) => c.length),
      randomCount,
    ),
  );

  // 6. Interleave. Words never touch each other when the budget allows it
  //    (keeps word boundaries visible); otherwise any arrangement is allowed.
  const T = k + randomCount;
  let wordPos;
  if (randomCount >= k - 1) {
    const n = T - k + 1;
    wordPos = sampleSubset(n, k, rng).map((p, i) => p + i);
    bits += log2Choose(n, k);
  } else {
    wordPos = sampleSubset(T, k, rng);
    bits += log2Choose(T, k);
  }
  const isWord = new Set(wordPos);
  const segments = [];
  let wi = 0;
  let ri = 0;
  for (let t = 0; t < T; t++) {
    if (isWord.has(t)) {
      segments.push({ text: wordTexts[wi++], kind: 'word' });
    } else {
      const last = segments[segments.length - 1];
      const ch = randomChars[ri++];
      if (last && last.kind === 'random') last.text += ch;
      else segments.push({ text: ch, kind: 'random' });
    }
  }
  const password = segments.map((s) => s.text).join('');

  return {
    password,
    length: password.length,
    entropyBits: bits,
    words,
    wordCount: k,
    randomCount,
    randomShare: randomCount / L,
    leetApplied,
    segments,
  };
}

/** Generate `count` independent passwords. */
export function generateMany(options, count, rng = cryptoRng) {
  return Array.from({ length: count }, () => generate(options, rng));
}

/**
 * Keep generating until `count` passwords whose strength tier is in `tiers`
 * ('weak' | 'fair' | 'good' | 'strong') are found, or `maxAttempts` is reached.
 * Rejection sampling keeps every accepted password a genuine, unbiased draw
 * from the generator (we never edit or re-roll parts of a password).
 * @returns {{results, attempts, meanBits, maxBits, complete}}
 */
export function generateMatching(options, count, tiers, rng = cryptoRng, maxAttempts = 5000) {
  const wanted = new Set(tiers);
  const results = [];
  let attempts = 0;
  let sum = 0;
  let maxBits = 0;
  while (wanted.size > 0 && results.length < count && attempts < maxAttempts) {
    const r = generate(options, rng);
    attempts++;
    sum += r.entropyBits;
    maxBits = Math.max(maxBits, r.entropyBits);
    if (wanted.has(rating(r.entropyBits).id)) results.push(r);
  }
  return {
    results,
    attempts,
    meanBits: attempts ? sum / attempts : 0,
    maxBits,
    complete: results.length === count,
  };
}
