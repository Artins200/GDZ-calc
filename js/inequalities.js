/* =========================================================================
 * inequalities.js — решение неравенств (парсер, не нейросеть)
 *
 * Что умеет:
 *   • линейные:            3x − 7 < 5x + 1
 *   • двойные:             −2 ⩽ 4 − 2x ⩽ 6
 *   • с переменной справа: 5 > x, 2 ⩽ 3 − x
 *   • с модулем:           |x − 2| ⩽ 5, |2x + 1| > 3
 *   • с дробями:           (x + 3)/2 ⩾ (2x − 1)/3
 *   • системы:             2x + 1 > 5; 3x − 4 ⩽ 8
 *   • пересечение / объединение / разность промежутков
 *
 * Решение линейного неравенства находится точно (через два значения функции),
 * поэтому скобки, дроби и подобные слагаемые раскрываются сами — как в тетради.
 * Ответ возвращается объектом промежутка из intervals.js, чтобы его можно было
 * и напечатать, и нарисовать на числовой прямой.
 * ========================================================================= */
import { fmt, preprocess, evaluate, asFraction } from './mathcore.js';
import { parseInterval, intersect, union } from './intervals.js';

const EPS = 1e-9;

/* ------------------------------------------------------------ переменные */
/** Как называется переменная: x, y, a… (по умолчанию x). */
export function detectVariable(raw) {
  const s = String(raw ?? '');
  const latin = s.match(/(^|[^A-Za-zА-Яа-я])([a-z])(?![A-Za-z])/gi) || [];
  for (const m of latin) {
    const v = m.slice(-1).toLowerCase();
    if (!'epi'.includes(v) || v === 'x') return v;
  }
  const cyr = s.match(/(^|[^А-Яа-я])([а-я])(?![А-Яа-я])/i);
  return cyr ? cyr[2].toLowerCase() : 'x';
}

/* --------------------------------------------------------------- разбор */
const OPS = ['<=', '>=', '<', '>'];

/** Приводит учебную запись к машинной: ≤ → <=, − → -, |x| → abs(x). */
export function normalizeIneq(raw) {
  let s = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/[∣❘｜]/g, '|')
    .replace(/[≤⩽]/g, '<=')
    .replace(/[≥⩾]/g, '>=')
    .replace(/\\le(?![a-z])/g, '<=')
    .replace(/\\ge(?![a-z])/g, '>=')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/[×∙⋅·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // |...| → abs(...): парные вертикальные черты
  let guard = 0;
  while (s.includes('|') && guard++ < 20) {
    const a = s.indexOf('|');
    const b = s.indexOf('|', a + 1);
    if (b === -1) break;
    s = `${s.slice(0, a)}abs(${s.slice(a + 1, b)})${s.slice(b + 1)}`;
  }
  return s;
}

/**
 * Разбирает строку на части.
 * @returns {{kind:'single'|'double'|'system'|'error', sides?:Array, ops?:Array,
 *            parts?:Array<{sides:Array,ops:Array}>, variable:string, error?:string}}
 */
export function parseInequalityInput(raw) {
  const original = String(raw ?? '').trim();
  if (!original) return { kind: 'error', error: 'Введите неравенство, например 3x − 7 < 5x + 1' };
  const text = normalizeInequalityText(original);
  const variable = detectVariable(text);

  // Система: части разделены «;», переводом строки, «и», «,» между неравенствами.
  const chunks = text
    .split(/\s*(?:;|\n|\r|,\s*(?=[^,]*[<>=])|\s+и\s+(?=[^<>=]*[<>=]))\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

  const parsedChunks = chunks.map(parseChain);
  const bad = parsedChunks.find((c) => c.error);
  if (bad) return { kind: 'error', error: bad.error };

  if (parsedChunks.length > 1) {
    return { kind: 'system', parts: parsedChunks, variable };
  }
  const one = parsedChunks[0];
  if (!one) return { kind: 'error', error: 'Не удалось разобрать запись' };
  if (one.ops.length === 2) return { kind: 'double', sides: one.sides, ops: one.ops, variable };
  return { kind: 'single', sides: one.sides, ops: one.ops, variable };
}

/** Текст без «Реши неравенство:» и нумерации списка. */
function normalizeInequalityText(raw) {
  let s = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/^\s*\d{1,2}\s*[.)]\s+/, '')                 // «1.  », «2)  »
    .replace(/реши(те)?\s+(двойное\s+|линейное\s+)?неравенство[^:]*:?/gi, '')
    .replace(/найди(те)?[^:]*:\s*/gi, '')
    .replace(/запиши(те)?[^:]*:?\s*/gi, '')
    .replace(/[{}]/g, ' ')
    .trim();

  // Текст из PDF приходит «по одной букве на строку». Оставляем только
  // математические строки (подписи вида «Неравенство с дробью:» отбрасываем).
  // Строка считается «математической», если это число, переменная или знак;
  // подписи со словами («Неравенство с дробью:») отбрасываются.
  const isMathLine = (l) => !/[a-zA-Zа-яА-Я]{2,}/.test(l) || /[\d<>=⩽⩾≤≥]/.test(l);
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean).filter(isMathLine);
  if (lines.length <= 1) return lines[0] || s;

  const hasComparator = (t) => /[<>=⩽⩾≤≥]/.test(t);
  const OPS = /^[+\-*/^×÷=<>⩽⩾≤≥]$/;
  const isNum = (t) => /^\d{1,4}$/.test(t);

  // Один проход: копим текущее неравенство, а на «два числа подряд» начинаем новое.
  const parts = [];
  let cur = lines[0];
  let seenComparator = hasComparator(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const line = lines[i];
    const cut = isNum(prev) && isNum(line) && seenComparator && prev.length <= 3 && line.length <= 3;
    if (cut) {
      parts.push(cur);
      cur = line;
      seenComparator = false;
    } else {
      cur += line;
    }
    if (hasComparator(line)) seenComparator = true;
  }
  if (cur) parts.push(cur);
  void OPS;
  return parts.join('\n');
}

/** Одна цепочка «a < b» или «a < b < c». */
function parseChain(chunk) {
  const text = normalizeIneq(normalizeInequalityText(chunk)).replace(/\n/g, ' ');
  const res = splitByOperators(text);
  if (res.error) return { error: res.error };
  const { sides, ops } = res;

  // Если переменной нет слева, но есть справа (5 > x) — решаем как обычно,
  // а на печати развернём. Если переменной нет вообще — это проверка числа.
  return { sides: sides.map(cleanSide), ops };
}

/** Делит строку по знакам сравнения, не заглядывая внутрь скобок. */
export function splitByOperators(text) {
  const sides = [];
  const ops = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0) {
      const two = text.slice(i, i + 2);
      if (two === '<=' || two === '>=') {
        sides.push(buf); ops.push(two); buf = ''; i++; continue;
      }
      if (ch === '<' || ch === '>') {
        // «=<» и «=>» — опечатка, считаем как есть
        sides.push(buf); ops.push(ch); buf = ''; continue;
      }
    }
    buf += ch;
  }
  sides.push(buf);
  const clean = sides.map((s) => s.trim());
  if (clean.some((s) => !s)) return { error: 'В неравенстве не хватает числа или выражения' };
  if (ops.length === 0) return { error: 'В записи нет знака сравнения. Примеры: 3x − 7 < 5x + 1, −2 ⩽ 4 − 2x ⩽ 6, |x − 2| ⩽ 5' };
  if (ops.length > 2) return { error: 'Слишком много знаков сравнения — проверьте запись' };
  return { sides: clean, ops };
}

function cleanSide(s) {
  return String(s).replace(/^\s*[.:]\s*/, '').replace(/\s+/g, ' ').trim();
}

/** Грубая проверка, что выражение вообще похоже на математическое. */
function looksLikeMath(expr) {
  const t = String(expr).trim();
  if (!t) return false;
  if (!/^[-+*/^().\d\s×÷−+a-zA-Zа-яА-Я_√|,]*$/.test(t)) return false;
  // «x», «y», «2x + 1», «5» — нормально; «кот» — нет (это слово, а не переменная)
  if (/[\d]/.test(t)) return true;
  return /^[a-zA-Zа-яА-Я]$/.test(t);
}

/* ------------------------------------------------------- линейная часть */
/** Значение выражения при данном x (без eval, через mathcore). */
function makeFn(expr, variable) {
  const src = toMachine(expr, variable);
  // Единственная переменная заменяется на x, чтобы mathcore точно её узнал.
  const code = variable === 'x' ? src : src.replace(new RegExp(`\\b${variable}\\b`, 'g'), 'x');
  return (x) => evaluate(code, { x });
}

export function toMachine(expr, variable = 'x') {
  let s = normalizeIneq(expr);
  s = preprocess(s);
  // «3x» уже понимается, но «x3» и «2x» после preprocess остаются как есть
  s = s.replace(/\b([a-z])(\d)/gi, '$1*$2');
  return s;
}

/** Коэффициенты A·x + B для линейного выражения. */
export function linearCoefficients(expr, variable = 'x') {
  const f = makeFn(expr, variable);
  const b = f(0);
  const a = f(1) - b;
  const f2 = f(2);
  const linear = Math.abs(f2 - (a * 2 + b)) < 1e-6 * (1 + Math.abs(a) + Math.abs(b));
  return { a, b, linear, f };
}

/* ------------------------------------------------------------ решение */
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };
const OPPOSITE = (op) => FLIP[op];

function toIntervalLike(left, right) {
  return { left, right };
}

/** Рациональное представление числа: {n, d} или null. */
export function toRat(v, maxDen = 1000) {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v - Math.round(v)) < 1e-10) return { n: Math.round(v), d: 1 };
  const f = asFraction(v, maxDen);
  return f ? { n: f.num, d: f.den } : null;
}
const ratValue = (r) => (r ? r.n / r.d : NaN);
function gcdInt(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }
function lcmInt(x, y) { return Math.abs(x * y) / (gcdInt(x, y) || 1); }
/** Дробь для печати: «−11» или «11/3» (со знаком минус перед дробью). */
export function ratText(r) {
  if (!r) return '—';
  let { n, d } = r;
  if (d < 0) { n = -n; d = -d; }
  const g = gcdInt(Math.abs(n), d) || 1;
  n /= g; d /= g;
  if (d === 1) return num(n);
  return `${n < 0 ? '−' : ''}${Math.abs(n)}/${d}`;
}

/** Решает одиночное неравенство L op R относительно x. */
export function solveSingle(left, op, right, variable = 'x') {
  // Модуль — отдельный случай, «линейно» здесь нельзя
  if (/abs\s*\(/.test(`${left} ${right}`)) {
    const inner = `${left} ${right}`.match(/abs\s*\(([^()]*)\)/);
    if (!inner) return { error: 'Не разобрал выражение под модулем' };
    return solveAbsolute(inner[1], op, right.replace(/abs\s*\([^()]*\)/, '').trim() || left.replace(/abs\s*\([^()]*\)/, '').trim(), variable);
  }
  const diff = linearCoefficients(`(${left}) - (${right})`, variable);
  if (!diff.linear) {
    return { error: 'Это неравенство не линейное — в приложении решаются линейные, двойные, с модулем, дробями и системы.' };
  }
  const L = linearCoefficients(`(${left})`, variable);
  const R = linearCoefficients(`(${right})`, variable);
  const steps = [`${prettySide(left)} ${opText(op)} ${prettySide(right)}`];

  // x сократился — остаётся проверить число
  if (Math.abs(diff.a) < EPS) {
    const truth = compare(diff.b, 0, op);
    steps.push(`Слагаемые с ${variable} сократились: ${num(diff.b)} ${opText(op)} 0.`);
    steps.push(truth ? `Это верно при любом ${variable} — решений бесконечно много.` : 'Это неверно — решений нет.');
    return { type: truth ? 'any' : 'none', variable, steps, intervals: truth ? [parseInterval('(-inf; +inf)')] : [] };
  }

  // Приводим к целым коэффициентам, если в условии были дроби
  const rats = [L.a, L.b, R.a, R.b].map((v) => toRat(v));
  let a = L.a - R.a, b = L.b - R.b;
  if (rats.every(Boolean)) {
    const D = rats.reduce((acc, r) => lcmInt(acc, r.d), 1);
    if (D > 1 && D <= 360) {
      const [la, lb, ra, rb] = rats.map((r) => ({ n: r.n * (D / r.d), d: 1 }));
      steps.push(`Умножим обе части на ${D} — дроби уйдут:`);
      steps.push(`${linearText(ratValue(la), ratValue(lb), variable)} ${opText(op)} ${linearText(ratValue(ra), ratValue(rb), variable)}`);
      a = ratValue(la) - ratValue(ra);
      b = ratValue(lb) - ratValue(rb);
    }
  }

  steps.push(`Перенесём всё с ${variable} влево, числа вправо: ${linearText(a, 0, variable)} ${opText(op)} ${num(-b)}`);

  const flipped = a < 0;
  const finalOp = flipped ? OPPOSITE(op) : op;
  const aR = toRat(a), bR = toRat(b);
  const boundRat = aR && bR ? { n: -bR.n * aR.d, d: bR.d * aR.n } : null;
  const bound = -b / a;
  const boundText = boundRat ? ratText(boundRat) : num(bound);

  if (Math.abs(a - 1) > EPS) {
    steps.push(`Разделим обе части на ${num(a)}${flipped ? ' — знак неравенства меняется на противоположный' : ''}: ${variable} ${opText(finalOp)} ${boundText}`);
  } else {
    steps.push(`Ответ: ${variable} ${opText(finalOp)} ${boundText}`);
  }

  const strict = finalOp === '<' || finalOp === '>';
  const toRight = finalOp === '>' || finalOp === '>=';
  const iv = toRight
    ? parseInterval(`${strict ? '(' : '['}${fmtPlain(bound)}; +inf)`)
    : parseInterval(`(-inf; ${fmtPlain(bound)}${strict ? ')' : ']'}`);
  return {
    type: 'interval', variable, steps, intervals: [iv],
    bound, direction: toRight ? 'right' : 'left', strict, left, right, op, exactBound: boundText,
  };
}

const fmtPlain = (n) => String(fmt(n)).replace(',', '.');
/** Число для показа: с типографским минусом. */
const num = (n) => fmt(n).replace(/-/g, '−');
const opText = (op) => ({ '<': '<', '>': '>', '<=': '⩽', '>=': '⩾' }[op] || op);

function compare(a, b, op) {
  if (op === '<') return a < b;
  if (op === '>') return a > b;
  if (op === '<=') return a <= b;
  return a >= b;
}

/** «5x − 7» — как в тетради, без лишних плюсов. */
export function linearText(a, b, variable = 'x') {
  const parts = [];
  if (Math.abs(a) > EPS) {
    const coef = Math.abs(a - 1) < EPS ? '' : (Math.abs(a + 1) < EPS ? '−' : num(a));
    parts.push(`${coef}${variable}`);
  }
  if (Math.abs(b) > EPS || parts.length === 0) {
    if (parts.length && b > 0) parts.push(`+ ${num(b)}`);
    else if (parts.length) parts.push(`− ${num(Math.abs(b))}`);
    else parts.push(num(b));
  }
  return parts.join(' ');
}

/** Красивая запись исходной стороны: 3x − 7, (x + 3)/2 → x + 3⁄2 */
export function prettySide(side) {
  const s = normalizeIneq(side)
    .replace(/\s+/g, ' ')
    .replace(/\*/g, ' · ')
    .replace(/\//g, ' ⁄ ')
    .trim();
  return s.replace(/(^|[^0-9A-Za-zА-Яа-я])-/g, '$1−');
}

/* ------------------------------------------------------- двойное и система */
export function solveDouble(sides, ops, variable = 'x') {
  const [L, M, R] = sides;
  const parts = [
    { sides: [L, M], ops: [ops[0]] },
    { sides: [M, R], ops: [ops[1]] },
  ].map((p) => solveSingle(p.sides[0], p.ops[0], p.sides[1], variable));

  const bad = parts.find((p) => p.error);
  if (bad) return { error: bad.error };

  const steps = [
    `Двойное неравенство: ${prettySide(L)} ${opText(ops[0])} ${prettySide(M)} ${opText(ops[1])} ${prettySide(R)}`,
    `Решаем как два неравенства с общим числом ${prettySide(M).replace(/[−-]?\s*$/, '')}`,
  ];
  parts.forEach((p, i) => {
    steps.push(`${i + 1}) ${p.steps[0]}  →  ${p.steps[p.steps.length - 1]}`);
  });

  if (parts.some((p) => p.type === 'none')) {
    return { type: 'none', variable, steps: [...steps, 'Одно из неравенств не имеет решений — решений нет.'], intervals: [] };
  }
  if (parts.some((p) => p.type === 'any')) {
    const other = parts.find((p) => p.type === 'interval');
    return { type: 'interval', variable, steps, intervals: other ? other.intervals : [parseInterval('(-inf; +inf)')] };
  }
  const cross = intersect(parts[0].intervals[0], parts[1].intervals[0]);
  if (!cross) {
    steps.push('Общей части у двух условий нет — решений нет.');
    return { type: 'none', variable, steps, intervals: [] };
  }
  steps.push(`Общая часть: ${cross.notation}`);
  return { type: 'interval', variable, steps, intervals: [cross], parts };
}

export function solveSystem(partsIn, variable = 'x') {
  const steps = ['Система неравенств — берём общую часть всех решений.'];
  const results = [];
  partsIn.forEach((p, idx) => {
    const r = p.ops.length === 2
      ? solveDouble(p.sides, p.ops, variable)
      : solveSingle(p.sides[0], p.ops[0], p.sides[1], variable);
    results.push(r);
    if (r.error) return;
    const label = `${idx + 1}) ${r.steps[0]}`;
    steps.push(label);
    if (r.type === 'none') steps.push('   решений нет');
    else if (r.type === 'any') steps.push('   x — любое число');
    else steps.push(`   ${r.intervals.map((iv) => iv.notation).join(' ∪ ')}`);
  });
  const bad = results.find((r) => r.error);
  if (bad) return { error: bad.error };
  if (results.some((r) => r.type === 'none')) {
    steps.push('Одно из неравенств не имеет решений, значит вся система решений не имеет.');
    return { type: 'none', variable, steps, intervals: [], results };
  }
  const lists = results.map((r) => (r.type === 'any' ? [parseInterval('(-inf; +inf)')] : r.intervals));
  let acc = lists[0];
  for (let i = 1; i < lists.length; i++) {
    const next = [];
    for (const a of acc) for (const b of lists[i]) {
      const c = intersect(a, b);
      if (c) next.push(c);
    }
    acc = next;
    if (!acc.length) break;
  }
  if (!acc.length) {
    steps.push('Общей части нет — решений нет.');
    return { type: 'none', variable, steps, intervals: [], results };
  }
  steps.push(`Ответ: ${acc.map((iv) => iv.notation).join(' ∪ ')}`);
  return { type: 'interval', variable, steps, intervals: acc, results };
}

/* ----------------------------------------------------------- с модулем */
/**
 * |A| op C, где A линейно зависит от x, C — число.
 * Возвращает объединение промежутков.
 */
export function solveAbsolute(innerText, op, rightText, variable = 'x') {
  const inner = linearCoefficients(innerText, variable);
  const rhs = Number(makeFn(rightText, variable)(0));
  const pretty = `|${prettySide(innerText)}| ${opText(op)} ${num(rhs)}`;
  const steps = [pretty];

  if (!inner.linear) return { error: 'Выражение под модулем должно быть линейным' };
  if (!Number.isFinite(rhs)) return { error: 'Справа должно быть число' };

  if (rhs < 0) {
    steps.push('Модуль не бывает отрицательным, поэтому такое неравенство неверно при любом x.');
    return { type: 'none', variable, steps, intervals: [] };
  }
  if (Math.abs(rhs) < EPS) {
    // |A| < 0 — нет решений; |A| ⩽ 0 — A = 0; |A| > 0 — все, кроме корня
    if (op === '<') { steps.push('Модуль меньше нуля быть не может — решений нет.'); return { type: 'none', variable, steps, intervals: [] }; }
    if (op === '<=') {
      const root = solveSingle(`(${innerText})`, '>=', '0', variable);
      const root2 = solveSingle(`(${innerText})`, '<=', '0', variable);
      const one = root.bound !== undefined ? root.bound : 0;
      const pt = parseInterval(`[${fmtPlain(one)}; ${fmtPlain(one)}]`);
      steps.push('Модуль не больше нуля только тогда, когда выражение равно нулю.');
      steps.push(`Ответ: x = ${num(one)}`);
      return { type: 'interval', variable, steps, intervals: [pt], absolute: true };
    }
  }

  if (op === '<' || op === '<=') {
    const strict = op === '<' ? '<' : '<=';
    steps.push(`Модуль меньше числа — значит выражение заключено между −${num(rhs)} и ${num(rhs)}.`);
    steps.push(`Получаем двойное неравенство: −${num(rhs)} ${opText(strict)} ${prettySide(innerText)} ${opText(strict)} ${num(rhs)}`);
    const res = solveDouble([String(-rhs), `(${innerText})`, String(rhs)], [strict, strict], variable);
    if (res.error) return res;
    if (res.type === 'none') {
      steps.push('Общей части нет — решений нет.');
      return { type: 'none', variable, steps, intervals: [], absolute: true };
    }
    steps.push(`Вычтем (или прибавим) свободный член и разделим на коэффициент при x.`);
    steps.push(`Ответ: ${res.intervals.map((iv) => iv.notation).join(' ∪ ')}`);
    return { type: 'interval', variable, intervals: res.intervals, steps, absolute: true };
  }

  // |A| > C или ⩾ C — два луча
  const strict = op === '>' ? '>' : '>=';
  steps.push(`Модуль больше числа — распадается на два случая.`);
  const r1 = solveSingle(`(${innerText})`, strict, String(rhs), variable);
  const r2 = solveSingle(`(${innerText})`, OPPOSITE(strict), String(-rhs), variable);
  if (r1.error) return r1;
  if (r2.error) return r2;
  steps.push(`Случай 1: ${prettySide(innerText)} ${opText(strict)} ${num(rhs)}  →  ${r1.intervals.map((iv) => iv.notation).join(' ∪ ')}`);
  steps.push(`Случай 2: ${prettySide(innerText)} ${opText(OPPOSITE(strict))} −${num(rhs)}  →  ${r2.intervals.map((iv) => iv.notation).join(' ∪ ')}`);
  const all = [...r1.intervals, ...r2.intervals].sort((p, q) => leftVal(p) - leftVal(q));
  const merged = all.reduce((acc, iv) => {
    if (!acc.length) return [iv];
    const u = union(acc[acc.length - 1], iv);
    if (u.length === 1) return [...acc.slice(0, -1), u[0]];
    return [...acc, iv];
  }, []);
  steps.push(`Ответ: ${merged.map((iv) => iv.notation).join(' ∪ ')}`);
  return { type: 'interval', variable, intervals: merged, steps, absolute: true };
}

const leftVal = (iv) => (iv.left.value === null ? -Infinity : iv.left.value);

/* ------------------------------------------------------------- операции */
/** Дополнительные операции над промежутками: A ∩ B, A ∪ B, A \ B. */
export function solveIntervalOp(raw) {
  const src = String(raw ?? '').replace(/[−–—]/g, '-');
  const text = src.replace(/\s+/g, ' ').trim();

  // «A ∩ B», «A∪B», «A \ B», «пересечение A и B», «объединение A и B»
  let m = text.match(/([A-Za-zА-Яа-я])\s*(∩|∪|\\|\/\s*[A-Za-zА-Яа-я]\s*\u2216)\s*([A-Za-zА-Яа-я])/);
  let sign = m && m[2];
  let nameA = m && m[1];
  let nameB = m && m[3];
  if (!m) {
    const word = text.match(/(пересечени\w*|объединени\w*|разност\w*)[^A-Za-zА-Яа-я]*([A-Za-zА-Яа-я])[^A-Za-zА-Яа-я]+([A-Za-zА-Яа-я])/i);
    if (word) {
      sign = /пересеч/i.test(word[1]) ? '∩' : /объедин/i.test(word[1]) ? '∪' : '\\';
      nameA = word[2]; nameB = word[3];
    }
  }
  if (!sign) return { error: 'Напишите, что найти: например «A ∩ B», «A ∪ B» или «A \\ B»' };

  const A = readSet(src, nameA);
  const B = readSet(src, nameB);
  if (!A) return { error: `Не нашёл промежуток ${nameA}. Пример записи: ${nameA} = [−3; 4)` };
  if (!B) return { error: `Не нашёл промежуток ${nameB}. Пример записи: ${nameB} = (1; 7]` };
  if (A.error) return A;
  if (B.error) return B;

  const show = (iv) => iv.notation.replace(/-/g, '−').replace(/inf/g, '∞');
  const head = [`${nameA} = ${show(A)}`, `${nameB} = ${show(B)}`];

  if (sign === '∩') {
    const c = intersect(A, B);
    return c
      ? { kind: 'intersect', title: 'Пересечение', answer: [c], A, B, steps: [...head, `${nameA} ∩ ${nameB} = ${show(c)} — общая часть обоих промежутков.`] }
      : { kind: 'intersect', title: 'Пересечение', answer: [], A, B, steps: [...head, 'Общих точек нет: пересечение пусто (∅).'] };
  }
  if (sign === '∪') {
    const u = union(A, B);
    return { kind: 'union', title: 'Объединение', answer: u, A, B, steps: [...head, `${nameA} ∪ ${nameB} = ${u.map(show).join(' ∪ ')} — всё, что входит хотя бы в один промежуток.`] };
  }
  const d = difference(A, B);
  const backslash = '\\';
  return {
    kind: 'difference', title: 'Разность', answer: d, A, B,
    steps: [...head, `${nameA} ${backslash} ${nameB} = ${d.length ? d.map(show).join(' ∪ ') : '∅'} — берём точки ${nameA}, выкидывая попавшие в ${nameB}.`],
  };
}

/** Ищет в тексте запись «A = [−3; 4)» и разбирает её. */
function readSet(src, name) {
  const re = new RegExp(`(?:^|[^A-Za-zА-Яа-я])${name}\\s*=\\s*([\\[(]\\s*[^\\n]*?[\\])])`, 'i');
  const hit = String(src).match(re);
  if (!hit) return null;
  const parsed = parseInterval(hit[1].replace(/\s+/g, ''));
  if (parsed?.error) return parsed;
  return parsed;
}

/** A \\ B — точки A, не попавшие в B. */
export function difference(A, B) {
  if (!A?.left || !B?.left) return [];
  if (B.left.value === null && B.right.value === null) return [];
  const cuts = [];
  if (B.left.value !== null) cuts.push({ v: B.left.value, keepLeft: null });
  if (B.right.value !== null) cuts.push({ v: B.right.value, keepLeft: true });

  // собираем границы A и B, режем на куски и проверяем середины
  const bounds = new Set();
  for (const p of [A.left.value, A.right.value, B.left.value, B.right.value]) if (p !== null) bounds.add(p);
  const sorted = [...bounds].sort((a, b) => a - b);

  const pieces = [];
  const addPiece = (l, r) => {
    const L = l === null ? { value: null, closed: false } : l;
    const R = r === null ? { value: null, closed: false } : r;
    if (L.value !== null && R.value !== null && L.value >= R.value) return;
    const mid = L.value === null ? (R.value === null ? 0 : R.value - 1)
      : (R.value === null ? L.value + 1 : (L.value + R.value) / 2);
    const inA = parseInterval(buildNotation(L, R)).contains(mid);
    const inB = B.contains(mid);
    if (inA && !inB) pieces.push({ L, R });
  };
  // крайние лучи
  const first = A.left.value === null ? null : { value: A.left.value, closed: A.left.closed };
  if (A.left.value === null) addPiece(null, sorted.length ? { value: sorted[0], closed: false } : A.right);
  for (let i = 0; i < sorted.length - 1; i++) {
    const l = { value: sorted[i], closed: false };
    const r = { value: sorted[i + 1], closed: false };
    addPiece(l, r);
  }
  if (A.right.value === null) {
    const last = sorted[sorted.length - 1];
    addPiece(last === undefined ? null : { value: last, closed: false }, null);
  }

  // склеиваем соседние куски и восстанавливаем «закрытость» краёв A
  const merged = [];
  for (const p of pieces) {
    const L = p.L.value === null ? p.L : { value: p.L.value, closed: sameAsA(p.L) };
    const R = p.R.value === null ? p.R : { value: p.R.value, closed: sameAsA(p.R) };
    const iv = parseInterval(buildNotation(L, R));
    if (iv && !iv.error) merged.push(iv);
  }
  return merged;

  function sameAsA(pt) {
    if (pt.value === null) return false;
    if (A.left.value === pt.value && A.left.closed) return true;
    if (A.right.value === pt.value && A.right.closed) return true;
    return false;
  }
}

function buildNotation(L, R) {
  const left = L.value === null ? '(-inf' : `${L.closed ? '[' : '('}${fmtPlain(L.value)}`;
  const right = R.value === null ? '+inf)' : `${fmtPlain(R.value)}${R.closed ? ']' : ')'}`;
  return `${left}; ${right}`;
}

/* -------------------------------------------------- точка останова для теста */
/** Главная точка входа: решает любую запись и возвращает единый результат. */
export function solveInequality(raw) {
  const original = String(raw ?? '').trim();
  const norm = normalizeIneq(original);
  const variable = detectVariable(normalizeInequalityText(original));

  // 1) Операции над промежутками: A ∩ B, A ∪ B, A \ B
  if (/∩|∪|\\/.test(original) && /[A-Za-zА-Яа-я]\s*=/.test(original)) {
    const op = solveIntervalOp(original);
    if (!op.error) {
      return {
        kind: 'intervalOp', variable, title: op.kind,
        intervals: op.answer, steps: op.steps,
        answerText: op.answer.length ? op.answer.map((iv) => iv.notation).join(' ∪ ') : '∅',
        A: op.A, B: op.B, op: op.kind,
      };
    }
    return { error: op.error };
  }

  // 2) Модуль: |...| op число
  const absMatch = normalizeIneq(normalizeInequalityText(original))
    .match(/abs\(([^()]+)\)\s*(<=|>=|<|>)\s*([^<>=]+)$/);
  if (absMatch) {
    const r = solveAbsolute(absMatch[1], absMatch[2], absMatch[3], variable);
    if (r.error) return r;
    return finalize(r, original);
  }

  // 3) Обычная запись
  const parsed = parseInequalityInput(original);
  if (parsed.kind === 'error') return { error: parsed.error };
  const sides = parsed.kind === 'system' ? parsed.parts.flatMap((p) => p.sides) : parsed.sides;
  if (!sides.every(looksLikeMath)) {
    return { error: 'В выражении есть лишние слова. Оставьте только числа, переменную и знаки действий.' };
  }
  let r;
  if (parsed.kind === 'double') r = solveDouble(parsed.sides, parsed.ops, parsed.variable);
  else if (parsed.kind === 'system') r = solveSystem(parsed.parts, parsed.variable);
  else r = solveSingle(parsed.sides[0], parsed.ops[0], parsed.sides[1], parsed.variable);
  if (r?.error) return r;
  if (!r) return { error: 'Не получилось разобрать запись — проверьте числа и знаки.' };
  return finalize(r, original, parsed);
}

function finalize(r, original, parsed) {
  const intervals = r.intervals || [];
  const answerText = r.type === 'none' ? 'нет решений'
    : intervals.length === 0 ? 'x — любое число'
      : intervals.map((iv) => iv.notation).join(' ∪ ');
  const inequalityText = intervals.length === 1 ? intervals[0].inequality
    : intervals.length > 1 ? intervals.map((iv) => iv.inequality).join(' или ')
      : (r.type === 'none' ? 'решений нет' : 'x — любое число');
  return {
    kind: r.type === 'none' ? 'none' : (r.type === 'any' ? 'any' : 'interval'),
    input: String(original).trim(),
    variable: r.variable || 'x',
    intervals,
    answerText,
    inequalityText,
    steps: r.steps || [],
    absolute: !!r.absolute,
    parts: r.parts || r.results || null,
    kindOfInput: parsed?.kind || 'single',
  };
}

/* ------------------------------------------------------- «в столбик» */
/**
 * Сложение, вычитание и умножение «в столбик» для обычного калькулятора.
 * Возвращает { lines, value }: lines — готовые строки одинаковой ширины,
 * их печатают моноширинным шрифтом. null — если запись не имеет смысла.
 */
export function longArithmetic(a, b, op) {
  const A = Number(a), B = Number(b);
  if (!Number.isFinite(A) || !Number.isFinite(B)) return null;

  if (op === '+') {
    if (A < 0 && B < 0) {
      const r = addColumns(Math.abs(A), Math.abs(B));
      return { ...r, lines: ['оба числа со знаком минус — складываем модули', ...r.lines, `= −${r.value}`], value: -(Math.abs(A) + Math.abs(B)) };
    }
    if (A < 0 || B < 0) {
      const big = Math.abs(A) >= Math.abs(B) ? Math.abs(A) : Math.abs(B);
      const small = Math.abs(A) >= Math.abs(B) ? Math.abs(B) : Math.abs(A);
      const neg = Math.abs(A) >= Math.abs(B) ? A < 0 : B < 0;
      const r = subColumns(big, small);
      return { value: (neg ? -1 : 1) * r.value, lines: [`из большего модуля вычитаем меньший`, ...r.lines, `= ${neg ? '−' : ''}${fmtPretty(r.value)}`] };
    }
    return addColumns(A, B);
  }

  if (op === '-') {
    if (B < 0) return longArithmetic(A, Math.abs(B), '+');
    if (A < 0) {
      const r = addColumns(Math.abs(A), B);
      return { value: A - B, lines: ['к отрицательному числу прибавляем −b', ...r.lines, `= −${fmtPretty(r.value)}`] };
    }
    if (A >= B) return subColumns(A, B);
    const r = subColumns(B, A);
    return { value: A - B, lines: ['вычитаем из большего меньшее, результат отрицательный', ...r.lines, `= −${fmtPretty(r.value)}`] };
  }

  if (op === '*') return mulColumns(A, B);
  return null;
}

const fmtPretty = (n) => fmt(Math.abs(n) < 1e-12 ? 0 : n);

/** Разбивает число на целую и дробную части (строками). */
function parts(n) {
  const s = Math.abs(n).toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
  const [i, f = ''] = s.split('.');
  return { i: i || '0', f };
}

/** Дописывает нули, чтобы у чисел была одинаковая дробная часть, и склеивает. */
function aligned(a, b) {
  const pa = parts(a), pb = parts(b);
  const dec = Math.max(pa.f.length, pb.f.length);
  const A = Number(pa.i + pa.f.padEnd(dec, '0'));
  const B = Number(pb.i + pb.f.padEnd(dec, '0'));
  return { A, B, dec, sa: put(pa.i, pa.f, dec), sb: put(pb.i, pb.f, dec) };
}
function put(i, f, dec) {
  return dec ? `${i}.${f.padEnd(dec, '0')}` : i;
}

function addColumns(a, b) {
  const { A, B, dec } = aligned(a, b);
  const sum = A + B;
  const lines = [put(parts(a).i, parts(a).f, dec), put(parts(b).i, parts(b).f, dec)];
  const w = Math.max(...lines.map((l) => l.length), String(sum).length) + 1;
  const out = [
    lines[0].padStart(w),
    `+${lines[1]}`.padStart(w),
    '─'.repeat(w),
    insertPoint(String(sum), dec).padStart(w),
  ];
  return { lines: out, value: a + b };
}

function subColumns(a, b) {
  const { A, B, dec } = aligned(a, b);
  const res = A - B;
  const lines = [`−${put(parts(b).i, parts(b).f, dec)}`.padStart(put(parts(a).i, parts(a).f, dec).length), ];
  const w = Math.max(put(parts(a).i, parts(a).f, dec).length, put(parts(b).i, parts(b).f, dec).length, String(res).length) + 1;
  return {
    value: a - b,
    lines: [
      put(parts(a).i, parts(a).f, dec).padStart(w),
      `−${put(parts(b).i, parts(b).f, dec)}`.padStart(w),
      '─'.repeat(w),
      insertPoint(String(res), dec).padStart(w),
    ],
  };
  void lines;
}

function mulColumns(a, b) {
  const A = Math.abs(a), B = Math.abs(b);
  const pa = parts(A), pb = parts(B);
  const dec = pa.f.length + pb.f.length;
  const ai = pa.i + pa.f;
  const bi = pb.i + pb.f;
  if (ai.length * bi.length > 400) return null;
  const value = Number(ai) * Number(bi);
  const width = Math.max(ai.length + bi.length, insertPoint(String(value), dec).length) + 1;
  const lines = [ai.padStart(width), `×${bi}`.padStart(width), '─'.repeat(width)];
  if (bi.length > 1) {
    for (let i = bi.length - 1; i >= 0; i--) {
      const d = Number(bi[i]);
      const part = String(d * Number(ai));
      lines.push(part.padEnd(part.length + (bi.length - 1 - i), ' ').padStart(width));
    }
    lines.push('─'.repeat(width));
  }
  const raw = dec ? insertPoint(String(value), dec).replace(/\.?0+$/, '') || '0' : String(value);
  lines.push(raw.padStart(width));
  const neg = Math.sign(a) * Math.sign(b) < 0;
  const pretty = neg ? [`оба числа разных знаков — ответ отрицательный`] : [];
  return {
    value: a * b,
    lines: [...pretty, ...lines.map((l, i) => (i === 0 && neg ? `−${l.trim()}`.padStart(width) : l))],
  };
}

function insertPoint(s, dec) {
  if (!dec) return s;
  const str = s.padStart(dec + 1, '0');
  return `${str.slice(0, str.length - dec)}.${str.slice(str.length - dec)}`;
}
