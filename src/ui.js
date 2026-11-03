import { generateMany, DEFAULTS } from './generator.js';
import { crackSeconds, formatDuration, rating } from './entropy.js';

const $ = (id) => document.getElementById(id);

const PRESETS = {
  balanced: { length: 16, share: 35, capitalization: 'first', exclude: 'normal', leet: false },
  strong: { length: 24, share: 45, capitalization: 'random', exclude: 'normal', leet: true, leetCount: 2 },
  short: { length: 12, share: 40, capitalization: 'first', exclude: 'normal', leet: false },
  readable: { length: 18, share: 30, capitalization: 'title', exclude: 'strict', leet: false, letters: false },
};

function readSettings() {
  return {
    length: Number($('length').value),
    randomShare: Number($('share').value) / 100,
    digits: $('digits').checked,
    symbols: $('symbols').checked,
    letters: $('letters').checked,
    symbolSet: $('symbolSet').value || DEFAULTS.symbolSet,
    capitalization: $('capitalization').value,
    exclude: $('exclude').value,
    leet: $('leet').checked,
    leetCount: Number($('leetCount').value),
  };
}

function applyPreset(p) {
  $('length').value = p.length;
  $('share').value = p.share;
  $('capitalization').value = p.capitalization;
  $('exclude').value = p.exclude;
  $('leet').checked = p.leet;
  if (p.leetCount) $('leetCount').value = p.leetCount;
  if ('letters' in p) $('letters').checked = p.letters;
}

function setStatus(text) {
  $('status').textContent = text;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Copied to clipboard. Clear it from your clipboard history if you share the device.');
  } catch {
    setStatus('Copy failed: select the password and copy it manually.');
  }
}

function renderRow(res) {
  const li = document.createElement('li');

  const pw = document.createElement('code');
  pw.className = 'pw';
  for (const seg of res.segments) {
    const span = document.createElement('span');
    span.className = seg.kind === 'word' ? 'w' : 'r';
    span.textContent = seg.text;
    pw.append(span);
  }

  const meta = document.createElement('span');
  meta.className = 'meta';
  const rate = rating(res.entropyBits);
  const badge = document.createElement('span');
  badge.className = `badge ${rate.id}`;
  badge.textContent = rate.label;
  meta.append(badge, ` ${Math.round(res.entropyBits)} bits, cracked in ~${formatDuration(crackSeconds(res.entropyBits))}`);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy password');
  btn.addEventListener('click', () => copy(res.password));

  li.append(pw, meta, btn);
  return li;
}

function render() {
  const s = readSettings();
  const out = $('results');
  out.replaceChildren();
  $('o-length').textContent = s.length;
  $('o-share').textContent = `${Math.round(s.randomShare * 100)}%`;
  $('leetCount').disabled = !s.leet;

  try {
    const results = generateMany(s, Number($('count').value));
    for (const res of results) out.append(renderRow(res));
    const r = results[0];
    $('share-hint').textContent =
      `About ${r.randomCount} of ${r.length} characters are random, ${r.length - r.randomCount} come from words.`;
    setStatus('');
  } catch (e) {
    $('share-hint').textContent = '';
    setStatus(e.message);
  }
}

$('form').addEventListener('input', render);
$('form').addEventListener('submit', (e) => e.preventDefault());
$('regen').addEventListener('click', render);
for (const btn of document.querySelectorAll('[data-preset]')) {
  btn.addEventListener('click', () => {
    applyPreset(PRESETS[btn.dataset.preset]);
    render();
  });
}

render();
