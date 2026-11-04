# Memorable Password Generator

A static, client-side password generator (Ukrainian UI). Passwords are 12-24 characters long
and made of **real words plus a controlled share of random characters**, so they are easier
to remember than pure random strings but are not "just words".

Nothing is sent anywhere. A strict Content-Security-Policy (`default-src 'none'`) is set in
`index.html`. Only *settings* are kept in the browser's `localStorage`; generated passwords are
never stored, logged or transmitted.

## Two modes

**Simple** - pick a length card and copy:

| Length | Name | ~Entropy |
|---|---|---|
| 12 | Short | ~40 bits (weak) |
| 14 | Compact | ~50 bits |
| 16 | Basic | ~55 bits |
| 18 | Standard | ~61 bits |
| 22 | Strong | ~72 bits |
| 24 | Maximum | ~85 bits |

The numbers on the cards are measured live (Monte-Carlo over the real generator), not hard-coded.
One switch: avoid look-alike characters (`I l 1 | O 0`).

**Advanced** - everything below.

## Advanced options

- **Length** 12-24 (the result always has exactly that many characters).
- **Random characters** 20-60% of the length. Separators between words count towards this share.
- Random part: digits, symbols, optional random letters. Every enabled class appears at least once.
- **Symbols** default to the shifted number row of the keyboard: `!@#$%^&*()_+`. Presets: Shift row / extended set; the field is editable (printable ASCII punctuation only).
- **Capitalization**: none / first word / every word / random.
- **Leetspeak**: replace up to N letters at random positions (`i->1`, `e->3`, `a->4`, `o->0`, `s->5`, `t->7`).
- **Exclude look-alikes**: `normal` removes `I l 1 | O 0 ' " \``; `strict` also removes `o S 5 B 8 Z 2 . , ; :`. Words containing an excluded glyph are dropped from the list; leet replacements that would produce an excluded glyph are disabled.
- **Word list**: `large` (~15,000 words, default) or `common` (~10,000).
- **Show passwords rated** (Weak < 50 bits, Fair 50-59, Good 60-79, Strong 80+): the generator keeps drawing until it has the requested number of matching passwords (up to 5000 tries). If the selected levels are unreachable it explains why and offers **"Підібрати налаштування"**, which moves length/share to the nearest values that reach them.
- **Attack scenario** for the time-to-crack estimate: online login (10^2/s), slow hash such as bcrypt (10^4/s), fast hash on one GPU (10^10/s, default), cluster (10^12/s).
- Hide button (blurs the passwords while screen-sharing), copy with clipboard fallback, presets, reset.

## Algorithm

1. `r = round(length * share)` random characters, the rest is the word budget.
2. Pick k words (words of >= 4 letters preferred) that fill the budget; the last word leaves at most 2 characters of slack, which go to the random part.
3. Optional leet substitutions and capitalization.
4. Random part is sampled uniformly from strings containing every enabled class.
5. Words are interleaved with random characters at random positions, never touching each other when the budget allows.

All randomness comes from `crypto.getRandomValues` with rejection sampling (no modulo bias).
There is **no `Math.random` fallback**: without Web Crypto the page refuses to generate.

## Entropy estimate

Computed from the choices actually made: `log2(candidate words at each step)` +
capitalization/leet position bits + `log2(valid random strings)` + `log2(arrangements)`.
It assumes the attacker knows the algorithm; only random choices count. The formula was
cross-checked with a collision test (2^21 samples: 15 collisions observed vs 11.6 expected).
**12-character passwords with words in them are weak by design**; use 18+ for anything important.

## Word lists

Built by `npm run build:wordlist` from `data/` (see `data/NOTICE.md`):

- `common` (10,358 words) = EFF large list + SCOWL levels 10 and 20.
- `large` (15,092 words) = `common` + SCOWL level 35.
- Only plain lowercase words of 3-9 letters; derived forms (plurals, -ed, -ing, -ly, -er/-est) of words already in the list are dropped.
- Offensive and unpleasant words are removed using the LDNOOBW list plus `data/blocklist-extra.txt`.

## Development

```bash
npm test                 # node:test, Node 22+ (generator, entropy, settings)
npm run serve            # http://localhost:8080
npm run build:wordlist   # regenerate src/wordlist.js from data/
```

Layout: `src/generator.js` (pure generator), `src/entropy.js` (math, scenarios, Ukrainian plurals),
`src/settings.js` (state, validation, persistence), `src/ui.js` (DOM), `src/wordlist.js` (generated).

## Deployment

`.github/workflows/pages.yml` runs the tests and publishes to GitHub Pages on every push to `main`
(Settings -> Pages -> Source: GitHub Actions; the `github-pages` environment must allow `main`).
While assembling the site it appends the commit hash to every module/CSS/icon URL, so browsers
cannot mix a new `index.html` with a stale cached module. `.github/workflows/ci.yml` runs the tests
on other branches and pull requests.

## Credits

- [EFF large wordlist](https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases), (c) Electronic Frontier Foundation, [CC BY 3.0 US](https://creativecommons.org/licenses/by/3.0/us/).
- [SCOWL](http://wordlist.aspell.net/), (c) Kevin Atkinson (permission notice in `data/SCOWL-Copyright.txt`), via the `wordlist-english` npm package (MIT).
- [LDNOOBW](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) blocklist, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
