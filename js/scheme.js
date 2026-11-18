/* =========================================================================
 * scheme.js — «Схема»: конструктор схем-таблиц и смет.
 *
 * Что умеет (всё офлайн, без зависимостей):
 *   1) Таблица с вертикальными и горизонтальными линиями: столбцы —
 *      объекты/подгруппы («1-я корзина», «Понедельник», «Стоимость»),
 *      строки — величины («Кол-во», «Цена», «Яблоки»). Ячейка — число или
 *      выражение над переменными и любыми БОЛЕЕ ЛЕВЫМИ столбцами той же
 *      строки («колво * цена»).
 *   2) Автосуммы: столбец «Всего» (по строкам) и строка «Итого» (по столбцам).
 *   3) Стрелки над схемой: горизонтальная линия, вертикальные засечки,
 *      числа и дуги «что от чего зависит» (или «зависит от выбранного
 *      вопроса» — пункт «Что нужно найти» подсвечивает входы стрелками).
 *   4) 37 заготовленных вопросов по группам — от самых базовых («сумма»,
 *      «среднее арифметическое») до смет, движения и работы. Группа выбирается
 *      наверху («что решаем / какая подгруппа»).
 *   5) «Своё действие»: пользователь сам добавляет новую операцию (название +
 *      формула над переменными) — она попадает в список вопросов. Список
 *      продлевается бесконечно, как и список переменных и стрелок.
 *   6) «Составить условие»: из схемы собирается полноценный текст задачи
 *      (с таблицей), который можно решить кнопкой «Решить», скопировать или
 *      вставить в «Задачи».
 *
 * Модуль чистый: ни DOM, ни localStorage — их берёт на себя app.js,
 * поэтому всё проверяется тестами (tests/smoke.mjs).
 * ========================================================================= */
import { evaluate, fmt, registerVariables } from './mathcore.js';

export const SCHEME_STORE = 'gdzcalc.scheme.v1';

const IDENT_RE = /^[A-Za-zА-Яа-я_Ёё][A-Za-zА-Яа-я_0-9Ёё]*$/;
const norm = (s) => String(s ?? '').replace(/,/g, '.').trim();

let uid = 1;
export const nid = (prefix) => `${prefix}${(uid++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------------ группы */
export const QUESTION_GROUPS = [
  { id: 'basic',  label: 'Базовые' },
  { id: 'frac',   label: 'Дроби и проценты' },
  { id: 'smeta',  label: 'Смета и покупки' },
  { id: 'motion', label: 'Движение' },
  { id: 'work',   label: 'Работа' },
  { id: 'stat',   label: 'Статистика' },
  { id: 'geo',    label: 'Геометрия' },
  { id: 'custom', label: 'Своё действие' },
];

/* =========================================================================
 * 1) Пустая схема и пресеты
 * ========================================================================= */
export function emptyScheme() {
  return {
    title: '',
    group: 'basic',
    vars: [
      { name: 'a', expr: '12' },
      { name: 'b', expr: '4' },
    ],
    columns: [
      { id: 'c1', title: 'Первый', unit: '' },
      { id: 'c2', title: 'Второй', unit: '' },
    ],
    rows: [{ id: 'r1', label: 'Величина', unit: '' }],
    cells: { 'r1|c1': 'a', 'r1|c2': 'b' },
    showSumCol: true,
    showSumRow: true,
    relations: [{ id: 'rel1', fromKind: 'col', from: 'c1', toKind: 'col', to: 'c2', op: 'times' }],
    questionId: 'sum',
    assignments: { a: 'a', b: 'b' },
    customQuestions: [],
  };
}

export const PRESETS = [
  { id: 'baskets', label: 'Корзины: было — продали — осталось' },
  { id: 'smeta',   label: 'Смета: кол-во × цена' },
  { id: 'motion',  label: 'Движение: s = v · t' },
  { id: 'average', label: 'Среднее арифметическое' },
  { id: 'blank',   label: 'Пустая схема' },
];

export function presetScheme(id) {
  switch (id) {
    case 'baskets':
      return {
        ...emptyScheme(),
        title: 'Корзины с яблоками',
        group: 'basic',
        vars: [
          { name: 'было', expr: '24' },
          { name: 'продали', expr: '7' },
        ],
        columns: [
          { id: 'c1', title: 'было', unit: 'шт' },
          { id: 'c2', title: 'продали', unit: 'шт' },
          { id: 'c3', title: 'осталось', unit: 'шт' },
        ],
        rows: [{ id: 'r1', label: 'Яблоки', unit: 'шт' }],
        cells: { 'r1|c1': 'было', 'r1|c2': 'продали', 'r1|c3': 'было - продали' },
        relations: [
          { id: 'rel1', fromKind: 'col', from: 'c1', toKind: 'col', to: 'c3', op: 'minus' },
          { id: 'rel2', fromKind: 'col', from: 'c2', toKind: 'col', to: 'c3', op: 'minus' },
        ],
        questionId: 'diff',
        assignments: { a: 'было', b: 'продали' },
        customQuestions: [],
      };
    case 'smeta':
      return {
        ...emptyScheme(),
        title: 'Смета покупки',
        group: 'smeta',
        vars: [{ name: 'наличные', expr: '1000' }],
        columns: [
          { id: 'c1', title: 'колво', unit: 'шт' },
          { id: 'c2', title: 'цена', unit: '₽' },
          { id: 'c3', title: 'стоимость', unit: '₽' },
        ],
        rows: [
          { id: 'r1', label: 'Тетради', unit: '' },
          { id: 'r2', label: 'Ручки', unit: '' },
          { id: 'r3', label: 'Книга', unit: '' },
        ],
        cells: {
          'r1|c1': '2', 'r1|c2': '15', 'r1|c3': 'колво * цена',
          'r2|c1': '3', 'r2|c2': '7',  'r2|c3': 'колво * цена',
          'r3|c1': '1', 'r3|c2': '240','r3|c3': 'колво * цена',
        },
        showSumRow: true,
        relations: [
          { id: 'rel1', fromKind: 'col', from: 'c1', toKind: 'col', to: 'c3', op: 'times' },
          { id: 'rel2', fromKind: 'col', from: 'c2', toKind: 'col', to: 'c3', op: 'times' },
        ],
        questionId: 'grandTotal',
        assignments: { total: { kind: 'columnSum', columnId: 'c3' } },
        customQuestions: [],
      };
    case 'motion':
      return {
        ...emptyScheme(),
        title: 'Поезд в пути',
        group: 'motion',
        vars: [
          { name: 'v', expr: '60' },
          { name: 't', expr: '3' },
        ],
        columns: [
          { id: 'c1', title: 'v', unit: 'км/ч' },
          { id: 'c2', title: 't', unit: 'ч' },
          { id: 'c3', title: 's', unit: 'км' },
        ],
        rows: [{ id: 'r1', label: 'Поезд', unit: '' }],
        cells: { 'r1|c1': 'v', 'r1|c2': 't', 'r1|c3': 'v * t' },
        relations: [
          { id: 'rel1', fromKind: 'col', from: 'c1', toKind: 'col', to: 'c3', op: 'times' },
          { id: 'rel2', fromKind: 'col', from: 'c2', toKind: 'col', to: 'c3', op: 'times' },
        ],
        questionId: 'distance',
        assignments: { v: 'v', t: 't' },
        customQuestions: [],
      };
    case 'average':
      return {
        ...emptyScheme(),
        title: 'Средняя отметка',
        group: 'stat',
        vars: [
          { name: 'a', expr: '4' },
          { name: 'b', expr: '5' },
          { name: 'c', expr: '3' },
        ],
        columns: [
          { id: 'c1', title: 'Первая', unit: '' },
          { id: 'c2', title: 'Вторая', unit: '' },
          { id: 'c3', title: 'Третья', unit: '' },
        ],
        rows: [{ id: 'r1', label: 'Отметки', unit: '' }],
        cells: { 'r1|c1': 'a', 'r1|c2': 'b', 'r1|c3': 'c' },
        relations: [],
        questionId: 'mean3',
        assignments: { a: 'a', b: 'b', c: 'c' },
        customQuestions: [],
      };
    case 'blank':
    default:
      return {
        ...emptyScheme(),
        title: '',
        vars: [],
        columns: [{ id: 'c1', title: 'Столбец 1', unit: '' }, { id: 'c2', title: 'Столбец 2', unit: '' }],
        rows: [{ id: 'r1', label: 'Строка 1', unit: '' }],
        cells: {},
        relations: [],
        questionId: 'sum',
        assignments: {},
        customQuestions: [],
      };
  }
}

/* =========================================================================
 * 2) Вычисление таблицы и переменных
 * ========================================================================= */
export function evaluateScheme(model) {
  const errors = [];
  // Сначала регистрируем все имена (многосимвольные иначе режутся на буквы).
  const names = [];
  for (const v of model.vars) { const n = String(v?.name || '').trim(); if (IDENT_RE.test(n)) names.push(n); }
  for (const c of model.columns) { const t = String(c?.title || '').trim(); if (IDENT_RE.test(t)) names.push(t); }
  if (names.length) registerVariables(names);

  // Переменные считаем по очереди — каждая может опираться на предыдущие.
  const scope = {};
  for (const v of model.vars) {
    const name = String(v?.name || '').trim();
    if (!name) continue;
    if (!IDENT_RE.test(name)) { errors.push(`Имя переменной «${name}» не подходит: только буквы, цифры и _ (с буквы).`); continue; }
    try {
      const val = evaluate(norm(v.expr), scope);
      if (!Number.isFinite(val)) { errors.push(`Переменная «${name}» не вычислилась.`); scope[name] = NaN; }
      else scope[name] = val;
    } catch (e) { errors.push(`Переменная «${name}»: ${e.message}`); scope[name] = NaN; }
  }

  // Ячейки: слева направо, выражение видит переменные и левые столбцы своей строки.
  const colIdents = model.columns.map((c) => {
    const t = String(c.title || '').trim();
    return IDENT_RE.test(t) ? t : null;
  });
  const grid = model.rows.map((row) => {
    const rowScope = { ...scope };
    return model.columns.map((col, ci) => {
      const key = `${row.id}|${col.id}`;
      const raw = String(model.cells[key] ?? '');
      if (!raw.trim()) return { raw, value: NaN, empty: true };
      try {
        const value = evaluate(norm(raw), rowScope);
        if (!Number.isFinite(value)) return { raw, value: NaN, error: 'Не число' };
        const idn = colIdents[ci];
        if (idn) rowScope[idn] = value; // для следующих столбцов этой строки
        return { raw, value };
      } catch (e) {
        return { raw, value: NaN, error: e.message };
      }
    });
  });

  const rowTotals = grid.map((row) => row.reduce((acc, cell) => acc + (Number.isFinite(cell.value) ? cell.value : 0), 0));
  const colTotals = model.columns.map((_, ci) => grid.reduce((acc, row) => acc + (Number.isFinite(row[ci].value) ? row[ci].value : 0), 0));

  return { scope, grid, rowTotals, colTotals, errors };
}

const finiteValues = (arr) => arr.filter((v) => Number.isFinite(v));
export const sumFinite = (arr) => finiteValues(arr).reduce((s, v) => s + v, 0);

/**
 * Данные для столбчатой диаграммы по таблице:
 * значения одной колонки по всем строкам с подписями строк.
 * @returns {{ label: string, value: number }[]}
 */
export function chartSeries(model, columnId) {
  if (!model || !Array.isArray(model.columns) || !Array.isArray(model.rows)) return [];
  const ci = model.columns.findIndex((c) => c.id === columnId);
  if (ci < 0) return [];
  const ev = evaluateScheme(model);
  const out = [];
  model.rows.forEach((row, ri) => {
    const cell = ev.grid?.[ri]?.[ci];
    if (cell && Number.isFinite(cell.value)) {
      out.push({ label: String(row.label || `Строка ${ri + 1}`), value: cell.value });
    }
  });
  return out;
}

/* =========================================================================
 * 3) Операнды вопросов: выражение над переменными, Σ столбца, Σ строки
 * ========================================================================= */
export function resolveOperand(op, assignment, ctx) {
  // assignment: { kind:'expr', src } | { kind:'columnSum', columnId } | { kind:'rowSum', rowId }
  if (assignment == null) {
    // обратная совместимость: строка = выражение
    assignment = { kind: 'expr', src: String(assignment ?? '') };
  }
  if (typeof assignment === 'string') assignment = { kind: 'expr', src: assignment };
  if (assignment.kind === 'columnSum') {
    const ci = ctx.model.columns.findIndex((c) => c.id === assignment.columnId);
    return ci >= 0 ? ctx.evaluation.colTotals[ci] : NaN;
  }
  if (assignment.kind === 'rowSum') {
    const ri = ctx.model.rows.findIndex((r) => r.id === assignment.rowId);
    return ri >= 0 ? ctx.evaluation.rowTotals[ri] : NaN;
  }
  const src = norm(assignment.src ?? assignment);
  if (!src) return NaN;
  try { return evaluate(src, ctx.scope); } catch { return NaN; }
}

const describeAssignment = (assignment, ctx) => {
  if (assignment == null) return '—';
  if (typeof assignment === 'string') return assignment;
  if (assignment.kind === 'columnSum') {
    const c = ctx?.model?.columns.find((x) => x.id === assignment.columnId);
    return `Σ столбца «${c ? c.title : assignment.columnId}»`;
  }
  if (assignment.kind === 'rowSum') {
    const r = ctx?.model?.rows.find((x) => x.id === assignment.rowId);
    return `Σ строки «${r ? r.label : assignment.rowId}»`;
  }
  return String(assignment.src ?? '—');
};

/* =========================================================================
 * 4) Заготовленные вопросы
 * -------------------------------------------------------------------------
 * Каждый шаблон: operands — что спросить у пользователя; solve — считает и
 * возвращает шаги/ответ; question — текст вопроса для условия.
 * ========================================================================= */
const exprOp = (key, label, hint) => ({ key, label, kind: 'expr', hint });
const colSumOp = (key, label) => ({ key, label, kind: 'columnSum' });

export const QUESTIONS = [
  /* ------------------------------ Базовые ------------------------------ */
  {
    id: 'sum', group: 'basic', label: 'Сумма (a + b)', unit: '',
    operands: [exprOp('a', 'Первое слагаемое', 'a'), exprOp('b', 'Второе слагаемое', 'b')],
    formula: 'a + b', question: 'Сколько всего?',
    solve: (v) => ({
      steps: [`Складываем: ${fmt(v.a)} + ${fmt(v.b)} = ${fmt(v.a + v.b)}.`],
      answer: v.a + v.b, unit: '',
    }),
  },
  {
    id: 'diff', group: 'basic', label: 'Разность (a − b)', unit: '',
    operands: [exprOp('a', 'Уменьшаемое', 'a'), exprOp('b', 'Вычитаемое', 'b')],
    formula: 'a − b', question: 'На сколько одно больше другого?',
    solve: (v) => ({
      steps: [`Вычитаем: ${fmt(v.a)} − ${fmt(v.b)} = ${fmt(v.a - v.b)}.`],
      answer: v.a - v.b, unit: '',
    }),
  },
  {
    id: 'prod', group: 'basic', label: 'Произведение (a · b)', unit: '',
    operands: [exprOp('a', 'Первый множитель', 'a'), exprOp('b', 'Второй множитель', 'b')],
    formula: 'a · b', question: 'Чему равно произведение?',
    solve: (v) => ({
      steps: [`Умножаем: ${fmt(v.a)} · ${fmt(v.b)} = ${fmt(v.a * v.b)}.`],
      answer: v.a * v.b, unit: '',
    }),
  },
  {
    id: 'quot', group: 'basic', label: 'Частное (a ÷ b)', unit: '',
    operands: [exprOp('a', 'Делимое', 'a'), exprOp('b', 'Делитель', 'b')],
    formula: 'a ÷ b', question: 'Чему равно частное?',
    solve: (v) => {
      if (v.b === 0) return { error: 'На ноль делить нельзя.' };
      return {
        steps: [`Делим: ${fmt(v.a)} ÷ ${fmt(v.b)} = ${fmt(v.a / v.b)}.`],
        answer: v.a / v.b, unit: '',
      };
    },
  },
  {
    id: 'mean2', group: 'basic', label: 'Среднее арифметическое двух чисел', unit: '',
    operands: [exprOp('a', 'Первое число', 'a'), exprOp('b', 'Второе число', 'b')],
    formula: '(a + b) / 2', question: 'Чему равно среднее арифметическое?',
    solve: (v) => ({
      steps: [
        `Сумма чисел: ${fmt(v.a)} + ${fmt(v.b)} = ${fmt(v.a + v.b)}.`,
        `Среднее арифметическое: ${fmt(v.a + v.b)} ÷ 2 = ${fmt((v.a + v.b) / 2)}.`,
      ],
      answer: (v.a + v.b) / 2, unit: '',
    }),
  },
  {
    id: 'mean3', group: 'stat', label: 'Среднее арифметическое трёх чисел', unit: '',
    operands: [exprOp('a', 'Первое число', 'a'), exprOp('b', 'Второе число', 'b'), exprOp('c', 'Третье число', 'c')],
    formula: '(a + b + c) / 3', question: 'Чему равно среднее арифметическое?',
    solve: (v) => ({
      steps: [
        `Сумма чисел: ${fmt(v.a)} + ${fmt(v.b)} + ${fmt(v.c)} = ${fmt(v.a + v.b + v.c)}.`,
        `Среднее арифметическое: ${fmt(v.a + v.b + v.c)} ÷ 3 = ${fmt((v.a + v.b + v.c) / 3)}.`,
      ],
      answer: (v.a + v.b + v.c) / 3, unit: '',
    }),
  },
  {
    id: 'scale', group: 'basic', label: 'Увеличить число в N раз', unit: '',
    operands: [exprOp('a', 'Число', 'a'), exprOp('n', 'Во сколько раз', 'n')],
    formula: 'a · n', question: 'Чему оно равно после увеличения?',
    solve: (v) => ({
      steps: [`Умножаем на ${fmt(v.n)}: ${fmt(v.a)} · ${fmt(v.n)} = ${fmt(v.a * v.n)}.`],
      answer: v.a * v.n, unit: '',
    }),
  },
  {
    id: 'more', group: 'basic', label: 'На сколько одно больше другого', unit: '',
    operands: [exprOp('a', 'Большее число', 'a'), exprOp('b', 'Меньшее число', 'b')],
    formula: 'a − b', question: 'На сколько больше?',
    solve: (v) => ({
      steps: [`Разность: ${fmt(v.a)} − ${fmt(v.b)} = ${fmt(v.a - v.b)}.`],
      answer: v.a - v.b, unit: '',
    }),
  },
  {
    id: 'times', group: 'basic', label: 'Во сколько раз одно больше другого', unit: '',
    operands: [exprOp('a', 'Большее число', 'a'), exprOp('b', 'Меньшее число', 'b')],
    formula: 'a ÷ b', question: 'Во сколько раз больше?',
    solve: (v) => {
      if (v.b === 0) return { error: 'На ноль делить нельзя.' };
      return {
        steps: [`Делим: ${fmt(v.a)} ÷ ${fmt(v.b)} = ${fmt(v.a / v.b)}.`],
        answer: v.a / v.b, unit: 'раз',
      };
    },
  },
  {
    id: 'remainder', group: 'basic', label: 'Остаток от деления', unit: '',
    operands: [exprOp('a', 'Делимое', 'a'), exprOp('b', 'Делитель', 'b')],
    formula: 'a mod b', question: 'Какой остаток?',
    solve: (v) => {
      if (!Number.isInteger(v.b) || v.b === 0) return { error: 'Делитель должен быть целым и не равным нулю.' };
      const q = Math.floor(v.a / v.b);
      const r = v.a - q * v.b;
      return {
        steps: [
          `Ближайшее целое частное: ${fmt(v.a)} ÷ ${fmt(v.b)} = ${q} (с недостатком).`,
          `Остаток: ${fmt(v.a)} − ${fmt(v.b)} · ${q} = ${fmt(r)}.`,
        ],
        answer: r, unit: '',
      };
    },
  },

  /* --------------------------- Дроби и проценты ------------------------- */
  {
    id: 'fracOf', group: 'frac', label: 'Часть от числа (a/b от n)', unit: '',
    operands: [exprOp('a', 'Числитель', '3'), exprOp('b', 'Знаменатель', '4'), exprOp('n', 'Число', 'n')],
    formula: 'n · a / b', question: 'Чему равна эта часть числа?',
    solve: (v) => {
      if (v.b === 0) return { error: 'Знаменатель не может быть нулём.' };
      const ans = (v.n * v.a) / v.b;
      return {
        steps: [
          `Находим одну часть: ${fmt(v.n)} ÷ ${fmt(v.b)} = ${fmt(v.n / v.b)}.`,
          `Берём ${fmt(v.a)} таких части(-ей): ${fmt(v.n / v.b)} · ${fmt(v.a)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '',
      };
    },
  },
  {
    id: 'numberByFrac', group: 'frac', label: 'Число по его части (a/b числа равно c)', unit: '',
    operands: [exprOp('a', 'Числитель', '3'), exprOp('b', 'Знаменатель', '4'), exprOp('c', 'Значение части', 'c')],
    formula: 'c · b / a', question: 'Чему равно всё число?',
    solve: (v) => {
      if (v.a === 0) return { error: 'Числитель не может быть нулём.' };
      const ans = (v.c * v.b) / v.a;
      return {
        steps: [
          `Одна часть: ${fmt(v.c)} ÷ ${fmt(v.a)} = ${fmt(v.c / v.a)}.`,
          `Всё число: ${fmt(v.c / v.a)} · ${fmt(v.b)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '',
      };
    },
  },
  {
    id: 'pctOfNumber', group: 'frac', label: 'Сколько процентов составляет a от b', unit: '%',
    operands: [exprOp('a', 'Часть', 'a'), exprOp('b', 'Целое', 'b')],
    formula: 'a / b · 100', question: 'Сколько процентов это составляет?',
    solve: (v) => {
      if (v.b === 0) return { error: 'Целое не может быть нулём.' };
      return {
        steps: [`Делим часть на целое и умножаем на 100: ${fmt(v.a)} ÷ ${fmt(v.b)} · 100 = ${fmt((v.a / v.b) * 100)} %.`],
        answer: (v.a / v.b) * 100, unit: '%',
      };
    },
  },
  {
    id: 'pctValue', group: 'frac', label: 'Процент от числа (p % от n)', unit: '',
    operands: [exprOp('p', 'Проценты', 'p'), exprOp('n', 'Число', 'n')],
    formula: 'n · p / 100', question: 'Чему равны эти проценты от числа?',
    solve: (v) => {
      const ans = (v.n * v.p) / 100;
      return {
        steps: [
          `1 % числа: ${fmt(v.n)} ÷ 100 = ${fmt(v.n / 100)}.`,
          `${fmt(v.p)} % от числа: ${fmt(v.n / 100)} · ${fmt(v.p)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '',
      };
    },
  },
  {
    id: 'numberByPct', group: 'frac', label: 'Число по его проценту (p % числа равны a)', unit: '',
    operands: [exprOp('p', 'Проценты', 'p'), exprOp('a', 'Значение процентов', 'a')],
    formula: 'a · 100 / p', question: 'Чему равно всё число?',
    solve: (v) => {
      if (v.p === 0) return { error: 'Проценты не могут быть нулём.' };
      const ans = (v.a * 100) / v.p;
      return {
        steps: [
          `1 % числа: ${fmt(v.a)} ÷ ${fmt(v.p)} = ${fmt(v.a / v.p)}.`,
          `Всё число: ${fmt(v.a / v.p)} · 100 = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '',
      };
    },
  },
  {
    id: 'pctDiff', group: 'frac', label: 'На сколько процентов a больше b', unit: '%',
    operands: [exprOp('a', 'Большее число', 'a'), exprOp('b', 'Меньшее число', 'b')],
    formula: '(a − b) / b · 100', question: 'На сколько процентов больше?',
    solve: (v) => {
      if (v.b === 0) return { error: 'Сравнивать с нулём нельзя.' };
      const ans = ((v.a - v.b) / v.b) * 100;
      return {
        steps: [
          `Разность: ${fmt(v.a)} − ${fmt(v.b)} = ${fmt(v.a - v.b)}.`,
          `Доля от ${fmt(v.b)}: ${fmt(v.a - v.b)} ÷ ${fmt(v.b)} · 100 = ${fmt(ans)} %.`,
        ],
        answer: ans, unit: '%',
      };
    },
  },
  {
    id: 'discount', group: 'frac', label: 'Цена со скидкой p %', unit: '₽',
    operands: [exprOp('n', 'Старая цена', 'n'), exprOp('p', 'Скидка, %', 'p')],
    formula: 'n · (100 − p) / 100', question: 'Сколько придётся заплатить?',
    solve: (v) => {
      const cut = (v.n * v.p) / 100;
      const ans = v.n - cut;
      return {
        steps: [
          `Скидка: ${fmt(v.n)} · ${fmt(v.p)} % = ${fmt(cut)} (в ден. ед.).`,
          `Новая цена: ${fmt(v.n)} − ${fmt(cut)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '₽',
      };
    },
  },
  {
    id: 'markup', group: 'frac', label: 'Цена с наценкой p %', unit: '₽',
    operands: [exprOp('n', 'Старая цена', 'n'), exprOp('p', 'Наценка, %', 'p')],
    formula: 'n · (100 + p) / 100', question: 'Сколько придётся заплатить?',
    solve: (v) => {
      const add = (v.n * v.p) / 100;
      const ans = v.n + add;
      return {
        steps: [
          `Наценка: ${fmt(v.n)} · ${fmt(v.p)} % = ${fmt(add)} (в ден. ед.).`,
          `Новая цена: ${fmt(v.n)} + ${fmt(add)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: '₽',
      };
    },
  },

  /* ------------------------------ Смета --------------------------------- */
  {
    id: 'lineTotal', group: 'smeta', label: 'Стоимость покупки (цена · количество)', unit: '₽',
    operands: [exprOp('price', 'Цена за штуку', 'цена'), exprOp('qty', 'Количество', 'колво')],
    formula: 'price · qty', question: 'Сколько это стоит?',
    solve: (v) => ({
      steps: [`Стоимость: ${fmt(v.price)} · ${fmt(v.qty)} = ${fmt(v.price * v.qty)}.`],
      answer: v.price * v.qty, unit: '₽',
    }),
  },
  {
    id: 'quantityBySum', group: 'smeta', label: 'Сколько штук можно купить на сумму', unit: 'шт',
    operands: [exprOp('sum', 'Сумма денег', 'sum'), exprOp('price', 'Цена за штуку', 'цена')],
    formula: 'sum ÷ price', question: 'Сколько штук можно купить?',
    solve: (v) => {
      if (v.price === 0) return { error: 'Цена не может быть нулём.' };
      const whole = Math.floor(v.sum / v.price);
      const rest = v.sum - whole * v.price;
      return {
        steps: [
          `Делим сумму на цену: ${fmt(v.sum)} ÷ ${fmt(v.price)} = ${fmt(v.sum / v.price)}.`,
          `Целых штук: ${whole} (остаток ${fmt(rest)}).`,
        ],
        answer: whole, unit: 'шт',
      };
    },
  },
  {
    id: 'priceBySum', group: 'smeta', label: 'Цена по сумме и количеству', unit: '₽',
    operands: [exprOp('sum', 'Сумма', 'sum'), exprOp('qty', 'Количество', 'колво')],
    formula: 'sum ÷ qty', question: 'Чему равна цена за штуку?',
    solve: (v) => {
      if (v.qty === 0) return { error: 'Количество не может быть нулём.' };
      return {
        steps: [`Цена: ${fmt(v.sum)} ÷ ${fmt(v.qty)} = ${fmt(v.sum / v.qty)}.`],
        answer: v.sum / v.qty, unit: '₽',
      };
    },
  },
  {
    id: 'grandTotal', group: 'smeta', label: 'Итоговая стоимость (сумма столбца)', unit: '₽',
    operands: [colSumOp('total', 'Столбец итоговой стоимости (Σ «Всего»)')],
    formula: 'Σ столбца', question: 'Чему равна итоговая стоимость?',
    solve: (v, ctx) => {
      const ci = ctx.model.columns.findIndex((c) => c.id === ctx.assignments.total?.columnId);
      const cells = ci >= 0 ? ctx.evaluation.grid.map((row) => row[ci].value).filter(Number.isFinite) : [];
      return {
        steps: [
          `Складываем столбец: ${cells.map(fmt).join(' + ') || '0'} = ${fmt(v.total)}.`,
        ],
        answer: v.total, unit: '₽',
      };
    },
  },
  {
    id: 'averagePrice', group: 'smeta', label: 'Средняя цена (итог ÷ количество)', unit: '₽',
    operands: [colSumOp('cost', 'Столбец стоимости (Σ)'), colSumOp('qty', 'Столбец количества (Σ)')],
    formula: 'Σ стоимость ÷ Σ количество', question: 'Чему равна средняя цена?',
    solve: (v) => {
      if (v.qty === 0) return { error: 'Количество не может быть нулём.' };
      return {
        steps: [`Делим итог на количество: ${fmt(v.cost)} ÷ ${fmt(v.qty)} = ${fmt(v.cost / v.qty)}.`],
        answer: v.cost / v.qty, unit: '₽',
      };
    },
  },
  {
    id: 'change', group: 'smeta', label: 'Сдача с покупки', unit: '₽',
    operands: [exprOp('cash', 'Сколько дали денег', 'наличные'), colSumOp('total', 'Столбец стоимости (Σ)')],
    formula: 'cash − Σ стоимость', question: 'Какую сдачу должны дать?',
    solve: (v) => ({
      steps: [
        `Итог по смете: ${fmt(v.total)}.`,
        `Сдача: ${fmt(v.cash)} − ${fmt(v.total)} = ${fmt(v.cash - v.total)}.`,
      ],
      answer: v.cash - v.total, unit: '₽',
    }),
  },

  /* ------------------------------ Движение ------------------------------- */
  {
    id: 'speed', group: 'motion', label: 'Скорость (v = s ÷ t)', unit: 'км/ч',
    operands: [exprOp('s', 'Путь', 's'), exprOp('t', 'Время', 't')],
    formula: 'v = s ÷ t', question: 'Чему равна скорость?',
    solve: (v) => {
      if (v.t === 0) return { error: 'Время не может быть нулём.' };
      return {
        steps: [`v = s ÷ t = ${fmt(v.s)} ÷ ${fmt(v.t)} = ${fmt(v.s / v.t)}.`],
        answer: v.s / v.t, unit: 'км/ч',
      };
    },
  },
  {
    id: 'distance', group: 'motion', label: 'Путь (s = v · t)', unit: 'км',
    operands: [exprOp('v', 'Скорость', 'v'), exprOp('t', 'Время', 't')],
    formula: 's = v · t', question: 'Какой путь пройден?',
    solve: (v) => ({
      steps: [`s = v · t = ${fmt(v.v)} · ${fmt(v.t)} = ${fmt(v.v * v.t)}.`],
      answer: v.v * v.t, unit: 'км',
    }),
  },
  {
    id: 'time', group: 'motion', label: 'Время (t = s ÷ v)', unit: 'ч',
    operands: [exprOp('s', 'Путь', 's'), exprOp('v', 'Скорость', 'v')],
    formula: 't = s ÷ v', question: 'Сколько времени займёт путь?',
    solve: (v) => {
      if (v.v === 0) return { error: 'Скорость не может быть нулём.' };
      return {
        steps: [`t = s ÷ v = ${fmt(v.s)} ÷ ${fmt(v.v)} = ${fmt(v.s / v.v)}.`],
        answer: v.s / v.v, unit: 'ч',
      };
    },
  },
  {
    id: 'avgSpeed', group: 'motion', label: 'Средняя скорость (весь путь ÷ всё время)', unit: 'км/ч',
    operands: [exprOp('s1', 'Путь на первом участке', 's1'), exprOp('t1', 'Время на первом участке', 't1'), exprOp('s2', 'Путь на втором участке', 's2'), exprOp('t2', 'Время на втором участке', 't2')],
    formula: '(s1 + s2) ÷ (t1 + t2)', question: 'Чему равна средняя скорость?',
    solve: (v) => {
      const s = v.s1 + v.s2, t = v.t1 + v.t2;
      if (t === 0) return { error: 'Суммарное время не может быть нулём.' };
      return {
        steps: [
          `Весь путь: ${fmt(v.s1)} + ${fmt(v.s2)} = ${fmt(s)}.`,
          `Всё время: ${fmt(v.t1)} + ${fmt(v.t2)} = ${fmt(t)}.`,
          `Средняя скорость: ${fmt(s)} ÷ ${fmt(t)} = ${fmt(s / t)}.`,
        ],
        answer: s / t, unit: 'км/ч',
      };
    },
  },

  /* -------------------------------- Работа ------------------------------- */
  {
    id: 'performance', group: 'work', label: 'Производительность (A ÷ t)', unit: 'в час',
    operands: [exprOp('A', 'Объём работы', 'A'), exprOp('t', 'Время', 't')],
    formula: 'p = A ÷ t', question: 'Чему равна производительность?',
    solve: (v) => {
      if (v.t === 0) return { error: 'Время не может быть нулём.' };
      return {
        steps: [`p = A ÷ t = ${fmt(v.A)} ÷ ${fmt(v.t)} = ${fmt(v.A / v.t)}.`],
        answer: v.A / v.t, unit: 'в час',
      };
    },
  },
  {
    id: 'workTime', group: 'work', label: 'Время работы (A ÷ p)', unit: 'ч',
    operands: [exprOp('A', 'Объём работы', 'A'), exprOp('p', 'Производительность', 'p')],
    formula: 't = A ÷ p', question: 'Сколько времени займёт работа?',
    solve: (v) => {
      if (v.p === 0) return { error: 'Производительность не может быть нулём.' };
      return {
        steps: [`t = A ÷ p = ${fmt(v.A)} ÷ ${fmt(v.p)} = ${fmt(v.A / v.p)}.`],
        answer: v.A / v.p, unit: 'ч',
      };
    },
  },
  {
    id: 'workDone', group: 'work', label: 'Объём работы (p · t)', unit: '',
    operands: [exprOp('p', 'Производительность', 'p'), exprOp('t', 'Время', 't')],
    formula: 'A = p · t', question: 'Какой объём работы выполнен?',
    solve: (v) => ({
      steps: [`A = p · t = ${fmt(v.p)} · ${fmt(v.t)} = ${fmt(v.p * v.t)}.`],
      answer: v.p * v.t, unit: '',
    }),
  },
  {
    id: 'joint', group: 'work', label: 'Совместная работа (за сколько вместе)', unit: 'ч',
    operands: [exprOp('t1', 'Первый делает работу за', 't1'), exprOp('t2', 'Второй делает работу за', 't2')],
    formula: '1 ÷ (1/t1 + 1/t2)', question: 'За сколько часов сделают вместе?',
    solve: (v) => {
      if (v.t1 === 0 || v.t2 === 0) return { error: 'Время не может быть нулём.' };
      const rate = 1 / v.t1 + 1 / v.t2;
      const ans = 1 / rate;
      return {
        steps: [
          `За час первый делает 1/${fmt(v.t1)}, второй — 1/${fmt(v.t2)} работы.`,
          `Вместе за час: 1/${fmt(v.t1)} + 1/${fmt(v.t2)} = ${fmt(rate)}.`,
          `Время вместе: 1 ÷ ${fmt(rate)} = ${fmt(ans)}.`,
        ],
        answer: ans, unit: 'ч',
      };
    },
  },

  /* ----------------------------- Статистика ------------------------------ */
  {
    id: 'spread', group: 'stat', label: 'Размах ряда (max − min)', unit: '',
    operands: [exprOp('a', 'Первое число', 'a'), exprOp('b', 'Второе число', 'b'), exprOp('c', 'Третье число', 'c')],
    formula: 'max − min', question: 'Чему равен размах?',
    solve: (v) => {
      const mx = Math.max(v.a, v.b, v.c), mn = Math.min(v.a, v.b, v.c);
      return {
        steps: [`Наибольшее: ${fmt(mx)}, наименьшее: ${fmt(mn)}.`, `Размах: ${fmt(mx)} − ${fmt(mn)} = ${fmt(mx - mn)}.`],
        answer: mx - mn, unit: '',
      };
    },
  },
  {
    id: 'median3', group: 'stat', label: 'Медиана трёх чисел', unit: '',
    operands: [exprOp('a', 'Первое число', 'a'), exprOp('b', 'Второе число', 'b'), exprOp('c', 'Третье число', 'c')],
    formula: 'среднее после упорядочивания', question: 'Чему равна медиана?',
    solve: (v) => {
      const s = [v.a, v.b, v.c].slice().sort((x, y) => x - y);
      return {
        steps: [`Упорядочиваем: ${s.map(fmt).join(' ≤ ')}.`, `Медиана — среднее число: ${fmt(s[1])}.`],
        answer: s[1], unit: '',
      };
    },
  },

  /* ------------------------------ Геометрия ------------------------------ */
  {
    id: 'rectPerimeter', group: 'geo', label: 'Периметр прямоугольника (2·(a+b))', unit: 'см',
    operands: [exprOp('a', 'Длина', 'a'), exprOp('b', 'Ширина', 'b')],
    formula: 'P = 2·(a + b)', question: 'Чему равен периметр?',
    solve: (v) => ({
      steps: [`P = 2 · (${fmt(v.a)} + ${fmt(v.b)}) = 2 · ${fmt(v.a + v.b)} = ${fmt(2 * (v.a + v.b))}.`],
      answer: 2 * (v.a + v.b), unit: 'см',
    }),
  },
  {
    id: 'rectArea', group: 'geo', label: 'Площадь прямоугольника (a · b)', unit: 'см²',
    operands: [exprOp('a', 'Длина', 'a'), exprOp('b', 'Ширина', 'b')],
    formula: 'S = a · b', question: 'Чему равна площадь?',
    solve: (v) => ({
      steps: [`S = ${fmt(v.a)} · ${fmt(v.b)} = ${fmt(v.a * v.b)}.`],
      answer: v.a * v.b, unit: 'см²',
    }),
  },
  {
    id: 'triPerimeter', group: 'geo', label: 'Периметр треугольника (a + b + c)', unit: 'см',
    operands: [exprOp('a', 'Сторона a', 'a'), exprOp('b', 'Сторона b', 'b'), exprOp('c', 'Сторона c', 'c')],
    formula: 'P = a + b + c', question: 'Чему равен периметр треугольника?',
    solve: (v) => ({
      steps: [`P = ${fmt(v.a)} + ${fmt(v.b)} + ${fmt(v.c)} = ${fmt(v.a + v.b + v.c)}.`],
      answer: v.a + v.b + v.c, unit: 'см',
    }),
  },
];

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id) => QUESTION_BY_ID.get(id) || null;

/* ----------------- Своё действие: пользователь продлевает список -------- */
/** def: { id, label, formula, unit, question } — formula над переменными/столбцами. */
export function buildCustomQuestion(def) {
  return {
    id: `custom:${def.id}`,
    custom: true,
    group: 'custom',
    label: def.label || 'Своё действие',
    unit: def.unit || '',
    operands: [],
    formula: def.formula,
    question: def.question || 'Что получится?',
    solve: (_v, ctx) => {
      const scope = { ...ctx.scope };
      // Имена столбцов значат СУММУ своего столбца («стоимость» → итог по столбцу).
      ctx.model.columns.forEach((c, ci) => {
        const t = String(c.title || '').trim();
        if (IDENT_RE.test(t)) scope[t] = ctx.evaluation.colTotals[ci];
      });
      try {
        const answer = evaluate(norm(def.formula), scope);
        if (!Number.isFinite(answer)) return { error: 'Формула не вычислилась: проверьте переменные.' };
        const used = Object.keys(scope).filter((k) => {
          const re = new RegExp(`(^|[^A-Za-zА-Яа-я_0-9Ёё])${k}([^A-Za-zА-Яа-я_0-9Ёё]|$)`);
          return re.test(def.formula);
        });
        const subst = used.slice(0, 8).map((k) => `${k} = ${fmt(scope[k])}`).join(', ');
        return {
          steps: [
            ...(subst ? [`Подставляем: ${subst}.`] : []),
            `${def.formula} = ${fmt(answer)}${def.unit ? ` ${def.unit}` : ''}.`,
          ],
          answer, unit: def.unit || '',
        };
      } catch (e) {
        return { error: `Формула не вычислилась: ${e.message}` };
      }
    },
  };
}

export function findQuestion(model, id) {
  if (String(id).startsWith('custom:')) {
    const def = (model.customQuestions || []).find((d) => `custom:${d.id}` === id);
    return def ? buildCustomQuestion(def) : null;
  }
  return QUESTION_BY_ID.get(id) || null;
}

/* =========================================================================
 * 5) Решение выбранного вопроса + сборка полного условия
 * ========================================================================= */
function tableAsText(model, evaluation) {
  const colTitles = model.columns.map((c) => String(c.title || '').trim() || '?');
  const widths = colTitles.map((t) => Math.max(t.length, 6));
  const cell = (ri, ci) => {
    const v = evaluation.grid[ri]?.[ci]?.value;
    return Number.isFinite(v) ? fmt(v) : '·';
  };
  model.rows.forEach((row, ri) => model.columns.forEach((_, ci) => {
    widths[ci] = Math.max(widths[ci], cell(ri, ci).length, row.label ? Math.max(...row.label.split(' ').map((w) => w.length)) : 1);
  }));
  const labelW = Math.max(6, ...model.rows.map((r) => String(r.label || '').length), 6);
  const fmtRow = (label, values) => `| ${String(label).padEnd(labelW)} | ${values.map((v, i) => String(v).padStart(widths[i])).join(' | ')} |`;
  const lines = [];
  lines.push(fmtRow('', colTitles));
  model.rows.forEach((row, ri) => {
    lines.push(fmtRow(row.label || `Строка ${ri + 1}`, model.columns.map((_, ci) => cell(ri, ci))));
  });
  if (model.showSumRow && model.columns.length) {
    lines.push(fmtRow('Итого', evaluation.colTotals.map(fmt)));
  }
  return lines.join('\n');
}

export function solveQuestion(model, questionId, assignments) {
  const evaluation = evaluateScheme(model);
  const ctx = { model, evaluation, scope: evaluation.scope, assignments: assignments || {} };
  const q = findQuestion(model, questionId);
  if (!q) return { ok: false, error: 'Вопрос не выбран.' };

  // Значения операндов
  const vals = {};
  for (const op of q.operands || []) {
    vals[op.key] = resolveOperand(op, ctx.assignments[op.key], ctx);
  }
  const missing = (q.operands || []).filter((op) => !Number.isFinite(vals[op.key]));
  if (missing.length) {
    return {
      ok: false,
      error: `Не хватает данных: ${missing.map((m) => `«${m.label}»`).join(', ')}. Укажите числа или переменные.`,
      evaluation, question: q,
    };
  }

  const out = q.solve(vals, ctx) || {};
  if (out.error) return { ok: false, error: out.error, evaluation, question: q };

  const answerNum = typeof out.answer === 'number' ? out.answer : Number(out.answer);
  const answer = Number.isFinite(answerNum) ? `${fmt(answerNum)}${out.unit ? ` ${out.unit}` : ''}` : String(out.answer);

  // Дано: переменные + строки таблицы
  const given = [];
  const scopeEntries = Object.entries(evaluation.scope).filter(([, v]) => Number.isFinite(v));
  if (scopeEntries.length) given.push(`Переменные: ${scopeEntries.map(([k, v]) => `${k} = ${fmt(v)}`).join('; ')}`);
  model.rows.forEach((row, ri) => {
    const parts = model.columns.map((col, ci) => ({ title: col.title, v: evaluation.grid[ri][ci].value }))
      .filter(({ v }) => Number.isFinite(v))
      .map(({ title, v }) => `${String(title).trim() || '—'} = ${fmt(v)}`);
    if (parts.length) given.push(`${row.label || `Строка ${ri + 1}`}: ${parts.join(', ')}`);
  });
  const assigned = (q.operands || []).map((op) => {
    const src = describeAssignment(ctx.assignments[op.key], ctx);
    return `${op.label}: ${src} (= ${fmt(vals[op.key])})`;
  });

  const condition = composeCondition(model, evaluation, q, vals, assignments);

  return {
    ok: true,
    question: q,
    answer,
    answerValue: answerNum,
    unit: out.unit || '',
    steps: out.steps || [],
    given,
    usedOperands: assigned,
    formulas: [q.formula],
    find: [q.question],
    condition,
    evaluation,
  };
}

export function composeCondition(model, evaluation, q, vals, assignments) {
  const lines = [];
  const title = String(model.title || '').trim();
  lines.push(title ? `${title}.` : 'Условие по схеме.');
  const scopeEntries = Object.entries(evaluation.scope).filter(([, v]) => Number.isFinite(v));
  if (scopeEntries.length) {
    lines.push(`Известно: ${scopeEntries.map(([k, v]) => `${k} = ${fmt(v)}`).join('; ')}.`);
  }
  const hasTable = model.rows.some((_, ri) => model.columns.some((_, ci) => String(model.cells[`${model.rows[ri].id}|${model.columns[ci].id}`] ?? '').trim()));
  if (hasTable) {
    lines.push('Таблица:');
    lines.push(tableAsText(model, evaluation));
  }
  const usedOps = (q.operands || []).map((op) => `${describeAssignment((assignments || {})[op.key], { model })} = ${fmt(vals[op.key])}`);
  if (usedOps.length) lines.push(`Для решения берём: ${usedOps.join('; ')}.`);
  lines.push(q.question);
  return lines.join('\n');
}

/* =========================================================================
 * 6) SVG-диаграмма: горизонтальная линия + засечки + дуги зависимостей
 * ========================================================================= */
export const RELATION_OPS = [
  { id: 'plus',  label: '+ (сумма)' },
  { id: 'minus', label: '− (разность)' },
  { id: 'times', label: '× (произведение)' },
  { id: 'div',   label: '÷ (частное)' },
  { id: 'pct',   label: '% (проценты)' },
  { id: 'dep',   label: 'зависит от' },
];
const OP_SYMBOL = { plus: '+', minus: '−', times: '×', div: '÷', pct: '%', dep: '→' };

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Точки схемы: столбцы таблицы (или переменные, если таблица пуста). */
export function schemePoints(model, evaluation) {
  const ev = evaluation || evaluateScheme(model);
  const hasCells = Object.values(model.cells || {}).some((v) => String(v).trim());
  if (hasCells) {
    return model.columns.map((c, ci) => ({
      kind: 'col',
      id: c.id,
      label: String(c.title || `Столбец ${ci + 1}`).trim() || `Столбец ${ci + 1}`,
      value: ev.colTotals[ci],
    }));
  }
  return Object.entries(ev.scope)
    .filter(([, v]) => Number.isFinite(v))
    .map(([name, value]) => ({ kind: 'var', id: name, label: name, value }));
}

export function schemeSVG(model, evaluation) {
  const ev = evaluation || evaluateScheme(model);
  const pts = schemePoints(model, ev);
  const W = 360, baseY = 108, linePad = 26;
  const n = Math.max(pts.length, 1);
  const step = pts.length > 1 ? (W - 2 * linePad - 46) / (pts.length - 1) : 0;
  const xOf = (i) => linePad + i * step;
  const INK = '#e8e9ec', MUT = '#8a8f9c', LINE = '#3a4150', ACC = '#ff9f0a', OK = '#37d399';

  let s = `<svg viewBox="0 0 ${W} 168" role="img" aria-label="Схема зависимостей" xmlns="http://www.w3.org/2000/svg">`;
  // горизонтальная линия + стрелка вправо
  s += `<line x1="10" y1="${baseY}" x2="${W - 14}" y2="${baseY}" stroke="${LINE}" stroke-width="2"/>`;
  s += `<path d="M ${W - 14} ${baseY} l -8 -5 v 10 z" fill="${LINE}"/>`;

  // засечки + числа
  pts.forEach((p, i) => {
    const x = xOf(i);
    s += `<line x1="${x}" y1="${baseY - 7}" x2="${x}" y2="${baseY + 7}" stroke="${INK}" stroke-width="2"/>`;
    s += `<text x="${x}" y="${baseY + 22}" fill="${INK}" font-size="11" text-anchor="middle" font-weight="600">${escXml(fmt(p.value))}</text>`;
    s += `<text x="${x}" y="${baseY + 36}" fill="${MUT}" font-size="9.5" text-anchor="middle">${escXml(p.label.length > 14 ? `${p.label.slice(0, 13)}…` : p.label)}</text>`;
  });

  // индекс точки по id (для стрелок)
  const indexOf = (kind, id) => pts.findIndex((p) => p.kind === kind && p.id === id);

  // дуги зависимостей
  const arc = (i, j, label, color, dashed) => {
    if (i < 0 || j < 0 || i === j) return '';
    const x1 = xOf(i), x2 = xOf(j);
    const mx = (x1 + x2) / 2, lift = 34 + Math.min(28, Math.abs(x2 - x1) / 6);
    const y = baseY - lift;
    return `<path d="M ${x1} ${baseY - 8} Q ${mx} ${y - 22} ${x2} ${baseY - 8}" fill="none" stroke="${color}" stroke-width="1.8" ${dashed ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#ah)"/>`
      + `<text x="${mx}" y="${y - 6}" fill="${color}" font-size="10.5" text-anchor="middle" font-weight="600">${escXml(label)}</text>`;
  };
  let arcs = '';
  for (const rel of model.relations || []) {
    const i = indexOf(rel.fromKind, rel.from);
    const j = indexOf(rel.toKind, rel.to);
    arcs += arc(i, j, OP_SYMBOL[rel.op] || rel.op, ACC, false);
  }

  // какие точки берёт выбранный вопрос: пунктирные линии рисуем только от них
  let usedCols = null, usedVars = null;
  const q = model.questionId ? findQuestion(model, model.questionId) : null;
  if (q) {
    usedCols = new Set(); usedVars = new Set();
    const idRe = /[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/g;
    for (const op of q.operands || []) {
      const raw = model.assignments?.[op.key];
      const asg = (raw && typeof raw === 'object') ? raw : { kind: 'expr', src: String(raw ?? '') };
      if (asg.kind === 'columnSum') { if (asg.columnId) usedCols.add(asg.columnId); continue; }
      if (asg.kind === 'rowSum') continue; // строки — не точки схемы
      const src = String(asg.src ?? '');
      for (const tok of src.match(idRe) || []) {
        if (model.vars.some((v) => String(v.name).trim() === tok)) usedVars.add(tok);
        const col = model.columns.find((c) => String(c.title).trim() === tok);
        if (col) usedCols.add(col.id);
      }
    }
  }
  const pointUsed = (p) => (p.kind === 'col' ? usedCols?.has(p.id) : usedVars?.has(p.id));

  // узел «?» с пунктирными стрелками от точек, которые берёт вопрос
  const qx = W - 20;
  if (model.questionId && pts.length) {
    s += `<circle cx="${qx}" cy="${baseY - 46}" r="11.5" fill="none" stroke="${OK}" stroke-width="1.8" stroke-dasharray="4 3"/>`;
    s += `<text x="${qx}" y="${baseY - 42}" fill="${OK}" font-size="12" text-anchor="middle" font-weight="700">?</text>`;
    let linked = 0;
    pts.forEach((p, i) => {
      const used = pointUsed(p);
      if (used) linked++;
      const x = xOf(i);
      if (used && qx - x > 40) s += `<path d="M ${x} ${baseY - 10} L ${qx - 6} ${baseY - 42}" fill="none" stroke="${OK}" stroke-width="1.3" stroke-dasharray="3 4" opacity="0.75"/>`;
    });
    // вопрос есть, но точки не сопоставились — честно соединяем все (как раньше)
    if (!linked && usedCols) {
      pts.forEach((p, i) => {
        const x = xOf(i);
        if (qx - x > 40) s += `<path d="M ${x} ${baseY - 10} L ${qx - 6} ${baseY - 42}" fill="none" stroke="${OK}" stroke-width="1.1" stroke-dasharray="3 4" opacity="0.55"/>`;
      });
    }
  }

  s += `<defs>`
    + `<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${ACC}"/></marker>`
    + `</defs>`;
  s += arcs;
  if (!pts.length) {
    s += `<text x="${W / 2}" y="${baseY - 24}" fill="${MUT}" font-size="11" text-anchor="middle">Добавьте переменные или числа в таблицу</text>`;
  }
  s += '</svg>';
  return s;
}
