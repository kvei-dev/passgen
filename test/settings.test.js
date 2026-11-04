import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY,
  SIMPLE_LEVELS,
  ALL_SYMBOLS,
  defaultState,
  sanitize,
  sanitizeSymbols,
  loadState,
  saveState,
  getStorage,
  toOptions,
  toView,
} from '../src/settings.js';
import { generate, estimateEntropy, SHIFT_ROW_SYMBOLS, DEFAULTS, LIMITS } from '../src/generator.js';
import { SCENARIOS, crackSeconds, rating } from '../src/entropy.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

test('default symbol set is the shifted number row: !@#$%^&*()_+', () => {
  assert.equal(SHIFT_ROW_SYMBOLS, '!@#$%^&*()_+');
  assert.equal(DEFAULTS.symbolSet, '!@#$%^&*()_+');
  assert.equal(defaultState().adv.symbolSet, '!@#$%^&*()_+');
  assert.equal(toOptions(defaultState()).symbolSet, '!@#$%^&*()_+');
});

test('by default generated symbols come only from the shift row', () => {
  const allowed = new Set([...SHIFT_ROW_SYMBOLS]);
  let seenSymbols = new Set();
  for (let i = 0; i < 400; i++) {
    const res = generate({ length: 12 + (i % 13), randomShare: 0.2 + (i % 5) * 0.1 });
    for (const seg of res.segments.filter((x) => x.kind === 'random')) {
      for (const c of seg.text) {
        if (/[0-9]/.test(c)) continue;
        assert.ok(allowed.has(c), `unexpected symbol "${c}" in ${res.password}`);
        seenSymbols.add(c);
      }
    }
  }
  // all twelve shift-row symbols actually occur
  assert.equal(seenSymbols.size, SHIFT_ROW_SYMBOLS.length);
});

test('simple levels include 12, 14, 16, 18, 22 and 24 characters and generate exact lengths', () => {
  assert.deepEqual(
    Object.values(SIMPLE_LEVELS).map((l) => l.length),
    [12, 14, 16, 18, 22, 24],
  );
  for (const level of Object.keys(SIMPLE_LEVELS)) {
    for (const avoidLookalikes of [true, false]) {
      const state = { ...defaultState(), mode: 'simple', simple: { level, avoidLookalikes } };
      const opts = toOptions(state);
      for (let i = 0; i < 50; i++) assert.equal(generate(opts).password.length, SIMPLE_LEVELS[level].length);
    }
  }
});

test('simple levels get stronger as they get longer', () => {
  const means = Object.values(SIMPLE_LEVELS).map((l) =>
    estimateEntropy(toOptions({ mode: 'simple', simple: { level: l.id, avoidLookalikes: true } }), 600).mean,
  );
  for (let i = 1; i < means.length; i++) assert.ok(means[i] > means[i - 1], `levels ${i - 1}->${i}: ${means}`);
  assert.equal(rating(means[0]).id, 'weak');
  assert.ok(['good', 'strong'].includes(rating(means[3]).id), 'standard level must be at least Good');
  assert.equal(rating(means.at(-1)).id, 'strong');
});

test('simple mode shows every tier and 5 passwords; advanced follows its settings', () => {
  const simple = toView(defaultState());
  assert.equal(simple.count, 5);
  assert.deepEqual(simple.tiers, ['weak', 'fair', 'good', 'strong']);
  const s = defaultState();
  s.mode = 'advanced';
  s.adv.count = 10;
  s.adv.tiers = { weak: false, fair: false, good: true, strong: true };
  assert.deepEqual(toView(s), { count: 10, tiers: ['good', 'strong'] });
});

test('sanitize: garbage in, valid complete state out', () => {
  for (const junk of [undefined, null, 42, 'x', [], { adv: 5, simple: 'no', mode: 7 }]) {
    assert.deepEqual(sanitize(junk), defaultState());
  }
  const s = sanitize({
    mode: 'advanced',
    scenario: 'nope',
    simple: { level: 'ultra', avoidLookalikes: 'yes' },
    adv: { length: 999, share: -5, symbolSet: 'abc12éЖ', capitalization: 'LOUD', exclude: 1, wordList: 'huge', leetCount: 99, count: 7, tiers: { weak: false, bogus: true } },
  });
  assert.equal(s.mode, 'advanced');
  assert.equal(s.scenario, 'fast');
  assert.equal(s.simple.level, 'standard');
  assert.equal(s.simple.avoidLookalikes, true);
  assert.equal(s.adv.length, LIMITS.maxLength);
  assert.equal(s.adv.share, LIMITS.minShare * 100);
  assert.equal(s.adv.symbolSet, SHIFT_ROW_SYMBOLS); // nothing valid left -> default
  assert.equal(s.adv.capitalization, 'first');
  assert.equal(s.adv.exclude, 'normal');
  assert.equal(s.adv.wordList, 'large');
  assert.equal(s.adv.leetCount, 4);
  assert.equal(s.adv.count, 5);
  assert.deepEqual(s.adv.tiers, { weak: false, fair: true, good: true, strong: true });
});

test('sanitizeSymbols keeps unique printable ASCII punctuation only', () => {
  assert.equal(sanitizeSymbols('!!@ a1é#\u0000 ^'), '!@#^');
  assert.equal(sanitizeSymbols(ALL_SYMBOLS), ALL_SYMBOLS);
  assert.equal(sanitizeSymbols('!'.repeat(100)), '!');
  assert.equal(sanitizeSymbols(null), '');
  assert.ok(sanitizeSymbols(ALL_SYMBOLS + '"\'`\\').length <= 40);
});

test('save/load round-trip; broken storage never throws', () => {
  const st = fakeStorage();
  const s = defaultState();
  s.mode = 'advanced';
  s.adv.length = 21;
  s.simple.level = 'max';
  assert.equal(saveState(st, s), true);
  assert.deepEqual(loadState(st), s);

  assert.deepEqual(loadState(fakeStorage({ [STORAGE_KEY]: '{not json' })), defaultState());
  assert.deepEqual(loadState(fakeStorage({ [STORAGE_KEY]: '"string"' })), defaultState());
  assert.deepEqual(loadState(null), defaultState());
  const exploding = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(loadState(exploding), defaultState());
  assert.equal(saveState(exploding, s), false);
  assert.equal(saveState(null, s), false);
});

test('only settings are stored: never a password', () => {
  const st = fakeStorage();
  const state = defaultState();
  const res = generate(toOptions(state));
  saveState(st, state);
  assert.ok(!st.data[STORAGE_KEY].includes(res.password));
  assert.deepEqual(Object.keys(st.data), [STORAGE_KEY]);
});

test('getStorage returns null instead of throwing when localStorage is unavailable', () => {
  assert.equal(getStorage(), null); // plain Node has no localStorage
});

test('attacker scenarios: faster attackers need less time', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['online', 'slow', 'fast', 'cluster']);
  const t = SCENARIOS.map((s) => crackSeconds(60, s.rate));
  for (let i = 1; i < t.length; i++) assert.ok(t[i] < t[i - 1]);
  // 60 bits, 1e10 guesses/s: 2^59 / 1e10 s
  assert.ok(Math.abs(crackSeconds(60) - Math.pow(2, 59) / 1e10) < 1);
});

test('without Web Crypto generation is refused (no Math.random fallback)', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
  try {
    assert.throws(() => generate({}), /Web Crypto/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original);
  }
  assert.doesNotThrow(() => generate({}));
});
