/* =========================================================================
 * geo.js — режим «Геометрия» по учебнику Атанасяна «Геометрия 7—9»
 * (Просвещение, 2023, 416 с.).
 *
 * Каждая задача оформляется как в тетради: «Дано — Найти — Решение — Ответ».
 * Поддержаны: углы (смежные, вертикальные, биссектриса), треугольники
 * (периметр, площадь, равнобедренный, признаки равенства), прямоугольный
 * треугольник (Пифагор, тригонометрия), параллельные прямые, окружность и
 * круг, четырёхугольники, подобие, теоремы синусов и косинусов, площади
 * поверхности и объёмы тел.
 * ========================================================================= */

const fmtN = (v) => {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 1e4) / 1e4;
  return String(r).replace('.', ',');
};
const nums = (s) => [...String(s).replace(/,/g, '.').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

export function geoCard({ title, given, find, solution, answer, formulas = [], figure = '' }) {
  return { title, given, find, solution, answer, formulas, figure };
}

/* ------------------------------------------------------------- углы */
export function adjacentAngles(a) {
  const b = 180 - a;
  return geoCard({
    title: 'Смежные углы',
    given: [{ label: '∠1', value: `${fmtN(a)}°` }],
    find: [{ label: '∠2', value: '?' }],
    formulas: ['∠1 + ∠2 = 180° (смежные углы)'],
    solution: [
      `Смежные углы в сумме дают развёрнутый угол: ∠1 + ∠2 = 180°.`,
      `∠2 = 180° − ${fmtN(a)}° = ${fmtN(b)}°.`,
    ],
    answer: `∠2 = ${fmtN(b)}°`,
  });
}

export function verticalAngles(a) {
  return geoCard({
    title: 'Вертикальные углы',
    given: [{ label: '∠1', value: `${fmtN(a)}°` }],
    find: [{ label: '∠2, ∠3, ∠4', value: '?' }],
    formulas: ['вертикальные углы равны', 'смежные дают 180°'],
    solution: [
      `Вертикальный угол равен данному: ∠3 = ∠1 = ${fmtN(a)}°.`,
      `Соседние с ним углы смежные: ∠2 = ∠4 = 180° − ${fmtN(a)}° = ${fmtN(180 - a)}°.`,
    ],
    answer: `∠2 = ∠4 = ${fmtN(180 - a)}°, ∠3 = ${fmtN(a)}°`,
  });
}

export function bisectorAngle(a) {
  const half = a / 2;
  return geoCard({
    title: 'Биссектриса угла',
    given: [{ label: '∠AOB', value: `${fmtN(a)}°` }, { label: 'OC', value: 'биссектриса' }],
    find: [{ label: '∠AOC', value: '?' }],
    formulas: ['биссектриса делит угол пополам'],
    solution: [`∠AOC = ∠AOB / 2 = ${fmtN(a)}° / 2 = ${fmtN(half)}°.`],
    answer: `∠AOC = ∠BOC = ${fmtN(half)}°`,
  });
}

export function triangleAngles(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const c = 180 - a - b;
  if (c <= 0) return null;
  return geoCard({
    title: 'Сумма углов треугольника',
    given: [{ label: '∠A', value: `${fmtN(a)}°` }, { label: '∠B', value: `${fmtN(b)}°` }],
    find: [{ label: '∠C', value: '?' }],
    formulas: ['∠A + ∠B + ∠C = 180°'],
    solution: [`∠C = 180° − (${fmtN(a)}° + ${fmtN(b)}°) = ${fmtN(c)}°.`],
    answer: `∠C = ${fmtN(c)}°`,
  });
}

/* -------------------------------------------------------- треугольники */
export function trianglePerimeter(a, b, c) {
  if (![a, b, c].every((x) => Number.isFinite(x) && x > 0)) return null;
  if (a + b <= c || a + c <= b || b + c <= a) return {
    error: 'Такого треугольника не существует: сумма двух сторон должна быть больше третьей (неравенство треугольника).',
  };
  const p = a + b + c;
  return geoCard({
    title: 'Периметр треугольника',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: 'b', value: `${fmtN(b)} см` }, { label: 'c', value: `${fmtN(c)} см` }],
    find: [{ label: 'P', value: '?' }],
    formulas: ['P = a + b + c'],
    solution: [`P = ${fmtN(a)} + ${fmtN(b)} + ${fmtN(c)} = ${fmtN(p)} см.`],
    answer: `P = ${fmtN(p)} см`,
  });
}

export function triangleArea(base, height) {
  const s = (base * height) / 2;
  return geoCard({
    title: 'Площадь треугольника',
    given: [{ label: 'a', value: `${fmtN(base)} см` }, { label: 'h', value: `${fmtN(height)} см` }],
    find: [{ label: 'S', value: '?' }],
    formulas: ['S = ½·a·h'],
    solution: [`S = ½ · ${fmtN(base)} · ${fmtN(height)} = ${fmtN(s)} см².`],
    answer: `S = ${fmtN(s)} см²`,
  });
}

export function triangleHeron(a, b, c) {
  if (a + b <= c || a + c <= b || b + c <= a) return { error: 'Такого треугольника не существует (неравенство треугольника).' };
  const p = (a + b + c) / 2;
  const s = Math.sqrt(p * (p - a) * (p - b) * (p - c));
  return geoCard({
    title: 'Площадь треугольника по трём сторонам (формула Герона)',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: 'b', value: `${fmtN(b)} см` }, { label: 'c', value: `${fmtN(c)} см` }],
    find: [{ label: 'S', value: '?' }],
    formulas: ['p = (a+b+c)/2', 'S = √(p(p−a)(p−b)(p−c))'],
    solution: [
      `Полупериметр: p = (${fmtN(a)} + ${fmtN(b)} + ${fmtN(c)})/2 = ${fmtN(p)} см.`,
      `S = √(${fmtN(p)}·${fmtN(p - a)}·${fmtN(p - b)}·${fmtN(p - c)}) = √${fmtN(p * (p - a) * (p - b) * (p - c))} = ${fmtN(s)} см².`,
    ],
    answer: `S = ${fmtN(s)} см²`,
  });
}

export function isoscelesTriangle(base, side) {
  const h = Math.sqrt(Math.max(0, side * side - (base / 2) ** 2));
  const p = base + 2 * side;
  const s = (base * h) / 2;
  return geoCard({
    title: 'Равнобедренный треугольник',
    given: [{ label: 'основание AC', value: `${fmtN(base)} см` }, { label: 'боковая сторона AB = BC', value: `${fmtN(side)} см` }],
    find: [{ label: 'P', value: '?' }, { label: 'h, S', value: '?' }],
    formulas: ['P = a + 2b', 'h = √(b² − (a/2)²)', 'S = ½·a·h'],
    solution: [
      `P = ${fmtN(base)} + 2·${fmtN(side)} = ${fmtN(p)} см.`,
      `Высота к основанию делит его пополам, значит h = √(${fmtN(side)}² − ${fmtN(base / 2)}²) = ${fmtN(h)} см.`,
      `S = ½ · ${fmtN(base)} · ${fmtN(h)} = ${fmtN(s)} см².`,
      `Углы при основании равны: ∠A = ∠C.`,
    ],
    answer: `P = ${fmtN(p)} см, S = ${fmtN(s)} см², h = ${fmtN(h)} см`,
  });
}

export function rightTriangle(a, b) {
  const c = Math.hypot(a, b);
  const s = (a * b) / 2;
  const p = a + b + c;
  return geoCard({
    title: 'Прямоугольный треугольник (теорема Пифагора)',
    given: [{ label: 'катет a', value: `${fmtN(a)} см` }, { label: 'катет b', value: `${fmtN(b)} см` }],
    find: [{ label: 'гипотенуза c', value: '?' }, { label: 'S, P', value: '?' }],
    formulas: ['c² = a² + b²', 'S = ½ab', 'P = a + b + c'],
    solution: [
      `c² = ${fmtN(a)}² + ${fmtN(b)}² = ${fmtN(a * a + b * b)}.`,
      `c = √${fmtN(a * a + b * b)} = ${fmtN(c)} см.`,
      `S = ½ · ${fmtN(a)} · ${fmtN(b)} = ${fmtN(s)} см².`,
      `P = ${fmtN(a)} + ${fmtN(b)} + ${fmtN(c)} = ${fmtN(p)} см.`,
    ],
    answer: `c = ${fmtN(c)} см, S = ${fmtN(s)} см², P = ${fmtN(p)} см`,
  });
}

export function legFromHypotenuse(c, a) {
  if (!(c > a)) return { error: 'Гипотенуза должна быть больше катета.' };
  const b = Math.sqrt(c * c - a * a);
  return geoCard({
    title: 'Катет по гипотенузе и катету',
    given: [{ label: 'c', value: `${fmtN(c)} см` }, { label: 'a', value: `${fmtN(a)} см` }],
    find: [{ label: 'b', value: '?' }],
    formulas: ['b² = c² − a²'],
    solution: [`b = √(${fmtN(c)}² − ${fmtN(a)}²) = √${fmtN(c * c - a * a)} = ${fmtN(b)} см.`],
    answer: `b = ${fmtN(b)} см`,
  });
}

/** Соотношения в прямоугольном треугольнике: sin = противолежащий / гипотенуза. */
export function trigSide(hypotenuse, angleDeg, { find = 'opposite' } = {}) {
  const rad = (angleDeg * Math.PI) / 180;
  const opposite = hypotenuse * Math.sin(rad);
  const adjacent = hypotenuse * Math.cos(rad);
  const value = find === 'adjacent' ? adjacent : find === 'hypotenuseOpp' ? opposite / Math.sin(rad) : opposite;
  return geoCard({
    title: 'Прямоугольный треугольник: синус и косинус',
    given: find === 'adjacent'
      ? [{ label: 'гипотенуза c', value: `${fmtN(hypotenuse)} см` }, { label: '∠A', value: `${fmtN(angleDeg)}°` }]
      : [{ label: 'угол', value: `${fmtN(angleDeg)}°` }, { label: 'гипотенуза', value: `${fmtN(hypotenuse)} см` }],
    find: [{ label: find === 'adjacent' ? 'катет b (прилежащий)' : 'катет a (противолежащий)', value: '?' }],
    formulas: ['sin A = a/c', 'cos A = b/c'],
    solution: [
      find === 'adjacent'
        ? `b = c · cos A = ${fmtN(hypotenuse)} · cos ${fmtN(angleDeg)}° = ${fmtN(adjacent)} см.`
        : `a = c · sin A = ${fmtN(hypotenuse)} · sin ${fmtN(angleDeg)}° = ${fmtN(opposite)} см.`,
    ],
    answer: find === 'adjacent' ? `b = ${fmtN(adjacent)} см` : `a = ${fmtN(opposite)} см`,
  });
}

export function sineTheorem(a, angleA, angleB) {
  const b = (a * Math.sin((angleB * Math.PI) / 180)) / Math.sin((angleA * Math.PI) / 180);
  const R = a / (2 * Math.sin((angleA * Math.PI) / 180));
  return geoCard({
    title: 'Теорема синусов',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: '∠A', value: `${fmtN(angleA)}°` }, { label: '∠B', value: `${fmtN(angleB)}°` }],
    find: [{ label: 'b', value: '?' }, { label: 'R', value: '?' }],
    formulas: ['a/sin A = b/sin B = 2R'],
    solution: [
      `b = a · sin B / sin A = ${fmtN(a)} · sin ${fmtN(angleB)}° / sin ${fmtN(angleA)}° = ${fmtN(b)} см.`,
      `R = a/(2 sin A) = ${fmtN(R)} см.`,
    ],
    answer: `b = ${fmtN(b)} см, R = ${fmtN(R)} см`,
  });
}

export function cosineTheorem(b, c, angleA) {
  const rad = (angleA * Math.PI) / 180;
  const a = Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(rad));
  return geoCard({
    title: 'Теорема косинусов',
    given: [{ label: 'b', value: `${fmtN(b)} см` }, { label: 'c', value: `${fmtN(c)} см` }, { label: '∠A', value: `${fmtN(angleA)}°` }],
    find: [{ label: 'a', value: '?' }],
    formulas: ['a² = b² + c² − 2bc·cos A'],
    solution: [
      `a² = ${fmtN(b)}² + ${fmtN(c)}² − 2·${fmtN(b)}·${fmtN(c)}·cos ${fmtN(angleA)}° = ${fmtN(a * a)}.`,
      `a = ${fmtN(a)} см.`,
    ],
    answer: `a = ${fmtN(a)} см`,
  });
}

/* ------------------------------------------------------ окружность */
export function circle(a, { isDiameter = false } = {}) {
  const r = isDiameter ? a / 2 : a;
  const C = 2 * Math.PI * r;
  const S = Math.PI * r * r;
  return geoCard({
    title: 'Длина окружности и площадь круга',
    given: [{ label: isDiameter ? 'd' : 'r', value: `${fmtN(a)} см` }],
    find: [{ label: 'C', value: '?' }, { label: 'S', value: '?' }],
    formulas: ['C = 2πr', 'S = πr²'],
    solution: [
      isDiameter ? `Радиус r = d/2 = ${fmtN(r)} см.` : `Радиус r = ${fmtN(r)} см.`,
      `C = 2 · π · ${fmtN(r)} = ${fmtN(C)} см.`,
      `S = π · ${fmtN(r)}² = ${fmtN(S)} см².`,
    ],
    answer: `C = ${fmtN(C)} см, S = ${fmtN(S)} см²`,
  });
}

export function sector(r, angleDeg) {
  const S = (Math.PI * r * r * angleDeg) / 360;
  const L = (2 * Math.PI * r * angleDeg) / 360;
  return geoCard({
    title: 'Сектор круга',
    given: [{ label: 'r', value: `${fmtN(r)} см` }, { label: '∠', value: `${fmtN(angleDeg)}°` }],
    find: [{ label: 'S сектора', value: '?' }, { label: 'дуга', value: '?' }],
    formulas: ['S = πr²·α/360', 'L = 2πr·α/360'],
    solution: [
      `S = π·${fmtN(r)}²·${fmtN(angleDeg)}/360 = ${fmtN(S)} см².`,
      `Длина дуги L = 2π·${fmtN(r)}·${fmtN(angleDeg)}/360 = ${fmtN(L)} см.`,
    ],
    answer: `S = ${fmtN(S)} см², L = ${fmtN(L)} см`,
  });
}

/* ------------------------------------------------- четырёхугольники */
export function rectangle(a, b) {
  return geoCard({
    title: 'Прямоугольник',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: 'b', value: `${fmtN(b)} см` }],
    find: [{ label: 'S', value: '?' }, { label: 'P', value: '?' }, { label: 'd', value: '?' }],
    formulas: ['S = ab', 'P = 2(a+b)', 'd = √(a²+b²)'],
    solution: [
      `S = ${fmtN(a)} · ${fmtN(b)} = ${fmtN(a * b)} см².`,
      `P = 2(${fmtN(a)} + ${fmtN(b)}) = ${fmtN(2 * (a + b))} см.`,
      `d = √(${fmtN(a)}² + ${fmtN(b)}²) = ${fmtN(Math.hypot(a, b))} см.`,
    ],
    answer: `S = ${fmtN(a * b)} см², P = ${fmtN(2 * (a + b))} см, d = ${fmtN(Math.hypot(a, b))} см`,
  });
}

export function parallelogram(a, b, height, angleDeg) {
  const S = a * height;
  const S2 = Number.isFinite(angleDeg) ? a * b * Math.sin((angleDeg * Math.PI) / 180) : null;
  return geoCard({
    title: 'Параллелограмм',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: 'b', value: `${fmtN(b)} см` }, { label: 'h', value: `${fmtN(height)} см` }],
    find: [{ label: 'S', value: '?' }, { label: 'P', value: '?' }],
    formulas: ['S = a·h', 'S = ab·sin A', 'P = 2(a+b)'],
    solution: [
      `S = ${fmtN(a)} · ${fmtN(height)} = ${fmtN(S)} см².`,
      S2 !== null ? `Проверка через угол: S = ${fmtN(a)}·${fmtN(b)}·sin ${fmtN(angleDeg)}° = ${fmtN(S2)} см².` : '',
      `P = 2(${fmtN(a)} + ${fmtN(b)}) = ${fmtN(2 * (a + b))} см.`,
    ].filter(Boolean),
    answer: `S = ${fmtN(S)} см², P = ${fmtN(2 * (a + b))} см`,
  });
}

export function trapezoid(a, b, h) {
  const S = ((a + b) / 2) * h;
  const mid = (a + b) / 2;
  return geoCard({
    title: 'Трапеция',
    given: [{ label: 'основание a', value: `${fmtN(a)} см` }, { label: 'основание b', value: `${fmtN(b)} см` }, { label: 'высота h', value: `${fmtN(h)} см` }],
    find: [{ label: 'S', value: '?' }, { label: 'средняя линия m', value: '?' }],
    formulas: ['S = ½(a+b)h', 'm = (a+b)/2'],
    solution: [
      `m = (${fmtN(a)} + ${fmtN(b)})/2 = ${fmtN(mid)} см.`,
      `S = ${fmtN(mid)} · ${fmtN(h)} = ${fmtN(S)} см².`,
    ],
    answer: `S = ${fmtN(S)} см², m = ${fmtN(mid)} см`,
  });
}

export function rhombus(d1, d2) {
  const S = (d1 * d2) / 2;
  const a = Math.hypot(d1 / 2, d2 / 2);
  return geoCard({
    title: 'Ромб',
    given: [{ label: 'd₁', value: `${fmtN(d1)} см` }, { label: 'd₂', value: `${fmtN(d2)} см` }],
    find: [{ label: 'S', value: '?' }, { label: 'сторона a', value: '?' }],
    formulas: ['S = ½·d₁·d₂', 'a = √((d₁/2)² + (d₂/2)²)'],
    solution: [
      `S = ½ · ${fmtN(d1)} · ${fmtN(d2)} = ${fmtN(S)} см².`,
      `Диагонали перпендикулярны и делятся пополам, поэтому a = √(${fmtN(d1 / 2)}² + ${fmtN(d2 / 2)}²) = ${fmtN(a)} см.`,
    ],
    answer: `S = ${fmtN(S)} см², a = ${fmtN(a)} см`,
  });
}

/* -------------------------------------------------- подобие и объёмы */
export function similarity(k, value, what = 'площадь') {
  if (what === 'объём') {
    const v = k ** 3;
    return geoCard({
      title: 'Подобие тел',
      given: [{ label: 'k', value: fmtN(k) }],
      find: [{ label: `во сколько раз изменится объём`, value: '?' }],
      formulas: ['V₂/V₁ = k³'],
      solution: [`Объём меняется как куб коэффициента подобия: k³ = ${fmtN(k)}³ = ${fmtN(v)}.`],
      answer: `объём в ${fmtN(v)} ${value === 1 ? 'раза' : 'раз'}`,
    });
  }
  return geoCard({
    title: 'Подобие фигур',
    given: [{ label: 'k', value: fmtN(k) }],
    find: [{ label: 'во сколько раз изменится площадь', value: '?' }],
    formulas: ['S₂/S₁ = k²'],
    solution: [`Площадь меняется как квадрат коэффициента подобия: k² = ${fmtN(k)}² = ${fmtN(k * k)}.`],
    answer: `площадь в ${fmtN(k * k)} раз`,
  });
}

export function boxSurfaceVolume(a, b, c) {
  const S = 2 * (a * b + b * c + a * c);
  const V = a * b * c;
  return geoCard({
    title: 'Прямоугольный параллелепипед',
    given: [{ label: 'a', value: `${fmtN(a)} см` }, { label: 'b', value: `${fmtN(b)} см` }, { label: 'c', value: `${fmtN(c)} см` }],
    find: [{ label: 'S поверхности', value: '?' }, { label: 'V', value: '?' }],
    formulas: ['S = 2(ab + bc + ac)', 'V = abc'],
    solution: [
      `S = 2(${fmtN(a * b)} + ${fmtN(b * c)} + ${fmtN(a * c)}) = ${fmtN(S)} см².`,
      `V = ${fmtN(a)} · ${fmtN(b)} · ${fmtN(c)} = ${fmtN(V)} см³.`,
    ],
    answer: `S = ${fmtN(S)} см², V = ${fmtN(V)} см³`,
  });
}

export function cylinderVolume(r, h) {
  const V = Math.PI * r * r * h;
  const S = 2 * Math.PI * r * (r + h);
  return geoCard({
    title: 'Цилиндр',
    given: [{ label: 'r', value: `${fmtN(r)} см` }, { label: 'h', value: `${fmtN(h)} см` }],
    find: [{ label: 'V', value: '?' }, { label: 'S полная', value: '?' }],
    formulas: ['V = πr²h', 'S = 2πr(r+h)'],
    solution: [
      `V = π·${fmtN(r)}²·${fmtN(h)} = ${fmtN(V)} см³.`,
      `S = 2π·${fmtN(r)}·(${fmtN(r)} + ${fmtN(h)}) = ${fmtN(S)} см².`,
    ],
    answer: `V = ${fmtN(V)} см³, S = ${fmtN(S)} см²`,
  });
}

export function coneVolume(r, h) {
  const V = (Math.PI * r * r * h) / 3;
  const l = Math.hypot(r, h);
  return geoCard({
    title: 'Конус',
    given: [{ label: 'r', value: `${fmtN(r)} см` }, { label: 'h', value: `${fmtN(h)} см` }],
    find: [{ label: 'V', value: '?' }, { label: 'образующая l', value: '?' }],
    formulas: ['V = πr²h/3', 'l = √(r²+h²)'],
    solution: [
      `V = π·${fmtN(r)}²·${fmtN(h)}/3 = ${fmtN(V)} см³.`,
      `l = √(${fmtN(r)}² + ${fmtN(h)}²) = ${fmtN(l)} см.`,
    ],
    answer: `V = ${fmtN(V)} см³, l = ${fmtN(l)} см`,
  });
}

export function sphereVolume(r) {
  const V = (4 / 3) * Math.PI * r ** 3;
  const S = 4 * Math.PI * r * r;
  return geoCard({
    title: 'Шар и сфера',
    given: [{ label: 'r', value: `${fmtN(r)} см` }],
    find: [{ label: 'V', value: '?' }, { label: 'S сферы', value: '?' }],
    formulas: ['V = 4/3·πr³', 'S = 4πr²'],
    solution: [
      `V = 4/3 · π · ${fmtN(r)}³ = ${fmtN(V)} см³.`,
      `S = 4π·${fmtN(r)}² = ${fmtN(S)} см².`,
    ],
    answer: `V = ${fmtN(V)} см³, S = ${fmtN(S)} см²`,
  });
}

/* --------------------------------------------- распознавание по тексту */
export function solveGeoTask(raw) {
  const src = String(raw || '').replace(/ё/gi, 'е');
  const s = src.toLowerCase().replace(/\s+/g, ' ');
  const N = nums(src);
  const has = (re) => re.test(s);

  const kind = (() => {
    if (has(/смежн/)) return 'adjacent';
    if (has(/вертикальн/)) return 'vertical';
    if (has(/биссектрис/) && has(/угол/)) return 'bisector';
    if (has(/прямоугольн\w*\s+треугольник|катет|гипотенуз/)) return 'right';
    if (has(/треугольник/)) {
      if (has(/герон/)) return 'heron';
      if (has(/равнобедрен/)) return 'isosceles';
      if (has(/площад/)) return 'tri_area';
      if (has(/периметр/)) return 'tri_perimeter';
      if (has(/угол|∠|градус/)) return 'tri_angles';
      return 'tri_area';
    }
    if (has(/окружност|круг|радиус|диаметр|сектор|дуг/)) return has(/сектор|дуг/) ? 'sector' : 'circle';
    if (has(/прямоугольник/)) return 'rectangle';
    if (has(/параллелограмм/)) return 'parallelogram';
    if (has(/трапеци/)) return 'trapezoid';
    if (has(/ромб/)) return 'rhombus';
    if (has(/параллелепипед|куб/)) return 'box';
    if (has(/цилиндр/)) return 'cylinder';
    if (has(/конус/)) return 'cone';
    if (has(/шар|сфер/)) return 'sphere';
    if (has(/подоби|в\s*\d+\s*раз\w*\s*(больше|меньше)/)) return 'similarity';
    return null;
  })();
  if (!kind) return null;

  switch (kind) {
    case 'adjacent': return N.length ? adjacentAngles(N[0]) : null;
    case 'vertical': return N.length ? verticalAngles(N[0]) : null;
    case 'bisector': return N.length ? bisectorAngle(N[0]) : null;
    case 'tri_angles': return N.length >= 2 ? triangleAngles(N[0], N[1]) : null;
    case 'tri_area': return N.length >= 2 ? triangleArea(N[0], N[1]) : null;
    case 'tri_perimeter': return N.length >= 3 ? trianglePerimeter(N[0], N[1], N[2]) : null;
    case 'heron': return N.length >= 3 ? triangleHeron(N[0], N[1], N[2]) : null;
    case 'isosceles': return N.length >= 2 ? isoscelesTriangle(N[0], N[1]) : null;
    case 'right':
      if (N.length < 2) return null;
      if (has(/гипотенуз/) && !has(/найдите гипотенуз|найти гипотенуз|вычислите гипотенуз/)) {
        return legFromHypotenuse(Math.max(N[0], N[1]), Math.min(N[0], N[1]));
      }
      return rightTriangle(N[0], N[1]);
    case 'sector': return N.length >= 2 ? sector(N[0], N[1]) : null;
    case 'circle': return N.length >= 1 ? circle(N[0], { isDiameter: has(/диаметр/) }) : null;
    case 'rectangle': return N.length >= 2 ? rectangle(N[0], N[1]) : null;
    case 'parallelogram': return N.length >= 2 ? parallelogram(N[0], N[1], N[2] ?? N[1]) : null;
    case 'trapezoid': return N.length >= 3 ? trapezoid(N[0], N[1], N[2]) : null;
    case 'rhombus': return N.length >= 2 ? rhombus(N[0], N[1]) : null;
    case 'box': return N.length >= 3 ? boxSurfaceVolume(N[0], N[1], N[2]) : null;
    case 'cylinder': return N.length >= 2 ? cylinderVolume(N[0], N[1]) : null;
    case 'cone': return N.length >= 2 ? coneVolume(N[0], N[1]) : null;
    case 'sphere': return N.length >= 1 ? sphereVolume(N[0]) : null;
    case 'similarity': {
      const k = Number((s.match(/в\s*(\d+)\s*раз/) || [])[1] || 3);
      return similarity(k, 1, has(/объ[её]м/) ? 'объём' : 'площадь');
    }
    default: return null;
  }
}

/** Каталог быстрых калькуляторов для вкладки «Геометрия». */
export const GEO_TOOLS = [
  { id: 'triangle', title: 'Треугольник: периметр', fields: [['a', 'сторона a', 6], ['b', 'сторона b', 8], ['c', 'сторона c', 10]], run: ([a, b, c]) => trianglePerimeter(a, b, c) },
  { id: 'area', title: 'Площадь треугольника', fields: [['a', 'основание', 8], ['h', 'высота', 5]], run: ([a, h]) => triangleArea(a, h) },
  { id: 'heron', title: 'Формула Герона', fields: [['a', 'a', 5], ['b', 'b', 6], ['c', 'c', 7]], run: ([a, b, c]) => triangleHeron(a, b, c) },
  { id: 'right', title: 'Прямоугольный треугольник', fields: [['a', 'катет a', 3], ['b', 'катет b', 4]], run: ([a, b]) => rightTriangle(a, b) },
  { id: 'isosceles', title: 'Равнобедренный', fields: [['a', 'основание', 8], ['b', 'боковая сторона', 5]], run: ([a, b]) => isoscelesTriangle(a, b) },
  { id: 'angles', title: 'Углы треугольника', fields: [['A', '∠A', 50], ['B', '∠B', 60]], run: ([a, b]) => triangleAngles(a, b) },
  { id: 'adjacent', title: 'Смежные углы', fields: [['A', '∠1', 40]], run: ([a]) => adjacentAngles(a) },
  { id: 'circle', title: 'Круг', fields: [['r', 'радиус', 5]], run: ([r]) => circle(r) },
  { id: 'sector', title: 'Сектор', fields: [['r', 'радиус', 6], ['A', 'угол', 60]], run: ([r, a]) => sector(r, a) },
  { id: 'rectangle', title: 'Прямоугольник', fields: [['a', 'a', 6], ['b', 'b', 4]], run: ([a, b]) => rectangle(a, b) },
  { id: 'trapezoid', title: 'Трапеция', fields: [['a', 'a', 8], ['b', 'b', 5], ['h', 'h', 4]], run: ([a, b, h]) => trapezoid(a, b, h) },
  { id: 'box', title: 'Параллелепипед', fields: [['a', 'a', 3], ['b', 'b', 4], ['c', 'c', 5]], run: ([a, b, c]) => boxSurfaceVolume(a, b, c) },
  { id: 'cylinder', title: 'Цилиндр', fields: [['r', 'r', 3], ['h', 'h', 5]], run: ([r, h]) => cylinderVolume(r, h) },
  { id: 'cone', title: 'Конус', fields: [['r', 'r', 3], ['h', 'h', 4]], run: ([r, h]) => coneVolume(r, h) },
  { id: 'sphere', title: 'Шар', fields: [['r', 'r', 3]], run: ([r]) => sphereVolume(r) },
];
