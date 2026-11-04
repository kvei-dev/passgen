import { generateMatching, suggestSettings, estimateEntropy, SHIFT_ROW_SYMBOLS } from './generator.js';
import { crackSeconds, formatDuration, rating, bitsLabel, SCENARIOS } from './entropy.js';
import {
  SIMPLE_LEVELS,
  ADV_PRESETS,
  ALL_SYMBOLS,
  TIER_IDS,
  defaultState,
  loadState,
  saveState,
  getStorage,
  toOptions,
  toView,
  sanitize,
} from './settings.js';

const $ = (id) => document.getElementById(id);
const storage = getStorage();
let state = loadState(storage);

const VERDICTS = {
  weak: 'Короткий пароль: підходить лише там, де довших не приймають.',
  fair: 'Прийнятно для неважливих акаунтів.',
  good: 'Добре для більшості акаунтів.',
  strong: 'Сильний: підходить для найважливіших акаунтів.',
};

// ------------------------------------------------------------------ helpers

const persist = () => saveState(storage, state);
const scenarioOf = () => SCENARIOS.find((s) => s.id === (state.mode === 'simple' ? 'fast' : state.scenario)) || SCENARIOS[2];

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function setStatus(text) {
  $('status').textContent = text;
}

function setNotice(text) {
  $('notice').hidden = !text;
  $('notice-text').textContent = text || '';
}

/** Copy to the clipboard; falls back to execCommand for insecure contexts and old browsers. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;left:-999px';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyFrom(button, text) {
  const ok = await copyText(text);
  if (!ok) {
    toast('Не вдалося скопіювати: виділіть пароль і скопіюйте вручну.');
    return;
  }
  toast('Пароль скопійовано');
  const original = button.dataset.label || button.textContent;
  button.dataset.label = original;
  button.textContent = 'Скопійовано ✓';
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

// ------------------------------------------------------ state <-> controls

function applyStateToControls() {
  document.body.dataset.mode = state.mode;
  $('mode-simple').setAttribute('aria-pressed', String(state.mode === 'simple'));
  $('mode-advanced').setAttribute('aria-pressed', String(state.mode === 'advanced'));

  for (const radio of document.querySelectorAll('input[name="level"]')) radio.checked = radio.value === state.simple.level;
  $('avoid').checked = state.simple.avoidLookalikes;

  const a = state.adv;
  $('length').value = a.length;
  $('share').value = a.share;
  $('digits').checked = a.digits;
  $('symbols').checked = a.symbols;
  $('letters').checked = a.letters;
  $('symbolSet').value = a.symbolSet;
  $('capitalization').value = a.capitalization;
  $('exclude').value = a.exclude;
  $('wordList').value = a.wordList;
  $('count').value = String(a.count);
  $('leet').checked = a.leet;
  $('leetCount').value = String(a.leetCount);
  $('scenario').value = state.scenario;
  for (const id of TIER_IDS) $(`tier-${id}`).checked = a.tiers[id];
}

function readAdvanced() {
  const tiers = Object.fromEntries(TIER_IDS.map((id) => [id, $(`tier-${id}`).checked]));
  state = sanitize({
    ...state,
    adv: {
      length: $('length').value,
      share: $('share').value,
      digits: $('digits').checked,
      symbols: $('symbols').checked,
      letters: $('letters').checked,
      symbolSet: $('symbolSet').value,
      capitalization: $('capitalization').value,
      exclude: $('exclude').value,
      wordList: $('wordList').value,
      leet: $('leet').checked,
      leetCount: $('leetCount').value,
      count: Number($('count').value),
      tiers,
    },
    scenario: $('scenario').value,
  });
}

// ----------------------------------------------------------------- rendering

function fillPassword(el, res) {
  el.replaceChildren();
  for (const seg of res.segments) {
    const span = document.createElement('span');
    span.className = seg.kind === 'word' ? 'w' : 'r';
    span.textContent = seg.text;
    el.append(span);
  }
}

function fillMeta(el, res) {
  const rate = rating(res.entropyBits);
  const sc = scenarioOf();
  const badge = document.createElement('span');
  badge.className = `badge ${rate.id}`;
  badge.textContent = rate.label;
  el.replaceChildren(
    badge,
    ` · ${bitsLabel(Math.floor(res.entropyBits))} · підбір ≈ ${formatDuration(crackSeconds(res.entropyBits, sc.rate))} (${sc.label.toLowerCase()})`,
  );
  return rate;
}

function renderAlt(res) {
  const li = document.createElement('li');
  li.className = 'alt';
  const code = document.createElement('code');
  fillPassword(code, res);
  const meta = document.createElement('span');
  meta.className = 'meta';
  fillMeta(meta, res);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small';
  btn.textContent = 'Копіювати';
  btn.setAttribute('aria-label', 'Копіювати цей пароль');
  btn.addEventListener('click', () => copyFrom(btn, res.password));
  li.append(code, meta, btn);
  return li;
}

let primaryPassword = '';

function renderPrimary(res) {
  const code = $('primary-code');
  const meter = $('meter');
  if (!res) {
    primaryPassword = '';
    code.textContent = '—';
    meter.className = 'meter';
    meter.setAttribute('aria-label', '');
    $('primary-meta').textContent = '';
    $('verdict').textContent = '';
    $('copy-primary').disabled = true;
    return;
  }
  primaryPassword = res.password;
  fillPassword(code, res);
  const rate = fillMeta($('primary-meta'), res);
  meter.className = `meter t-${rate.id}`;
  meter.setAttribute('aria-label', `Надійність: ${rate.label}, ${bitsLabel(Math.floor(res.entropyBits))}`);
  $('verdict').textContent = VERDICTS[rate.id];
  $('copy-primary').disabled = false;
}

function render() {
  const opts = toOptions(state);
  const { count, tiers } = toView(state);

  $('o-length').textContent = state.adv.length;
  $('o-share').textContent = `${state.adv.share}%`;
  $('leetCount').disabled = !state.adv.leet;
  $('scenario-hint').textContent = scenarioOf().hint;
  setNotice('');
  setStatus('');
  $('alts').replaceChildren();
  $('alts-wrap').hidden = true;

  if (tiers.length === 0) {
    renderPrimary(null);
    $('share-hint').textContent = '';
    setStatus('Оберіть хоча б один рівень складності.');
    return;
  }

  try {
    const { results, attempts, meanBits, maxBits, complete } = generateMatching(opts, count, tiers);
    renderPrimary(results[0]);
    const rest = results.slice(1);
    for (const res of rest) $('alts').append(renderAlt(res));
    $('alts-wrap').hidden = rest.length === 0;

    const r = results[0];
    $('share-hint').textContent = r
      ? `Приблизно ${r.randomCount} із ${r.length} символів випадкові, ${r.length - r.randomCount} — зі слів.`
      : '';
    if (!complete) {
      setNotice(
        `Знайдено ${results.length} із ${count} паролів вибраної складності за ${attempts} спроб. ` +
          `За цих налаштувань паролі в середньому мають ${bitsLabel(Math.round(meanBits))} (максимум ${Math.round(maxBits)}).`,
      );
    }
  } catch (e) {
    renderPrimary(null);
    $('share-hint').textContent = '';
    setStatus(e.message);
  }
}

function refreshLevelBits() {
  for (const lvl of Object.values(SIMPLE_LEVELS)) {
    const opts = toOptions({ mode: 'simple', simple: { level: lvl.id, avoidLookalikes: state.simple.avoidLookalikes } });
    try {
      const e = estimateEntropy(opts, 250);
      const r = rating(e.mean);
      const el = $(`bits-${lvl.id}`);
      el.className = `lbits ${r.id}`;
      el.textContent = `≈ ${bitsLabel(Math.floor(e.mean))} · ${r.label}`;
    } catch {
      /* no Web Crypto: render() reports it */
    }
  }
}

function update({ levels = false } = {}) {
  persist();
  render();
  if (levels) refreshLevelBits();
}

// -------------------------------------------------------------------- events

function setMode(mode) {
  state.mode = mode;
  applyStateToControls();
  update();
}

$('mode-simple').addEventListener('click', () => setMode('simple'));
$('mode-advanced').addEventListener('click', () => setMode('advanced'));

for (const radio of document.querySelectorAll('input[name="level"]')) {
  radio.addEventListener('change', () => {
    state.simple.level = radio.value;
    update();
  });
}
$('avoid').addEventListener('change', () => {
  state.simple.avoidLookalikes = $('avoid').checked;
  update({ levels: true });
});

const onAdvancedInput = () => {
  readAdvanced();
  update();
};
$('form').addEventListener('input', onAdvancedInput);
$('filter').addEventListener('input', onAdvancedInput);
$('form').addEventListener('submit', (e) => e.preventDefault());

for (const btn of document.querySelectorAll('[data-preset]')) {
  btn.addEventListener('click', () => {
    Object.assign(state.adv, ADV_PRESETS[btn.dataset.preset]);
    state = sanitize(state);
    applyStateToControls();
    update();
  });
}

$('sym-shift').addEventListener('click', () => {
  $('symbolSet').value = SHIFT_ROW_SYMBOLS;
  $('symbols').checked = true;
  onAdvancedInput();
});
$('sym-all').addEventListener('click', () => {
  $('symbolSet').value = ALL_SYMBOLS;
  $('symbols').checked = true;
  onAdvancedInput();
});

$('reset').addEventListener('click', () => {
  state = { ...defaultState(), mode: state.mode };
  applyStateToControls();
  update({ levels: true });
  toast('Налаштування скинуто');
});

$('regen').addEventListener('click', render);
$('copy-primary').addEventListener('click', () => primaryPassword && copyFrom($('copy-primary'), primaryPassword));

$('mask').addEventListener('click', () => {
  const masked = $('mask').getAttribute('aria-pressed') !== 'true';
  $('mask').setAttribute('aria-pressed', String(masked));
  $('mask').textContent = masked ? 'Показати' : 'Приховати';
  document.querySelector('.result').classList.toggle('masked', masked);
});

$('autotune').addEventListener('click', () => {
  const sug = suggestSettings(toOptions(state), toView(state).tiers);
  if (!sug) {
    setStatus('Для обраних рівнів підібрати довжину й частку не вдалося: спробуйте інший словник чи менше виключень.');
    return;
  }
  state.adv.length = sug.length;
  state.adv.share = Math.round(sug.randomShare * 100);
  applyStateToControls();
  update();
  setStatus(`Налаштування змінено: довжина ${sug.length}, випадкових символів ${state.adv.share}%.`);
});

// --------------------------------------------------------------------- init

$('scenario').replaceChildren(
  ...SCENARIOS.map((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    return o;
  }),
);
applyStateToControls();
render();
refreshLevelBits();
