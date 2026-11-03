import { generateMatching, suggestSettings, DEFAULTS } from './generator.js';
import { crackSeconds, formatDuration, rating, bitsLabel } from './entropy.js';

const $ = (id) => document.getElementById(id);
const TIERS = ['weak', 'fair', 'good', 'strong'];
const readTiers = () => TIERS.filter((t) => $(`tier-${t}`).checked);

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
    wordList: $('wordList').value,
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

function setNotice(text) {
  $('notice').hidden = !text;
  $('notice-text').textContent = text || '';
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Скопійовано. Очистіть буфер обміну, якщо пристроєм користуються інші.');
  } catch {
    setStatus('Не вдалося скопіювати: виділіть пароль і скопіюйте вручну.');
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
  meta.append(badge, ` ${bitsLabel(Math.floor(res.entropyBits))}, підбір ≈ ${formatDuration(crackSeconds(res.entropyBits))}`);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Копіювати';
  btn.setAttribute('aria-label', 'Копіювати пароль');
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

  const tiers = readTiers();
  setNotice('');
  if (tiers.length === 0) {
    $('share-hint').textContent = '';
    setStatus('Оберіть хоча б один рівень складності.');
    return;
  }

  try {
    const count = Number($('count').value);
    const { results, attempts, meanBits, maxBits, complete } = generateMatching(s, count, tiers);
    for (const res of results) out.append(renderRow(res));
    const r = results[0];
    $('share-hint').textContent = r
      ? `Приблизно ${r.randomCount} із ${r.length} символів випадкові, ${r.length - r.randomCount} — зі слів.`
      : '';
    setStatus('');
    if (!complete) {
      setNotice(
        `Знайдено ${results.length} із ${count} паролів вибраної складності за ${attempts} спроб. ` +
          `За цих налаштувань паролі в середньому мають ${bitsLabel(Math.round(meanBits))} (максимум ${Math.round(maxBits)}).`,
      );
    }
  } catch (e) {
    $('share-hint').textContent = '';
    setStatus(e.message);
  }
}

$('form').addEventListener('input', render);
$('filter').addEventListener('input', render);
$('form').addEventListener('submit', (e) => e.preventDefault());
$('regen').addEventListener('click', render);
$('autotune').addEventListener('click', () => {
  const sug = suggestSettings(readSettings(), readTiers());
  if (!sug) {
    setStatus('Для обраних рівнів підібрати довжину й частку не вдалося: спробуйте інший словник чи менше виключень.');
    return;
  }
  $('length').value = sug.length;
  $('share').value = Math.round(sug.randomShare * 100);
  render();
  setStatus(`Налаштування змінено: довжина ${sug.length}, випадкових символів ${Math.round(sug.randomShare * 100)}%.`);
});
for (const btn of document.querySelectorAll('[data-preset]')) {
  btn.addEventListener('click', () => {
    applyPreset(PRESETS[btn.dataset.preset]);
    render();
  });
}

render();
