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
ok('модули загрузились, вкладок «Задачи» и «Русский» нет, «Смета» есть', () => {
  assert(!$$('.tab').some((b) => b.dataset.go === 'task'), 'вкладка «Задачи» осталась');
  assert(!$$('.tab').some((b) => b.dataset.go === 'ru'), 'вкладка «Русский» осталась');
  assert($$('.tab').some((b) => b.dataset.go === 'smeta'), 'вкладки «Смета» нет');
  assert($('#screen-smeta'), 'screen-smeta не найден');
});

console.log('\nВКЛАДКА «СМЕТА»');
ok('переключение на «Смета» активирует экран', () => {
  click('[data-go="smeta"]');
  assert($('#screen-smeta').classList.contains('active'), 'screen-smeta не активен');
  assert($('#bar-title').textContent === 'Смета', 'в шапке не «Смета»');
});
ok('внутри iframe — отдельный движок smeta.html', () => {
  const frame = $('#smeta-frame');
  assert(frame, 'iframe не найден');
  assert(/smeta\.html$/.test(frame.getAttribute('src')), `src=${frame.getAttribute('src')}`);
  assert($('.smeta-note a[href="smeta.html"]'), 'ссылки на smeta.html нет');
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
