/* Автотесты ядра: ответы сверены с разделом «Ответы» учебника. */
import assert from 'node:assert/strict';
import {
  evaluate, solveEquation, solveSystem, expandExpression, factorExpression,
  checkIdentity, solveFormula, fmt, gcd, lcm, factorizationString,
} from '../js/mathcore.js';
import { FORMULAS, STATS, formulaSearch } from '../js/formulas.js';
import { parseInterval, intersect, union, numberLineSVG, describeInterval } from '../js/intervals.js';
import { solveTask, TASK_EXAMPLES, RULE_COUNT, recomputeWith } from '../js/tasks.js';
import { solveInequality, longArithmetic } from '../js/inequalities.js';

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

console.log('\nМАТЕМАТИЧЕСКОЕ ЯДРО');
ok('неявное умножение переменных: 2ab = 2·a·b', () => {
  near(evaluate('2ab', { a: 2, b: 3 }), 12);
  near(evaluate('3abc', { a: 2, b: 3, c: 5 }), 90);
  near(evaluate('a^2+2ab+b^2', { a: 2, b: 3 }), 25);
});
ok('многосимвольные имена не режутся на буквы (rho, vt, S1)', () => {
  near(evaluate('rho*V', { rho: 7.8, V: 10 }), 78);
  near(evaluate('vt', { vt: 2 }), 2);
  near(evaluate('v0 + vt', { v0: 20, vt: 2 }), 22);
  near(evaluate('S1 + S2', { S1: 3, S2: 4 }), 7);
});
ok('квадрат суммы проверяется символьно', () => {
  assert.equal(checkIdentity('(a+b)^2 = a^2 + 2ab + b^2').equal, true);
  assert.equal(checkIdentity('(a-b)^2 = a^2 - 2ab + b^2').equal, true);
  assert.equal(checkIdentity('(a+b)^2 = a^2 + b^2').equal, false);
});

ok('порядок действий и десятичная запятая', () => near(evaluate('12*6 - 35/7'), 67));
ok('неявное умножение 3(x+y)', () => near(evaluate('3(x+y)', { x: 5, y: 4 }), 27));
ok('степень и унарный минус −2² = −4', () => near(evaluate('-2^2'), -4));
ok('π и мнимая переменная', () => near(evaluate('2*PI*r', { r: 5 }), 31.4159265359));
ok('модуль |b−a|', () => near(evaluate('abs(b-a)', { a: 7.45, b: 1.15 }), 6.3));
ok('десятичная запятая 2,5+1,3', () => near(evaluate('2,5+1,3'), 3.8));
ok('линейное уравнение 5(x−10)=2x+10 → 20', () => near(solveEquation('5*(x-10) = 2*x+10', 'x').roots[0], 20));
ok('0x = 0 → бесконечно много корней', () => assert.equal(solveEquation('3*(x+2)+x = 6+4*x', 'x').type, 'many'));
ok('x² = 4 → два корня', () => {
  const r = solveEquation('x^2 = 4', 'x').roots;
  assert.equal(r.length, 2); near(r[0], -2); near(r[1], 2);
});
ok('система {15x+5y=64; 5x−2y=3} → (2,6; 5)', () => {
  const s = solveSystem(['15*x + 5*y = 64', '5*x - 2*y = 3']);
  assert.equal(s.type, 'one'); near(s.values.x, 2.6); near(s.values.y, 5);
});
ok('система без решений', () => {
  const s = solveSystem(['x + y = 5', '2*x + 2*y = 12']);
  assert.equal(s.type, 'none');
});
ok('(a+b)² раскрывается', () => assert.equal(expandExpression('(a+b)^2'), 'a² + 2ab + b²'));
ok('(a−b)(a+b) раскрывается', () => assert.equal(expandExpression('(a-b)*(a+b)'), 'a² − b²'));
ok('(a+b)³ раскрывается', () => assert.equal(expandExpression('(a+b)^3'), 'a³ + 3a²b + 3ab² + b³'));
ok('проверка тождества', () => assert.equal(checkIdentity('(a+b)^2 = a^2+2*a*b+b^2').equal, true));
ok('49x²−16 → (7x−4)(7x+4)', () => assert.equal(factorExpression('49x^2 - 16').text, '(7x − 4)(7x + 4)'));
ok('x²−16 → (x−4)(x+4)', () => assert.equal(factorExpression('x^2-16').text, '(x − 4)(x + 4)'));
ok('2x²+3x → x(2x + 3)', () => assert.equal(factorExpression('2*x^2+3*x').text, 'x(2x + 3)'));
ok('a³+b³ → формула суммы кубов', () => assert.match(factorExpression('a^3+b^3').method, /суммы кубов/));
ok('решить формулу V=4πr³/3 относительно r', () => {
  const r = solveFormula('V = 4/3*PI*r^3', 'r', { V: (4 / 3) * Math.PI * 27 }, [0, 100]);
  near(r.value, 3, 1e-4);
});
ok('НОД/НОК/разложение', () => { assert.equal(gcd(72, 180), 36); assert.equal(lcm(72, 180), 360); assert.equal(factorizationString(630), '2 · 3^2 · 5 · 7'); });

console.log('\nКАТАЛОГ ФОРМУЛ');
ok(`всего карточек: ${STATS.total} (формул ${STATS.kinds.formula}, тождеств ${STATS.kinds.identity}, правил ${STATS.kinds.rule}, промежутков ${STATS.kinds.interval})`, () => {
  assert.ok(STATS.total >= 120);
  assert.ok(STATS.kinds.interval >= 9);
  assert.ok(STATS.byChapter.every((c) => c.count > 0));
});
ok('у каждой формулы есть eq и vars', () => {
  for (const f of FORMULAS) {
    if (f.kind === 'formula') {
      assert.ok(f.eq && f.eq.includes('='), `${f.id}: нет уравнения`);
      assert.ok(f.vars.length >= 2, `${f.id}: мало переменных`);
    }
  }
});
ok('все формулы вычислимы при значениях по умолчанию', () => {
  let checked = 0;
  for (const f of FORMULAS) {
    if (f.kind !== 'formula') continue;
    const known = Object.fromEntries(f.vars.filter((v) => v.name !== f.find && v.def !== null).map((v) => [v.name, v.def]));
    try {
      const r = solveFormula(f.eq, f.find, known, f.dom[f.find] || [-1000, 1000]);
      assert.ok(Number.isFinite(r.value), `${f.id}: результат не число`);
      checked++;
    } catch (e) { assert.fail(`${f.id}: ${e.message}`); }
  }
  assert.ok(checked > 60);
});
ok('все тождества верны при значениях по умолчанию', () => {
  let checked = 0;
  for (const f of FORMULAS) {
    if (f.kind !== 'identity' || !f.eq) continue;
    const scope = Object.fromEntries(f.vars.map((v) => [v.name, v.def ?? 1]));
    const c = checkIdentity(f.eq);
    assert.equal(c.equal, true, `${f.id}: тождество ложно`);
    const [L, R] = f.eq.split('=');
    near(evaluate(L, scope), evaluate(R, scope), 1e-5);
    checked++;
  }
  assert.ok(checked > 25);
});
ok('поиск по учебнику', () => {
  assert.ok(formulaSearch('квадрат суммы')[0]?.id === 'sq_sum');
  assert.ok(formulaSearch('полуинтервал').length >= 2);
});

console.log('\nЧИСЛОВЫЕ ПРОМЕЖУТКИ');
ok('[−2; 5) распознан', () => {
  const i = parseInterval('[−2; 5)');
  assert.equal(i.notation, '[−2; 5)');
  assert.equal(i.name, 'полуинтервал');
  assert.ok(i.contains(-2)); assert.ok(!i.contains(5)); assert.ok(i.contains(0));
});
ok('(a; b) — границы не включаются', () => {
  const i = parseInterval('(-1; 1)');
  assert.ok(!i.contains(-1) && !i.contains(1) && i.contains(0));
});
ok('x ⩾ −2 — замкнутый луч с +∞', () => {
  const i = parseInterval('x ⩾ -2');
  assert.equal(i.right.value, null);
  assert.equal(i.name, 'замкнутый луч');
  assert.ok(i.contains(-2) && i.contains(100));
});
ok('(−∞; 3] и −∞/+∞', () => {
  assert.equal(parseInterval('(-∞; 3]').left.value, null);
  assert.equal(parseInterval('(-∞;+∞)').name, 'вся числовая прямая');
});
ok('пересечение и объединение', () => {
  const a = parseInterval('[-2; 5)'), b = parseInterval('(0; 8]');
  assert.equal(intersect(a, b).notation, '(0; 5)');
  assert.equal(union(a, b).length, 1);
  assert.equal(union(a, b)[0].notation, '[−2; 8]');
});
ok('мини-рисунок SVG', () => {
  const svg = numberLineSVG([{ interval: parseInterval('[-2; 5)'), label: 'полуинтервал' }]);
  assert.ok(svg.startsWith('<svg') && svg.includes('circle') && svg.includes('</svg>'));
});
ok('описание промежутка', () => assert.ok(describeInterval(parseInterval('[1; 4]')).join(' ').includes('Длина')));

console.log('\nПАРСЕР ЗАДАЧ');
ok(`загружено шаблонов: ${RULE_COUNT}`, () => assert.ok(RULE_COUNT >= 40));
ok('№ 190: 1800 шагов по 60 см → 1,08 км', () => {
  const s = solveTask('Сколько километров прошёл человек, если длина его шага 60 см, а сделал он 1800 шагов?');
  assert.equal(s.ok, true);
  assert.match(String(s.answer), /1,08/);
});
ok('№ 277: 390 км за 6,5 ч → 60 км/ч', () => {
  const s = solveTask('Автомобиль проехал 390 км за 6,5 ч. Найдите его среднюю скорость.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /60/);
});
ok('№ 251: расстояние 7,45 и 1,15 → 6,3', () => {
  const s = solveTask('Найдите расстояние между точками S(7,45) и D(1,15).');
  assert.equal(s.ok, true); assert.match(String(s.answer), /6,3/);
});
ok('№ 257: банки краски → 6', () => {
  const s = solveTask('Складское помещение имеет длину 6 м, ширину 5 м, высоту 3 м. Сколько банок краски понадобится для покраски стен, если одной банки хватает на 12 м2?');
  assert.equal(s.ok, true); assert.match(String(s.answer), /6/);
});
ok('№ 175: течение → 20 км/ч', () => {
  const s = solveTask('За 9 ч по течению реки теплоход проходит тот же путь, что за 11 ч против течения. Найдите собственную скорость теплохода, если скорость течения 2 км/ч.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /20/);
});
ok('№ 374: скорость звука при −35 °C → 310 м/с', () => {
  const s = solveTask('Найдите, с какой скоростью распространяется звук в зимний день с температурой −35 °C.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /310/);
});
ok('проценты: 15% от 240 → 36', () => {
  const s = solveTask('Найдите 15% от числа 240.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /36/);
});
ok('скидка 25% от 2400 → 1800', () => {
  const s = solveTask('Товар стоил 2400 рублей. Цену снизили на 25%. Сколько теперь стоит товар?');
  assert.equal(s.ok, true); assert.match(String(s.answer), /1800/);
});
ok('уравнение 5(x−10)=2x+10 → x=20', () => {
  const s = solveTask('Решите уравнение 5(x − 10) = 2x + 10.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /20/);
});
ok('разложение 49x²−16', () => {
  const s = solveTask('Разложите на множители: 49x² − 16.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /7x/);
});
ok('раскрытие (2x+3)²', () => {
  const s = solveTask('Раскройте скобки и упростите: (2x + 3)^2.');
  assert.equal(s.ok, true); assert.match(String(s.answer), /12x/);
});
ok('промежуток [−2; 5) с рисунком', () => {
  const s = solveTask('Изобразите на координатной прямой числовой промежуток [−2; 5) и задайте его неравенством.');
  assert.equal(s.ok, true); assert.ok(s.draw?.includes('<svg'));
});
ok('навстречу: t = 280/(60+80) = 2 ч', () => {
  const s = solveTask('Из пунктов A и B, расстояние между которыми 280 км, вышли навстречу друг другу два автомобиля со скоростями 60 км/ч и 80 км/ч. Через сколько часов они встретятся?');
  assert.equal(s.ok, true); assert.match(String(s.answer), /2/);
});
ok('№ 555: радиус ×3 ⇒ площадь ×9', () => {
  const s = solveTask('Площадь круга вычисляется по формуле S = πr². Как изменится площадь круга, если его радиус увеличить в 3 раза?');
  assert.equal(s.ok, true); assert.match(String(s.answer), /9/);
});
ok('задача не из учебника: 18 км/ч · 2,5 ч = 45 км', () => {
  const s = solveTask('Велосипедист ехал 2,5 часа со скоростью 18 км/ч. Какое расстояние он проехал?');
  assert.equal(s.ok, true); assert.match(String(s.answer), /45/);
});
ok('«а что если другое число» — варианты есть', () => {
  const s = solveTask('Найдите 15% от числа 240.');
  assert.ok(s.whatIf.length >= 2, 'нет вариантов');
  assert.ok(s.candidates.length >= 1, 'нет похожих шаблонов');
  assert.ok(s.related.length >= 1, 'нет связанных формул');
});
ok('«а что если» пересчитывает скорость при другом s', () => {
  const s = solveTask('Автомобиль проехал 390 км за 6,5 ч. Найдите его среднюю скорость.');
  const v = s.whatIf.find((w) => w.key === 's');
  assert.ok(v, 'нет варианта по s');
  const r = recomputeWith(s, { s: 780 });
  assert.match(String(r.answer), /120/);
});
ok('пересчёт с другим числом', () => {
  const s = solveTask('Найдите 15% от числа 240.');
  const r = recomputeWith(s, { b: 300 });
  assert.match(String(r.answer), /45/);
});
ok('похожие шаблоны ранжируются (пример с путаницей шаблонов)', () => {
  const s = solveTask('За 9 ч по течению реки теплоход проходит тот же путь, что за 11 ч против течения. Найдите собственную скорость теплохода, если скорость течения 2 км/ч.');
  assert.ok(s.candidates.length >= 1, 'нет кандидатов');
  assert.ok(s.candidates.every((c) => typeof c.score === 'number'));
});
ok('все примеры дают осмысленный ответ', () => {
  for (const ex of TASK_EXAMPLES) {
    const s = solveTask(ex.text);
    assert.equal(s.ok, true, `${ex.label}: не распознано`);
    assert.ok(String(s.answer).length > 0, `${ex.label}: пустой ответ`);
    assert.ok(s.steps.length > 0, `${ex.label}: нет решения`);
  }
});
// --- задачи НЕ из учебника: те же шаблоны должны срабатывать ---
const OUTSIDE = [
  ['Велосипедист ехал 2,5 часа со скоростью 18 км/ч. Какое расстояние он проехал?', /45\s*км/],
  ['Поезд шёл 3 ч со скоростью 80 км/ч. Какой путь он прошёл?', /240\s*км/],
  ['В классе 28 учеников, 3/7 из них девочки. Сколько девочек в классе?', /^12$/],
  ['В книге 320 страниц. Мальчик прочитал 5/8 книги. Сколько страниц он прочитал?', /^200$/],
  ['Найдите 2/9 от числа 630.', /^140$/],
  ['Половина учеников класса — девочки. В классе 26 человек. Сколько девочек?', /^13$/],
  ['Товар стоил 1800 рублей. Цену снизили на 30%. Сколько теперь стоит товар?', /1260/],
  ['Найдите 12% от 1500.', /^180$/],
  ['Бригада делает 24 детали в час. За сколько часов она сделает 168 деталей?', /^7/],
  // 60 км / 3 ч = 20 км/ч по течению; собственная = 20 − 4 = 16 км/ч
  ['Катер по течению за 3 ч прошёл 60 км. Скорость течения 4 км/ч. Найдите собственную скорость.', /^16\s*км\/ч$/],
  ['Теплоход против течения за 4 ч прошёл 80 км. Скорость течения 3 км/ч. Найдите собственную скорость.', /^23\s*км\/ч$/],
  ['Два велосипедиста выехали навстречу друг другу из пунктов, расстояние 45 км, скорости 12 и 8 км/ч. Через сколько часов встретятся?', /2,25/],
  ['Длина прямоугольника 9,5 м, ширина 4 м. Найдите площадь.', /38\s*м²/],
  ['Найдите периметр квадрата со стороной 6,5 см.', /26\s*см/],
  ['Аквариум имеет длину 40 см, ширину 20 см и высоту 30 см. Найдите объём.', /24\s*000|24000|24 000/],
  ['Решите систему x + y = 10, x − y = 4.', /\(7; 3\)/],
  ['Решите систему уравнений 2x + 3y = 12; x - y = 1', /\(3; 2\)/],
  ['Решите уравнение 3x − 7 = 20.', /x = 9/],
  ['Разложите на множители x² − 64.', /x − 8.*x \+ 8|x\^2 − 64/],
];
ok('задачи не из учебника решаются теми же шаблонами', () => {
  for (const [text, re] of OUTSIDE) {
    const s = solveTask(text);
    assert.equal(s.ok, true, `не распознано: ${text}`);
    assert.match(String(s.answer), re, `неверный ответ на «${text}»: ${s.answer}`);
    assert.ok(s.steps.length > 0, `нет шагов: ${text}`);
  }
});

ok('похожие шаблоны различаются: скорость против дроби', () => {
  const speed = solveTask('Велосипедист ехал 2,5 часа со скоростью 18 км/ч. Какое расстояние он проехал?');
  const frac = solveTask('В классе 28 учеников, 3/7 из них девочки. Сколько девочек в классе?');
  assert.ok(!/дроб/i.test(speed.pattern || ''), 'скорость спутана с дробью');
  assert.ok(/дроб/i.test(frac.pattern || ''), 'дробь спутана со скоростью');
});

// --- остатки по нескольким модулям ---
const REMAINDERS = [
  [[3, 1], [5, 2], [7, 3], 52],
  [[4, 3], [6, 5], null, 11],
  [[2, 1], [3, 2], [5, 4], null, 29],
  [[7, 5], [9, 2], null, null, 47],
  [[6, 4], [8, 6], [9, 7], null, null, 70],
];
ok('остатки: находит наименьшее число по нескольким условиям', () => {
  const texts = [
    'Найдите наименьшее натуральное число, которое при делении на 3 даёт остаток 1, при делении на 5 — остаток 2, а при делении на 7 — остаток 3.',
    'Найдите наименьшее натуральное число, которое при делении на 4 даёт остаток 3, а при делении на 6 — остаток 5.',
    'Найдите наименьшее натуральное число, которое при делении на 2 даёт остаток 1, при делении на 3 — остаток 2, при делении на 5 — остаток 4.',
  ];
  const expected = [52, 11, 29];
  texts.forEach((t, i) => {
    const s = solveTask(t);
    assert.equal(s.ok, true, `не распознано: ${t}`);
    assert.equal(String(s.answer), String(expected[i]), `неверный ответ на «${t}»`);
    // независимая проверка остатков
    const n = Number(s.answer);
    for (const m of t.matchAll(/на (\d+)[^.;]*?остат(?:ок|ке|ком)\s*(?:—|-|=|:)?\s*(\d+)/g)) {
      assert.equal(n % Number(m[1]), Number(m[2]), `${n} не даёт остаток ${m[2]} при делении на ${m[1]}`);
    }
  });
});

ok('остатки: есть проверка ответа и несколько способов', () => {
  const s = solveTask('Найдите наименьшее натуральное число, которое при делении на 3 даёт остаток 1, при делении на 5 — остаток 2, а при делении на 7 — остаток 3.');
  assert.equal(s.checks.length, 3, 'нет проверок по каждому условию');
  assert.ok(s.checks.every((c) => c.ok), 'проверка не сошлась');
  assert.ok(s.checks[0].detail.includes('3·17 + 1 = 52'), 'нет обратного действия в проверке');
  assert.ok(s.variants.length >= 3, 'мало способов решения');
  assert.ok(s.variants.every((v) => v.steps.length >= 2), 'способ без шагов');
  assert.ok(s.variants.some((v) => /перебор/i.test(v.title)), 'нет способа перебором');
  assert.ok(s.variants.some((v) => /НОК|период/.test(v.title)), 'нет способа через период');
  assert.ok(s.notes.some((n) => n.includes('105')), 'не показан период повторения');
});

ok('проверка ответа подстановкой в формулу работает', () => {
  const cases = [
    ['Автомобиль проехал 390 км за 6,5 ч. Найдите его среднюю скорость.', 60],
    ['Велосипедист ехал 2,5 часа со скоростью 18 км/ч. Какое расстояние он проехал?', 45],
    ['Найдите площадь прямоугольника со сторонами 12 см и 7,5 см.', 90],
    ['Найдите 15% от числа 240.', 36],
    ['Товар стоил 2400 рублей. Цену снизили на 25%. Сколько теперь стоит товар?', 1800],
    ['Станок изготавливает 45 деталей в час. Сколько деталей он сделает за 8 часов?', 360],
  ];
  for (const [text, expectedNum] of cases) {
    const s = solveTask(text);
    assert.ok(s.checks.length >= 1, `нет проверки: ${text}`);
    assert.ok(s.checks.every((c) => c.ok), `проверка не сошлась: ${text}`);
    assert.ok(String(s.answer).startsWith(String(expectedNum)) || String(s.answer).includes(String(expectedNum)),
      `ответ не тот: ${s.answer} (ждали ${expectedNum})`);
  }
});

ok('НОК и НОД считаются сами (без ввода g)', () => {
  const nok = solveFormula('N = a*b/g', 'N', { a: 12, b: 18 });
  near(nok.value, 36);
  const nod = solveFormula('G = a*b/N', 'G', { a: 12, b: 18 });
  near(nod.value, 6);
  near(solveFormula('N = a*b/g', 'N', { a: 15, b: 20 }).value, 60);
});

ok('неизвестная задача всё равно даёт подсказки', () => {
  const s = solveTask('Кот съел что-то вкусное и уснул на диване.');
  assert.ok(s.steps.length >= 2);
});

/* --------------------------------------------------- неравенства */
ok('неравенства: линейное, двойное, модуль, система, дроби', () => {
  const cases = [
    ['3x − 7 < 5x + 1', '(−4; +∞)'],
    ['−2 ⩽ 4 − 2x ⩽ 6', '[−1; 3]'],
    ['|x − 2| ⩽ 5', '[−3; 7]'],
    ['|x − 2| > 5', '(−∞; −3) ∪ (7; +∞)'],
    ['2x + 1 > 5; 3x − 4 ⩽ 8', '(2; 4]'],
    ['(x + 3)/2 ⩾ (2x − 1)/3', '(−∞; 11]'],
    ['5 > x', '(−∞; 5)'],
  ];
  for (const [input, expected] of cases) {
    const r = solveInequality(input);
    assert.ok(!r.error, `${input}: ${r.error}`);
    assert.equal(r.answerText, expected, `${input} → ${r.answerText}, ждали ${expected}`);
    assert.ok(r.steps.length >= 2, `нет шагов: ${input}`);
  }
});

ok('неравенства: пересечение, объединение и разность промежутков', () => {
  const and = solveInequality('A = [−3; 4), B = (1; 7]\nA ∩ B');
  assert.equal(and.answerText, '(1; 4)');
  const or = solveInequality('A = [−3; 4), B = (1; 7]\nA ∪ B');
  assert.equal(or.answerText, '[−3; 7]');
  const minus = solveInequality('M = (−∞; 3], N = [1; 6)\nM \\ N');
  assert.equal(minus.answerText, '(−∞; 1)');
});

ok('неравенства: понимает текст, скопированный из PDF «по буквам»', () => {
  const pdf = '5. Реши систему неравенств:\n{\n2\nx\n+\n1\n>\n5\n3\nx\n−\n4\n≤\n8';
  assert.equal(solveInequality(pdf).answerText, '(2; 4]');
  const one = '3\nx\n−\n7\n<\n5\nx\n+\n1';
  assert.equal(solveInequality(one).answerText, '(−4; +∞)');
  const mod = '∣\nx\n−\n2\n∣\n≤\n5';
  assert.equal(solveInequality(mod).answerText, '[−3; 7]');
});

ok('неравенства: вырожденные случаи дают понятный ответ', () => {
  assert.equal(solveInequality('2x + 1 > 2x + 5').kind, 'none');
  assert.equal(solveInequality('2x + 1 < 2x + 5').kind, 'any');
  const bad = solveInequality('просто текст');
  assert.ok(bad.error, 'должна быть ошибка');
});

ok('столбик: сложение, вычитание и умножение считаются верно', () => {
  const cases = [[1234, 876, '+', 2110], [500, 137, '-', 363], [47, 36, '*', 1692], [12.5, 4, '*', 50]];
  for (const [a, b, op, expected] of cases) {
    const r = longArithmetic(a, b, op);
    assert.ok(r, `${a} ${op} ${b}: не собралось`);
    near(r.value, expected);
    assert.ok(r.lines.length >= 4, `${a} ${op} ${b}: мало строк`);
  }
});

console.log(`\nПройдено: ${passed} проверок\n`);
