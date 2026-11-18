/* =========================================================================
 * app.js — калькулятор: клавиатура, настройки (за шестернёй) и справочник.
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, evaluate, evaluateWithSteps, substituteText, checkIdentity, preprocess } from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, CHAPTER_BY_ID, BOOK, STATS, formulaSearch } from './formulas.js';
import { solveTask, recomputeWith } from './tasks.js';
import { parseInterval, describeInterval, numberLineSVG, intersect, union } from './intervals.js';
import { solveInequality, longArithmetic, divideAngle } from './inequalities.js';
import { classifyTask } from './classifier.js';
import { INFO_UNITS, convertInfoSize, convertBase, parseInfoSize, solveItTask } from './it.js';
import { GEO_TOOLS, solveGeoTask } from './geo.js';
import { triangleBySides, triangleBySAS, triangleByASA, triangleSVG, triangleStats } from './triangle.js';
import {
  SCHEME_STORE, emptyScheme, presetScheme, evaluateScheme, QUESTION_GROUPS, QUESTIONS,
  findQuestion, solveQuestion, schemeSVG, RELATION_OPS, PRESETS as SCHEME_PRESETS,
  nid as schemeNid, chartSeries,
} from './scheme.js';
import {
  analyzeAuto, analyzeParticiple, analyzeAdverbialParticiple, analyzeVerb, analyzeNoun, analyzeAdjective,
  RU_SECTIONS, RU_QUIZ, RU_QUIZ_OPTIONS,
} from './ru.js';
import './grapher.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* =========================================================================
 * НАСТРОЙКИ (хранятся в localStorage)
 * ========================================================================= */
const DEFAULTS = {
  screen: 'calc',        // что открывать при запуске: calc | task | interval
  mode: 'steps',         // по умолчанию показываем алгоритм и проверки; можно выбрать answer
  method: 'auto',        // способ решения в справочнике: auto | linear | numeric
  intervalFigure: true,  // рисовать числовую прямую
  intervalFill: true,    // закрашивать конец, если он входит
  long: true,            // показывать запись и порядок действий в калькуляторе
  subject: 'school',     // school | it | geo — профильный режим (можно включить и вручную)
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
  graph: $('#screen-graph'),
  info: $('#screen-info'),
  geo: $('#screen-geo'),
  scheme: $('#screen-scheme'),
  ru: $('#screen-ru'),
  settings: $('#screen-settings'),
  ref: $('#screen-ref'),
};
const TITLES = {
  calc: 'Калькулятор', ineq: 'Неравенства', task: 'Задача', interval: 'Промежутки', graph: 'Графики',
  info: 'Информатика', geo: 'Геометрия', scheme: 'Схема', ru: 'Русский язык',
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
  if (name === 'scheme') renderSchemeChart();
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

/** AST-порядок действий — вложенные скобки, знаки и функции учитываются корректно. */
function orderOfOperations(src) {
  try {
    const result = evaluateWithSteps(src);
    return result.steps.length ? result.steps : [`${prettyExpr(src)} — одно действие: ${fmt(result.value)}`];
  } catch {
    return [`${prettyExpr(src)} — вычисление по правилам порядка действий`];
  }
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
  const mode = settings.subject === 'it' ? 'informatics' : settings.subject === 'geo' ? 'geometry' : '';
  const sol = solveTask(text, mode ? { mode } : {});
  if (!sol.ok && mode) {
    // профильный решатель не понял — пробуем обычные шаблоны, но не выдаём ложный ответ
    const fallback = solveTask(text);
    renderTask(fallback.ok ? fallback : sol);
    return;
  }
  renderTask(sol);
}

// Человеческие названия семейств для подсказки модели.
const FAMILY_LABEL = {
  motion: 'движение', meeting: 'встречное движение', catchup: 'догон',
  motion_after: 'путь за следующие часы', average: 'средняя скорость',
  work: 'совместная работа', guess: 'задуманное число', percent: 'проценты',
  proportion: 'пропорция', scaling: 'изменение в N раз', area: 'площадь',
  volume: 'объём', coords: 'координатная прямая', graph: 'графики функций',
  equation: 'уравнение', algebra: 'преобразование выражения', expr: 'вычисление',
  divisibility: 'НОД и НОК', remainder: 'остатки', mixture: 'смеси',
  density: 'плотность', price: 'цена', paint: 'расход на покраску',
  sound: 'звук', convert: 'перевод единиц', interval: 'числовой промежуток',
  inequality: 'неравенство', parts: 'две части', steps: 'шаги',
};

/** «Дано — Найти» из условия задачи: ставим перед ответом, как в тетради. */
function givenFindCard(sol) {
  try {
    const text = taskInput.value || '';
    const entries = Object.entries(sol.inputs || {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
    const questions = text.match(/[^.!?\n]*\?/g) || [];
    const question = questions.length ? questions[questions.length - 1].trim() : '';
    if (!entries.length && !question) return '';
    const given = entries.map(([k, v]) => {
      const lab = labelForVar(sol, k, v);
      const unit = lab?.unit ? ` ${lab.unit}` : '';
      return `<span>${esc(lab?.label || k)} = ${fmtPlain(v)}${esc(unit)}</span>`;
    }).join('<br>');
    return `<div class="card given-card">
      <div class="card-title">Дано и найти</div>
      <div class="card-part"><b>Дано:</b><br>${given || 'см. условие'}</div>
      <div class="card-part"><b>Найти:</b><br>${esc(question || 'что нужно найти — см. условие')}</div>
    </div>`;
  } catch {
    return '';
  }
}

function renderTask(sol) {
  if (!sol.ok) {
    taskResult.innerHTML = `<div class="err">Не получилось распознать задачу. Укажите, что нужно найти: «найдите скорость», «сколько процентов», «решите уравнение».</div>`;
    return;
  }

  let html = givenFindCard(sol);
  html += `<div class="answer">
    <div class="answer-label">Ответ</div>
    <p class="answer-value">${esc(sol.answer)}</p>
  </div>`;
  // Автоматическая проверяющая система: показывает, сколько проверок прошло.
  if (sol.verification?.checks?.length) {
    const v = sol.verification;
    const passed = v.checks.filter((c) => c.ok).length;
    const state = v.ok ? 'ok' : passed / v.checks.length > 0.7 ? 'warn' : 'bad';
    html += `<div class="score-box ${state}">
      <div class="score-head"><span class="score-dot"></span>Проверка решения: ${passed} из ${v.checks.length}${v.ok ? ' — сходится' : ' — есть замечания'}</div>
      <div class="score-meter"><i style="width:${Math.round((passed / v.checks.length) * 100)}%"></i></div>
      <details class="score-more"><summary>Все проверки</summary>
        <ul class="score-list">${v.checks.map((c) => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span><span><b>${esc(c.title)}.</b> ${esc(c.detail)}</span></li>`).join('')}</ul>
      </details>
    </div>`;
  }
  if (sol.alternatives?.length) {
    html += `<div class="alt-box"><b>Если вопрос понят иначе</b>${sol.alternatives.map((a) => `<span>${esc(a.label)}: <b>${esc(String(Math.round(a.value * 1e4) / 1e4).replace('.', ','))}</b></span>`).join('')}</div>`;
  }
  // Сверка с ответом, который ввёл пользователь.
  const userAnswer = parseNum($('#task-user-answer')?.value);
  if (Number.isFinite(userAnswer)) {
    const own = Number(String(sol.answer).replace(/[^\d,.\-]/g, '').replace(',', '.'));
    if (Number.isFinite(own)) {
      const same = Math.abs(own - userAnswer) < 1e-6;
      html += `<div class="user-check ${same ? 'ok' : 'bad'}">${same ? '✓ Ваш ответ совпал с решением.' : `Ваш ответ ${esc(String(userAnswer).replace('.', ','))} не совпал: в решении ${esc(sol.answer)}.`}</div>`;
    }
  }
  const verified = classifyTask(taskInput.value);
  if (verified.ok) html += `<details class="verify-box"><summary>Тип задачи проверен в 2 этапа · ${esc(verified.label)}</summary>
    <div><b>1. Распознавание:</b> ${esc(verified.stage1)}</div>
    <div><b>2. Условие и ветвь:</b> ${esc(verified.stage2)}</div>
    <ul>${verified.checks.map(c => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span> ${esc(c.text)}</li>`).join('')}</ul>
  </details>`;

  // Предупреждение, если ответ противоречит вопросу или есть важное пояснение
  const notes = (sol.notes || []).filter(Boolean);
  if (notes.length && sol.sanity && sol.sanity.ok === false) {
    html += `<div class="warn-box">
      <b>Проверьте условие</b>
      <span>${esc(sol.sanity.hint)} Возможно, вопрос понят не так — уточните, что нужно найти.</span>
    </div>`;
  }

  if (sol.draw) html += `<div class="figure">${sol.draw}</div>`;

  // Крошечная модель-диспетчер подсказала тип задачи — показываем это мелко и
  // только в подробном режиме: на главном экране ничего лишнего.
  if (SHOW_ALL() && sol.hint?.family && sol.hint.p >= 0.45) {
    html += `<div class="hint-line">Модель-диспетчер: похоже на «${esc(FAMILY_LABEL[sol.hint.family] || sol.hint.family)}» (${Math.round(sol.hint.p * 100)}%). Числа всё равно считает формула.</div>`;
  }

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
    key: 'subject', title: 'Режим предмета', options: [
      { v: 'school', t: 'Обычная математика', s: 'калькулятор, задачи, графики' },
      { v: 'it', t: 'Информатика', s: 'биты и байты, N = K^i, системы счисления, «Дано»' },
      { v: 'geo', t: 'Геометрия', s: 'фигуры, углы, площади и объёмы, «Дано» по Атанасяну' },
    ],
  },
  {
    key: 'screen', title: 'Что открывать при запуске', options: [
      { v: 'calc', t: 'Калькулятор', s: 'обычный счёт на клавиатуре' },
      { v: 'task', t: 'Задача', s: 'сразу решать текстовые задачи' },
      { v: 'interval', t: 'Промежутки', s: 'числовые промежутки и неравенства' },
      { v: 'info', t: 'Информатика', s: 'единицы информации и системы счисления' },
      { v: 'geo', t: 'Геометрия', s: 'калькуляторы фигур и тел' },
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
    if (name === 'subject') applySubjectMode(value);
    if (name === 'screen') applySubjectMode(settings.subject);
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
 * РЕЖИМ ПРЕДМЕТА: «Обычная математика / Информатика / Геометрия»
 * Вкладки не прячем — просто подсвечиваем нужную и открываем её.
 * ========================================================================= */
function applySubjectMode(subject, { navigate = true } = {}) {
  const tabs = $$('.tab');
  tabs.forEach((b) => {
    const isSubjectTab = b.dataset.go === 'info' || b.dataset.go === 'geo';
    b.classList.toggle('subject-tab', isSubjectTab);
    b.classList.toggle('subject-on', (subject === 'it' && b.dataset.go === 'info') || (subject === 'geo' && b.dataset.go === 'geo'));
  });
  if (!navigate) return;
  if (subject === 'it') show('info');
  else if (subject === 'geo') show('geo');
}

/* =========================================================================
 * ИНФОРМАТИКА
 * ========================================================================= */
function initInfo() {
  const unitSel = $('#info-unit');
  const fromSel = $('#base-from');
  const toSel = $('#base-to');
  if (!unitSel) return;

  unitSel.innerHTML = INFO_UNITS.map((u) => `<option value="${u.id}" data-short="${esc(u.short)}">${esc(u.short)} — ${esc(u.name)}</option>`).join('');
  unitSel.value = 'GB';
  const baseOptions = Array.from({ length: 35 }, (_, i) => i + 2)
    .map((b) => `<option value="${b}">${b}</option>`).join('');
  fromSel.innerHTML = baseOptions; toSel.innerHTML = baseOptions;
  fromSel.value = '2'; toSel.value = '10';

  const renderConvert = () => {
    const raw = $('#info-size').value;
    const short = unitSel.options[unitSel.selectedIndex]?.dataset.short || 'Б';
    const size = parseInfoSize(`${raw} ${short}`);
    const out = $('#info-out');
    if (!size) { out.innerHTML = '<div class="err">Введите число, например 1,5.</div>'; return; }
    const binary = $('#info-binary').checked;
    const rows = convertInfoSize(size.value, size.unit, { binary });
    out.innerHTML = `<div class="answer" style="margin-top:10px">
        <div class="answer-label">${esc(`${raw} ${short}`)}</div>
        <p class="answer-value" style="font-size:1.2rem">${rows.map((r) => `${fmtSmart(r.value)} ${esc(r.unit)}`).join('<br>')}</p>
      </div>
      ${SHOW_STEPS() ? `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>Как переводили</summary><div class="more-body"><ol class="steps">
        <li>1 байт = 8 бит.</li>
        <li>1 ${binary ? 'КБ = 1024 Б' : 'КБ = 1000 Б'} (${binary ? 'двоичная' : 'десятичная'} система приставок).</li>
        <li>Сначала переводим в байты, потом делим на степень ${binary ? 1024 : 1000}.</li>
      </ol></div></details>` : ''}`;
  };
  $('#info-convert').addEventListener('click', renderConvert);
  $('#info-size').addEventListener('keydown', (e) => { if (e.key === 'Enter') renderConvert(); });
  $('#info-binary').addEventListener('change', renderConvert);

  $('#base-convert').addEventListener('click', () => {
    const value = $('#base-value').value.trim();
    const r = convertBase(value, Number(fromSel.value), Number(toSel.value));
    const out = $('#base-out');
    if (!r) { out.innerHTML = '<div class="err">Не получилось: проверьте цифры числа и основания (2…36).</div>'; return; }
    out.innerHTML = `<div class="answer" style="margin-top:10px">
        <div class="answer-label">Ответ</div>
        <p class="answer-value" style="font-size:1.4rem">${esc(r.result)}</p>
        <p class="answer-sub">${esc(value)} из ${fromSel.value}-й в ${toSel.value}-ю</p>
      </div>
      ${SHOW_STEPS() ? `<details class="more"${SHOW_ALL() ? ' open' : ''}><summary>По шагам</summary><div class="more-body"><ol class="steps">${r.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div></details>` : ''}`;
  });

  const solveInfo = () => {
    const text = $('#info-task').value.trim();
    const out = $('#info-task-out');
    if (!text) { out.innerHTML = '<div class="err">Введите задачу.</div>'; return; }
    const card = solveItTask(text);
    if (!card) { out.innerHTML = '<div class="err">Не удалось разобрать задачу. Укажите данные и вопрос, например: «сколько МБ в 2 ГБ».</div>'; return; }
    out.innerHTML = renderCard(card);
  };
  $('#info-solve').addEventListener('click', solveInfo);
  $$('[data-info]').forEach((b) => b.addEventListener('click', () => { $('#info-task').value = b.dataset.info; solveInfo(); }));
}

/** Карточка «Дано — Найти — Решение — Ответ» (общая для информатики и геометрии). */
function renderCard(card) {
  const list = (arr, mono = false) => arr.map((x) => `<span class="${mono ? 'mono' : ''}">${esc(typeof x === 'string' ? x : `${x.label} = ${x.value}`)}</span>`).join('<br>');
  return `<div class="card">
    <div class="card-title">${esc(card.title)}</div>
    <div class="card-part"><b>Дано:</b><br>${list(card.given || [])}</div>
    <div class="card-part"><b>Найти:</b><br>${list(card.find || [])}</div>
    ${(card.formulas || []).length ? `<div class="card-part"><b>Формулы:</b><br>${list(card.formulas)}</div>` : ''}
    ${SHOW_STEPS() ? `<div class="card-part"><b>Решение:</b><ol class="steps">${(card.solution || card.steps || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
    <div class="answer" style="margin-top:10px"><div class="answer-label">Ответ</div><p class="answer-value" style="font-size:1.25rem">${esc(card.answer)}</p></div>
  </div>`;
}

/* =========================================================================
 * ГЕОМЕТРИЯ
 * ========================================================================= */
function initGeo() {
  const toolSel = $('#geo-tool');
  if (!toolSel) return;
  toolSel.innerHTML = GEO_TOOLS.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('');

  const drawFields = () => {
    const tool = GEO_TOOLS.find((t) => t.id === toolSel.value) || GEO_TOOLS[0];
    $('#geo-fields').innerHTML = tool.fields.map(([key, label, def]) => `
      <div class="field">
        <label for="geo-${esc(key)}"><span>${esc(label)}</span></label>
        <input type="text" id="geo-${esc(key)}" data-geo-field="${esc(key)}" value="${esc(String(def))}" inputmode="decimal" autocomplete="off">
      </div>`).join('');
  };
  const runTool = () => {
    const tool = GEO_TOOLS.find((t) => t.id === toolSel.value) || GEO_TOOLS[0];
    const values = tool.fields.map(([key]) => parseNum($(`[data-geo-field="${key}"]`)?.value));
    const out = $('#geo-out');
    if (values.some((v) => v === null)) { out.innerHTML = '<div class="err">Заполните все поля числами.</div>'; return; }
    const card = tool.run(values);
    if (!card) { out.innerHTML = '<div class="err">Не удалось посчитать: проверьте данные.</div>'; return; }
    if (card.error) { out.innerHTML = `<div class="err">${esc(card.error)}</div>`; return; }
    out.innerHTML = renderCard(card);
  };
  toolSel.addEventListener('change', () => { drawFields(); runTool(); });
  $('#geo-calc').addEventListener('click', runTool);
  $('#geo-fields').addEventListener('keydown', (e) => { if (e.key === 'Enter') runTool(); });

  const solveGeoTab = () => {
    const text = $('#geo-task').value.trim();
    const out = $('#geo-task-out');
    if (!text) { out.innerHTML = '<div class="err">Введите задачу.</div>'; return; }
    const card = solveGeoTask(text);
    if (!card) { out.innerHTML = '<div class="err">Не удалось разобрать. Укажите фигуру и данные: «площадь треугольника, основание 8, высота 5».</div>'; return; }
    if (card.error) { out.innerHTML = `<div class="err">${esc(card.error)}</div>`; return; }
    out.innerHTML = renderCard(card);
  };
  $('#geo-solve').addEventListener('click', solveGeoTab);
  $$('[data-geo]').forEach((b) => b.addEventListener('click', () => { $('#geo-task').value = b.dataset.geo; solveGeoTab(); }));

  drawFields();
  runTool();
}

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
 * СХЕМА / СМЕТА
 * ========================================================================= */
function loadScheme() {
  try {
    const raw = localStorage.getItem(SCHEME_STORE);
    if (!raw) return emptyScheme();
    const p = JSON.parse(raw);
    const base = emptyScheme();
    return {
      ...base, ...p,
      vars: Array.isArray(p.vars) ? p.vars : base.vars,
      columns: Array.isArray(p.columns) && p.columns.length ? p.columns : base.columns,
      rows: Array.isArray(p.rows) && p.rows.length ? p.rows : base.rows,
      cells: p.cells && typeof p.cells === 'object' ? p.cells : {},
      relations: Array.isArray(p.relations) ? p.relations : [],
      customQuestions: Array.isArray(p.customQuestions) ? p.customQuestions : [],
      assignments: p.assignments && typeof p.assignments === 'object' ? p.assignments : {},
    };
  } catch { return emptyScheme(); }
}
let scheme = loadScheme();
function saveScheme() { try { localStorage.setItem(SCHEME_STORE, JSON.stringify(scheme)); } catch { /* приватный режим */ } }

const OP_SHORT = { plus: '+', minus: '−', times: '×', div: '÷', pct: '%', dep: '→' };

function renderSchemeVars() {
  const box = $('#scheme-vars');
  if (!box) return;
  if (!scheme.vars.length) {
    box.innerHTML = '<span class="hint">Переменных пока нет — добавьте первую: например <b>a</b> = <b>12</b>.</span>';
    return;
  }
  const ev = evaluateScheme(scheme);
  box.innerHTML = scheme.vars.map((v, i) => {
    const name = String(v?.name || '').trim();
    const val = name ? ev.scope[name] : NaN;
    const ok = Number.isFinite(val);
    return `<span class="var-chip"><b>${esc(name || '?')}</b><span>= ${esc(String(v.expr ?? ''))}</span>
      <span class="${ok ? 'var-val' : 'var-bad'}">${ok ? `→ ${esc(fmt(val))}` : 'ошибка'}</span>
      <button type="button" data-var-del="${i}" aria-label="Удалить переменную">×</button></span>`;
  }).join('');
}

function renderSchemeGrid() {
  const wrap = $('#scheme-grid');
  if (!wrap) return;
  const ev = evaluateScheme(scheme);
  const showSumCol = !!scheme.showSumCol, showSumRow = !!scheme.showSumRow;
  let html = '<table class="scheme-table"><thead><tr><th class="corner">строка ↓<br>столбец →</th>';
  scheme.columns.forEach((c, ci) => {
    html += `<th><input class="col-title-input" data-col-title="${ci}" value="${esc(c.title)}" placeholder="Столбец ${ci + 1}" autocomplete="off" spellcheck="false"><input class="col-unit-input" data-col-unit="${ci}" value="${esc(c.unit || '')}" placeholder="ед. (шт, ₽…)" autocomplete="off" spellcheck="false"></th>`;
  });
  if (showSumCol) html += '<th>Всего</th>';
  html += '</tr></thead><tbody>';
  scheme.rows.forEach((row, ri) => {
    html += `<tr><th><input class="row-label-input" data-row-label="${ri}" value="${esc(row.label)}" placeholder="Строка ${ri + 1}" autocomplete="off" spellcheck="false"></th>`;
    scheme.columns.forEach((col, ci) => {
      const cellVal = ev.grid[ri][ci];
      const raw = scheme.cells[`${row.id}|${col.id}`] ?? '';
      const bad = raw.trim().length > 0 && !Number.isFinite(cellVal.value);
      const shown = Number.isFinite(cellVal.value) ? fmt(cellVal.value) : '';
      html += `<td class="cell"><input class="cell-input" data-cell="${ri}:${ci}" value="${esc(raw)}" placeholder="0" autocomplete="off" spellcheck="false">
        <span class="cell-val${bad ? ' err' : ''}" data-val="${ri}:${ci}">${bad ? esc(cellVal.error || 'ошибка') : esc(shown)}</span></td>`;
    });
    if (showSumCol) html += `<td class="total" data-total="row:${ri}">${fmt(ev.rowTotals[ri])}</td>`;
    html += '</tr>';
  });
  if (showSumRow) {
    const grand = ev.colTotals.reduce((s, v) => s + v, 0);
    html += '<tfoot><tr><th>Итого</th>' + ev.colTotals.map((t, ci) => `<td data-total="col:${ci}">${fmt(t)}</td>`).join('')
      + (showSumCol ? `<td data-total="grand">${fmt(grand)}</td>` : '') + '</tr></tfoot>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
  const errBox = $('#scheme-errors');
  const errs = ev.errors || [];
  errBox.hidden = !errs.length;
  errBox.innerHTML = errs.length ? errs.map((e) => `<div>${esc(e)}</div>`).join('') : '';
}

/** Обновление ТОЛЬКО вычисленных значений (таблица не пересобирается — фокус не теряется). */
function refreshSchemeComputed() {
  const wrap = $('#scheme-grid');
  if (!wrap) return;
  const ev = evaluateScheme(scheme);
  scheme.rows.forEach((row, ri) => {
    scheme.columns.forEach((col, ci) => {
      const span = wrap.querySelector(`[data-val="${ri}:${ci}"]`);
      if (!span) return;
      const raw = String(scheme.cells[`${row.id}|${col.id}`] ?? '');
      const cellVal = ev.grid[ri][ci];
      const bad = raw.trim().length > 0 && !Number.isFinite(cellVal.value);
      span.textContent = bad ? (cellVal.error || 'ошибка') : (Number.isFinite(cellVal.value) ? fmt(cellVal.value) : '');
      span.classList.toggle('err', bad);
    });
  });
  scheme.rows.forEach((row, ri) => {
    const cell = wrap.querySelector(`[data-total="row:${ri}"]`);
    if (cell) cell.textContent = fmt(ev.rowTotals[ri]);
  });
  ev.colTotals.forEach((t, ci) => {
    const cell = wrap.querySelector(`[data-total="col:${ci}"]`);
    if (cell) cell.textContent = fmt(t);
  });
  const grand = wrap.querySelector('[data-total="grand"]');
  if (grand) grand.textContent = fmt(ev.colTotals.reduce((s, v) => s + v, 0));
  const errBox = $('#scheme-errors');
  const errs = ev.errors || [];
  errBox.hidden = !errs.length;
  errBox.innerHTML = errs.length ? errs.map((e) => `<div>${esc(e)}</div>`).join('') : '';
  renderSchemeVars();
  renderSchemeDiagram();
  renderSchemeChart();
}

function renderSchemeDiagram() {
  const box = $('#scheme-diagram');
  if (!box) return;
  box.innerHTML = schemeSVG(scheme);
}

/* График по таблице: столбчатая диаграмма выбранного столбца по строкам (офлайн, canvas). */
let schemeChartCol = null;
function drawSchemeChart(canvas, series, unit) {
  const ctx = canvas.getContext('2d');
  const d = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * d));
  canvas.height = Math.max(1, Math.floor(h * d));
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#121519';
  ctx.fillRect(0, 0, w, h);
  if (!series.length) {
    ctx.fillStyle = '#8b94a0';
    ctx.font = '13px system-ui';
    ctx.fillText('Нет числовых данных — заполните ячейки таблицы', 14, h / 2);
    return;
  }
  const values = series.map((s) => s.value);
  const maxV = Math.max(...values, 0), minV = Math.min(...values, 0);
  const range = (maxV - minV) || 1;
  const labelW = Math.min(130, Math.max(70, Math.floor(w * 0.32)));
  const valueW = 56;
  const pad = { left: labelW + 10, right: valueW + 8, top: 10, bottom: 10 };
  const plotW = Math.max(20, w - pad.left - pad.right);
  const zeroX = pad.left + ((0 - minV) / range) * plotW;
  const xOf = (v) => pad.left + ((v - minV) / range) * plotW;
  // нулевая линия
  ctx.strokeStyle = '#3a424b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(zeroX, 4);
  ctx.lineTo(zeroX, h - 4);
  ctx.stroke();
  const rowH = (h - pad.top - pad.bottom) / series.length;
  const barH = Math.min(26, Math.max(9, rowH * 0.6));
  series.forEach((s, i) => {
    const cy = pad.top + rowH * (i + 0.5);
    const x0 = Math.min(zeroX, xOf(s.value));
    const bw = Math.max(2, Math.abs(xOf(s.value) - zeroX));
    // подпись строки (слева)
    ctx.fillStyle = '#c7cdd5';
    ctx.font = '12px system-ui';
    const label = s.label.length > 16 ? `${s.label.slice(0, 15)}…` : s.label;
    ctx.textAlign = 'right';
    ctx.fillText(label, pad.left - 8, cy + 4);
    // бар
    ctx.fillStyle = '#ff9f0a';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x0, cy - barH / 2, bw, barH, 3);
    else ctx.rect(x0, cy - barH / 2, bw, barH);
    ctx.fill();
    // значение
    ctx.fillStyle = '#ffcf8a';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    const valText = `${fmt(s.value)}${unit ? ` ${unit}` : ''}`;
    ctx.fillText(valText, Math.min(w - valueW, x0 + bw + 6), cy + 4);
  });
  ctx.textAlign = 'left';
}
function renderSchemeChart() {
  const canvas = $('#scheme-chart-canvas');
  const sel = $('#scheme-chart-col');
  if (!canvas || !sel) return;
  const cols = scheme.columns;
  if (!cols.some((c) => c.id === schemeChartCol)) schemeChartCol = cols[0]?.id || null;
  const want = cols.map((c) => c.id).join('|');
  if (sel.dataset.cols !== want) {
    sel.innerHTML = cols.map((c, i) => `<option value="${esc(c.id)}">${esc(c.title || `Столбец ${i + 1}`)}</option>`).join('');
    sel.dataset.cols = want;
  }
  if (schemeChartCol && sel.value !== schemeChartCol) sel.value = schemeChartCol;
  const col = cols.find((c) => c.id === schemeChartCol);
  const series = schemeChartCol ? chartSeries(scheme, schemeChartCol) : [];
  if (canvas.clientWidth < 20) return; // экран скрыт — перерисуем при показе
  drawSchemeChart(canvas, series, col?.unit || '');
}

function schemeTargetOptions() {
  const opts = [];
  for (const v of scheme.vars) {
    const name = String(v?.name || '').trim();
    if (name) opts.push({ kind: 'var', id: name, label: `переменная «${name}»` });
  }
  scheme.columns.forEach((c, ci) => {
    opts.push({ kind: 'col', id: c.id, label: `столбец «${String(c.title || `Столбец ${ci + 1}`).trim()}»` });
  });
  return opts;
}

function renderSchemeRelations() {
  const fromSel = $('#scheme-rel-from'), toSel = $('#scheme-rel-to'), opSel = $('#scheme-rel-op');
  if (!fromSel || !toSel || !opSel) return;
  const opts = schemeTargetOptions();
  const optHtml = opts.map((o) => `<option value="${o.kind}:${esc(o.id)}">${esc(o.label)}</option>`).join('');
  const prevFrom = fromSel.value, prevTo = toSel.value;
  fromSel.innerHTML = optHtml; toSel.innerHTML = optHtml;
  opSel.innerHTML = RELATION_OPS.map((o) => `<option value="${o.id}">${esc(o.label)}</option>`).join('');
  if ([...fromSel.options].some((o) => o.value === prevFrom)) fromSel.value = prevFrom;
  if ([...toSel.options].some((o) => o.value === prevTo)) toSel.value = prevTo;
  else if (toSel.options.length > 1) toSel.selectedIndex = 1;
  const label = (kind, id) => opts.find((o) => o.kind === kind && o.id === id)?.label || id;
  $('#scheme-relations').innerHTML = (scheme.relations || []).map((rel) =>
    `<span class="rel-chip">${esc(label(rel.fromKind, rel.from))} <b>${esc(OP_SHORT[rel.op] || rel.op)}</b> ${esc(label(rel.toKind, rel.to))}<button type="button" data-rel-del="${esc(rel.id)}" aria-label="Удалить стрелку">×</button></span>`
  ).join('') || '<span class="hint">Стрелок пока нет — добавьте первую выше.</span>';
}

function renderSchemeQuestions() {
  const box = $('#scheme-questions');
  if (!box) return;
  const group = scheme.group;
  const builtin = QUESTIONS.filter((q) => q.group === group);
  const custom = (scheme.customQuestions || []).map((d) => findQuestion(scheme, `custom:${d.id}`)).filter(Boolean);
  const list = [...builtin, ...custom];
  box.innerHTML = list.map((q) =>
    `<button type="button" data-qid="${esc(q.id)}" class="${scheme.questionId === q.id ? 'active' : ''}">${esc(q.label)}</button>`
  ).join('') || '<span class="hint">В этой группе пока пусто — добавьте «Своё действие» ниже.</span>';
  renderSchemeOperands();
  renderSchemeCustomList();
}

function renderSchemeOperands() {
  const box = $('#scheme-operands');
  if (!box) return;
  const q = findQuestion(scheme, scheme.questionId);
  if (!q) { box.innerHTML = ''; return; }
  if (!q.operands?.length) {
    box.innerHTML = '<p class="hint" style="grid-column:1/-1">Данные берутся из таблицы и переменных — укажите их выше.</p>';
    return;
  }
  box.innerHTML = q.operands.map((op) => {
    const cur = scheme.assignments[op.key];
    if (op.kind === 'columnSum') {
      if (!cur?.columnId || !scheme.columns.some((c) => c.id === cur.columnId)) { scheme.assignments[op.key] = { kind: 'columnSum', columnId: scheme.columns[0]?.id }; saveScheme(); }
      const columnId = scheme.assignments[op.key].columnId;
      const sel = scheme.columns.map((c) => `<option value="${esc(c.id)}" ${c.id === columnId ? 'selected' : ''}>Σ «${esc(c.title || 'без названия')}»</option>`).join('');
      return `<div class="field"><label><span>${esc(op.label)}</span></label><select class="input" data-op="${esc(op.key)}">${sel}</select></div>`;
    }
    if (op.kind === 'rowSum') {
      if (!cur?.rowId || !scheme.rows.some((r) => r.id === cur.rowId)) { scheme.assignments[op.key] = { kind: 'rowSum', rowId: scheme.rows[0]?.id }; saveScheme(); }
      const rowId = scheme.assignments[op.key].rowId;
      const sel = scheme.rows.map((r) => `<option value="${esc(r.id)}" ${r.id === rowId ? 'selected' : ''}>Σ «${esc(r.label || 'строка')}»</option>`).join('');
      return `<div class="field"><label><span>${esc(op.label)}</span></label><select class="input" data-op="${esc(op.key)}">${sel}</select></div>`;
    }
    const val = typeof cur === 'string' ? cur : (cur?.src ?? '');
    return `<div class="field"><label><span>${esc(op.label)}</span></label><input type="text" class="input" data-op="${esc(op.key)}" value="${esc(val)}" placeholder="${esc(op.hint || 'переменная или выражение')}" autocomplete="off" spellcheck="false"></div>`;
  }).join('');
}

function renderSchemeCustomList() {
  const box = $('#scheme-custom-list');
  if (!box) return;
  const items = scheme.customQuestions || [];
  box.innerHTML = items.map((d) =>
    `<span class="rel-chip" style="border-color:var(--line);background:var(--surface-2);color:var(--ink-2)">${esc(d.label)} <span class="mono" style="color:var(--accent)">${esc(d.formula)}</span><button type="button" data-custom-del="${esc(d.id)}" aria-label="Удалить">×</button></span>`
  ).join('');
}

function renderSchemeAll() {
  renderSchemeVars();
  renderSchemeGrid();
  renderSchemeDiagram();
  renderSchemeChart();
  renderSchemeRelations();
  renderSchemeQuestions();
  const groupSel = $('#scheme-group');
  if (groupSel && groupSel.value !== scheme.group) groupSel.value = scheme.group;
  const titleInput = $('#scheme-title');
  if (titleInput && titleInput.value !== (scheme.title || '')) titleInput.value = scheme.title || '';
  const sumCol = $('#scheme-sum-col'), sumRow = $('#scheme-sum-row');
  if (sumCol) sumCol.checked = !!scheme.showSumCol;
  if (sumRow) sumRow.checked = !!scheme.showSumRow;
}

function schemeCardHtml(res) {
  return renderCard({
    title: res.question.label,
    given: (res.given || []),
    find: res.find,
    formulas: res.formulas,
    solution: res.steps,
    answer: res.answer,
  });
}

function showSchemeCondition(text) {
  const wrap = $('#scheme-condition-wrap');
  $('#scheme-condition').textContent = text;
  wrap.hidden = false;
}

function initScheme() {
  if (!$('#screen-scheme')) return;

  $('#scheme-group').innerHTML = QUESTION_GROUPS.map((g) => `<option value="${g.id}">${esc(g.label)}</option>`).join('');
  $('#scheme-group').value = scheme.group;
  $('#scheme-presets').innerHTML = SCHEME_PRESETS.map((p) => `<button type="button" data-preset="${p.id}">${esc(p.label)}</button>`).join('');

  // Перерисовка графика при изменении ширины экрана
  let chartResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(chartResize);
    chartResize = setTimeout(() => renderSchemeChart(), 120);
  });

  // График по таблице: выбор столбца
  $('#scheme-chart-col').addEventListener('change', (e) => { schemeChartCol = e.target.value; renderSchemeChart(); });

  $('#scheme-group').addEventListener('change', (e) => { scheme.group = e.target.value; saveScheme(); renderSchemeQuestions(); });
  $('#scheme-title').addEventListener('input', (e) => { scheme.title = e.target.value; saveScheme(); });
  $('#scheme-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    scheme = presetScheme(btn.dataset.preset);
    saveScheme();
    $('#scheme-out').innerHTML = '';
    $('#scheme-condition-wrap').hidden = true;
    renderSchemeAll();
  });

  // Переменные
  $('#scheme-add-var').addEventListener('submit', (e) => {
    e.preventDefault();
    const nameEl = $('#scheme-var-name'), exprEl = $('#scheme-var-expr');
    const name = nameEl.value.trim();
    const expr = exprEl.value.trim();
    if (!name) return;
    scheme.vars.push({ name, expr: expr || '0' });
    nameEl.value = ''; exprEl.value = ''; nameEl.focus();
    saveScheme();
    refreshSchemeComputed();
    renderSchemeRelations();
    renderSchemeOperands();
  });
  $('#scheme-vars').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-var-del]');
    if (!btn) return;
    scheme.vars.splice(Number(btn.dataset.varDel), 1);
    saveScheme();
    refreshSchemeComputed();
    renderSchemeRelations();
    renderSchemeOperands();
  });

  // Таблица: редактирование без пересборки
  const grid = $('#scheme-grid');
  grid.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.colTitle !== undefined) scheme.columns[+t.dataset.colTitle].title = t.value;
    else if (t.dataset.colUnit !== undefined) scheme.columns[+t.dataset.colUnit].unit = t.value;
    else if (t.dataset.rowLabel !== undefined) scheme.rows[+t.dataset.rowLabel].label = t.value;
    else if (t.dataset.cell !== undefined) {
      const [ri, ci] = t.dataset.cell.split(':').map(Number);
      scheme.cells[`${scheme.rows[ri].id}|${scheme.columns[ci].id}`] = t.value;
    } else return;
    saveScheme();
    refreshSchemeComputed();
  });
  // смена названия столбца влияет на ссылки в таблице — пересобрать при смене фокуса
  grid.addEventListener('change', (e) => {
    if (e.target.dataset.colTitle !== undefined || e.target.dataset.rowLabel !== undefined) {
      renderSchemeGrid(); renderSchemeDiagram(); renderSchemeRelations(); renderSchemeOperands();
    }
  });

  $('#scheme-add-col').addEventListener('click', () => {
    scheme.columns.push({ id: schemeNid('c'), title: `Столбец ${scheme.columns.length + 1}`, unit: '' });
    saveScheme(); renderSchemeGrid(); renderSchemeDiagram(); renderSchemeRelations(); renderSchemeOperands();
  });
  $('#scheme-del-col').addEventListener('click', () => {
    if (scheme.columns.length <= 1) return;
    const col = scheme.columns.pop();
    for (const key of Object.keys(scheme.cells)) if (key.endsWith(`|${col.id}`)) delete scheme.cells[key];
    scheme.relations = (scheme.relations || []).filter((r) => !(r.fromKind === 'col' && r.from === col.id) && !(r.toKind === 'col' && r.to === col.id));
    saveScheme(); renderSchemeGrid(); renderSchemeDiagram(); renderSchemeRelations(); renderSchemeOperands();
  });
  $('#scheme-add-row').addEventListener('click', () => {
    scheme.rows.push({ id: schemeNid('r'), label: `Строка ${scheme.rows.length + 1}`, unit: '' });
    saveScheme(); renderSchemeGrid(); renderSchemeDiagram(); renderSchemeRelations(); renderSchemeOperands();
  });
  $('#scheme-del-row').addEventListener('click', () => {
    if (scheme.rows.length <= 1) return;
    const row = scheme.rows.pop();
    for (const key of Object.keys(scheme.cells)) if (key.startsWith(`${row.id}|`)) delete scheme.cells[key];
    scheme.relations = (scheme.relations || []).filter((r) => !(r.fromKind === 'row' && r.from === row.id) && !(r.toKind === 'row' && r.to === row.id));
    saveScheme(); renderSchemeGrid(); renderSchemeDiagram(); renderSchemeRelations(); renderSchemeOperands();
  });
  $('#scheme-sum-col').addEventListener('change', (e) => { scheme.showSumCol = e.target.checked; saveScheme(); renderSchemeGrid(); });
  $('#scheme-sum-row').addEventListener('change', (e) => { scheme.showSumRow = e.target.checked; saveScheme(); renderSchemeGrid(); });

  // Стрелки
  $('#scheme-add-rel').addEventListener('submit', (e) => {
    e.preventDefault();
    const fromSel = $('#scheme-rel-from'), toSel = $('#scheme-rel-to'), opSel = $('#scheme-rel-op');
    const [fromKind, from] = String(fromSel.value).split(/:(.+)/);
    const [toKind, to] = String(toSel.value).split(/:(.+)/);
    if (!from || !to) return;
    scheme.relations.push({ id: schemeNid('rel'), fromKind, from, toKind, to, op: opSel.value });
    saveScheme(); renderSchemeRelations(); renderSchemeDiagram();
  });
  $('#scheme-relations').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rel-del]');
    if (!btn) return;
    scheme.relations = scheme.relations.filter((r) => r.id !== btn.dataset.relDel);
    saveScheme(); renderSchemeRelations(); renderSchemeDiagram();
  });

  // Вопросы
  $('#scheme-questions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qid]');
    if (!btn) return;
    scheme.questionId = btn.dataset.qid;
    saveScheme();
    renderSchemeQuestions();
  });
  $('#scheme-operands').addEventListener('input', (e) => {
    const t = e.target;
    const key = t.dataset.op;
    if (!key) return;
    const q = findQuestion(scheme, scheme.questionId);
    const op = q?.operands?.find((o) => o.key === key);
    if (!op) return;
    scheme.assignments[key] = op.kind === 'expr' ? t.value : { kind: op.kind, columnId: op.kind === 'columnSum' ? t.value : undefined, rowId: op.kind === 'rowSum' ? t.value : undefined };
    saveScheme();
  });
  $('#scheme-operands').addEventListener('change', (e) => {
    const t = e.target;
    const key = t.dataset.op;
    if (!key) return;
    const q = findQuestion(scheme, scheme.questionId);
    const op = q?.operands?.find((o) => o.key === key);
    if (op && op.kind !== 'expr') {
      scheme.assignments[key] = op.kind === 'columnSum' ? { kind: 'columnSum', columnId: t.value } : { kind: 'rowSum', rowId: t.value };
      saveScheme();
    }
  });

  const runSolve = () => {
    const out = $('#scheme-out');
    const res = solveQuestion(scheme, scheme.questionId, scheme.assignments);
    if (!res.ok) { out.innerHTML = `<div class="err">${esc(res.error)}</div>`; return null; }
    out.innerHTML = schemeCardHtml(res);
    showSchemeCondition(res.condition);
    return res;
  };
  $('#scheme-solve').addEventListener('click', runSolve);
  $('#scheme-compose').addEventListener('click', () => {
    const out = $('#scheme-out');
    const res = solveQuestion(scheme, scheme.questionId, scheme.assignments);
    if (!res.ok) { out.innerHTML = `<div class="err">${esc(res.error)}</div>`; return; }
    showSchemeCondition(res.condition);
    $('#scheme-condition-wrap').scrollIntoView?.({ block: 'nearest' });
  });
  $('#scheme-to-tasks').addEventListener('click', () => {
    const res = solveQuestion(scheme, scheme.questionId, scheme.assignments);
    if (!res.ok) { $('#scheme-out').innerHTML = `<div class="err">${esc(res.error)}</div>`; return; }
    taskInput.value = res.condition;
    show('task');
    taskInput.focus();
  });
  $('#scheme-copy-condition').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const text = $('#scheme-condition').textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Скопировано ✓';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('#scheme-condition'));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      try { document.execCommand('copy'); btn.textContent = 'Скопировано ✓'; } catch { btn.textContent = 'Выделите текст и скопируйте'; }
      sel.removeAllRanges();
    }
    setTimeout(() => { btn.textContent = 'Копировать условие'; }, 1600);
  });

  // Своё действие
  $('#scheme-add-custom').addEventListener('submit', (e) => {
    e.preventDefault();
    const labelEl = $('#scheme-custom-label'), formulaEl = $('#scheme-custom-formula'), unitEl = $('#scheme-custom-unit'), qEl = $('#scheme-custom-question');
    const def = {
      id: schemeNid('cq'),
      label: labelEl.value.trim(),
      formula: formulaEl.value.trim(),
      unit: unitEl.value.trim(),
      question: qEl.value.trim() || 'Что получится?',
    };
    if (!def.label || !def.formula) return;
    scheme.customQuestions.push(def);
    scheme.questionId = `custom:${def.id}`;
    scheme.group = 'custom';
    labelEl.value = ''; formulaEl.value = ''; unitEl.value = ''; qEl.value = '';
    $('#scheme-group').value = 'custom';
    saveScheme();
    renderSchemeQuestions();
  });
  $('#scheme-custom-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-custom-del]');
    if (!btn) return;
    scheme.customQuestions = scheme.customQuestions.filter((d) => d.id !== btn.dataset.customDel);
    if (scheme.questionId === `custom:${btn.dataset.customDel}`) scheme.questionId = 'sum';
    saveScheme();
    renderSchemeQuestions();
  });

  renderSchemeAll();
}

/* =========================================================================
 * РУССКИЙ ЯЗЫК
 * ========================================================================= */
let ruMode = 'auto';

function analyzeByMode(word) {
  switch (ruMode) {
    case 'participle': return analyzeParticiple(word);
    case 'adverbial': return analyzeAdverbialParticiple(word);
    case 'verb': return analyzeVerb(word);
    case 'noun': return analyzeNoun(word);
    case 'adjective': return analyzeAdjective(word);
    default: return analyzeAuto(word);
  }
}

function ruResultHtml(res) {
  if (!res.ok) return `<div class="err">${esc(res.error)}</div>`;
  const facts = [
    ['Начальная форма', res.initial],
    ['Разряд', res.voice],
    ['Время', res.tense],
    ['Вид', res.aspect],
    ['Возвратность', res.reflexive === undefined ? null : (res.reflexive ? 'возвратное (-ся/-сь)' : 'невозвратное')],
    ['Форма', res.form],
    ['Род', res.gender],
    ['Число', res.number],
    ['Падеж', res.case],
    ['Спряжение', res.conjugation],
    ['Лицо', res.person],
    ['Склонение', res.declension],
    ['Степень сравнения', res.degree],
    ['Роль в предложении', res.role],
  ].filter(([, v]) => v != null && v !== '');
  const factHtml = facts.map(([k, v]) => `<div class="card-part" style="margin-bottom:4px"><b>${esc(k)}:</b> ${esc(String(v))}</div>`).join('');
  const warn = res.shortWarning ? `<div class="warn-box"><b>Как не перепутать</b><span>${esc(res.shortWarning)}</span></div>` : '';
  const notes = (res.notes || []).length
    ? `<div class="note-box">${res.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : '';
  const parse = (res.parse || []).length
    ? `<div class="card-part" style="margin-top:10px"><b>Разбор как в тетради:</b><ol class="steps">${res.parse.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>` : '';
  return `<div class="card"><div class="card-title">«${esc(res.word)}» — ${esc(res.type || 'разбор')}${res.auto ? ' <span style="color:var(--ink-3);font-weight:400">(автоопределение)</span>' : ''}</div>${factHtml}${parse}${warn}${notes}</div>`;
}

const ruQuiz = { i: 0, score: 0, locked: false };

function renderRuQuiz() {
  const box = $('#ru-quiz');
  if (!box) return;
  if (ruQuiz.i >= RU_QUIZ.length) {
    const total = RU_QUIZ.length;
    const pct = Math.round((ruQuiz.score / total) * 100);
    const verdict = pct === 100 ? 'Идеально! Разряды причастий — на отлично.' : pct >= 70 ? 'Хорошо! Ещё чуть-чуть — и пятёрка.' : 'Стоит повторить таблицу разрядов выше — и всё получится.';
    box.innerHTML = `<div class="answer" style="margin-top:4px"><div class="answer-label">Результат</div>
      <p class="answer-value" style="font-size:1.6rem">${ruQuiz.score} из ${total}</p>
      <p class="answer-sub">${esc(verdict)}</p></div>
      <button class="btn primary" id="ru-quiz-again" style="margin-top:10px">Пройти ещё раз</button>`;
    return;
  }
  const q = RU_QUIZ[ruQuiz.i];
  box.innerHTML = `<div class="quiz-word">${esc(q.word)}</div>
    <div class="quiz-sub">Вопрос ${ruQuiz.i + 1} из ${RU_QUIZ.length} · верных ответов: ${ruQuiz.score}</div>
    <div class="quiz-options">${RU_QUIZ_OPTIONS.map((o, i) => `<button type="button" data-opt="${i}">${esc(o)}</button>`).join('')}</div>
    <div class="quiz-foot"><span class="quiz-score" id="ru-quiz-feedback">Какое это причастие?</span></div>`;
}

function initRu() {
  if (!$('#screen-ru')) return;

  $$('#ru-modes [data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    ruMode = btn.dataset.mode;
    $$('#ru-modes [data-mode]').forEach((b) => b.classList.toggle('active', b === btn));
  }));

  const run = () => {
    const word = $('#ru-word').value.trim();
    const out = $('#ru-out');
    if (!word) { out.innerHTML = '<div class="err">Введите слово.</div>'; return; }
    out.innerHTML = ruResultHtml(analyzeByMode(word));
  };
  $('#ru-analyze').addEventListener('click', run);
  $('#ru-word').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });

  // Справочник
  $('#ru-ref').innerHTML = RU_SECTIONS.map((sec) => {
    let body = '';
    if (sec.table) {
      body += `<table class="ru-table"><thead><tr>${sec.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sec.table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    for (const b of sec.blocks || []) {
      body += `<h4>${esc(b.h)}</h4>${b.p ? `<p>${esc(b.p)}</p>` : ''}`;
    }
    if (sec.note) body += `<div class="ru-note">${esc(sec.note)}</div>`;
    return `<details class="ru-sec"><summary>${esc(sec.title)}</summary><div class="ru-sec-body">${body}</div></details>`;
  }).join('');

  // Тест
  $('#ru-quiz').addEventListener('click', (e) => {
    const again = e.target.closest('#ru-quiz-again');
    if (again) { ruQuiz.i = 0; ruQuiz.score = 0; ruQuiz.locked = false; renderRuQuiz(); return; }
    const opt = e.target.closest('[data-opt]');
    if (!opt || ruQuiz.locked) return;
    const chosen = Number(opt.dataset.opt);
    const q = RU_QUIZ[ruQuiz.i];
    ruQuiz.locked = true;
    const buttons = $$('#ru-quiz [data-opt]');
    buttons.forEach((b) => {
      const i = Number(b.dataset.opt);
      if (i === q.answer) b.classList.add('right');
      else if (i === chosen) b.classList.add('wrong');
    });
    const fb = $('#ru-quiz-feedback');
    if (chosen === q.answer) { ruQuiz.score += 1; fb.textContent = 'Верно!'; fb.style.color = 'var(--ok)'; }
    else { fb.textContent = `Неверно: это ${RU_QUIZ_OPTIONS[q.answer]}.`; fb.style.color = 'var(--err)'; }
    const foot = $('#ru-quiz .quiz-foot');
    const next = document.createElement('button');
    next.className = 'btn primary';
    next.id = 'ru-quiz-next';
    next.textContent = ruQuiz.i + 1 >= RU_QUIZ.length ? 'К результату →' : 'Дальше →';
    foot.appendChild(next);
    next.addEventListener('click', () => { ruQuiz.i += 1; ruQuiz.locked = false; renderRuQuiz(); }, { once: true });
  });
  renderRuQuiz();
}

/* =========================================================================
 * ТРЕУГОЛЬНИК (внутри «Геометрия»)
 * ========================================================================= */
const TRI_FIELDS = {
  sss: [['a', 'Сторона a (против ∠A)', '4'], ['b', 'Сторона b (против ∠B)', '5'], ['c', 'Сторона c (против ∠C)', '6']],
  sas: [['b', 'Сторона AC (b)', '5'], ['c', 'Сторона AB (c)', '4'], ['A', 'Угол ∠A между ними, °', '60']],
  asa: [['c', 'Сторона AB (c)', '6'], ['A', 'Угол ∠A, °', '50'], ['B', 'Угол ∠B, °', '60']],
};
let lastTriangleSVG = '';

function renderTriFields() {
  const mode = $('#tri-mode')?.value || 'sss';
  $('#tri-fields').innerHTML = TRI_FIELDS[mode].map(([key, label, def]) =>
    `<div class="field"><label for="tri-${key}"><span>${esc(label)}</span></label><input type="text" id="tri-${key}" data-tri-field="${key}" value="${esc(def)}" inputmode="decimal" autocomplete="off"></div>`
  ).join('');
}

function initTriangle() {
  if (!$('#tri-mode')) return;
  const triOut = $('#tri-out');
  const download = $('#tri-download');

  const draw = () => {
    const mode = $('#tri-mode').value;
    const val = {};
    $$('#tri-fields [data-tri-field]').forEach((inp) => { val[inp.dataset.triField] = parseNum(inp.value); });
    let tri = null;
    if (mode === 'sss') tri = triangleBySides(val.a, val.b, val.c);
    else if (mode === 'sas') tri = triangleBySAS(val.b, val.c, val.A);
    else tri = triangleByASA(val.c, val.A, val.B);
    if (!tri?.ok) {
      triOut.innerHTML = `<div class="err">${esc(tri?.error || 'Не удалось построить треугольник.')}</div>`;
      download.hidden = true;
      lastTriangleSVG = '';
      return;
    }
    lastTriangleSVG = triangleSVG(tri);
    const stats = triangleStats(tri).map((t) => `<li>${esc(t)}</li>`).join('');
    triOut.innerHTML = `${lastTriangleSVG}<div class="note-box tri-caption"><p style="margin-bottom:4px"><b>Чертёж идеальный — рисуйте по нему.</b></p><ol class="steps">${stats}</ol></div>`;
    download.hidden = false;
  };

  $('#tri-mode').addEventListener('change', () => { renderTriFields(); draw(); });
  $('#tri-draw').addEventListener('click', draw);
  $('#tri-fields').addEventListener('keydown', (e) => { if (e.key === 'Enter') draw(); });
  download.addEventListener('click', () => {
    if (!lastTriangleSVG) return;
    try {
      const blob = new Blob([lastTriangleSVG], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'treugolnik.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* скачивание недоступно — SVG виден на экране */ }
  });
  $$('[data-tri]').forEach((btn) => btn.addEventListener('click', () => {
    const [mode, nums] = btn.dataset.tri.split(':');
    $('#tri-mode').value = mode;
    renderTriFields();
    const parts = nums.split(',');
    $$('#tri-fields [data-tri-field]').forEach((inp, i) => { inp.value = parts[i] ?? ''; });
    draw();
  }));

  renderTriFields();
  draw();
}

/* =========================================================================
 * СТАРТ
 * ========================================================================= */
initInfo();
initGeo();
initScheme();
initRu();
initTriangle();
show(settings.screen || 'calc');
applySubjectMode(settings.subject || 'school', { navigate: false });
updateDisplay();
void preprocess;
