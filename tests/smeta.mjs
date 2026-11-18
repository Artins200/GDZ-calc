/**
 * Интеграционный прогон smeta.html (отдельного файла-движка сметы) в jsdom.
 * Запуск: npm i --no-save jsdom && node tests/smeta.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import nodeAssert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'smeta.html'), 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
  const msg = String(e?.message || e);
  if (/Not implemented/i.test(msg)) return;
  errors.push(msg);
});
virtualConsole.on('error', (msg) => errors.push(String(msg)));
virtualConsole.on('warn', () => {});

const dom = new JSDOM(html, {
  url: 'https://smeta.local/smeta.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    // canvas 2d stub (jsdom не умеет рисовать)
    const ctxStub = () => new Proxy({}, {
      get: (t, prop) => {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (typeof t[prop] !== 'undefined') return t[prop];
        return (..._args) => undefined;
      },
      set: (t, prop, value) => { t[prop] = value; return true; },
    });
    window.HTMLCanvasElement.prototype.getContext = function getContext() { return ctxStub(); };
    window.devicePixelRatio = 1;
  },
});

const { window } = dom;
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'ожидалось true'); };
const type = (sel, value) => {
  const el = $(sel);
  assert(el, `нет ${sel}`);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const click = (sel) => {
  const el = $(sel);
  assert(el, `нет ${sel}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
};
const ask = (q) => {
  type('#qa-input', q);
  $('#qa-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const ans = $('#qa-answer');
  if (ans.style.display !== 'none' && ans.textContent.trim()) return { ok: true, text: ans.textContent };
  return { ok: false, text: $('#qa-error').textContent };
};

await new Promise((r) => setTimeout(r, 50)); // дать скрипту отработать

console.log('\nSMETA.HTML — ЗАГРУЗКА');
ok('файл открывается, рендерится таблица «Отчёт по дням»', () => {
  assert($('#table-wrap table'), 'таблицы нет');
  assert($$('#table-wrap .cell-input').length >= 9, 'ячеек меньше 9');
  assert($('#qa-form'), 'нет формы вопроса');
});
ok('итоги посчитаны: столбец «сделали» = 383', () => {
  const foot = $('#table-wrap tfoot');
  assert(foot && foot.textContent.includes('383'), `в «Итого» нет 383: ${foot?.textContent}`);
});

console.log('\nSMETA.HTML — ВОПРОСЫ СЛОВАМИ');
ok('«сколько сделали в первый день?» → 120', () => {
  const r = ask('сколько сделали в первый день?');
  assert(r.ok, `вопрос не разобран: ${r.text}`);
  assert(r.text.includes('120'), `ответ не 120: ${r.text}`);
});
ok('«сколько сделали во второй день?» → 135', () => {
  const r = ask('сколько сделали во второй день?');
  assert(r.ok && r.text.includes('135'), `ответ не 135: ${r.text}`);
});
ok('«какая численность?» → 23 (8+8+7)', () => {
  const r = ask('какая численность?');
  assert(r.ok && r.text.includes('23'), `ответ не 23: ${r.text}`);
});
ok('«сколько всего сделали?» → 383', () => {
  const r = ask('сколько всего сделали?');
  assert(r.ok && r.text.includes('383'), `ответ не 383: ${r.text}`);
});
ok('«в каком дне больше всего сделали?» → Второй день, 135', () => {
  const r = ask('в каком дне больше всего сделали?');
  assert(r.ok, r.text);
  assert(r.text.includes('135') && /второй/i.test(r.text), `ожидался «Второй день» и 135: ${r.text}`);
});
ok('«сколько брака всего?» → 10', () => {
  const r = ask('сколько брака всего?');
  assert(r.ok && r.text.includes('10'), `ответ не 10: ${r.text}`);
});
ok('вопрос про несуществующее — честное сообщение со списком столбцов', () => {
  const r = ask('какая погода завтра?');
  assert(!r.ok, 'должно быть сообщение об ошибке');
  assert(/столбцы/i.test(r.text), 'нет подсказки про столбцы');
});

console.log('\nSMETA.HTML — ПЕРЕСЧЁТ');
ok('правка ячейки пересчитывает «Итого»', () => {
  const cell = $('[data-cell="0:0"]');
  cell.value = '200';
  cell.dispatchEvent(new window.Event('input', { bubbles: true }));
  const foot = $('#table-wrap tfoot');
  assert(foot.textContent.includes('463'), `ожидалось 463: ${foot.textContent}`);
});
ok('вопрос по обновлённой таблице: первый день = 200', () => {
  const r = ask('сколько сделали в первый день?');
  assert(r.ok && r.text.includes('200'), `ответ не 200: ${r.text}`);
});

console.log('\nSMETA.HTML — ВЫРАЖЕНИЯ И ПЕРЕМЕННЫЕ');
ok('пример «Смета покупки»: стоимость считается выражениями', () => {
  click('#preset-smeta');
  const foot = $('#table-wrap tfoot');
  assert(foot.textContent.includes('291'), `нет итога 291: ${foot?.textContent}`);
});
ok('«сколько всего?» на смете → 291', () => {
  const r = ask('сколько всего?');
  assert(r.ok && r.text.includes('291'), `ответ не 291: ${r.text}`);
});
ok('«сколько стоимость в книге?» → 240', () => {
  const r = ask('сколько стоимость в книге?');
  assert(r.ok && r.text.includes('240'), `ответ не 240: ${r.text}`);
});


console.log('\nSMETA.HTML — КРАЕВЫЕ СЛУЧАИ (по результатам ревью)');
ok('max(2, 5) с запятой-аргументом = 5', () => {
  nodeAssert.equal(window.__smeta.evaluateExpr('max(2, 5)', {}), 5);
  nodeAssert.equal(window.__smeta.evaluateExpr('min(2, 5)', {}), 2);
  nodeAssert.equal(window.__smeta.evaluateExpr('avg(2, 4, 6)', {}), 4);
});
ok('неявное умножение: 2a, 2(3), (1+2)(3+4)', () => {
  nodeAssert.equal(window.__smeta.evaluateExpr('2a', { a: 3 }), 6);
  nodeAssert.equal(window.__smeta.evaluateExpr('2(3)', {}), 6);
  nodeAssert.equal(window.__smeta.evaluateExpr('(1+2)(3+4)', {}), 21);
  nodeAssert.equal(window.__smeta.evaluateExpr('2(a + 1)', { a: 4 }), 10);
});
ok('научная нотация 1e3 и тысячи «1 000»', () => {
  nodeAssert.equal(window.__smeta.evaluateExpr('1e3', {}), 1000);
  nodeAssert.equal(window.__smeta.evaluateExpr('2,5e-1 + 1', {}), 1.25);
  nodeAssert.equal(window.__smeta.evaluateExpr('1 000 + 2', {}), 1002);
  nodeAssert.equal(window.__smeta.evaluateExpr('1 000 000', {}), 1000000);
});
ok('mod и проценты: 17 mod 5 = 2; 50 % = 0,5', () => {
  nodeAssert.equal(window.__smeta.evaluateExpr('17 mod 5', {}), 2);
  nodeAssert.equal(window.__smeta.evaluateExpr('50 %', {}), 0.5);
  nodeAssert.equal(window.__smeta.evaluateExpr('200 * 10 %', {}), 20);
});
ok('степень право-ассоциативна; унарный минус ниже ^: -2^2 = -4', () => {
  nodeAssert.equal(window.__smeta.evaluateExpr('2^3^2', {}), 512);
  nodeAssert.equal(window.__smeta.evaluateExpr('-2^2', {}), -4);
  nodeAssert.equal(window.__smeta.evaluateExpr('2^-1', {}), 0.5);
});
ok('деление на ноль — ошибка, а не Infinity', () => {
  nodeAssert.throws(() => window.__smeta.evaluateExpr('1 / 0', {}), /ноль/);
});
ok('переменные считаются топологически: a = b + 1 при b ниже — работает', () => {
  const ev = window.__smeta.evaluateCells({
    title: 't', vars: [{ name: 'a', expr: 'b + 1' }, { name: 'b', expr: '2' }],
    columns: [{ id: 'c1', title: 'x', unit: '' }], rows: [{ id: 'r1', label: 'строка' }],
    cells: {}, relations: [], showSumCol: true, showSumRow: true,
  });
  nodeAssert.equal(ev.scope.a, 3);
  nodeAssert.equal(ev.errors.length, 0);
});
ok('цикл в переменных — честная ошибка, зависимая ячейка показывает её', () => {
  const ev = window.__smeta.evaluateCells({
    title: 't', vars: [{ name: 'a', expr: 'b + 1' }, { name: 'b', expr: 'a + 1' }],
    columns: [{ id: 'c1', title: 'x', unit: '' }], rows: [{ id: 'r1', label: 'строка' }],
    cells: { 'r1|c1': 'a * 2' }, relations: [], showSumCol: true, showSumRow: true,
  });
  nodeAssert.ok(ev.errors.some((e) => /[Цц]икл/.test(e)), 'нет сообщения о цикле');
  nodeAssert.ok(ev.grid[0][0].error, 'ячейка не показала ошибку');
  nodeAssert.ok(ev.colBad[0] === 1, 'столбец не помечен как непосчитанный');
});
ok('сломанная переменная (1/0) не становится нулём в зависимой ячейке', () => {
  const ev = window.__smeta.evaluateCells({
    title: 't', vars: [{ name: 'a', expr: '1 / 0' }],
    columns: [{ id: 'c1', title: 'x', unit: '' }], rows: [{ id: 'r1', label: 'строка' }],
    cells: { 'r1|c1': 'a + 1' }, relations: [], showSumCol: true, showSumRow: true,
  });
  nodeAssert.ok(ev.grid[0][0].error, 'ячейка считается вместо ошибки');
  nodeAssert.notEqual(ev.grid[0][0].value, 1, 'зависимая ячейка получила 1 (NaN→0)');
});
ok('«на сколько больше сделали во второй день, чем в первый?» → 15', () => {
  click('#preset-days'); // сброс к 120 / 135 / 128
  const r = ask('на сколько больше сделали во второй день, чем в первый?');
  assert(r.ok, r.text);
  assert(r.text.includes('15'), `ожидалось 15: ${r.text}`);
});
ok('спорные столбцы — вопрос-уточнение, а не тихая сумма', () => {
  click('#preset-days');
  const colTitle = $('[data-col-title="2"]'); // «брак» → тоже «сделали»
  colTitle.value = 'сделали';
  colTitle.dispatchEvent(new window.Event('input', { bubbles: true }));
  colTitle.dispatchEvent(new window.Event('change', { bubbles: true }));
  const r = ask('сколько сделали в первый день?');
  assert(!r.ok, 'должно быть уточнение');
  assert(/[Уу]точните/.test(r.text), `нет уточнения: ${r.text}`);
  // возвращаем как было
  const back = $('[data-col-title="2"]');
  back.value = 'брак';
  back.dispatchEvent(new window.Event('input', { bubbles: true }));
  back.dispatchEvent(new window.Event('change', { bubbles: true }));
});
ok('«в каком дне больше всего?» без столбца — ответ по всей таблице', () => {
  click('#preset-days');
  const r = ask('в каком дне больше всего сделали?');
  assert(r.ok, r.text);
  assert(r.text.includes('135'), `ожидалось 135: ${r.text}`);
});
ok('«− столбец» удаляет столбец в фокусе, а не последний', () => {
  click('#preset-days');
  window.confirm = () => true;
  const cell = $('[data-cell="1:0"]'); // строка «Второй день», столбец «сделали»
  cell.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
  click('#del-col');
  const smeta = window.__smeta.model;
  nodeAssert.equal(smeta.columns.length, 2, 'столбец не удалён');
  assert(!smeta.columns.some((c) => c.title === 'сделали'), 'удалён не тот столбец');
  assert(smeta.columns.some((c) => c.title === 'численность'), 'пропал чужой столбец');
  click('#preset-days'); // восстановить пресет
});

if (errors.length) {
  console.log('\nОШИБКИ КОНСОЛИ:');
  for (const e of errors.slice(0, 8)) console.error('  •', e);
  process.exitCode = 1;
} else {
  console.log('\nОшибок консоли нет.');
}
console.log(`\nПройдено: ${passed} проверок сметы\n`);
process.exit(process.exitCode || 0);
