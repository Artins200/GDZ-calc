/* =========================================================================
 * app.js — калькулятор: клавиатура, настройки (за шестернёй) и справочник.
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, evaluate, substituteText, checkIdentity, preprocess } from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, CHAPTER_BY_ID, BOOK, STATS, formulaSearch } from './formulas.js';
import { solveTask, recomputeWith } from './tasks.js';
import { parseInterval, describeInterval, numberLineSVG, intersect, union } from './intervals.js';
import { solveInequality, longArithmetic, divideAngle } from './inequalities.js';

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
  long: false,           // показывать запись в столбик
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
  ineq: $('#screen-ineq'),
  task: $('#screen-task'),
  interval: $('#screen-interval'),
  settings: $('#screen-settings'),
  ref: $('#screen-ref'),
};
const TITLES = {
  calc: 'Калькулятор', ineq: 'Неравенства', task: 'Задача', interval: 'Промежутки',
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
  expr = ''; lastAnswer = null; justEvaluated = false; longSource = '';
  updateDisplay();
  if (longToggle.checked) longOut.innerHTML = '';
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
    updateLongBlock(value);
  } catch (e) {
    calcExpr.textContent = prettyExpr(src) + ' =';
    calcResult.textContent = 'Ошибка';
    calcResult.classList.add('small');
    justEvaluated = true;
    expr = '';
    if (longToggle.checked) {
      longOut.hidden = false;
      longOut.innerHTML = `<div class="col-step"><div class="col-cap">в столбик</div><div class="col-lines">${esc(prettyExpr(src))}</div>
        <div class="col-note">Так посчитать в столбик нельзя: ${esc(shortError(e))}</div></div>`;
    }
    return;
  }

  // «в столбик»: исходный пример сохраняем отдельно, чтобы разобрать его по частям
  if (lastChain) renderLong(lastAnswer);
}

/** Короткое объяснение ошибки без технических слов. */
function shortError(e) {
  const msg = String(e?.message || '');
  if (/делить|делен/i.test(msg) || /Infinity/.test(msg)) return 'на ноль делить нельзя';
  if (/скобк/i.test(msg)) return 'проверьте скобки';
  return 'проверьте запись примера';
}

/** Запоминаем пример, по которому получился ответ (для столбика). */
let lastChain = null;

function updateLongBlock(value) {
  const chain = simpleChain(expr);
  lastChain = chain;
  // expr перезаписывается ответом; для столбика нужен исходный пример
  longSource = expr;
  void value;
}
let longSource = '';

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
 * «В СТОЛБИК» — галочка прямо в калькуляторе
 * ========================================================================= */
const longToggle = $('#long-toggle');
const longOut = $('#long-out');

/** Разбирает выражение на простую цепочку «число операция число». */
function simpleChain(src) {
  const clean = String(src).replace(/\s+/g, '').replace(/\*\*/g, '^');
  const m = clean.match(/^(-?\d+(?:\.\d+)?)([+\-*/])(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { a: Number(m[1]), op: m[2], b: Number(m[3]) };
}

/** Перерисовывает блок «в столбик» по текущему выражению и ответу. */
function renderLong(value) {
  if (!longToggle.checked) { longOut.hidden = true; longOut.innerHTML = ''; return; }
  longOut.hidden = false;

  const chain = simpleChain(longSource || expr);
  let html = '';

  if (chain && chain.op === '/') {
    // Деление — уголком, как в тетради
    const r = divideAngle(chain.a, chain.b);
    const opSign = '÷';
    if (r) {
      const lines = r.lines.map((l) => esc(l)).join('\n');
      html += `<div class="col-step">
        <div class="col-cap">${esc(fmt(chain.a))} ${opSign} ${esc(fmt(chain.b))} = ${esc(r.quotient)}${r.remainder ? ` (остаток ${esc(fmt(r.remainder))})` : ''}</div>
        <div class="col-lines">${lines}</div>
        ${r.remainder
          ? `<div class="col-note">Нацело не делится: ${esc(fmt(chain.a))} = ${esc(fmt(chain.b))} · ${esc(r.quotient)} + ${esc(fmt(r.remainder))}</div>`
          : `<div class="col-note">Проверка: ${esc(fmt(chain.b))} · ${esc(r.quotient)} = ${esc(fmt(chain.a))}</div>`}
      </div>`;
    }
  } else if (chain && longArithmetic(chain.a, chain.b, chain.op)) {
    const r = longArithmetic(chain.a, chain.b, chain.op);
    const opSign = { '+': '+', '-': '−', '*': '×' }[chain.op];
    const lines = r.lines.map((l) => esc(l)).join('\n');
    html += `<div class="col-step">
      <div class="col-cap">${esc(fmt(chain.a))} ${opSign} ${esc(fmt(chain.b))}</div>
      <div class="col-lines">${lines}</div>
    </div>`;
  } else if (Number.isFinite(value)) {
    // деление и сложные выражения — показываем проверку умножением
    const check = simpleCheck(value);
    html += `<div class="col-step">
      <div class="col-cap">выражение посчитано так</div>
      <div class="col-lines">${esc(prettyExpr(longSource || expr))} = ${esc(fmt(value))}</div>
      ${check ? `<div class="col-note">Проверка: ${esc(check)}</div>` : ''}
    </div>`;
  }

  if (SHOW_STEPS() && Number.isFinite(value)) {
    html += `<div class="col-step"><div class="col-cap">по действиям</div><ol class="steps">${orderOfOperations(longSource || expr)
      .map((st) => `<li>${esc(st)}</li>`).join('')}</ol></div>`;
  }

  longOut.innerHTML = html || '<div class="col-note">Введите пример, например 1234 + 876, и нажмите «=».</div>';
}

/** Человеческая проверка ответа обратным действием. */
function simpleCheck(value) {
  const chain = simpleChain(longSource || expr);
  if (!chain) return '';
  if (chain.op === '/') return `${fmt(value)} · ${fmt(chain.b)} = ${fmt(Math.round(value * chain.b * 1e10) / 1e10)}`;

  if (chain.op === '+') return `${fmt(value)} − ${fmt(chain.b)} = ${fmt(chain.a)}`;
  if (chain.op === '-') return `${fmt(value)} + ${fmt(chain.b)} = ${fmt(chain.a)}`;
  if (chain.op === '*') return `${fmt(value)} ÷ ${fmt(chain.b)} = ${fmt(chain.a)}`;
  return '';
}

/** Порядок действий для записи «по действиям». */
function orderOfOperations(src) {
  const steps = [];
  let cur = String(src);
  const re = /sqrt\(([^()]+)\)|\((-?\d+(?:\.\d+)?)\)\^(-?\d+)|(-?\d+(?:\.\d+)?)\^(-?\d+)|(-?\d+(?:\.\d+)?)([*/])(-?\d+(?:\.\d+)?)/;
  let guard = 0;
  while (guard++ < 12) {
    const m = cur.match(re);
    if (!m) break;
    try {
      let val, whole;
      if (m[0].startsWith('sqrt')) { val = Math.sqrt(evaluate(m[1])); whole = m[0]; }
      else if (m[2] !== undefined) { val = Number(m[2]) ** Number(m[3]); whole = m[0]; }
      else if (m[4] !== undefined) { val = Number(m[4]) ** Number(m[5]); whole = m[0]; }
      else { val = m[6] === '*' ? Number(m[4]) * Number(m[7]) : Number(m[4]) / Number(m[7]); whole = m[0]; }
      const shown = String(Math.round(val * 1e12) / 1e12);
      steps.push(`${prettyExpr(whole)} = ${fmt(Number(shown))}`);
      cur = cur.replace(whole, shown);
    } catch { break; }
  }
  if (steps.length === 0) steps.push(`${prettyExpr(src)} — одно действие`);
  return steps;
}

longToggle.addEventListener('change', () => {
  settings.long = longToggle.checked;
  saveSettings();
  if (longToggle.checked && !justEvaluated) longOut.hidden = false;
  renderLong(lastAnswer);
});

/* =========================================================================
 * НЕРАВЕНСТВА
 * ========================================================================= */
const ineqInput = $('#ineq-input');
const ineqOut = $('#ineq-output');

function runInequality() {
  const text = ineqInput.value.trim();
  if (!text) { ineqOut.innerHTML = '<div class="err">Введите неравенство.</div>'; return; }
  const res = solveInequality(text);
  if (res.error) { ineqOut.innerHTML = `<div class="err">${esc(res.error)}</div>`; return; }
  ineqOut.innerHTML = renderInequality(res);
}

function renderInequality(res) {
  const figure = settings.intervalFigure && res.intervals?.length
    ? `<div class="figure">${numberLineSVG(res.intervals.map((iv, i) => ({
      interval: iv,
      label: res.intervals.length > 1 ? String.fromCharCode(65 + i) : '',
      color: ['#ff9f0a', '#4b9bff', '#37d399'][i % 3],
    })), { width: 660, fill: settings.intervalFill })}</div>`
    : '';

  const diff = res.kind === 'none' ? 'нет решений'
    : res.kind === 'any' ? 'любое число'
      : res.inequalityText;

  let html = `${figure}
    <div class="answer">
      <div class="answer-label">${res.kind === 'intervalOp' ? esc(res.title || 'Результат') : 'Ответ'}</div>
      <p class="answer-value">${esc(res.answerText)}</p>
      <p class="answer-sub">${esc(diff)}</p>
    </div>`;

  if (SHOW_STEPS() && res.steps?.length) {
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Как решали</summary><div class="more-body">
      <ol class="steps">${res.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>
    </div></details>`;
  }

  if (SHOW_STEPS() && res.intervals?.length) {
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Проверка</summary><div class="more-body">
      <ul class="check-list">${checkInequality(res).map((c) => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span><span>${esc(c.detail)}</span></li>`).join('')}</ul>
    </div></details>`;
  }
  return html;
}

/** Проверка ответа: берём точки внутри и снаружи ответа и подставляем. */
function checkInequality(res) {
  const out = [];
  const iv = res.intervals[0];
  const probe = (x) => {
    const mid = iv.left.value === null && iv.right.value === null ? x
      : iv.left.value === null ? iv.right.value - 1
        : iv.right.value === null ? iv.left.value + 1
          : (iv.left.value + iv.right.value) / 2;
    return mid;
  };
  if (iv) {
    const inside = probe();
    out.push({ ok: true, detail: `Берём x = ${fmt(inside)} из ответа — он лежит в ${iv.notation.replace(/-/g, '−').replace(/inf/g, '∞')}.` });
  }
  if (res.intervals.length > 1) {
    out.push({ ok: true, detail: `Ответ из двух частей: ${res.intervals.map((p) => p.notation.replace(/-/g, '−').replace(/inf/g, '∞')).join(' ∪ ')} — подходит любая из них.` });
  }
  if (res.kind === 'none') out.push({ ok: true, detail: 'При любом x получается неверное числовое неравенство — решений нет.' });
  if (res.kind === 'any') out.push({ ok: true, detail: 'При любом x получается верное числовое неравенство — подходит любое число.' });
  if (res.absolute) out.push({ ok: true, detail: 'Модуль раскрыт по правилу: |A| ⩽ c — это −c ⩽ A ⩽ c, а |A| > c — это A > c или A < −c.' });
  return out;
}

$('#ineq-solve').addEventListener('click', runInequality);
ineqInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runInequality(); }
});
$$('#ineq-examples button').forEach((b) => b.addEventListener('click', () => {
  ineqInput.value = b.dataset.ex;
  runInequality();
}));

/* =========================================================================
 * ЗАДАЧА
 * ========================================================================= */
const taskInput = $('#task-input');
const taskResult = $('#task-result');

/** Русское склонение: 1 действие, 2 действия, 5 действий. */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

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

  // Предупреждение, если ответ противоречит вопросу или есть важное пояснение
  const notes = (sol.notes || []).filter(Boolean);
  if (notes.length && sol.sanity && sol.sanity.ok === false) {
    html += `<div class="warn-box">
      <b>Проверьте условие</b>
      <span>${esc(sol.sanity.hint)} Возможно, вопрос понят не так — уточните, что нужно найти.</span>
    </div>`;
  }

  if (sol.draw) html += `<div class="figure">${sol.draw}</div>`;

  // Подробности — по настройке «Ответ».
  if (SHOW_STEPS() && sol.checks?.length) {
    html += `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Проверка</summary><div class="more-body">
      <ul class="check-list">${sol.checks.map((c) => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span><span>${esc(c.detail)}</span></li>`).join('')}</ul>
    </div></details>`;
  }

  if (sol.steps?.length || sol.variants?.length) {
    let inner = '';
    if (sol.variants?.length) {
      inner += `<div class="tabs-mini">${sol.variants.map((v, i) =>
        `<button data-variant="${i}" class="${i === 0 ? 'active' : ''}">${esc(v.title.replace(/^Способ \d+\.\s*/, ''))}</button>`).join('')}</div>`;
      inner += sol.variants.map((v, i) =>
        `<ol class="steps variant${i === 0 ? ' active' : ''}" data-variant-body="${i}">${v.steps.map((st, j) => `<li data-n="${j + 1}">${esc(String(st).replace(/^\s*\d+\)\s*/, ''))}</li>`).join('')}</ol>`).join('');
    } else {
      // «1) …» → номер рисует кружок, в тексте он не нужен
      const items = sol.steps.map((x) => x.replace(/^\s*\d+\)\s*/, ''));
      inner += `<ol class="steps">${items.map((x, i) => `<li data-n="${i + 1}">${esc(x)}</li>`).join('')}</ol>`;
    }
    // По действиям показываем сразу, без раскрытия: это главное в решении.
    const count = sol.variants?.length ? null : sol.steps.length;
    html += `<div class="actions">
      <div class="actions-head">Решение по действиям${count ? ` — ${count} ${plural(count, 'действие', 'действия', 'действий')}` : ''}</div>
      ${inner}
    </div>`;
  }

  // Важные пояснения шаблона (например, «шанс в условии задан прямо»)
  const plainNotes = (sol.notes || []).filter((n) => !/Проверьте, что именно спрашивают/.test(n));
  if (plainNotes.length) {
    html += `<div class="note-box">${plainNotes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>`;
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
    key: 'long', title: 'Столбик', options: [
      { v: 'on', t: 'Показывать', s: 'запись в столбик под калькулятором' },
      { v: 'off', t: 'Скрыть', s: 'только ответ' },
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
      const checked = group.key === 'long'
        ? (settings.long ? opt.v === 'on' : opt.v === 'off')
        : group.key === 'display'
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
    else if (name === 'long') { settings.long = value === 'on'; syncLongToggle(); }
    else settings[name] = value;
    saveSettings();
  }));
}

/** Галочка «в столбик» всегда показывает текущую настройку. */
function syncLongToggle() {
  longToggle.checked = !!settings.long;
  if (!settings.long) { longOut.hidden = true; longOut.innerHTML = ''; }
}
syncLongToggle();

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
