/* Двухэтапная проверка типа текстовой задачи: маркер → условия и ветвь формулы. */
const RULES = [
  { id: 'motion', label: 'Движение', marks: /скорост|км\s*\/\s*ч|навстречу|догоня|прош[её]л.*час/i },
  { id: 'price', label: 'Цена и стоимость', marks: /цен[ауы]|стоимост|количеств.*руб|скидк|товар/i },
  { id: 'work', label: 'Работа', marks: /производительност|вместе.*за|работ[ае].*час|детал.*час/i },
  { id: 'mixture', label: 'Смеси', marks: /концентрац|раствор|смешал|процентн.*смес/i },
  { id: 'probability', label: 'Вероятность', marks: /вероятност|случайн|исход|благоприят/i },
  { id: 'combinatorics', label: 'Комбинаторика', marks: /сколькими способ|сколько вариантов|выбрать.*из|перестанов/i },
  { id: 'percent', label: 'Проценты', marks: /процент|скидк|налог|наценк|%/i },
  { id: 'addition', label: 'Сложение', marks: /всего|вместе|сумм|прибавил|купил[и]? ещё|добавил/i },
  { id: 'subtraction', label: 'Вычитание', marks: /остал|разниц|на сколько больше|на сколько меньше|убрал|продал/i },
  { id: 'multiplication', label: 'Умножение', marks: /в каждом|по \d|произведен|в \d+ раз(а)? больше/i },
  { id: 'division', label: 'Деление', marks: /поровну|разделил|во сколько раз меньше|частное/i },
  { id: 'equation', label: 'Уравнение', marks: /уравнен|решите|найдите корн/i },
  { id: 'system', label: 'Система уравнений', marks: /систем[аыу]|две неизвестн/i },
  { id: 'function', label: 'Функция и график', marks: /функци|график|y\s*=|значени[ея].*x/i },
  { id: 'geometry', label: 'Геометрия', marks: /треугольник|катет|гипотенуз|площад|периметр|объ[её]м|радиус/i },
  { id: 'progression', label: 'Прогрессия', marks: /прогресси|a₁|b₁|разност[ьи] прогрессии|знаменател[ьи].*прогрессии/i },
  { id: 'trig', label: 'Тригонометрия', marks: /sin|cos|tg|тангенс|синус|косинус/i },
  { id: 'log', label: 'Логарифмы и степени', marks: /логарифм|log_|\d\s*\^\s*x|показател/i },
  { id: 'calculus', label: 'Производная или интеграл', marks: /производн|первообразн|интеграл|f\s*\(x\)\s*=/i },
];
const nums = (s) => [...String(s).matchAll(/(?<![A-Za-zА-Яа-я])[-+]?\d+(?:[.,]\d+)?/g)].map(m => Number(m[0].replace(',', '.')));

export function classifyTask(text) {
  const source = String(text || '').toLowerCase().replace(/ё/g, 'е');
  const rule = RULES.find(r => r.marks.test(source));
  if (!rule) return { ok: false, stage1: 'Не найден тип задачи', stage2: 'Добавьте ключевое слово или явный вопрос.' };
  const n = nums(source), hasQuestion = /\?|найти|найдите|сколько|чему рав|вычисл|решите|определите/.test(source);
  let branch = '', checks = [];
  const pass = (ok, text) => checks.push({ ok, text });
  pass(true, `Этап 1: обнаружены маркеры темы «${rule.label}».`);
  if (['addition','subtraction','multiplication','division'].includes(rule.id)) {
    const enough = n.length >= 2; pass(enough, `Этап 2: чисел/величин для операции: ${n.length}${enough ? ' — достаточно' : ' — нужно не менее двух'}.`);
    if (rule.id === 'addition') branch = enough && /всего|сумм|вместе/.test(source) ? 'Найти итог: сложить величины.' : 'Проверить, спрашивается ли общий итог.';
    if (rule.id === 'subtraction') branch = /остал|убрал|продал|уменьш/.test(source) ? 'Начальное количество − уменьшение.' : 'Сравнение: разность большей и меньшей величин.';
    if (rule.id === 'multiplication') branch = /во сколько раз/.test(source) ? 'Отношение величин (деление), не произведение.' : 'Повторяющиеся равные группы: множитель × число групп.';
    if (rule.id === 'division') branch = 'Общее количество ÷ число равных частей/делитель.';
  } else if (rule.id === 'motion') {
    const enough = n.length >= 2; pass(enough, `Проверка: указано чисел ${n.length}; нужны любые две из скорости, времени, расстояния.`);
    branch = /навстречу/.test(source) ? 'Навстречу: скорости складываются.' : /догоня/.test(source) ? 'Догоняет: относительная скорость — разность скоростей.' : 'Использовать S = vt; проверить, какая величина неизвестна.';
  } else if (rule.id === 'percent' || rule.id === 'price') {
    const enough = n.length >= 2; pass(enough, `Проверка: база и процент/цена и количество — чисел ${n.length}.`);
    branch = /скидк|снизил|уменьш/.test(source) ? 'Скидка: новая цена = база × (1 − p/100).' : /налог|наценк|увелич/.test(source) ? 'Надбавка: новое значение = база × (1 + p/100).' : 'Процент от базы: база × p/100.';
  } else if (rule.id === 'work') {
    pass(n.length >= 2, `Проверка: чисел производительности/времени ${n.length}.`);
    branch = /вместе/.test(source) ? 'Совместная скорость работы: 1/t₁ + 1/t₂.' : 'Работа = производительность × время.';
  } else if (rule.id === 'mixture') {
    pass(n.length >= 2, `Проверка: найдены массы/доли ${n.length}; нужна масса и концентрация хотя бы для компонентов.`);
    branch = 'Сохранение вещества: сумма масс растворённого вещества делится на общую массу.';
  } else if (rule.id === 'probability') {
    const favorable = /благоприят|выпад|вероятност.*\d|из\s+\d/.test(source); pass(favorable, 'Проверка: ищем благоприятные исходы и общее число равновозможных исходов.');
    branch = 'P = число благоприятных исходов / число всех исходов.';
  } else if (rule.id === 'combinatorics') {
    pass(n.length >= 2, `Проверка: для выбора/вариантов нужно задать параметры; найдено чисел ${n.length}.`);
    branch = /выбрать/.test(source) ? 'Сочетания: C(n,k) = n!/(k!(n−k)!).' : 'Последовательные независимые выборы: перемножить число вариантов.';
  } else {
    pass(hasQuestion, 'Этап 2: проверено наличие запроса на вычисление/решение.');
    branch = 'Подтип отмечен; далее применяется профильный алгоритмический решатель и проверка ответа.';
  }
  return { ok: true, id: rule.id, label: rule.label, stage1: `Маркер: ${rule.label}`, stage2: branch, checks, numbers: n };
}

export function taskRuleCatalog() { return RULES.map(({id,label}) => ({id,label})); }
