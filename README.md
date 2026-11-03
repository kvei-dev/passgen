# Memorable Password Generator

A static, client-side password generator. Passwords are 12-24 characters long and
made of **real words plus a controlled share of random characters** (digits, symbols,
optionally letters), so they are easier to remember than pure random strings but are
not "just words".

Nothing is sent anywhere and nothing is stored. A strict Content-Security-Policy
(`default-src 'none'`) is set in `index.html`.

## Options

- **Length** 12-24 (the result always has exactly that many characters).
- **Random characters** 20-60% of the length. Separators between words are part of this share.
- Random part: digits, symbols (editable set), optional random letters. Every enabled class appears at least once.
- **Capitalization**: none / first word / every word / random.
- **Leetspeak**: replace up to N letters at random positions (`i->1`, `e->3`, `a->4`, `o->0`, `s->5`, `t->7`).
- **Exclude look-alikes**: `normal` removes `I l 1 | O 0 ' " \``; `strict` also removes `o S 5 B 8 Z 2 . , ; :`. Words containing an excluded glyph are dropped from the list, and leet replacements that would produce an excluded glyph are disabled.

## Algorithm

1. `r = round(length * share)` random characters, the rest is the word budget.
2. Pick k words (words of >= 4 letters preferred) that fill the budget; the last word leaves at most 2 characters of slack, which go to the random part.
3. Optional leet substitutions and capitalization.
4. Random part is sampled uniformly from strings containing every enabled class.
5. Words are interleaved with random characters at random positions, never touching each other when the budget allows.

All randomness comes from `crypto.getRandomValues` with rejection sampling (no modulo bias).

## Entropy estimate

Computed exactly from the choices actually made: `log2(candidate words at each step)` +
capitalization/leet position bits + `log2(valid random strings)` + `log2(arrangements)`.
It assumes the attacker knows the algorithm; only random choices count.

Typical averages (default settings): 12 chars ~38 bits, 16 chars ~52 bits, 20 chars ~61 bits,
24 chars at 42% random ~80 bits. **12-character passwords with words in them are weak by
design**; use 20+ characters for anything important.

## Development

```bash
npm test          # node:test, Node 22+
npm run serve     # http://localhost:8080
npm run build:wordlist   # regenerate src/wordlist.js from data/
```

Deployed with GitHub Pages via `.github/workflows/pages.yml` (Settings -> Pages -> Source: GitHub Actions).

## Credits

Word list: [EFF large wordlist](https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases),
(c) Electronic Frontier Foundation, [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).
Hyphenated entries were removed.
