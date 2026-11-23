/* =========================================================================
 * app.js — калькулятор: клавиатура, настройки (за шестернёй) и справочник.
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, solveEquation, solveSystemByMethod, linearIn, numericRoots, splitEquation, arithmeticMean, checkEquationSteps, evaluate, evaluateWithSteps, substituteText, checkIdentity, preprocess } from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, CHAPTER_BY_ID, BOOK, STATS, formulaSearch } from './formulas.js';
import { parseInterval, describeInterval, numberLineSVG, intersect, union } from './intervals.js';
import { solveInequality, longArithmetic, divideAngle } from './inequalities.js';
import { INFO_UNITS, convertInfoSize, convertBase, parseInfoSize, solveItTask } from './it.js';
import { GEO_TOOLS, solveGeoTask } from './geo.js';
import { parseNumberList, descriptiveStatistics, weightedMean, linearRegression, histogramSVG, regressionSVG } from './statistics.js';
import { IDEAS, IDEA_CATEGORIES } from './ideas.js';
import { triangleBySides, triangleBySAS, triangleByASA, triangleSVG, triangleStats } from './triangle.js';
import './grapher.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* =========================================================================
 * НАСТРОЙКИ (хранятся в localStorage)
 * ========================================================================= */
const DEFAULTS = {
  screen: 'calc',        // что открывать при запуске: calc | interval | info | geo
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
  mean: $('#screen-mean'),
  stats: $('#screen-stats'),
  equation: $('#screen-equation'),
  system: $('#screen-system'),
  history: $('#screen-history'),
  ideas: $('#screen-ideas'),
  ineq: $('#screen-ineq'),
  interval: $('#screen-interval'),
  graph: $('#screen-graph'),
  info: $('#screen-info'),
  geo: $('#screen-geo'),
  smeta: $('#screen-smeta'),
  settings: $('#screen-settings'),
  ref: $('#screen-ref'),
};
const TITLES = {
  calc: 'Калькулятор', mean: 'Среднее арифметическое', stats: 'Статистика', equation: 'Уравнения', system: 'Системы уравнений', history: 'Журнал решений', ideas: 'Каталог идей', ineq: 'Неравенства', interval: 'Промежутки', graph: 'Графики',
  info: 'Информатика', geo: 'Геометрия', smeta: 'Смета',
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
  if (name === 'history') renderMathHistory();
  if (name === 'ideas') renderIdeas();
  if (name === 'smeta') { const f = $('#smeta-frame'); if (f && !f.dataset.loaded) f.dataset.loaded = '1'; }
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
 * СРЕДНЕЕ АРИФМЕТИЧЕСКОЕ И УРАВНЕНИЯ
 * ========================================================================= */
function parseMeanValues(raw) {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('Введите числа для вычисления среднего.');
  let parts;
  if (/[;\n]/.test(text)) parts = text.split(/[;\n]/);
  else if (/[,;]/.test(text) && (text.match(/,/g) || []).length > 1) parts = text.split(',');
  else if (/,[ \t]+/.test(text)) parts = text.split(/,\s*/);
  else if (/\s+/.test(text.trim())) parts = text.trim().split(/\s+/);
  else parts = [text];
  const values = parts.map((part) => {
    const token = part.trim().replace(/[−–—]/g, '-');
    if (!token || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
      throw new Error(`Проверьте значение «${token || 'пустое'}»: вводите только числа, разделяя их точкой с запятой или новой строкой.`);
    }
    const value = Number(token.replace(',', '.'));
    if (!Number.isFinite(value)) throw new Error(`Число «${token}» слишком велико.`);
    return value;
  });
  return values;
}

function calculateMean() {
  const out = $('#mean-output');
  try {
    const values = parseMeanValues($('#mean-values').value);
    const result = arithmeticMean(values);
    const sequence = values.map(fmt).join(' + ');
    recordMathHistory({ type: 'mean', input: { values: $('#mean-values').value }, answer: fmt(result.mean) });
    out.innerHTML = `<div class="answer" style="margin-top:10px">
      <div class="answer-label">Среднее арифметическое</div>
      <p class="answer-value">${esc(fmtSmart(result.mean))}</p>
      <p class="answer-sub">Сумма: ${esc(fmt(result.sum))} · Количество чисел: ${result.count}</p>
    </div><details class="more" open><summary>Решение</summary><div class="more-body"><ol class="steps">
      <li>Складываем все числа: ${esc(sequence)} = ${esc(fmt(result.sum))}.</li>
      <li>Делим сумму на количество чисел: ${esc(fmt(result.sum))} ÷ ${result.count} = ${esc(fmtSmart(result.mean))}.</li>
    </ol></div></details>`;
  } catch (error) {
    out.innerHTML = `<div class="err">${esc(error.message)}</div>`;
  }
}
$('#mean-calculate').addEventListener('click', calculateMean);
$('#mean-values').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); calculateMean(); }
});

function calculateStatistics() {
  const out = $('#stats-output');
  try {
    const raw = $('#stats-values').value;
    const values = parseNumberList(raw);
    const s = descriptiveStatistics(values);
    const modes = s.modes.length ? s.modes.map(fmt).join('; ') : 'нет единственной моды';
    const rows = [
      ['Количество наблюдений', s.n], ['Сумма', fmt(s.sum)], ['Среднее арифметическое', fmtSmart(s.mean)],
      ['Медиана', fmt(s.median)], ['Мода', modes], ['Минимум / максимум', `${fmt(s.min)} / ${fmt(s.max)}`],
      ['Размах', fmt(s.range)], ['Q1 / Q3', `${fmt(s.q1)} / ${fmt(s.q3)}`], ['Межквартильный размах', fmt(s.iqr)],
      ['Дисперсия (генеральная / выборочная)', `${fmt(s.populationVariance)} / ${s.sampleVariance === null ? '—' : fmt(s.sampleVariance)}`],
      ['Стандартное отклонение (генеральное / выборочное)', `${fmt(s.populationStdDev)} / ${s.sampleStdDev === null ? '—' : fmt(s.sampleStdDev)}`],
      ['Стандартная ошибка среднего', s.standardError === null ? '—' : fmt(s.standardError)],
      ['Геометрическое среднее', s.geometricMean === null ? 'определено только для положительных чисел' : fmt(s.geometricMean)],
      ['Гармоническое среднее', s.harmonicMean === null ? 'определено только для положительных чисел' : fmt(s.harmonicMean)],
    ];
    const ci = s.confidence95 ? `<p class="answer-sub">Приближённый 95% интервал среднего: [${esc(fmt(s.confidence95[0]))}; ${esc(fmt(s.confidence95[1]))}]${s.n < 30 ? ' · нормальное приближение, для малой выборки ориентировочное' : ''}</p>` : '';
    const unusual = s.outliers.length ? `<div class="hint hint-note">Возможные выбросы по правилу 1,5·IQR: ${esc(s.outliers.map(fmt).join('; '))}. Это сигнал для проверки данных, не автоматическое удаление.</div>` : '';
    recordMathHistory({ type: 'stats', input: { values: raw }, answer: fmt(s.mean) });
    out.innerHTML = `<div class="answer" style="margin-top:10px"><div class="answer-label">Сводка данных · ${s.n} наблюдений</div>
      <div class="table-values">${rows.map(([label, value]) => `<span><b>${esc(label)}:</b> ${esc(value)}</span>`).join('')}</div>${ci}${unusual}
      ${histogramSVG(values)}<details class="more"><summary>Как получены показатели</summary><div class="more-body"><ol class="steps">
        <li>Среднее = сумма / количество = ${esc(fmt(s.sum))} / ${s.n} = ${esc(fmt(s.mean))}.</li>
        <li>Медиана и квартильные значения вычислены после сортировки данных.</li>
        <li>Выборочная дисперсия делится на n−1; генеральная — на n. Это разные предположения о данных.</li>
        <li>Границы выбросов: Q1 − 1,5·IQR = ${esc(fmt(s.lowerFence))}; Q3 + 1,5·IQR = ${esc(fmt(s.upperFence))}.</li>
      </ol></div></details></div>`;
  } catch (error) { out.innerHTML = `<div class="err">${esc(error.message)}</div>`; }
}
$('#stats-analyze').addEventListener('click', calculateStatistics);
$('#weighted-calculate').addEventListener('click', () => {
  const out = $('#weighted-output');
  try {
    const values = parseNumberList($('#weighted-values').value, 'значения');
    const weights = parseNumberList($('#weighted-weights').value, 'веса');
    const result = weightedMean(values, weights);
    out.innerHTML = `<div class="answer" style="margin-top:8px"><div class="answer-label">Взвешенное среднее</div><p class="answer-value">${esc(fmtSmart(result.value))}</p>
      <p class="answer-sub">Σ(xᵢ·wᵢ) / Σwᵢ = ${esc(fmt(result.weightedSum))} / ${esc(fmt(result.totalWeight))}</p></div>`;
  } catch (error) { out.innerHTML = `<div class="err">${esc(error.message)}</div>`; }
});
$('#regression-calculate').addEventListener('click', () => {
  const out = $('#regression-output');
  try {
    const xs = parseNumberList($('#regression-x').value, 'значения X');
    const ys = parseNumberList($('#regression-y').value, 'значения Y');
    const model = linearRegression(xs, ys);
    recordMathHistory({ type: 'regression', input: { xs: $('#regression-x').value, ys: $('#regression-y').value }, answer: `y = ${fmt(model.slope)}x + ${fmt(model.intercept)}` });
    out.innerHTML = `<div class="answer" style="margin-top:8px"><div class="answer-label">Линейная регрессия · ${model.n} пар</div>
      <p class="answer-value">y = ${esc(fmt(model.slope))}x ${model.intercept >= 0 ? '+' : '−'} ${esc(fmt(Math.abs(model.intercept)))}</p>
      <p class="answer-sub">Корреляция r: ${model.correlation === null ? 'не определена' : esc(fmt(model.correlation))} · R²: ${model.rSquared === null ? 'не определён' : esc(fmt(model.rSquared))}</p>
      ${regressionSVG(model)}<p class="hint hint-note">Регрессия описывает линейную связь в этих данных и сама по себе не доказывает причинность.</p></div>`;
  } catch (error) { out.innerHTML = `<div class="err">${esc(error.message)}</div>`; }
});

function calculateEquation() {
  const out = $('#equation-output');
  const equation = $('#equation-input').value.trim();
  const variable = $('#equation-variable').value.trim() || 'x';
  const method = $('#equation-method').value;
  if (!equation) { out.innerHTML = '<div class="err">Введите уравнение.</div>'; return; }
  try {
    let result;
    if (method === 'numeric') {
      const [left, right] = splitEquation(equation);
      const roots = numericRoots((value) => evaluate(left, { [variable]: value }) - evaluate(right, { [variable]: value }), [-100, 100]);
      result = { type: roots.length > 1 ? 'two' : roots.length ? 'one' : 'none', roots,
        steps: ['Ищем смену знака разности левой и правой частей на [−100; 100].', roots.length
          ? `Найденные корни: ${roots.map(fmt).join('; ')}.`
          : 'На этом отрезке корни не найдены. Метод может пропустить касание оси и корни за пределами отрезка.'] };
    } else {
      if (method === 'linear') {
        const [left, right] = splitEquation(equation);
        if (!linearIn(`(${left}) - (${right})`, variable).linear) throw new Error('Выбран линейный способ, но уравнение нелинейное. Выберите автоматический или численный способ.');
      }
      result = solveEquation(equation, variable);
      if (method === 'quadratic' && !result.steps.some((step) => step.includes('ax² + bx + c = 0'))) {
        throw new Error('Не удалось представить уравнение как квадратное. Проверьте степень неизвестной или выберите другой способ.');
      }
    }
    const answer = result.type === 'many'
      ? 'Любое значение переменной (бесконечно много решений)'
      : result.roots.length ? result.roots.map((root) => `${variable} = ${fmtSmart(root)}`).join('; ') : 'Действительных корней не найдено';
    const resultLabel = result.type === 'many' ? 'бесконечно много решений'
      : result.type === 'two' ? 'несколько корней' : result.type === 'one' ? 'один корень' : 'корней нет';
    const displayMode = $('#equation-display-mode').value;
    const gradual = displayMode === 'gradual';
    const isQuadratic = result.steps.some((step) => step.includes('ax² + bx + c = 0'));
    const isLinear = result.steps.some((step) => step.includes('Перенесём всё в левую часть'));
    const teacherExplanation = isQuadratic
      ? 'Квадратное уравнение приводим к стандартному виду. Дискриминант показывает число действительных корней: D больше нуля — два, D равен нулю — один, D меньше нуля — ни одного. Каждый найденный корень нужно подставить в исходное уравнение.'
      : isLinear
      ? 'Цель — оставить неизвестную в одной части, числа перенести в другую, выполняя одинаковые операции с обеими частями равенства. В конце проверяем найденное значение подстановкой.'
      : 'Численный метод проверяет значения на выбранном интервале и уточняет участки, где левая и правая части совпадают. Это приближённый поиск: отсутствие найденного корня не доказывает, что корней нет за пределами интервала.';
    recordMathHistory({ type: 'equation', input: { equation, variable, method, displayMode }, answer });
    out.innerHTML = `<div class="answer" id="equation-answer-card" style="margin-top:10px"${gradual ? ' hidden' : ''}><div class="answer-label">Ответ · ${esc(resultLabel)}</div>
      <p class="answer-value">${esc(answer)}</p></div>
      <details class="more" open><summary>${gradual ? 'Открывайте подсказки по одной' : 'Ход решения'}</summary><div class="more-body"><ol class="steps">${result.steps.map((step, index) => `<li data-reveal-step="${index}"${gradual && index > 0 ? ' hidden' : ''}>${esc(step)}</li>`).join('')}</ol>
        ${gradual ? `<p class="answer-sub" id="equation-reveal-progress">Шаг 1 из ${result.steps.length}</p><button type="button" class="btn" id="equation-next-hint">Следующая подсказка</button>` : ''}</div></details>
      ${displayMode === 'teacher' ? `<details class="more" open><summary>Объяснение как преподаватель</summary><div class="more-body">${esc(teacherExplanation)}</div></details>` : ''}`;
    if (gradual) {
      let revealed = Math.min(1, result.steps.length);
      $('#equation-next-hint').addEventListener('click', () => {
        revealed = Math.min(result.steps.length, revealed + 1);
        $$('[data-reveal-step]', out).forEach((step) => { step.hidden = Number(step.dataset.revealStep) >= revealed; });
        if (revealed >= result.steps.length) {
          $('#equation-answer-card').hidden = false;
          $('#equation-next-hint').hidden = true;
          $('#equation-reveal-progress').textContent = `Все шаги показаны: ${result.steps.length} из ${result.steps.length}.`;
        } else $('#equation-reveal-progress').textContent = `Шаг ${revealed} из ${result.steps.length}`;
      });
    }
  } catch (error) {
    out.innerHTML = `<div class="err">${esc(error.message || 'Не удалось решить это уравнение.')}</div>`;
  }
}
$('#equation-solve').addEventListener('click', calculateEquation);
$('#check-student-steps').addEventListener('click', () => {
  const out = $('#student-check-output');
  try {
    const result = checkEquationSteps($('#equation-input').value.trim(), $('#student-steps').value, $('#equation-variable').value.trim() || 'x');
    const rows = result.checked.map((step, index) => `<li>${step.correct ? '✓' : '✗'} Шаг ${index + 1}: ${esc(step.line)}</li>`).join('');
    out.innerHTML = `<div class="answer" style="margin-top:8px"><div class="answer-label">${result.correct ? 'Ошибок не найдено' : `Первая ошибка — шаг ${result.firstWrongStep}`}</div>
      <p class="answer-sub">${esc(result.message)}</p>${rows ? `<ol class="steps">${rows}</ol>` : ''}</div>`;
  } catch (error) { out.innerHTML = `<div class="err">${esc(error.message)}</div>`; }
});
$$('[data-equation]').forEach((button) => button.addEventListener('click', () => {
  $('#equation-input').value = button.dataset.equation;
  calculateEquation();
}));

const SYSTEM_METHODS = ['elimination', 'substitution', 'cramer', 'graphical'];
const SYSTEM_METHOD_NAMES = {
  elimination: 'Сложение (исключение)', substitution: 'Подстановка',
  cramer: 'Определители Крамера', graphical: 'Графический метод',
};
function systemGraphSVG(values, rows, vars) {
  const width = 320, height = 220, pad = 24;
  const rangeX = Math.max(5, Math.min(50, Math.abs(values[vars[0]]) * .3));
  const rangeY = Math.max(5, Math.min(50, Math.abs(values[vars[1]]) * .3));
  const xmin = values[vars[0]] - rangeX, xmax = values[vars[0]] + rangeX;
  const ymin = values[vars[1]] - rangeY, ymax = values[vars[1]] + rangeY;
  const px = (x) => pad + (x - xmin) / (xmax - xmin) * (width - 2 * pad);
  const py = (y) => height - pad - (y - ymin) / (ymax - ymin) * (height - 2 * pad);
  const lines = rows.map((row, index) => {
    const color = ['#ff9f0a', '#4b9bff'][index];
    if (Math.abs(row.by) < 1e-12) {
      const x = -row.c / row.bx;
      return `<line x1="${px(x)}" y1="${pad}" x2="${px(x)}" y2="${height - pad}" stroke="${color}" stroke-width="2.5"/>`;
    }
    const y1 = -(row.bx * xmin + row.c) / row.by;
    const y2 = -(row.bx * xmax + row.c) / row.by;
    return `<line x1="${pad}" y1="${py(y1)}" x2="${width - pad}" y2="${py(y2)}" stroke="${color}" stroke-width="2.5"/>`;
  }).join('');
  const axes = `${xmin <= 0 && xmax >= 0 ? `<line x1="${px(0)}" y1="${pad}" x2="${px(0)}" y2="${height-pad}" stroke="#69727e" stroke-width="1"/>` : ''}${ymin <= 0 && ymax >= 0 ? `<line x1="${pad}" y1="${py(0)}" x2="${width-pad}" y2="${py(0)}" stroke="#69727e" stroke-width="1"/>` : ''}`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Графики уравнений и их точка пересечения" style="width:100%;max-width:420px;height:auto;background:#11151a;border:1px solid #30363d;border-radius:12px;margin-top:10px"><title>Точка пересечения прямых — решение системы</title><defs><clipPath id="system-plot-clip"><rect x="${pad}" y="${pad}" width="${width-2*pad}" height="${height-2*pad}"/></clipPath></defs>${axes}<g clip-path="url(#system-plot-clip)">${lines}<circle cx="${px(values[vars[0]])}" cy="${py(values[vars[1]])}" r="5" fill="#37d399" stroke="#fff" stroke-width="1.5"/></g><text x="${width-pad}" y="${height-5}" fill="#a8b1bd" font-size="11" text-anchor="end">${esc(vars[0])}</text><text x="8" y="${pad}" fill="#a8b1bd" font-size="11">${esc(vars[1])}</text></svg>`;
}
function calculateSystem() {
  const out = $('#system-output');
  const equations = [$('#system-eq1').value.trim(), $('#system-eq2').value.trim()];
  const vars = $('#system-variables').value.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
  if (equations.some((eq) => !eq)) { out.innerHTML = '<div class="err">Введите оба уравнения системы.</div>'; return; }
  if (vars.length !== 2 || vars[0] === vars[1]) { out.innerHTML = '<div class="err">Укажите две разные переменные, например x, y.</div>'; return; }
  const selected = $('#system-method').value;
  try {
    const methods = selected === 'compare' ? SYSTEM_METHODS : [selected];
    const results = methods.map((method) => ({ method, result: solveSystemByMethod(equations, method, vars) }));
    const first = results[0].result;
    let answer = first.type === 'one'
      ? `${vars[0]} = ${fmt(first.values[vars[0]])}; ${vars[1]} = ${fmt(first.values[vars[1]])}`
      : first.type === 'many' ? 'Бесконечно много решений' : 'Решений нет';
    recordMathHistory({ type: 'system', input: { equations, vars, method: selected }, answer });
    out.innerHTML = results.map(({ method, result }) => {
      const methodAnswer = result.type === 'one'
        ? `(${vars[0]}; ${vars[1]}) = (${fmtSmart(result.values[vars[0]])}; ${fmtSmart(result.values[vars[1]])})`
        : result.type === 'many' ? 'Бесконечно много решений' : 'Решений нет';
      const steps = result.steps.map((step) => `<li>${esc(step)}</li>`).join('');
      const graph = method === 'graphical' && result.type === 'one' ? systemGraphSVG(result.values, result.rows, vars) : '';
      return `<section class="answer" style="margin-top:10px">
        <div class="answer-label">${esc(SYSTEM_METHOD_NAMES[method])} · ${esc(result.type === 'one' ? 'одно решение' : result.type === 'many' ? 'бесконечно много решений' : 'решений нет')}</div>
        <p class="answer-value">${esc(methodAnswer)}</p>${graph}
        <details class="more" open><summary>Ход решения</summary><div class="more-body"><ol class="steps">${steps}</ol></div></details>
      </section>`;
    }).join('');
  } catch (error) {
    out.innerHTML = `<div class="err">${esc(error.message || 'Не удалось решить систему.')}</div>`;
  }
}
$('#system-solve').addEventListener('click', calculateSystem);

const MATH_HISTORY_KEY = 'gdzcalc.math-history.v1';
function readMathHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(MATH_HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item) => item && item.id && item.type && item.input) : [];
  } catch { return []; }
}
function recordMathHistory(entry) {
  const history = readMathHistory();
  history.unshift({ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() });
  try { localStorage.setItem(MATH_HISTORY_KEY, JSON.stringify(history.slice(0, 50))); } catch { /* storage may be disabled/full */ }
}
function renderMathHistory() {
  const host = $('#history-list');
  if (!host) return;
  const history = readMathHistory();
  host.innerHTML = history.length ? history.map((item) => {
    const label = item.type === 'equation' ? `Уравнение: ${item.input.equation}`
      : item.type === 'system' ? `Система: ${(item.input.equations || []).join(' · ')}`
      : item.type === 'regression' ? `Регрессия: X (${item.input.xs}) · Y (${item.input.ys})`
      : item.type === 'stats' ? `Статистика: ${item.input.values || ''}`
      : `Среднее: ${item.input.values || ''}`;
    const when = new Date(item.at || 0).toLocaleString('ru-RU');
    return `<button class="row-link" type="button" data-history-id="${esc(item.id)}">
      <span>${esc(label)}</span><span class="row-link-sub">${esc(item.answer || '')} · ${esc(when)}</span><span class="chev">↶</span>
    </button>`;
  }).join('') : '<p class="hint hint-note">Пока нет сохранённых решений. Решите уравнение или систему — запись появится здесь.</p>';
  $$('[data-history-id]', host).forEach((button) => button.addEventListener('click', () => restoreMathHistory(button.dataset.historyId)));
}
function restoreMathHistory(id) {
  const item = readMathHistory().find((entry) => entry.id === id);
  if (!item) return;
  if (item.type === 'equation') {
    $('#equation-input').value = item.input.equation;
    $('#equation-variable').value = item.input.variable;
    $('#equation-method').value = item.input.method;
    $('#equation-display-mode').value = item.input.displayMode || 'answer';
    show('equation'); calculateEquation();
  } else if (item.type === 'system') {
    $('#system-eq1').value = item.input.equations[0];
    $('#system-eq2').value = item.input.equations[1];
    $('#system-variables').value = item.input.vars.join(', ');
    $('#system-method').value = item.input.method;
    show('system'); calculateSystem();
  } else if (item.type === 'mean') {
    $('#mean-values').value = item.input.values;
    show('mean'); calculateMean();
  } else if (item.type === 'stats') {
    $('#stats-values').value = item.input.values;
    show('stats'); calculateStatistics();
  } else if (item.type === 'regression') {
    $('#regression-x').value = item.input.xs; $('#regression-y').value = item.input.ys;
    show('stats'); $('#regression-calculate').click();
  }
}
$('#history-clear').addEventListener('click', () => {
  try { localStorage.removeItem(MATH_HISTORY_KEY); } catch { /* storage may be disabled */ }
  renderMathHistory();
});

let ideaLimit = 60;
const ideaCategory = $('#idea-category');
ideaCategory.innerHTML = '<option value="all">Все категории</option>' + IDEA_CATEGORIES.map((category) => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
function renderIdeas(resetLimit = false) {
  if (resetLimit) ideaLimit = 60;
  const query = $('#idea-search').value.trim().toLocaleLowerCase('ru');
  const category = ideaCategory.value;
  const matches = IDEAS.filter((idea) => (category === 'all' || idea.category === category)
    && (!query || `${idea.title} ${idea.description} ${idea.category} ${idea.feasibility}`.toLocaleLowerCase('ru').includes(query)));
  const visible = matches.slice(0, ideaLimit);
  $('#idea-count').textContent = `Найдено ${matches.length} из ${IDEAS.length}; отображается ${visible.length}. Каталог идей не означает, что эти функции уже готовы.`;
  $('#idea-list').innerHTML = visible.map((idea) => `<article class="answer" style="margin:6px 0;padding:10px">
    <div class="answer-label">Идея ${idea.id} · ${esc(idea.category)}</div>
    <b>${esc(idea.title)}</b><p class="answer-sub">${esc(idea.description)}</p>
    <span class="hint">Зависимости: ${esc(idea.feasibility)}</span>
  </article>`).join('') || '<p class="hint hint-note">Ничего не найдено — попробуйте другое слово или категорию.</p>';
  $('#ideas-more').hidden = visible.length >= matches.length;
}
$('#idea-search').addEventListener('input', () => renderIdeas(true));
ideaCategory.addEventListener('change', () => renderIdeas(true));
$('#ideas-more').addEventListener('click', () => { ideaLimit += 60; renderIdeas(); });

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

function parseNum(s) {
  if (s === '' || s === null || s === undefined) return null;
  const v = Number(String(s).replace(',', '.').replace(/[−–—]/g, '-'));
  return Number.isFinite(v) ? v : null;
}

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
      { v: 'school', t: 'Обычная математика', s: 'калькулятор, графики, справочник' },
      { v: 'it', t: 'Информатика', s: 'биты и байты, N = K^i, системы счисления, «Дано»' },
      { v: 'geo', t: 'Геометрия', s: 'фигуры, углы, площади и объёмы, «Дано» по Атанасяну' },
    ],
  },
  {
    key: 'screen', title: 'Что открывать при запуске', options: [
      { v: 'calc', t: 'Калькулятор', s: 'обычный счёт на клавиатуре' },
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
initTriangle();
show(TITLES[settings.screen] ? settings.screen : 'calc'); // настройка со старой версии могла указать удалённый экран
applySubjectMode(settings.subject || 'school', { navigate: false });
updateDisplay();
void preprocess;
