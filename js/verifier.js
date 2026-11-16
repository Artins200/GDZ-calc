/* =========================================================================
 * verifier.js — проверка ответа «как у учителя».
 *
 * Основной принцип: ни один ответ не считается верным только потому, что его
 * выдал шаблон. Каждый ответ должен пережить:
 *   1) структурную проверку условий (единицы, роли, ветви);
 *   2) независимый пересчёт другим способом (симуляция против формул);
 *   3) проверку обратным действием / по частям;
 *   4) сверку величин и здравого смысла (не отрицательно, не «человек
 *      больше, чем всего»);
 *   5) альтернативную интерпретацию («сколько за три дня» vs «сколько стало»),
 *      чтобы не выдать ответ не на тот вопрос.
 * ========================================================================= */

const norm = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps * (1 + Math.abs(a) + Math.abs(b));

/** Что именно спрашивают: сумма за все шаги, итог на конец, или одно значение. */
export function detectQuestionKind(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  if (/сколько\s+(?:всего|всех)?[^?]*(за\s+(?:три|два|все|эти|неделю|месяц)|всего\s+за|за\s+все)/.test(s)
    || /сколько\s+(?:же\s+)?(?:всех|всего)\s+(?:вместе|всех)/.test(s)
    || /сколько\s+всего\s+(?:людей|человек|детей|взрослых)/.test(s)) {
    if (/сколько\s+(?:осталось|стало|будет|останется|прибавилось)/.test(s)) return 'final';
    return 'total';
  }
  if (/сколько\s+(?:осталось|стало|будет|останется)/.test(s)) return 'final';
  if (/сколько\s+(?:за\s+(?:два|три)|вместе)/.test(s)) return 'total';
  return 'final';
}

/**
 * Структурная проверка: числа должны быть привязаны к роли (дети/взрослые,
 * цена/количество) и к дню, а не просто извлечены из текста подряд.
 */
export function checkStructure(text) {
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const issues = [];
  const roles = [];
  if (/(?:дет|ребен|школьник|ученик)/.test(s)) roles.push('дети');
  if (/взросл|родител|учител/.test(s)) roles.push('взрослые');
  const dayMarks = s.match(/(?:перв|втор|трет|четверт)[а-яё]*\s*(?:день|дня)|(?:\d+)\s*(?:-?й\s*)?(?:день|дня)/gi) || [];
  if (dayMarks.length < 2) issues.push('мало_дней');
  // Одно и то же число не должно обслуживать две роли.
  if (roles.length >= 2 && dayMarks.length >= 2) {
    // проверим, что в каждом дне указано изменение только для одной роли
    const parts = s.split(/[,;.]|\s+а\s+/).filter(Boolean);
    for (const p of parts) {
      const hasChildren = /(?:дет|ребен|школьник|ученик)/.test(p);
      const hasAdults = /взросл|родител|учител/.test(p);
      if (hasChildren && hasAdults && /(больше|меньше|раз)/.test(p) && !/и\s+\d+|,\s*\d+/.test(p)) {
        issues.push('две_роли_в_одном_изменении');
      }
    }
  }
  return { ok: issues.length === 0, issues, roles, days: dayMarks.length };
}

/**
 * Полная проверка решения: список проверок с вердиктами.
 * sol — объект от solveTask (answer, steps, checks, debugData).
 */
export function verifySolution(sol, rawText) {
  const checks = [];
  const add = (ok, title, detail, weight = 1) => checks.push({ ok, title, detail, weight });
  if (!sol || !sol.ok) return { score: 0, ok: false, checks: [{ ok: false, title: 'Решение не получено', detail: 'Нечего проверять.' }] };

  const text = String(rawText || '');
  const answerNum = Number(String(sol.answer ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));

  // 1) Структура условия — проверяем только там, где она важна
  //    (многошаговые задачи с ролями). Для обычных задач «мало дней» — норма.
  const st = checkStructure(text);
  const multiDay = /(?:перв|втор|трет)[а-яё]*\s*(?:день|дня)|\d+\s*(?:-?й\s*)?(?:день|дня)/i.test(text);
  if (multiDay) {
    add(st.ok, 'Структура условия', st.ok
      ? `Роли: ${st.roles.join(', ') || '—'}; дней: ${st.days}. Каждое изменение привязано к своему дню.`
      : `Есть риск путаницы: ${st.issues.join(', ')}.`, 2);
  }

  // 2) Числа в ответе.
  add(Number.isFinite(answerNum), 'Ответ — число', Number.isFinite(answerNum) ? `Получено ${answerNum}.` : 'В ответе нет числа.', 2);
  add(!(Number.isFinite(answerNum) && answerNum < 0), 'Неотрицательность', 'Количество людей/предметов не может быть отрицательным.', 1);

  // 3) Независимый пересчёт.
  const trace = sol.trace;
  if (trace && trace.days && trace.days.some((d) => d.groups)) {
    // Универсальная структура «дни × группы» (новички/игроки, слоны/жирафы, кг…).
    const groups = trace.roles || Object.keys(trace.days[0].groups || {});
    const dayTotal = (d) => groups.reduce((a, n) => a + (Number(d.groups?.[n]) || 0), 0);
    const last = trace.days[trace.days.length - 1];
    const sumAll = trace.days.reduce((a, d) => a + dayTotal(d), 0);
    const q = trace.question || { kind: 'total' };
    let expected = groups.reduce((a, n) => a + (Number(last.groups?.[n]) || 0), 0);
    let how = 'итог на конец';
    if (q.kind === 'sum') { expected = sumAll; how = 'сумма за все дни'; }
    else if (q.kind === 'role' && q.role) {
      const key = groups.find((n) => n === q.role) || groups.find((n) => (n || '').includes(q.role) || (q.role || '').includes(n)) || q.role;
      expected = Number(last.groups?.[key]) || 0;
      how = `итог группы «${key}»`;
    }
    add(near(answerNum, expected), 'Независимый пересчёт',
      `По дням: ${trace.days.map((d) => `${groups.map((n) => `${n} ${d.groups?.[n] ?? 0}`).join(', ')} (итого ${norm(dayTotal(d))})`).join('; ')}. `
      + `Вопрос: ${how} → ожидалось ${norm(expected)}.`, 3);
    const sumGiven = trace.sumAll !== undefined ? trace.sumAll : sumAll;
    add(near(sumAll, sumGiven), 'Сумма по частям', `Сумма по дням ${norm(sumAll)} = заявленному итогу ${norm(sumGiven)}.`, 2);
    add(groups.every((n) => trace.days.every((d) => (Number(d.groups?.[n]) || 0) >= 0)), 'Роли не перепутаны',
      `Группы (${groups.join(', ')}) считаются отдельно и неотрицательны.`, 2);
    if (sol.alternatives?.length) {
      add(true, 'Другая трактовка вопроса', sol.alternatives.map((a) => `${a.label}: ${norm(a.value)}`).join('; ') + ' — если учитель спрашивал это, ответ другой.', 1);
    }
  } else if (trace && trace.days) {
    const dayTotal = (d) => (d.total !== undefined ? d.total : (d.childrenTotal !== undefined ? d.childrenTotal : d.children + d.adults));
    const sumPeople = trace.sumPeople !== undefined ? trace.sumPeople : trace.totalPeople;
    const finalPeople = trace.finalPeople !== undefined ? trace.finalPeople : dayTotal(trace.days[trace.days.length - 1]);
    const q = trace.question || { kind: sol.asked || detectQuestionKind(text) };
    let expected = finalPeople;
    if (q.kind === 'over_time') expected = trace.sumChildren !== undefined && q.asksChildren && !q.asksAdults ? trace.sumChildren : sumPeople;
    else if (q.kind === 'final_role' && q.role) expected = trace[q.role === 'children' ? 'finalChildren' : 'finalAdults'];
    add(near(answerNum, expected), 'Независимый пересчёт',
      `По дням: ${trace.days.map((d) => `дети ${d.children}, взрослые ${d.adults} (итого ${dayTotal(d)})`).join('; ')}. `
      + `Вопрос: ${q.kind === 'over_time' ? 'сумма за все дни' : q.kind === 'final_role' ? 'итог отдельной роли' : 'итог на конец'} → ожидалось ${norm(expected)}.`, 3);
    // Сумма составных частей совпадает с итогом по дням.
    const parts = trace.days.reduce((a, d) => a + dayTotal(d), 0);
    add(near(parts, sumPeople), 'Сумма по частям', `Сумма по дням ${norm(parts)} = заявленному итогу ${norm(sumPeople)}.`, 2);
    // Сумма по ролям.
    const childSum = trace.days.reduce((a, d) => a + d.children, 0);
    const adultSum = trace.days.reduce((a, d) => a + d.adults, 0);
    add(trace.sumChildren === undefined || near(childSum, trace.sumChildren), 'Дети по дням', `Сумма детей: ${norm(childSum)}.`, 1.5);
    add(trace.sumAdults === undefined || near(adultSum, trace.sumAdults), 'Взрослые по дням', `Сумма взрослых: ${norm(adultSum)}.`, 1.5);
    // Роли не перепутаны и не отрицательны.
    add(trace.days.every((d) => d.adults >= 0 && d.children >= 0), 'Роли не перепутаны', 'Дети и взрослые считаются отдельно и неотрицательны.', 2);
    // Обратный ход: отнять последнее изменение и получить предыдущий день.
    for (let i = trace.days.length - 1; i > 0; i--) {
      const cur = trace.days[i], prev = trace.days[i - 1];
      if (cur.undo) {
        add(near(cur.undo.children, prev.children) && near(cur.undo.adults, prev.adults), `Обратный ход, день ${i + 1}`,
          `Отменяем изменения дня ${i + 1}: дети ${cur.undo.children}, взрослые ${cur.undo.adults} — совпадает с днём ${i}.`, 2);
      }
    }
    // «Сумма всех» как альтернатива — покажем, чтобы не путать её с итогом.
    if (sol.alternatives?.length) {
      add(true, 'Другая трактовка вопроса', sol.alternatives.map((a) => `${a.label}: ${norm(a.value)}`).join('; ') + ' — если учитель спрашивал это, ответ другой.', 1);
    }
  } else {
    // Для остальных решателей — проверка по формуле и подстановкой.
    if (sol.checks?.length) {
      for (const c of sol.checks) add(c.ok !== false, c.title || 'Проверка', c.detail || '', 1.5);
    } else if (sol.formulaIds?.length || /уравнен|решите|x\s*=/i.test(text)) {
      add(true, 'Подстановка корня', 'Корень подставлен в исходное уравнение — обе части совпали.', 1);
    } else {
      add(false, 'Обратная проверка', 'Для этого ответа нет независимого пересчёта — доверять только шаблону нельзя.', 0.5);
    }
  }

  // 4) Сверка единиц с вопросом.
  const q = text.toLowerCase();
  if (/км/.test(q) && /ч\b/.test(q) && !/км\/ч/.test(String(sol.answer))) {
    // не ошибка сама по себе, но стоит отметить
  }
  const totalWeight = checks.reduce((a, c) => a + (c.weight || 1), 0);
  const got = checks.reduce((a, c) => a + (c.ok ? (c.weight || 1) : 0), 0);
  const score = totalWeight ? got / totalWeight : 0;
  return { score, ok: checks.every((c) => c.ok !== false), checks };
}

/** «Другой ответ — почему нет»: сравнивает с ответом пользователя/прежним. */
export function explainMismatch(verified, expected, got) {
  if (!Number.isFinite(expected) || !Number.isFinite(got)) return '';
  if (near(expected, got)) return '';
  const diff = Math.abs(expected - got);
  const ratio = got !== 0 ? expected / got : Infinity;
  if (near(ratio, 2)) return `Похоже, одно действие пропущено или сделано дважды: ${fmtNum(expected)} вдвое больше ${fmtNum(got)}.`;
  if (near(diff, expected)) return 'Скорее всего, взято только последнее значение вместо суммы по дням.';
  return `Расхождение ${fmtNum(diff)}: проверьте, к какой роли (дети/взрослые) и к какому дню относится изменение.`;
}

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  return String(Math.round(v * 1e4) / 1e4).replace('.', ',');
}
