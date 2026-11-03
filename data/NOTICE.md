# Data sources

- `eff_large_wordlist.txt` - EFF large wordlist for random passphrases,
  (c) Electronic Frontier Foundation, CC BY 3.0 US.
  https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases
- `scowl-english-words-{10,20,35}.json` - dialect-neutral English words from
  SCOWL (Spell Checker Oriented Word Lists) as packaged by the `wordlist-english`
  npm package (MIT). SCOWL copyright and permission notice: `SCOWL-Copyright.txt`.
  http://wordlist.aspell.net/
- `blocklist-ldnoobw.txt` - List of Dirty, Naughty, Obscene, and Otherwise Bad Words,
  CC BY 4.0. https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words
- `blocklist-extra.txt` - additional whole words excluded by this project.

`src/wordlist.js` is generated from these files by `npm run build:wordlist`.
