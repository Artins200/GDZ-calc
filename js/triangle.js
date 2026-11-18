/* =========================================================================
 * triangle.js — идеальный чертёж треугольника по условию задачи.
 *
 * Рисует треугольник так, как его нужно в тетради: вершины A, B, C, стороны,
 * углы (дуги с градусами), прямой угол — квадратиком, равные стороны —
 * засечками. Масштаб считается автоматически, поэтому можно просто «срисовывать».
 *
 * Три способа задания:
 *   sss — по трём сторонам (a, b, c);
 *   sas — по двум сторонам и углу между ними (b = AC, c = AB, угол A);
 *   asa — по стороне и двум углам (c = AB, углы A и B).
 *
 * Чистый модуль: ни DOM, ни canvas — только математика и SVG-строка.
 * ========================================================================= */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const fmtN = (v, d = 2) => {
  if (!Number.isFinite(v)) return '—';
  const p = 10 ** d;
  return String(Math.round(v * p) / p).replace('.', ',');
};

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const angleAt = (p, v, q) => {
  // угол при вершине v в треугольнике p-v-q
  const v1 = { x: p.x - v.x, y: p.y - v.y };
  const v2 = { x: q.x - v.x, y: q.y - v.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  const c = Math.min(1, Math.max(-1, dot / m));
  return Math.acos(c) * R2D;
};

const validAngles = (A, B, C) => [A, B, C].every((x) => Number.isFinite(x) && x > 0) && Math.abs(A + B + C - 180) < 1e-6;

/** По трём сторонам. */
export function triangleBySides(a, b, c) {
  a = Number(a); b = Number(b); c = Number(c);
  if (![a, b, c].every((x) => Number.isFinite(x) && x > 0)) {
    return { ok: false, error: 'Стороны должны быть положительными числами.' };
  }
  if (a + b <= c || a + c <= b || b + c <= a) {
    return { ok: false, error: 'Такого треугольника не существует: сумма двух любых сторон должна быть больше третьей (неравенство треугольника).' };
  }
  const A = { x: 0, y: 0 };
  const B = { x: c, y: 0 };
  const x = (b * b + c * c - a * a) / (2 * c);
  const y2 = b * b - x * x;
  const C = { x, y: Math.sqrt(Math.max(0, y2)) };
  return makeTri(A, B, C);
}

/** По двум сторонам и углу между ними (b = AC, c = AB, angleA в градусах). */
export function triangleBySAS(b, c, angleA) {
  b = Number(b); c = Number(c); angleA = Number(angleA);
  if (![b, c, angleA].every(Number.isFinite) || b <= 0 || c <= 0) {
    return { ok: false, error: 'Стороны должны быть положительными числами.' };
  }
  if (angleA <= 0 || angleA >= 180) {
    return { ok: false, error: 'Угол между сторонами должен быть от 0° до 180° (не включая концы).' };
  }
  const A = { x: 0, y: 0 };
  const B = { x: c, y: 0 };
  const C = { x: b * Math.cos(angleA * D2R), y: b * Math.sin(angleA * D2R) };
  return makeTri(A, B, C);
}

/** По стороне и двум углам (c = AB, углы A и B у её концов, в градусах). */
export function triangleByASA(c, angleA, angleB) {
  c = Number(c); angleA = Number(angleA); angleB = Number(angleB);
  if (![c, angleA, angleB].every(Number.isFinite) || c <= 0) {
    return { ok: false, error: 'Сторона должна быть положительным числом.' };
  }
  const angleC = 180 - angleA - angleB;
  if (angleA <= 0 || angleB <= 0 || angleC <= 0) {
    return { ok: false, error: 'Сумма двух углов должна быть меньше 180°, сам угол — больше 0°.' };
  }
  const A = { x: 0, y: 0 };
  const B = { x: c, y: 0 };
  const b = (c * Math.sin(angleB * D2R)) / Math.sin(angleC * D2R);
  const C = { x: b * Math.cos(angleA * D2R), y: b * Math.sin(angleA * D2R) };
  return makeTri(A, B, C);
}

/** Собирает треугольник: вершины, стороны, углы, площадь, тип. */
function makeTri(A, B, C) {
  const a = dist(B, C);
  const b = dist(A, C);
  const c = dist(A, B);
  const alpha = angleAt(B, A, C); // при A
  const beta = angleAt(A, B, C);  // при B
  const gamma = angleAt(A, C, B); // при C
  if (!validAngles(alpha, beta, gamma)) return { ok: false, error: 'Не удалось построить треугольник: проверьте данные.' };
  const area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
  const maxAngle = Math.max(alpha, beta, gamma);
  const sides = [a, b, c];
  const eq12 = Math.abs(a - b) < 1e-9, eq13 = Math.abs(a - c) < 1e-9, eq23 = Math.abs(b - c) < 1e-9;
  const isEqui = eq12 && eq13;
  const isIso = !isEqui && (eq12 || eq13 || eq23);
  const isRight = Math.abs(maxAngle - 90) < 1e-6;
  let kind = isEqui ? 'равносторонний' : isIso ? 'равнобедренный' : 'разносторонний';
  if (isRight) kind += ', прямоугольный';
  else if (maxAngle > 90) kind += ', тупоугольный';
  else kind += ', остроугольный';
  return {
    ok: true,
    A, B, C,
    sides: { a, b, c },
    angles: { alpha, beta, gamma },
    perimeter: a + b + c,
    area,
    kind,
  };
}

export function triangleStats(tri) {
  if (!tri?.ok) return null;
  return [
    `Стороны: a = ${fmtN(tri.sides.a)}, b = ${fmtN(tri.sides.b)}, c = ${fmtN(tri.sides.c)}`,
    `Углы: ∠A = ${fmtN(tri.angles.alpha, 1)}°, ∠B = ${fmtN(tri.angles.beta, 1)}°, ∠C = ${fmtN(tri.angles.gamma, 1)}°`,
    `Периметр: P = ${fmtN(tri.perimeter)}`,
    `Площадь: S = ${fmtN(tri.area)}`,
    `Вид: ${tri.kind}`,
  ];
}

const escSvg = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** SVG-чертёж «как в тетради». */
export function triangleSVG(tri, opts = {}) {
  if (!tri?.ok) return '';
  const W = opts.width || 340, H = opts.height || 240, pad = 42;
  const pts = [tri.A, tri.B, tri.C];
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const scale = Math.min((W - 2 * pad) / Math.max(1e-9, maxX - minX), (H - 2 * pad) / Math.max(1e-9, maxY - minY));
  // центрируем и переворачиваем y (в SVG ось y вниз)
  const ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (H + (maxY - minY) * scale) / 2 - maxY * scale;
  const P = (p) => ({ x: p.x * scale + ox, y: -p.y * scale + oy });
  const A = P(tri.A), B = P(tri.B), C = P(tri.C);

  const INK = '#e8e9ec', MUT = '#8a8f9c', ACC = '#ff9f0a', FILL = 'rgba(255,159,10,.13)', LINE = '#ff9f0a';

  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const outNorm = (p, q) => {
    // единичный нормальный вектор к отрезку, направленный ОТ центра треугольника
    const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    let nx = -(q.y - p.y), ny = q.x - p.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if (nx * (cx - mx) + ny * (cy - my) > 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  };
  const sideLabel = (p, q, text) => {
    const m = mid(p, q), n = outNorm(p, q);
    return `<text x="${m.x + n.x * 14}" y="${m.y + n.y * 14 + 3}" fill="${ACC}" font-size="11.5" font-weight="700" text-anchor="middle">${escSvg(text)}</text>`;
  };
  const vertexLabel = (p, others, text) => {
    const m = mid(others[0], others[1]);
    let dx = p.x - m.x, dy = p.y - m.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    return `<text x="${p.x + dx * 13}" y="${p.y + dy * 13 + 4}" fill="${INK}" font-size="12.5" font-weight="800" text-anchor="middle">${escSvg(text)}</text>`;
  };
  // дуга угла при вершине v
  const arcAt = (v, p1, p2, label, r = 16) => {
    const u1 = { x: p1.x - v.x, y: p1.y - v.y }, u2 = { x: p2.x - v.x, y: p2.y - v.y };
    const l1 = Math.hypot(u1.x, u1.y) || 1, l2 = Math.hypot(u2.x, u2.y) || 1;
    const a1 = Math.atan2(u1.y / l1, u1.x / l1), a2 = Math.atan2(u2.y / l2, u2.x / l2);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const large = Math.abs(d) > Math.PI ? 1 : 0;
    const sweep = d >= 0 ? 1 : 0;
    const p = (ang, rr) => `${(v.x + rr * Math.cos(ang)).toFixed(1)},${(v.y + rr * Math.sin(ang)).toFixed(1)}`;
    const bis = a1 + d / 2;
    const tx = v.x + (r + 13) * Math.cos(bis), ty = v.y + (r + 13) * Math.sin(bis);
    return `<path d="M ${p(a1, r)} A ${r} ${r} 0 ${large} ${sweep} ${p(a2, r)}" fill="none" stroke="${MUT}" stroke-width="1.4"/>`
      + `<text x="${tx}" y="${ty + 3}" fill="${MUT}" font-size="9.5" text-anchor="middle">${escSvg(label)}</text>`;
  };
  // квадратик прямого угла
  const rightMark = (v, p1, p2, s = 10) => {
    const u1 = { x: p1.x - v.x, y: p1.y - v.y }, u2 = { x: p2.x - v.x, y: p2.y - v.y };
    const l1 = Math.hypot(u1.x, u1.y) || 1, l2 = Math.hypot(u2.x, u2.y) || 1;
    const a = { x: (u1.x / l1) * s, y: (u1.y / l1) * s };
    const b = { x: (u2.x / l2) * s, y: (u2.y / l2) * s };
    return `<path d="M ${v.x + a.x},${v.y + a.y} L ${v.x + a.x + b.x},${v.y + a.y + b.y} L ${v.x + b.x},${v.y + b.y}" fill="none" stroke="${ACC}" stroke-width="1.6"/>`;
  };
  // засечки на равных сторонах
  const tick = (p, q, n) => {
    const m = mid(p, q), nv = outNorm(p, q);
    // направление по отрезку
    let tx = q.x - p.x, ty = q.y - p.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    let out = '';
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 6;
      const cx = m.x + tx * off, cy = m.y + ty * off;
      out += `<line x1="${cx - nv.x * 5}" y1="${cy - nv.y * 5}" x2="${cx + nv.x * 5}" y2="${cy + nv.y * 5}" stroke="${INK}" stroke-width="1.6"/>`;
    }
    return out;
  };

  const { a, b, c } = tri.sides;
  const eqAB = Math.abs(a - b) < 1e-6, eqAC = Math.abs(a - c) < 1e-6, eqBC = Math.abs(b - c) < 1e-6;
  // a=BC (сторона a — против A), b=CA, c=AB
  const angleRight = (v, p, q) => Math.abs(angleAt(p, v, q) - 90) < 1e-6;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Чертёж треугольника" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#161a20"/>`;
  svg += `<polygon points="${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}" fill="${FILL}" stroke="${LINE}" stroke-width="2.2" stroke-linejoin="round"/>`;
  // углы: дуга или квадратик
  const arcR = 15;
  if (angleRight(A, B, C)) svg += rightMark(A, B, C); else svg += arcAt(A, B, C, `${fmtN(tri.angles.alpha, 1)}°`, arcR);
  if (angleRight(B, A, C)) svg += rightMark(B, A, C); else svg += arcAt(B, A, C, `${fmtN(tri.angles.beta, 1)}°`, arcR);
  if (angleRight(C, A, B)) svg += rightMark(C, A, B); else svg += arcAt(C, A, B, `${fmtN(tri.angles.gamma, 1)}°`, arcR);
  // стороны
  svg += sideLabel(B, C, `a=${fmtN(a)}`);
  svg += sideLabel(A, C, `b=${fmtN(b)}`);
  svg += sideLabel(A, B, `c=${fmtN(c)}`);
  // засечки равных сторон
  if (eqAB) { svg += tick(B, C, 1); svg += tick(A, C, 1); } else if (eqAC) { svg += tick(B, C, 2); svg += tick(A, B, 2); } else if (eqBC) { svg += tick(A, C, 3); svg += tick(A, B, 3); }
  // вершины
  svg += vertexLabel(A, [B, C], 'A');
  svg += vertexLabel(B, [A, C], 'B');
  svg += vertexLabel(C, [A, B], 'C');
  svg += `</svg>`;
  return svg;
}
