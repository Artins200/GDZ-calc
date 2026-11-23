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
  assert($$('.tab').some((b) => b.dataset.go === 'mean'), 'вкладки «Среднее» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'stats'), 'вкладки «Статистика» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'equation'), 'вкладки «Уравнения» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'system'), 'вкладки «Системы» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'history'), 'вкладки «Журнал» нет');
  assert($$('.tab').some((b) => b.dataset.go === 'ideas'), 'вкладки «Идеи» нет');
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

console.log('\nИДЕИ И СТАТИСТИКА');
ok('каталог показывает и фильтрует 2000 идей с честной маркировкой черновика', () => {
  click('[data-go="ideas"]');
  assert($('#idea-count').textContent.includes('2000'), 'не показано общее число идей');
  assert($$('#idea-list article').length === 60, 'не сработала постраничная выдача');
  type('#idea-search', 'контрпример');
  assert($('#idea-count').textContent.includes('50'), 'поиск не фильтрует каталог');
  assert($('#screen-ideas').textContent.includes('не активные функции'), 'нет предупреждения о статусе каталога');
});

console.log('\nСРЕДНЕЕ И РЕШЕНИЕ УРАВНЕНИЙ');
ok('среднее арифметическое показывает вычисление по шагам', () => {
  click('[data-go="mean"]');
  type('#mean-values', '12,5; 15; 18,5');
  click('#mean-calculate');
  assert($('#mean-output').textContent.includes('15,33333333'), 'среднее не показано');
  assert($('#mean-output').textContent.includes('Количество чисел: 3'), 'количество не показано');
});
ok('статистика: сводка, выбросы, взвешенное среднее и регрессия', () => {
  click('[data-go="stats"]');
  type('#stats-values', '1; 2; 3; 4; 100');
  click('#stats-analyze');
  assert($('#stats-output').textContent.includes('Медиана: 3'), 'медиана неверна');
  assert($('#stats-output').textContent.includes('100'), 'выброс не отмечен');
  assert($('#stats-output').innerHTML.includes('<svg'), 'гистограмма не показана');
  type('#weighted-values', '3; 4; 5'); type('#weighted-weights', '1; 2; 1');
  click('#weighted-calculate');
  assert($('#weighted-output').textContent.includes('4'), 'взвешенное среднее не посчитано');
  type('#regression-x', '1; 2; 3'); type('#regression-y', '2; 4; 6');
  click('#regression-calculate');
  assert($('#regression-output').textContent.includes('y = 2x'), 'регрессия не построена');
  assert($('#regression-output').innerHTML.includes('<svg'), 'диаграмма регрессии не показана');
});
ok('уравнения: автоматический способ находит оба квадратных корня', () => {
  click('[data-go="equation"]');
  type('#equation-input', 'x² − 5x + 6 = 0');
  click('#equation-solve');
  assert($('#equation-output').textContent.includes('x = 2'), 'первый корень не показан');
  assert($('#equation-output').textContent.includes('x = 3'), 'второй корень не показан');
  type('#equation-method', 'quadratic');
  click('#equation-solve');
  assert($('#equation-output').textContent.includes('x = 2') && $('#equation-output').textContent.includes('x = 3'), 'выбор метода по дискриминанту не сработал');
  type('#equation-display-mode', 'teacher'); click('#equation-solve');
  assert($('#equation-output').textContent.includes('Объяснение как преподаватель'), 'не появился разбор преподавателя');
  type('#equation-display-mode', 'gradual'); click('#equation-solve');
  assert($('#equation-answer-card').hidden, 'ответ выдан до раскрытия шагов');
  for (let i = 0; i < 6 && !$('#equation-next-hint').hidden; i++) click('#equation-next-hint');
  assert(!$('#equation-answer-card').hidden, 'ответ не открылся после подсказок');
  type('#equation-display-mode', 'answer');
});
ok('уравнения: тождество сообщает о бесконечно многих решениях', () => {
  type('#equation-method', 'auto');
  type('#equation-input', '2x + 1 = 2x + 1');
  click('#equation-solve');
  assert($('#equation-output').textContent.includes('бесконечно много решений'), 'вырожденный случай показан неверно');
});
ok('проверка чужого решения находит первый неверный переход', () => {
  type('#equation-input', 'x² − 5x + 6 = 0');
  type('#student-steps', '(x − 2)(x − 3) = 0\nx − 2 = 0');
  click('#check-student-steps');
  assert($('#student-check-output').textContent.includes('Первая ошибка — шаг 2'), 'не найден первый неверный шаг');
});
ok('системы: сравнение четырёх методов приводит к одному решению', () => {
  click('[data-go="system"]');
  type('#system-eq1', 'x + y = 5');
  type('#system-eq2', 'x - y = 1');
  type('#system-method', 'compare');
  click('#system-solve');
  const result = $('#system-output').textContent;
  assert(result.includes('Сложение (исключение)'), 'нет сложения');
  assert(result.includes('Подстановка'), 'нет подстановки');
  assert(result.includes('Определители Крамера'), 'нет метода Крамера');
  assert(result.includes('Графический метод'), 'нет графического метода');
  assert($('#system-output').innerHTML.includes('<svg'), 'графический метод не построил SVG');
  assert((result.match(/\(3; 2\)/g) || []).length >= 4, 'методы разошлись в ответе');
});
ok('журнал сохраняет, восстанавливает и очищает решение', () => {
  click('[data-go="history"]');
  assert($$('#history-list [data-history-id]').length >= 3, 'решения не попали в журнал');
  click('#history-list [data-history-id]');
  assert($('#screen-system').classList.contains('active'), 'решение системы не восстановлено');
  click('[data-go="history"]');
  click('#history-clear');
  assert(!$('#history-list [data-history-id]'), 'журнал не очистился');
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
