/* =========================================================================
 * app.js — калькулятор: клавиатура, настройки (за шестернёй) и справочник.
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, evaluate, substituteText, checkIdentity, preprocess } from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, CHAPTER_BY_ID, BOOK, STATS, formulaSearch } from './formulas.js';
import { solveTask, recomputeWith } from './tasks.js';
import { parseInterval, describeInterval, numberLineSVG } from './intervals.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* =========================================================================
 * НАСТРОЙКИ (хранятся в localStorage)
 * ========================================================================= */
const DEFAULTS = {
  screen: 'calc',        // что открывать при запуске: calc | task | interval
  mode: 'answer',        // подробность ответа: answer | steps | full
  method: 'auto',        // способ решения в справочнике: auto | linear | numeric
  intervalFigure: true,  // рисовать числовую прямую
  intervalFill: true,    // закрашивать конец, если он входит
};
const STORE_KEY = 'gdzcalc.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch { /* приватный режим */ }
}
const settings = loadSettings();
const SHOW_STEPS = () => settings.mode !== 'answer';
const SHOW_ALL = () => settings.mode === 'full';

/* =========================================================================
 * ЭКРАНЫ
 * ========================================================================= */
const SCREENS = {
  calc: $('#screen-calc'),
  task: $('#screen-task'),
  interval: $('#screen-interval'),
  settings: $('#screen-settings'),
  ref: $('#screen-ref'),
};
const TITLES = {
  calc: 'Калькулятор', task: 'Задача', interval: 'Промежутки',
  settings: 'Настройки', ref: 'Справочник',
};
let current = 'calc';

function show(name) {
  current = name;
  Object.entries(SCREENS).forEach(([k, el]) => el.classList.toggle('active', k === name));
  $('#bar-title').textContent = TITLES[name] || 'Калькулятор';
  // Верхние пункты подсвечиваются только на своих экранах.
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
  document.body.dataset.screen = name;
  window.scrollTo({ top: 0 });
  if (name === 'settings') renderSettings();
  if (name === 'ref') renderRef();
}

/* =========================================================================
 * КАЛЬКУЛЯТОР
 * ========================================================================= */
const calcExpr = $('#calc-expr');
const calcResult = $('#calc-result');
let expr = '';              // строка выражения в машинной записи
let lastAnswer = null;      // предыдущий результат (для повторного «=»)
let justEvaluated = false;

/** Показ выражения в человеческом виде: * → ·, / → ÷, минус типографский. */
function prettyExpr(src) {
  return src
    .replace(/\*/g, ' · ')
    .replace(/\//g, ' ÷ ')
    .replace(/-/g, ' − ')
    .replace(/sqrt\(/g, '√(')
    .replace(/PI/g, 'π')
    .replace(/\s+/g, ' ')
    .trim();
}

function updateDisplay() {
  calcExpr.textContent = prettyExpr(expr) || '';
  if (justEvaluated && lastAnswer !== null) return;
  const text = expr || '0';
  calcResult.textContent = prettyExpr(text);
  calcResult.classList.toggle('small', calcResult.textContent.length > 10);
  calcResult.classList.toggle('tiny', calcResult.textContent.length > 18);
}

/** Ввод символа с клавиатуры калькулятора. */
function press(key) {
  if (justEvaluated && !/^[+\-*/^)]/.test(key)) { expr = ''; }
  justEvaluated = false;

  if (key === '.' || key === ',') {
    // одна запятая в текущем числе
    const tail = expr.split(/[+\-*/^()]/).pop();
    if (tail.includes('.')) return;
    key = tail === '' ? '0.' : '.';
  }
  if (/^[0-9]$/.test(key)) {
    const tail = expr.split(/[+\-*/^()]/).pop();
    if (tail === '0') expr = expr.slice(0, -1); // «0» заменить, а не «05»
  }
  if (/^[+\-*/^]$/.test(key)) {
    if (!expr && key !== '-') return;
    if (expr && /[+\-*/^]$/.test(expr)) expr = expr.slice(0, -1);
  }
  if (key === ')' && (expr.match(/\(/g) || []).length <= (expr.match(/\)/g) || []).length) return;
  expr += key;
  updateDisplay();
}

/** Стереть последний ввод целиком (функция — как один символ). */
function backspace() {
  justEvaluated = false;
  const m = expr.match(/(sqrt\(|\^2|PI|\.)$/);
  expr = m ? expr.slice(0, -m[0].length) : expr.slice(0, -1);
  updateDisplay();
}

function clearAll() {
  expr = ''; lastAnswer = null; justEvaluated = false;
  updateDisplay();
}

function toggleSign() {
  if (!expr) return;
  // отрицание последнего числа/скобки
  const m = expr.match(/(\d+\.?\d*|\))$/);
  if (!m) return;
  const start = expr.length - m[0].length;
  if (expr.slice(Math.max(0, start - 1), start) === '-') {
    expr = expr.slice(0, start - 1) + expr.slice(start);
  } else {
    expr = expr.slice(0, start) + '-' + expr.slice(start);
  }
  updateDisplay();
}

function applyPercent() {
  if (!expr) return;
  // «200+10%» — процент от предыдущего числа; иначе просто /100
  const m = expr.match(/(\d+\.?\d*)$/);
  if (!m) return;
  const num = Number(m[0]);
  const before = expr.slice(0, expr.length - m[0].length);
  const ctx = before.match(/(-?[\d.]+)\s*([+\-*/])$/);
  let val;
  if (ctx) {
    const base = Number(ctx[1]);
    val = ctx[2] === '+' || ctx[2] === '-' ? base * num / 100 : num / 100;
  } else val = num / 100;
  expr = before + String(Math.round(val * 1e10) / 1e10);
  updateDisplay();
}

/** Вычисление. Способ зависит от настройки. */
function evaluateExpr() {
  const src = expr.trim();
  if (!src) return;
  try {
    let value;
    if (settings.method === 'linear' || settings.method === 'numeric') {
      // эти способы применимы к уравнениям, для выражений считаем напрямую
      value = evaluate(src);
    } else {
      value = evaluate(src);
    }
    if (!Number.isFinite(value)) throw new Error('так считать нельзя');
    lastAnswer = value;
    justEvaluated = true;
    calcExpr.textContent = prettyExpr(src) + ' =';
    const out = fmtSmart(Math.round(value * 1e12) / 1e12);
    calcResult.textContent = out;
    calcResult.classList.toggle('small', out.length > 10);
    calcResult.classList.toggle('tiny', out.length > 18);
    expr = out.replace(/\s/g, '').replace(',', '.');
  } catch (e) {
    calcExpr.textContent = prettyExpr(src) + ' =';
    calcResult.textContent = 'Ошибка';
    calcResult.classList.add('small');
    justEvaluated = true;
    expr = '';
    void e;
  }
}

/* клавиатура */
$$('.keypad .k, .tools button').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.key !== undefined) press(btn.dataset.key);
    const act = btn.dataset.act;
    if (act === 'ac') clearAll();
    if (act === 'del') backspace();
    if (act === 'sign') toggleSign();
    if (act === 'percent') applyPercent();
    if (act === 'eq') evaluateExpr();
  });
});

/* физическая клавиатура — только когда калькулятор на экране */
document.addEventListener('keydown', (e) => {
  if (current !== 'calc') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  const k = e.key;
  if (/^[0-9]$/.test(k) || ['+', '-', '*', '/', '.', ',', '(', ')', '^', '%'].includes(k)) {
    e.preventDefault(); press(k === ',' ? '.' : k);
  } else if (k === 'Enter' || k === '=') { e.preventDefault(); evaluateExpr(); }
  else if (k === 'Backspace') { e.preventDefault(); backspace(); }
  else if (k === 'Escape') { e.preventDefault(); clearAll(); }
});

/* =========================================================================
 * ЗАДАЧА
 * ========================================================================= */
const taskInput = $('#task-input');
const taskResult = $('#task-result');

function parseNum(s) {
  if (s === '' || s === null || s === undefined) return null;
  const v = Number(String(s).replace(',', '.').replace(/[−–—]/g, '-'));
  return Number.isFinite(v) ? v : null;
}

function labelForVar(sol, key, value) {
  const candidates = (sol.related || []).flatMap((r) => (r.vars || []).filter((x) => x.name === key));
  return candidates.find((x) => x.def === value) || candidates[0] || null;
}

function runTask() {
  const text = taskInput.value.trim();
  if (!text) { taskResult.innerHTML = '<div class="err">Введите условие задачи.</div>'; return; }
  renderTask(solveTask(text));
}

function renderTask(sol) {
  if (!sol.ok) {
    taskResult.innerHTML = `<div class="err">Не получилось распознать задачу. Укажите, что нужно найти: «найдите скорость», «сколько процентов», «решите уравнение».</div>`;
    return;
  }

  let html = `<div class="answer">
    <div class="answer-label">Ответ</div>
    <p class="answer-value">${esc(sol.answer)}</p>
  </div>`;

  if (sol.draw) html += `<div class="figure">${sol.draw}</div>`;

  // Подробности — по настройке «Ответ».
  if (SHOW_STEPS() && sol.checks?.length) {
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Проверка</summary><div class="more-body">
      <ul class="check-list">${sol.checks.map((c) => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span><span>${esc(c.detail)}</span></li>`).join('')}</ul>
    </div></details>`;
  }

  if (SHOW_STEPS() && (sol.steps?.length || sol.variants?.length)) {
    let inner = '';
    if (sol.variants?.length) {
      inner += `<div class="tabs-mini">${sol.variants.map((v, i) =>
        `<button data-variant="${i}" class="${i === 0 ? 'active' : ''}">${esc(v.title.replace(/^Способ \d+\.\s*/, ''))}</button>`).join('')}</div>`;
      inner += sol.variants.map((v, i) =>
        `<ol class="steps variant${i === 0 ? ' active' : ''}" data-variant-body="${i}">${v.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`).join('');
    } else {
      inner += `<ol class="steps">${sol.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
    }
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Решение по шагам</summary><div class="more-body">${inner}</div></details>`;
  }

  const numericKeys = Object.entries(sol.inputs || {}).filter(([, v]) => typeof v === 'number');
  if (SHOW_STEPS() && numericKeys.length) {
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Другое число</summary><div class="more-body">
      <div class="fields">${numericKeys.map(([k, v]) => {
        const label = labelForVar(sol, k, v);
        return `<div class="field"><label for="wi-${esc(k)}"><span>${esc(label ? label.label : k)}</span></label>
          <input type="text" id="wi-${esc(k)}" data-whatif="${esc(k)}" value="${esc(fmtPlain(v))}" inputmode="decimal" autocomplete="off"></div>`;
      }).join('')}</div>
      <div id="whatif-live"></div>
    </div></details>`;
  }

  taskResult.innerHTML = html;

  $$('[data-variant]', taskResult).forEach((btn) => btn.addEventListener('click', () => {
    const idx = btn.dataset.variant;
    $$('[data-variant]', taskResult).forEach((b) => b.classList.toggle('active', b.dataset.variant === idx));
    $$('[data-variant-body]', taskResult).forEach((b) => b.classList.toggle('active', b.dataset.variantBody === idx));
  }));

  $$('[data-whatif]', taskResult).forEach((inp) => {
    inp.addEventListener('input', () => {
      const changed = {};
      for (const i of $$('[data-whatif]', taskResult)) changed[i.dataset.whatif] = parseNum(i.value);
      const res = recomputeWith(sol, changed);
      const box = $('#whatif-live', taskResult);
      if (!box) return;
      box.innerHTML = res ? `<div class="answer" style="margin-top:10px"><div class="answer-label">Ответ</div>
        <p class="answer-value" style="font-size:1.35rem">${esc(res.answer)}</p></div>` : '';
    });
  });
}

$('#task-solve').addEventListener('click', runTask);

/* =========================================================================
 * ПРОМЕЖУТКИ
 * ========================================================================= */
function renderInterval() {
  const raw = $('#interval-input').value;
  const iv = parseInterval(raw);
  const out = $('#interval-output');
  if (iv.error) {
    out.innerHTML = `<div class="err">${esc(iv.error)}</div>`;
    return;
  }
  const ints = iv.integers();
  const svg = settings.intervalFigure ? numberLineSVG([{ interval: iv, label: iv.name }], { width: 660, fill: settings.intervalFill }) : '';
  out.innerHTML = `
    ${svg ? `<div class="figure">${svg}</div>` : ''}
    <div class="answer">
      <div class="answer-label">${esc(iv.name)}</div>
      <p class="answer-value" style="font-size:1.35rem">${esc(iv.notation)}</p>
      <p class="answer-sub">${esc(iv.inequality)}${ints === null ? '' : ' · целые: ' + (ints.length ? esc(ints.join(', ')) : 'нет')}</p>
    </div>
    ${SHOW_STEPS() ? `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Подробнее</summary><div class="more-body"><ol class="steps">
      <li>Множество: ${esc(iv.setName)}</li>
      ${iv.length !== Infinity ? `<li>Длина: ${esc(fmt(iv.length))}</li>` : '<li>Длина: бесконечна</li>'}
      ${describeInterval(iv).map((l) => `<li>${esc(l)}</li>`).join('')}
    </ol></div></details>` : ''}`;
}
$('#interval-go').addEventListener('click', renderInterval);
$('#interval-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderInterval(); });

/* =========================================================================
 * НАСТРОЙКИ
 * ========================================================================= */
const CHOICES = [
  {
    key: 'screen', title: 'Что открывать при запуске', options: [
      { v: 'calc', t: 'Калькулятор', s: 'обычный счёт на клавиатуре' },
      { v: 'task', t: 'Задача', s: 'сразу решать текстовые задачи' },
      { v: 'interval', t: 'Промежутки', s: 'числовые промежутки и неравенства' },
    ],
  },
  {
    key: 'mode', title: 'Сколько показывать', options: [
      { v: 'answer', t: 'Только ответ', s: 'ничего лишнего' },
      { v: 'steps', t: 'Ответ и шаги', s: 'решение в свёрнутых блоках' },
      { v: 'full', t: 'Всё раскрытое', s: 'шаги, проверка и способы сразу' },
    ],
  },
  {
    key: 'method', title: 'Способ решения', options: [
      { v: 'auto', t: 'Автоматически', s: 'подбирается под задачу' },
      { v: 'linear', t: 'Через уравнение', s: 'составить и решить уравнение' },
      { v: 'numeric', t: 'Подбором', s: 'перебор чисел и проверка' },
    ],
  },
  {
    key: 'display', title: 'Промежутки', options: [
      { v: 'figure', t: 'С рисунком', s: 'числовая прямая с кружками' },
      { v: 'plain', t: 'Без рисунка', s: 'только запись и неравенство' },
    ],
  },
];

function renderSettings() {
  const body = $('#settings-body');
  let html = '';
  for (const group of CHOICES) {
    html += `<div class="settings-group"><div class="settings-title">${esc(group.title)}</div>`;
    for (const opt of group.options) {
      const checked = group.key === 'display'
        ? (settings.intervalFigure ? opt.v === 'figure' : opt.v === 'plain')
        : settings[group.key] === opt.v;
      html += `<label class="opt">
        <input type="radio" name="${group.key}" value="${opt.v}" ${checked ? 'checked' : ''}>
        <span class="opt-row">
          <span class="opt-mark"></span>
          <span class="opt-text"><b>${esc(opt.t)}</b><span>${esc(opt.s)}</span></span>
        </span>
      </label>`;
    }
    html += '</div>';
  }
  body.innerHTML = html;

  $$('input[type="radio"]', body).forEach((inp) => inp.addEventListener('change', () => {
    const { name, value } = inp;
    if (name === 'display') { settings.intervalFigure = value === 'figure'; if (value === 'plain') settings.intervalFill = false; else settings.intervalFill = true; }
    else settings[name] = value;
    saveSettings();
  }));
}

$('#open-settings').addEventListener('click', () => show('settings'));
$$('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
$$('[data-close-settings]').forEach((b) => b.addEventListener('click', () => show(current === 'settings' ? 'calc' : current)));
$('#open-reference').addEventListener('click', () => show('ref'));
$('#ref-back').addEventListener('click', () => show('settings'));

/* =========================================================================
 * СПРАВОЧНИК
 * ========================================================================= */
const refState = { chapter: 'all', query: '', selected: null, values: {}, unknown: null };
let refRendered = false;

function currentList() {
  let list = refState.query ? formulaSearch(refState.query) : FORMULAS;
  if (refState.chapter !== 'all') list = list.filter((f) => f.ch === refState.chapter);
  return list;
}

function renderRef() {
  if (!refRendered) {
    const about = $('#ref-about');
    about.innerHTML = `<b>${esc(BOOK.title)}</b><br>${esc(BOOK.authors)}<br>${esc(BOOK.publisher)}, ${BOOK.pages} с.<br>
      Карточек: ${STATS.total} · ${esc(BOOK.note)}`;
    renderRefList();
    refRendered = true;
  }
}

function renderRefList() {
  const chapters = $('#chapter-filter');
  chapters.innerHTML = '';
  const mk = (id, label) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = refState.chapter === id ? 'active' : '';
    b.addEventListener('click', () => { refState.chapter = id; renderRefList(); });
    return b;
  };
  chapters.append(mk('all', 'Все'));
  for (const c of STATS.byChapter) {
    chapters.append(mk(c.id, c.title.replace(/^Глава [IVX]+\.\s*/, '').replace('Сведения из курса математики 5—6 классов', '5—6 классы')));
  }

  const box = $('#formula-list');
  box.innerHTML = '';
  for (const f of currentList()) {
    const b = document.createElement('button');
    if (refState.selected === f.id) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<span class="f-title">${esc(f.title)}</span><span class="f-formula">${esc(f.display || f.ineq || '')}</span>`;
    b.addEventListener('click', () => openFormula(f.id));
    box.append(b);
  }
  if (!box.children.length) box.innerHTML = '<p class="hint" style="padding:6px 8px">Ничего не найдено</p>';
}

function openFormula(id) {
  const f = FORMULA_BY_ID.get(id);
  if (!f) return;
  refState.selected = id;
  refState.values = {};
  for (const v of f.vars || []) if (v.def !== null) refState.values[v.name] = v.def;
  refState.unknown = f.find || (f.vars || []).find((v) => !isDerived(v.name))?.name || null;
  $('#ref-list-view').hidden = true;
  $('#ref-detail-view').hidden = false;
  $('#ref-title').textContent = 'Справочник';
  renderFormula();
}

function backToRefList() {
  $('#ref-list-view').hidden = false;
  $('#ref-detail-view').hidden = true;
  renderRefList();
}
$('#ref-back').addEventListener('click', () => {
  if (!$('#ref-detail-view').hidden) backToRefList();
  else show('settings');
});

const DERIVED = new Set(['g', 'G', 'N', 'nok', 'nod']);
const isDerived = (name) => DERIVED.has(name);

function renderFormula() {
  const f = FORMULA_BY_ID.get(refState.selected);
  const host = $('#formula-detail');
  if (!f) return;
  const chapter = CHAPTER_BY_ID.get(f.ch);
  const inputs = (f.vars || []).filter((v) => v.name !== refState.unknown && !isDerived(v.name));

  let html = `
    <div class="ref-head">
      <h3>${esc(f.title)}</h3>
      <div class="ref-meta">${esc(chapter?.title || '')} · ${esc(f.sec)}</div>
    </div>
    <div class="ref-screen">${esc(f.display || f.ineq || f.title)}</div>`;

  if (f.kind === 'formula' && f.eq) {
    html += `<div class="fields">${inputs.map((v) => `
      <div class="field">
        <label for="var-${f.id}-${v.name}"><span>${esc(v.label)}</span>${v.unit ? `<span class="u">${esc(v.unit)}</span>` : ''}</label>
        <input type="text" id="var-${f.id}-${v.name}" data-var="${v.name}" value="${esc(refState.values[v.name] ?? '')}" placeholder="число" inputmode="decimal" autocomplete="off">
      </div>`).join('')}</div>
      <div class="actions" style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <button class="btn primary small" data-act="recalc">Вычислить</button>
        <span class="hint">искать</span>
        <select class="btn small" id="unknown-${f.id}">${f.vars.map((v) => `<option value="${v.name}" ${v.name === refState.unknown ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      </div>
      <div id="calc-out"></div>`;
  } else if (f.kind === 'identity') {
    html += `<button class="btn small" data-act="check">Проверить</button><div id="calc-out"></div>`;
  } else if (f.kind === 'rule') {
    html += `<button class="btn small" data-act="demo">Пример</button><div id="calc-out"></div>
      ${(f.bullets || []).length ? `<details class="more"><summary>Что помнить</summary><div class="more-body"><ol class="steps">${f.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ol></div></details>` : ''}`;
  } else if (f.kind === 'interval') {
    let iv = null;
    try { iv = parseInterval(f.notation || f.display); } catch { /* — */ }
    if (iv && !iv.error && settings.intervalFigure) {
      html += `<div class="figure">${numberLineSVG([{ interval: iv, label: f.title }], { width: 640, fill: settings.intervalFill })}</div>`;
    }
    html += `<div class="answer"><div class="answer-label">${esc(iv?.name || '')}</div>
      <p class="answer-value" style="font-size:1.25rem">${esc(iv?.notation || '')}</p>
      <p class="answer-sub">${esc(iv?.inequality || '')}</p></div>`;
  }

  host.innerHTML = html;
  bindFormula(f);
}

function bindFormula(f) {
  const host = $('#formula-detail');
  $$('input[data-var]', host).forEach((inp) => inp.addEventListener('input', () => {
    refState.values[inp.dataset.var] = parseNum(inp.value);
  }));
  const sel = $('#unknown-' + f.id, host);
  if (sel) sel.addEventListener('change', () => {
    refState.unknown = sel.value;
    for (const v of f.vars) {
      if (v.name === refState.unknown) continue;
      if (refState.values[v.name] === null || refState.values[v.name] === undefined) {
        if (v.def !== null) refState.values[v.name] = v.def;
      }
    }
    renderFormula();
  });
  $$('[data-act]', host).forEach((b) => b.addEventListener('click', () => formulaAction(f, b.dataset.act)));
  if (f.kind === 'formula') formulaAction(f, 'recalc');
  if (f.kind === 'identity') formulaAction(f, 'check');
}

function formulaAction(f, act) {
  const out = $('#calc-out');
  if (!out) return;

  if (act === 'demo') {
    out.innerHTML = `<div class="answer" style="margin-top:10px"><div class="answer-label">Пример</div>
      <p class="answer-value" style="font-size:1rem">${esc(f.example || '—')}</p></div>`;
    return;
  }
  if (act === 'check') {
    try {
      const c = checkIdentity(f.eq);
      out.innerHTML = `<div class="answer" style="margin-top:10px"><div class="answer-label">Тождество</div>
        <p class="answer-value" style="font-size:1.2rem">${c.equal ? 'верно' : 'неверно'}</p>
        <p class="answer-sub">${esc(c.left)} = ${esc(c.right)}</p></div>`;
    } catch {
      out.innerHTML = `<div class="err" style="margin-top:10px">Не удалось проверить.</div>`;
    }
    return;
  }
  if (act !== 'recalc') return;

  const unknown = refState.unknown || f.find;
  const known = {};
  for (const v of f.vars) if (v.name !== unknown) {
    const val = refState.values[v.name];
    if (val === null || val === undefined) {
      if (isDerived(v.name)) continue;
      out.innerHTML = `<div class="err" style="margin-top:10px">Введите <b>${esc(v.label)}</b>.</div>`;
      return;
    }
    known[v.name] = val;
  }
  try {
    const dom = f.dom?.[unknown] || [-1000, 1000];
    // способ решения из настроек: подбор — расширяем численный поиск
    const res = solveFormula(f.eq, unknown, known, dom);
    if (Number.isFinite(res.value)) refState.values[unknown] = Math.round(res.value * 1e10) / 1e10;
    const unit = f.vars.find((v) => v.name === unknown)?.unit || '';
    out.innerHTML = `<div class="answer" style="margin-top:10px">
      <div class="answer-label">Ответ</div>
      <p class="answer-value">${esc(fmtSmart(res.value))}${unit ? ` <span style="font-size:.5em;font-weight:500;color:#5b6472">${esc(unit)}</span>` : ''}</p>
    </div>
    ${SHOW_STEPS() ? `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Как считали</summary><div class="more-body"><ol class="steps">
      <li>${esc(f.display)}</li>
      <li>Подставим: <span class="mono">${esc(substituteText(f.eq, known))}</span></li>
      <li>${esc(unknown)} = ${esc(fmtSmart(res.value))}</li>
      <li>Способ: ${esc(settings.method === 'numeric' ? 'подбор и проверка' : res.method)}</li>
    </ol></div></details>` : ''}`;
  } catch (e) {
    out.innerHTML = `<div class="err" style="margin-top:10px">Не получилось: ${esc(e.message)}</div>`;
  }
}

$('#formula-search').addEventListener('input', (e) => {
  refState.query = e.target.value;
  renderRefList();
});

/* =========================================================================
 * СТАРТ
 * ========================================================================= */
show(settings.screen || 'calc');
updateDisplay();
void preprocess;
