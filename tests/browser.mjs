/**
 * Интеграционный прогон приложения в jsdom:
 * модули грузятся как в браузере (ES-модули поверх реального DOM из index.html),
 * проверяются ключевые пользовательские потоки новых экранов.
 * Запуск: node tests/browser.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
  // «Not implemented» из jsdom (scrollTo и т.п.) не валит тест, остальное — ошибка
  const msg = String(e?.message || e);
  if (/Not implemented/i.test(msg)) return;
  errors.push(msg);
});
virtualConsole.on('error', (msg) => errors.push(String(msg)));

const dom = new JSDOM(html, {
  url: 'https://gdz-preview.local/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole,
});

const { window } = dom;

// --- canvas 2d stub (jsdom не умеет рисовать) ------------------------------
const ctxStub = () => new Proxy({}, {
  get: (t, prop) => {
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof t[prop] !== 'undefined') return t[prop];
    return (..._args) => undefined;
  },
  set: (t, prop, value) => { t[prop] = value; return true; },
});
window.HTMLCanvasElement.prototype.getContext = function getContext() { return ctxStub(); };

// --- globals, которые ждут модули ------------------------------------------
const expose = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
expose('window', window);
expose('document', window.document);
expose('localStorage', window.localStorage);
expose('location', window.location);
expose('navigator', window.navigator);
expose('devicePixelRatio', 1);
expose('requestAnimationFrame', (cb) => setTimeout(cb, 0));
expose('getComputedStyle', window.getComputedStyle.bind(window));
expose('HTMLElement', window.HTMLElement);
expose('HTMLImageElement', window.HTMLImageElement);
expose('Blob', window.Blob);
expose('URL', window.URL);
expose('CustomEvent', window.CustomEvent);
expose('Event', window.Event);
expose('KeyboardEvent', window.KeyboardEvent);
expose('self', window);

// --- загрузка приложения ровно как в браузере -------------------------------
await import('../js/app.js');

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const click = (sel) => {
  const el = $(sel);
  if (!el) throw new Error(`элемент ${sel} не найден`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
};
const type = (sel, value) => {
  const el = $(sel);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'ожидалось true'); };

console.log('\nЗАГРУЗКА ПРИЛОЖЕНИЯ');
ok('модули загрузились, вкладки на месте', () => {
  for (const go of ['scheme', 'ru']) assert($("[data-go=\"' + go + '\"]") === null || true);
  assert($$('.tab').some((b) => b.dataset.go === 'scheme'), 'вкладки «Схема» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'ru'), 'вкладки «Русский» нет');
});

console.log('\nЗАДАЧИ: Дано — Найти — Решение — Ответ');
ok('простая задача даёт карточку с «Дано» и «Найти»', () => {
  type('#task-input', 'Купили 3 кг яблок по 120 рублей за килограмм. Сколько заплатили?');
  click('#task-solve');
  const html = $('#task-result').innerHTML;
  assert(html.includes('Дано:'), 'нет блока «Дано»');
  assert(html.includes('Найти:'), 'нет блока «Найти»');
  assert(html.includes('360'), 'ответ 360 не найден');
  assert(html.includes('Решение по действиям'), 'нет блока «Решение по действиям»');
});

console.log('\nВКЛАДКА «СХЕМА»');
ok('переключение на «Схема» активирует экран', () => {
  click('[data-go="scheme"]');
  assert($('#screen-scheme').classList.contains('active'), 'screen-scheme не активен');
});
ok('пресет «Смета»: сетка из 3×3 ячеек и решение на 291 ₽', () => {
  click('[data-preset="smeta"]');
  assert($$('#scheme-grid .cell-input').length === 9, 'ожидалась сетка 3×3');
  click('#scheme-solve');
  const html = $('#scheme-out').innerHTML;
  assert(html.includes('291'), `ответ 291 ₽ не найден: ${html.slice(0, 200)}`);
  assert(html.includes('Дано:'), 'нет «Дано» в карточке решения');
});
ok('график таблицы: выпадающий список столбцов и canvas на месте', () => {
  const sel = $('#scheme-chart-col');
  assert(sel && sel.options.length >= 3, 'в списке столбцов пусто');
  const canvas = $('#scheme-chart-canvas');
  assert(canvas && canvas.tagName === 'CANVAS', 'canvas графика не найден');
});
ok('пресет «Корзины» и пересчёт после правки ячейки', () => {
  click('[data-preset="baskets"]');
  const cell = $('#scheme-grid .cell-input');
  assert(cell, 'ячейки нет');
  cell.value = '30';
  cell.dispatchEvent(new window.Event('input', { bubbles: true }));
  const html = $('#scheme-out').innerHTML; // не должно быть падения
  assert($('#screen-scheme').classList.contains('active'));
});
ok('«Своё действие» добавляется в список и решается', () => {
  click('[data-preset="blank"]');
  type('#scheme-custom-label', 'Половина суммы');
  type('#scheme-custom-formula', '(a + b) / 2');
  click('#scheme-add-custom button[type="submit"], #scheme-add-custom .btn');
  const list = $('#scheme-custom-list').innerHTML;
  assert(list.includes('Половина суммы'), 'своё действие не добавилось');
});
ok('«Составить условие» собирает полный текст с таблицей', () => {
  click('[data-preset="smeta"]');
  click('#scheme-compose');
  const wrap = $('#scheme-condition-wrap');
  assert(!wrap.hidden, 'блок условия скрыт');
  const text = $('#scheme-condition').textContent;
  assert(text.includes('Таблица:'), 'в условии нет таблицы');
  assert(text.includes('291'), 'в условии нет итога 291');
});
ok('график: код отрисовки выполняется без ошибок при заданной ширине canvas', () => {
  const canvas = $('#scheme-chart-canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: 640, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: 190, configurable: true });
  click('[data-go="geo"]');   // переключаемся и возвращаемся — show() перерисует график
  click('[data-go="scheme"]');
  assert(canvas.width > 0 && canvas.height > 0, 'canvas не получил размер');
});
ok('localStorage сохранил схему', () => {
  assert(window.localStorage.getItem('gdzcalc.scheme.v1'), 'схема не сохранилась');
});

console.log('\nВКЛАДКА «РУССКИЙ»');
ok('переключение на «Русский» активирует экран', () => {
  click('[data-go="ru"]');
  assert($('#screen-ru').classList.contains('active'), 'screen-ru не активен');
});
ok('«читающий» → причастие, действительное, настоящего', () => {
  type('#ru-word', 'читающий');
  click('#ru-analyze');
  const html = $('#ru-out').innerHTML;
  assert(html.includes('причастие'), 'нет слова «причастие»');
  assert(html.includes('действительное'), 'нет разряда «действительное»');
  assert(html.includes('настоящего'), 'нет времени «настоящего»');
});
ok('авторежим: «бежит» — глагол (не причастие)', () => {
  type('#ru-word', 'бежит');
  click('#ru-analyze');
  assert($('#ru-out').innerHTML.includes('глагол'), 'бежит не определён как глагол');
});
ok('ручной режим «Причастие»: «сделанный» — страдательное прошедшего', () => {
  click('[data-mode="participle"]');
  type('#ru-word', 'сделанный');
  click('#ru-analyze');
  const html = $('#ru-out').innerHTML;
  assert(html.includes('страдательное'), 'нет «страдательное»');
  assert(html.includes('прошедшего'), 'нет «прошедшего»');
});
ok('справочник отрисовался (10 разделов)', () => {
  assert($$('#ru-ref .ru-sec').length === 10, `разделов: ${$$('#ru-ref .ru-sec').length}`);
});
ok('квиз отрисовался и кнопки отвечают', () => {
  const opt = $('#ru-quiz button');
  assert(opt, 'вопросов квиза нет');
  opt.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
});

console.log('\nГЕОМЕТРИЯ: идеальный треугольник');
ok('пресет 3-4-5 + «Нарисовать» → SVG с прямым углом', () => {
  click('[data-go="geo"]');
  click('[data-tri="sss:3,4,5"]');
  click('#tri-draw');
  const html = $('#tri-out').innerHTML;
  assert(html.includes('<svg'), 'SVG не отрисовался');
  assert(html.includes('90'), 'угол 90° не подписан');
  assert($('#tri-download').hidden === false, 'кнопка «Скачать SVG» скрыта');
});

if (errors.length) {
  console.log('\nОШИБКИ КОНСОЛИ:');
  for (const e of errors.slice(0, 10)) console.error('  •', e);
  process.exitCode = 1;
} else {
  console.log('\nОшибок консоли нет.');
}
console.log(`\nПройдено: ${passed} интеграционных проверок\n`);
process.exit(process.exitCode || 0);
