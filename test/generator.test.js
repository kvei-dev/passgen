import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, generateMatching, suggestSettings, randomInt, DEFAULTS, LIMITS } from '../src/generator.js';
import { countWithClasses, log2Choose, formatDuration, rating, plural, bitsLabel } from '../src/entropy.js';
import { WORD_LISTS } from '../src/wordlist.js';

// Deterministic uint32 PRNG (mulberry32) so failures are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const EXCLUDED = {
  normal: 'Il1|O0\'"`',
  strict: 'Il1|O0\'"`oSBZ258.,;:',
};

test('word lists: unique, lowercase, 3-9 letters, large extends common', () => {
  for (const [name, list] of Object.entries(WORD_LISTS)) {
    assert.equal(new Set(list).size, list.length, `${name}: duplicates`);
    assert.ok(list.every((w) => /^[a-z]{3,9}$/.test(w)), `${name}: bad word`);
  }
  assert.ok(WORD_LISTS.common.length > 10000);
  assert.ok(WORD_LISTS.large.length > 15000);
  const large = new Set(WORD_LISTS.large);
  assert.ok(WORD_LISTS.common.every((w) => large.has(w)), 'large must contain every common word');
});

test('word lists contain no blocklisted words', () => {
  const bad = ['hell', 'dead', 'naked', 'drug', 'bomb', 'chink', 'cripple', 'retard', 'grope', 'crap', 'damn', 'murder', 'rape'];
  for (const [name, list] of Object.entries(WORD_LISTS)) {
    const set = new Set(list);
    for (const w of bad) assert.ok(!set.has(w), `${name} contains ${w}`);
    for (const w of list) assert.ok(!/nigg|fuck|shit|cunt|whore|slut|porn|bitch/.test(w), `${name}: ${w}`);
  }
});

test('the larger list yields more entropy than the common one', () => {
  const rng = seeded(31);
  const avg = (wordList) => {
    let t = 0;
    for (let i = 0; i < 400; i++) t += generate({ length: 16, randomShare: 0.35, wordList }, rng).entropyBits;
    return t / 400;
  };
  assert.ok(avg('large') > avg('common'));
});

test('generated words always come from the selected list', () => {
  const rng = seeded(77);
  for (const wordList of ['common', 'large']) {
    const set = new Set(WORD_LISTS[wordList]);
    for (let i = 0; i < 300; i++) {
      const res = generate({ wordList, length: 12 + (i % 13) }, rng);
      for (const w of res.words) assert.ok(set.has(w), `${wordList}: ${w}`);
    }
  }
});

test('randomInt rejects values that would cause modulo bias', () => {
  // For max=3 the largest accepted value is 2^32-2; 2^32-1 must be rejected.
  const seq = [0xffffffff, 4];
  let calls = 0;
  const v = randomInt(3, () => seq[calls++]);
  assert.equal(calls, 2);
  assert.equal(v, 1); // 4 % 3
});

test('randomInt stays in range and covers it', () => {
  const rng = seeded(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = randomInt(7, rng);
    assert.ok(v >= 0 && v < 7);
    seen.add(v);
  }
  assert.equal(seen.size, 7);
});

test('countWithClasses matches brute force', () => {
  // alphabet: digits {0,1}, symbols {a,b,c}; strings of length 3 with >=1 of each
  const alpha = ['0', '1', 'a', 'b', 'c'];
  let brute = 0;
  for (const x of alpha)
    for (const y of alpha)
      for (const z of alpha) {
        const s = [x, y, z];
        if (s.some((c) => '01'.includes(c)) && s.some((c) => 'abc'.includes(c))) brute++;
      }
  assert.equal(countWithClasses(5, [2, 3], 3), brute);
  assert.ok(Math.abs(log2Choose(10, 3) - Math.log2(120)) < 1e-9);
});

test('length is exact for every length/share/mode/option combination', () => {
  const rng = seeded(42);
  for (let length = LIMITS.minLength; length <= LIMITS.maxLength; length++) {
    for (const randomShare of [0.2, 0.35, 0.5, 0.6]) {
      for (const exclude of ['off', 'normal', 'strict']) {
        for (const capitalization of ['none', 'first', 'title', 'random']) {
          for (const leet of [false, true]) {
            for (let i = 0; i < 3; i++) {
              const res = generate({ length, randomShare, exclude, capitalization, leet, leetCount: 3 }, rng);
              assert.equal(res.password.length, length, JSON.stringify({ length, randomShare, exclude, res }));
              assert.equal(res.segments.map((s) => s.text).join(''), res.password);
            }
          }
        }
      }
    }
  }
});

test('random share matches the request within 2 characters', () => {
  const rng = seeded(7);
  for (let length = LIMITS.minLength; length <= LIMITS.maxLength; length++) {
    for (const randomShare of [0.2, 0.3, 0.4, 0.5, 0.6]) {
      for (let i = 0; i < 20; i++) {
        const res = generate({ length, randomShare }, rng);
        const target = Math.min(Math.max(Math.round(length * randomShare), 1), length - 3);
        assert.ok(
          res.randomCount >= target && res.randomCount <= target + 2,
          `L=${length} share=${randomShare} target=${target} got=${res.randomCount}`,
        );
        const randomChars = res.segments.filter((s) => s.kind === 'random').reduce((n, s) => n + s.text.length, 0);
        assert.equal(randomChars, res.randomCount);
      }
    }
  }
});

for (const mode of ['normal', 'strict']) {
  test(`excluded look-alike characters never appear (${mode})`, () => {
    const rng = seeded(99);
    const bad = new Set(EXCLUDED[mode]);
    for (let i = 0; i < 1500; i++) {
      const res = generate(
        {
          length: 12 + (i % 13),
          randomShare: 0.2 + (i % 5) * 0.1,
          exclude: mode,
          letters: i % 2 === 0,
          capitalization: ['first', 'title', 'random', 'none'][i % 4],
          leet: true,
          leetCount: 1 + (i % 4),
          symbolSet: '!@#$%&*?+=-_.,;:|`\'"',
        },
        rng,
      );
      for (const c of res.password) assert.ok(!bad.has(c), `${mode}: "${c}" in ${res.password}`);
    }
  });
}

test('random part contains every enabled class', () => {
  const rng = seeded(5);
  for (let i = 0; i < 500; i++) {
    const res = generate({ length: 12 + (i % 13), randomShare: 0.2 + (i % 5) * 0.1, leet: false }, rng);
    const rnd = res.segments.filter((s) => s.kind === 'random').map((s) => s.text).join('');
    assert.ok(/[0-9]/.test(rnd), `no digit in ${res.password}`);
    assert.ok(/[^A-Za-z0-9]/.test(rnd), `no symbol in ${res.password}`);
  }
});

test('words appear intact and in order when leet is off', () => {
  const rng = seeded(11);
  for (let i = 0; i < 300; i++) {
    const res = generate({ leet: false, capitalization: 'random' }, rng);
    const wordSegs = res.segments.filter((s) => s.kind === 'word').map((s) => s.text.toLowerCase());
    assert.deepEqual(wordSegs, res.words);
    assert.equal(new Set(res.words).size, res.words.length, 'duplicate word');
  }
});

test('words are separated by random characters when budget allows', () => {
  const rng = seeded(13);
  for (let i = 0; i < 500; i++) {
    const res = generate({ length: 24, randomShare: 0.4 }, rng);
    for (let s = 1; s < res.segments.length; s++) {
      assert.ok(!(res.segments[s].kind === 'word' && res.segments[s - 1].kind === 'word'));
    }
  }
});

test('leet replaces exactly min(leetCount, eligible) letters', () => {
  const rng = seeded(21);
  let max = 0;
  for (let i = 0; i < 300; i++) {
    const res = generate({ exclude: 'off', leet: true, leetCount: 2, capitalization: 'none' }, rng);
    assert.ok(res.leetApplied <= 2);
    max = Math.max(max, res.leetApplied);
  }
  assert.equal(max, 2);
  const off = generate({ leet: false }, rng);
  assert.equal(off.leetApplied, 0);
});

test('entropy is finite and grows with length at a fixed share', () => {
  const rng = seeded(3);
  const avg = (length) => {
    let s = 0;
    for (let i = 0; i < 200; i++) s += generate({ length, randomShare: 0.35 }, rng).entropyBits;
    return s / 200;
  };
  const a = avg(12);
  const b = avg(16);
  const c = avg(24);
  assert.ok(Number.isFinite(a) && a > 20);
  assert.ok(a < b && b < c, `${a} ${b} ${c}`);
});

test('a higher random share gives more entropy at the same length', () => {
  const rng = seeded(8);
  const avg = (randomShare) => {
    let s = 0;
    for (let i = 0; i < 300; i++) s += generate({ length: 20, randomShare }, rng).entropyBits;
    return s / 300;
  };
  assert.ok(avg(0.2) < avg(0.4) && avg(0.4) < avg(0.6));
});

test('invalid configuration is rejected', () => {
  assert.throws(() => generate({ digits: false, symbols: false, letters: false }), /хоча б один/);
  assert.throws(() => generate({ exclude: 'bogus' }), /unknown exclude/);
  assert.throws(() => generate({ capitalization: 'bogus' }), /unknown capitalization/);
  assert.throws(() => generate({ wordList: 'bogus' }), /unknown word list/);
});

test('out-of-range length and share are clamped', () => {
  assert.equal(generate({ length: 5 }).password.length, LIMITS.minLength);
  assert.equal(generate({ length: 99 }).password.length, LIMITS.maxLength);
  const res = generate({ randomShare: 0.99, length: 12 });
  assert.ok(res.randomCount <= 12 - 3 + 0);
});

test('defaults produce a sane password with the default RNG', () => {
  const res = generate(DEFAULTS);
  assert.equal(res.password.length, DEFAULTS.length);
  assert.ok(res.entropyBits > 40);
});

test('formatDuration / rating (Ukrainian)', () => {
  assert.equal(formatDuration(0.2), 'миттєво');
  assert.equal(formatDuration(1), '1 секунда');
  assert.equal(formatDuration(3), '3 секунди');
  assert.equal(formatDuration(25), '25 секунд');
  assert.equal(formatDuration(90), '2 хвилини');
  assert.equal(formatDuration(3600 * 5), '5 годин');
  assert.equal(formatDuration(86400 * 21), '21 день');
  assert.equal(formatDuration(86400 * 365 * 2), '2 роки');
  assert.equal(formatDuration(86400 * 365 * 5000), '5 тис. років');
  assert.equal(formatDuration(86400 * 365 * 3e6), '3 млн років');
  assert.equal(formatDuration(86400 * 365 * 7e9), '7 млрд років');
  assert.equal(formatDuration(1e30), 'довше за вік Всесвіту');
  assert.equal(rating(40).id, 'weak');
  assert.equal(rating(55).id, 'fair');
  assert.equal(rating(70).id, 'good');
  assert.equal(rating(90).id, 'strong');
  assert.deepEqual([40, 55, 70, 90].map((b) => rating(b).label), ['Слабкий', 'Середній', 'Добрий', 'Сильний']);
});

test('Ukrainian plural forms', () => {
  const f = (n) => plural(n, 'один', 'кілька', 'багато');
  for (const n of [1, 21, 101]) assert.equal(f(n), 'один', String(n));
  for (const n of [2, 3, 4, 22, 24, 102]) assert.equal(f(n), 'кілька', String(n));
  for (const n of [0, 5, 11, 12, 13, 14, 15, 20, 25, 111, 112]) assert.equal(f(n), 'багато', String(n));
  assert.equal(bitsLabel(51), '51 біт');
  assert.equal(bitsLabel(52), '52 біти');
  assert.equal(bitsLabel(55), '55 бітів');
});

test('generateMatching returns only passwords from the requested tiers', () => {
  const rng = seeded(2024);
  // 16 chars / 35%: ~94% fair, ~6% good. 24 chars / 40%: always strong.
  const cases = [
    [{ length: 16, randomShare: 0.35 }, ['good']],
    [{ length: 16, randomShare: 0.35 }, ['fair']],
    [{ length: 16, randomShare: 0.35 }, ['fair', 'good']],
    [{ length: 24, randomShare: 0.4 }, ['strong']],
    [{ length: 24, randomShare: 0.4 }, ['good', 'strong']],
  ];
  for (const [opts, tiers] of cases) {
    const { results, complete } = generateMatching(opts, 5, tiers, rng, 20000);
    assert.ok(complete, `tiers ${tiers} should be reachable at ${JSON.stringify(opts)}`);
    assert.equal(results.length, 5);
    for (const r of results) assert.ok(tiers.includes(rating(r.entropyBits).id), `${r.entropyBits} not in ${tiers}`);
  }
});

test('generateMatching reports shortage when the tier is unreachable', () => {
  const rng = seeded(5);
  const res = generateMatching({ length: 12, randomShare: 0.2 }, 5, ['strong'], rng, 500);
  assert.equal(res.complete, false);
  assert.equal(res.results.length, 0);
  assert.equal(res.attempts, 500);
  assert.ok(res.maxBits < 80 && res.meanBits > 0);
});

test('generateMatching with no tiers does nothing; with all tiers matches generateMany', () => {
  const rng = seeded(6);
  const none = generateMatching({}, 5, [], rng);
  assert.equal(none.attempts, 0);
  assert.equal(none.complete, false);
  const all = generateMatching({}, 5, ['weak', 'fair', 'good', 'strong'], rng);
  assert.ok(all.complete);
  assert.equal(all.attempts, 5);
});

test('suggestSettings finds settings that actually reach the requested tiers', () => {
  const rng = seeded(404);
  const base = { length: 16, randomShare: 0.35 };
  for (const tiers of [['strong'], ['good', 'strong'], ['weak'], ['fair']]) {
    const sug = suggestSettings(base, tiers, rng);
    assert.ok(sug, `no suggestion for ${tiers}`);
    assert.ok(sug.length >= LIMITS.minLength && sug.length <= LIMITS.maxLength);
    assert.ok(sug.randomShare >= LIMITS.minShare - 1e-9 && sug.randomShare <= LIMITS.maxShare + 1e-9);
    const { complete } = generateMatching({ ...base, ...sug }, 5, tiers, rng, 20000);
    assert.ok(complete, `suggestion ${JSON.stringify(sug)} cannot produce ${tiers}`);
  }
});

test('suggestSettings keeps already-working settings and returns the nearest otherwise', () => {
  const rng = seeded(405);
  // Fair is ~94% at 16/35%, so the current settings must be returned unchanged.
  assert.deepEqual(suggestSettings({ length: 16, randomShare: 0.35 }, ['fair'], rng), { length: 16, randomShare: 0.35 });
  // Strong needs more length/share than the current 16/35%.
  const sug = suggestSettings({ length: 16, randomShare: 0.35 }, ['strong'], rng);
  assert.ok(sug.length > 16 || sug.randomShare > 0.35);
  assert.equal(suggestSettings({}, [], rng), null);
});
