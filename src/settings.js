// App state: defaults, presets, validation and persistence.
// Only SETTINGS are ever stored (in localStorage, in this browser). Generated
// passwords are never stored, logged or sent anywhere.
import { DEFAULTS, LIMITS, SHIFT_ROW_SYMBOLS } from './generator.js';
import { SCENARIOS } from './entropy.js';

export const STORAGE_KEY = 'passgen:settings:v1';
export const TIER_IDS = ['weak', 'fair', 'good', 'strong'];

/** A broader symbol set (no quotes, backtick or backslash: they are error-prone to type). */
export const ALL_SYMBOLS = '!@#$%^&*()_+-=[]{};:,.<>/?|~';

/** Levels of the simple mode. */
export const SIMPLE_LEVELS = {
  short: { id: 'short', length: 12, randomShare: 0.4, name: 'Короткий', note: 'Лише для сайтів, що не приймають довші паролі' },
  compact: { id: 'compact', length: 14, randomShare: 0.4, name: 'Компактний', note: 'Коли потрібно коротко, але не зовсім слабко' },
  basic: { id: 'basic', length: 16, randomShare: 0.4, name: 'Базовий', note: 'Для неважливих акаунтів і форумів' },
  standard: { id: 'standard', length: 18, randomShare: 0.4, name: 'Звичайний', note: 'Для більшості акаунтів' },
  strong: { id: 'strong', length: 22, randomShare: 0.4, name: 'Сильний', note: 'Пошта, банк, робочі акаунти' },
  max: { id: 'max', length: 24, randomShare: 0.5, name: 'Максимум', note: 'Майстер-пароль, ключі шифрування' },
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
      letters: false,
      symbolSet: SHIFT_ROW_SYMBOLS,
      capitalization: DEFAULTS.capitalization,
      exclude: DEFAULTS.exclude,
      wordList: DEFAULTS.wordList,
      leet: false,
      leetCount: 2,
      count: 5,
      tiers: { weak: true, fair: true, good: true, strong: true },
    },
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
  const t = a.tiers && typeof a.tiers === 'object' ? a.tiers : {};
  const tiers = Object.fromEntries(TIER_IDS.map((id) => [id, bool(t[id], true)]));
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
      letters: bool(a.letters, d.adv.letters),
      symbolSet: sanitizeSymbols(a.symbolSet) || d.adv.symbolSet,
      capitalization: oneOf(a.capitalization, ['none', 'first', 'title', 'random'], d.adv.capitalization),
      exclude: oneOf(a.exclude, ['off', 'normal', 'strict'], d.adv.exclude),
      wordList: oneOf(a.wordList, ['common', 'large'], d.adv.wordList),
      leet: bool(a.leet, d.adv.leet),
      leetCount: int(a.leetCount, 1, 4, d.adv.leetCount),
      count: oneOf(Number(a.count), [1, 5, 10], d.adv.count),
      tiers,
    },
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
      letters: false,
      symbolSet: SHIFT_ROW_SYMBOLS,
      capitalization: 'first',
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
    letters: a.letters,
    symbolSet: a.symbolSet,
    capitalization: a.capitalization,
    exclude: a.exclude,
    wordList: a.wordList,
    leet: a.leet,
    leetCount: a.leetCount,
  };
}

/** How many passwords to show, and which strength tiers are wanted. */
export function toView(state) {
  if (state.mode === 'simple') return { count: 5, tiers: [...TIER_IDS] };
  return { count: state.adv.count, tiers: TIER_IDS.filter((id) => state.adv.tiers[id]) };
}
