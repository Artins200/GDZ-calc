/* =========================================================================
 * app.js — интерфейс калькулятора
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, evaluate, substituteText, checkIdentity, expandExpression } from './mathcore.js';
import {
  FORMULAS, FORMULA_BY_ID, CHAPTERS, CHAPTER_BY_ID, BOOK, STATS, formulaSearch,
} from './formulas.js';
import {
  TASK_EXAMPLES, solveTask, recomputeWith, RULE_NAMES, RULE_COUNT,
} from './tasks.js';
import {
  parseInterval, describeInterval, numberLineSVG, intersect, union,
} from './intervals.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ вкладки */
const tabs = $$('.tab');
const panels = { formulas: $('#panel-formulas'), tasks: $('#panel-tasks'), intervals: $('#panel-intervals'), reference: $('#panel-reference') };
function selectTab(name) {
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.id === `tab-${name}`)));
  Object.entries(panels).forEach(([k, p]) => p.classList.toggle('active', k === name));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.id.replace('tab-', ''))));

/* =========================================================================
 * ФОРМУЛЫ
 * ========================================================================= */
const state = { chapter: 'all', query: '', selected: null, values: {}, unknown: null };

$('#stat-formulas').textContent = String(STATS.total);
// счётчики в тексте считаем из данных, чтобы они не расходились с каталогом
{
  const intro = $('#detail-intro');
  if (intro) {
    intro.textContent = `Слева — полный свод учебника: ${STATS.kinds.formula} формул с вычислением, `
      + `${STATS.kinds.identity} тождеств с проверкой, ${STATS.kinds.rule} правил-подсказок `
      + `и ${STATS.kinds.interval} числовых промежутков с рисунками. Всего ${STATS.total} карточек.`;
  }
}
$('#stat-rules').textContent = String(RULE_COUNT);
$('#badge-formulas').textContent = String(STATS.total);
$('#badge-rules').textContent = String(RULE_COUNT);

function renderChapterFilter() {
  const box = $('#chapter-filter');
  box.innerHTML = '';
  const mk = (id, label, count) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.chapter === id ? ' active' : '');
    b.textContent = count === undefined ? label : `${label} · ${count}`;
    b.addEventListener('click', () => { state.chapter = id; renderChapterFilter(); renderFormulaList(); });
    return b;
  };
  box.append(mk('all', 'Все', STATS.total));
  for (const c of STATS.byChapter) box.append(mk(c.id, c.title.replace(/^Глава [IVX]+\. /, '').replace('Сведения из курса математики 5—6 классов', '5—6 классы'), c.count));
}

function currentList() {
  let list = state.query ? formulaSearch(state.query) : FORMULAS;
  if (state.chapter !== 'all') list = list.filter((f) => f.ch === state.chapter);
  return list;
}

function renderFormulaList() {
  const list = currentList();
  const box = $('#formula-list');
  $('#formula-count').textContent = state.query
    ? `Найдено: ${list.length} из ${FORMULAS.length}`
    : `Показано: ${list.length}. Всего ${STATS.total} карточек.`;
  box.innerHTML = '';
  for (const f of list) {
    const b = document.createElement('button');
    b.className = 'formula-item';
    if (state.selected === f.id) b.setAttribute('aria-current', 'true');
    b.style.borderLeftColor = CHAPTER_BY_ID.get(f.ch)?.color || '#0d8bb5';
    b.innerHTML = `<span class="t">${esc(f.title)}</span><span class="d">${esc(f.display || f.ineq || '')}</span><span class="m">${esc(f.sec)}</span>`;
    b.addEventListener('click', () => selectFormula(f.id));
    box.append(b);
  }
  if (!list.length) box.innerHTML = '<p class="hint">Ничего не найдено. Попробуйте другое слово — например, «проценты», «квадрат», «промежуток».</p>';
}

$('#formula-search').addEventListener('input', (e) => { state.query = e.target.value; renderFormulaList(); });

function selectFormula(id) {
  state.selected = id;
  const f = FORMULA_BY_ID.get(id);
  if (!f) return;
  state.values = {};
  for (const v of f.vars) if (v.def !== null) state.values[v.name] = v.def;
  // «найти» — это цель задачи: может быть и вычисляемой величиной (НОК)
  state.unknown = f.find || f.vars.find((v) => !isDerivedVar(v.name))?.name || null;
  renderFormulaList();
  renderDetail();
  document.querySelector('.layout-2')?.scrollIntoView({ block: 'nearest' });
}

function renderDetail() {
  const f = FORMULA_BY_ID.get(state.selected);
  const host = $('#formula-detail');
  if (!f) return;
  const chapter = CHAPTER_BY_ID.get(f.ch);
  const kindLabel = { formula: 'формула с вычислением', identity: 'тождество', rule: 'правило', interval: 'числовой промежуток' }[f.kind];

  let html = `
    <div class="detail-title">
      <h2>${esc(f.title)}</h2>
      <div class="row" style="gap:6px">
        <span class="tag kind-${f.kind}">${esc(kindLabel)}</span>
        <span class="tag">${esc(f.sec)}</span>
      </div>
    </div>
    <p class="hint" style="margin-top:4px">${esc(chapter?.title || '')} · глава «${esc(chapter?.sub || '')}»</p>
    <div class="display-formula">${esc(f.display || f.ineq || f.title)}</div>
    ${f.desc ? `<p>${esc(f.desc)}</p>` : ''}
    ${f.example ? `<p class="hint"><b>Пример из учебника:</b> ${esc(f.example)}</p>` : ''}
  `;

  if (f.kind === 'formula') html += renderFormulaCalculator(f);
  else if (f.kind === 'identity') html += renderIdentity(f);
  else if (f.kind === 'interval') html += renderIntervalCard(f);
  else if (f.kind === 'rule') html += renderRule(f);

  // связанные формулы
  const related = FORMULAS.filter((x) => x.ch === f.ch && x.id !== f.id).slice(0, 6);
  if (related.length) {
    html += `<div class="section-label">Рядом в учебнике</div><div class="related-grid">` +
      related.map((r) => `<button class="related-card" data-goto="${r.id}"><b>${esc(r.title)}</b><span>${esc(r.display || '')}</span></button>`).join('') + '</div>';
  }
  host.innerHTML = html;
  bindDetail(f);
}

/** Переменные, которые ядро считает само (НОД/НОК) — их не вводят руками. */
const DERIVED = new Set(['g', 'G', 'N', 'nok', 'nod']);
const isDerivedVar = (name) => DERIVED.has(name);

/* ---- карточка формулы с калькулятором ---- */
function renderFormulaCalculator(f) {
  const varsHtml = f.vars.map((v) => {
    const isUnknown = v.name === state.unknown;
    const val = isUnknown ? '' : (state.values[v.name] ?? '');
    return `<div class="var-field">
      <label for="var-${f.id}-${v.name}">
        <span><b>${esc(v.name)}</b> — ${esc(v.label)}</span>
        ${v.unit ? `<span class="unit">${esc(v.unit)}</span>` : ''}
      </label>
      <input type="text" id="var-${f.id}-${v.name}" data-var="${v.name}" value="${esc(val)}"
             placeholder="${isUnknown ? 'ищем это значение' : isDerivedVar(v.name) ? 'посчитается само' : 'число'}"
             ${isUnknown || isDerivedVar(v.name) ? 'disabled' : ''}
             inputmode="decimal" autocomplete="off">
    </div>`;
  }).join('');

  const options = f.vars.map((v) => `<option value="${v.name}" ${v.name === state.unknown ? 'selected' : ''}>найти ${esc(v.name)}</option>`).join('');

  return `
    <div class="section-label">Подставить значения и вычислить</div>
    <div class="vars-grid">${varsHtml}</div>
    <div class="row">
      <label class="hint" for="unknown-${f.id}">Искать:</label>
      <select id="unknown-${f.id}" style="max-width:220px">${options}</select>
      <button class="btn small" data-act="recalc">Пересчитать</button>
      <button class="btn small ghost" data-act="reset">Сбросить</button>
    </div>
    <div id="calc-out" class="result-box" aria-live="polite"></div>
  `;
}

function renderIdentity(f) {
  return `
    <div class="section-label">Проверка тождества</div>
    <p class="hint">Калькулятор раскрывает обе части и сравнивает многочлены — так же, как тождественные преобразования в § 2, § 8—13.</p>
    <div class="row">
      <button class="btn small" data-act="check">Проверить тождество</button>
      <button class="btn small ghost" data-act="expand">Раскрыть левую и правую части</button>
    </div>
    <div id="calc-out" class="result-box" aria-live="polite"></div>
  `;
}

function renderRule(f) {
  const bullets = (f.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('');
  return `${bullets ? `<div class="section-label">Что нужно помнить</div><ul class="bullets">${bullets}</ul>` : ''}
    <div class="section-label">Показать на числах</div>
    <button class="btn small" data-act="demo">Показать пример с числами</button>
    <div id="calc-out" class="result-box" aria-live="polite"></div>`;
}

function renderIntervalCard(f) {
  let iv = null;
  try { iv = parseInterval(f.notation || f.display); } catch { /* no-op */ }
  const svg = iv && !iv.error ? numberLineSVG([{ interval: iv, label: f.title }], { width: 640 }) : '';
  return `
    <div class="figure">${svg}</div>
    <div class="info-grid">
      <div class="info-cell"><div class="k">Обозначение</div><div class="v">${esc(iv?.notation || '')}</div></div>
      <div class="info-cell"><div class="k">Неравенство</div><div class="v">${esc(iv?.inequality || '')}</div></div>
      <div class="info-cell"><div class="k">Название</div><div class="v">${esc(iv?.name || '')}</div></div>
      <div class="info-cell"><div class="k">Множество</div><div class="v">${esc(iv?.setName || '')}</div></div>
    </div>`;
}

/* ---- действия в карточке ---- */
function bindDetail(f) {
  const host = $('#formula-detail');
  $$('input[data-var]', host).forEach((inp) => {
    inp.addEventListener('input', () => {
      state.values[inp.dataset.var] = parseNum(inp.value);
    });
  });
  const sel = $('#unknown-' + f.id, host);
  if (sel) sel.addEventListener('change', () => {
    state.unknown = sel.value;
    // все остальные переменные должны иметь числа: недостающие берём из уже посчитанных
    for (const v of f.vars) {
      if (v.name === state.unknown) continue;
      if (state.values[v.name] === null || state.values[v.name] === undefined) {
        if (v.def !== null) state.values[v.name] = v.def;
      }
    }
    renderDetail();
  });
  $$('[data-act]', host).forEach((b) => b.addEventListener('click', () => doAction(f, b.dataset.act)));
  $$('[data-goto]', host).forEach((b) => b.addEventListener('click', () => selectFormula(b.dataset.goto)));
  if (f.kind === 'formula') doAction(f, 'recalc');
  if (f.kind === 'identity') doAction(f, 'check');
}

function parseNum(s) {
  if (s === '' || s === null || s === undefined) return null;
  const v = Number(String(s).replace(',', '.').replace(/[−–—]/g, '-'));
  return Number.isFinite(v) ? v : null;
}

function doAction(f, act) {
  const out = $('#calc-out');
  if (!out) return;
  if (act === 'reset') {
    state.values = {};
    for (const v of f.vars) if (v.def !== null) state.values[v.name] = v.def;
    renderDetail();
    return;
  }
  if (f.kind === 'identity') {
    if (act === 'check') {
      const scope = Object.fromEntries(f.vars.map((v) => [v.name, v.def ?? 1]));
      out.innerHTML = `<div class="lbl">Проверка тождества</div><p class="result-value" style="font-size:1.1rem">${esc(okText(f, scope))}</p>`;
      return;
    }
    if (act === 'expand') {
      let left = '—', right = '—', verdict = '';
      try {
        const c = checkIdentity(f.eq);
        left = c.left; right = c.right;
        verdict = c.equal ? 'Левая и правая части тождественно равны.' : 'Части тождественно не равны.';
      } catch { verdict = 'Для этого тождества раскрытие в многочлен не требуется.'; }
      out.innerHTML = `<div class="lbl">Раскрытие обеих частей</div>
        <p class="result-value" style="font-size:1.05rem">${esc(left)} = ${esc(right)}</p>
        <p class="hint">${esc(verdict)}</p>`;
      return;
    }
  }
  if (f.kind === 'rule') {
    if (act === 'demo') { out.innerHTML = `<div class="lbl">Пример на числах</div><p class="result-value" style="font-size:1.05rem">${esc(f.example || 'Введите значения в разделе «Задачи» — подберётся шаблон.')}</p>`; return; }
  }
  if (act === 'recalc' && f.eq) {
    const unknown = state.unknown || f.find;
    const known = {};
    for (const v of f.vars) if (v.name !== unknown) {
      const val = state.values[v.name];
      if (val === null || val === undefined) {
        // вычисляемые величины (НОД/НОК) не спрашиваем — их считает ядро
        if (isDerivedVar(v.name)) continue;
        out.innerHTML = `<div class="err">Заполните значение <b>${esc(v.name)}</b> (${esc(v.label)}). Или выберите другую неизвестную.</div>`;
        return;
      }
      known[v.name] = val;
    }
    try {
      const dom = f.dom?.[unknown] || (known[unknown] !== undefined ? [known[unknown] - 1, known[unknown] + 1] : [-1000, 1000]);
      const res = solveFormula(f.eq, unknown, known, dom);
      // запоминаем найденное значение: переключение «искать:» сразу даёт обратную задачу
      if (Number.isFinite(res.value)) state.values[unknown] = Math.round(res.value * 1e10) / 1e10;
      const substituted = substituteText(f.eq, known);
      const unknownInput = $(`#formula-detail input[data-var="${unknown}"]`);
      if (unknownInput && Number.isFinite(res.value)) {
        unknownInput.value = fmtPlain(Math.round(res.value * 1e10) / 1e10);
        unknownInput.placeholder = 'вычислено';
      }
      out.innerHTML = `
        <div class="lbl">Ответ · ${esc(unknown)}</div>
        <p class="result-value">${esc(fmtSmart(res.value))}${unitOf(f, unknown)}</p>
        <div class="section-label">Как считали</div>
        <ol class="steps">
          <li>Формула: <span class="mono">${esc(f.display)}</span></li>
          <li>Подставим известные: <span class="mono">${esc(substituted)}</span></li>
          ${res.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
          <li>Метод: ${esc(res.method)}</li>
        </ol>`;
    } catch (e) {
      out.innerHTML = `<div class="err"><b>Не получилось:</b> ${esc(e.message)}<br>Проверьте, что все известные значения заданы и что решение существует (например, объём не может быть отрицательным).</div>`;
    }
  }
}

function unitOf(f, name) {
  const v = f.vars.find((x) => x.name === name);
  return v?.unit ? ` <span class="hint">${esc(v.unit)}</span>` : '';
}

function okText(f, scope) {
  try {
    const [L, R] = f.eq.split('=');
    const a = evaluate(L, scope), b = evaluate(R, scope);
    const same = Math.abs(a - b) < 1e-6 * (1 + Math.abs(a));
    const subs = Object.entries(scope).map(([k, v]) => `${k} = ${fmt(v)}`).join(', ');
    return `${same ? 'Тождество верно' : 'Значения различаются'} при ${subs}: левая часть = ${fmt(a)}, правая часть = ${fmt(b)}.`;
  } catch { return 'Не удалось вычислить при значениях по умолчанию — задайте другие числа.'; }
}

/* =========================================================================
 * ЗАДАЧИ
 * ========================================================================= */
const taskInput = $('#task-input');
const taskResult = $('#task-result');

for (const ex of TASK_EXAMPLES) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.label;
  b.title = `${ex.text}\n(${ex.from})`;
  b.addEventListener('click', () => { taskInput.value = ex.text; runTask(); });
  $('#task-examples').append(b);
}

$('#task-solve').addEventListener('click', runTask);
$('#task-clear').addEventListener('click', () => { taskInput.value = ''; taskInput.focus(); taskResult.innerHTML = '<div class="detail-empty"><h3>Здесь появится решение</h3><p class="hint">Введите задачу или выберите пример.</p></div>'; });
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runTask(); });

let lastSolution = null;

function runTask() {
  const text = taskInput.value.trim();
  if (!text) { taskInput.focus(); return; }
  let sol;
  try { sol = solveTask(text); } catch (e) { taskResult.innerHTML = `<div class="err">Ошибка разбора: ${esc(e.message)}</div>`; return; }
  lastSolution = sol;
  renderTask(sol);
}

// Ищем человекочитаемое имя переменной среди связанных формул:
// сначала та формула, где значение совпадает с введённым, иначе первая подходящая.
function labelForVar(sol, key, value) {
  const candidates = (sol.related || []).flatMap((r) => (r.vars || []).filter((x) => x.name === key));
  return candidates.find((x) => x.def === value) || candidates[0] || null;
}

function renderTask(sol) {
  const conf = sol.confidence ?? 0;
  const okClass = sol.ok ? 'badge-ok' : 'badge-warn';
  let html = `
    <div class="pattern-line">
      <div>
        <div class="lbl hint" style="font-size:.76rem;text-transform:uppercase;letter-spacing:.07em;font-weight:700">Распознанный шаблон</div>
        <h3 style="margin:2px 0 0" class="${okClass}">${esc(sol.pattern || 'не распознан')}</h3>
        <div class="hint">${esc(sol.matched || '')}</div>
      </div>
      <div class="confidence" title="Оценка совпадения слов и единиц измерения">
        совпадение <div class="bar"><i style="width:${conf}%"></i></div> ${conf}%
      </div>
    </div>
  `;

  if (sol.why?.length) html += `<div class="why">${sol.why.map((w) => `<span>${esc(w)}</span>`).join('')}</div>`;

  html += `<div class="result-box" style="margin-top:14px">
    <div class="lbl">Ответ${sol.unknown ? ' · ' + esc(sol.unknown) : ''}</div>
    <p class="result-value">${esc(sol.answer)}</p>
  </div>`;

  // Проверка ответа: подставляем найденное число обратно в условие.
  if (sol.checks?.length) {
    const allOk = sol.checks.every((c) => c.ok);
    html += `<div class="check-box ${allOk ? 'ok' : 'warn'}">
      <div class="check-head">
        <span class="check-mark">${allOk ? '✓' : '!'}</span>
        <b>Проверка ответа</b>
        <span class="hint">${allOk ? 'все условия выполнены' : 'не все условия сошлись'}</span>
      </div>
      <ul class="check-list">
        ${sol.checks.map((c) => `<li class="${c.ok ? 'ok' : 'warn'}">
          <span class="check-mark">${c.ok ? '✓' : '✗'}</span>
          <span><b>${esc(c.title)}.</b> ${esc(c.detail)}</span>
        </li>`).join('')}
      </ul>
    </div>`;
  }

  if (sol.draw) html += `<div class="figure">${sol.draw}</div>`;

  if (sol.steps?.length) {
    html += `<div class="section-label">Решение по шагам</div><ol class="steps">${sol.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  }

  // Несколько способов решения одного и того же — с переключателем.
  if (sol.variants?.length) {
    html += `<div class="section-label">Другие способы решения</div>`;
    if (sol.variantsNote) html += `<p class="hint" style="margin:-2px 0 8px">${esc(sol.variantsNote)}</p>`;
    html += `<div class="variant-tabs" role="tablist">${sol.variants.map((v, i) =>
      `<button class="variant-tab${i === 0 ? ' active' : ''}" data-variant="${i}" role="tab" aria-selected="${i === 0}">${esc(v.title)}${v.note ? `<span>${esc(v.note)}</span>` : ''}</button>`).join('')}</div>`;
    html += sol.variants.map((v, i) =>
      `<ol class="steps variant-body${i === 0 ? ' active' : ''}" data-variant-body="${i}">${v.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`).join('');
  }
  if (sol.notes?.length) {
    html += `<div class="section-label">Замечания</div><ul class="notes">${sol.notes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  }

  // «а что если другое число»
  const numericKeys = Object.entries(sol.inputs || {}).filter(([, v]) => typeof v === 'number');
  if (numericKeys.length) {
    html += `<div class="section-label">А что если другое число?</div>`;
    html += `<p class="hint" style="margin-bottom:6px">Поменяйте значение — ответ пересчитается тем же шаблоном.</p><div class="vars-grid">`;
    for (const [k, v] of numericKeys) {
      const label = labelForVar(sol, k, v);
      const caption = label ? `${label.label}${label.unit ? ', ' + label.unit : ''}` : k;
      html += `<div class="var-field">
        <label for="wi-${esc(k)}"><span><b>${esc(k)}</b> — ${esc(caption)}</span></label>
        <input type="text" id="wi-${esc(k)}" data-whatif="${esc(k)}" value="${esc(fmtPlain(v))}" inputmode="decimal" autocomplete="off">
      </div>`;
    }
    html += `</div><div id="whatif-live" class="result-box" style="display:none"></div>`;

    if (sol.whatIf?.length) {
      html += `<div class="section-label">Готовые варианты</div>
        <table class="whatif-table"><thead><tr><th>Изменение</th><th>Новый ответ</th></tr></thead><tbody>
        ${sol.whatIf.map((w) => `<tr><td>${esc(w.label)}</td><td class="num">${esc(w.answer)}</td></tr>`).join('')}
        </tbody></table>`;
    }
  }

  // похожие шаблоны
  if (sol.candidates?.length > 1) {
    const max = Math.max(...sol.candidates.map((c) => c.score));
    html += `<div class="section-label">Похожие шаблоны (ранжирование)</div><div class="cand-list">` +
      sol.candidates.map((c) => `<div class="cand"><span>${esc(c.name)}</span>
        <span class="row" style="gap:8px"><span class="bar"><i style="width:${Math.round(c.score / max * 100)}%"></i></span>
        <span class="hint">${c.score}</span></span></div>`).join('') + `</div>`;
  }

  // связанные формулы
  if (sol.related?.length) {
    html += `<div class="section-label">Формулы, по которым решено</div><div class="related-grid">` +
      sol.related.map((r) => `<button class="related-card" data-formula="${r.id}"><b>${esc(r.title)}</b><span>${esc(r.display || '')}</span><div class="hint" style="font-size:.74rem">${esc(r.sec)}</div></button>`).join('') + `</div>`;
  }

  taskResult.innerHTML = html;

  // переключатель способов решения
  $$('[data-variant]', taskResult).forEach((btn) => btn.addEventListener('click', () => {
    const idx = btn.dataset.variant;
    $$('[data-variant]', taskResult).forEach((b) => {
      const on = b.dataset.variant === idx;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    $$('[data-variant-body]', taskResult).forEach((b) => b.classList.toggle('active', b.dataset.variantBody === idx));
  }));

  // живые инпуты «а что если»
  $$('[data-whatif]', taskResult).forEach((inp) => {
    inp.addEventListener('input', () => {
      const changed = {};
      for (const i of $$('[data-whatif]', taskResult)) changed[i.dataset.whatif] = parseNum(i.value);
      const res = recomputeWith(lastSolution, changed);
      const box = $('#whatif-live', taskResult);
      if (!res) { box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.innerHTML = `<div class="lbl">Новый ответ</div><p class="result-value" style="font-size:1.2rem">${esc(res.answer)}</p>
        ${res.steps?.length ? `<ol class="steps">${res.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}`;
    });
  });

  $$('[data-formula]', taskResult).forEach((b) => b.addEventListener('click', () => {
    selectTab('formulas');
    state.chapter = 'all'; state.query = ''; $('#formula-search').value = '';
    renderChapterFilter();
    selectFormula(b.dataset.formula);
  }));

  taskResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* =========================================================================
 * ПРОМЕЖУТКИ
 * ========================================================================= */
const QUICK = ['[−2; 5)', '(−∞; 3]', '[4; +∞)', '(−3; 7]', 'x ⩾ −2', '−3 ⩽ x < 4', '(−∞; +∞)'];
function renderQuick() {
  const box = $('#interval-quick');
  box.innerHTML = '';
  for (const q of QUICK) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = q;
    b.addEventListener('click', () => { $('#interval-input').value = q; showInterval(); });
    box.append(b);
  }
}

function showInterval() {
  const raw = $('#interval-input').value;
  const iv = parseInterval(raw);
  const out = $('#interval-output');
  if (iv.error) {
    out.innerHTML = `<div class="card pad"><div class="err">${esc(iv.error)}</div>
      <p class="hint" style="margin-top:8px">Допустимые формы: <span class="mono">[−2; 5)</span>, <span class="mono">(a; b)</span>, <span class="mono">[a; +∞)</span>, <span class="mono">(−∞; a]</span>, <span class="mono">x ⩾ −2</span>, <span class="mono">−3 ⩽ x < 4</span>.</p></div>`;
    return;
  }
  const ints = iv.integers();
  const svg = numberLineSVG([{ interval: iv, label: iv.name }], { width: 660 });
  out.innerHTML = `
    <div class="card pad">
      <div class="detail-title"><h2>${esc(iv.name)}</h2><span class="tag">${esc(iv.notation)}</span></div>
      <div class="figure">${svg}</div>
      <div class="info-grid">
        <div class="info-cell"><div class="k">Обозначение</div><div class="v">${esc(iv.notation)}</div></div>
        <div class="info-cell"><div class="k">Неравенство</div><div class="v">${esc(iv.inequality)}</div></div>
        <div class="info-cell"><div class="k">Множество</div><div class="v">${esc(iv.setName)}</div></div>
        ${iv.length !== Infinity ? `<div class="info-cell"><div class="k">Длина |b − a|</div><div class="v">${esc(fmt(iv.length))}</div></div>` : '<div class="info-cell"><div class="k">Длина</div><div class="v">бесконечна (луч)</div></div>'}
        ${iv.midpoint !== null ? `<div class="info-cell"><div class="k">Середина (a + b)/2</div><div class="v">${esc(fmt(iv.midpoint))}</div></div>` : ''}
        <div class="info-cell"><div class="k">Целые числа</div><div class="v" style="font-size:.95rem">${ints === null ? 'бесконечно много' : (ints.length ? esc(ints.join(', ')) : 'нет')}</div></div>
      </div>
      <div class="section-label">Пояснение</div>
      <ul class="notes">${describeInterval(iv).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <p class="hint" style="margin-top:8px">Рисунок как в учебнике на с. 52 (рис. 10—16): закрашенный кружок — конец принадлежит промежутку, светлый — не принадлежит; стрелка — уход в ±∞.</p>
    </div>`;
}

function showBoth() {
  const a = parseInterval($('#interval-a').value);
  const b = parseInterval($('#interval-b').value);
  const out = $('#interval-both-output');
  if (a.error || b.error) { out.innerHTML = `<div class="err">${esc(a.error || b.error)}</div>`; return; }
  const inter = intersect(a, b);
  const uni = union(a, b);
  const svg = numberLineSVG([
    { interval: a, label: 'A', color: '#0d8bb5' },
    { interval: b, label: 'B', color: '#c8455f' },
    ...(inter ? [{ interval: inter, label: 'A ∩ B', color: '#1b9e77' }] : []),
  ], { width: 660 });
  out.innerHTML = `
    <div class="figure">${svg}</div>
    <div class="info-grid">
      <div class="info-cell"><div class="k">A</div><div class="v">${esc(a.notation)}<div class="hint" style="font-size:.78rem">${esc(a.inequality)}</div></div></div>
      <div class="info-cell"><div class="k">B</div><div class="v">${esc(b.notation)}<div class="hint" style="font-size:.78rem">${esc(b.inequality)}</div></div></div>
      <div class="info-cell"><div class="k">A ∩ B</div><div class="v">${inter ? esc(inter.notation) : 'пусто'}</div></div>
      <div class="info-cell"><div class="k">A ∪ B</div><div class="v">${uni.map((x) => esc(x.notation)).join(' ∪ ')}</div></div>
    </div>`;
}

$('#interval-go').addEventListener('click', showInterval);
$('#interval-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') showInterval(); });
$('#interval-both').addEventListener('click', showBoth);

/* =========================================================================
 * СПРАВКА
 * ========================================================================= */
function renderReference() {
  $('#ref-book').innerHTML = `${esc(BOOK.title)}<br>${esc(BOOK.authors)}<br>${esc(BOOK.publisher)}, ${BOOK.pages} с.<br>
    <span class="mono">${esc(BOOK.note)}</span>`;
  $('#ref-chapters').innerHTML = STATS.byChapter.map((c) => `
    <div class="cand" style="margin-bottom:6px"><span><b>${esc(c.title)}</b><div class="hint">${esc(c.sub)}</div></span><span class="tag">${c.count}</span></div>`).join('');
  $('#ref-rules').innerHTML = RULE_NAMES.map((r, i) => `${i + 1}. ${esc(r.name)}`).join('<br>');
}

/* =========================================================================
 * ИНИЦИАЛИЗАЦИЯ
 * ========================================================================= */
renderChapterFilter();
renderFormulaList();
renderQuick();
renderReference();
showInterval();
showBoth();

const initial = (location.hash || '').replace('#', '');
if (['formulas', 'tasks', 'intervals', 'reference'].includes(initial)) selectTab(initial);

// предвыбранная формула по ?f=id
const params = new URLSearchParams(location.search);
if (params.get('f') && FORMULA_BY_ID.has(params.get('f'))) selectFormula(params.get('f'));

// горячая клавиша «/» — фокус в поиск
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    selectTab('formulas');
    e.preventDefault();
    $('#formula-search').focus();
  }
});
