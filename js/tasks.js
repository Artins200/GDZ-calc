/* =========================================================================
 * tasks.js — решатель текстовых задач: детерминированный парсер шаблонов
 * (не нейросеть). Сопоставление по словам/единицам (км/ч, %, м², …),
 * извлечение чисел, готовое пошаговое решение, варианты «а что если
 * другое число», ранжирование похожих шаблонов, запасной разбор.
 * ========================================================================= */
import {
  fmt, fmtSmart, evaluate, solveEquation, solveSystem, affineCoefficients,
  expandExpression, factorExpression, checkIdentity, gcd, lcm, primeFactors,
  factorizationString, preprocess,
} from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, formulaSearch } from './formulas.js';
import { parseInterval, describeInterval, numberLineSVG, intersect, union } from './intervals.js';

/* ------------------------------------------------------------------ примеры */
export const TASK_EXAMPLES = [
  { label: '№ 190 · шаги', text: 'Сколько километров прошёл человек, если длина его шага 60 см, а сделал он 1800 шагов?', from: 'учебник, с. 44' },
  { label: '№ 187 · вёрсты', text: 'Пользуясь формулой b = 1,067a, выразите в километрах расстояние, равное 12,5 версты.', from: 'учебник, с. 44' },
  { label: '№ 195 · °F', text: 'Какой температуре по Фаренгейту соответствует 4 °C?', from: 'учебник, с. 44' },
  { label: '№ 251 · точки', text: 'Найдите расстояние между точками S(7,45) и D(1,15) на координатной прямой.', from: 'учебник, с. 53' },
  { label: '№ 257 · краска', text: 'Складское помещение имеет длину 6 м, ширину 5 м, высоту 3 м. Сколько банок краски понадобится для покраски стен, если одной банки хватает на 12 м²?', from: 'учебник, с. 54' },
  { label: '№ 277 · скорость', text: 'Автомобиль проехал 390 км за 6,5 ч. Найдите его среднюю скорость.', from: 'учебник, с. 63' },
  { label: '№ 374 · звук', text: 'Найдите, с какой скоростью распространяется звук в зимний день с температурой −35 °C.', from: 'учебник, с. 92' },
  { label: '№ 555 · круг', text: 'Площадь круга вычисляется по формуле S = πr². Как изменится площадь круга, если его радиус увеличить в 3 раза?', from: 'учебник, с. 126' },
  { label: '№ 1115 · система', text: 'В фермерском хозяйстве под гречиху и просо отведено 19 га, причём гречиха занимает на 5 га больше, чем просо. Сколько гектаров отведено под каждую культуру?', from: 'учебник, с. 222' },
  { label: '№ 1126 · навстречу', text: 'Из пунктов A и B, расстояние между которыми 280 км, вышли навстречу друг другу два автомобиля со скоростями 60 км/ч и 80 км/ч. Через сколько часов они встретятся?', from: 'учебник, с. 223' },
  { label: '№ 175 · течение', text: 'За 9 ч по течению реки теплоход проходит тот же путь, что за 11 ч против течения. Найдите собственную скорость теплохода, если скорость течения 2 км/ч.', from: 'учебник, с. 40' },
  { label: '§ 4 · промежуток', text: 'Изобразите на координатной прямой числовой промежуток [−2; 5) и задайте его неравенством.', from: 'учебник, с. 52' },
  { label: '§ 3 · уравнение', text: 'Решите уравнение 5(x − 10) = 2x + 10.', from: 'учебник, с. 38' },
  { label: '§ 11 · ФСУ', text: 'Раскройте скобки и упростите: (2x + 3)².', from: 'учебник, с. 166' },
  { label: '§ 12 · разложение', text: 'Разложите на множители: 49x² − 16.', from: 'учебник, с. 179' },
  { label: '§ 2 · проценты', text: 'Найдите 15% от числа 240.', from: 'учебник, с. 12' },
  { label: 'Остатки · 3 условия', text: 'Найдите наименьшее натуральное число, которое при делении на 3 даёт остаток 1, при делении на 5 — остаток 2, а при делении на 7 — остаток 3.', from: 'своя задача' },
  { label: 'НЕ из учебника · движение', text: 'Велосипедист ехал 2,5 часа со скоростью 18 км/ч. Какое расстояние он проехал?', from: 'своя задача' },
  { label: 'НЕ из учебника · скидка', text: 'Товар стоил 2400 рублей. Цену снизили на 25%. Сколько теперь стоит товар?', from: 'своя задача' },
  { label: 'НЕ из учебника · работа', text: 'Станок изготавливает 45 деталей в час. Сколько деталей он сделает за 8 часов?', from: 'своя задача' },
  { label: 'НЕ из учебника · геометрия', text: 'Найдите площадь прямоугольника со сторонами 12 см и 7,5 см.', from: 'своя задача' },
];

/* ------------------------------------------------------- нормализация текста */
function normalizeText(raw) {
  return String(raw || '')
    .replace(/\u00a0/g, ' ')
    .replace(/ё/g, 'е')
    .replace(/[−–—]/g, '-')
    .replace(/[×∙·]/g, '*')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/⩽|≤/g, '<=')
    .replace(/⩾|≥/g, '>=')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyUnit(word) {
  const w = (word || '').replace(/[.,;:!?)\]}]+$/g, '').trim().toLowerCase();
  if (!w) return '';
  if (/^(км\/ч|км\\ч|км\/час|кмвчас|километр.*час)/.test(w)) return 'kmh';
  // «40/км в час», «40 км/час», «40 км в час» — та же скорость
  if (/^\/?км\s*в\s*час/.test(w) || /^\/км/.test(w)) return 'kmh';
  if (/^(м\/с|м\\с|м\/сек)/.test(w)) return 'ms';
  if (/^%/.test(w)) return 'pct';
  if (/^(процент|проц\.|проц)/.test(w)) return 'pct';
  if (/^(м2|м²|м\^2|кв\.?м|квадратн)/.test(w)) return 'm2';
  if (/^(см2|см²|см\^2)/.test(w)) return 'cm2';
  if (/^(м3|м³|м\^3|куб\.?м|кубическ)/.test(w)) return 'm3';
  if (/^(см3|см³|см\^3)/.test(w)) return 'cm3';
  if (/^(км|километр)/.test(w)) return 'km';
  if (/^(мм|миллиметр)/.test(w)) return 'mm';
  if (/^(см|сантиметр)/.test(w)) return 'cm';
  if (/^(м|метр)/.test(w)) return 'm';
  if (/^(кг|килограмм)/.test(w)) return 'kg';
  if (/^(г|грамм)/.test(w)) return 'g';
  if (/^(т|тонн)/.test(w)) return 't';
  if (/^(год|лет)/.test(w)) return 'year';
  if (/^(ч|час)/.test(w)) return 'h';
  if (/^мин/.test(w)) return 'min';
  if (/^(с|сек)/.test(w)) return 'sec';
  if (/^(р|руб)/.test(w)) return 'rub';
  if (/^га\b/.test(w)) return 'ha';
  if (/^(шт|деталь|детал|издели|станок|компьютер|монет|марк|куст|книг|ящик|банк|шаг|гвозд)/.test(w)) return 'items';
  if (/^(верст|вёрст)/.test(w)) return 'verst';
  if (/^пуд/.test(w)) return 'pood';
  if (/^фунт/.test(w)) return 'pound';
  if (/^дюйм/.test(w)) return 'inch';
  if (/^фут/.test(w)) return 'foot';
  if (/^мил/.test(w)) return 'mile';
  if (/^(°c|градус.*цельс)/.test(w)) return 'celsius';
  if (/^(°f|градус.*фаренг)/.test(w)) return 'fahrenheit';
  if (/^°|^градус/.test(w)) return 'deg';
  if (/^(г\/см3|г\/см³|г\/см\^3)/.test(w)) return 'density';
  if (/^(ч|час)/.test(w)) return 'h';
  return '';
}

function extractNumbers(raw) {
  const out = [];
  // Нормализуем десятичную запятую и типографский минус ДО поиска чисел.
  const norm = String(raw || '')
    .replace(/(\d),\s*(\d)/g, '$1.$2')
    .replace(/[−–—]/g, '-')
    .replace(/\u00a0/g, ' ');
  const re = /(-?\d+(?:\.\d+)?)\s*([^\s,;:!?()\[\]{}=]{0,16})?/g;
  let m;
  while ((m = re.exec(norm)) !== null) {
    const start = m.index;
    const prev = norm[start - 1] || '';
    if (/[a-zа-я_]/i.test(prev)) continue;      // «v1», «x2» — не отдельные числа
    const v = Number(m[1]);
    if (!Number.isFinite(v)) continue;
    let word = m[2] || '';
    if (/^\d/.test(word)) word = '';            // «5 6» — это не единица измерения
    let unit = classifyUnit(word);
    // «2 года», «3 года» — это срок, а не граммы
    if (/^год/.test(word.toLowerCase()) && unit === 'g') unit = 'year';
    if (/^лет/.test(word.toLowerCase()) && !unit) unit = 'year';
    // «скорости 12 и 8 км/ч»: единица стоит только у второго числа — наследуем её
    if (!unit) {
      // единица может идти отдельным словом сразу после числа: «40 /км в час»
      const tailWord = norm.slice(start + m[0].length).match(/^\s*(\/\s*км\s*в\s*час|%|процент\w*|проц\b)/i);
      if (tailWord) unit = classifyUnit(tailWord[1].replace(/\s+/g, ''));
    }
    if (!unit) {
      // и перед числом: «скорость 40», «шанс 95»
      const prevWord = norm.slice(Math.max(0, start - 20), start).toLowerCase();
      if (/процент\w*\s*$|шанс\w*\s*$|вероятност\w*\s*$/.test(prevWord) && !/км/.test(prevWord)) unit = 'pct';
      else if (/скорост\w*\s*$/.test(prevWord) && !/ч/.test(prevWord)) unit = '';
    }
    if (!unit) {
      // «12 и 8 км/ч» — единица стоит только у последнего числа списка
      const tail = norm.slice(start + m[0].length);
      const inherit = tail.match(/^\s*(?:(?:и|или|,|;)\s*)?-?\d+(?:[.,]\d+)?\s*([^\s,;:!?()\[\]{}=]{1,16})/);
      if (inherit) {
        const u = classifyUnit(inherit[1]);
        if (u) unit = u;
      }
    }
    out.push({
      v, unit, raw: m[0],
      index: start,
      before: norm.slice(Math.max(0, start - 45), start).toLowerCase(),
      after: norm.slice(start + m[0].length, start + m[0].length + 45).toLowerCase(),
    });
  }
  return out;
}

function makeContext(raw) {
  const text = normalizeText(raw);
  const nums = extractNumbers(raw);
  const questionMatch = text.match(/(?:найдите|найти|чему равен[оа]?|чему равна|какова|каков|какое|сколько|с какой|за сколько|через сколько|определите|вычислите|как изменится|какая|какой|чему равно)[^?!.]*(?:[?!.]|$)/i);
  const question = questionMatch ? questionMatch[0] : text.slice(Math.max(0, text.length - 90));
  return {
    raw, text, nums, question,
    has: (re) => (typeof re === 'string' ? text.includes(re) : re.test(text)),
    qHas: (re) => (typeof re === 'string' ? question.includes(re) : re.test(question)),
    byUnit: (u) => nums.filter((n) => n.unit === u).map((n) => n.v),
    values: (u) => nums.filter((n) => !u || n.unit === u).map((n) => n.v),
    /** Последнее число с такими единицами (для «сколько ещё через …»). */
    lastByUnit: (units = []) => {
      const c = [...nums].reverse().find((n) => !units.length || units.includes(n.unit));
      return c ? c.v : null;
    },
    first: (u, exclude = []) => {
      const c = nums.find((n) => n.unit === u && !exclude.includes(n.v));
      return c ? c.v : null;
    },
    /**
     * Число с указанной единицей, ближайшее к слову.
     * Сначала ищем число сразу после слова («получили 40», «шанс 95»),
     * и только потом — вообще ближайшее по тексту.
     */
    numClosest: (word, units = []) => {
      const re = new RegExp(word, 'gi');
      const spots = [];
      let m;
      while ((m = re.exec(text)) !== null) spots.push(m.index + m[0].length);
      if (!spots.length) return null;
      const pool = nums.filter((n) => !units.length || units.includes(n.unit));

      // 1) число, стоящее сразу после слова (в пределах 25 символов)
      for (const spot of spots) {
        const tail = text.slice(spot, spot + 40);
        const hit = tail.match(/-?\d+(?:[.,]\d+)?/);
        if (!hit) continue;
        const val = Number(hit[0].replace(',', '.'));
        const found = pool.find((n) => Math.abs(n.v - val) < 1e-9);
        if (found) return found.v;
      }
      // 2) иначе — ближайшее по позиции
      let best = null, bestDist = Infinity;
      for (const n of pool) {
        for (const spot of spots) {
          const d = Math.abs(spot - n.index);
          if (d < bestDist) { bestDist = d; best = n; }
        }
      }
      return best ? best.v : null;
    },
    numNear: (words, units = []) => {
      const c = nums.find((n) => words.some((w) => {
        if (!w) return true;
        const hay = n.before + ' ' + n.after;
        return w.length <= 3
          ? new RegExp(`(^|[^a-zа-я])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zа-я]|$)`, 'i').test(hay)
          : hay.includes(w);
      }) && (!units.length || units.includes(n.unit)));
      return c ? c.v : null;
    },
  };
}

/* -------------------------------------------------------------- утилиты */
const K = {
  kmh: 'км/ч', km: 'км', m: 'м', cm: 'см', h: 'ч', min: 'мин', sec: 'с',
  kg: 'кг', g: 'г', rub: 'р.', pct: '%', m2: 'м²', cm2: 'см²', m3: 'м³', cm3: 'см³',
  items: 'шт.', deg: '°', celsius: '°C', fahrenheit: '°F',
};

function hours(v, unit) {
  if (unit === 'min') return v / 60;
  if (unit === 'sec') return v / 3600;
  return v;
}
function metres(v, unit) {
  if (unit === 'km') return v * 1000;
  if (unit === 'cm') return v / 100;
  if (unit === 'mm') return v / 1000;
  return v;
}
function pickTime(ctx) {
  const c = ctx.nums.find((n) => n.unit === 'h' || n.unit === 'min' || n.unit === 'sec');
  return c ? { value: hours(c.v, c.unit), unit: 'ч', raw: c.v, rawUnit: c.unit } : null;
}
function pickSpeed(ctx) {
  const c = ctx.nums.find((n) => n.unit === 'kmh' || n.unit === 'ms');
  return c ? { value: c.v, unit: c.unit === 'ms' ? 'м/с' : 'км/ч' } : null;
}
function pickDistance(ctx) {
  const c = ctx.nums.find((n) => ['km', 'm', 'cm', 'mm'].includes(n.unit));
  return c ? { value: c.v, unit: K[c.unit] } : null;
}
function answerStr(v, unit) {
  return `${fmtSmart(v)}${unit ? ' ' + unit : ''}`;
}
function numOr(v, fallback) { return Number.isFinite(v) ? v : fallback; }

function parseAssignments(raw) {
  const scope = {};
  const re = /\b([a-zа-я])\s*=\s*(-?\d+(?:[.,]\d+)?)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    scope[m[1].toLowerCase()] = Number(m[2].replace(',', '.'));
  }
  // «x = 1,5; y = −2» и «при a = 2 и b = 5»
  return scope;
}

function extractExpression(ctx) {
  const raw = ctx.raw;
  const m = raw.match(/(?:вычислите|найдите\s+(?:значение\s+выражения|значение)|значение\s+выражения|чему\s+равно|вычислить|упростите|раскройте скобки|представьте в виде многочлена|возведите в квадрат|возведите в куб|преобразуйте|представьте в виде степени|выполните действие)\s*:?\s*([^\n;?]+)/i);
  let expr = m ? m[1] : '';
  // «Раскройте скобки и упростите: (2x+3)^2» → берём часть после двоеточия
  if (expr.includes(':')) expr = expr.slice(expr.lastIndexOf(':') + 1);
  expr = expr.replace(/^\s*(?:и\s+)?(?:упростите|преобразуйте|выполните действие|вычислите)\s*:?\s*/i, '');
  expr = expr.replace(/\s*при\s+.+$/i, '').trim();
  expr = expr.replace(/[.,;:!?]+$/, '').trim();
  return expr;
}

function buildResult(score, config) { return { score, ...config }; }

/* ======================================================================
 * «ПО ДЕЙСТВИЯМ»
 * Любая задача решается цепочкой действий: 1) что нашли, 2) что нашли…
 * Каждое действие — { what, formula, calc, value, unit }.
 * ====================================================================== */

/** Значение с единицей: «300 км». */
function withUnit(v, unit) {
  return `${fmt(v)}${unit ? ' ' + unit : ''}`;
}

/**
 * Строит текст решения по действиям.
 * @param {Array<{what:string, calc:string, value:any, unit?:string, note?:string}>} actions
 */
export function actionsToSteps(actions) {
  return actions.map((a, i) => {
    const head = `${i + 1}) ${a.what}:`;
    const body = a.calc ? ` ${a.calc}` : '';
    const tail = a.value !== undefined && a.value !== null ? ` = ${withUnit(a.value, a.unit)}` : '';
    return `${head}${body}${tail}${a.note ? ' — ' + a.note : ''}`;
  });
}

/**
 * Превращает шаги решения в нумерованные «действия».
 * Каждый шаг становится отдельным действием: «1) находим скорость сближения: …».
 * Если шаг уже начинается с «1)», он остаётся как есть.
 */
export function toActions(steps, { what = '' } = {}) {
  const clean = (steps || []).filter((x) => typeof x === 'string' && x.trim());
  if (!clean.length) return [];
  // уже по действиям — не трогаем
  if (/^\s*1\)/.test(clean[0])) return clean;

  return clean.map((step, i) => {
    const numbered = `${i + 1}) ${step.trim()}`;
    if (i === 0 && what) return `${numbered}`;
    return numbered;
  });
}

/**
 * Проверка ответа «на разумность»: если шаблон выдал число, которое
 * противоречит вопросу (например, спрашивают километры, а ответ в часах),
 * лучше честно сказать, чем показать неверное.
 */
export function sanityCheck(question, answer, unit) {
  const q = String(question || '').toLowerCase();
  const u = String(unit || '').toLowerCase();
  const wantsKm = /сколько (километров|км|метров)|какое расстояние|какой путь|пролетит|проедет|пройдёт|сколько успеет пролететь/.test(q);
  const wantsTime = /через сколько|за сколько|сколько времени|когда встрет|сколько часов/.test(q);
  const wantsPct = /шанс|процент|вероятност/.test(q);
  const wantsSpeed = /с какой скорост|какова скорость|найдите скорость|средняя скорость|среднюю скорость/.test(q);

  if (wantsPct && !/%/.test(String(answer))) {
    return { ok: false, hint: 'В вопросе спрашивают шанс или проценты, а ответ получился не в процентах.' };
  }
  // Вопрос про расстояние, а ответ во времени — самая частая ошибка.
  if (wantsKm && !/км|метр/.test(String(answer)) && /^\s*[\d,.]+\s*(ч|час|мин|с|сек)\b/.test(String(answer).trim())) {
    return { ok: false, hint: 'В вопросе спрашивают расстояние, а ответ получился во времени.' };
  }
  if (wantsTime && /^\s*[\d,.]+\s*км\s*$/.test(String(answer).trim())) {
    return { ok: false, hint: 'В вопросе спрашивают время, а ответ получился в километрах.' };
  }
  if (wantsSpeed && !/км\/ч|м\/с/.test(String(answer)) && u && u !== 'км/ч') {
    return { ok: false, hint: 'В вопросе спрашивают скорость, а ответ получился в других единицах.' };
  }
  return { ok: true };
}

/** Есть ли в вопросе нехватка данных: спрашивают про величину, которой нет. */
function questionNeeds(ctx, re) { return ctx.qHas(re); }

/* ======================================================================
 * ШАБЛОНЫ ЗАДАЧ
 * Каждый run(ctx) возвращает null или объект:
 *  {score, matched, why[], inputs, unknown, compute(vals), formulaIds, notes, draw}
 * ====================================================================== */
const RULES = [];
const addRule = (r) => RULES.push(r);

/* ---- 1. Вычисление выражения / подстановка ---- */
addRule({
  id: 'eval_expression', name: 'Вычисление значения выражения (подстановка)',
  run(ctx) {
    const strong = ctx.has(/(вычислите|найдите значение выражения|значение выражения|чему равно|вычислить)/);
    const expr = extractExpression(ctx);
    if (!expr || !/[\d()a-zа-я+\-*/^|]/i.test(expr)) return null;
    const scope = parseAssignments(ctx.raw);
    const hasVars = /[a-zа-я]/i.test(expr.replace(/sqrt|abs|pi|cbrt/gi, ''));
    if (!strong && !hasVars && !ctx.has('=')) return null;
    if (expr.includes('=') && !ctx.has(/(вычислите|найдите значение)/)) return null;
    let value;
    try { value = evaluate(expr, scope); } catch { return null; }
    const why = ['найдено выражение для вычисления', Object.keys(scope).length ? `подставлены переменные: ${Object.entries(scope).map(([k, v]) => `${k} = ${fmt(v)}`).join(', ')}` : 'выражение числовое'];
    return buildResult(strong ? 15 : 8, {
      matched: 'Вычисление значения выражения', why,
      inputs: { ...scope, expr }, unknown: 'значение',
      formulaIds: ['numeric_expr', 'expr_with_vars'],
      compute: () => ({
        answer: fmtSmart(evaluate(expr, scope)), unit: '',
        steps: [
          `Выражение: ${expr}`,
          Object.keys(scope).length ? `Подставляем: ${Object.entries(scope).map(([k, v]) => `${k} = ${fmt(v)}`).join('; ')}` : 'Действуем по порядку: скобки → умножение/деление → сложение/вычитание.',
          `Результат: ${fmt(value)}${Object.keys(scope).length ? '' : ''}`,
        ],
      }),
    });
  },
});

/* ---- 2. Решение уравнения ---- */
addRule({
  id: 'solve_equation', name: 'Решение уравнения (линейное / численное)',
  run(ctx) {
    if (!ctx.has(/(решите уравнение|решить уравнение|найдите корни|корни уравнения|решите)\s*/)) return null;
    const m = ctx.raw.match(/(?:решите\s+уравнение|решить\s+уравнение|найдите\s+корни\s+уравнения|корни\s+уравнения|решите)\s*:?\s*([^\n;]+)/i);
    let eq = m ? m[1] : '';
    eq = eq.replace(/[.?]+$/, '').replace(/\s+при\s+.+$/i, '').trim();
    if (!eq.includes('=')) return null;
    eq = eq.replace(/[,;]/g, '.').replace(/−|–|—/g, '-');
    const parts = eq.split('=');
    if (parts.length !== 2) return null;
    let sol;
    try { sol = solveEquation(eq, 'x', {}, [-50, 50]); } catch { return null; }
    return buildResult(20, {
      matched: 'Уравнение с одной переменной',
      why: ['есть равенство с переменной', 'запрос «решите уравнение»'],
      inputs: { eq }, unknown: 'x', formulaIds: ['equation_root', 'linear_eq', 'linear_eq_cases'],
      compute: () => ({
        answer: sol.type === 'many' ? 'любое число' : sol.type === 'none' ? 'корней нет' : sol.roots.map((r) => `x = ${fmt(r)}`).join('; '),
        unit: '',
        steps: [`Уравнение: ${eq}`, ...sol.steps],
        notes: sol.type === 'many' ? ['0x = 0 — верно при любом x (бесконечно много корней).'] : [],
      }),
    });
  },
});

/* ---- 3. Система уравнений ---- */
addRule({
  id: 'solve_system', name: 'Система линейных уравнений (2×2)',
  run(ctx) {
    if (!ctx.has(/систем/)) return null;
    // 1) запятая внутри числа — десятичный разделитель, а не граница уравнений
    const text = ctx.text.replace(/(\d),(\d)/g, '$1.$2');
    const eqs = [];
    const re = /(-?\s*[\dxyxy()]+(?:\s*[+\-*/.^]\s*[\dxy()]+)*\s*=\s*-?\s*[\dxy()]+(?:\s*[+\-*/.^]\s*[\dxy()]+)*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const e = m[1].replace(/\s+/g, ' ').trim();
      if (e.includes('=') && /[xy]/.test(e) && !eqs.includes(e)) eqs.push(e);
    }
    if (eqs.length < 2) return null;
    const pair = eqs.slice(0, 2);
    let sol;
    try { sol = solveSystem(pair); } catch { return null; }
    return buildResult(24, {
      matched: 'Система двух линейных уравнений',
      why: ['слово «система»', 'найдено два уравнения с x и y'],
      inputs: { e1: pair[0], e2: pair[1] }, unknown: '(x; y)',
      formulaIds: ['system_def', 'cramer', 'substitution', 'addition_method'],
      compute: () => ({
        answer: sol.type === 'one' ? `(${fmt(sol.values.x)}; ${fmt(sol.values.y)})`
          : sol.type === 'many' ? 'бесконечно много решений' : 'решений нет',
        unit: '', steps: [`Система: { ${pair[0]}; ${pair[1]} }`, ...sol.steps],
        notes: sol.note ? [sol.note] : [],
      }),
    });
  },
});

/* ---- 4. Функция, заданная формулой ---- */
addRule({
  id: 'function_value', name: 'Значение функции по формуле / аргумент по значению',
  run(ctx) {
    if (!ctx.has(/(функци|задана формулой|задаётся формулой)/)) return null;
    const fm = ctx.raw.match(/y\s*\(?[xа-я]?\)?\s*=\s*([^\n;,?]+)/i)
      || ctx.raw.match(/(?:функция|формулой)\s*[^\n]*?=\s*([^\n;,?]+)/i);
    if (!fm) return null;
    let expr = fm[1].trim().replace(/[,;]/g, '.').replace(/−|–|—/g, '-');
    // отсечь хвост «где …», «при …»
    expr = expr.split(/\s+где\s+|\s+при\s+/i)[0].trim();
    expr = expr.replace(/[.\s]+$/, '');
    if (!/[x]/.test(expr) && !/\d/.test(expr)) return null;
    let value;
    try { value = evaluate(expr, { x: 1 }); } catch { return null; }
    const atX = ctx.numNear(['при x', 'x =', 'равном', 'аргумента'], []) ?? ctx.nums.find((n) => /x\s*=/.test(n.before))?.v ?? null;
    const atY = ctx.qHas(/(значение функции равно|при y|y равно|ординат)/) ? ctx.numNear(['равно', 'y =', 'значение'], []) : null;
    const findX = ctx.qHas(/(при каком|каком значении x|значении аргумента|аргумента, при котором)/) || (atY !== null);
    if (!findX && atX === null) {
      // просто показываем формулу и таблицу значений
      const table = [-2, -1, 0, 1, 2].map((x) => `${x} → ${fmt(evaluate(expr, { x }))}`).join('; ');
      return buildResult(11, {
        matched: 'Функция, заданная формулой (таблица значений)',
        why: ['формула функции y(x)'], inputs: { expr }, unknown: 'y',
        formulaIds: ['func_definition', 'linear_function'],
        compute: () => ({ answer: `y = ${expr}`, unit: '', steps: [`Формула: y = ${expr}`, `Таблица значений: ${table}`, 'По любым двум точкам можно построить график.'] }),
      });
    }
    if (findX) {
      const yVal = numOr(atY, ctx.numNear(['равно', 'соответствует'], []) ?? 0);
      return buildResult(19, {
        matched: 'Нахождение аргумента по значению функции',
        why: ['функция задана формулой', 'вопрос «при каком значении аргумента»'],
        inputs: { expr, y: yVal }, unknown: 'x', formulaIds: ['func_definition', 'linear_eq'],
        compute: (vals) => {
          const sol = solveEquation(`${vals.expr} = ${vals.y}`, 'x', {}, [-100, 100]);
          const x = sol.roots[0];
          return {
            answer: Number.isFinite(x) ? `x = ${fmt(x)}` : 'решений нет', unit: '',
            steps: [`Формула: y = ${vals.expr}`, `Подставим y = ${fmt(vals.y)}: ${vals.expr} = ${fmt(vals.y)}`, ...sol.steps],
          };
        },
      });
    }
    return buildResult(19, {
      matched: 'Вычисление значения функции по формуле',
      why: ['функция задана формулой', 'найдено значение аргумента x'],
      inputs: { expr, x: atX }, unknown: 'y', formulaIds: ['func_definition', 'linear_function'],
      compute: (vals) => ({
        answer: fmtSmart(evaluate(vals.expr, { x: vals.x })), unit: '',
        steps: [`Формула: y = ${vals.expr}`, `Подставим x = ${fmt(vals.x)}`, `y = ${fmt(evaluate(vals.expr, { x: vals.x }))}`],
      }),
    });
  },
});

/* ---- 5. Точка на графике ---- */
addRule({
  id: 'point_on_graph', name: 'Принадлежит ли точка графику функции',
  run(ctx) {
    if (!ctx.has(/(принадлеж.*график|лежит ли.*график|проходит.*через точк)/)) return null;
    const fm = ctx.raw.match(/y\s*=\s*([^\n;,?]+)/i);
    const pt = ctx.raw.match(/\(?\s*(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)\s*\)?/);
    if (!fm || !pt) return null;
    const expr = fm[1].trim().replace(/,/g, '.').replace(/−|–|—/g, '-').split(/\s+где\s+/i)[0];
    const x = Number(pt[1].replace(',', '.')), y = Number(pt[2].replace(',', '.'));
    let calc;
    try { calc = evaluate(expr, { x }); } catch { return null; }
    return buildResult(21, {
      matched: 'Проверка точки подстановкой в формулу',
      why: ['есть координаты точки и формула функции'],
      inputs: { expr, x, y }, unknown: 'принадлежность', formulaIds: ['func_definition'],
      compute: (vals) => {
        const yy = evaluate(vals.expr, { x: vals.x });
        const yes = Math.abs(yy - vals.y) < 1e-8;
        return {
          answer: yes ? 'Да, принадлежит' : 'Нет, не принадлежит', unit: '',
          steps: [`Формула: y = ${vals.expr}`, `Подставим x = ${fmt(vals.x)}: y = ${fmt(yy)}`, `Ордината точки: ${fmt(vals.y)}`, yes ? 'Значения совпали — точка лежит на графике.' : 'Значения не совпали — точка не лежит на графике.'],
        };
      },
    });
  },
});

/* ---- 6. Прямая пропорциональность / угловой коэффициент ---- */
addRule({
  id: 'direct_prop', name: 'Прямая пропорциональность y = kx',
  run(ctx) {
    if (!ctx.has(/(прямая пропорциональность|прямой пропорциональностью|y = kx|график.*начало координат)/)) return null;
    const pt = ctx.raw.match(/\(?\s*(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)\s*\)?/);
    const kMatch = ctx.raw.match(/k\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
    const xVal = ctx.numNear(['при x', 'x =', 'аргумента'], []);
    let k = kMatch ? Number(kMatch[1].replace(',', '.')) : null;
    if (k === null && pt) k = Number(pt[2].replace(',', '.')) / Number(pt[1].replace(',', '.'));
    if (k === null) return null;
    const x = xVal ?? (ctx.numNear(['найдите y', 'значение функции'], []) ?? 2);
    return buildResult(18, {
      matched: 'Прямая пропорциональность',
      why: ['y = kx', 'коэффициент k найден из точки или условия'],
      inputs: { k, x }, unknown: 'y', formulaIds: ['direct_prop', 'k_ratio', 'prop_ratio_identity'],
      compute: (vals) => ({
        answer: fmtSmart(vals.k * vals.x), unit: '',
        steps: [`Формула прямой пропорциональности: y = kx, k ≠ 0`, `k = ${fmt(vals.k)}`, `y = ${fmt(vals.k)} · ${fmt(vals.x)} = ${fmt(vals.k * vals.x)}`, `График — прямая через (0; 0) и (1; ${fmt(vals.k)}).`],
      }),
    });
  },
});

/* ---- 7. Линейная функция по двум точкам ---- */
addRule({
  id: 'linear_two_points', name: 'Уравнение прямой по двум точкам',
  run(ctx) {
    if (!ctx.has(/(проходит через точки|через точки|по двум точкам|график линейной функции)/)) return null;
    const pts = [...ctx.raw.matchAll(/\(?\s*(-?\d+(?:[.,]\d+)?)\s*[;,]\s*(-?\d+(?:[.,]\d+)?)\s*\)?/g)]
      .map((m) => [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))]);
    // берём пары, не совпадающие с формулами вида y = kx + b
    if (pts.length < 2) return null;
    const [p1, p2] = pts.slice(0, 2);
    if (p1[0] === p2[0]) return null;
    return buildResult(22, {
      matched: 'Линейная функция y = kx + b по двум точкам',
      why: ['заданы две точки графика', 'график линейной функции — прямая'],
      inputs: { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] }, unknown: '(k; b)',
      formulaIds: ['linear_function', 'slope', 'b_intercept'],
      compute: (v) => {
        const k = (v.y2 - v.y1) / (v.x2 - v.x1), b = v.y1 - k * v.x1;
        return {
          answer: `y = ${fmt(k)}x ${b >= 0 ? '+ ' + fmt(b) : '− ' + fmt(-b)}`, unit: '',
          steps: [`Точки: A(${fmt(v.x1)}; ${fmt(v.y1)}), B(${fmt(v.x2)}; ${fmt(v.y2)})`, `k = (y₂ − y₁)/(x₂ − x₁) = (${fmt(v.y2)} − ${fmt(v.y1)})/(${fmt(v.x2)} − ${fmt(v.x1)}) = ${fmt(k)}`, `b = y₁ − k·x₁ = ${fmt(v.y1)} − ${fmt(k)}·${fmt(v.x1)} = ${fmt(b)}`, `Ответ: y = ${fmt(k)}x ${b >= 0 ? '+ ' + fmt(b) : '− ' + fmt(-b)}`],
        };
      },
    });
  },
});

/* ---- 8. Пересечение графиков ---- */
addRule({
  id: 'graphs_intersection', name: 'Точка пересечения двух графиков',
  run(ctx) {
    if (!ctx.has(/(пересечени.*график|графики.*пересека|точка пересечения)/)) return null;
    const fs = [...ctx.raw.matchAll(/y\s*=\s*([^,;и\n?]+)/gi)].map((m) => m[1].trim().replace(/,/g, '.').replace(/−|–|—/g, '-'));
    if (fs.length < 2) return null;
    const [a, b] = fs.slice(0, 2);
    let sol;
    try { sol = solveEquation(`${a} = ${b}`, 'x', {}, [-100, 100]); } catch { return null; }
    if (!sol.roots.length) return null;
    return buildResult(23, {
      matched: 'Точка пересечения графиков линейных функций',
      why: ['две формулы y = …', 'вопрос о точке пересечения'],
      inputs: { f1: a, f2: b }, unknown: '(x; y)',
      formulaIds: ['graphs_intersection', 'linear_function'],
      compute: (v) => {
        const s = solveEquation(`${v.f1} = ${v.f2}`, 'x', {}, [-100, 100]);
        const x = s.roots[0], y = evaluate(v.f1, { x });
        return {
          answer: `(${fmt(x)}; ${fmt(y)})`, unit: '',
          steps: [`Приравняем значения функций: ${v.f1} = ${v.f2}`, ...s.steps, `y = ${v.f1} при x = ${fmt(x)} ⇒ y = ${fmt(y)}`, `Точка пересечения: (${fmt(x)}; ${fmt(y)}).`],
        };
      },
    });
  },
});

/* ---- 9. Движение: s = vt ---- */
addRule({
  id: 'motion_svt', name: 'Движение: путь = скорость · время',
  run(ctx) {
    // Если спрашивают среднюю скорость — это другое правило, не путаем.
    if (ctx.has(/средн[а-яё]*\s+скорост[а-яё]*/)) return null;
    const words = ctx.has(/(скорост|путь|проехал|прош[её]л|движ|ехал|автомобил|поезд|теплоход|велосипед|пешеход|турист|мот[о]?циклист|км\/ч)/);
    if (!words) return null;
    if (ctx.has(/навстречу|догон|вдогонку|по течению|против течения/)) return null; // отдельные шаблоны
    const speed = pickSpeed(ctx);
    const time = pickTime(ctx);
    const dist = pickDistance(ctx);
    if (!speed && !time && !dist) return null;
    let unknown = 's';
    if (ctx.qHas(/скорост|с какой скоростью|как.*скорость/)) unknown = 'v';
    else if (ctx.qHas(/время|часов|минут|за сколько|через сколько|суток|дн/)) unknown = 't';
    else if (ctx.qHas(/путь|расстояни|проех|прош[её]л|километров|метров|длина маршрута/)) unknown = 's';
    // если не хватает двух величин — этот шаблон не подходит
    const known = [speed ? 'v' : null, time ? 't' : null, dist ? 's' : null].filter(Boolean);
    if (!known.includes(unknown) && known.length < 2) return null;
    const inputs = {
      v: speed?.value ?? null, t: time?.value ?? null, s: dist?.value ?? null,
    };
    const unitHint = { v: speed?.unit || 'км/ч', t: 'ч', s: dist?.unit || 'км' };
    let score = 9 + (speed ? 4 : 0) + (time ? 2 : 0) + (dist ? 2 : 0);
    if (ctx.has(/км\/ч/)) score += 2;
    return buildResult(score, {
      matched: 'Формула пути s = v·t',
      why: ['слова о движении', speed ? `единица скорости ${speed.unit}` : 'нет явной скорости', time ? 'найдено время' : 'нет явного времени', dist ? 'найдено расстояние' : 'нет явного расстояния'],
      inputs, unknown, formulaIds: ['motion_s', 'motion_v', 'motion_t', 's_50t_20'],
      notes: ['Если время дано в минутах, оно переведено в часы (t = мин/60).'],
      compute: (v) => {
        let val, steps = [];
        if (v.v == null) { val = v.s / v.t; steps = [`v = s/t = ${fmt(v.s)} / ${fmt(v.t)} = ${fmt(val)}`]; }
        else if (v.t == null) { val = v.s / v.v; steps = [`t = s/v = ${fmt(v.s)} / ${fmt(v.v)} = ${fmt(val)}`]; }
        else { val = v.v * v.t; steps = [`s = v·t = ${fmt(v.v)} · ${fmt(v.t)} = ${fmt(val)}`]; }
        return {
          answer: answerStr(val, unitHint[unknown === 'v' ? 'v' : unknown]), unit: unitHint[unknown] || '',
          steps: ['Формула равномерного движения: s = v · t', `Известно: v = ${v.v == null ? '?' : fmt(v.v) + ' ' + unitHint.v}, t = ${v.t == null ? '?' : fmt(v.t) + ' ч'}, s = ${v.s == null ? '?' : fmt(v.s) + ' ' + unitHint.s}`, ...steps],
        };
      },
    });
  },
});

/* ---- 10. Навстречу ---- */
addRule({
  id: 'motion_towards', name: 'Движение навстречу друг другу',
  run(ctx) {
    if (!ctx.has(/навстречу|встретятся|встреча произо/)) return null;
    const speeds = ctx.byUnit('kmh');
    if (!speeds.length) speeds.push(...ctx.byUnit('ms'));
    const dist = pickDistance(ctx);
    const time = pickTime(ctx);
    const unknown = ctx.qHas(/за сколько|через сколько|время|часов|когда встрет/) ? 't'
      : ctx.qHas(/расстояни|путь|сколько км/) ? 's' : (time ? 's' : 't');
    const v1 = speeds[0] ?? null, v2 = speeds[1] ?? null;
    if (v1 == null && v2 == null && !dist && !time) return null;
    return buildResult(24, {
      matched: 'Скорость сближения v₁ + v₂',
      why: ['слово «навстречу»', speeds.length >= 2 ? 'две скорости' : 'скорости извлечены'],
      inputs: { v1, v2, s: dist?.value ?? null, t: time?.value ?? null }, unknown,
      formulaIds: ['motion_towards', 'motion_s'],
      notes: v2 == null ? ['В условии найдена только одна скорость: вторая скорость считается равной первой (v₂ = v₁). Уточните число при необходимости.'] : [],
      compute: (v) => {
        const a = numOr(v.v1, 0), b = numOr(v.v2, a);
        let val;
        if (unknown === 't') { val = v.s / (a + b); }
        else { val = (a + b) * (v.t ?? 1); }
        return {
          answer: answerStr(val, unknown === 't' ? 'ч' : 'км'), unit: unknown === 't' ? 'ч' : 'км',
          steps: [
            'При движении навстречу скорости складываются: vсбл = v₁ + v₂.',
            `vсбл = ${fmt(a)} + ${fmt(b)} = ${fmt(a + b)} км/ч`,
            unknown === 't'
              ? `t = s / vсбл = ${fmt(v.s)} / ${fmt(a + b)} = ${fmt(val)} ч`
              : `s = vсбл · t = ${fmt(a + b)} · ${fmt(v.t ?? 1)} = ${fmt(val)} км`,
          ],
        };
      },
    });
  },
});

/* ---- 9в. Трубы / бассейн: совместная работа через «за сколько» ---- */
addRule({
  id: 'pipes_fill',
  name: 'Трубы, бассейн: одна заполняет за a ч, вторая за b ч — за сколько вместе',
  run(ctx) {
    if (!ctx.has(/труб|бассейн|резервуар|бак\b|наполн|выкач|цистерн/)) return null;
    const times = ctx.nums.filter((n) => ['h', 'min'].includes(n.unit)).map((n) => hours(n.v, n.unit));
    if (times.length < 2) return null;
    const [a, b] = times;

    return buildResult(36, {
      matched: 'Совместная работа: 1/a + 1/b',
      why: ['речь о трубах или бассейне', 'два времени «заполняет за …»'],
      inputs: { a, b },
      unknown: 't',
      formulaIds: ['work_rate', 'work_one'],
      notes: ['Всю работу принимаем за 1: первая труба за час делает 1/a часть, вторая — 1/b.'],
      compute: (v) => {
        const x = numOr(v.a, 1), y = numOr(v.b, 1);
        const t = (x * y) / (x + y);
        return {
          answer: answerStr(t, 'ч'), unit: 'ч',
          steps: actionsToSteps([
            { what: 'Принимаем всю работу за 1', calc: 'бассейн = 1' },
            { what: 'Скорость первой трубы', calc: `1/${fmt(x)} бассейна за час` },
            { what: 'Скорость второй трубы', calc: `1/${fmt(y)} бассейна за час` },
            { what: 'Вместе за час', calc: `1/${fmt(x)} + 1/${fmt(y)} = ${fmt(1 / x + 1 / y)} бассейна`, value: null },
            { what: 'Время вдвоём', calc: `t = 1 / (${fmt(1 / x + 1 / y)}) = ${fmt(t)} ч`, value: null },
          ]),
        };
      },
    });
  },
});

/* ---- 9г. «Задумали число…» — обратные действия ---- */
addRule({
  id: 'guess_number',
  name: 'Задумали число: обратные действия',
  run(ctx) {
    if (!ctx.has(/задумал|загадал|задумали|загадали/)) return null;
    // Берём действия по порядку: «умножили на 4», «прибавили 8», «получили 40»
    const ops = [];
    const re = /(прибав\w*|плюс|увелич\w*\s+на|вычл\w*|вычел\w*|минус|уменьш\w*\s+на|умнож\w*|\*|раздел\w*)/gi;
    let m;
    while ((m = re.exec(ctx.text)) !== null) {
      const tail = ctx.text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const num = tail.match(/-?\d+(?:[.,]\d+)?/);
      if (!num) continue;
      const kind = /прибав|плюс|увелич/.test(m[0]) ? '+' : /вычл|вычел|минус|уменьш/.test(m[0]) ? '-'
        : /умнож|\*/.test(m[0]) ? '*' : '/';
      ops.push({ kind, value: Number(num[0].replace(',', '.')) });
    }
    if (!ops.length) return null;
    const got = ctx.numClosest('получ|оказал|вышл|вышел', ['']) ?? ctx.nums[ctx.nums.length - 1]?.v;
    if (got == null) return null;
    // убираем «получили 40» из списка действий
    const list = ops.filter((o) => o.value !== got);
    if (!list.length) return null;

    return buildResult(38, {
      matched: 'Обратные действия: идём от результата назад',
      why: ['слово «задумали число»', `известен результат ${fmt(got)}`, `действий: ${list.length}`],
      inputs: { result: got, stepsCount: list.length, ...Object.fromEntries(list.map((o, i) => ['k' + i, o.value])) },
      unknown: 'x',
      formulaIds: [],
      notes: ['Чтобы найти задуманное число, идём от ответа назад и делаем обратные действия.'],
      compute: (v) => {
        const acts = list.map((o) => ({ ...o, value: v['k' + list.indexOf(o)] ?? o.value }));
        let x = numOr(v.result, got);
        const back = [];
        for (let i = acts.length - 1; i >= 0; i--) {
          const o = acts[i];
          const before = x;
          if (o.kind === '+') x -= o.value;
          else if (o.kind === '-') x += o.value;
          else if (o.kind === '*') x /= o.value;
          else x *= o.value;
          const word = o.kind === '+' ? 'прибавили' : o.kind === '-' ? 'вычли' : o.kind === '*' ? 'умножили' : 'разделили';
          const inverse = o.kind === '+' ? 'вычитаем' : o.kind === '-' ? 'прибавляем' : o.kind === '*' ? 'делим' : 'умножаем';
          back.push({ what: `Обратное действие: ${inverse} ${fmt(o.value)}`, calc: `${fmt(before)} → ${fmt(x)}`, value: null, note: `до этого было «${word} ${fmt(o.value)}»` });
        }
        const check = list.reduce((acc, o) => (o.kind === '+' ? acc + o.value : o.kind === '-' ? acc - o.value : o.kind === '*' ? acc * o.value : acc / o.value), x);
        return {
          answer: answerStr(Math.round(x * 1e10) / 1e10, ''), unit: '',
          steps: actionsToSteps([
            ...back,
            { what: 'Проверка', calc: `если x = ${fmt(x)}, то после всех действий получаем ${fmt(check)}`, value: null, note: 'должно совпасть с условием' },
          ]),
        };
      },
    });
  },
});

/* ---- 9д. Вклад / рост по процентам ---- */
addRule({
  id: 'deposit',
  name: 'Вклад: проценты начисляются каждый год',
  run(ctx) {
    if (!ctx.has(/вклад|банк|годовы|капитализац|начисл/)) return null;
    const pct = ctx.first('pct');
    const sum = ctx.nums.find((n) => ['rub', ''].includes(n.unit) && n.v !== pct)?.v ?? null;
    // «через 2 года», «за 3 года», «2 года» — срок вклада
    const years = ctx.nums.find((n) => n.unit === 'year' && n.v !== pct && n.v !== sum)?.v ?? null;
    if (pct == null || sum == null) return null;
    const y = years ?? 1;
    if (y > 50) return null;
    return buildResult(34, {
      matched: 'Вклад: сумма · (1 + p/100)ⁿ',
      why: ['слова «вклад», «банк», «годовых»', 'есть процент и сумма'],
      inputs: { s: sum, p: pct, n: y },
      unknown: 'S',
      formulaIds: ['pct_of'],
      compute: (v) => {
        const total = numOr(v.s, 0) * Math.pow(1 + numOr(v.p, 0) / 100, numOr(v.n, 1));
        const acts = [{ what: 'Сумма вклада', calc: withUnit(numOr(v.s, 0), 'р.') }];
        let cur = numOr(v.s, 0);
        for (let i = 0; i < Math.min(numOr(v.n, 1), 6); i++) {
          const add = cur * numOr(v.p, 0) / 100;
          cur += add;
          acts.push({ what: `Год ${i + 1}`, calc: `${fmt(cur - add)} + ${fmt(add)} = ${fmt(cur)} р.`, value: null });
        }
        acts.push({ what: 'Ответ', calc: `через ${fmt(numOr(v.n, 1))} г. — ${fmt(total)} р.`, value: null });
        return { answer: answerStr(total, 'р.'), unit: 'р.', steps: actionsToSteps(acts) };
      },
    });
  },
});

/* ---- 9б. Шанс / вероятность события (проценты без «от числа») ---- */
addRule({
  id: 'risk_percent',
  name: 'Шанс, риск, вероятность события — в процентах',
  run(ctx) {
    const riskWord = /шанс|вероятност|риск/;
    if (!riskWord.test(ctx.text)) return null;
    // Спрашивают именно «каков шанс / чему равна вероятность»
    if (!ctx.qHas(/каков\w*\s+шанс|чему равен\w*\s+шанс|какова вероятност|чему равна вероятност|какой шанс|каков риск|какой риск/)) return null;
    // Это не «проценты от числа»: там есть «от» или «сколько процентов»
    if (ctx.has(/сколько процентов|процент(?:ов)?\s+от|\d+\s*%\s*от/)) return null;
    // «шанс, что дождя не будет» — считается отдельно (дополнение до 100)
    const opposite = ctx.qHas(/не будет|не пойдёт|не пойдет|не случится|не произойдёт|не произойдет|наоборот/);

    const pct = ctx.numClosest('шанс|вероятност|риск|инфаркт|процент|брак|опасност', ['pct']);
    const time = ctx.lastByUnit(['h', 'min']);
    const speed = ctx.byUnit('kmh')[0] ?? null;
    const dist = ctx.nums.find((n) => ['km', 'm'].includes(n.unit))?.v ?? null;

    if (pct == null) return null;

    return buildResult(36, {
      matched: 'Шанс события: читаем процент из условия',
      why: [`в условии прямо назван шанс — ${fmt(pct)}%`, time != null ? `есть время ${fmt(time)} ч` : ''],
      inputs: { p: pct, t: time, v: speed, s: dist },
      unknown: 'pct',
      formulaIds: [],
      notes: opposite
        ? ['Спрашивают про противоположное событие, поэтому берём дополнение до 100%.']
        : ['Шанс в условии задан прямо, поэтому ответ — это то же число. Остальные данные (время, скорость) на него не влияют.'],
      compute: (v) => {
        const p = numOr(v.p, 0);
        const actions = [
          { what: 'Находим шанс в условии', calc: `${fmt(p)}% — он уже назван прямо`, value: null },
        ];
        if (v.t != null) actions.push({
          what: 'Время бега', calc: `${fmt(v.t)} ч — на шанс не влияет`, value: null,
        });
        if (v.v != null) actions.push({
          what: 'Скорость', calc: `${fmt(v.v)} км/ч — на шанс не влияет`, value: null,
        });
        if (opposite) {
          const inv = 100 - p;
          actions.push({ what: 'Считаем противоположное событие', calc: `100% − ${fmt(p)}% = ${fmt(inv)}%` });
          return { answer: `${fmt(inv)}%`, unit: '%', steps: actionsToSteps(actions) };
        }
        actions.push({ what: 'Ответ', calc: `шанс остаётся тем же — ${fmt(p)}%` });
        return {
          answer: `${fmt(p)}%`, unit: '%',
          steps: actionsToSteps(actions),
        };
      },
    });
  },
});

/* ---- 10б. Муха между двумя движущимися объектами ---- */
addRule({
  id: 'fly_between',
  name: 'Муха (птица, велосипедист) летает между двумя движущимися объектами',
  run(ctx) {
    // Признак: есть третий «летающий» объект со своей скоростью.
    const flyer = /мух|пчел|пчел|шмел|птиц|вороб|ласточк|голуб|стрекоз|оса\b|собак|велосипедист/;
    if (!flyer.test(ctx.text)) return null;
    if (!ctx.has(/навстречу|встретятся|встреча|догон|вдогон/)) return null;

    const speeds = ctx.byUnit('kmh').concat(ctx.byUnit('ms'));
    if (speeds.length < 3) return null;

    const dist = pickDistance(ctx);
    // Скорость «летуна» — та, что рядом со словами «летит», «летает», «скорость мухи»
    // Скорость мухи — та, что стоит ближе всего к слову «муха/летит»,
    // а не просто последняя в списке чисел.
    const flySpeed = ctx.numClosest('мух', ['kmh', 'ms'])
      ?? ctx.numClosest('летит|летает|летела', ['kmh', 'ms'])
      ?? ctx.numClosest('пчел|шмел|птиц|вороб|ласточк|голуб|стрекоз|собак', ['kmh', 'ms']);
    // Две скорости объектов — те, что остались
    const others = speeds.filter((v) => v !== flySpeed).slice(0, 2);
    const v1 = others[0] ?? null;
    const v2 = others[1] ?? v1;
    if (v1 == null) return null;

    const closing = v1 + v2;
    const meets = dist ? dist.value / closing : null;

    return buildResult(40, {
      matched: 'Муха и два объекта: время до встречи × скорость мухи',
      why: [
        'в задаче есть третье «летающее» тело со своей скоростью',
        'найдено расстояние между объектами',
        'найдены скорости обоих объектов и скорость мухи',
      ],
      inputs: { v1, v2, s: dist?.value ?? null, vfly: flySpeed },
      unknown: 's_fly',
      formulaIds: ['motion_towards', 'motion_s'],
      notes: [
        'Главная мысль: муха летает ровно столько времени, сколько грузовики едут до встречи. Считать её «туда-обратно» не нужно.',
      ],
      compute: (v) => {
        const a = numOr(v.v1, 0), b = numOr(v.v2, a), fly = numOr(v.vfly, 0);
        const close = a + b;
        const t = v.s != null ? v.s / close : (meets ?? 0);
        const path = fly * t;
        return {
          answer: answerStr(path, 'км'), unit: 'км',
          steps: [
            'Муха всё время в воздухе — значит она летит столько же, сколько едут грузовики до встречи.',
            `Скорость сближения грузовиков: v = ${fmt(a)} + ${fmt(b)} = ${fmt(close)} км/ч`,
            `Время до встречи: t = s / v = ${fmt(v.s ?? 0)} / ${fmt(close)} = ${fmt(t)} ч`,
            `За это время муха пролетит: s = ${fmt(fly)} · ${fmt(t)} = ${fmt(path)} км`,
            'Обратный путь мухи считать не надо: важна только её скорость и общее время.',
          ],
        };
      },
    });
  },
});

/* ---- 10в. Движение с задержкой (один выехал позже) ---- */
addRule({
  id: 'motion_delay',
  name: 'Движение с задержкой: один объект выехал позже',
  run(ctx) {
    // «… выехал второй», «вслед за ним», «догонит»
    const chases = ctx.has(/вдогон|догон|догонит|вслед за ним|вслед/);
    const delayWords = ctx.has(/через\s+\d|спустя|позже|задерж|раньше/);
    if (!delayWords) return null;
    if (chases) return null; // догон обрабатывается отдельным шаблоном
    if (!ctx.has(/навстречу|встрет/)) return null;

    const speeds = ctx.byUnit('kmh').concat(ctx.byUnit('ms'));
    if (speeds.length < 2) return null;
    const dist = pickDistance(ctx);
    const delay = ctx.numNear(['через', 'спустя', 'позже', 'задерж'], ['h', 'min']);
    if (delay == null) return null;

    const [v1, v2] = speeds;
    return buildResult(36, {
      matched: 'Встречное движение, но один выехал позже',
      why: ['слово «навстречу»', 'есть задержка выезда', 'две скорости'],
      inputs: { v1, v2, s: dist?.value ?? null, t: delay },
      unknown: 't2',
      formulaIds: ['motion_towards', 'motion_s'],
      compute: (v) => {
        const a = numOr(v.v1, 0), b = numOr(v.v2, a), d = numOr(v.t, 0);
        const covered = a * d;                    // кто выехал раньше — уже проехал
        const left = Math.max(0, numOr(v.s, 0) - covered);
        const t2 = left / (a + b);
        // Если спрашивают «через сколько часов они встретятся» — считаем от
        // выезда первого, то есть прибавляем время ожидания.
        const fromStart = ctx.qHas(/встрет|когда/) && !ctx.qHas(/после выезда второго/);
        const answer = fromStart ? t2 + d : t2;
        return {
          answer: answerStr(answer, 'ч'), unit: 'ч',
          steps: [
            `Первый выехал раньше на ${fmt(d)} ч и успел проехать ${fmt(a)} · ${fmt(d)} = ${fmt(covered)} км`,
            `Осталось расстояние: ${fmt(numOr(v.s, 0))} − ${fmt(covered)} = ${fmt(left)} км`,
            `Теперь едут навстречу со скоростью сближения ${fmt(a)} + ${fmt(b)} = ${fmt(a + b)} км/ч`,
            `От выезда второго до встречи: t = ${fmt(left)} / ${fmt(a + b)} = ${fmt(t2)} ч`,
            fromStart
              ? `От самого начала: ${fmt(d)} + ${fmt(t2)} = ${fmt(answer)} ч`
              : `Ответ: ${fmt(answer)} ч после выезда второго`,
          ],
        };
      },
    });
  },
});

/* ---- 10г. «Сколько проедет ещё через 1–2 часа» ---- */
addRule({
  id: 'motion_after',
  name: 'Сколько проедет за следующие часы (после уже пройденного пути)',
  run(ctx) {
    // «ещё через 2 часа», «за следующие 3 часа», «через 1–2 часа»
    const more = ctx.qHas(/через|следующ|ещё|еще|дальше|остал/);
    if (!more) return null;
    // Время «сколько ещё» — последнее время в условии: «…за 6 часов. … через 2 часа»
    const span = ctx.lastByUnit(['h', 'min']);
    if (span == null) return null;
    if (!ctx.has(/проехал|прошёл|прошел|проплыл|пролетел|едет|двига|скорост/)) return null;

    // Скорость: либо явная (км/ч), либо из «проехал S за T»
    let speed = ctx.byUnit('kmh')[0] ?? null;
    if (speed == null) {
      const path = ctx.nums.find((n) => ['km', 'm'].includes(n.unit));
      // «за 6 часов» — то время, перед которым стоит предлог «за»
      const time = ctx.nums.find((n) => ['h', 'min'].includes(n.unit) && /за\s*$/.test(n.before))
        || ctx.nums.find((n) => ['h', 'min'].includes(n.unit) && n !== path);
      if (path && time) speed = path.v / hours(time.v, time.unit);
    }
    if (speed == null) return null;

    const covered = ctx.nums.find((n) => ['km', 'm'].includes(n.unit))?.v ?? null;
    const dt = hours(span, 'h');

    return buildResult(34, {
      matched: 'Путь за следующие часы: s = v · t',
      why: ['вопрос «сколько ещё через … часов»', 'скорость найдена', covered != null ? 'известен уже пройденный путь' : ''],
      inputs: { v: speed, s: covered, t: dt },
      unknown: 's_more',
      formulaIds: ['motion_s'],
      compute: (v) => {
        const path = numOr(v.v, 0) * numOr(v.t, 1);
        return {
          answer: answerStr(path, 'км'), unit: 'км',
          steps: [
            `Скорость: ${fmt(numOr(v.v, 0))} км/ч`,
            `За следующие ${fmt(numOr(v.t, 1))} ч: s = v · t = ${fmt(numOr(v.v, 0))} · ${fmt(numOr(v.t, 1))} = ${fmt(path)} км`,
            v.s != null ? `Всего за поездку тогда: ${fmt(v.s)} + ${fmt(path)} = ${fmt(numOr(v.s, 0) + path)} км` : 'Уже пройденный путь для этого ответа не нужен',
          ],
        };
      },
    });
  },
});

/* ---- 11. Догон ---- */
addRule({
  id: 'motion_catchup', name: 'Догоняющее движение',
  run(ctx) {
    if (!ctx.has(/догон|вдогонку|в одном направлении|догнать/)) return null;
    const speeds = ctx.byUnit('kmh');
    const dist = pickDistance(ctx);
    const time = pickTime(ctx);
    const v1 = speeds[0] ?? null, v2 = speeds[1] ?? null;
    if (!dist && !time && !speeds.length) return null;
    const unknown = ctx.qHas(/за сколько|через сколько|время|часов/) ? 't' : 's';
    return buildResult(24, {
      matched: 'Скорость сближения v₂ − v₁',
      why: ['слова «догонит / в одном направлении»'],
      inputs: { v1, v2, s: dist?.value ?? null, t: time?.value ?? null }, unknown,
      formulaIds: ['motion_catchup', 'motion_s'],
      compute: (v) => {
        let a = numOr(v.v1, 0), b = numOr(v.v2, 0);
        if (b < a) [a, b] = [b, a];
        const diff = b - a;
        const val = unknown === 't' ? numOr(v.s, 0) / Math.max(diff, 1e-9) : diff * numOr(v.t, 1);
        return {
          answer: answerStr(val, unknown === 't' ? 'ч' : 'км'), unit: unknown === 't' ? 'ч' : 'км',
          steps: ['При движении вдогонку скорость сближения равна разности скоростей.', `vсбл = ${fmt(b)} − ${fmt(a)} = ${fmt(diff)} км/ч`, unknown === 't' ? `t = s / vсбл = ${fmt(v.s)} / ${fmt(diff)} = ${fmt(val)} ч` : `s = vсбл · t = ${fmt(diff)} · ${fmt(v.t ?? 1)} = ${fmt(val)} км`],
        };
      },
    });
  },
});

/* ---- 12. Течение ---- */
addRule({
  id: 'river', name: 'Движение по реке: по течению / против течения',
  run(ctx) {
    if (!ctx.has(/(по течению|против течения|течение реки|стоячей воде)/)) return null;
    const speeds = ctx.byUnit('kmh');
    const times = ctx.byUnit('h');
    const dist = pickDistance(ctx);
    // classic: два времени и скорость течения ⇒ собственная скорость
    if (times.length >= 2 && speeds.length >= 1) {
      const t1 = times[0], t2 = times[1], vt = speeds[0];
      return buildResult(25, {
        matched: 'Течение: t₁(v₀ + vт) = t₂(v₀ − vт)',
        why: ['два времени движения', 'скорость течения', 'одинаковый путь по и против течения'],
        inputs: { t1, t2, vt }, unknown: 'v₀', formulaIds: ['river_down', 'river_up', 'river_own'],
        compute: (v) => {
          const v0 = v.vt * (v.t1 + v.t2) / Math.max(v.t2 - v.t1, 1e-9);
          return {
            answer: answerStr(v0, 'км/ч'), unit: 'км/ч',
            steps: [
              'vпо = v₀ + vт, vпр = v₀ − vт; пути равны: t₁·vпо = t₂·vпр.',
              `${fmt(v.t1)}(v₀ + ${fmt(v.vt)}) = ${fmt(v.t2)}(v₀ − ${fmt(v.vt)})`,
              `v₀·(${fmt(v.t2)} − ${fmt(v.t1)}) = ${fmt(v.vt)}·(${fmt(v.t1)} + ${fmt(v.t2)})`,
              `v₀ = ${fmt(v.vt)}·(${fmt(v.t1)} + ${fmt(v.t2)}) / (${fmt(v.t2)} − ${fmt(v.t1)}) = ${fmt(v0)} км/ч`,
              `Проверка: по течению ${fmt(v0 + v.vt)} км/ч, против ${fmt(v0 - v.vt)} км/ч.`,
            ],
          };
        },
      });
    }
    const vOwn = speeds[0] ?? null, vCur = speeds[1] ?? null;
    const computePair = (v) => {
      const down = v.v0 + v.vt, up = v.v0 - v.vt;
      return {
        answer: `по течению ${fmt(down)} км/ч, против ${fmt(up)} км/ч`, unit: 'км/ч',
        steps: ['vпо = v₀ + vт; vпр = v₀ − vт.', `vпо = ${fmt(v.v0)} + ${fmt(v.vt)} = ${fmt(down)} км/ч`, `vпр = ${fmt(v.v0)} − ${fmt(v.vt)} = ${fmt(up)} км/ч`, `Также: v₀ = (vпо + vпр)/2, vт = (vпо − vпр)/2.`],
      };
    };
    if (vOwn !== null && vCur !== null) {
      return buildResult(20, {
        matched: 'Скорости по и против течения', why: ['слова о течении', 'две скорости'],
        inputs: { v0: vOwn, vt: vCur }, unknown: 'vпо / vпр', formulaIds: ['river_down', 'river_up'],
        compute: computePair,
      });
    }
    if (speeds.length >= 2 && ctx.qHas(/собственн|стоячей|течения/)) {
      const [down, up] = speeds;
      return buildResult(20, {
        matched: 'Собственная скорость и скорость течения по двум скоростям',
        why: ['две скорости по и против течения'], inputs: { vd: down, vu: up }, unknown: 'v₀, vт',
        formulaIds: ['river_own', 'river_cur'],
        compute: (v) => {
          const v0 = (v.vd + v.vu) / 2, vt = (v.vd - v.vu) / 2;
          return {
            answer: `v₀ = ${fmt(v0)} км/ч, vт = ${fmt(vt)} км/ч`, unit: 'км/ч',
            steps: ['v₀ = (vпо + vпр)/2; vт = (vпо − vпр)/2.', `v₀ = (${fmt(v.vd)} + ${fmt(v.vu)})/2 = ${fmt(v0)} км/ч`, `vт = (${fmt(v.vd)} − ${fmt(v.vu)})/2 = ${fmt(vt)} км/ч`],
          };
        },
      });
    }
    // путь + время по течению и известная скорость течения ⇒ собственная скорость
    if (dist && pickTime(ctx) && ctx.qHas(/собственн/) && speeds.length >= 1 && times.length >= 1 && times.length < 2) {
      const t = pickTime(ctx).value;
      const vt = speeds[0];
      // главное условие — то, что стоит рядом с путём/временем, а не любое упоминание
      const condMatch = ctx.text.match(/(по|против)\s+течени[а-я]*/);
      const byRiver = condMatch ? (condMatch[1] === 'по' ? 1 : -1) : 0;
      return buildResult(21, {
        matched: byRiver > 0 ? 'Собственная скорость: v₀ = s/t − vт (по течению)'
          : byRiver < 0 ? 'Собственная скорость: v₀ = s/t + vт (против течения)'
            : 'Собственная скорость по пути, времени и течению',
        why: ['путь и время на течении', 'известна скорость течения', 'вопрос о собственной скорости'],
        inputs: { s: dist.value, t, vt }, unknown: 'v₀',
        formulaIds: ['river_down', 'river_up', 'river_own'],
        compute: (v) => {
          const vSpeed = v.s / v.t;
          const v0 = byRiver >= 0 ? vSpeed - v.vt : vSpeed + v.vt;
          return {
            answer: answerStr(v0, 'км/ч'), unit: 'км/ч',
            steps: [
              byRiver >= 0 ? 'По течению: vпо = v₀ + vт, значит v₀ = vпо − vт.' : 'Против течения: vпр = v₀ − vт, значит v₀ = vпр + vт.',
              `Скорость по воде: v = s/t = ${fmt(v.s)} / ${fmt(v.t)} = ${fmt(vSpeed)} км/ч.`,
              `v₀ = ${fmt(vSpeed)} ${byRiver >= 0 ? '−' : '+'} ${fmt(v.vt)} = ${fmt(v0)} км/ч.`,
            ],
          };
        },
      });
    }
    if (dist && pickTime(ctx) && ctx.qHas(/скорост/)) {
      const t = pickTime(ctx).value;
      return buildResult(17, {
        matched: 'Скорость по пути и времени на реке', why: ['путь и время на течении'],
        inputs: { s: dist.value, t }, unknown: 'v', formulaIds: ['motion_v', 'river_down'],
        compute: (v) => ({ answer: answerStr(v.s / v.t, 'км/ч'), unit: 'км/ч', steps: [`v = s/t = ${fmt(v.s)} / ${fmt(v.t)} = ${fmt(v.s / v.t)} км/ч`, 'Это скорость по течению или против — в зависимости от условия.'] }),
      });
    }
    return null;
  },
});

/* ---- 13—16. Проценты ---- */
addRule({
  id: 'percent_of', name: 'Нахождение процентов от числа',
  run(ctx) {
    if (!ctx.has(/%|процент/)) return null;
    const explicit = ctx.has(/(%\s*от|процент\w*\s+от|найдите\s+\d+[.,]?\d*\s*%|каков\w*\s+\d+[.,]?\d*\s*%|составляет\s+\d+[.,]?\d*\s*%|содержится\s+\d+[.,]?\d*\s*%)/);
    // «200 деталей, 5 процентов бракованных — сколько бракованных?»
    // Здесь нет слова «от», но проценты относятся к общему числу.
    const implicit = ctx.qHas(/сколько/) && ctx.has(/%|процент/);
    if (!explicit && !implicit) return null;
    if (ctx.has(/(число, .*% которого|число по его процентам|% которого (равн|составля)|на сколько процентов|сколько процентов|сниз|повыс|увелич|уменьш|скидк)/)) return null;
    const p = ctx.first('pct') ?? ctx.numNear(['процент', 'составляет', 'от числа'], ['']);
    // Базовое число — то, от которого берём процент (200 деталей, 240, класс…)
    const b = ctx.numNear(['от числа', 'от', 'масса', 'стоимость', 'цена', 'всего', 'парти', 'класс', 'всех'], [''])
      ?? ctx.nums.find((n) => n.v !== p)?.v
      ?? null;
    if (p == null || b == null) return null;
    return buildResult(19, {
      matched: 'a % от числа b', why: ['знак %', 'запрос « найти проценты от числа »'],
      inputs: { a: p, b }, unknown: 'x', formulaIds: ['pct_of', 'pct_decimal'],
      compute: (v) => ({
        answer: answerStr(v.b * v.a / 100, ctx.byUnit('kg').length ? 'кг' : ctx.byUnit('rub').length ? 'р.' : ''),
        unit: '', steps: [`Переведём проценты в дробь: ${fmt(v.a)} % = ${fmt(v.a / 100)}`, `x = b · a/100 = ${fmt(v.b)} · ${fmt(v.a)}/100`, `x = ${fmt(v.b * v.a / 100)}`],
      }),
    });
  },
});

addRule({
  id: 'percent_number', name: 'Нахождение числа по его процентам',
  run(ctx) {
    if (!ctx.has(/(число,.*% которого|% которого|число по его процентам|равны .*%)/) && !ctx.has(/(составляет|составляют).*%/)) return null;
    if (ctx.has(/сколько процентов/)) return null;
    const p = ctx.first('pct') ?? ctx.numNear(['%'], ['']);
    const nums = ctx.values('').filter((v) => v !== p);
    const b = nums.length ? nums[nums.length - 1] : null;
    if (p == null || b == null || p === 0) return null;
    return buildResult(20, {
      matched: 'Число по его процентам', why: ['конструкция «a % числа равны b»'],
      inputs: { a: p, b }, unknown: 'x', formulaIds: ['pct_number'],
      compute: (v) => ({
        answer: fmtSmart(100 * v.b / v.a), unit: '',
        steps: [`Пусть искомое число x. Тогда ${fmt(v.a)} % от x равны ${fmt(v.b)}.`, `x · ${fmt(v.a)}/100 = ${fmt(v.b)}`, `x = ${fmt(v.b)} : (${fmt(v.a)}/100) = ${fmt(v.b)} · 100 / ${fmt(v.a)} = ${fmt(100 * v.b / v.a)}`],
      }),
    });
  },
});

addRule({
  id: 'percent_ratio', name: 'Процентное отношение двух чисел',
  run(ctx) {
    if (!ctx.has(/сколько процентов|какой процент|процентном отношении|% составляет/)) return null;
    const nums = ctx.values('').filter((v) => !ctx.byUnit('pct').includes(v));
    const pcts = ctx.byUnit('pct');
    const a = ctx.numNear(['составляет', 'число'], ['']) ?? nums[0];
    const b = nums.find((v) => v !== a) ?? nums[1];
    if (a == null || b == null || b === 0) return null;
    return buildResult(20, {
      matched: 'Сколько процентов a составляет от b', why: ['вопрос «сколько процентов»'],
      inputs: { a, b }, unknown: 'p', formulaIds: ['fraction_pct'],
      compute: (v) => ({ answer: `${fmt(v.a / v.b * 100)} %`, unit: '%', steps: [`p = (a/b)·100 %`, `p = (${fmt(v.a)}/${fmt(v.b)})·100 % = ${fmt(v.a / v.b * 100)} %`] }),
    });
  },
});

addRule({
  id: 'percent_change', name: 'Изменение на проценты / скидка',
  run(ctx) {
    const p = ctx.first('pct');
    if (p == null) return null;
    if (!ctx.has(/(увелич|уменьш|сниз|повыс|скидк|подорож|подешев|перевыполн|на .*%|сократить)/)) return null;
    const nums = ctx.values('').filter((v) => v !== p).concat(ctx.byUnit('rub'));
    const a = ctx.numNear(['цена', 'стоил', 'первоначальн', 'было', 'план', 'составлял'], []) ?? nums.find((v) => v > 1);
    if (a == null) return null;
    const down = ctx.has(/(сниз|уменьш|скидк|подешев|сократил|дешевле|ниже)/);
    const seq = ctx.has(/(сначала|затем|после этого|а затем)/) && ctx.byUnit('pct').length >= 2;
    const p2 = seq ? ctx.byUnit('pct')[1] : null;
    return buildResult(19, {
      matched: seq ? 'Последовательные изменения на проценты' : (down ? 'Уменьшение на p %' : 'Увеличение на p %'),
      why: ['найден процент и слово «изменить/скидка»'],
      inputs: seq ? { a, p, q: p2 } : { a, p }, unknown: 'b',
      formulaIds: seq ? ['pct_sequence'] : (down ? ['pct_decrease'] : ['pct_increase']),
      compute: (v) => {
        const f1 = 1 + (down ? -1 : 1) * v.p / 100;
        const f2 = seq ? 1 + (down ? 1 : -1) * v.q / 100 : 1;
        const b = v.a * f1 * f2;
        return {
          answer: fmtSmart(b), unit: ctx.byUnit('rub').length ? 'р.' : '',
          steps: [
            seq ? `Два последовательных изменения: ${down ? '−' : '+'}${fmt(v.p)} % и ${down ? '+' : '−'}${fmt(v.q)} %.` : `${down ? 'Уменьшение' : 'Увеличение'} на ${fmt(v.p)} %: коэффициент ${fmt(f1)}.`,
            `Новое значение = ${fmt(v.a)} · ${fmt(f1)}${seq ? ' · ' + fmt(f2) : ''} = ${fmt(b)}`,
            `Изменение относительно исходного: ${fmt((b / v.a - 1) * 100)} %.`,
          ],
        };
      },
    });
  },
});

/* ---- 17. Цена × количество ---- */
addRule({
  id: 'price', name: 'Стоимость = цена · количество',
  run(ctx) {
    if (!ctx.has(/(цена|стоимость|стоит|руб|р\.|за килограмм|за штуку)/)) return null;
    const rub = ctx.byUnit('rub');
    const qty = ctx.byUnit('kg').concat(ctx.byUnit('items')).concat(ctx.values(''));
    const c = ctx.numNear(['цена', 'по', 'за'], ['rub']) ?? rub[0];
    const x = qty.find((v) => v !== c);
    if (c == null || x == null) return null;
    return buildResult(14, {
      matched: 'p = c · x', why: ['слова о цене/стоимости'],
      inputs: { c, x }, unknown: 'p', formulaIds: ['price_total', 'direct_prop'],
      compute: (v) => ({ answer: answerStr(v.c * v.x, 'р.'), unit: 'р.', steps: [`p = c·x (прямая пропорциональность).`, `p = ${fmt(v.c)} · ${fmt(v.x)} = ${fmt(v.c * v.x)} р.`] }),
    });
  },
});

/* ---- 18. Плотность ---- */
addRule({
  id: 'density', name: 'Масса = плотность · объём',
  run(ctx) {
    if (!ctx.has(/плотност/)) return null;
    const rho = ctx.numNear(['плотность', 'равна'], ['density', '']) ?? ctx.first('density');
    const V = ctx.byUnit('cm3')[0] ?? ctx.byUnit('m3')[0] ?? ctx.numNear(['объём'], ['']);
    const m = ctx.byUnit('g')[0] ?? ctx.byUnit('kg')[0];
    if (rho == null) return null;
    return buildResult(21, {
      matched: 'm = ρ·V', why: ['слово «плотность»'],
      inputs: { rho, V: V ?? null, m: m ?? null }, unknown: m == null ? 'm' : 'V',
      formulaIds: ['density_mass'],
      compute: (v) => {
        if (v.V == null) return { answer: answerStr(v.m / v.rho, 'см³'), unit: 'см³', steps: [`V = m/ρ = ${fmt(v.m)} / ${fmt(v.rho)} = ${fmt(v.m / v.rho)} см³`] };
        return { answer: answerStr(v.rho * v.V, 'г'), unit: 'г', steps: [`m = ρ·V = ${fmt(v.rho)} · ${fmt(v.V)} = ${fmt(v.rho * v.V)} г`] };
      },
    });
  },
});

/* ---- 19. Среднее ---- */
addRule({
  id: 'average', name: 'Среднее арифметическое / средняя скорость',
  run(ctx) {
    // «среднюю скорость», «средняя скорость», «в среднем» — разные падежи
    if (!ctx.has(/средн[а-яё]*\s+(арифметическ[а-яё]*|скорост[а-яё]*)|в среднем/)) return null;
    // Берём только числа, перечисленные в условии (а не номер задачи и не проценты)
    const srcText = ctx.text.replace(/^\s*\d{1,2}\s*[.)]\s*/, '');
    const listMatch = srcText.match(/чис[еа]л[а-яё]*\s*[:—-]?\s*([\d\s,.;и]+)/);
    let nums;
    if (listMatch) {
      nums = (listMatch[1].match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.')));
    } else {
      nums = ctx.values('').filter((v) => !ctx.byUnit('pct').includes(v));
    }
    if (nums.length < 2) return null;
    if (ctx.has(/средн[а-яё]*\s+скорост[а-яё]*/)) {
      // Части пути: пары «скорость + время» в любом порядке —
      // «2 часа со скоростью 60 км/ч», «со скоростью 60 км/ч 2 часа»
      const speeds = [];
      const times = [];
      for (const n of ctx.nums) {
        if (n.unit === 'kmh' || n.unit === 'ms') speeds.push(n);
        else if (n.unit === 'h' || n.unit === 'min') times.push(n);
      }
      // Ищем прямо в тексте пары «время … скорость» в обоих порядках.
      const src = ctx.text;
      const parts = [];
      const pairs = [
        // «2 часа со скоростью 60 км/ч»
        /(\d+(?:[.,]\d+)?)\s*(?:ч|час[аов]*|мин\w*)[^\d]{0,25}?(\d+(?:[.,]\d+)?)\s*км\s*\/\s*ч/g,
        // «60 км/ч 2 часа»
        /(\d+(?:[.,]\d+)?)\s*км\s*\/\s*ч[^\d]{0,25}?(\d+(?:[.,]\d+)?)\s*(?:ч|час[аов]*|мин\w*)/g,
      ];
      let pm;
      // «60 км/ч в течение 2 часов» и «со скоростью 60 км/ч 2 часа»
      const pairs2 = /(\d+(?:[.,]\d+)?)\s*км\s*\/\s*ч(?:[^\d]{0,30})?(\d+(?:[.,]\d+)?)\s*(?:ч|час[аов]*)/g;
      // Собираем пары обоими способами и оставляем те, где скорость похожа
      // на скорость (а не на время): «60 км/ч 2 часа» и «2 часа → 60 км/ч».
      // Самый надёжный разбор: «… 60 км/ч 2 часа» — время идёт сразу за
      // своей скоростью, а не «2 часа, потом 80 км/ч» (это уже другой участок).
      const strict = /(\d+(?:[.,]\d+)?)\s*км\s*\/\s*ч\s*,?\s*(?:за|в течение|на протяжении|ещё|еще)?\s*(\d+(?:[.,]\d+)?)\s*(?:ч|час[аов]*|мин\w*)/g;
      while ((pm = strict.exec(src)) !== null) {
        parts.push({ v: Number(pm[1].replace(',', '.')), t: Number(pm[2].replace(',', '.')) });
      }
      if (parts.length < 2) {
        while ((pm = pairs2.exec(src)) !== null) parts.push({ v: Number(pm[1].replace(',', '.')), t: Number(pm[2].replace(',', '.')) });
      }
      if (parts.length < 2) {
        parts.length = 0;
        while ((pm = pairs[0].exec(src)) !== null) parts.push({ t: Number(pm[1].replace(',', '.')), v: Number(pm[2].replace(',', '.')) });
      }
      if (!parts.length) {
        // «80 км/ч 3 часа», «80 км/ч, потом 3 часа» — между ними могут быть слова
        const loose = /(\d+(?:[.,]\d+)?)\s*км\s*\/\s*ч[^\d]{0,40}?(\d+(?:[.,]\d+)?)\s*(?:ч|час[аов]*|мин\w*)/g;
        while ((pm = loose.exec(src)) !== null) {
          const v = Number(pm[1].replace(',', '.'));
          const t = Number(pm[2].replace(',', '.'));
          if (!parts.some((x) => x.v === v && x.t === t)) parts.push({ v, t });
        }
      }

      parts.sort((a, b) => a.v - b.v);

      if (parts.length >= 2) {
        return buildResult(40, {
          matched: 'Средняя скорость = весь путь / всё время',
          why: ['слова «средняя скорость»', `найдено участков: ${parts.length}`],
          inputs: { v1: parts[0].v, t1: parts[0].t, v2: parts[1].v, t2: parts[1].t },
          unknown: 'vср',
          formulaIds: ['average', 'motion_s', 'motion_v'],
          notes: ['Средняя скорость — это весь путь, делённый на всё время, а не среднее из скоростей.'],
          compute: (v) => {
            const v1 = numOr(v.v1, 0), t1 = numOr(v.t1, 0), v2 = numOr(v.v2, 0), t2 = numOr(v.t2, 0);
            const s1 = v1 * t1, s2 = v2 * t2;
            const total = s1 + s2, time = t1 + t2;
            return {
              answer: answerStr(total / time, 'км/ч'), unit: 'км/ч',
              steps: actionsToSteps([
                { what: 'Путь на первом участке', calc: `s₁ = ${fmt(v1)} · ${fmt(t1)} = ${fmt(s1)} км` },
                { what: 'Путь на втором участке', calc: `s₂ = ${fmt(v2)} · ${fmt(t2)} = ${fmt(s2)} км` },
                { what: 'Весь путь', calc: `${fmt(s1)} + ${fmt(s2)} = ${fmt(total)} км` },
                { what: 'Всё время', calc: `${fmt(t1)} + ${fmt(t2)} = ${fmt(time)} ч` },
                { what: 'Средняя скорость', calc: `${fmt(total)} / ${fmt(time)} = ${fmt(total / time)} км/ч` },
              ]),
            };
          },
        });
      }

      const d = pickDistance(ctx), t = pickTime(ctx);
      if (!d || !t) return null;
      return buildResult(34, {
        matched: 'Средняя скорость = путь / время', why: ['слова «средняя скорость»'],
        inputs: { s: d.value, t: t.value }, unknown: 'v', formulaIds: ['motion_v', 'average'],
        compute: (v) => ({
          answer: answerStr(v.s / v.t, 'км/ч'), unit: 'км/ч',
          steps: actionsToSteps([
            { what: 'Весь путь', calc: withUnit(v.s, 'км') },
            { what: 'Всё время', calc: withUnit(v.t, 'ч') },
            { what: 'Средняя скорость', calc: `${fmt(v.s)} / ${fmt(v.t)} = ${fmt(v.s / v.t)} км/ч` },
          ]),
        }),
      });
    }
    const picked = nums.slice(0, Math.min(nums.length, 8));
    return buildResult(17, {
      matched: 'Среднее арифметическое', why: ['слова «среднее арифметическое»', `найдено чисел: ${picked.length}`],
      inputs: Object.fromEntries(picked.map((v, i) => [`n${i}`, v])), unknown: 'm', formulaIds: ['average'],
      compute: (v) => {
        const arr = Object.values(v);
        const sum = arr.reduce((a, b) => a + b, 0);
        return { answer: fmtSmart(sum / arr.length), unit: '', steps: [`Сумма: ${arr.map((x) => fmt(x)).join(' + ')} = ${fmt(sum)}`, `Число слагаемых: ${arr.length}`, `m = ${fmt(sum)} / ${arr.length} = ${fmt(sum / arr.length)}`] };
      },
    });
  },
});

/* ---- 20—26. Геометрия ---- */
// Единицы, в которых записаны размеры фигуры в условии: см/м/дм.
function geoUnits(text) {
  const t = String(text || '');
  if (/(дм³|дм3|куб\.?\s*дм)/.test(t)) return { len: 'дм', area: 'дм²', vol: 'дм³' };
  if (/(см³|см3|куб\.?\s*см)/.test(t)) return { len: 'см', area: 'см²', vol: 'см³' };
  if (/(м³|м3|куб\.?\s*м)/.test(t)) return { len: 'м', area: 'м²', vol: 'м³' };
  if (/(см²|см2|кв\.?\s*см)/.test(t)) return { len: 'см', area: 'см²', vol: 'см³' };
  if (/(м²|м2|кв\.?\s*м)/.test(t)) return { len: 'м', area: 'м²', vol: 'м³' };
  if (/(^|[^а-яё])м(?![а-яё²³])/.test(t)) return { len: 'м', area: 'м²', vol: 'м³' };
  return { len: 'см', area: 'см²', vol: 'см³' };
}

function geometryRule({ id, name, pattern, ids, vars, formula, answerUnit, unitKind = 'area', score = 16, alt = null }) {
  addRule({
    id, name,
    run(ctx) {
      if (!ctx.has(pattern)) return null;
      const nums = ctx.nums.filter((n) => !['pct', 'h', 'min', 'sec'].includes(n.unit)).map((n) => n.v);
      const clean = [...new Set(nums)];
      if (clean.length < 1) return null;
      const U = geoUnits(ctx.text);
      const useAlt = alt && ctx.qHas(alt.when);
      const chosen = useAlt
        ? { ...alt, answerUnit: U[alt.unitKind || 'len'] }
        : { display: FORMULA_BY_ID.get(ids[0])?.display || '', formula, answerUnit: U[unitKind] };
      const inputs = {};
      vars.forEach((v, i) => { inputs[v] = clean[i] ?? null; });
      return buildResult(score, {
        matched: useAlt ? alt.name : name,
        why: [`распознана фигура: ${name}`, `извлечены числа: ${clean.map((x) => fmt(x)).join(', ')}`, useAlt ? 'вопрос о периметре/длине окружности' : 'вопрос о площади/объёме'],
        inputs, unknown: useAlt ? 'P' : 'S', formulaIds: ids,
        compute: (v) => {
          let val;
          try { val = chosen.formula(v, ctx.text); } catch { return { answer: '—', unit: '', steps: ['Не хватает данных: проверьте известные значения.'] }; }
          return {
            answer: answerStr(val, chosen.answerUnit), unit: chosen.answerUnit,
            steps: [`Формула: ${chosen.display}`, `Подставим: ${Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => `${k} = ${fmt(x)}`).join('; ')}`, `Получим: ${fmt(val)} ${chosen.answerUnit}`],
          };
        },
      });
    },
  });
}

geometryRule({
  id: 'geometry_rect', name: 'Прямоугольник: площадь и периметр', pattern: /прямоугольник|длина.*ширина|сторон.*прямоуголь/,
  ids: ['rect_area', 'rect_perimeter'], vars: ['a', 'b'], answerUnit: 'см²',
  formula: (v) => numOr(v.a, 0) * numOr(v.b, 0),
  alt: { when: /периметр/, name: 'Периметр прямоугольника P = 2(a + b)', display: 'P = 2·(a + b)', formula: (v) => 2 * (numOr(v.a, 0) + numOr(v.b, 0)) },
  score: 18,
});
geometryRule({
  id: 'geometry_square', name: 'Квадрат: площадь S = a²', pattern: /квадрат(?!н)[а-я]*/,
  ids: ['square_area', 'square_perimeter'], vars: ['a'], answerUnit: 'см²',
  formula: (v) => numOr(v.a, 0) ** 2,
  alt: { when: /периметр/, name: 'Периметр квадрата P = 4a', display: 'P = 4a', formula: (v) => 4 * numOr(v.a, 0) },
  score: 18,
});
geometryRule({
  id: 'geometry_triangle', name: 'Треугольник: площадь S = ah/2', pattern: /треугольник/,
  ids: ['triangle_area'], vars: ['a', 'h'], answerUnit: 'см²',
  formula: (v) => numOr(v.a, 0) * numOr(v.h, v.a ?? 1) / 2, score: 18,
});
geometryRule({
  id: 'geometry_trapezoid', name: 'Трапеция: площадь S = (a + b)h/2', pattern: /трапец/,
  ids: ['trapezoid_area'], vars: ['a', 'b', 'h'], answerUnit: 'см²',
  formula: (v) => (numOr(v.a, 0) + numOr(v.b, 0)) * numOr(v.h, 1) / 2, score: 19,
});
geometryRule({
  id: 'geometry_circle', name: 'Круг и окружность: C = 2πr, S = πr²', pattern: /круг|окружност|радиус|кольц/,
  ids: ['circle_area', 'circumference'], vars: ['r'], answerUnit: 'см²',
  formula: (v) => Math.PI * numOr(v.r, 0) ** 2,
  alt: { when: /длина окружности|длину окружности/, name: 'Длина окружности C = 2πr', display: 'C = 2πr', formula: (v) => 2 * Math.PI * numOr(v.r, 0) },
  score: 19,
});
geometryRule({
  id: 'geometry_box', name: 'Куб / параллелепипед: объём',
  pattern: /(куб|параллелепипед|коробк|аквариум|бассейн|ящик|объем|объём|вместимост|высот[уаы]|длину.*ширину)/,
  ids: ['cube_volume', 'box_volume'], vars: ['a', 'b', 'c'], unitKind: 'vol',
  formula: (v) => numOr(v.a, 0) * numOr(v.b, v.a ?? 1) * numOr(v.c, v.a ?? 1), score: 19,
});
geometryRule({
  id: 'geometry_sphere', name: 'Шар: объём V = 4πr³/3', pattern: /шар|сфер/,
  ids: ['sphere_volume'], vars: ['r'], unitKind: 'vol',
  formula: (v) => 4 / 3 * Math.PI * numOr(v.r, 0) ** 3, score: 19,
});

/* ---- 27. Перевод единиц и температуры ---- */
const CONVERSIONS = [
  { re: /фут/, from: 'фут', to: 'см', factor: 30.48, fid: 'ft_cm', note: 'b = 30,48a' },
  { re: /дюйм/, from: 'дюйм', to: 'см', factor: 2.54, fid: 'inch_cm', note: 'l = 2,54m' },
  { re: /мил(?:ь|и|ях|ями)?\b/, from: 'морская миля', to: 'км', factor: 1.853, fid: 'miles_km', note: 'p = 1,853m' },
  { re: /верст|вёрст/, from: 'верста', to: 'км', factor: 1.067, fid: 'verst_km', note: 'b = 1,067a' },
  { re: /пуд/, from: 'пуд', to: 'кг', factor: 16.38, fid: 'pood_kg', note: 'p = 16,38m' },
  { re: /фунт/, from: 'фунт', to: 'кг', factor: 0.454, fid: 'pound_kg', note: 'c = 0,454f' },
];
addRule({
  id: 'unit_conversion', name: 'Перевод старинных единиц измерения по формулам § 10',
  run(ctx) {
    const conv = CONVERSIONS.find((c) => c.re.test(ctx.text));
    if (conv) {
      const v = ctx.numNear(['', 'равн', 'равно', 'составляет'], ['']) ?? ctx.values('')[0];
      if (v == null) return null;
      return buildResult(23, {
        matched: `Перевод: ${conv.from} → ${conv.to}`, why: [`слово «${conv.from}»`, `формула ${conv.note}`],
        inputs: { a: v, k: conv.factor }, unknown: 'b', formulaIds: [conv.fid],
        compute: (x) => ({
          answer: answerStr(x.a * x.k, conv.to), unit: conv.to,
          steps: [`Формула из § 10: ${conv.note}`, `Подставим a = ${fmt(x.a)} ${conv.from}`, `b = ${fmt(x.k)} · ${fmt(x.a)} = ${fmt(x.a * x.k)} ${conv.to}`],
        }),
      });
    }
    if (ctx.has(/(фаренгейт|°f|цельси|°c|градус)/) && ctx.has(/(перевед|вырази|соответству|сколько градус|какой температур)/)) {
      const t = ctx.byUnit('celsius')[0] ?? ctx.byUnit('fahrenheit')[0] ?? ctx.byUnit('deg')[0] ?? ctx.values('')[0];
      if (t == null) return null;
      // Цель перевода: сначала «по Фаренгейту / по Цельсию», затем — по вопросу.
      const mScale = ctx.text.match(/по\s+(фаренгейт[а-я]*|цельси[а-я]*)/)
        || ctx.text.match(/в\s+градус[а-я]*\s+(фаренгейт[а-я]*|цельси[а-я]*)/);
      let targetScale = mScale ? (/фаренгейт/.test(mScale[1]) ? 'F' : 'C') : null;
      {
        const numUnit = ctx.nums.find((n) => ['celsius', 'fahrenheit'].includes(n.unit));
        const source = numUnit ? (numUnit.unit === 'celsius' ? 'C' : 'F') : 'C';
        if (!targetScale) targetScale = source === 'C' ? 'F' : 'C';
        if (targetScale === source) targetScale = source === 'C' ? 'F' : 'C';
      }
      const toF = targetScale === 'F';
      const fid = toF ? 'c_f' : 'f_c';
      return buildResult(23, {
        matched: toF ? 'Цельсий → Фаренгейт' : 'Фаренгейт → Цельсий',
        why: ['слова о шкале температур', `перевод в шкалу ${toF ? 'Фаренгейта' : 'Цельсия'}`],
        inputs: { t, toF: toF ? 1 : 0 }, unknown: 'T',
        formulaIds: [fid],
        compute: (v) => {
          const useF = v.toF === 1;
          const res = useF ? 1.8 * v.t + 32 : 5 * (v.t - 32) / 9;
          return {
            answer: answerStr(res, useF ? '°F' : '°C'), unit: useF ? '°F' : '°C',
            steps: [useF ? 'Формула: f = 1,8c + 32' : 'Формула: c = 5(f − 32)/9', `Подставим t = ${fmt(v.t)}`, `Результат: ${fmt(res)} ${useF ? '°F' : '°C'}`],
          };
        },
      });
    }
    return null;
  },
});

/* ---- 28. Скорость звука ---- */
addRule({
  id: 'sound_speed', name: 'Скорость звука v = 331 + 0,6t',
  run(ctx) {
    if (!ctx.has(/(скорость звука|звука в воздухе|распространения звука|(распространяется|распространяется|скоростью) звук|звук\w* в|скорость.*звук|звук.*скорост)/)) return null;
    if (ctx.has(/(фаренгейт|цельси|температуре по)/)) return null;
    const t = ctx.values('')[0] ?? ctx.byUnit('deg')[0] ?? ctx.byUnit('celsius')[0];
    if (t == null) return null;
    return buildResult(24, {
      matched: 'Формула скорости звука', why: ['слова «скорость звука»'],
      inputs: { t }, unknown: 'v', formulaIds: ['sound_speed'],
      compute: (v) => ({ answer: answerStr(331 + 0.6 * v.t, 'м/с'), unit: 'м/с', steps: ['v = 331 + 0,6t', `v = 331 + 0,6 · (${fmt(v.t)}) = ${fmt(331 + 0.6 * v.t)} м/с`] }),
    });
  },
});

/* ---- 29. Покраска стен ---- */
addRule({
  id: 'paint', name: 'Площадь покраски стен и число банок краски',
  run(ctx) {
    if (!ctx.has(/(покраск|банок краски|хватает на|стен)/)) return null;
    const nums = ctx.byUnit('m').concat(ctx.byUnit('m2'));
    const a = ctx.numNear(['длина'], ['m']) ?? nums[0];
    const b = ctx.numNear(['ширина'], ['m']) ?? nums.find((v) => v !== a);
    const c = ctx.numNear(['высота'], ['m']) ?? nums.find((v) => v !== a && v !== b);
    const per = ctx.numNear(['хватает на', 'банки'], ['m2', '']) ?? 12;
    if (a == null || b == null || c == null) return null;
    return buildResult(24, {
      matched: 'S = 2c(a + b), N = ⌈S/12⌉', why: ['слова «покраска стен / банок краски»', 'три размера помещения'],
      inputs: { a, b, c, per }, unknown: 'N', formulaIds: ['paint_walls', 'paint_cans', 'rect_area'],
      compute: (v) => {
        const S = 2 * v.c * (v.a + v.b), N = Math.ceil(S / v.per);
        return {
          answer: `${N} банок`, unit: 'банок',
          steps: [`Площадь стен: S = 2c(a + b)`, `S = 2 · ${fmt(v.c)} · (${fmt(v.a)} + ${fmt(v.b)}) = ${fmt(S)} м²`, `Одной банки хватает на ${fmt(v.per)} м² ⇒ S/${fmt(v.per)} = ${fmt(S / v.per)}`, `Округляем в большую сторону: нужно ${N} банок.`],
        };
      },
    });
  },
});

/* ---- 30. Шаги ---- */
addRule({
  id: 'steps_path', name: 'Путь по числу шагов s = n·l',
  run(ctx) {
    if (!ctx.has(/(длина шага|шагов|шаг)/)) return null;
    const stepNum = ctx.nums.find((x) => ['items'].includes(x.unit) && /шаг/.test(x.before + x.after));
    const n = stepNum?.v ?? ctx.byUnit('items')[0] ?? ctx.values('').find((v) => v > 100);
    const cmNum = ctx.nums.find((x) => x.unit === 'cm');
    const l = cmNum ? cmNum.v / 100 : (ctx.numNear(['длина шага'], ['m']) ?? 0.6);
    if (n == null) return null;
    const toKm = ctx.qHas(/километр|сколько км/);
    return buildResult(23, {
      matched: 'Формула s = n·l', why: ['слова «шаги / длина шага»'],
      inputs: { n, l }, unknown: 's', formulaIds: ['steps_path'],
      compute: (v) => {
        const s = v.n * v.l;
        return {
          answer: toKm ? answerStr(s / 1000, 'км') : answerStr(s, 'м'), unit: toKm ? 'км' : 'м',
          steps: ['s = n · l, где n — число шагов, l — длина шага.', `Переведём длину шага в метры: l = ${fmt(v.l * 100)} см = ${fmt(v.l)} м`, `s = ${fmt(v.n)} · ${fmt(v.l)} = ${fmt(s)} м`, toKm ? `В километрах: ${fmt(s)} / 1000 = ${fmt(s / 1000)} км` : 'Ответ в метрах.'],
        };
      },
    });
  },
});

/* ---- 31. Деление с остатком ---- */
addRule({
  id: 'division_remainder', name: 'Деление с остатком a = bq + r',
  run(ctx) {
    if (!ctx.has(/(в остатке|с остатком|при делении|в частном)/)) return null;
    const nums = ctx.values('');
    if (nums.length < 2) return null;
    const a = ctx.numNear(['делимое', 'число', 'при делении'], ['']) ?? nums[0];
    const b = ctx.numNear(['на число', 'делитель', 'на'], ['']) ?? nums.find((v) => v !== a);
    if (a == null || b == null || b === 0) return null;
    return buildResult(22, {
      matched: 'Деление с остатком', why: ['слова «в остатке / при делении»'],
      inputs: { a, b }, unknown: 'q, r', formulaIds: ['div_remainder_ref', 'division_remainder'],
      compute: (v) => {
        const q = Math.floor(v.a / v.b), r = v.a - v.b * q;
        return {
          answer: `q = ${fmt(q)}, r = ${fmt(r)}`, unit: '',
          steps: [`Ищем частное: q = ⌊a/b⌋ = ⌊${fmt(v.a)}/${fmt(v.b)}⌋ = ${fmt(q)}`, `Остаток: r = a − bq = ${fmt(v.a)} − ${fmt(v.b)}·${fmt(q)} = ${fmt(r)}`, `Проверка: 0 ⩽ ${fmt(r)} < ${fmt(v.b)}; a = bq + r ⇒ ${fmt(v.a)} = ${fmt(v.b)}·${fmt(q)} + ${fmt(r)}`],
        };
      },
    });
  },
});

/* ---- 31б. Остатки по нескольким модулям (китайская теорема об остатках) ----
 * «Найдите наименьшее натуральное число, которое при делении на 3 даёт
 *  остаток 1, при делении на 5 — остаток 2, при делении на 7 — остаток 3».
 * Условия извлекаются из текста, числа берутся любые; решение — перебором
 * с шагом НОК и проверкой каждого условия, плюс проверка ответа.
 * ---------------------------------------------------------------------- */
function parseRemainderConditions(text) {
  const out = [];
  const push = (m, r) => {
    const mod = Number(m), rem = Number(r);
    if (!(mod > 1) || !Number.isFinite(rem) || rem < 0 || rem >= mod) return;
    const key = `${mod}:${rem}`;
    if (!out.some((c) => c.key === key)) out.push({ m: mod, r: rem, key });
  };
  // «при делении на 3 даёт остаток 1», «делится на 4 с остатком 3»
  for (const m of text.matchAll(/н[ао]\s*(\d+)\s*(?:даёт|дает|даст|получается|в остатке|остаток|с остатком|остатке)?[^.;]*?остат(?:ок|ке|ком)\s*(?:равен|равный|—|-|:)?\s*(\d+)/g)) push(m[1], m[2]);
  // «остаток при делении на 5 равен 2»
  for (const m of text.matchAll(/остат(?:ок|ке|ком)\s*(?:при делении)?\s*н[ао]\s*(\d+)\s*(?:равен|равный|—|-|:)?\s*(\d+)/g)) push(m[1], m[2]);
  // короткая запись «на 3 остаток 1», «÷3 → 1», «mod 3 = 1»
  for (const m of text.matchAll(/(?:на|÷|\/|mod)\s*(\d+)\s*(?:→|->|=|:)?\s*(?:остаток\s*)?(\d+)\b/g)) push(m[1], m[2]);
  return out;
}

addRule({
  id: 'remainders_crt', name: 'Остатки от деления на несколько чисел',
  run(ctx) {
    if (!ctx.has(/остат/)) return null;
    const conds = parseRemainderConditions(ctx.text);
    if (conds.length < 2) return null;
    // шаблон «деление с остатком» (a и b) — это другой случай
    if (conds.length === 2 && ctx.has(/в частном|частное/)) return null;

    const L = conds.reduce((a, c) => lcm(a, c.m), 1);
    const findSmallest = (natural) => {
      for (let n = natural ? 1 : 0; n <= L * 50 + 1000; n++) {
        if (conds.every((c) => ((n % c.m) + c.m) % c.m === c.r)) return n;
      }
      return null;
    };
    const n0 = findSmallest(true);
    const n0Natural = n0 === null ? 0 : n0 === 0 ? 1 : n0;

    return buildResult(26, {
      matched: `Остатки: ${conds.map((c) => `÷${c.m} → ${c.r}`).join(', ')}`,
      why: [
        `найдено условий: ${conds.length}`,
        ...conds.map((c) => `при делении на ${c.m} остаток ${c.r}`),
        'ищем число, которое подходит ко всем условиям сразу',
      ],
      inputs: Object.fromEntries(conds.slice(0, 4).map((c, i) => [`m${i + 1}`, c.m]))
        , unknown: 'наименьшее число',
      formulaIds: ['division_remainder', 'div_remainder_ref'],
      compute: () => {
        const check = (n) => conds.map((c) => {
          const q = Math.floor(n / c.m), r = n - c.m * q;
          return { ...c, q, r, ok: r === c.r, back: `${c.m}·${q} + ${r} = ${n}` };
        });
        const checks = check(n0Natural);
        const allOk = checks.every((c) => c.ok);

        // --- способ 1: перебор всех чисел подряд ---
        const brute = [];
        const step = (n) => conds.map((c) => `${n} ÷ ${c.m} = ${Math.floor(n / c.m)} (ост. ${n % c.m})`).join('; ');
        let skipped = 0;
        for (let n = 1; n <= n0Natural; n++) {
          if (conds.every((c) => n % c.m === c.r)) {
            brute.push(`${n} — подошло по всем условиям ✓`);
            break;
          }
          // Первые 20 чисел показываем подряд, дальше — каждое 10-е и последние два.
          const nearEnd = n >= n0Natural - 2;
          if (n <= 20 || nearEnd || n % 10 === 0) {
            if (skipped) { brute.push(`… (пропускаем ${skipped} чисел, они не подошли)`); skipped = 0; }
            brute.push(`${n}: ${step(n)}`);
          } else skipped++;
        }
        if (skipped) brute.push(`… (пропускаем ${skipped} чисел)`);
        brute.push(`Наименьшее подходящее число — ${n0Natural}.`);

        // --- способ 2: по первому условию с шагом -------------------------
        const c1 = conds[0];
        const stepwise = [
          `Берём только те числа, которые дают остаток ${c1.r} при делении на ${c1.m}: `
          + `${c1.r === 0 ? c1.m : c1.r}, ${(c1.r === 0 ? c1.m : c1.r) + c1.m}, ${(c1.r === 0 ? c1.m : c1.r) + 2 * c1.m}, … `
          + `— это все числа вида ${c1.r === 0 ? '' : `${c1.r} + `}${c1.m}k.`,
        ];
        let pool = [];
        const start = c1.r === 0 ? c1.m : c1.r;
        for (let n = start, k = 0; k < 60; k++, n += c1.m) pool.push(n);
        const firstPool = pool.slice(0, 12);
        for (let i = 1; i < conds.length; i++) {
          const c = conds[i];
          const fitting = pool.filter((n) => n % c.m === c.r);
          stepwise.push(`Из них остаток ${c.r} при делении на ${c.m} дают: ${fitting.slice(0, 6).join(', ')}${fitting.length > 6 ? ', …' : ''}`);
          pool = fitting;
          if (!pool.length) { stepwise.push('В этом диапазоне подходящих чисел нет — берём числа дальше.'); break; }
        }
        if (firstPool.length) {
          stepwise.splice(1, 0, `Проверяем по порядку: ${firstPool.join(', ')}${firstPool.length >= 12 ? ', …' : ''}`);
        }
        stepwise.push(`Первое, что выдержало все проверки — ${n0Natural}.`);

        // --- способ 3: подбор с шагом НОК --------------------------------
        const byLcm = [
          `Все решения повторяются через ${L} — это наименьшее общее кратное чисел ${conds.map((c) => c.m).join(', ')}.`,
          `Проверяем ${n0Natural}, ${n0Natural + L}, ${n0Natural + 2 * L}, … — каждое подходит.`,
          `Поэтому ответ: ${n0Natural} + ${L}k, k = 0, 1, 2, …`,
          `Наименьшее натуральное — ${n0Natural}.`,
        ];

        const answer = `${n0Natural}`;
        return {
          answer, unit: '',
          steps: [
            `Условия: ${conds.map((c) => `n ÷ ${c.m} даёт остаток ${c.r}`).join('; ')}.`,
            `Способ 1 — перебор: проверяем 1, 2, 3, … и сверяем все остатки сразу.`,
            ...brute.map((b) => `${b}`),
            `Вывод: наименьшее натуральное число — ${n0Natural}.`,
          ],
          checks: checks.map((c) => ({
            title: `Деление на ${c.m}`,
            ok: c.ok,
            detail: `${n0Natural} ÷ ${c.m} = ${fmt(c.q)} (остаток ${fmt(c.r)})${c.ok ? ' — совпало' : `, нужно было ${c.r}`}. Обратно: ${c.back}.`,
          })),
          variants: [
            { title: 'Способ 1. Перебор чисел подряд', note: 'самый понятный', steps: brute },
            { title: 'Способ 2. По первому условию с шагом', note: 'быстрее перебора', steps: stepwise },
            { title: 'Способ 3. Через период (НОК)', note: 'видно все решения', steps: byLcm },
          ],
          notes: [
            `Все решения: ${n0Natural} + ${L}k — при k = 1 получится ${n0Natural + L}, при k = 2 — ${n0Natural + 2 * L}.`,
            allOk ? `Проверка пройдена: остатки в точности ${conds.map((c) => c.r).join(', ')}.` : 'Проверка не сошлась — уточните условие.',
            'Каждое решение задачи про остатки можно проверить обратным действием: делитель · неполное частное + остаток = исходное число.',
          ],
          variantsNote: 'Все способы дают одно и то же число — выбирайте тот, который понятнее.',
        };
      },
    });
  },
});

/* ---- 32. Пропорция ---- */
addRule({
  id: 'proportion_solve', name: 'Решение пропорции a : b = c : x',
  run(ctx) {
    if (!ctx.has(/пропорци/) && !ctx.has(/:\s*\d+\s*=\s*\d+\s*:/)) return null;
    const m = ctx.text.match(/(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)\s*:\s*(x|\?)/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]);
    return buildResult(19, {
      matched: 'Основное свойство пропорции', why: ['запись вида a : b = c : x'],
      inputs: { a, b, c }, unknown: 'x', formulaIds: ['proportion'],
      compute: (v) => ({ answer: fmtSmart(v.b * v.c / v.a), unit: '', steps: [`a·x = b·c`, `${fmt(v.a)}·x = ${fmt(v.b)}·${fmt(v.c)}`, `x = ${fmt(v.b * v.c)} / ${fmt(v.a)} = ${fmt(v.b * v.c / v.a)}`] }),
    });
  },
});

/* ---- 33. Формула чётного / кратного числа ---- */
addRule({
  id: 'multiple_number', name: 'Формула чётного, нечётного и кратного числа',
  run(ctx) {
    if (!ctx.has(/(чётн|нечётн|кратн[оые]|делится на)/)) return null;
    const n = ctx.values('')[0];
    let k = 2, display = 'm = 2n', desc = 'чётных чисел';
    if (ctx.has(/нечётн/)) { k = 2; display = 'm = 2n + 1'; desc = 'нечётных чисел'; }
    else {
      const km = ctx.text.match(/кратн\w*\s+(\d+)|делится на\s+(\d+)/);
      if (km) { k = Number(km[1] || km[2]); display = `m = ${k}n`; desc = `чисел, кратных ${k}`; }
    }
    return buildResult(16, {
      matched: `Формула ${desc}`, why: ['слова «чётное / кратное / нечётное»'],
      inputs: { k, n: n ?? 5 }, unknown: 'm', formulaIds: ['even_number', 'odd_number', 'multiple_k'],
      compute: (v) => {
        const m = ctx.has(/нечётн/) ? 2 * v.n + 1 : v.k * v.n;
        return { answer: fmt(m), unit: '', steps: [`Формула: ${display}, n ∈ Z`, `При n = ${fmt(v.n)}: m = ${fmt(m)}`, `Все значения m при целых n дают ${desc}.`] };
      },
    });
  },
});

/* ---- 34. НОД / НОК / простые множители ---- */
addRule({
  id: 'gcd_lcm', name: 'НОД, НОК, разложение на простые множители',
  run(ctx) {
    if (!ctx.has(/(?:^|[^а-я])(нод|нок)(?![а-я])|простые множители|разложите на простые|делители числа|наибольший общий делитель|наименьшее общее кратное/)) return null;
    const nums = ctx.values('').filter((v) => Number.isInteger(v) && v > 1);
    if (nums.length < 1) return null;
    const wantLcm = ctx.has(/нок|наименьшее общее кратное/);
    const wantFactors = ctx.has(/простые множители|разложите на простые/);
    const n = nums[0], m = nums[1] ?? null;
    const compute = (v) => {
      if (wantFactors) {
        return { answer: factorizationString(v.n), unit: '', steps: [`Разложим число ${fmt(v.n)} на простые множители.`, `Ответ: ${fmt(v.n)} = ${factorizationString(v.n)}`, `Простые множители: ${primeFactors(v.n).join(', ')}`] };
      }
      if (!v.m) {
        return { answer: `делители: ${[...Array(Math.abs(v.n) + 1)].map((_, i) => i).filter((i) => i > 0 && v.n % i === 0).join(', ')}`, unit: '', steps: [`Делители числа ${fmt(v.n)}.`] };
      }
      const val = wantLcm ? lcm(v.n, v.m) : gcd(v.n, v.m);
      return { answer: fmt(val), unit: '', steps: [`Числа: ${fmt(v.n)} и ${fmt(v.m)}`, `${fmt(v.n)} = ${factorizationString(v.n)}; ${fmt(v.m)} = ${factorizationString(v.m)}`, wantLcm ? `НОК берёт все простые множители с наибольшими показателями: ${fmt(val)}` : `НОД берёт общие простые множители с наименьшими показателями: ${fmt(val)}`] };
    };
    return buildResult(21, {
      matched: wantFactors ? 'Разложение на простые множители' : (wantLcm ? 'Наименьшее общее кратное' : 'Наибольший общий делитель'),
      why: ['слова НОД / НОК / простые множители'], inputs: { n, m }, unknown: 'ответ',
      formulaIds: ['divisibility'], compute,
    });
  },
});

/* ---- 35. Числовые промежутки (с мини-рисунком!) ---- */
addRule({
  id: 'interval_task', name: 'Числовой промежуток: неравенство, рисунок, принадлежность',
  run(ctx) {
    const hasWord = ctx.has(/(промежуток|интервал|полуинтервал|отрезок|координатной прямой|изобразите|бесконечн|\+∞|-∞)/);
    const notation = ctx.raw.match(/[\[(]\s*[−\-+]?\d+(?:[.,]\d+)?\s*[;,]\s*(?:[−\-+]?∞|[−\-+]?inf|[−\-+]?\d+(?:[.,]\d+)?)\s*[\])]/i)
      || ctx.raw.match(/[\[(]\s*[−-]?\s*∞\s*[;,]\s*[-−+]?\s*∞\s*[\])]/i);
    const ineq = ctx.raw.match(/[−-]?\d+(?:[.,]\d+)?\s*(?:<=|<|⩽|⩾|>=|>)\s*x\s*(?:<=|<|⩽|⩾|>=|>)\s*[−-]?\d+(?:[.,]\d+)?/i)
      || ctx.raw.match(/x\s*(?:<=|<|⩽|⩾|>=|>)\s*[−-]?\d+(?:[.,]\d+)?/i);
    if (!hasWord && !notation && !ineq) return null;
    let source = notation ? notation[0] : (ineq ? ineq[0] : '');
    if (!source) {
      // «x ⩾ −2» и т.п. уже поймано; иначе ищем числа и слова вида «от … до …»
      const nums = ctx.values('');
      if (nums.length >= 2) source = `[${nums[0]}; ${nums[1]}]`;
      else return null;
    }
    const iv = parseInterval(source.replace(/∞/g, 'inf'));
    if (iv.error) return null;
    const pointM = ctx.raw.match(/(?:число|точк[ае])\s*(-?\d+(?:[.,]\d+)?)/i);
    const point = pointM ? Number(pointM[1].replace(',', '.')) : null;
    const draw = numberLineSVG([{ interval: iv, label: iv.name }], { letters: false });
    return buildResult(23, {
      matched: 'Числовой промежуток и его изображение',
      why: [notation ? 'обозначение [a; b] / (a; b) / луч' : 'неравенство', '§ 4, п. 11: рисунок на координатной прямой'],
      inputs: { src: source }, unknown: 'множество', formulaIds: ['interval_segment', 'interval_open', 'interval_half_left', 'ray_right_closed'],
      notes: describeInterval(iv), draw,
      compute: (v) => {
        const curr = parseInterval(v.src.replace(/∞/g, 'inf'));
        return {
          answer: curr.notation, unit: '',
          steps: [
            `Дано: ${v.src}`,
            `Неравенство: ${curr.inequality}`,
            `Множество: ${curr.setName}`,
            `Это ${curr.name}; ${curr.left.value === null || curr.right.value === null ? 'промежуток неограничен' : `длина |b − a| = ${fmt(curr.length)}, середина (a + b)/2 = ${fmt(curr.midpoint)}`}`,
            ...(point !== null ? [`Точка ${fmt(point)} ${curr.contains(point) ? 'принадлежит' : 'не принадлежит'} промежутку.`] : []),
            'Закрашенный кружок — конец включается, светлый — не включается; стрелка — бесконечность.',
          ],
        };
      },
    });
  },
});

/* ---- 36. Расстояние между точками / середина ---- */
addRule({
  id: 'points_distance', name: 'Расстояние между точками координатной прямой',
  run(ctx) {
    if (!ctx.has(/(расстояние между точками|координатной прямой|середин[аы] отрезк|A\(|B\()/)) return null;
    const pts = [...ctx.raw.matchAll(/([A-Za-zА-Яа-я])\s*\(\s*(-?\d+(?:[.,]\d+)?)\s*\)/g)]
      .map((m) => Number(m[2].replace(',', '.')));
    let a = pts[0], b = pts[1];
    if (a === undefined || b === undefined) {
      const nums = ctx.values('');
      a = nums[0]; b = nums[1];
    }
    if (a === undefined || b === undefined) return null;
    const mid = ctx.has(/середин/);
    return buildResult(22, {
      matched: mid ? 'Координата середины отрезка' : 'Расстояние AB = |b − a|',
      why: ['координаты точек A(a), B(b)'],
      inputs: { a, b }, unknown: mid ? 'm' : 'AB',
      formulaIds: mid ? ['midpoint'] : ['distance_points'],
      compute: (v) => {
        const val = mid ? (v.a + v.b) / 2 : Math.abs(v.b - v.a);
        return {
          answer: fmtSmart(val), unit: '',
          steps: [mid ? 'm = (a + b)/2' : 'AB = |b − a|', `a = ${fmt(v.a)}, b = ${fmt(v.b)}`, mid ? `m = (${fmt(v.a)} + ${fmt(v.b)})/2 = ${fmt(val)}` : `AB = |${fmt(v.b)} − ${fmt(v.a)}| = |${fmt(v.b - v.a)}| = ${fmt(val)}`],
        };
      },
    });
  },
});

/* ---- 37. Раскрытие скобок / упрощение ---- */
addRule({
  id: 'expand', name: 'Раскрытие скобок (формулы сокращённого умножения)',
  run(ctx) {
    if (!ctx.has(/(раскройте скобки|упростите выражение|представьте в виде многочлена|возведите в квадрат|возведите в куб|выполните действие|преобразуйте)/)) return null;
    if (ctx.has(/разложите на множители/)) return null;
    const expr = extractExpression(ctx);
    if (!expr || !/[a-zа-я^()]/i.test(expr)) return null;
    let expanded;
    try { expanded = expandExpression(expr); } catch { return null; }
    const fids = ['sq_sum', 'sq_diff', 'cube_sum', 'poly_mul', 'distrib'];
    return buildResult(20, {
      matched: 'Тождественное преобразование выражения',
      why: ['запрос на раскрытие скобок / упрощение', 'выражение-algebraическое'],
      inputs: { expr }, unknown: 'многочлен', formulaIds: fids,
      compute: (v) => {
        let res;
        try { res = expandExpression(v.expr); } catch (e) { return { answer: e.message, unit: '', steps: ['Не удалось разобрать выражение.'] }; }
        let proof = null;
        if (v.expr.includes('=')) { try { proof = checkIdentity(v.expr); } catch { /* no-op */ } }
        return {
          answer: res, unit: '',
          steps: [
            `Исходное выражение: ${v.expr}`,
            'Раскрываем скобки по правилу «каждый член на каждый» и приводим подобные.',
            proof ? `Проверка тождества: левая часть ${proof.left}, правая ${proof.right} — ${proof.equal ? 'совпадают' : 'различаются'}.` : `Результат (стандартный вид многочлена): ${res}`,
          ],
        };
      },
    });
  },
});

/* ---- 38. Разложение на множители ---- */
addRule({
  id: 'factor', name: 'Разложение на множители (ФСУ, общий множитель, группировка)',
  run(ctx) {
    if (!ctx.has(/разложите на множители|разложение на множители/)) return null;
    const m = ctx.raw.match(/разложите на множители\s*:?\s*([^\n;?]+)/i);
    let expr = m ? m[1].trim() : '';
    expr = expr.replace(/[,;:!?]+$/, '').trim();
    if (!expr || !/[a-zа-я^()]/i.test(expr)) return null;
    let res;
    try { res = factorExpression(expr); } catch { return null; }
    return buildResult(21, {
      matched: res.method, why: ['запрос «разложите на множители»', res.method],
      inputs: { expr }, unknown: 'произведение', formulaIds: ['diff_sq_factor', 'sq_sum_factor', 'common_factor', 'grouping', 'sum_cubes_factor', 'diff_cubes_factor'],
      compute: (v) => {
        let r;
        try { r = factorExpression(v.expr); } catch (e) { return { answer: e.message, unit: '', steps: ['Не удалось разобрать выражение.'] }; }
        let check = 'проверка недоступна для этой записи';
        try {
          const machine = r.text.replace(/−|–|—/g, '-').replace(/[²³⁴⁵⁶⁷⁸⁹]/g, (c) => '^' + ({ '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 })[c]).replace(/·/g, '*');
          check = expandExpression(machine);
        } catch { /* оставляем текстовую пометку */ }
        return {
          answer: r.text, unit: '',
          steps: [`Исходное выражение: ${v.expr}`, `Способ: ${r.method}`, `Получаем: ${r.text}`, `Проверка (раскрытие скобок): ${check}`],
        };
      },
    });
  },
});

/* ---- 39. Степени: упростить ---- */
addRule({
  id: 'power_simplify', name: 'Упрощение выражения со степенями',
  run(ctx) {
    if (!ctx.has(/(представьте в виде степени|упростите.*степен|степенью|возведени|вычислите.*степен)/)) return null;
    const expr = extractExpression(ctx);
    if (!expr || !expr.includes('^') && !/[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(expr)) return null;
    let res;
    try { res = expandExpression(expr); } catch { return null; }
    return buildResult(17, {
      matched: 'Свойства степеней aᵐ·aⁿ = aᵐ⁺ⁿ, (aᵐ)ⁿ = aᵐⁿ',
      why: ['выражение со степенью'], inputs: { expr }, unknown: 'степень',
      formulaIds: ['mul_powers', 'div_powers', 'power_of_power', 'power_product'],
      compute: (v) => ({
        answer: expandExpression(v.expr), unit: '',
        steps: [`Выражение: ${v.expr}`, 'При умножении степеней с одинаковым основанием показатели складываются, при возведении степени в степень — перемножаются.', `Результат: ${expandExpression(v.expr)}`],
      }),
    });
  },
});

/* ---- 40. Производительность / работа ---- */
addRule({
  id: 'work_rate', name: 'Работа = производительность · время',
  run(ctx) {
    if (!ctx.has(/(изготовля|производительн|в день|в час|за смену|деталей|детали|издели|бригад|рабоч|станок)/)) return null;
    if (ctx.has(/(систем|процент|скидк|скорост)/)) return null;

    // три величины: производительность p (шт./ч), время t (ч), работа A (шт.)
    let p = null, t = null, A = null, timeUnit = 'ч';
    // Числа внутри вопроса («сколько деталей в час?») — это искомая величина, а не данные.
    const qm = ctx.text.match(/(сколько|найдите|чему|за сколько|через сколько|какова?|определите|вычислите)/);
    const qStart = qm ? qm.index : ctx.text.length;
    for (const n of ctx.nums) {
      const near = n.before + ' ' + n.after;
      // «90 деталей в час?» — это вопрос, а не производительность:
      // если сразу за числом идёт предмет счёта, считаем его количеством.
      const afterClose = n.after.slice(0, 22);
      const isCount = /^\s*(детал|издели|штук|предмет|монет|страниц|книг|кг|л\b)/.test(afterClose);
      const inQuestion = n.index >= qStart;
      // «90 деталей. Сколько деталей в час?» — между числом и «в час» стоит вопрос
      const rateGap = afterClose.indexOf('в час') >= 0 ? afterClose.slice(0, afterClose.indexOf('в час')) : afterClose.slice(0, 12);
      const questionBetween = /(сколько|найдите|чему|какова)/.test(rateGap);
      const isRate = !inQuestion && !isCount && !questionBetween &&
        /(в час|в день|за час|за смену|в минуту|в смену|производительн)/.test(rateGap + (rateGap.length < 12 ? afterClose : ''));
      if (isRate && p === null) { p = n.v; continue; }
      if ((n.unit === 'h' || n.unit === 'min' || /(час|дн[яей]|смен)/.test(afterClose) || /(за|через)\s*$/.test(n.before)) && t === null) {
        t = n.unit === 'min' ? n.v / 60 : n.v;
        timeUnit = n.unit === 'min' ? 'мин' : 'ч';
        if (n.unit === 'min') t = n.v; // минуты оставляем как есть
        continue;
      }
      if (A === null && (n.unit === 'items' || n.unit === '')) { A = n.v; continue; }
    }
    // «за 6 часов» могло попасть в t, а «90 деталей» — в A
    const known = [p, t, A].filter((x) => x !== null).length;
    if (known < 2) return null;

    const askTime = ctx.qHas(/(за сколько|через сколько|сколько (часов|дней|смен|времени)|за какое время)/);
    const askRate = !askTime && (
      ctx.qHas(/(сколько.*(в час|в день|за час|за смену|в минуту)|производительност)/) ||
      /(сколько\s+\S+\s+(?:в|за)\s+(?:час|день|смену|минуту))/.test(ctx.text)
    );
    let unknown, answerFn, inputs, steps, display;

    if (askTime) {
      if (p == null || A == null) return null;
      unknown = 't'; inputs = { p, A };
      display = 't = A / p';
      answerFn = (v) => v.A / v.p;
      steps = (v, val) => [`Работа A = p · t, значит время t = A / p.`,
        `t = ${fmt(v.A)} / ${fmt(v.p)} = ${fmt(val)} ${timeUnit}.`];
    } else if (askRate) {
      if (A == null || t == null) return null;
      unknown = 'p'; inputs = { A, t };
      display = 'p = A / t';
      answerFn = (v) => v.A / v.t;
      steps = (v, val) => [`Производительность p = A / t.`,
        `p = ${fmt(v.A)} / ${fmt(v.t)} = ${fmt(val)} шт. за 1 ${timeUnit}.`];
    } else {
      if (p == null || t == null) return null;
      unknown = 'A'; inputs = { p, t };
      display = 'A = p · t';
      answerFn = (v) => v.p * v.t;
      steps = (v, val) => [`Работа A = производительность · время = p · t.`,
        `A = ${fmt(v.p)} · ${fmt(v.t)} = ${fmt(val)} шт.`];
    }

    return buildResult(askTime || askRate ? 20 : 14, {
      matched: display,
      why: ['слова о работе, производительности и времени',
        `известно: ${Object.entries(inputs).map(([k, v]) => `${k} = ${fmt(v)}`).join(', ')}`,
        askTime ? 'вопрос «за сколько» → ищем время' : askRate ? 'вопрос «сколько в час/день» → ищем производительность' : 'вопрос о количестве изделий → ищем работу'],
      inputs, unknown,
      formulaIds: ['work_total', 'price_total', 'direct_prop'],
      compute: (v) => {
        const val = answerFn(v);
        const unit = unknown === 't' ? timeUnit : unknown === 'p' ? `шт./${timeUnit}` : 'шт.';
        return { answer: answerStr(val, unit), unit, steps: steps(v, val) };
      },
    });
  },
});

/* ---- 41. Растворы / смеси ---- */
addRule({
  id: 'mixture', name: 'Концентрация раствора (массовая доля)',
  run(ctx) {
    if (!ctx.has(/(раствор|соли|сплав|концентрац|содержалос|массовая доля)/)) return null;
    const g = ctx.byUnit('g'), kg = ctx.byUnit('kg');
    const total = ctx.numNear(['раствор', 'сплав', 'массой', 'в'], ['g', 'kg', '']) ?? g[0] ?? kg[0];
    const sub = ctx.numNear(['соли', 'содержал', 'олова', 'вещества'], ['g', 'kg', '']) ?? g.find((v) => v !== total);
    if (total == null) return null;
    return buildResult(17, {
      matched: 'Доля вещества = mвещества / mсмеси · 100 %',
      why: ['слова «раствор / сплав / соль»'],
      inputs: { total, sub: sub ?? null }, unknown: 'процент',
      formulaIds: ['fraction_pct', 'pct_of'],
      compute: (v) => {
        if (v.sub == null) {
          const pct = ctx.first('pct') ?? 0;
          return { answer: answerStr(v.total * pct / 100, 'г'), unit: 'г', steps: [`m = ${fmt(v.total)} · ${fmt(pct)}/100 = ${fmt(v.total * pct / 100)} г`] };
        }
        const c = v.sub / v.total * 100;
        return { answer: `${fmt(c)} %`, unit: '%', steps: [`c = mвещества / mраствора · 100 %`, `c = ${fmt(v.sub)} / ${fmt(v.total)} · 100 % = ${fmt(c)} %`] };
      },
    });
  },
});

/* ---- 41б. Дробь (доля) от числа: «3/7 из них девочки» ---- */
const FRACTION_WORDS = {
  'одн': 1, 'дв': 2, 'три': 3, 'четыр': 4, 'пят': 5,
  'шест': 6, 'сем': 7, 'вос': 8, 'девят': 9, 'десят': 10,
};
const DENOM_WORDS = ['втор', 'трет', 'четверт', 'пят', 'шест', 'седьм', 'восьм', 'девят', 'десят'];

function parseFraction(text) {
  const dm = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (dm) {
    const a = Number(dm[1]), b = Number(dm[2]);
    if (b && a <= b) return { a, b, index: dm.index, length: dm[0].length, form: `${a}/${b}` };
    return null;
  }
  const wm = text.match(/(одн|дв|три|четыр|пят|шест|сем|вос|девят|десят)[а-я]*\s+(втор|трет|четверт|пят|шест|седьм|восьм|девят|десят)[а-я]*/);
  if (wm) {
    const a = FRACTION_WORDS[wm[1]];
    const b = DENOM_WORDS.findIndex((n) => wm[2].startsWith(n)) + 2;
    if (a && b && a <= b) return { a, b, index: wm.index, length: wm[0].length, form: `${wm[0]}` };
  }
  if (/половин/.test(text)) return { a: 1, b: 2, index: text.indexOf('половин'), length: 8, form: 'половина' };
  if (/трет[ьи]/.test(text)) return { a: 1, b: 3, index: text.indexOf('трет'), length: 5, form: 'треть' };
  if (/четверт/.test(text)) return { a: 1, b: 4, index: text.indexOf('четверт'), length: 7, form: 'четверть' };
  return null;
}

addRule({
  id: 'fraction_of', name: 'Дробь от числа: часть = целое · a/b',
  run(ctx) {
    const text = ctx.text;
    const fr = parseFraction(text);
    if (!fr) return null;
    // целое — это число, которое НЕ входит в запись самой дроби
    const candidates = ctx.nums.filter((n) => {
      const s0 = n.index, s1 = n.index + n.raw.length;
      return s1 <= fr.index + 1 || s0 >= fr.index + fr.length - 1;
    }).filter((n) => n.v > 0);
    if (!candidates.length) return null;
    const totalish = candidates.find((n) => /(числа|всего|всех|класс|ученик|страниц|книг|детал|кг|метр)/.test(n.before + ' ' + n.after));
    const whole = (totalish || candidates.sort((x, y) => y.v - x.v)[0]).v;
    const rest = /(остал|осталось|остаток|израсход|съел|продал)/.test(text);
    return buildResult(17, {
      matched: `Дробь от числа: ${fr.form} от целого`,
      why: [`найдена дробь ${fr.a}/${fr.b}`, `целое: ${fmt(whole)}`, rest ? 'спрашивают про остаток — берём (1 − a/b)' : 'спрашивают про часть — берём a/b'],
      inputs: { whole, a: fr.a, b: fr.b }, unknown: rest ? 'остаток' : 'часть',
      formulaIds: ['fraction_pct', 'pct_of', 'direct_prop'],
      compute: (v) => {
        const part = v.whole * v.a / v.b;
        const val = rest ? v.whole - part : part;
        const steps = [
          `Целое: ${fmt(v.whole)}. Дробь: ${v.a}/${v.b}.`,
          `Одна ${v.b}-я часть: ${fmt(v.whole)} : ${v.b} = ${fmt(v.whole / v.b)}.`,
          rest
            ? `Взяли ${v.a} таких частей: ${fmt(part)}; осталось ${fmt(v.whole)} − ${fmt(part)} = ${fmt(val)}.`
            : `Берём ${v.a} таких частей: ${fmt(v.whole / v.b)} · ${v.a} = ${fmt(val)}.`,
          `Ответ: ${fmtSmart(val)} — это ${fmt(v.a / v.b * 100)} % от ${fmt(v.whole)}.`,
        ];
        return { answer: fmtSmart(val), unit: '', steps };
      },
    });
  },
});

/* ---- 42. Простые текстовые задачи «на … больше, всего …» ---- */
addRule({
  id: 'word_two_parts', name: 'Две части с условием «на … больше» и «всего …»',
  run(ctx) {
    if (!ctx.has(/(на \d+.*больше|на \d+.*меньше|в \d+.*раза.*больше|всего|вместе)/)) return null;
    const nums = ctx.values('').filter((v) => v > 0);
    if (nums.length < 2) return null;
    const total = ctx.numNear(['всего', 'вместе', 'составило', 'было продано'], ['']) ?? nums[nums.length - 1];
    const diff = ctx.numNear(['на'], ['']) ?? nums.find((v) => v !== total);
    if (total == null || diff == null) return null;
    const times = ctx.has(/в [\d.]+ раза/);
    const k = times ? Number(ctx.text.match(/в ([\d.]+) раза/)[1]) : null;
    return buildResult(12, {
      matched: times ? 'Задача на «в k раз больше»' : 'Задача на «на d больше»',
      why: ['слова «на … больше / всего»'],
      inputs: { total, diff, k }, unknown: 'x', formulaIds: ['task_by_equation', 'linear_eq'],
      compute: (v) => {
        let x;
        if (v.k) x = v.total / (v.k + 1);
        else x = (v.total - v.diff) / 2;
        const y = v.k ? v.total - x : v.total - x;
        return {
          answer: `первая часть ${fmt(x)}, вторая ${fmt(y)}`, unit: '',
          steps: [
            v.k ? `Пусть первая часть x, тогда вторая ${fmt(v.k)}x.` : 'Пусть первая часть x, тогда вторая x + d.',
            v.k ? `x + ${fmt(v.k)}x = ${fmt(v.total)}` : `x + (x + ${fmt(v.diff)}) = ${fmt(v.total)}`,
            v.k ? `${fmt(1 + v.k)}x = ${fmt(v.total)} ⇒ x = ${fmt(x)}` : `2x = ${fmt(v.total)} − ${fmt(v.diff)} ⇒ x = ${fmt(x)}`,
            `Вторая часть: ${fmt(y)}.`,
          ],
        };
      },
    });
  },
});

/* ---- 43. Составление формулы по условию ---- */
addRule({
  id: 'compose_formula', name: 'Составить формулу линейной зависимости по условию',
  run(ctx) {
    if (!ctx.has(/(задайте формулой|составьте формулу|выразите формулой|зависимость.*формулой)/)) return null;
    // Берём только числа, перечисленные в условии (а не номер задачи и не проценты)
    const srcText = ctx.text.replace(/^\s*\d{1,2}\s*[.)]\s*/, '');
    const listMatch = srcText.match(/чис[еа]л[а-яё]*\s*[:—-]?\s*([\d\s,.;и]+)/);
    let nums;
    if (listMatch) {
      nums = (listMatch[1].match(/-?\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.')));
    } else {
      nums = ctx.values('').filter((v) => !ctx.byUnit('pct').includes(v));
    }
    if (nums.length < 2) return null;
    const rate = ctx.numNear(['кажд', 'в час', 'за', 'по', 'скорость', 'цена'], ['']) ?? nums[0];
    const base = nums.find((v) => v !== rate) ?? 0;
    return buildResult(15, {
      matched: 'Линейная функция y = kx + b', why: ['запрос «задайте формулой»', 'коэффициент и начальное значение'],
      inputs: { k: rate, b: base }, unknown: 'формула', formulaIds: ['linear_function', 's_50t_20', 'water_basin'],
      compute: (v) => ({
        answer: `y = ${fmt(v.k)}x ${v.b >= 0 ? '+ ' + fmt(v.b) : '− ' + fmt(-v.b)}`, unit: '',
        steps: [`Начальное значение (при x = 0): b = ${fmt(v.b)}`, `На каждую единицу x значение меняется на k = ${fmt(v.k)}`, `Формула: y = kx + b = ${fmt(v.k)}x ${v.b >= 0 ? '+ ' + fmt(v.b) : '− ' + fmt(-v.b)}`, 'График — прямая; это линейная функция.'],
      }),
    });
  },
});

/* ---- 43b. Как изменится площадь/объём при изменении линейного размера ---- */
addRule({
  id: 'scaling', name: 'Как изменится площадь / объём при увеличении размера в k раз',
  run(ctx) {
    if (!ctx.has(/как изменится|во сколько раз (увеличится|уменьшится)|увеличит.*в \d+ раз/)) return null;
    const km = ctx.text.match(/в\s+(\d+(?:\.\d+)?)\s*раз/);
    if (!km) return null;
    const k = Number(km[1]);
    const volume = ctx.has(/(объём|шар|куб)/);
    const power = volume ? 3 : 2;
    return buildResult(26, {
      matched: volume ? 'V₂ = V₁·k³' : 'S₂ = S₁·k²',
      why: ['вопрос «как изменится»', `размер увеличен в ${fmt(k)} раза`],
      inputs: { k, p: power }, unknown: 'коэффициент изменения',
      formulaIds: volume ? ['cube_growth3', 'sphere_volume'] : ['circle_area', 'area_growth2'],
      compute: (v) => {
        const factor = Math.pow(v.k, v.p);
        return {
          answer: `увеличится в ${fmt(factor)} раза (на ${fmt((factor - 1) * 100)} %)`,
          unit: '',
          steps: [
            volume ? 'Объём куба/шара пропорционален кубу линейного размера: V = a³ (V = 4πr³/3).' : 'Площадь пропорциональна квадрату линейного размера: S = a² (S = πr²).',
            `Размер увеличен в k = ${fmt(v.k)} раза ⇒ коэффициент k${power === 3 ? '³' : '²'} = ${fmt(factor)}.`,
            `Ответ: ${volume ? 'объём' : 'площадь'} увеличится в ${fmt(factor)} раза, т. е. на ${fmt((factor - 1) * 100)} %.`,
          ],
        };
      },
    });
  },
});

/* ---- 44. Запасной шаблон: вычислить что угодно ---- */
addRule({
  id: 'fallback_expression', name: 'Запасной разбор: вычисление выражения из текста',
  run(ctx) {
    const m = ctx.raw.match(/(-?\d+(?:[.,]\d+)?(?:\s*[+\-*/:^]\s*-?\d+(?:[.,]\d+)?|\s*\([^)]*\))+)/);
    if (!m) return null;
    const expr = m[1].replace(/,/g, '.').replace(/:/g, '/').replace(/−|–|—/g, '-');
    let val;
    try { val = evaluate(expr); } catch { return null; }
    return buildResult(4, {
      matched: 'Арифметическое выражение в тексте', why: ['найдена цепочка арифметических действий'],
      inputs: { expr }, unknown: 'значение', formulaIds: ['numeric_expr'],
      compute: (v) => ({ answer: fmtSmart(evaluate(v.expr)), unit: '', steps: [`Выражение: ${v.expr}`, `Значение: ${fmt(evaluate(v.expr))}`] }),
    });
  },
});

/* ======================================================================
 * ГЛАВНАЯ ФУНКЦИЯ
 * ====================================================================== */
/* ------------------------------------------------- проверка ответа
 * Универсальный приём: берём формулу, по которой решали, подставляем в неё
 * найденный ответ и все известные числа из условия — левая и правая части
 * должны совпасть. Это работает для любой задачи, а не только для остатков.
 * ---------------------------------------------------------------------- */
function verifyByFormula(formulaIds, inputs, answer) {
  // «60 км/ч», «90 см²», «1,08 км» → 60, 90, 1.08
  const m = String(answer).replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const num = Number(m[0].replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  const given = inputs || {};
  for (const id of formulaIds || []) {
    const f = FORMULA_BY_ID.get(id);
    if (!f || !f.eq) continue;
    const [L, R] = f.eq.split('=');
    const vars = f.vars || [];
    // Известные из условия: те, что пришли числом. Пустые/null — это искомая.
    const scope = {};
    const unknownVars = [];
    for (const v of vars) {
      const val = given[v.name];
      if (typeof val === 'number' && Number.isFinite(val)) scope[v.name] = val;
      else unknownVars.push(v);
    }
    if (unknownVars.length !== 1) continue;      // формула должна давать ровно один ответ
    scope[unknownVars[0].name] = num;
    try {
      const l = evaluate(L, scope), r = evaluate(R, scope);
      if (!Number.isFinite(l) || !Number.isFinite(r)) continue;
      if (Math.abs(l - r) > 1e-6 * (1 + Math.abs(l) + Math.abs(r))) continue; // не та формула
      return {
        title: `Проверка по формуле «${f.display}»`,
        ok: true,
        detail: `Подставили ответ и данные: слева ${fmt(l)}, справа ${fmt(r)} — совпало.`,
      };
    } catch { /* пробуем следующую формулу */ }
  }
  return null;
}

export function solveTask(raw, options = {}) {
  const ctx = makeContext(raw);
  const attempts = [];
  for (const rule of RULES) {
    try {
      const r = rule.run(ctx);
      if (r) attempts.push({ ...r, id: rule.id, name: rule.name });
    } catch (e) {
      attempts.push({ id: rule.id, name: rule.name, score: -1, error: e.message });
    }
  }
  attempts.sort((a, b) => b.score - a.score);
  const best = attempts.find((a) => a.score > 0 && a.compute);

  const base = {
    ok: !!best,
    text: raw,
    candidates: attempts.filter((a) => a.score > 0).slice(0, 8).map((a) => ({ id: a.id, name: a.name, score: a.score, matched: a.matched })),
    debug: attempts.filter((a) => a.error).map((a) => `${a.id}: ${a.error}`),
    related: [],
    whatIf: [],
    notes: [],
    steps: [],
  };

  if (!best) {
    // Никогда не возвращаем пустой ответ: подсказываем по единицам и словам.
    const guesses = [];
    if (ctx.has(/км\/ч|скорост|путь|проехал|движ/)) guesses.push('Похоже на задачу о движении: s = v·t, t = s/(v₁+v₂) при встречном движении.');
    if (ctx.has(/%|процент/)) guesses.push('Похоже на задачу на проценты: x = b·a/100.');
    if (ctx.has(/площад|периметр|объём/)) guesses.push('Похоже на геометрию: S = ab, P = 2(a+b), V = abc.');
    if (ctx.nums.length) guesses.push(`Извлечены числа: ${ctx.nums.map((n) => `${fmt(n.v)}${n.unit ? ' ' + K[n.unit] || '' : ''}`).join(', ')}. Уточните вопрос (что найти?) — шаблон сработает точнее.`);
    return {
      ...base,
      answer: 'Шаблон не распознан однозначно',
      steps: [
        'Парсер просмотрел все загруженные шаблоны, но совпадение ниже порога.',
        'Попробуйте явно указать искомую величину: «Найдите скорость», «Чему равно расстояние», «Сколько процентов».',
        ...guesses,
      ],
      related: formulaSearch(ctx.text.split(/\s+/).filter((w) => w.length > 4).slice(0, 4).join(' ')).slice(0, 6),
      notes: ['Это детерминированный парсер: он работает по словам, единицам измерения и структуре фразы, а не по догадке нейросети.'],
    };
  }

  let main;
  try { main = best.compute(best.inputs || {}); }
  catch (e) { main = { answer: `Ошибка вычисления: ${e.message}`, steps: [] }; }

  const relatedIds = new Set(best.formulaIds || []);
  const related = [...relatedIds].map((id) => FORMULA_BY_ID.get(id)).filter(Boolean);
  if (related.length < 5) {
    const q = (best.matched + ' ' + ctx.text).split(/\s+/).filter((w) => w.length > 4).slice(0, 5).join(' ');
    for (const f of formulaSearch(q).slice(0, 6)) if (!relatedIds.has(f.id)) { related.push(f); relatedIds.add(f.id); }
  }

  // «А что если другое число?» — прогон того же шаблона с изменёнными данными
  const whatIf = [];
  const inputs = best.inputs || {};
  const numericInputs = Object.entries(inputs).filter(([, v]) => typeof v === 'number' && Number.isFinite(v));
  for (const [key, value] of numericInputs.slice(0, 4)) {
    const variants = [value * 2, value / 2, value + 1, value - 1]
      .filter((v) => Number.isFinite(v) && Math.abs(v - value) > 1e-9 && v > -1e6)
      .map((v) => Math.round(v * 100) / 100);
    for (const nv of variants.slice(0, 3)) {
      const changed = { ...inputs, [key]: nv };
      try {
        const r = best.compute(changed);
        whatIf.push({ key, from: value, to: nv, answer: r.answer, label: `${key}: ${fmt(value)} → ${fmt(nv)}` });
      } catch { /* пропускаем неподходящий вариант */ }
    }
  }

  // Ответ противоречит вопросу — честно предупреждаем, а не выдаём как верный.
  const sanity = sanityCheck(ctx.question, main.answer, main.unit || '');

  return {
    ...base,
    bestId: best.id,
    sanity,
    pattern: best.name,
    matched: best.matched,
    confidence: Math.min(99, 55 + Math.round(best.score * 1.8)),
    why: best.why || [],
    inputs,
    unknown: best.unknown,
    answer: main.answer,
    unit: main.unit || '',
    // Каждый шаг — отдельное действие, пронумерованное: 1), 2), 3)…
    steps: toActions(main.steps || []),
    rawSteps: main.steps || [],
    // Проверка ответа и альтернативные способы решения (если шаблон их дал).
    checks: (() => {
      if (main.checks?.length) return main.checks;
      const auto = verifyByFormula(best.formulaIds, inputs, main.answer);
      return auto ? [auto] : [];
    })(),
    variants: main.variants || [],
    variantsNote: main.variantsNote || '',
    notes: [
      ...(best.notes || []),
      ...(main.notes || []),
      ...(sanity.ok ? [] : [`Возможно, шаблон подобран неверно: ${sanity.hint} Проверьте, что именно спрашивают в задаче.`]),
    ],
    formulaIds: best.formulaIds || [],
    related: related.slice(0, 8),
    whatIf: whatIf.slice(0, 10),
    draw: best.draw || null,
    compute: best.compute,
  };
}

/** Пересчёт с изменёнными пользователем числами. */
export function recomputeWith(solution, newInputs) {
  if (!solution?.compute) return null;
  try { return solution.compute({ ...solution.inputs, ...newInputs }); }
  catch (e) { return { answer: e.message, steps: [] }; }
}

export const RULE_COUNT = RULES.length;
export const RULE_NAMES = RULES.map((r) => ({ id: r.id, name: r.name }));

export const __ctx = makeContext;
