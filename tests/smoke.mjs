/* Автотесты ядра: ответы сверены с разделом «Ответы» учебника. */
import assert from 'node:assert/strict';
import {
  evaluate, solveEquation, solveSystem, expandExpression, factorExpression,
  checkIdentity, solveFormula, fmt, gcd, lcm, factorizationString, evaluateWithSteps, solveQuadratic, solveSystemByMethod,
} from '../js/mathcore.js';
import { FORMULAS, STATS, formulaSearch } from '../js/formulas.js';
import { parseInterval, intersect, union, numberLineSVG, describeInterval } from '../js/intervals.js';
import { solveInequality, longArithmetic, divideAngle } from '../js/inequalities.js';
import { convertInfoSize, convertBase, solveItTask, parseInfoSize, powerOfTwo } from '../js/it.js';
import { solveGeoTask, triangleArea, rightTriangle, triangleHeron, adjacentAngles } from '../js/geo.js';

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
ok('AST пошагового вычисления учитывает скобки и приоритет', () => {
  const r = evaluateWithSteps('2*(3+4)^2'); near(r.value, 98); assert.equal(r.steps.length, 3); assert.match(r.steps[0], /3 \+ 4/);
});
ok('квадратное уравнение решается через дискриминант и проверяется Виетом', () => {
  const r = solveQuadratic(1, -5, 6); assert.deepEqual(r.roots, [2, 3]); assert.ok(r.steps.some(s => s.includes('Виету')));
});
ok('системы имеют разбор по подстановке/сложению/графически', () => {
  for (const method of ['substitution', 'elimination', 'graphical']) {
    const r = solveSystemByMethod(['x+y=5', 'x-y=1'], method); near(r.values.x, 3); near(r.values.y, 2); assert.ok(r.steps.length >= 3);
  }
});
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
ok('поиск по учебнику и старшим классам понимает родственные формулировки', () => {
  assert.ok(formulaSearch('квадрат суммы')[0]?.id === 'sq_sum');
  assert.ok(formulaSearch('полуинтервал').length >= 2);
  assert.ok(formulaSearch('Пифагора').some(f => f.id === 'pythagoras'));
  assert.ok(formulaSearch('арифметической прогрессии').some(f => f.id === 'arith_nth'));
  assert.ok(formulaSearch('производную').some(f => f.id === 'derivative_power'));
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

ok('деление уголком: 768 ÷ 24 = 32 и остаток', () => {
  const r = divideAngle(768, 24);
  assert.equal(r.quotient, '32');
  assert.equal(r.remainder, 0);
  assert.ok(r.lines.length >= 5, 'мало строк в записи');
  assert.ok(r.lines[0].includes('768'), r.lines[0]);

  const rem = divideAngle(100, 7);
  assert.equal(rem.quotient, '14');
  assert.equal(rem.remainder, 2);
});

ok('квадратические и логарифмические неравенства с ОДЗ решаются', () => {
  const q = solveInequality('x² − 5x + 6 < 0'); assert.equal(q.answerText, '(2; 3)');
  const l = solveInequality('log_2(x) < 3'); assert.equal(l.answerText, '(0; 8)'); assert.ok(l.steps.some(s => s.includes('ОДЗ')));
});
ok('информатика: единицы, N = K^i, I = K·i, время, системы счисления', () => {
  near(convertInfoSize(2, 'GB').find((x) => x.unit === 'МБ').value, 2048);
  near(convertInfoSize(2048, 'bit').find((x) => x.unit === 'Б' || x.unit === 'байт').value, 256);
  assert.equal(powerOfTwo(32).i, 5);
  assert.equal(convertBase('1011', 2, 10).result, '11');
  assert.equal(convertBase('45', 10, 2).result, '101101');
  assert.equal(solveItTask('Сколько бит нужно для кодирования 32 цветов?').answer, '5 бит');
  assert.equal(solveItTask('Файл 4 МБ скачивается со скоростью 512 КБ/с. Сколько секунд?').answer, '8 с');
  assert.match(solveItTask('Переведите 2 ГБ в МБ').answer, /2048 МБ/);
  const card = solveItTask('Сколько бит нужно для кодирования 32 цветов?');
  assert.ok(card.given.length && card.find.length && card.steps.length);
});
ok('геометрия: площади, Пифагор, Герон, углы', () => {
  assert.match(triangleArea(8, 5).answer, /20 см²/);
  assert.match(rightTriangle(3, 4).answer, /c = 5 см/);
  assert.match(triangleHeron(5, 6, 7).answer, /14,6969 см²/);
  assert.match(adjacentAngles(40).answer, /140°/);
  assert.match(solveGeoTask('Найдите площадь круга радиуса 5').answer, /78,5398 см²/);
  assert.match(solveGeoTask('В треугольнике два угла 50 и 60. Найдите третий').answer, /70°/);
  const bad = solveGeoTask('Треугольник со сторонами 1, 2, 10. Найдите периметр');
  assert.ok(bad.error);
});
console.log('\nТРЕУГОЛЬНИК');
{
  const tr = await import('../js/triangle.js');

  ok('треугольник 3-4-5 — прямоугольный, S = 6, P = 12', () => {
    const t = tr.triangleBySides(3, 4, 5);
    assert.ok(t.ok);
    near(t.angles.gamma, 90, 1e-6);
    near(t.area, 6);
    near(t.perimeter, 12);
    assert.match(t.kind, /прямоугольный/);
  });
  ok('треугольник 1-2-10 не существует — честная ошибка', () => {
    const t = tr.triangleBySides(1, 2, 10);
    assert.equal(t.ok, false);
    assert.match(t.error, /не существует/);
  });
  ok('треугольник по двум сторонам и углу (5, 4, 90°) совпадает с 3-4-5', () => {
    const t = tr.triangleBySAS(5, 4, 90);
    assert.ok(t.ok);
    near(t.area, 10); // ½·5·4
    near(t.sides.a, Math.sqrt(41), 1e-9); // BC
  });
  ok('треугольник по стороне и двум углам: углы 50°/60°/70°', () => {
    const t = tr.triangleByASA(6, 50, 60);
    assert.ok(t.ok);
    near(t.angles.alpha, 50, 1e-6);
    near(t.angles.beta, 60, 1e-6);
    near(t.angles.gamma, 70, 1e-6);
  });
  ok('треугольник: сумма двух углов ≥ 180° — отказ', () => {
    const t = tr.triangleByASA(6, 120, 80);
    assert.equal(t.ok, false);
  });
  ok('равнобедренный и равносторонний распознаются по сторонам', () => {
    assert.match(tr.triangleBySides(5, 5, 6).kind, /равнобедренный/);
    assert.match(tr.triangleBySides(6, 6, 6).kind, /равносторонний/);
  });
  ok('SVG-чертёж генерируется и содержит стороны и вершины', () => {
    const t = tr.triangleBySides(3, 4, 5);
    const svg = tr.triangleSVG(t);
    assert.match(svg, /^<svg/);
    assert.match(svg, />A</);
    assert.match(svg, /a=/);
  });
}

console.log(`\nПройдено: ${passed} проверок\n`);

