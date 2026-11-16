/* =========================================================================
 * groups.js — разбор задач «по дням» с несколькими группами участников.
 *
 * Идея: не искать шаблон под каждую фразу, а разобрать условие на структуру:
 *   ДЕНЬ → ГРУППА (новички, опытные игроки, мальчики, котята, картофель…)
 *        → ДЕЙСТВИЕ (пришло/ушло/в 3 раза больше/на 20 меньше).
 *
 * Как читаем текст:
 *   1) режем на дни по словам «первый/второй/третий день»;
 *   2) внутри дня режем на фразы (по «,», «а», «но», «и», «.», «;»);
 *   3) во фразе ищем группу из словаря js/lexicon.js и действие;
 *   4) первая фраза дня 1 с числом = «сколько было» для своей группы;
 *   5) дальше: «+N» пришло/присоединилось, «−N» ушло/увезли, «×k» в k раз
 *      больше, «÷k» в k раз меньше, «на N больше/меньше» — относительно
 *      предыдущего дня;
 *   6) если группа во фразе не названа («количество опытных игроков
 *      увеличилось в 3 раза» — названа) — берём группу предыдущей фразы,
 *      а если её нет — единственную группу задачи.
 *
 * Возвращаем честный ответ и пошаговую «базу решения»: каждый день —
 * отдельная строка, в конце — итог по группам.
 * ========================================================================= */

import { normWord, findNamedGroups } from './lexicon.js';

const fmtN = (v) => {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 1e6) / 1e6;
  return String(r).replace('.', ',');
};

const DAY_RE = /(?:перв|втор|трет|четверт|пят|шест|седьм|восьм|девят|десят)[а-яё]*\s*(?:день|дня|дне|дню|днём)|(?:^|[^а-яё])(?:\d+)\s*(?:-?й\s*)?(?:день|дня|дне|дню)/gi;

const PLUS_SRC = '(?:присоедин|пришл|зашл|прибыл|приехал|привез|прибав|добав|подключ|записал|поступ|взял|купил|собрал|посадил|увелич|выросл|подрос|набрал|привлеч|зарегистрир|привели|принесли|подарил)';
const MINUS_SRC = '(?:вышл|вышел|ушл|уехал|увез|убрал|прода|отда|израсход|потрат|выбыл|отключ|покинул|потерял|сократ|снизил|уменьш|улетел|сбежал|испортил)';
const ACTION_RE = new RegExp(`(${PLUS_SRC}|${MINUS_SRC})`, 'i');
const TIMES_RE = /в\s*(\d+(?:[.,]\d+)?)\s*раз[а]?/i;
const TIMES_REV_RE = /(\d+(?:[.,]\d+)?)\s*раз[а]?\s*(больше|меньше)/i;
const ON_REL_RE = /на\s*(\d+(?:[.,]\d+)?)\s*(?:[а-яё]+\s+){0,3}(больше|меньше)/i;
const ADD_SUB_RE = /(?:^|[^а-яё])на\s*(\d+)\s+([а-яё]+)/i;
const EXTRA_RE = /ещ[её]\s*(\d+)|ещ[её]\s*(?:при|по)?([а-яё]+)/i;
const UNIT_RE = /^\s*(кг|килограмм|г|грамм|т|тонн|км|километр|м|метр|см|сантиметр|л|литр|шт|штук|человек|руб|рубл|ящик|мешк|книг|коробк)/i;

const PHRASE_SPLIT_RE = /(?:[,;.!?]+|(^|[^а-яё])(?:а|но|и|затем|потом|тогда)(?![а-яё]))\s*/gi;

/** Делит условие на дни. Текст до первого маркера — первый день. */
export function splitByDays(text) {
  const s = normWord(text);
  const marks = [...s.matchAll(DAY_RE)];
  if (!marks.length) return null;
  const parts = [];
  for (let i = 0; i < marks.length; i++) {
    const from = i === 0 ? 0 : marks[i].index;
    const to = i + 1 < marks.length ? marks[i + 1].index : s.length;
    parts.push({ index: i + 1, text: s.slice(from, to) });
  }
  return parts.filter((p, i) => i === 0 || p.text.trim().length > 0);
}

/** Все числа с позициями: [{value, index, end}] */
function numbersWithPositions(text) {
  const out = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(m[0].replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({ value, index: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Группы внутри текста с позициями. Использует словарь (findNamedGroups),
 * но привязывает позицию к концу полной подписи («опытных игроков»).
 */
function namedGroupsWithPositions(text) {
  const s = normWord(text);
  const out = [];
  for (const g of findNamedGroups(s)) {
    const full = g.name;
    const tail = full.split(' ').pop();
    const re = new RegExp(escapeRe(tail), 'g');
    let m;
    while ((m = re.exec(s)) !== null) {
      let start = m.index;
      // если перед существительным стоит прилагательное группы — расширяем
      const before = s.slice(Math.max(0, start - 14), start);
      const adj = /([а-яё]+)\s+$/.exec(before);
      if (adj && full.split(' ').length > 1 && (full.includes(adj[1]) || /^(опытн|нов|взросл|старш|младш)/.test(adj[1]))) {
        start = start - adj[1].length - 1;
      }
      const name = canonicalName(full);
      out.push({ name, category: g.category, index: start, end: m.index + tail.length });
    }
  }
  out.sort((a, b) => a.index - b.index || b.end - a.end);
  const cleaned = [];
  for (const m of out) {
    if (cleaned.some((c) => m.index < c.end && m.end > c.index)) continue;
    cleaned.push(m);
  }
  return cleaned;
}

function escapeRe(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Приводит подпись группы к единому виду. */
function canonicalName(name) {
  const n = normWord(name).replace(/\s+/g, ' ').trim();
  if (/^нович/.test(n)) return 'новичков';
  if (/игрок/.test(n) && /опытн|бывал|стар/.test(n)) return 'опытных игроков';
  if (/игрок/.test(n)) return 'игроков';
  return n;
}

/** Единица измерения из условия: кг, км, руб., человек… */
function detectMeasure(text) {
  const s = normWord(text);
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(кг|килограмм[а-яё]*|грамм[а-яё]*|г(?![а-яё])|тонн[а-яё]*|т(?![а-яё])|километр[а-яё]*|км|сантиметр[а-яё]*|см|метр[а-яё]*|м(?![а-яё])|литр[а-яё]*|л(?![а-яё])|штук[а-яё]*|рубл[а-яё]*|мешк[а-яё]*|ящик[а-яё]*|коробк[а-яё]*)/);
  if (!m) return '';
  const raw = m[2];
  if (/^кг|^килограмм/.test(raw)) return 'кг';
  if (/^км|^километр/.test(raw)) return 'км';
  if (/^см|^сантиметр/.test(raw)) return 'см';
  if (/^м$|^метр/.test(raw)) return 'м';
  if (/^т$|^тонн/.test(raw)) return 'т';
  if (/^л$|^литр/.test(raw)) return 'л';
  if (/^г$|^грамм/.test(raw)) return 'г';
  if (/^рубл/.test(raw)) return 'руб.';
  return '';
}

function unitFor(category, groupName, measure) {
  if (category === 'people') return 'человек';
  if (category === 'animals') return 'животных';
  if (measure) return measure;
  if (category === 'vehicles') return 'машин';
  if (category === 'groups') return 'групп';
  return '';
}

/** Название группы с числом: «новичков 80». */
function describeOne(name, value) {
  const noun = name.replace(/\s+\d+.*$/, '');
  if (/^человек/.test(noun)) return `людей ${fmtN(value)}`;
  return `${noun} ${fmtN(value)}`;
}

/** Единица для итоговой фразы. */
function answerUnit(category, measure, asksMeasure) {
  if (asksMeasure && measure) return measure;
  return unitFor(category, '', measure);
}

/* ------------------------------------------------------------------ разбор */

/**
 * Главная функция: решает задачу по дням и группам.
 * Возвращает {ok, answer, steps, trace, groups, alternatives} или null,
 * если задача не похожа на «дни + группы».
 */
export function solveGroupedTask(raw) {
  const src = normWord(raw);
  const days = splitByDays(src);
  if (!days || days.length < 2) return null;

  const order = [];
  const state = new Map();  // name → {value, category, name}

  const ensure = (name, category) => {
    if (!state.has(name)) {
      order.push(name);
      state.set(name, { value: 0, category, name });
    }
    return state.get(name);
  };

  const steps = [];
  const trace = [];
  const question = readQuestion(src);

  // --- 1-й день: абсолютные значения («80 новичков и 15 опытных игроков»)
  const d1 = days[0].text;
  const d1Groups = namedGroupsWithPositions(d1);
  const d1Nums = numbersWithPositions(d1).filter((n) => !isCoefficient(d1, n));
  const usedNums = new Set();
  for (const g of d1Groups) {
    ensure(g.name, g.category);
    const pick = pickNumberForGroup(d1Groups, d1Nums, usedNums, g);
    if (pick) {
      // в первом дне действие может стоять ДО числа («зашли 80 новичков»),
      // но также может быть «зашло 120, ушло 20» — оба числа попадут сюда по порядку
      state.get(g.name).value = pick.value;
      usedNums.add(pick.index);
    }
  }
  // числа, к которым не нашлось группы, но группа в дне одна — отдаём ей
  if (order.length === 1) {
    const g = state.get(order[0]);
    for (const n of d1Nums) {
      if (usedNums.has(n.index)) continue;
      if (g.value === 0) g.value = n.value; else g.value += n.value;
      usedNums.add(n.index);
    }
  }

  const firstDayEmpty = order.every((n) => state.get(n).value === 0);
  if (firstDayEmpty) return null;

  trace.push({ day: 1, snapshot: snapshot(state, order), applied: [] });
  steps.push(`День 1 — было: ${describe(state, order)}.`);

  // --- Дальше дни 2..N
  let lastGroup = order[order.length - 1];
  for (let i = 1; i < days.length; i++) {
    const text = days[i].text;
    const phrases = splitPhrases(text);
    const applied = [];
    let dayHasGroup = false;

    for (const phrase of phrases) {
      if (!/\d/.test(phrase)) {
        // фраза без чисел: «количество опытных игроков увеличилось в 3 раза» — нет,
        // тут число есть. Без числа — только смена «текущей» группы.
        const gs = namedGroupsWithPositions(phrase);
        if (gs.length) lastGroup = gs.at(-1).name;
        continue;
      }
      const groups = namedGroupsWithPositions(phrase).filter((g) => !isUnitWord(phrase, g));
      const nums = numbersWithPositions(phrase);
      if (groups.length) { dayHasGroup = true; lastGroup = groups.at(-1).name; }
      if (!nums.length) continue;

      const phraseGroup = groups.length ? groups.at(-1) : null;
      const targetName = phraseGroup ? phraseGroup.name : lastGroup;
      if (!targetName) continue;
      const target = state.get(targetName);
      if (!target) continue;
      // в первом дне уже посчитали — не дублируем
      if (i === 0) continue;

      const changes = changesIn(phrase, nums, targetName, target, text, i);
      for (const ch of changes) {
        const before = target.value;
        if (ch.kind === 'mul') target.value = ch.sign > 0 ? target.value * ch.value : target.value / ch.value;
        else if (ch.kind === 'set') target.value = ch.value;
        else target.value = ch.sign > 0 ? target.value + ch.value : target.value - ch.value;
        applied.push({ ...ch, group: targetName, before, after: target.value });
      }
    }

    if (!applied.length) {
      steps.push(`День ${i + 1} — без изменений: ${describe(state, order)}.`);
    } else {
      const parts = applied.map((a) => {
        if (a.kind === 'mul') return `${a.group}: ${fmtN(a.before)} ${a.sign > 0 ? '·' : ':'} ${fmtN(a.value)} = ${fmtN(a.after)}`;
        if (a.kind === 'set') return `${a.group}: стало ${fmtN(a.after)}`;
        return `${a.group}: ${fmtN(a.before)} ${a.sign > 0 ? '+' : '−'} ${fmtN(a.value)} = ${fmtN(a.after)}`;
      });
      steps.push(`День ${i + 1} — ${parts.join('; ')}.`);
    }
    void dayHasGroup;
    trace.push({ day: i + 1, snapshot: snapshot(state, order), applied });
  }

  for (const v of state.values()) if (v.value < 0 || !Number.isFinite(v.value)) return null;

  const total = order.reduce((a, n) => a + state.get(n).value, 0);
  const sumAll = trace.reduce((a, t) => a + order.reduce((b, n) => b + (t.snapshot[n] || 0), 0), 0);

  const measure = detectMeasure(src);
  const asksMeasure = isAskedMeasure(src, measure);
  const mainCat = state.get(order[0]).category;
  const unit = answerUnit(mainCat, measure, asksMeasure);

  let answerValue = total;
  let answerLabel = 'всего';
  if (question.kind === 'sum') { answerValue = sumAll; answerLabel = 'за все дни'; }
  else if (question.kind === 'role') {
    const g = matchRole(question.role, state, order);
    if (g) { answerValue = g.value; answerLabel = g.name; }
  }

  steps.push(`К концу последнего дня: ${describe(state, order)} = ${fmtN(total)}${unit ? ' ' + unit : ''}.`);
  if (question.kind === 'sum') {
    const perDay = trace.map((t) => order.reduce((a, n) => a + (t.snapshot[n] || 0), 0));
    steps.push(`За все дни: ${perDay.map(fmtN).join(' + ')} = ${fmtN(sumAll)}${unit ? ' ' + unit : ''}.`);
  }
  steps.push(`Ответ: ${answerLabel} — ${fmtN(answerValue)}${unit ? ' ' + unit : ''}.`);

  const alternatives = [];
  if (question.kind === 'sum') alternatives.push({ label: 'Только к концу последнего дня', value: total });
  else {
    alternatives.push({ label: 'Сумма по всем дням', value: sumAll });
    if (order.length > 1) {
      for (const n of order) alternatives.push({ label: `Только ${n}`, value: state.get(n).value });
    }
  }

  return {
    ok: true,
    answer: `${fmtN(answerValue)}${unit ? ' ' + unit : ''}`,
    steps,
    topic: 'Задача в несколько действий',
    notes: [
      'Разбор по группам: каждое число отнесено к своей группе и своему дню.',
      'Изменения («пришло», «ушло», «в 3 раза больше») применяются по порядку, как в условии.',
    ],
    inputs: {},
    asked: question.kind,
    groups: order.map((name) => ({ ...state.get(name) })),
    trace: {
      days: trace.map((t) => {
        const totalDay = order.reduce((a, n) => a + (t.snapshot[n] || 0), 0);
        return { index: t.day, total: totalDay, groups: { ...t.snapshot } };
      }),
      finalTotal: total,
      sumAll,
      roles: order,
      question: { kind: question.kind, role: question.role },
    },
    detailTrace: trace,
    alternatives,
  };
}

/* --------------------------------------------------------------- помощники */

function snapshot(state, order) {
  return Object.fromEntries(order.map((n) => [n, state.get(n)?.value ?? 0]));
}

function describe(state, order) {
  return order.map((n) => describeOne(n, state.get(n)?.value ?? 0)).join(', ');
}

/** Делит день на фразы: по «,» «.» «а» «но» «и» «затем» «потом». */
function splitPhrases(text) {
  const s = normWord(text);
  const parts = [];
  let last = 0;
  for (const m of s.matchAll(PHRASE_SPLIT_RE)) {
    parts.push(s.slice(last, m.index + (m[1] ? m[1].length : 0)));
    last = m.index + m[0].length;
  }
  parts.push(s.slice(last));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Число — коэффициент («в 3 раза», «на 25» — нет). */
function isCoefficient(text, num) {
  const before = text.slice(Math.max(0, num.index - 4), num.index);
  const after = text.slice(num.end, num.end + 8);
  return /(?:^|[^а-яё])в\s*$/i.test(before) && /^\s*раз/i.test(after);
}

/** «кг», «человек» — не группа, а единица измерения. */
function isUnitWord(phrase, g) {
  const w = phrase.slice(g.index, g.end);
  return /^(кг|км|см|мм|м|т|л|г|шт)$/.test(w);
}

/** Выбирает число для группы в первый день: ближайшее перед подписью. */
function pickNumberForGroup(groups, nums, used, g) {
  let best = null;
  let bestDist = Infinity;
  for (const n of nums) {
    if (used.has(n.index)) continue;
    const gapBefore = g.index - n.end;
    if (gapBefore >= 0 && gapBefore <= 26 && gapBefore < bestDist) { bestDist = gapBefore; best = n; }
  }
  if (best) return best;
  for (const n of nums) {
    if (used.has(n.index)) continue;
    const gapAfter = n.index - g.end;
    if (gapAfter >= 0 && gapAfter <= 8 && gapAfter < bestDist) { bestDist = gapAfter; best = n; }
  }
  return best;
}

/** Все действия во фразе для группы target. */
function changesIn(phrase, nums, groupName, group, dayText, dayIndex) {
  const out = [];
  const used = new Set();

  // «в 3 раза больше/меньше»
  const times = TIMES_RE.exec(phrase);
  if (times) {
    const value = Number(times[1].replace(',', '.'));
    const bad = /меньше|уменьшил|сократ|снизил/.test(phrase);
    out.push({ kind: 'mul', sign: bad ? -1 : 1, value, at: times.index });
    for (const n of nums) if (n.index >= times.index && n.end <= times.index + times[0].length) used.add(n.index);
  }
  // «вдвое»
  if (/удвоил|вдвое\s+больше/.test(phrase)) out.push({ kind: 'mul', sign: 1, value: 2, at: phrase.indexOf('вдво') >= 0 ? phrase.indexOf('вдво') : phrase.indexOf('удво') });
  if (/вдвое\s+меньше|уменьшил[а-яё]*\s+вдвое/.test(phrase)) out.push({ kind: 'mul', sign: -1, value: 2, at: phrase.indexOf('вдво') });

  // «на N больше/меньше» — относительное изменение
  const rel = ON_REL_RE.exec(phrase);
  if (rel) {
    const value = Number(rel[1].replace(',', '.'));
    const sign = /меньше/.test(rel[2]) ? -1 : 1;
    out.push({ kind: 'add', sign, value, at: rel.index });
    for (const n of nums) if (n.index >= rel.index && n.end <= rel.index + rel[0].length) used.add(n.index);
  }

  // «пришло/ушло N»
  for (const n of nums) {
    if (used.has(n.index)) continue;
    if (isCoefficient(phrase, n)) continue;
    // «на 5 кг больше» уже посчитали
    if (rel && n.index >= rel.index && n.end <= rel.index + rel[0].length) continue;
    const around = phrase.slice(Math.max(0, n.index - 30), Math.min(phrase.length, n.end + 30));
    const plus = new RegExp(PLUS_SRC, 'i').test(around);
    const minus = new RegExp(MINUS_SRC, 'i').test(around);
    if (plus && !minus) out.push({ kind: 'add', sign: 1, value: n.value, at: n.index });
    else if (minus && !plus) out.push({ kind: 'add', sign: -1, value: n.value, at: n.index });
    used.add(n.index);
  }
  void groupName; void group; void dayText; void dayIndex;
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** Какая группа названа в вопросе. */
function matchRole(role, state, order) {
  if (!role) return null;
  for (const n of order) {
    const a = normWord(n);
    const b = normWord(role);
    if (a === b || a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5)) || a.includes(b) || b.includes(a)) return state.get(n);
  }
  return null;
}

/** Спрашивают ли меру («сколько километров»), а не «сколько человек». */
function isAskedMeasure(src, measure) {
  if (!measure) return false;
  const tail = src.slice(-260);
  const words = { 'кг': 'кг|килограмм', 'км': 'км|километр', 'см': 'см|сантиметр', 'м': 'метр', 'т': 'тонн', 'л': 'литр', 'г': 'грамм', 'руб.': 'руб|рубл' };
  const pat = words[measure];
  if (!pat) return false;
  return new RegExp(`сколько[^.?]{0,36}(?:${pat})`).test(tail);
}

/* --------------------------------------------------------------- вопрос */

/** Что именно спрашивают: сумму за все дни, итог, или конкретную группу. */
export function readQuestion(text) {
  const s = normWord(text);
  // Вопрос — последнее предложение с «сколько/найди/вычисли».
  const askAt = Math.max(s.lastIndexOf('сколько'), s.lastIndexOf('найд'), s.lastIndexOf('вычисл'), s.lastIndexOf('определ'));
  // Вопроса нет вовсе (условие без «сколько») — отвечаем итогом на конец.
  if (askAt < 0) return { kind: 'total', role: null };
  const tail = askAt >= 0 ? s.slice(Math.max(0, askAt - 40)) : s.slice(Math.max(0, s.length - 280));

  // «сколько привезли за три дня», «сколько всего за все дни» — сумма по дням
  if (/(?:за\s+(?:три|3|два|2|четыре|4|пять|5|все|эти)\s+дн[а-яё]+|за\s+все\s+дни|всего\s+за\s+(?:три|3|два|2|все))/i.test(tail)) {
    return { kind: 'sum', role: null };
  }

  // «сколько стало», «сколько осталось», «сколько всего» — итог
  const totalAsk = /сколько\s+(?:же\s+)?(?:всего|всех|людей|человек|их|стало|осталось|будет|оказалось|получилось|насчитали|собрали|привезли|прошли)/.test(tail)
    || /(?:итого|в\s+сумме|вместе)\b/.test(tail);

  const role = questionRole(tail);
  if (totalAsk) {
    // «сколько всего детей стало» — если названа группа и нет слова «всего» — по группе
    if (role && !/(?:всего|всех|вместе|итого|людей)/.test(tail)) return { kind: 'role', role };
    return { kind: 'total', role: null };
  }
  if (role) return { kind: 'role', role };
  return { kind: 'total', role: null };
}

function questionRole(tail) {
  const gs = namedGroupsWithPositions(tail);
  return gs.length ? gs.at(-1).name : null;
}
