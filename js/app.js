/* =========================================================================
 * app.js — интерфейс калькулятора
 * ========================================================================= */
import { fmt, fmtSmart, fmtPlain, solveFormula, evaluate, substituteText, checkIdentity, expandExpression } from './mathcore.js';
import { FORMULAS, FORMULA_BY_ID, CHAPTER_BY_ID, STATS, formulaSearch } from './formulas.js';
import { TASK_EXAMPLES, solveTask, recomputeWith, RULE_COUNT } from './tasks.js';
import {
  parseInterval, describeInterval, numberLineSVG, intersect, union,
} from './intervals.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ вкладки */
const tabs = $$('.seg-btn');
const panels = { formulas: $('#panel-formulas'), tasks: $('#panel-tasks'), intervals: $('#panel-intervals') };
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

/* счётчики и бейджи в шапке больше не нужны — интерфейс без лишних цифр */
void STATS; void RULE_COUNT;

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
    ? `${list.length} из ${FORMULAS.length}`
    : `${list.length} формул`;
  box.innerHTML = '';
  for (const f of list) {
    const b = document.createElement('button');
    if (state.selected === f.id) b.setAttribute('aria-current', 'true');
    b.innerHTML = `<span class="f-title">${esc(f.title)}</span><span class="f-formula">${esc(f.display || f.ineq || '')}</span>`;
    b.addEventListener('click', () => selectFormula(f.id));
    box.append(b);
  }
  if (!list.length) box.innerHTML = '<p class="hint" style="padding:6px 10px">Ничего не найдено</p>';
}

$('#formula-search').addEventListener('input', (e) => {
  state.query = e.target.value;
  $('#formula-search').closest('.search').classList.toggle('has-value', !!state.query);
  renderFormulaList();
});
$('#search-clear')?.addEventListener('click', () => {
  const inp = $('#formula-search');
  inp.value = ''; state.query = '';
  inp.closest('.search').classList.remove('has-value');
  renderFormulaList(); inp.focus();
});

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
  if (window.innerWidth <= 760) $('#formula-detail')?.scrollIntoView({ block: 'start' });
}

function renderDetail() {
  const f = FORMULA_BY_ID.get(state.selected);
  const host = $('#formula-detail');
  if (!f) return;
  const chapter = CHAPTER_BY_ID.get(f.ch);

  let html = `
    <div class="calc-head">
      <h2>${esc(f.title)}</h2>
      <div class="calc-meta">${esc(chapter?.title?.replace(/^Глава [IVX]+\. /, 'Глава ') || '')} · ${esc(f.sec)}</div>
    </div>
    <div class="screen">${esc(f.display || f.ineq || f.title)}</div>
  `;

  if (f.kind === 'formula') html += renderFormulaCalculator(f);
  else if (f.kind === 'identity') html += renderIdentity(f);
  else if (f.kind === 'interval') html += renderIntervalCard(f);
  else if (f.kind === 'rule') html += renderRule(f);

  host.innerHTML = html;
  bindDetail(f);
}

/** Переменные, которые ядро считает само (НОД/НОК) — их не вводят руками. */
const DERIVED = new Set(['g', 'G', 'N', 'nok', 'nod']);
const isDerivedVar = (name) => DERIVED.has(name);

/* ---- карточка формулы с калькулятором ---- */
function renderFormulaCalculator(f) {
  // Поля: только то, что реально вводят. Искомое и вычисляемое показываем строкой.
  const inputs = f.vars.filter((v) => v.name !== state.unknown && !isDerivedVar(v.name));
  const varsHtml = inputs.map((v) => `
    <div class="field">
      <label for="var-${f.id}-${v.name}">
        <span>${esc(v.label)}</span>${v.unit ? `<span class="u">${esc(v.unit)}</span>` : ''}
      </label>
      <input type="text" id="var-${f.id}-${v.name}" data-var="${v.name}"
             value="${esc(state.values[v.name] ?? '')}" placeholder="число"
             inputmode="decimal" autocomplete="off">
    </div>`).join('');

  const options = f.vars.map((v) => `<option value="${v.name}" ${v.name === state.unknown ? 'selected' : ''}>${esc(v.name)}${v.unit ? ' (' + esc(v.unit) + ')' : ''}</option>`).join('');

  return `
    <div class="fields">${varsHtml}</div>
    <div class="actions">
      <button class="btn primary" data-act="recalc">Вычислить</button>
      <span class="hint">искать</span>
      <select id="unknown-${f.id}" class="btn" style="padding:8px 10px;max-width:110px">${options}</select>
      <button class="btn small" data-act="reset" title="Вернуть исходные числа">Сброс</button>
    </div>
    <div id="calc-out" aria-live="polite"></div>
  `;
}

function renderIdentity(f) {
  return `
    <div class="actions">
      <button class="btn primary" data-act="check">Проверить</button>
      <button class="btn" data-act="expand">Раскрыть части</button>
    </div>
    <div id="calc-out" aria-live="polite"></div>
  `;
}

function renderRule(f) {
  const bullets = (f.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('');
  return `
    <div class="actions">
      <button class="btn" data-act="demo">Пример на числах</button>
    </div>
    <div id="calc-out" aria-live="polite"></div>
    ${bullets ? `<details class="more"><summary>Что нужно помнить</summary><div class="more-body"><ol class="steps">${bullets.replace(/<li>/g, '<li>').replace(/<\/li>/g, '</li>')}</ol></div></details>` : ''}
  `;
}

function renderIntervalCard(f) {
  let iv = null;
  try { iv = parseInterval(f.notation || f.display); } catch { /* no-op */ }
  const svg = iv && !iv.error ? numberLineSVG([{ interval: iv, label: f.title }], { width: 640 }) : '';
  return `
    <div class="figure">${svg}</div>
    <div class="answer">
      <div class="answer-label">Обозначение</div>
      <p class="answer-value" style="font-size:1.3rem">${esc(iv?.notation || '')}</p>
      <p class="answer-sub">${esc(iv?.inequality || '')} · ${esc(iv?.name || '')}</p>
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
      let html;
      try {
        const c = checkIdentity(f.eq);
        html = `<div class="answer">
          <div class="answer-label">Тождество</div>
          <p class="answer-value" style="font-size:1.3rem">${c.equal ? 'верно' : 'неверно'}</p>
          <p class="answer-sub">${esc(c.left)} = ${esc(c.right)}</p>
        </div>`;
      } catch {
        const r = okText(f, scope);
        html = `<div class="answer"><div class="answer-label">Проверка на числах</div>
          <p class="answer-value" style="font-size:1.15rem">${esc(r)}</p></div>`;
      }
      out.innerHTML = html;
      return;
    }
    if (act === 'expand') {
      let left = '—', right = '—', verdict = '';
      try {
        const c = checkIdentity(f.eq);
        left = c.left; right = c.right;
        verdict = c.equal ? 'Левая и правая части равны.' : 'Части не равны.';
      } catch { verdict = 'Раскрывать нечего.'; }
      out.innerHTML = `<div class="answer">
        <div class="answer-label">После раскрытия</div>
        <p class="answer-value" style="font-size:1.25rem">${esc(left)} = ${esc(right)}</p>
        <p class="answer-sub">${esc(verdict)}</p>
      </div>`;
      return;
    }
  }

  if (f.kind === 'rule' && act === 'demo') {
    out.innerHTML = `<div class="answer">
      <div class="answer-label">Пример</div>
      <p class="answer-value" style="font-size:1.05rem">${esc(f.example || '—')}</p>
    </div>`;
    return;
  }

  if (act === 'recalc' && f.eq) {
    const unknown = state.unknown || f.find;
    const known = {};
    for (const v of f.vars) if (v.name !== unknown) {
      const val = state.values[v.name];
      if (val === null || val === undefined) {
        if (isDerivedVar(v.name)) continue;
        out.innerHTML = `<div class="err">Введите <b>${esc(v.label)}</b>.</div>`;
        return;
      }
      known[v.name] = val;
    }
    try {
      const dom = f.dom?.[unknown] || (known[unknown] !== undefined ? [known[unknown] - 1, known[unknown] + 1] : [-1000, 1000]);
      const res = solveFormula(f.eq, unknown, known, dom);
      if (Number.isFinite(res.value)) state.values[unknown] = Math.round(res.value * 1e10) / 1e10;
      const substituted = substituteText(f.eq, known);
      const unit = f.vars.find((v) => v.name === unknown)?.unit || '';
      out.innerHTML = `
        <div class="answer">
          <div class="answer-label">Ответ</div>
          <p class="answer-value">${esc(fmtSmart(res.value))}${unit ? ` <span style="font-size:.5em;font-weight:500;color:#4a5567">${esc(unit)}</span>` : ''}</p>
        </div>
        <details class="more">
          <summary>Как считали</summary>
          <div class="more-body">
            <ol class="steps">
              <li>${esc(f.display)}</li>
              <li>Подставим: <span class="mono">${esc(substituted)}</span></li>
              <li>${esc(unknown)} = ${esc(fmtSmart(res.value))}</li>
            </ol>
          </div>
        </details>`;
    } catch (e) {
      out.innerHTML = `<div class="err">Не получилось посчитать: ${esc(e.message)}</div>`;
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
$('#task-clear').addEventListener('click', () => { taskInput.value = ''; taskInput.focus(); taskResult.innerHTML = '<div class="calc-empty"><div class="calc-empty-mark">=</div><p>Здесь появится ответ</p></div>'; });
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
  if (!sol.ok) {
    taskResult.innerHTML = `
      <div class="calc-head"><h2>Не удалось распознать</h2></div>
      <div class="err">Этот текст не подошёл ни под один шаблон. Попробуйте указать, что нужно найти: «найдите скорость», «сколько процентов», «решите уравнение».</div>
      ${sol.steps?.length ? `<details class="more"><summary>Подсказки</summary><div class="more-body"><ol class="steps">${sol.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div></details>` : ''}`;
    return;
  }

  // 1. Ответ — сразу, крупно.
  let html = `<div class="calc-head"><h2>Ответ</h2></div>`;
  html += `<div class="answer">
    <div class="answer-label">${esc(sol.unknown || 'результат')}</div>
    <p class="answer-value">${esc(sol.answer)}</p>
    <p class="answer-sub">${esc(sol.pattern || '')}</p>
  </div>`;

  // 2. Рисунок, если он есть (промежутки).
  if (sol.draw) html += `<div class="figure">${sol.draw}</div>`;

  // 3. Всё остальное — в свёрнутых блоках.
  const blocks = [];

  if (sol.checks?.length) {
    blocks.push(`<details class="more"><summary>Проверка ответа</summary><div class="more-body">
      <ul class="check-list">${sol.checks.map((c) => `<li><span class="tick${c.ok ? '' : ' bad'}">${c.ok ? '✓' : '!'}</span><span>${esc(c.detail)}</span></li>`).join('')}</ul>
    </div></details>`);
  }

  if (sol.steps?.length || sol.variants?.length) {
    let inner = '';
    if (sol.variants?.length) {
      inner += `<div class="tabs-mini">${sol.variants.map((v, i) =>
        `<button data-variant="${i}" class="${i === 0 ? 'active' : ''}">${esc(v.title.replace(/^Способ \d+\.\s*/, ''))}</button>`).join('')}</div>`;
      inner += sol.variants.map((v, i) =>
        `<ol class="steps variant${i === 0 ? ' active' : ''}" data-variant-body="${i}">${v.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`).join('');
    } else {
      inner += `<ol class="steps">${sol.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
    }
    blocks.push(`<details class="more"><summary>Решение по шагам</summary><div class="more-body">${inner}</div></details>`);
  }

  // «А что если» — только поля ввода, без таблиц вариантов.
  const numericKeys = Object.entries(sol.inputs || {}).filter(([, v]) => typeof v === 'number');
  if (numericKeys.length) {
    blocks.push(`<details class="more"><summary>Другое число</summary><div class="more-body">
      <div class="fields">${numericKeys.map(([k, v]) => {
        const label = labelForVar(sol, k, v);
        return `<div class="field">
          <label for="wi-${esc(k)}"><span>${esc(label ? label.label : k)}</span></label>
          <input type="text" id="wi-${esc(k)}" data-whatif="${esc(k)}" value="${esc(fmtPlain(v))}" inputmode="decimal" autocomplete="off">
        </div>`;
      }).join('')}</div>
      <div id="whatif-live"></div>
    </div></details>`);
  }

  if (sol.notes?.length) {
    blocks.push(`<details class="more"><summary>Заметки</summary><div class="more-body"><ol class="steps">${sol.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div></details>`);
  }

  if (sol.related?.length) {
    blocks.push(`<details class="more"><summary>Формулы</summary><div class="more-body"><div class="related">
      ${sol.related.map((r) => `<button data-formula="${r.id}">${esc(r.title)}</button>`).join('')}
    </div></div></details>`);
  }

  html += blocks.join('');
  taskResult.innerHTML = html;

  // переключатель способов решения
  $$('[data-variant]', taskResult).forEach((btn) => btn.addEventListener('click', () => {
    const idx = btn.dataset.variant;
    $$('[data-variant]', taskResult).forEach((b) => b.classList.toggle('active', b.dataset.variant === idx));
    $$('[data-variant-body]', taskResult).forEach((b) => b.classList.toggle('active', b.dataset.variantBody === idx));
  }));

  // живой пересчёт «другое число»
  $$('[data-whatif]', taskResult).forEach((inp) => {
    inp.addEventListener('input', () => {
      const changed = {};
      for (const i of $$('[data-whatif]', taskResult)) changed[i.dataset.whatif] = parseNum(i.value);
      const res = recomputeWith(lastSolution, changed);
      const box = $('#whatif-live', taskResult);
      if (!box) return;
      box.innerHTML = res
        ? `<div class="answer" style="margin-top:10px"><div class="answer-label">Ответ</div>
           <p class="answer-value" style="font-size:1.4rem">${esc(res.answer)}</p></div>`
        : '';
    });
  });

  $$('[data-formula]', taskResult).forEach((b) => b.addEventListener('click', () => {
    selectTab('formulas');
    state.chapter = 'all'; state.query = ''; $('#formula-search').value = '';
    renderChapterFilter();
    selectFormula(b.dataset.formula);
  }));

  if (window.innerWidth <= 760) taskResult.scrollIntoView({ block: 'start' });
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
    out.innerHTML = `<div class="err">${esc(iv.error)}</div>
      <p class="hint" style="margin-top:8px">Формы записи: <span class="mono">[−2; 5)</span>, <span class="mono">(a; b)</span>, <span class="mono">[a; +∞)</span>, <span class="mono">x ⩾ −2</span>, <span class="mono">−3 ⩽ x < 4</span>.</p>`;
    return;
  }
  const ints = iv.integers();
  const svg = numberLineSVG([{ interval: iv, label: iv.name }], { width: 660 });
  out.innerHTML = `
    <div class="calc-head"><h2>${esc(iv.name)}</h2></div>
    <div class="figure">${svg}</div>
    <div class="answer">
      <div class="answer-label">Обозначение</div>
      <p class="answer-value" style="font-size:1.35rem">${esc(iv.notation)}</p>
      <p class="answer-sub">${esc(iv.inequality)}${ints === null ? '' : ' · целые: ' + (ints.length ? esc(ints.join(', ')) : 'нет')}</p>
    </div>
    <details class="more"><summary>Подробнее</summary><div class="more-body">
      <ol class="steps">
        <li>Множество: ${esc(iv.setName)}</li>
        ${iv.length !== Infinity ? `<li>Длина: ${esc(fmt(iv.length))}</li>` : '<li>Длина: бесконечна</li>'}
        ${iv.midpoint !== null ? `<li>Середина: ${esc(fmt(iv.midpoint))}</li>` : ''}
        ${describeInterval(iv).map((l) => `<li>${esc(l)}</li>`).join('')}
      </ol>
    </div></details>`;
}

function showBoth() {
  const a = parseInterval($('#interval-a').value);
  const b = parseInterval($('#interval-b').value);
  const out = $('#interval-both-output');
  if (a.error || b.error) { out.innerHTML = `<div class="err">${esc(a.error || b.error)}</div>`; return; }
  const inter = intersect(a, b);
  const uni = union(a, b);
  const svg = numberLineSVG([
    { interval: a, label: 'A', color: '#256bd8' },
    { interval: b, label: 'B', color: '#c8455f' },
    ...(inter ? [{ interval: inter, label: 'A ∩ B', color: '#1b9e77' }] : []),
  ], { width: 660 });
  out.innerHTML = `
    <div class="figure" style="margin-top:12px">${svg}</div>
    <div class="answer" style="margin-top:0">
      <div class="answer-label">A ∩ B</div>
      <p class="answer-value" style="font-size:1.25rem">${inter ? esc(inter.notation) : 'пусто'}</p>
      <p class="answer-sub">A ∪ B: ${uni.map((x) => esc(x.notation)).join(' ∪ ')}</p>
    </div>`;
}

$('#interval-go').addEventListener('click', showInterval);
$('#interval-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') showInterval(); });
$('#interval-both').addEventListener('click', showBoth);

/* =========================================================================
 * ИНИЦИАЛИЗАЦИЯ
 * ========================================================================= */
renderChapterFilter();
renderFormulaList();
renderQuick();
showInterval();
showBoth();

const initial = (location.hash || '').replace('#', '');
if (['formulas', 'tasks', 'intervals'].includes(initial)) selectTab(initial);

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
