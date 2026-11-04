import { generateAtLeast, suggestSettings, estimateEntropy, SHIFT_ROW_SYMBOLS, TIER_MIN_BITS } from './generator.js';
import { crackSeconds, formatDuration, rating, bitsLabel, SCENARIOS } from './entropy.js';
import {
  SIMPLE_LEVELS,
  ADV_PRESETS,
  ALL_SYMBOLS,
  MIN_TIERS,
  suggestLevel,
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

const bitsOf = (res) => res.honestBits ?? res.entropyBits;
const tierLabel = (id) => MIN_TIERS.find((t) => t.id === id)?.label ?? id;

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
  $('letters').value = a.letters;
  $('symbolSet').value = a.symbolSet;
  $('capitalization').value = a.capitalization;
  $('exclude').value = a.exclude;
  $('wordList').value = a.wordList;
  $('count').value = String(a.count);
  $('leet').checked = a.leet;
  $('leetCount').value = String(a.leetCount);
  $('scenario').value = state.scenario;
  for (const radio of document.querySelectorAll('input[name="minTier"]')) radio.checked = radio.value === state.minTier;
}

function readAdvanced() {
  state = sanitize({
    ...state,
    adv: {
      length: $('length').value,
      share: $('share').value,
      digits: $('digits').checked,
      symbols: $('symbols').checked,
      letters: $('letters').value,
      symbolSet: $('symbolSet').value,
      capitalization: $('capitalization').value,
      exclude: $('exclude').value,
      wordList: $('wordList').value,
      leet: $('leet').checked,
      leetCount: $('leetCount').value,
      count: Number($('count').value),
    },
    minTier: state.minTier,
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
  const bits = bitsOf(res);
  const rate = rating(bits);
  const sc = scenarioOf();
  const badge = document.createElement('span');
  badge.className = `badge ${rate.id}`;
  badge.textContent = rate.label;
  el.replaceChildren(
    badge,
    ` · ${bitsLabel(Math.floor(bits))} · підбір ≈ ${formatDuration(crackSeconds(bits, sc.rate))} (${sc.label.toLowerCase()})`,
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
  meter.setAttribute('aria-label', `Надійність: ${rate.label}, ${bitsLabel(Math.floor(bitsOf(res)))}`);
  $('verdict').textContent = VERDICTS[rate.id];
  $('copy-primary').disabled = false;
}

function render() {
  const opts = toOptions(state);
  const { count, minTier } = toView(state);

  $('o-length').textContent = state.adv.length;
  $('o-share').textContent = `${state.adv.share}%`;
  $('leetCount').disabled = !state.adv.leet;
  $('scenario-hint').textContent = scenarioOf().hint;
  $('autotune').textContent = state.mode === 'simple' ? 'Обрати довшу довжину' : 'Підібрати налаштування';
  $('filter-note').textContent = '';
  setNotice('');
  setStatus('');
  $('alts').replaceChildren();
  $('alts-wrap').hidden = true;

  try {
    const { results, plan, attempts, complete } = generateAtLeast(opts, count, minTier);
    renderPrimary(results[0]);
    const rest = results.slice(1);
    for (const res of rest) $('alts').append(renderAlt(res));
    $('alts-wrap').hidden = rest.length === 0;

    const r = results[0];
    $('share-hint').textContent = r
      ? `Приблизно ${r.randomCount} із ${r.length} символів випадкові, ${r.length - r.randomCount} — зі слів.`
      : '';

    if (!plan.ok) {
      setNotice(
        `З цими налаштуваннями паролі чесно не досягають рівня «${tierLabel(minTier)}»: у середньому ≈ ${bitsLabel(Math.floor(plan.meanBits))}, ` +
          `навіть із відбором не більше ≈ ${bitsLabel(Math.floor(plan.bestHonest))}. Потрібно щонайменше ${TIER_MIN_BITS[minTier]} із невеликим запасом на похибку оцінки.`,
      );
    } else if (!complete) {
      setNotice(`Знайдено лише ${results.length} із ${count} паролів за ${attempts} спроб. Змініть налаштування.`);
    } else if (plan.correction >= 0.1) {
      $('filter-note').textContent =
        `Відбір за надійністю враховано: показані біти зменшено на ≈ ${plan.correction.toFixed(1).replace('.', ',')} біта, бо зловмисник знає про відбір.`;
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
for (const radio of document.querySelectorAll('input[name="minTier"]')) {
  radio.addEventListener('change', () => {
    state.minTier = radio.value;
    update();
  });
}
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
  if (state.mode === 'simple') {
    const level = suggestLevel(state, state.minTier);
    if (!level) {
      setStatus('Жодна довжина не дає такого рівня чесно: спробуйте нижчий мінімум.');
      return;
    }
    state.simple.level = level;
    applyStateToControls();
    update();
    setStatus(`Обрано довжину ${SIMPLE_LEVELS[level].length}.`);
    return;
  }
  const sug = suggestSettings(toOptions(state), state.minTier);
  if (!sug) {
    setStatus('Для цього рівня підібрати довжину й частку не вдалося: спробуйте інший словник, менше виключень або нижчий мінімум.');
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
