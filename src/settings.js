// App state: defaults, presets, validation and persistence.
// Only SETTINGS are ever stored (in localStorage, in this browser). Generated
// passwords are never stored, logged or sent anywhere.
import { DEFAULTS, LIMITS, SHIFT_ROW_SYMBOLS, planFilter } from './generator.js';
import { SCENARIOS } from './entropy.js';

export const STORAGE_KEY = 'passgen:settings:v1';
/** "Minimum level" choices; the bit thresholds live in generator.js (TIER_MIN_BITS). */
export const MIN_TIERS = [
  { id: 'any', label: 'Будь-яка' },
  { id: 'fair', label: 'Середній+' },
  { id: 'good', label: 'Добрий+' },
  { id: 'strong', label: 'Сильний' },
];

/** A broader symbol set (no quotes, backtick or backslash: they are error-prone to type). */
export const ALL_SYMBOLS = '!@#$%^&*()_+-=[]{};:,.<>/?|~';

/** Levels of the simple mode. */
// The random part of every simple level holds digits, shift-row symbols and random CAPITAL letters;
// the words stay lowercase so they remain easy to spot. Capital letters add ~1 bit per random character,
// which is what lets 16 characters honestly reach "Good" (>= 60 bits).
export const SIMPLE_LEVELS = {
  short: { id: 'short', length: 12, randomShare: 0.4, name: 'Короткий', note: 'Лише для сайтів, що не приймають довші' },
  compact: { id: 'compact', length: 14, randomShare: 0.4, name: 'Компактний', note: 'Коротко, але не зовсім слабко' },
  basic: { id: 'basic', length: 16, randomShare: 0.45, name: 'Базовий', note: 'Неважливі акаунти, форуми' },
  standard: { id: 'standard', length: 18, randomShare: 0.4, name: 'Звичайний', note: 'Для більшості акаунтів' },
  strong: { id: 'strong', length: 22, randomShare: 0.4, name: 'Сильний', note: 'Пошта, банк, робота' },
  max: { id: 'max', length: 24, randomShare: 0.4, name: 'Максимум', note: 'Майстер-пароль, ключі' },
};

/** Quick presets of the advanced mode (fields of `state.adv`). */
export const ADV_PRESETS = {
  balanced: { length: 16, share: 35, capitalization: 'first', exclude: 'normal', leet: false },
  strong: { length: 24, share: 45, capitalization: 'random', exclude: 'normal', leet: true, leetCount: 2 },
  short: { length: 12, share: 40, capitalization: 'first', exclude: 'normal', leet: false },
  readable: { length: 18, share: 30, capitalization: 'title', exclude: 'strict', leet: false },
};

export function defaultState() {
  return {
    mode: 'simple',
    simple: { level: 'standard', avoidLookalikes: true },
    adv: {
      length: DEFAULTS.length,
      share: Math.round(DEFAULTS.randomShare * 100),
      digits: true,
      symbols: true,
      letters: 'none',
      symbolSet: SHIFT_ROW_SYMBOLS,
      capitalization: DEFAULTS.capitalization,
      exclude: DEFAULTS.exclude,
      wordList: DEFAULTS.wordList,
      leet: false,
      leetCount: 2,
      count: 5,
    },
    minTier: 'any',
    scenario: 'fast',
  };
}

// ------------------------------------------------------------- validation

const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const int = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** Keep printable ASCII punctuation only, de-duplicated, at most 40 characters. */
export function sanitizeSymbols(input) {
  const seen = new Set();
  let out = '';
  for (const c of String(input ?? '')) {
    if (/[!-/:-@[-`{-~]/.test(c) && !seen.has(c)) {
      seen.add(c);
      out += c;
    }
  }
  return out.slice(0, 40);
}

/** Turn anything (stored JSON, garbage, undefined) into a complete, valid state. */
export function sanitize(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const a = raw.adv && typeof raw.adv === 'object' ? raw.adv : {};
  const s = raw.simple && typeof raw.simple === 'object' ? raw.simple : {};
  // legacy: `letters` used to be a boolean
  const letters = a.letters === true ? 'all' : a.letters === false ? 'none' : oneOf(a.letters, ['none', 'upper', 'all'], d.adv.letters);
  return {
    mode: oneOf(raw.mode, ['simple', 'advanced'], d.mode),
    simple: {
      level: oneOf(s.level, Object.keys(SIMPLE_LEVELS), d.simple.level),
      avoidLookalikes: bool(s.avoidLookalikes, d.simple.avoidLookalikes),
    },
    adv: {
      length: int(a.length, LIMITS.minLength, LIMITS.maxLength, d.adv.length),
      share: int(a.share, LIMITS.minShare * 100, LIMITS.maxShare * 100, d.adv.share),
      digits: bool(a.digits, d.adv.digits),
      symbols: bool(a.symbols, d.adv.symbols),
      letters,
      symbolSet: sanitizeSymbols(a.symbolSet) || d.adv.symbolSet,
      capitalization: oneOf(a.capitalization, ['none', 'first', 'title', 'random'], d.adv.capitalization),
      exclude: oneOf(a.exclude, ['off', 'normal', 'strict'], d.adv.exclude),
      wordList: oneOf(a.wordList, ['common', 'large'], d.adv.wordList),
      leet: bool(a.leet, d.adv.leet),
      leetCount: int(a.leetCount, 1, 4, d.adv.leetCount),
      count: oneOf(Number(a.count), [1, 5, 10], d.adv.count),
    },
    minTier: oneOf(raw.minTier, MIN_TIERS.map((x) => x.id), d.minTier),
    scenario: oneOf(raw.scenario, SCENARIOS.map((x) => x.id), d.scenario),
  };
}

// ------------------------------------------------------------ persistence

/** The browser's localStorage, or null when it is blocked (private mode, cookies off, ...). */
export function getStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__passgen_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadState(storage) {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaultState();
  }
}

export function saveState(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------- state -> generator

export function toOptions(state) {
  if (state.mode === 'simple') {
    const lvl = SIMPLE_LEVELS[state.simple.level];
    return {
      length: lvl.length,
      randomShare: lvl.randomShare,
      digits: true,
      symbols: true,
      letters: 'upper',
      symbolSet: SHIFT_ROW_SYMBOLS,
      capitalization: 'none',
      exclude: state.simple.avoidLookalikes ? 'normal' : 'off',
      wordList: 'large',
      leet: false,
    };
  }
  const a = state.adv;
  return {
    length: a.length,
    randomShare: a.share / 100,
    digits: a.digits,
    symbols: a.symbols,
    letters: a.letters === 'upper' ? 'upper' : a.letters === 'all',
    symbolSet: a.symbolSet,
    capitalization: a.capitalization,
    exclude: a.exclude,
    wordList: a.wordList,
    leet: a.leet,
    leetCount: a.leetCount,
  };
}

/** How many passwords to show and the minimum honest level they must reach. */
export function toView(state) {
  return { count: state.mode === 'simple' ? 5 : state.adv.count, minTier: state.minTier };
}

/**
 * Simple mode: the shortest level (not shorter than the current one) for which the
 * requested minimum level is honestly reachable. Returns a level id or null.
 */
export function suggestLevel(state, minTier, rng, samples = 600) {
  const levels = Object.values(SIMPLE_LEVELS).sort((x, y) => x.length - y.length);
  const current = SIMPLE_LEVELS[state.simple.level];
  for (const lvl of levels) {
    if (lvl.length < current.length) continue;
    const opts = toOptions({ mode: 'simple', simple: { level: lvl.id, avoidLookalikes: state.simple.avoidLookalikes } });
    const plan = planFilter(opts, minTier, rng, samples);
    if (plan.ok && plan.acceptance >= 0.2) return lvl.id;
  }
  return null;
}
