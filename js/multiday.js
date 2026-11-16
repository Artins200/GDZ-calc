/* =========================================================================
 * multiday.js — задачи «по дням» с несколькими ролями (дети/взрослые).
 *
 * Правила разбора:
 *   • условие режется на дни по словам «первый/второй/третий день»;
 *   • в первый день числа описывают, СКОЛЬКО БЫЛО (даже если написано
 *     «ушло 120 детей» — это состав, а не вычитание);
 *   • со второго дня числа — ИЗМЕНЕНИЯ: «в 3 раза больше» умножает,
 *     «на 20 меньше» вычитает, «пришло 50» прибавляет, «уехало 20» вычитает;
 *   • изменение относится к той роли, рядом с которой стоит слово
 *     «детей/взрослых»; если роль в предложении не названа и она одна во
 *     всей задаче — относим к ней;
 *   • «на N раз меньше» считается как «в N раз меньше» (так пишут в задачах),
 *     о чём честно сообщаем.
 *
 * Ответ зависит от вопроса:
 *   «сколько стало / осталось»        → итог на конец последнего дня;
 *   «сколько детей стало»             → итог своей роли;
 *   «сколько всего за три дня»        → сумма по всем дням;
 *   «сколько всего всех вместе»       → итог на конец (и альтернатива — сумма).
 * ========================================================================= */

const ROLE_SRC = {
  children: '(?:дет(?:и|ей|ям|ьми|ях|ск)?|ребен[а-яё]*|ребят[а-яё]*|школьник[а-яё]*|ученик[а-яё]*)',
  adults: '(?:взросл[а-яё]*|родител[а-яё]*|учител[а-яё]*|воспит[а-яё]*)',
  // «предметы/величины»: подставляется найденное слово (яблок, ящик, км…)
  items: '(?:предмет[а-яё]*)',
};
const ROLE_NAME = { children: 'дети', adults: 'взрослые', items: 'количество' };
const SKIP_NOUNS = /^(день|дня|дне|раз|раза|больше|меньше|человек|штук|всего|это|том|ещё|еще|первый|второй|третий|четвёртый|пятый|сколько|пришл[а-яё]*|уехал[а-яё]*|стало|было|ушло|отдали|привезли|увезли|продали|купили|собрали|привез|увез|продал|купил)/;
const ARRIVE = /(пришл|прибыл|приехал|привез|прибав|добав|увелич|поступ|взял|купил|собрал|посадил)/;
const LEAVE = /(уехал|ушл|увез|убрал|прода|отда|уменьш|израсход|потрат|выбыл|улетел|потеря)/;

const fmtN = (v) => {
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v * 1e6) / 1e6;
  return String(r).replace('.', ',');
};

const DAY_MARK = /(?:перв|втор|трет|четверт|пят|шест|седьм|восьм|девят|десят)[а-яё]*\s*(?:день|дня|дне|дню)|(?:\d+)\s*(?:-?й\s*)?(?:день|дня|дне|дню)|(?:этап|смен|недел|сутк)/i;

export function looksLikeMultiDay(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (!DAY_MARK.test(s)) return false;
  const marks = s.match(/(?:перв|втор|трет|четверт|пят)[а-яё]*\s*(?:день|дня|дне)/gi) || [];
  return marks.length >= 1 && /(больше|меньше|пришл|прибыл|уехал|остал|стало)/.test(s);
}

/** Ищет «предмет» задачи: самое частое существительное после числа. */
export function detectItemStem(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const counts = new Map();
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*([а-яё]{3,})/g)) {
    const word = m[2];
    if (SKIP_NOUNS.test(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  // километры/килограммы и сокращения
  const unitM = s.match(/(\d+(?:[.,]\d+)?)\s*(км|кг|м|см|л|т)\b/);
  if (unitM) return { stem: unitM[2], unit: unitM[2] };
  let best = null, bestCount = 0;
  for (const [word, count] of counts) {
    const prev = bestCount;
    if (count > prev || (count === prev && word.length > (best || '').length)) { bestCount = count; best = word; }
  }
  if (!best) return null;
  const stem = best.replace(/(ами|ах|ов|ев|ей|ы|и|а|я|у|ю|ом|ем|е)$/u, '');
  return { stem: stem.length >= 3 ? stem : best, word: best, unit: '', plural: best };
}

/** Делит текст на куски по дням. */
function splitDays(text) {
  const s = String(text).toLowerCase().replace(/ё/g, 'е');
  const marks = [...s.matchAll(/(?:перв|втор|трет|четверт|пят|шест|седьм|восьм)[а-яё]*\s*(?:день|дня|дне)|(?:\d+)\s*(?:-?й\s*)?(?:день|дня|дне)/g)];
  if (!marks.length) return null;
  const parts = [];
  for (let i = 0; i < marks.length; i++) {
    const from = i === 0 ? 0 : marks[i].index;
    const to = i + 1 < marks.length ? marks[i + 1].index : s.length;
    parts.push(s.slice(from, to));
  }
  return parts;
}

/** Роли, упомянутые в куске, с позициями. */
function mentions(part) {
  const out = [];
  for (const role of ['children', 'adults', 'items']) {
    if (!ROLE_SRC[role]) continue;
    const re = new RegExp(ROLE_SRC[role], 'gi');
    let m;
    while ((m = re.exec(part)) !== null) out.push({ role, index: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Роль для числа: ближайшее упоминание справа (в пределах 40) или слева (20). */
function roleFor(part, numStart, numEnd, { maxRight = 40, maxLeft = 20 } = {}) {
  const ms = mentions(part);
  let best = null;
  let bestScore = Infinity;
  for (const m of ms) {
    // «40 детей»: роль сразу справа — это сильнейшая связь (score = 0…).
    // «10 взрослых» и «40 детей и 10 взрослых»: для «10» слева стоит
    // «детей» на расстоянии 7, справа «взрослых» на 0 — выигрывает право.
    // Поэтому правой связи даём бонус −4, то есть право ВСЕГДА предпочтительнее
    // при прочих равных, а левую берём, только если справа роли нет вовсе.
    const right = m.index - numEnd;
    const left = numStart - m.end;
    let score;
    if (right >= 0 && right <= maxRight) score = right;
    else if (left >= 0 && left <= maxLeft) score = left + 40;
    else score = Infinity;
    if (score < bestScore) { bestScore = score; best = m.role; }
  }
  return best;
}

/** Ближайшая роль к числу без штрафа за сторону; при равенстве — правая. */
function nearestRole(part, numStart, numEnd) {
  const ms = mentions(part);
  let best = null, bestDist = Infinity;
  for (const m of ms) {
    const right = m.index - numEnd;
    const left = numStart - m.end;
    const dist = right >= 0 && right <= 26 ? right : (left >= 0 && left <= 26 ? left + 0.5 : Infinity);
    if (dist < bestDist) { bestDist = dist; best = m.role; }
  }
  return best;
}

/**
 * Разбирает кусок дня: что является абсолютным значением, а что — изменением.
 * Возвращает { abs: {children, adults}, changes: [{role, kind, value, dir, text}] }.
 */
export function parseDayPart(part, { dayIndex = 1, onlyRole = null } = {}) {
  const abs = {};
  const changes = [];
  const used = new Set();
  const re = /\d+(?:[.,]\d+)?/g;
  let m;
  while ((m = re.exec(part)) !== null) {
    if (used.has(m.index)) continue;
    const start = m.index;
    const end = start + m[0].length;
    const value = Number(m[0].replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    const before = part.slice(Math.max(0, start - 28), start);
    const after = part.slice(end, end + 34);
    // Роль ищем в окне вокруг числа: «детей стало на 10 больше», «взрослых в 2 раза меньше».
    // Ближайшее слово-роль независимо от стороны (без штрафа за сторону):
    // «детей стало на 10» — 10 относится к детям; «взрослых в 2 раза» — к взрослым.
    const winFrom = Math.max(0, start - 34);
    const winTo = Math.min(part.length, end + 34);
    const role = nearestRole(part.slice(winFrom, winTo), start - winFrom, end - winFrom);
    const addChange = (kind, dir, extra = '') => changes.push({ role: role || onlyRole, kind, value, dir, text: `${before.trim()} ${m[0]}${after.trim()}`, note: extra });

    // «в 3 раза больше», «вдвое меньше» — число стоит между «в» и «раза».
    const inTimes = /(?:^|[^а-яё])в\s*$/i.test(before) && /^\s*раз[а]?\s*(больше|меньше|дороже|дешевле)/i.test(after);
    if (inTimes) {
      addChange('mul', /(меньше|дешевле)/i.test(after) ? -1 : 1);
      continue;
    }
    // «на 20 ... меньше» — но не «на 2 раза меньше» (это деление).
    const onM = before.match(/на\s*$/i);
    if (onM) {
      if (/^\s*раз[а]/i.test(after) && /(меньше|больше)/i.test(after)) {
        addChange('mul', /(меньше)/i.test(after) ? -1 : 1, 'написано «на N раз», считаем как «в N раз»');
        continue;
      }
      if (/(больше|меньше)/i.test(after.slice(0, 30))) {
        addChange('add', /(меньше)/i.test(after.slice(0, 30)) ? -1 : 1);
        continue;
      }
    }
    // «пришло 50 детей», «уехало 20 взрослых» — изменение (со второго дня).
    if (dayIndex > 1) {
      const verbZone = (before + ' ' + after.slice(0, 12)).toLowerCase();
      if (ARRIVE.test(verbZone) && !LEAVE.test(verbZone)) { addChange('add', 1); continue; }
      if (LEAVE.test(verbZone) && !ARRIVE.test(verbZone)) { addChange('add', -1); continue; }
    }
    // Иначе — абсолютное значение роли («первый день 120 детей и 20 взрослых»).
    const r = role || (abs.children === undefined && abs.adults === undefined ? null : null);
    if (r) abs[r] = { value, text: `${before.trim()} ${m[0]}${after.trim()}` };
    else if (abs._pending === undefined) abs._pending = value; // роль не названа — решим позже
  }
  // Числа без роли в первый день: «на сво ушло 120 детей и 20 взрослых» уже
  // обработано; если осталось одно — это состав единственной роли.
  // Число без роли в первом дне — состав единственной роли (например,
  // «на сво ушло 120 детей и 20 взрослых» уже разобрано по ролям).
  if (abs._pending !== undefined) {
    const roles = Object.keys(abs).filter((k) => k !== '_pending');
    if (!roles.length && onlyRole && dayIndex === 1) abs[onlyRole] = { value: abs._pending, text: '' };
    delete abs._pending;
  }
  return { abs, changes };
}

/** Вопрос: что именно просят найти. */
export function readQuestion(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const asksChildren = /сколько\s+(?:всего\s+)?(?:детей|ребят|учеников|школьников)/.test(s);
  const asksAdults = /сколько\s+(?:всего\s+)?(?:взрослых|родителей)/.test(s);
  const finalRole = /сколько\s+(?:же\s+)?(?:осталось|стало|будет|останется|прибавилось)/.test(s);
  const overTime = /за\s+(?:три|два|все|эти|неделю|месяц|смену)|за\s+все\s+дни|побывал|всего\s+прошл|за\s+всё\s+время/.test(s);
  const together = /(?:сколько\s+)?(?:всего|всех)\s+(?:вместе|всех|людей|человек)|сколько\s+всего\s+всех|всех\s+вместе/.test(s);
  const totalWord = /сколько\s+(?:всего|всех)/.test(s);
  if (overTime) return { kind: 'over_time', asksChildren, asksAdults, together };
  if (asksChildren && !asksAdults) return { kind: 'final_role', role: 'children', asksChildren, asksAdults, together };
  if (asksAdults && !asksChildren) return { kind: 'final_role', role: 'adults', asksChildren, asksAdults, together };
  if (finalRole) return { kind: 'final_total', asksChildren, asksAdults, together };
  if (together || totalWord) return { kind: 'final_total', asksChildren, asksAdults, together };
  return { kind: 'final_total', asksChildren, asksAdults, together };
}

/**
 * Решение многошаговой задачи.
 * Возвращает null, если структуру восстановить не удалось.
 */
export function solveMultiDay(raw) {
  const src = String(raw || '').replace(/ё/gi, 'е');
  const s = src.toLowerCase().replace(/\s+/g, ' ');
  if (!looksLikeMultiDay(s)) return null;

  const parts = splitDays(s);
  if (!parts || !parts.length) return null;

  const hasChildren = new RegExp(ROLE_SRC.children, 'i').test(s);
  const hasAdults = new RegExp(ROLE_SRC.adults, 'i').test(s);
  const item = hasChildren || hasAdults ? null : detectItemStem(s);
  let roles;
  let onlyRole;
  if (hasChildren || hasAdults) {
    roles = [hasChildren ? 'children' : null, hasAdults ? 'adults' : null].filter(Boolean);
    onlyRole = roles.length === 1 ? roles[0] : null;
  } else if (item) {
    roles = ['items'];
    onlyRole = 'items';
    ROLE_SRC.items = `(?:${item.stem}[а-яё]*)`;
    ROLE_NAME.items = item.unit || item.plural || item.stem;
  } else {
    return null;
  }

  const days = parts.map((part, i) => {
    const parsed = parseDayPart(part, { dayIndex: i + 1, onlyRole });
    return {
      index: i + 1,
      abs: parsed.abs,
      changes: parsed.changes,
      children: 0,
      adults: 0,
    };
  });

  // Первый день: абсолютные значения.
  const first = days[0];
  const initial = {};
  for (const role of roles) {
    if (first.abs[role] !== undefined) initial[role] = first.abs[role].value;
    else if (first.changes.length) {
      // «в первый день пришло 30 детей» — считаем, что до этого было 0
      initial[role] = 0;
    } else initial[role] = 0;
  }
  // Если в первом дне были изменения (например «пришло 50 детей») — применяем их к нулю.
  for (const ch of first.changes) {
    const role = ch.role || onlyRole;
    if (!role) continue;
    const base = initial[role] ?? 0;
    initial[role] = applyChange(base, ch);
  }
  first.children = initial.children ?? 0;
  first.adults = initial.adults ?? 0;
  first.items = initial.items ?? 0;
  for (const role of roles) if (first.abs[role] !== undefined) first[role] = first.abs[role].value;

  // Последующие дни: изменения от предыдущего дня.
  for (let i = 1; i < days.length; i++) {
    const d = days[i];
    // Роль, о которой в дне не говорилось, сохраняет предыдущее значение.
    const prev = days[i - 1];
    const next = { children: prev.children, adults: prev.adults, items: prev.items };
    let touched = false;
    for (const change of d.changes) {
      const role = change.role || onlyRole;
      if (!role) continue;
      next[role] = applyChange(next[role] ?? 0, change);
      touched = true;
    }
    for (const role of roles) if (d.abs[role] !== undefined) { next[role] = d.abs[role].value; touched = true; }
    d.children = touched ? next.children : prev.children;
    d.adults = touched ? next.adults : prev.adults;
    d.items = touched ? next.items : prev.items;
  }

  if (days.some((d) => d.children < 0 || d.adults < 0)) return null;
  const withTotals = days.map((d) => ({ ...d, total: roles.includes('items') ? d.items : d.children + d.adults }));
  const sumPeople = withTotals.reduce((a, d) => a + d.total, 0);
  const sumChildren = withTotals.reduce((a, d) => a + d.children, 0);
  const sumAdults = withTotals.reduce((a, d) => a + d.adults, 0);
  const last = withTotals[withTotals.length - 1];

  const q = roles.includes('items') ? { kind: 'final_role', role: 'items' } : readQuestion(s);
  const alternatives = [];
  let primary;
  if (q.kind === 'over_time') {
    if (q.asksChildren && !q.asksAdults) primary = { label: 'Дети за все дни', value: sumChildren };
    else if (q.asksAdults && !q.asksChildren) primary = { label: 'Взрослые за все дни', value: sumAdults };
    else primary = { label: 'Всего за все дни', value: sumPeople };
    alternatives.push({ label: 'Осталось к концу последнего дня', value: last.total });
  } else if (q.kind === 'final_role') {
    const role = q.role || 'children';
    if (roles.includes('items')) primary = { label: `${ROLE_NAME.items} к концу последнего дня`, value: last.items };
    else primary = { label: role === 'children' ? 'Дети к концу последнего дня' : 'Взрослые к концу последнего дня', value: last[role] };
    if (roles.length > 1) alternatives.push({ label: 'Всего людей к концу', value: last.total });
  } else if (roles.includes('items')) {
    primary = { label: `${ROLE_NAME.items} к концу последнего дня`, value: last.items };
    alternatives.push({ label: 'Сумма за все дни', value: sumPeople });
  } else {
    primary = { label: 'Всего людей к концу последнего дня', value: last.total };
    alternatives.push({ label: 'Сумма по всем дням', value: sumPeople });
  }

  const steps = [];
  const dayLines = withTotals.map((d) => {
    if (roles.includes('items')) return `День ${d.index}: ${fmtN(d.items)}${ROLE_NAME.items === 'количество' ? '' : ' ' + ROLE_NAME.items}.`;
    if (roles.length > 1) return `День ${d.index}: дети ${fmtN(d.children)}, взрослые ${fmtN(d.adults)} — всего ${fmtN(d.total)}.`;
    return `День ${d.index}: ${fmtN(d.children)}${hasChildren ? ' детей' : ` взрослых ${fmtN(d.adults)}`}.`;
  });

  // Подробный разбор изменений.
  const detail = [];
  detail.push(`День 1 — сколько было: ${roles.map((r) => `${ROLE_NAME[r]} ${fmtN(withTotals[0][r])}`).join(', ')}.`);
  // Роль названа в условии, но не получила ни одного изменения — предупреждаем.
  const changedRoles = new Set(days.flatMap((d) => d.changes.map((c) => c.role)));
  for (const role of roles) {
    if (!changedRoles.has(role) && roles.length > 1) {
      detail.push(`Внимание: для «${ROLE_NAME[role]}» в условии не сказано ни одного изменения — оставляем ${fmtN(withTotals[0][role])} на все дни.`);
    }
  }
  for (let i = 1; i < withTotals.length; i++) {
    const d = withTotals[i];
    if (!d.changes.length && d.abs.children === undefined && d.abs.adults === undefined) {
      detail.push(`День ${d.index} — изменений нет: ${roles.map((r) => `${ROLE_NAME[r]} ${fmtN(d[r])}`).join(', ')}.`);
      continue;
    }
    const bits = [];
    for (const change of d.changes) {
      const role = change.role || onlyRole;
      if (!role) continue;
      const before = withTotals[i - 1][role];
      const after = d[role];
      const sign = change.kind === 'mul' ? (change.dir > 0 ? '·' : ':') : (change.dir > 0 ? '+' : '−');
      const word = change.kind === 'mul'
        ? `в ${fmtN(change.value)} раз${change.value === 1 ? '' : 'а'} ${change.dir > 0 ? 'больше' : 'меньше'}`
        : `на ${fmtN(change.value)} ${change.dir > 0 ? 'больше' : 'меньше'}`;
      bits.push(`${ROLE_NAME[role]} — ${word}: ${fmtN(before)} ${sign} ${fmtN(change.value)} = ${fmtN(after)}${change.note ? ` (${change.note})` : ''}`);
    }
    detail.push(`День ${d.index}: ${bits.join('; ')}.`);
  }

  steps.push(...detail);
  steps.push(...dayLines);
  if (primary.label.includes('к концу')) {
    steps.push(`К концу последнего дня: ${roles.map((r) => `${ROLE_NAME[r]} ${fmtN(last[r])}`).join(' + ')} = ${fmtN(last.total)}.`);
  } else if (primary.label.startsWith('Дети')) {
    steps.push(`Сумма по дням: ${withTotals.map((d) => fmtN(d.children)).join(' + ')} = ${fmtN(sumChildren)}.`);
  } else if (primary.label.startsWith('Взрослые')) {
    steps.push(`Сумма по дням: ${withTotals.map((d) => fmtN(d.adults)).join(' + ')} = ${fmtN(sumAdults)}.`);
  } else {
    steps.push(`Сумма по всем дням: ${withTotals.map((d) => `(${fmtN(d.children)} + ${fmtN(d.adults)})`).join(' + ')} = ${fmtN(sumPeople)}.`);
  }
  const unitTail = roles.includes('items') ? (ROLE_NAME.items === 'количество' ? '' : ' ' + ROLE_NAME.items) : ' человек';
  steps.push(`Ответ: ${primary.label.toLowerCase()} — ${fmtN(primary.value)}${unitTail}.`);

  return {
    ok: true,
    answer: `${fmtN(primary.value)}${roles.includes('items') ? (ROLE_NAME.items === 'количество' ? '' : ' ' + ROLE_NAME.items) : ' человек'}`,
    steps,
    checks: [],
    topic: 'Задача в несколько действий',
    notes: [
      'В первый день числа показывают, сколько было; со второго дня — на сколько изменилось.',
      '«Детей» и «взрослых» считаем отдельно: изменение одной роли не переносится на другую.',
    ],
    inputs: {},
    asked: q.kind,
    primary,
    alternatives,
    trace: {
      days: withTotals.map((d) => ({ index: d.index, children: d.children, adults: d.adults, total: d.total })),
      sumPeople, sumChildren, sumAdults,
      finalPeople: last.total,
      finalChildren: last.children,
      finalAdults: last.adults,
      roles,
      question: q,
    },
  };
}

function applyChange(base, change) {
  if (change.kind === 'mul') return change.dir > 0 ? base * change.value : base / change.value;
  return change.dir > 0 ? base + change.value : base - change.value;
}
