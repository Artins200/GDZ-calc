/* =========================================================================
 * intervals.js — числовые промежутки (§ 4, п. 11, с. 51—53 учебника)
 * Парсер обозначений/неравенств + мини-рисунок координатной прямой
 * в стиле рис. 10—16 учебника + операции над промежутками.
 * ========================================================================= */
import { fmt } from './mathcore.js';

const NUM = '[-+]?\\d+(?:[.,]\\d+)?';

/**
 * @returns {{left:{value:number|null,closed:boolean},right:{value:number|null,closed:boolean},
 *            notation:string,inequality:string,name:string,setName:string}|{error:string}}
 */
export function parseInterval(raw) {
  let s = String(raw ?? '').trim()
    .replace(/\u00a0/g, ' ')
    .replace(/−|–|—/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/⩽|≤/g, '<=')
    .replace(/⩾|≥/g, '>=')
    .replace(/[∞∞]/g, 'inf')
    .replace(/\bбесконечность\b/gi, 'inf')
    .toLowerCase();
  if (!s) return { error: 'Введите обозначение промежутка или неравенство' };

  const number = (t) => {
    if (t === undefined) return undefined;
    if (t === null) return null; // бесконечность
    const v = Number(t.replace(',', '.'));
    return Number.isFinite(v) ? v : undefined;
  };

  // 1) Обозначение вида [a; b], (a; b], [a; +inf), (-inf; b] ...
  const m = s.match(/^([\[(])\s*([^;,\s]+)\s*[;,]\s*([^;,\s\])]+)\s*([\])])\s*$/);
  if (m) {
    const [, lb, aRaw, bRaw, rb] = m;
    const a = /inf/.test(aRaw) ? null : number(aRaw);
    const b = /inf/.test(bRaw) ? null : number(bRaw);
    if (a === undefined || b === undefined) return { error: 'Концы промежутка должны быть числами или ±∞' };
    if (a !== null && b !== null && a > b) return { error: `Левый конец ${fmt(a)} больше правого ${fmt(b)} — проверьте запись` };
    if (a !== null && b !== null && a === b && (lb !== '[' || rb !== ']')) return { error: 'Промежуток пуст: при a = b нужны обе квадратные скобки' };
    const left = { value: a, closed: lb === '[' && a !== null };
    const right = { value: b, closed: rb === ']' && b !== null };
    return build(left, right);
  }

  // 2) Неравенства: a <= x <= b; x > a; x <= b; -2 < x < 5
  const norm = s.replace(/\s+/g, ' ');
  const doubleRe = new RegExp(`^(${NUM})\\s*(<=|<)\\s*x\\s*(<=|<)\\s*(${NUM})$`);
  const dm = norm.match(doubleRe);
  if (dm) {
    const a = number(dm[1]), b = number(dm[4]);
    if (a > b) return { error: `Левый конец ${fmt(a)} больше правого ${fmt(b)}` };
    return build({ value: a, closed: dm[2] === '<=' }, { value: b, closed: dm[3] === '<=' });
  }
  const singleRe = new RegExp(`^x\\s*(<=|>=|<|>)\\s*(${NUM})$`);
  const sm = norm.match(singleRe);
  if (sm) {
    const op = sm[1], v = number(sm[2]);
    const left = (op === '<' || op === '<=') ? { value: null, closed: false } : { value: v, closed: op === '>=' };
    const right = (op === '<' || op === '<=') ? { value: v, closed: op === '<=' } : { value: null, closed: false };
    return build(left, right);
  }
  const leftVarRe = new RegExp(`^(${NUM})\\s*(<=|>=|<|>)\\s*x$`);
  const lm = norm.match(leftVarRe);
  if (lm) {
    const v = number(lm[1]), op = lm[2];
    // a < x ⇔ x > a
    const reverted = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[op];
    return parseInterval(`x ${reverted} ${v}`);
  }
  if (/^x\s*[-−–—]\s*любое|^r$|^все число|^вся прямо/.test(norm)) return build({ value: null, closed: false }, { value: null, closed: false });
  return { error: 'Не удалось распознать. Примеры: [−2; 5), (a; +∞), −3 ⩽ x < 4, x > 2' };
}

function build(left, right) {
  const L = left.value, R = right.value;
  const nice = (v) => fmt(v).replace(/^-/, '−');
  const lText = L === null ? '−∞' : nice(L);
  const rText = R === null ? '+∞' : nice(R);
  const proper = `${L === null ? '(' : (left.closed ? '[' : '(')}${lText}; ${rText}${R === null ? ')' : (right.closed ? ']' : ')')}`;

  let inequality;
  if (L === null && R === null) inequality = 'x — любое число';
  else if (L === null) inequality = `x ${right.closed ? '⩽' : '<'} ${nice(R)}`;
  else if (R === null) inequality = `x ${left.closed ? '⩾' : '>'} ${nice(L)}`;
  else inequality = `${nice(L)} ${left.closed ? '⩽' : '<'} x ${right.closed ? '⩽' : '<'} ${nice(R)}`;

  const name = L === null && R === null ? 'вся числовая прямая'
    : L === null ? (right.closed ? 'луч (−∞; a]' : 'луч (−∞; a)')
      : R === null ? (left.closed ? 'замкнутый луч' : 'открытый луч')
        : left.closed && right.closed ? 'числовой отрезок'
          : !left.closed && !right.closed ? 'интервал'
            : 'полуинтервал';

  const setName = L === null && R === null ? 'R'
    : `{ x | ${inequality} }`;

  return {
    left, right, notation: proper, inequality, setName, name,
    contains(x) {
      const okL = L === null || (left.closed ? x >= L - 1e-12 : x > L + 1e-12);
      const okR = R === null || (right.closed ? x <= R + 1e-12 : x < R - 1e-12);
      return okL && okR;
    },
    get length() { return L !== null && R !== null ? R - L : Infinity; },
    get midpoint() { return L !== null && R !== null ? (L + R) / 2 : null; },
    integers() {
      if (L === null || R === null) return null;
      const from = Math.ceil(left.closed ? L : L + 1e-9);
      const to = Math.floor(right.closed ? R : R - 1e-9);
      const out = [];
      for (let i = from; i <= to && out.length < 400; i++) out.push(i);
      return out;
    },
  };
}

/** Пересечение двух промежутков (или null). */
export function intersect(a, b) {
  if (!a?.left || !b?.left) return null;
  const chooseLeft = (p, q) => {
    if (p.value === null) return q;
    if (q.value === null) return p;
    if (p.value > q.value) return p;
    if (q.value > p.value) return q;
    return { value: p.value, closed: p.closed && q.closed };
  };
  const chooseRight = (p, q) => {
    if (p.value === null) return q;
    if (q.value === null) return p;
    if (p.value < q.value) return p;
    if (q.value < p.value) return q;
    return { value: p.value, closed: p.closed && q.closed };
  };
  const L = chooseLeft(a.left, b.left), R = chooseRight(a.right, b.right);
  if (L.value !== null && R.value !== null) {
    if (L.value > R.value) return null;
    if (L.value === R.value && !(L.closed && R.closed)) return null;
  }
  return build(L, R);
}

/** Объединение: возвращает список промежутков (1 или 2). */
export function union(a, b) {
  if (!a?.left || !b?.left) return [a, b].filter(Boolean);
  const overlaps = (() => {
    if (a.right.value !== null && b.left.value !== null) {
      if (a.right.value < b.left.value) return false;
      if (a.right.value === b.left.value) return a.right.closed || b.left.closed;
      return true;
    }
    if (b.right.value !== null && a.left.value !== null) {
      if (b.right.value < a.left.value) return false;
      if (b.right.value === a.left.value) return b.right.closed || a.left.closed;
      return true;
    }
    return true;
  })();
  if (!overlaps) {
    // порядок слева направо
    const first = a.left.value === null ? a : (b.left.value === null ? b : (a.left.value <= b.left.value ? a : b));
    const second = first === a ? b : a;
    return [first, second];
  }
  const L = (a.left.value === null || b.left.value === null) ? { value: null, closed: false }
    : (a.left.value < b.left.value ? a.left : (b.left.value < a.left.value ? b.left
      : { value: a.left.value, closed: a.left.closed || b.left.closed }));
  const R = (a.right.value === null || b.right.value === null) ? { value: null, closed: false }
    : (a.right.value > b.right.value ? a.right : (b.right.value > a.right.value ? b.right
      : { value: a.right.value, closed: a.right.closed || b.right.closed }));
  return [build(L, R)];
}

/* ------------------------------------------------------------- РИСУНОК */
/**
 * Мини-рисунок坐标 прямой в стиле учебника (рис. 10—16):
 * тонкая ось со стрелкой, закрашенные/светлые кружки, выделенная линия сверху.
 * @param {Array<{interval:object,label?:string,color?:string}>} items
 */
export function numberLineSVG(items, opts = {}) {
  const W = opts.width || 660;
  const rowH = 40;
  const H = 54 + items.length * rowH + 34;
  const axisY = H - 36;
  const xPad = 64;
  const finite = [];
  for (const it of items) {
    const i = it.interval;
    if (!i?.left) continue;
    if (i.left.value !== null) finite.push(i.left.value);
    if (i.right.value !== null) finite.push(i.right.value);
  }
  let lo = finite.length ? Math.min(...finite) : -5;
  let hi = finite.length ? Math.max(...finite) : 5;
  if (hi - lo < 4) { const c = (hi + lo) / 2; lo = c - 2; hi = c + 2; }
  const pad = Math.max(1, (hi - lo) * 0.16);
  lo -= pad; hi += pad;
  const X = (v) => xPad + ((v - lo) / (hi - lo)) * (W - 2 * xPad);
  const INF_L = xPad - 26, INF_R = W - xPad + 26;
  const arrow = (x, y, dir, color = '#3c4650', size = 6) =>
    `<path d="M ${x - dir * size} ${y - size * 0.7} L ${x} ${y} L ${x - dir * size} ${y + size * 0.7}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;

  let out = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="numberline" role="img" aria-label="Изображение числового промежутка на координатной прямой">`;
  out += `<rect x="0" y="0" width="${W}" height="${H}" fill="${opts.bg || '#12151a'}" rx="8"/>`;
  // ось
  out += `<line x1="${xPad - 34}" y1="${axisY}" x2="${W - xPad + 30}" y2="${axisY}" stroke="#59636f" stroke-width="1.3"/>`;
  out += arrow(W - xPad + 30, axisY, 1);
  // числа, которые будут подписаны как концы промежутков — засечки рядом с ними не рисуем
  const ends = [];
  for (const it of items) {
    const i = it.interval;
    if (!i?.left) continue;
    if (i.left.value !== null) ends.push(i.left.value);
    if (i.right.value !== null) ends.push(i.right.value);
  }
  const nearEnd = (v) => ends.some((e) => Math.abs(X(v) - X(e)) < 22);

  // засечки и подписи чисел
  const stepCandidate = (hi - lo) / 10;
  const step = niceStep(stepCandidate);
  const start = Math.ceil(lo / step) * step;
  for (let v = start; v <= hi + 1e-9; v += step) {
    const x = X(v);
    if (x < xPad - 20 || x > W - xPad + 18) continue;
    out += `<line x1="${x}" y1="${axisY - 4}" x2="${x}" y2="${axisY + 4}" stroke="#7b8693" stroke-width="1"/>`;
    if (nearEnd(v)) continue;
    out += `<text x="${x}" y="${axisY + 19}" text-anchor="middle" font-size="11" fill="#aab4c0" font-family="Georgia, serif">${fmt(v, 4)}</text>`;
  }

  items.forEach((it, idx) => {
    const iv = it.interval;
    if (!iv?.left) return;
    const color = it.color || ['#0d8bb5', '#c8455f', '#1b9e77', '#7b61b8'][idx % 4];
    const y = 32 + idx * rowH;
    const L = iv.left.value, R = iv.right.value;
    const xl = L === null ? INF_L : X(L);
    const xr = R === null ? INF_R : X(R);
    const hasL = L !== null, hasR = R !== null;
    // выделенная линия над осью (как на рис. 10—16)
    out += `<line x1="${xl}" y1="${y}" x2="${xr}" y2="${y}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
    if (!hasL) out += arrow(xl + 2, y, -1, color, 6);
    if (!hasR) out += arrow(xr - 2, y, 1, color, 6);
    const endLabel = (x, v, letter) => {
      const t = letter ? `<tspan font-style="italic">${letter}</tspan>` : fmt(v, 4);
      const w = String(letter || fmt(v, 4)).length * 6.4 + 6;
      return `<text x="${x}" y="${axisY + 20}" text-anchor="middle" font-size="12" fill="#e6ebf2" font-family="Georgia, serif">${t}</text>`;
    };
    if (hasL) {
      out += `<line x1="${xl}" y1="${y}" x2="${xl}" y2="${axisY - 5}" stroke="${color}" stroke-width="1.5"/>`;
      out += dot(xl, axisY, iv.left.closed, color, opts.fill !== false);
      out += endLabel(xl, L, opts.letters ? 'a' : null);
    }
    if (hasR) {
      out += `<line x1="${xr}" y1="${y}" x2="${xr}" y2="${axisY - 5}" stroke="${color}" stroke-width="1.5"/>`;
      out += dot(xr, axisY, iv.right.closed, color, opts.fill !== false);
      out += endLabel(xr, R, opts.letters ? 'b' : null);
    }
    if (it.label) {
      out += `<text x="10" y="${y - 8}" font-size="11.5" fill="${color}" font-family="Georgia, serif">${escapeXml(it.label)}</text>`;
    }
  });

  out += '</svg>';
  return out;
}

/**
 * Точка на оси. closed — конец входит в промежуток, fill — закрашивать ли её
 * (настройка «закрашивать конец» в приложении; по умолчанию да, как в учебнике).
 */
function dot(x, y, closed, color, fill = true) {
  if (!closed) {
    return `<circle cx="${x}" cy="${y}" r="4.6" fill="#12151a" stroke="${color}" stroke-width="2"/>`;
  }
  if (!fill) {
    return `<circle cx="${x}" cy="${y}" r="4.6" fill="none" stroke="${color}" stroke-width="2"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="4.6" fill="${color}" stroke="#fff" stroke-width="0.8"/>`;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Полный разбор промежутка для показа в UI. */
export function describeInterval(iv) {
  const ints = iv.integers();
  const lines = [
    `Название: ${iv.name}`,
    `Обозначение: ${iv.notation}`,
    `Неравенство: ${iv.inequality}`,
    `Множество: ${iv.setName}`,
  ];
  if (iv.left.value !== null && iv.right.value !== null) {
    lines.push(`Длина: |b − a| = ${fmt(iv.length)}`);
    lines.push(`Середина: (a + b)/2 = ${fmt(iv.midpoint)}`);
    lines.push(ints && ints.length
      ? `Целые числа в промежутке: ${ints.join(', ')}${ints.length >= 400 ? ' …' : ''}`
      : 'Целых чисел в промежутке нет');
  } else {
    lines.push('Промежуток неограничен: длина бесконечна; концы ±∞ никогда не включаются.');
  }
  lines.push(`Концы: ${iv.left.value === null ? '−∞ (не включается)' : (iv.left.closed ? 'a включается (закрашенный кружок)' : 'a не включается (светлый кружок)')}; ${iv.right.value === null ? '+∞ (не включается)' : (iv.right.closed ? 'b включается (закрашенный кружок)' : 'b не включается (светлый кружок)')}`);
  return lines;
}
