/* =========================================================================
 * mathcore.js — безопасное математическое ядро (без eval)
 * 1) парсер/вычислитель выражений с неявным умножением и переменными
 * 2) решение уравнений (линейных и численное для нелинейных)
 * 3) решение систем линейных уравнений
 * 4) символьное раскрытие скобок и разложение на множители (многочлены)
 * 5) вспомогательные функции: НОД, НОК, разложение на простые, форматирование
 * ========================================================================= */

export const PI = Math.PI;
export const EPS = 1e-9;

/* ---------------------------------------------------------------- номера */
const TRAILING = { /* константы для частых случаев */ };
export function fmt(n, digits = 8) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (!Number.isFinite(n)) return n > 0 ? '+∞' : '−∞';
  let v = n;
  if (Math.abs(v) < 1e-12) v = 0;
  const rounded = Number(v.toFixed(digits));
  return trimNumber(String(rounded === 0 ? 0 : rounded)).replace('.', ',');
}

/** Убирает «хвост» вида 60.00000001 → 60 и 0.30000000000000004 → 0.3 */
function trimNumber(s) {
  if (!s.includes('.')) return s;
  if (!/000000\d|999999\d/.test(s)) return s;
  for (let d = 1; d <= 6; d++) {
    const r = Number(Number(s).toFixed(d));
    if (Math.abs(r - Number(s)) < 1e-9) return String(r);
  }
  return s;
}

export function fmtPlain(n, digits = 8) {
  return fmt(n, digits).replace(',', '.');
}

/** Пытается представить число красивой обыкновенной дробью (для ответов). */
export function asFraction(n, maxDen = 1000) {
  if (!Number.isFinite(n) || Math.abs(n) > 1e7) return null;
  if (Math.abs(n - Math.round(n)) < 1e-10) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, x = n;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (k2 > maxDen || !Number.isFinite(k2)) break;
    if (Math.abs(n - h2 / k2) < 1e-9 && k2 > 1) {
      return { num: h2, den: k2 };
    }
    const rest = x - a;
    if (Math.abs(rest) < 1e-12) break;
    x = 1 / rest;
  }
  return null;
}

export function fmtSmart(n) {
  const fr = asFraction(n);
  const base = fmt(n);
  return fr ? `${base} (${fr.num}/${fr.den})` : base;
}

export const gcd = (a, b) => {
  // НОД по алгоритму Евклида (не путать с локальными score-переменными!)
  let x = Math.abs(Math.round(a)), y = Math.abs(Math.round(b));
  if (x === 0) return y;
  while (y) { const t = x % y; x = y; y = t; }
  return x;
};
export const lcm = (a, b) => Math.abs(Math.round(a) * Math.round(b)) / gcd(a, b);

export function primeFactors(n) {
  n = Math.abs(Math.round(n));
  const out = [];
  for (let p = 2; p * p <= n; p++) {
    while (n % p === 0) { out.push(p); n /= p; }
  }
  if (n > 1) out.push(n);
  return out;
}

export function factorizationString(n) {
  const parts = [];
  const counts = new Map();
  for (const p of primeFactors(n)) counts.set(p, (counts.get(p) || 0) + 1);
  for (const [p, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    parts.push(c === 1 ? String(p) : `${p}^${c}`);
  }
  return parts.join(' · ') || String(n);
}

/* ------------------------------------------------------- предобработка */
const SUPERS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

export function preprocess(src) {
  let s = String(src ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[×∙⋅·]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/:/g, '/') // «:» как знак деления / отношения
    .replace(/[−–—]/g, '-')
    .replace(/[π]/g, 'PI')
    .replace(/[√]/g, 'sqrt')
    .replace(/(\d),(\d)/g, '$1.$2')            // десятичная запятая
    .replace(/\s*\/\s*/g, '/');
  // надстрочные цифры → ^n
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => '^' + [...m].map((c) => SUPERS[c]).join(''));
  // «sqrt4» → «sqrt(4)», «sqrtx» → «sqrt(x)»
  s = s.replace(/sqrt\s*(\d+(?:\.\d+)?|[A-Za-zА-Яа-я](?:\^\d+)?)/g, 'sqrt($1)');
  return s;
}

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, cbrt: Math.cbrt, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  ln: Math.log, sin: Math.sin, cos: Math.cos, tan: Math.tan,
};
const CONSTS = { PI: Math.PI, pi: Math.PI, e: Math.E };
const isFunc = (name) => Object.prototype.hasOwnProperty.call(FUNCS, name);

function tokenize(raw) {
  const s = preprocess(raw);
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Некорректное число «${s.slice(i, j)}»`);
      tokens.push({ type: 'num', value: num, text: s.slice(i, j) });
      i = j; continue;
    }
    if (/[A-Za-zА-Яа-я_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-zА-Яа-я_0-9]/.test(s[j])) j++;
      tokens.push({ type: 'ident', value: s.slice(i, j) });
      i = j; continue;
    }
    if ('+-*/^'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (c === '|') { tokens.push({ type: 'pipe' }); i++; continue; }
    if (c === '=' ) { tokens.push({ type: 'eq' }); i++; continue; }
    throw new Error(`Непонятный символ «${c}» в выражении`);
  }
  return tokens;
}

/** расстановка неявного умножения: 2x, 3(x+1), (a+b)(c+d), 2PI */
function withImplicitMultiplication(tokens) {
  const out = [];
  const valueIsh = (t) => t && (t.type === 'num' || t.type === 'rparen' || t.type === 'ident');
  const startsValue = (t) => t && (t.type === 'num' || t.type === 'lparen' || t.type === 'ident' || t.type === 'pipe');
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], p = out[out.length - 1];
    if (p && valueIsh(p) && startsValue(t)) {
      // вызов функции: sqrt( ... ) — умножение между именем и скобкой не нужно
      if (!(p.type === 'ident' && isFunc(p.value) && t.type === 'lparen')) {
        out.push({ type: 'op', value: '*' });
      }
    }
    out.push(t);
  }
  return out;
}

const cache = new Map();

/** compile('2x + 1') → (scope) => number */
export function compile(src) {
  const key = String(src);
  if (cache.has(key)) return cache.get(key);
  const toks = withImplicitMultiplication(tokenize(src));
  let pos = 0;
  let inAbs = false;
  const peek = () => toks[pos];
  const isOp = (v) => peek() && peek().type === 'op' && peek().value === v;
  const take = () => toks[pos++];

  function parseExpr() {
    let left = parseTerm();
    while (peek() && ((isOp('+') || isOp('-')) || (inAbs && peek().type === 'pipe'))) {
      if (inAbs && peek().type === 'pipe') break;
      const op = take().value;
      const right = parseTerm();
      const l = left;
      left = (s) => op === '+' ? l(s) + right(s) : l(s) - right(s);
    }
    return left;
  }
  function parseTerm() {
    let left = parseUnary();
    while (peek() && (isOp('*') || isOp('/'))) {
      const op = take().value;
      const right = parseUnary();
      const l = left;
      left = (s) => {
        const a = l(s), b = right(s);
        if (op === '/') {
          if (Math.abs(b) < 1e-14) throw new Error('Деление на нуль: выражение не имеет смысла');
          return a / b;
        }
        return a * b;
      };
    }
    return left;
  }
  function parseUnary() {
    if (isOp('-')) { take(); const f = parseUnary(); return (s) => -f(s); }
    if (isOp('+')) { take(); return parseUnary(); }
    return parsePower();
  }
  function parsePower() {
    const base = parseAtom();
    if (isOp('^')) { take(); const exp = parseUnary(); return (s) => Math.pow(base(s), exp(s)); }
    return base;
  }
  function parseAtom() {
    const t = peek();
    if (!t) throw new Error('Неожиданный конец выражения');
    if (t.type === 'num') { take(); return () => t.value; }
    if (t.type === 'pipe') {
      take();
      const saved = inAbs; inAbs = true;
      const inner = parseExpr();
      inAbs = saved;
      if (!peek() || peek().type !== 'pipe') throw new Error('Не закрыт знак модуля |');
      take();
      return (s) => Math.abs(inner(s));
    }
    if (t.type === 'lparen') {
      take();
      const saved = inAbs; inAbs = false;
      const inner = parseExpr();
      inAbs = saved;
      if (!peek() || peek().type !== 'rparen') throw new Error('Не закрыта скобка «(»');
      take();
      return inner;
    }
    if (t.type === 'ident') {
      take();
      const name = t.value;
      if (isFunc(name)) {
        if (!peek() || peek().type !== 'lparen') throw new Error(`После функции ${name} нужна скобка`);
        take();
        const saved = inAbs; inAbs = false;
        const arg = parseExpr();
        inAbs = saved;
        if (!peek() || peek().type !== 'rparen') throw new Error(`Не закрыта скобка функции ${name}`);
        take();
        const fn = FUNCS[name];
        return (s) => fn(arg(s));
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return () => CONSTS[name];
      return (s) => {
        if (!Object.prototype.hasOwnProperty.call(s, name)) {
          throw new Error(`Неизвестная переменная «${name}»`);
        }
        const v = s[name];
        return typeof v === 'function' ? v(s) : v;
      };
    }
    throw new Error(`Ожидалось число или переменная, а встретилось «${t.type}»`);
  }

  const fn = parseExpr();
  if (pos < toks.length && toks[pos].type !== 'eq') {
    throw new Error(`Лишняя часть выражения: «${toks[pos].value ?? toks[pos].type}»`);
  }
  const wrapped = (scope = {}) => {
    const v = fn(scope || {});
    if (!Number.isFinite(v)) throw new Error('Выражение не имеет числового значения');
    return v;
  };
  cache.set(key, wrapped);
  return wrapped;
}

export function evaluate(src, scope = {}) {
  return compile(src)(scope);
}

export function splitEquation(eq) {
  const parts = String(eq).split('=');
  if (parts.length !== 2) throw new Error('Нужно ровно одно равенство вида «левая часть = правая часть»');
  return [parts[0], parts[1]];
}

/* ------------------------------------------------------ уравнения */
/** Возвращает коэффициенты A·v + B из выражения (проверяя линейность). */
export function linearIn(expr, v, scope = {}) {
  const f = compile(expr);
  const f0 = f({ ...scope, [v]: 0 });
  const f1 = f({ ...scope, [v]: 1 });
  const f2 = f({ ...scope, [v]: 2 });
  const B = f1 - f0;
  const A = f0;
  const linear = Math.abs(f2 - (A + 2 * B)) < 1e-6 * (1 + Math.abs(A) + Math.abs(B));
  return { A, B, linear, f };
}

/** Решает уравнение L = R относительно переменной v.
 *  Возвращает { type:'one'|'many'|'none', roots:[...], steps:[...] } */
export function solveEquation(eq, v = 'x', scope = {}, domain = [-100, 100]) {
  const [L, R] = splitEquation(eq);
  const f = (x) => evaluate(L, { ...scope, [v]: x }) - evaluate(R, { ...scope, [v]: x });
  let roots = [];
  const { A, B, linear } = linearIn(`(${L}) - (${R})`, v, scope);
  const steps = [];
  if (linear) {
    if (Math.abs(B) < EPS) {
      return {
        type: Math.abs(A) < EPS ? 'many' : 'none', roots: [],
        steps: [`После переноса: ${fmt(A)} = 0`, Math.abs(A) < EPS
          ? 'Верное равенство при любом значении переменной — корней бесконечно много.'
          : 'Неверное равенство — корней нет.'],
      };
    }
    const x = -A / B;
    roots = [x];
    steps.push(`Перенесём всё в левую часть: ${fmt(B)}·${v} + (${fmt(A)}) = 0`);
    steps.push(`${fmt(B)}·${v} = ${fmt(-A)}`);
    steps.push(`${v} = (${fmt(-A)}) / (${fmt(B)}) = ${fmt(x)}`);
  } else {
    roots = numericRoots(f, domain);
    steps.push(`Уравнение нелинейное: ищем корни численно на отрезке [${fmt(domain[0])}; ${fmt(domain[1])}]`);
    steps.push(roots.length
      ? `Найденные корни: ${roots.map((r) => fmt(r)).join('; ')}`
      : 'Корней на рассмотренном промежутке не найдено');
  }
  return { type: roots.length ? 'one' : 'none', roots, steps };
}

export function numericRoots(f, domain = [-100, 100], steps = 4000) {
  const [lo, hi] = domain;
  const h = (hi - lo) / steps;
  const roots = [];
  let prevX = lo, prevY = safeF(f, lo);
  for (let i = 1; i <= steps; i++) {
    const x = lo + i * h;
    const y = safeF(f, x);
    if (Math.abs(y) < 1e-10) roots.push(x);
    else if (Number.isFinite(prevY) && Number.isFinite(y) && prevY * y < 0) {
      let a = prevX, b = x, fa = prevY;
      for (let k = 0; k < 90; k++) {
        const m = (a + b) / 2, fm = safeF(f, m);
        if (fa * fm <= 0) { b = m; } else { a = m; fa = fm; }
      }
      roots.push((a + b) / 2);
    }
    prevX = x; prevY = y;
  }
  const uniq = [];
  for (const r of roots.sort((a, b) => a - b)) {
    if (!uniq.length || Math.abs(r - uniq[uniq.length - 1]) > 1e-6) uniq.push(r);
  }
  return uniq.slice(0, 12);
}
function safeF(f, x) { try { return f(x); } catch { return NaN; } }

/* ------------------------------------------------------ системы 2×2 */
/** expr вида «a*x + b*y + c» → { bx, by, c, linear } */
export function affineCoefficients(expr, vars = ['x', 'y'], scope = {}) {
  const [vx, vy] = vars;
  const f = compile(expr);
  const at = (a, b) => f({ ...scope, [vx]: a, [vy]: b });
  const c = at(0, 0);
  const bx = at(1, 0) - c;
  const by = at(0, 1) - c;
  const linear = Math.abs(at(2, 0) - (c + 2 * bx)) < 1e-6 * (1 + Math.abs(c))
    && Math.abs(at(0, 2) - (c + 2 * by)) < 1e-6 * (1 + Math.abs(c))
    && Math.abs(at(1, 1) - (c + bx + by)) < 1e-6 * (1 + Math.abs(c));
  return { bx, by, c, linear };
}

/** Решает систему из двух уравнений вида L = R. */
export function solveSystem(equations, vars = ['x', 'y'], scope = {}) {
  if (equations.length !== 2) throw new Error('Нужно ровно два уравнения');
  const rows = equations.map((eq) => {
    const [L, R] = splitEquation(eq);
    const r = affineCoefficients(`(${L}) - (${R})`, vars, scope);
    if (!r.linear) throw new Error('Одно из уравнений системы не линейное');
    return r; // bx·x + by·y + c = 0
  });
  const [r1, r2] = rows;
  const [vx, vy] = vars;
  const D = r1.bx * r2.by - r2.bx * r1.by;
  const Dx = (-r1.c) * r2.by - (-r2.c) * r1.by;
  const Dy = r1.bx * (-r2.c) - r2.bx * (-r1.c);
  const steps = [
    `Приведём уравнения к виду ${r1.bx === 0 ? '' : `a·${vx} + `}b·${vy} + c = 0:`,
    `① ${fmt(r1.bx)}·${vx} + ${fmt(r1.by)}·${vy} + ${fmt(r1.c)} = 0`,
    `② ${fmt(r2.bx)}·${vx} + ${fmt(r2.by)}·${vy} + ${fmt(r2.c)} = 0`,
    `Определитель D = ${fmt(r1.bx)}·${fmt(r2.by)} − ${fmt(r2.bx)}·${fmt(r1.by)} = ${fmt(D)}`,
  ];
  if (Math.abs(D) > EPS) {
    const x = Dx / D, y = Dy / D;
    steps.push(`Dₓ = ${fmt(Dx)}, Dᵧ = ${fmt(Dy)}`);
    steps.push(`${vx} = Dₓ / D = ${fmt(x)},  ${vy} = Dᵧ / D = ${fmt(y)}`);
    return { type: 'one', values: { [vx]: x, [vy]: y }, D, Dx, Dy, steps, rows };
  }
  // вырожденный случай: прямые параллельны или совпадают
  const prop = Math.abs(r1.bx * r2.c - r2.bx * r1.c) < EPS
    && Math.abs(r1.by * r2.c - r2.by * r1.c) < EPS;
  const same = Math.abs(r1.c) < EPS && Math.abs(r2.c) < EPS;
  steps.push('D = 0: прямые параллельны или совпадают.');
  return {
    type: (prop || same) ? 'many' : 'none',
    values: null, D, steps, rows,
    note: (prop || same) ? 'Уравнения задают одну и ту же прямую — решений бесконечно много.'
      : 'Прямые параллельны и не совпадают — система решений не имеет.',
  };
}

/* --------------------------------------------- символьные многочлены */
function keyOf(exps) {
  return [...exps.entries()].filter(([, e]) => e !== 0).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([v, e]) => `${v}:${e}`).join('|') || '#';
}
class Poly {
  constructor(terms = new Map()) { this.terms = terms; }
  static from(exps, coeff, map = null) {
    const p = new Poly();
    p.terms.set(keyOf(exps), coeff);
    return attachKeys(p, map, exps);
  }
  add(o) {
    const t = new Map(this.terms);
    for (const [k, c] of o.terms) t.set(k, (t.get(k) || 0) + c);
    return clean(new Poly(t), o.keys || this.keys);
  }
  neg() { const t = new Map(); for (const [k, c] of this.terms) t.set(k, -c); return new Poly(t); }
  sub(o) { return this.add(o.neg()); }
  mul(o) {
    const t = new Map();
    for (const [k1, c1] of this.terms) for (const [k2, c2] of o.terms) {
      const k = combineKeys(k1, k2);
      t.set(k, (t.get(k) || 0) + c1 * c2);
    }
    return clean(new Poly(t));
  }
  pow(n) {
    let r = new Poly(new Map([['#', 1]]));
    for (let i = 0; i < n; i++) r = r.mul(this);
    return r;
  }
  degree() {
    let d = 0;
    for (const k of this.terms.keys()) {
      const s = k === '#' ? 0 : k.split('|').reduce((a, p) => a + Number(p.split(':')[1]), 0);
      d = Math.max(d, s);
    }
    return d;
  }
}
// ключи вида «a:2|b:1»; параллельно храним расшифровку в global map
const KEYMAP = new Map();
function attachKeys(p, map, exps) {
  for (const [v, e] of exps) KEYMAP.set(v, e);
  return p;
}
function parseKey(k) {
  const m = new Map();
  if (k === '#') return m;
  for (const part of k.split('|')) { const [v, e] = part.split(':'); m.set(v, Number(e)); }
  return m;
}
function combineKeys(a, b) {
  const m = parseKey(a);
  for (const [v, e] of parseKey(b)) m.set(v, (m.get(v) || 0) + e);
  return keyOf(m);
}
function clean(p) {
  const t = new Map();
  for (const [k, c] of p.terms) if (Math.abs(c) > 1e-10) t.set(k, Math.round(c * 1e10) / 1e10);
  p.terms = t;
  return p;
}

function polyParser(src) {
  const toks = withImplicitMultiplication(tokenize(src));
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v) => peek() && peek().type === 'op' && peek().value === v;
  const take = () => toks[pos++];
  function expr() {
    let l = term();
    while (peek() && (isOp('+') || isOp('-'))) {
      const op = take().value, r = term();
      l = op === '+' ? l.add(r) : l.sub(r);
    }
    return l;
  }
  function term() {
    let l = power();
    while (peek() && (isOp('*') || isOp('/'))) {
      const op = take().value, r = power();
      if (op === '/') {
        if (r.terms.size !== 1 || !r.terms.has('#')) throw new Error('Деление возможно только на число');
        const c = r.terms.get('#');
        if (Math.abs(c) < 1e-12) throw new Error('Деление на нуль');
        l = l.mul(new Poly(new Map([['#', 1 / c]])));
      } else l = l.mul(r);
    }
    return l;
  }
  function power() {
    let b = unary();
    if (isOp('^')) {
      take();
      let n;
      if (isOp('-')) { take(); n = -Number(take().value); }
      else {
        const t = take();
        if (t.type !== 'num' || !Number.isInteger(t.value)) throw new Error('Показатель степени должен быть целым неотрицательным числом');
        n = t.value;
      }
      if (n < 0 || n > 30) throw new Error('Показатель степени должен быть от 0 до 30');
      b = b.pow(n);
    }
    return b;
  }
  function unary() {
    if (isOp('-')) { take(); return unary().neg(); }
    if (isOp('+')) { take(); return unary(); }
    return atom();
  }
  function atom() {
    const t = take();
    if (!t) throw new Error('Неожиданный конец выражения');
    if (t.type === 'num') return new Poly(new Map([['#', t.value]]));
    if (t.type === 'ident') {
      if (Object.prototype.hasOwnProperty.call(CONSTS, t.value)) return new Poly(new Map([['#', CONSTS[t.value]]]));
      if (isFunc(t.value)) throw new Error('Функции в символьных преобразованиях не поддерживаются');
      return new Poly(new Map([[keyOf(new Map([[t.value, 1]])), 1]]));
    }
    if (t.type === 'lparen') {
      const inner = expr();
      if (!peek() || peek().type !== 'rparen') throw new Error('Не закрыта скобка');
      take();
      return inner;
    }
    throw new Error('Некорректное выражение многочлена');
  }
  const p = clean(expr());
  if (pos < toks.length && toks[pos].type !== 'eq') throw new Error('Лишняя часть выражения');
  return p;
}

function monoText(k, coeff, first) {
  const exps = parseKey(k);
  const vars = [...exps.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([v, e]) => e === 1 ? v : `${v}${superscript(e)}`).join('');
  const abs = Math.abs(coeff);
  const isOne = Math.abs(abs - 1) < 1e-10;
  let body = (vars === '' || !isOne) ? `${fmt(abs)}${vars}` : vars;
  if (vars === '' && isOne) body = '1';
  const sign = coeff < 0 ? '−' : (first ? '' : '+');
  return `${sign}${first ? '' : ' '}${body}`;
}
function superscript(n) {
  const map = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  if (map[n]) return map[n];
  return `^${n}`;
}
export function polyToText(p) {
  // Порядок как в учебнике: сначала старшие степени первой переменной,
  // затем члены по убыванию её показателя (a³, 3a²b, 3ab², b³).
  const vec = (k) => {
    const e = parseKey(k);
    return [...e.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const entries = [...p.terms.entries()].sort((a, b) => {
    const va = vec(a[0]), vb = vec(b[0]);
    const da = va.reduce((s, [, n]) => s + n, 0), db = vb.reduce((s, [, n]) => s + n, 0);
    if (db !== da) return db - da;
    const names = [...new Set([...va.map((x) => x[0]), ...vb.map((x) => x[0])])].sort();
    for (const n of names) {
      const ea = va.find((x) => x[0] === n)?.[1] || 0;
      const eb = vb.find((x) => x[0] === n)?.[1] || 0;
      if (eb !== ea) return eb - ea;
    }
    return a[0].localeCompare(b[0]);
  });
  if (!entries.length) return '0';
  return entries.map(([k, c], i) => monoText(k, c, i === 0)).join(' ');
}

export function expandExpression(src) {
  return polyToText(polyParser(src));
}

/** Проверка тождества: раскрыть обе части и сравнить многочлены. */
export function checkIdentity(eq) {
  const [L, R] = splitEquation(eq);
  try {
    const diff = polyParser(`(${L}) - (${R})`);
    return { equal: diff.terms.size === 0, left: expandExpression(L), right: expandExpression(R) };
  } catch {
    // Для тождеств с дробями (a/b, a/c) используем численную проверку
    // в нескольких точках — как это делают при проверке формул в учебнике.
    const vars = new Set();
    for (const m of `${L} ${R}`.matchAll(/[A-Za-zА-Яа-я_][A-Za-zА-Яа-я_0-9]*/g)) {
      if (!['PI', 'pi', 'sqrt', 'abs', 'cbrt'].includes(m[0])) vars.add(m[0]);
    }
    const names = [...vars];
    for (const values of [[2, 3, 5, 7], [-3, 4, 2, 6], [1.5, 2.5, 3.5, 4.5]]) {
      const scope = Object.fromEntries(names.map((n, i) => [n, values[i % values.length]]));
      try {
        const a = evaluate(L, scope), b = evaluate(R, scope);
        if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(a) + Math.abs(b))) {
          return { equal: false, left: L, right: R };
        }
      } catch { /* пропускаем точку, где выражение не определено */ }
    }
    return { equal: true, left: L, right: R };
  }
}

/** Простое разложение на множители по формулам сокращённого умножения. */
export function factorExpression(src) {
  const p = polyParser(src);
  const terms = [...p.terms.entries()];
  if (!terms.length) return { text: '0', method: 'нулевой многочлен' };

  // 1) общий множитель (числовой + буквенный)
  let numGcd = 0;
  for (const [, c] of terms) numGcd = gcd(numGcd, Math.round(Math.abs(c) * 1e6) / 1e6 * 1e6);
  // более устойчиво: НОД целых коэффициентов, если они целые
  const ints = terms.map(([, c]) => Math.round(c));
  const allInt = ints.every((c, i) => Math.abs(c - terms[i][1]) < 1e-9);
  const g = allInt ? ints.reduce((a, b) => gcd(a, b), 0) : 1;
  const minExps = new Map();
  let first = true;
  for (const [k] of terms) {
    const e = parseKey(k);
    if (first) { for (const [v, n] of e) minExps.set(v, n); first = false; }
    else for (const [v, n] of minExps) if (!e.has(v)) minExps.set(v, 0); else minExps.set(v, Math.min(n, e.get(v)));
  }
  const commonVars = [...minExps.entries()].filter(([, n]) => n > 0);
  const commonKey = keyOf(new Map(commonVars));
  let commonText = '';
  if (g > 1 || commonVars.length) {
    commonText = `${g > 1 ? fmt(g) : ''}${commonVars.map(([v, n]) => n === 1 ? v : v + superscript(n)).join('')}`;
  }
  const rest = new Poly(new Map());
  for (const [k, c] of terms) {
    const e = parseKey(k);
    for (const [v, n] of commonVars) e.set(v, e.get(v) - n);
    rest.terms.set(keyOf(e), (rest.terms.get(keyOf(e)) || 0) + c / g);
  }
  clean(rest);

  const body = factorCore(rest);
  if (commonText && body.text !== '1') {
    return { text: `${commonText}(${body.text})`, method: `вынесение общего множителя ${commonText}; ${body.method}` };
  }
  if (commonText) return { text: commonText, method: 'вынесение общего множителя' };
  return body;
}

function factorCore(p) {
  const entries = [...p.terms.entries()];
  if (entries.length === 1) return { text: polyToText(p), method: 'одночлен' };
  if (entries.length === 2) {
    const [k1, c1] = entries[0], [k2, c2] = entries[1];
    const e1 = parseKey(k1), e2 = parseKey(k2);
    const sameSign = Math.sign(c1) === Math.sign(c2);
    const s1 = Math.sqrt(Math.abs(c1)), s2 = Math.sqrt(Math.abs(c2));
    const nice1 = Math.abs(s1 - Math.round(s1)) < 1e-9 ? Math.round(s1) : s1;
    const nice2 = Math.abs(s2 - Math.round(s2)) < 1e-9 ? Math.round(s2) : s2;
    if (allDivisibleBy(e1, 2) && allDivisibleBy(e2, 2) && !sameSign
        && Number.isFinite(nice1) && Number.isFinite(nice2)) {
      const A = monoMonomial(halfExps(e1), nice1), B = monoMonomial(halfExps(e2), nice2);
      const [X, Y] = c1 > 0 ? [A, B] : [B, A];
      return { text: `(${X} − ${Y})(${X} + ${Y})`, method: 'формула разности квадратов a² − b² = (a − b)(a + b)' };
    }
    const t1 = Math.cbrt(Math.abs(c1)), t2 = Math.cbrt(Math.abs(c2));
    const niceT1 = Math.abs(t1 - Math.round(t1)) < 1e-9 ? Math.round(t1) : t1;
    const niceT2 = Math.abs(t2 - Math.round(t2)) < 1e-9 ? Math.round(t2) : t2;
    if (allDivisibleBy(e1, 3) && allDivisibleBy(e2, 3) && Number.isFinite(niceT1) && Number.isFinite(niceT2)) {
      const A = monoMonomial(thirdExps(e1), niceT1), B = monoMonomial(thirdExps(e2), niceT2);
      if (sameSign && c1 > 0) {
        return { text: `(${A} + ${B})(${A}² − ${A}·${B} + ${B}²)`, method: 'формула суммы кубов a³ + b³ = (a + b)(a² − ab + b²)' };
      }
      const [X, Y] = c1 > 0 ? [A, B] : [B, A];
      return { text: `(${X} − ${Y})(${X}² + ${X}·${Y} + ${Y}²)`, method: 'формула разности кубов a³ − b³ = (a − b)(a² + ab + b²)' };
    }
  }
  if (entries.length === 3) {
    // полный квадрат: A² ± 2AB + B²
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const k = 3 - i - j;
      if (k < 0 || k === i || k === j || k > 2) continue;
      const [ka, ca] = entries[i], [kb, cb] = entries[j], [kc, cc] = entries[k];
      if (allDivisibleBy(parseKey(ka), 2) && allDivisibleBy(parseKey(kb), 2)
          && Math.sign(ca) === Math.sign(cb)) {
        const A = monoMonomial(halfExps(parseKey(ka)), Math.sqrt(Math.abs(ca)));
        const B = monoMonomial(halfExps(parseKey(kb)), Math.sqrt(Math.abs(cb)));
        const expected = 2 * Math.sqrt(Math.abs(ca * cb));
        if (Math.abs(Math.abs(cc) - expected) < 1e-7) {
          const sign = cc > 0 ? '+' : '−';
          return { text: `(${A} ${sign} ${B})²`, method: 'формула квадрата суммы/разности a² ± 2ab + b² = (a ± b)²' };
        }
      }
    }
    // квадратный трёхчлен x² + px + q с целыми корнями
    const vars = new Set();
    for (const [kk] of entries) for (const [v] of parseKey(kk)) vars.add(v);
    if (vars.size === 1) {
      const v = [...vars][0];
      const get = (n) => { const e = new Map([[v, n]]); return p.terms.get(keyOf(e)) || 0; };
      const a = get(2), b = get(1), c = get(0);
      if (Math.abs(a - 1) < 1e-9) {
        for (let r = -60; r <= 60; r++) {
          const s = -b - r;
          if (Math.abs(r * s - c) < 1e-9 && Math.abs(r + s + b) < 1e-9) {
            const sgn = (t) => t >= 0 ? `(${v} + ${fmt(t)})` : `(${v} − ${fmt(-t)})`;
            return { text: `${sgn(-r)}${sgn(-s)}`.replace(/\)\(/, ')('), method: 'разложение квадратного трёхчлена по корням (теорема Виета)' };
          }
        }
      }
    }
  }
  if (entries.length === 4) {
    // способ группировки: pa + qa + pb + qb = (p+q)(a+b)
    for (let mask = 1; mask < 15; mask++) {
      const g1 = entries.filter((_, i) => mask & (1 << i));
      const g2 = entries.filter((_, i) => !(mask & (1 << i)));
      if (g1.length !== 2 || g2.length !== 2) continue;
      const r1 = pairFactor(g1), r2 = pairFactor(g2);
      if (!r1 || !r2) continue;
      if (r1.rest === r2.rest || r1.rest === negateText(r2.rest)) {
        const flip = r1.rest === negateText(r2.rest);
        const f2 = flip ? negatePolyText(r2.factor) : r2.factor;
        return {
          text: `(${r1.factor} ${f2.startsWith('−') ? '− ' + f2.slice(1) : '+ ' + f2})(${r1.rest})`,
          method: 'способ группировки: вынести общий множитель в каждой паре слагаемых',
        };
      }
    }
  }
  return { text: polyToText(p), method: 'разложение не распознано — выражение уже в стандартном виде' };
}
function allDivisibleBy(e, n) { return [...e.values()].every((v) => v % n === 0); }
function halfExps(e) { return new Map([...e].map(([v, n]) => [v, n / 2])); }
function thirdExps(e) { return new Map([...e].map(([v, n]) => [v, n / 3])); }
function monoMonomial(e, coeff) {
  const vars = [...e.entries()].filter(([, n]) => n !== 0).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([v, n]) => n === 1 ? v : `${v}${superscript(n)}`).join('');
  if (!vars) return fmt(coeff);
  const c = Math.abs(coeff - 1) < 1e-9 ? '' : fmt(coeff);
  return `${c}${vars}`;
}
function negateText(s) { return s.startsWith('−') ? s.slice(1) : `−${s}`; }
function negatePolyText(s) { return s.startsWith('−') ? s.slice(1) : `−${s}`; }
function pairFactor(pair) {
  // выносит общий одночлен из двух слагаемых, возвращает {factor, rest}
  const [[k1, c1], [k2, c2]] = pair;
  const e1 = parseKey(k1), e2 = parseKey(k2);
  const vars = new Set([...e1.keys(), ...e2.keys()]);
  const g = new Map();
  for (const v of vars) g.set(v, Math.min(e1.get(v) || 0, e2.get(v) || 0));
  const ng = gcd(c1, c2);
  const factor = `${ng > 1 ? fmt(ng) : ''}${[...g].filter(([, n]) => n > 0).map(([v, n]) => n === 1 ? v : v + superscript(n)).join('')}`;
  const restTerms = new Poly(new Map());
  for (const [k, c] of pair) {
    const e = parseKey(k);
    for (const [v, n] of g) e.set(v, (e.get(v) || 0) - n);
    restTerms.terms.set(keyOf(e), (restTerms.terms.get(keyOf(e)) || 0) + c / ng);
  }
  clean(restTerms);
  return { factor: factor || '1', rest: polyToText(restTerms) };
}

/* --------------------------------------------- решение формулы F=0 */
/** Найти неизвестную переменную в формуле L = R при известных остальных. */
export function solveFormula(eq, unknown, known = {}, domain = null, scopeExtra = {}) {
  const [L, R] = splitEquation(eq);
  const scope = { ...known, ...scopeExtra };
  const f = (x) => {
    try { return evaluate(L, { ...scope, [unknown]: x }) - evaluate(R, { ...scope, [unknown]: x }); }
    catch { return NaN; }
  };
  const lin = linearIn(`(${L}) - (${R})`, unknown, scope);
  const steps = [];
  if (lin.linear && Math.abs(lin.B) > EPS) {
    const x = -lin.A / lin.B;
    steps.push(`Подставим известные значения и перенесём всё в одну часть: ${fmt(lin.B)}·${unknown} + (${fmt(lin.A)}) = 0`);
    steps.push(`${fmt(lin.B)}·${unknown} = ${fmt(-lin.A)}`);
    steps.push(`${unknown} = ${fmt(-lin.A)} / ${fmt(lin.B)} = ${fmt(x)}`);
    return { value: x, steps, method: 'линейное уравнение' };
  }
  const dom = domain || [-1000, 1000];
  const roots = numericRoots(f, dom, 6000);
  if (!roots.length) {
    // попробуем расширить область вправо (длины, площади, объёмы)
    const roots2 = numericRoots(f, [0, Math.max(1e6, dom[1] * 1000)], 6000);
    if (!roots2.length) throw new Error('Не удалось найти решение: проверьте известные значения и область допустимых значений');
    roots.push(...roots2);
  }
  let x = roots[0];
  if (dom[0] >= 0) {
    const positive = roots.find((r) => r >= -1e-9);
    if (positive !== undefined) x = positive;
  }
  steps.push(`Получаем уравнение относительно ${unknown}; решаем его численно (бисекция) на [${fmt(dom[0])}; ${fmt(dom[1])}]`);
  steps.push(`${unknown} = ${fmt(x)}  (проверка: невязка ${fmt(Math.abs(f(x)))})`);
  return { value: x, steps, method: 'численное решение (метод бисекции)' };
}

/** Подставить числа в строку формулы (для красивого показа шагов). */
export function substituteText(expr, values) {
  let s = String(expr);
  const names = Object.keys(values).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    s = s.replace(re, `(${fmtPlain(values[name])})`);
  }
  return s.replace(/\*/g, '·');
}

export function evalWithFractions(src, scope = {}) {
  return evaluate(src, scope);
}
