/**
 * Интеграционный прогон smeta.html (отдельного файла-движка сметы) в jsdom.
 * Запуск: npm i --no-save jsdom && node tests/smeta.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

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

if (errors.length) {
  console.log('\nОШИБКИ КОНСОЛИ:');
  for (const e of errors.slice(0, 8)) console.error('  •', e);
  process.exitCode = 1;
} else {
  console.log('\nОшибок консоли нет.');
}
console.log(`\nПройдено: ${passed} проверок сметы\n`);
process.exit(process.exitCode || 0);
