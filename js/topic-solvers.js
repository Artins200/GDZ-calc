/* Deterministic algorithmic solvers for common grades 7–11 exercises. */
import { evaluate, fmt, solveQuadratic, preprocess } from './mathcore.js';
import { detectQuestionKind } from './verifier.js';
const tidy = s => String(s).replace(/[−–—]/g,'-').replace(/,/g,'.').replace(/²/g,'^2').replace(/³/g,'^3').replace(/·/g,'*').replace(/×/g,'*');
const nums = s => [...String(s).matchAll(/[-+]?\d+(?:[.,]\d+)?/g)].map(m=>Number(m[0].replace(',','.')));
const result = (answer, steps, topic, checks=[]) => ({ok:true,answer:String(answer),steps,checks,topic,inputs:{},notes:[],related:[]});
const choose = (n,k) => { if(k<0||n<k||n<0) throw Error('Для сочетаний нужно 0 ≤ k ≤ n'); k=Math.min(k,n-k);let r=1;for(let i=1;i<=k;i++)r=r*(n-k+i)/i;return Math.round(r);};
const fact = n => {let r=1;for(let i=2;i<=n;i++)r*=i;return r;};
function polyCoefficients(eq) { const [l,r] = tidy(eq).split('='); if(!r) return null; const f=x=>evaluate(`(${l})-(${r})`,{x});const c=f(0),a=(f(1)+f(-1)-2*c)/2,b=(f(1)-f(-1))/2;if(Math.abs(a)<1e-9||Math.abs(f(2)-(4*a+2*b+c))>1e-6)return null;return {a,b,c}; }
function equationTask(s) {
  const m=s.match(/(?:решите|найдите корни)[^=]*?((?:x|\d)[^=.!?]*=[^=.!?]+)/i); if(!m)return null;
  const eq=tidy(m[1]); const q=polyCoefficients(eq); if(!q)return null;
  const r=solveQuadratic(q.a,q.b,q.c);return result(r.roots.length?r.roots.map(fmt).join('; '):'действительных корней нет',r.steps,'Квадратное уравнение');
}

/* ------------------------------------------------------------------------
 * Задачи «в несколько действий»: количество меняется по дням/этапам.
 * «В первый день 30, во второй — в 3 раза больше, в третий — в 2 раза
 * меньше». Каждое следующее число считается от предыдущего, а не от
 * первого, и «на N раз меньше» понимаем как «в N раз меньше».
 * ---------------------------------------------------------------------- */
const DAY_MARK = /(?:перв|втор|трет|четверт|пят|шест|седьм|восьм|девят|десят)[а-яё]*\s*(?:день|дня|дне|дню|днем|сутк)|\d+\s*(?:-?й\s*)?(?:день|дня|дне|дню|сутк)|(?:этап|смен|недел|тур)/i;

/* ------------------------------------------------------------------------
 * Разбор условия по дням с ролями: «дети» и «взрослые» считаются отдельно.
 * «в первый день 120 детей и 20 взрослых, во второй пришло 50 детей,
 * в третий на 20 детей меньше, но в 2 раза больше взрослых» — каждое
 * изменение относится к своей роли и считается от предыдущего дня, а в
 * конце складываем дни (если спрашивают «сколько всего»).
 * ---------------------------------------------------------------------- */
const ROLE_RE = {
  children: /(дет|ребен|ребят|школьник|ученик)/i,
  adults: /(взросл|родител|учител|воспит)/i,
};

const NUM_WORDS = { один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };

function readNumber(str) {
  const digits = str.match(/-?\d+(?:[.,]\d+)?/);
  if (digits) return Number(digits[0].replace(',', '.'));
  for (const [w, v] of Object.entries(NUM_WORDS)) if (new RegExp(`\\b${w}\\b`, 'i').test(str)) return v;
  return null;
}

const ROLE_SRC = {
  children: '(?:дет|ребен|ребят|школьник|ученик)',
  adults: '(?:взросл|родител|учител|воспит)',
};

/** Все упоминания ролей с позициями: [{role, index, end}]. */
function roleMentions(text) {
  const out = [];
  for (const role of ['children', 'adults']) {
    const re = new RegExp(ROLE_SRC[role] + '[а-яё]*', 'gi');
    let m;
    while ((m = re.exec(text)) !== null) out.push({ role, index: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Изменение, привязанное к ближайшей роли: {role, kind, value, dir, from, to}. */
function findChanges(part) {
  const changes = [];
  const mentions = roleMentions(part);
  const assignRole = (from, to) => {
    let best = null, bestDist = Infinity;
    for (const m of mentions) {
      const d = Math.min(Math.abs(m.index - to), Math.abs(m.index - from), m.index >= from && m.index <= to ? 0 : Math.min(Math.abs(m.index - from), Math.abs(m.index - to)));
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return best ? best.role : null;
  };
  const push = (kind, value, dir, from, to) => {
    const role = assignRole(from, to);
    if (!role || !Number.isFinite(value)) return;
    changes.push({ role, kind, value, dir, from, to });
  };

  // «в 2 раза больше», «вдвое меньше» — только рядом со своей ролью.
  for (const m of part.matchAll(/в\s*(\d+(?:[.,]\d+)?)\s*раз[а]?\s*(больше|меньше|дороже|дешевле)/gi)) {
    push('mul', Number(m[1].replace(',', '.')), /меньше|дешевле/.test(m[2]) ? -1 : 1, m.index, m.index + m[0].length);
  }
  for (const m of part.matchAll(/(вдвое|втрое|вчетверо)\s*(больше|меньше)/gi)) {
    const k = { вдвое: 2, втрое: 3, вчетверо: 4 }[m[1].toLowerCase()] || 2;
    push('mul', k, /меньше/.test(m[2]) ? -1 : 1, m.index, m.index + m[0].length);
  }
  // «на 20 детей стало меньше» — прибавление/вычитание, но не «на 2 раза меньше».
  for (const m of part.matchAll(/на\s*(\d+(?:[.,]\d+)?)\s*(?!раз[а]?)([а-яё]*(?:\s+[а-яё]+){0,3})/gi)) {
    const tail = m[2] || '';
    const dm = tail.match(/(больше|меньше)/i) || part.slice(m.index, m.index + 40).match(/(больше|меньше)/i);
    if (!dm) continue;
    if (/раз[а]?\s*$/.test(tail)) continue;
    const before = part.slice(Math.max(0, m.index - 12), m.index);
    if (/в\s*\d*\s*$/.test(before)) continue; // «в 2 раза» уже обработано
    push('add', Number(m[1].replace(',', '.')), /меньше/.test(dm[1]) ? -1 : 1, m.index, m.index + m[0].length + 16);
  }
  // «пришло ещё 50 детей», «уехало 20 взрослых».
  for (const m of part.matchAll(/(пришл|прибыл|приехал|привез|прибав|добав|прибыл|увелич|уехал|ушл|увез|убрал|продал|отдал|уменьш|израсход|потрат|выбыл)[а-яё]*(?:\s+ещ[её])?\s+(?:на\s+)?(\d+(?:[.,]\d+)?)/gi)) {
    const negative = /уехал|ушл|увез|убрал|прода|отда|уменьш|израсход|потрат|выбыл/.test(m[1]);
    push('add', Number(m[2].replace(',', '.')), negative ? -1 : 1, m.index, m.index + m[0].length + 16);
  }
  return changes;
}

function splitDays(text) {
  const s = text.toLowerCase();
  const marks = [...s.matchAll(/(?:перв|втор|трет|четверт|пят|шест|седьм)[а-яё]*\s*(?:день|дня|дне)|(\d+)\s*(?:-?й\s*)?(?:день|дня|дне)/g)];
  if (!marks.length) return null;
  const parts = [];
  for (let i = 0; i < marks.length; i++) {
    const startPos = marks[i].index;
    const endPos = i + 1 < marks.length ? marks[i + 1].index : s.length;
    parts.push(s.slice(startPos, endPos));
  }
  // Текст до первого упоминания дня — это тоже данные первого дня.
  if (marks[0].index > 0) parts[0] = s.slice(0, marks[0].index) + ' ' + parts[0];
  return parts;
}

/** Абсолютные значения роли: «120 детей», «взрослых 20». */
function absoluteForRole(part, role) {
  const src = ROLE_SRC[role];
  const before = part.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:[а-яё]+\\s+){0,2}?${src}`, 'i'));
  if (before) return Number(before[1].replace(',', '.'));
  const after = part.match(new RegExp(`${src}[а-яё]*[^\\d]{0,12}(\\d+(?:[.,]\\d+)?)`, 'i'));
  if (after) return Number(after[1].replace(',', '.'));
  return undefined;
}

export function solveMultiDayQuantity(raw) {
  const src = String(raw || '').replace(/ё/gi, 'е');
  const s = src.toLowerCase();
  if (!DAY_MARK.test(s)) return null;

  const dayParts = splitDays(s);
  if (!dayParts || dayParts.length < 1) return null;

  const hasChildren = ROLE_RE.children.test(s);
  const hasAdults = ROLE_RE.adults.test(s);
  if (!hasChildren && !hasAdults) return null;

  const roleNames = { children: 'дети', adults: 'взрослые' };
  const roles = hasAdults ? ['children', 'adults'] : ['children'];
  const days = [];
  const traceSteps = [];

  dayParts.forEach((part, i) => {
    const entry = { index: i + 1, changes: {}, children: 0, adults: 0, undo: null };
    const changes = findChanges(part);
    for (const role of roles) {
      const ch = changes.find((c) => c.role === role);
      if (ch) entry.changes[role] = ch;
      if (!ch) {
        const abs = absoluteForRole(part, role);
        if (abs !== undefined) entry[role + 'Abs'] = abs;
      }
    }
    days.push(entry);
  });

  // Первый день: абсолютные значения; дальнейшие — изменения от предыдущего дня.
  const first = days[0];
  if (first.childrenAbs === undefined && first.adultsAbs === undefined) {
    // «на сво ушло 120 детей и 20 взрослых» без слова «день» в первом куске
    const pre = s.slice(0, dayParts.length ? dayParts[0].length : 0);
    const nums = [...pre.matchAll(/(\d+(?:[.,]\d+)?)\s*(дет|ребен|взросл)/gi)];
    for (const m of nums) {
      const v = Number(m[1].replace(',', '.'));
      if (/дет|ребен/i.test(m[2])) first.childrenAbs = v;
      else first.adultsAbs = v;
    }
  }

  let children = first.childrenAbs ?? 0;
  let adults = first.adultsAbs ?? 0;

  // Если первый день содержит изменение, а не абсолют — это ошибка структуры.
  if (first.changes.children || first.changes.adults) {
    // всё равно применяем: дети уже заданы абсолютом
  }
  days[0].children = children;
  days[0].adults = adults;
  traceSteps.push(`День 1: дети ${fmt(children)}${hasAdults ? `, взрослые ${fmt(adults)}` : ''} — исходные данные.`);

  for (let i = 1; i < days.length; i++) {
    const d = days[i];
    const prevChildren = children;
    const prevAdults = adults;
    for (const role of roles) {
      const ch = d.changes[role];
      if (!ch) {
        // без изменений — роль остаётся как была
        if (role === 'children') d.childrenAbs ??= prevChildren;
        else d.adultsAbs ??= prevAdults;
        continue;
      }
      const base = role === 'children' ? prevChildren : prevAdults;
      let next;
      if (d[role + 'Abs'] !== undefined && !ch) next = d[role + 'Abs'];
      else if (ch.kind === 'mul') next = ch.dir > 0 ? base * ch.value : base / ch.value;
      else next = ch.dir > 0 ? base + ch.value : base - ch.value;
      if (role === 'children') d.childrenAbs = next; else d.adultsAbs = next;
    }
    children = d.childrenAbs ?? prevChildren;
    adults = d.adultsAbs ?? prevAdults;
    d.children = children;
    d.adults = adults;
    d.undo = { children: prevChildren, adults: prevAdults };
    const parts = [];
    for (const role of roles) {
      const ch = d.changes[role];
      const before = role === 'children' ? prevChildren : prevAdults;
      const after = role === 'children' ? children : adults;
      if (!ch) { parts.push(`${roleNames[role]}: без изменений (${fmt(after)})`); continue; }
      const sign = ch.kind === 'mul' ? (ch.dir > 0 ? '·' : ':') : (ch.dir > 0 ? '+' : '−');
      const word = ch.kind === 'mul' ? `в ${fmt(ch.value)} раз${ch.value === 1 ? '' : 'а'} ${ch.dir > 0 ? 'больше' : 'меньше'}` : `на ${fmt(ch.value)} ${ch.dir > 0 ? 'больше' : 'меньше'}`;
      parts.push(`${roleNames[role]}: ${word} → ${fmt(before)} ${sign} ${fmt(ch.value)} = ${fmt(after)}`);
    }
    traceSteps.push(`День ${i + 1}: ${parts.join('; ')}.`);
  }

  const withTotals = days.map((d) => ({ ...d, childrenTotal: (d.children || 0) + (d.adults || 0) }));
  const totalPeople = withTotals.reduce((a, d) => a + d.childrenTotal, 0);
  const finalPeople = withTotals[withTotals.length - 1].childrenTotal;
  const totalChildren = withTotals.reduce((a, d) => a + d.children, 0);
  const totalAdults = hasAdults ? withTotals.reduce((a, d) => a + d.adults, 0) : 0;

  if (withTotals.some((d) => d.children < 0 || d.adults < 0)) return null;

  const asked = detectQuestionKind(s);
  const answerValue = asked === 'total' ? totalPeople : finalPeople;

  const steps = traceSteps.slice();
  if (hasAdults) {
    steps.push(`Итого по ролям за все дни: дети ${fmt(totalChildren)}, взрослые ${fmt(totalAdults)}.`);
  }
  if (asked === 'total') {
    steps.push(`Всего за все дни: ${withTotals.map((d) => `(${fmt(d.children)} + ${fmt(d.adults)})`).join(' + ')} = ${fmt(totalPeople)}.`);
    steps.push(`Ответ: ${fmt(totalPeople)} человек.`);
  } else {
    steps.push(`К концу последнего дня: ${fmt(finalPeople)} человек.`);
    steps.push(`Ответ: ${fmt(finalPeople)} человек.`);
  }

  return {
    ok: true,
    answer: `${fmt(answerValue)} человек`,
    steps,
    checks: [],
    topic: 'Задача в несколько действий',
    notes: ['Каждое изменение относится к своей роли: «детей» — к детям, «взрослых» — к взрослым.'],
    inputs: {},
    asked,
    trace: {
      days: withTotals,
      totalPeople,
      finalPeople,
      totalChildren,
      totalAdults,
      roles,
    },
  };
}
export function solveTopicTask(raw) {
 const s=String(raw||'').replace(/ё/gi,'е'); let m;
 // Pythagoras
 if(/прямоугольн.*треугольник/i.test(s)&&/гипотенуз|катет/i.test(s)) { const a=nums(s); if(a.length>=2){const hyp=/найдите гипотенуз/i.test(s), knownHyp=/гипотенуза\s*[-=]?\s*\d/i.test(s);let v,steps;if(hyp){v=Math.sqrt(a[0]**2+a[1]**2);steps=[`По теореме Пифагора: c² = a² + b².`,`c² = ${a[0]}² + ${a[1]}² = ${fmt(a[0]**2+a[1]**2)}.`,`c = √${fmt(a[0]**2+a[1]**2)} = ${fmt(v)}.`];}else if(knownHyp){const c=a[0],leg=a[1];v=Math.sqrt(c*c-leg*leg);steps=[`По теореме Пифагора: a² = c² − b².`,`a² = ${c}² − ${leg}² = ${fmt(c*c-leg*leg)}.`,`a = ${fmt(v)}.`];}else return null;return result(fmt(v),steps,'Теорема Пифагора');} }
 // x² polynomial equations (Vieta/discriminant), intentionally only explicit equation prompts
 if(/решите уравнение/i.test(s)&&/x\s*(?:²|\^\s*2)/i.test(s)){const r=equationTask(s);if(r)return r;}
 // rational a/x=b
 if((m=s.match(/(?:решите\s*)?(\d+)\s*\/\s*x\s*=\s*(\d+)/i))){const a=+m[1],b=+m[2];if(b) return result(fmt(a/b),[`ОДЗ: x ≠ 0.`,`Умножим обе части на x: ${a} = ${b}x.`,`x = ${a}/${b} = ${fmt(a/b)}.`],'Рациональное уравнение');}
 // Progressions (Unicode subscripts and _n notation).
 const decodeIndex = t => { const sub='₀₁₂₃₄₅₆₇₈₉'; const clean=String(t).replace(/^_/,''); return [...clean].every(ch=>sub.includes(ch)) ? Number([...clean].map(ch=>sub.indexOf(ch)).join('')) : Number(clean); };
 if(/арифметическ.*прогресс|a₁|a_1/i.test(s)) {
   const ma=s.match(/a(?:₁|_?1)\s*=\s*(-?\d+(?:[.,]\d+)?).*?d\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
   const target=[...s.matchAll(/(?:a|s)([₀₁₂₃₄₅₆₇₈₉]+|_?\d+)/gi)].at(-1);
   if(ma&&target){const a=+ma[1].replace(',','.'),d=+ma[2].replace(',','.'),n=decodeIndex(target[1]),sum=/s[₀₁₂₃₄₅₆₇₈₉]|найдите\s+s|сумм[ау]/i.test(s);if(n>0&&n<100000){const v=sum?n*(2*a+(n-1)*d)/2:a+(n-1)*d;return result(fmt(v),sum?[`Формула суммы: Sₙ = n(2a₁ + (n−1)d)/2.`,`S_${n} = ${n}(2·${a} + (${n}−1)·${d})/2 = ${fmt(v)}.`]:[`Формула n-го члена: aₙ = a₁ + (n−1)d.`,`a_${n} = ${a} + (${n}−1)·${d} = ${fmt(v)}.`],'Арифметическая прогрессия');}}
 }
 if(/геометрическ.*прогресс|b₁|b_1/i.test(s)) {
   const mg=s.match(/b(?:₁|_?1)\s*=\s*(-?\d+(?:[.,]\d+)?).*?q\s*=\s*(-?\d+(?:[.,]\d+)?)/i);
   const target=[...s.matchAll(/b([₀₁₂₃₄₅₆₇₈₉]+|_?\d+)/gi)].at(-1);
   if(mg&&target){const b=+mg[1].replace(',','.'),q=+mg[2].replace(',','.'),n=decodeIndex(target[1]);if(n>0&&n<10000){const v=b*q**(n-1);return result(fmt(v),[`Формула: bₙ = b₁·qⁿ⁻¹.`,`b_${n} = ${b}·${q}^(${n}−1) = ${fmt(v)}.`],'Геометрическая прогрессия');}}
 }
 // Combinations
 if((m=s.match(/(?:выбрать|сочетан\w*)\s+(\d+)\s+(?:из|предмет\w* из)\s+(\d+)|сколькими способами.*?(\d+).*?из\s+(\d+)/i))){const k=+(m[1]||m[3]),n=+(m[2]||m[4]);const v=choose(n,k);return result(v,[`Порядок выбора не важен — используем сочетания.`,`C(${n}, ${k}) = ${n}!/(${k}!·(${n}−${k})!) = ${v}.`],'Комбинаторика');}
 // probability: one die / urn / fair coins
 if(/вероятност|бросают кубик|бросают игральн/i.test(s)&&/кубик|кость/i.test(s)){const cnt=(s.match(/выпад[^\s]*\s+(\d+)/i)||[])[1];if(cnt){return result('1/6 = 0,1667',[`Всего равновозможных исходов: 6.`,`Благоприятный исход один: P = 1/6 ≈ 0,1667.`],'Вероятность');} }
 if((m=s.match(/(?:урне|мешке)\s+(\d+)\s+красн\w*\s+и\s+(\d+)\s+син\w*.*?вероятност\w*.*?красн/i))){const [r,b]=[+m[1],+m[2]],p=r/(r+b);return result(`${r}/${r+b} = ${fmt(p)}`,[`Всего шаров: ${r} + ${b} = ${r+b}.`,`P(красный) = благоприятные / все = ${r}/${r+b} = ${fmt(p)}.`],'Вероятность');}
 // power equation a^x = b
 if((m=s.match(/(\d+)\s*\^\s*x\s*=\s*(\d+)/i))){const a=+m[1],b=+m[2],x=Math.log(b)/Math.log(a);if(a>0&&a!==1&&Math.abs(x-Math.round(x))<1e-9)return result(fmt(x),[`Представим правую часть степенью ${a}: ${b} = ${a}^${fmt(x)}.`,`При одинаковых основаниях показатели равны: x = ${fmt(x)}.`],'Показательное уравнение');}
 // logarithm log_a(x)=c
 if((m=s.match(/log\s*_\s*(\d+)\s*\(\s*x\s*\)\s*=\s*(-?\d+)/i))){const a=+m[1],c=+m[2],x=a**c;if(a>0&&a!==1)return result(fmt(x),[`ОДЗ: x > 0.`,`По определению логарифма: log_${a}(x) = ${c} ⇔ x = ${a}^${c}.`,`x = ${fmt(x)}.`],'Логарифмическое уравнение');}
 // sine/cosine special angles
 if((m=s.match(/(sin|cos)\s*x\s*=\s*(-?1|0)/i))){const fn=m[1].toLowerCase(),v=+m[2],answer=fn==='sin'?(v===0?'x = πk':v===1?'x = π/2 + 2πk':'x = −π/2 + 2πk'):(v===0?'x = π/2 + πk':v===1?'x = 2πk':'x = π + 2πk');return result(answer,[`Используем табличные значения ${fn} на единичной окружности.`,`Записываем общий период решения: ${answer}, k ∈ ℤ.`],'Тригонометрическое уравнение');}
 // derivative / antiderivative of monomial
 if((m=s.match(/f\s*\(x\)\s*=\s*(-?\d*)\s*x\s*\^\s*(\d+).*?(производн|первообразн|f\s*\'\s*\(x\))/i))){const a=m[1]===''?1:m[1]==='-'?-1:+m[1],n=+m[2];if(/первообразн/.test(m[3]))return result(`${fmt(a)}x^${n+1}/${n+1} + C`,[`Используем правило ∫xⁿ dx = xⁿ⁺¹/(n+1) + C.`,`Умножаем коэффициент: F(x) = ${fmt(a)}x^${n+1}/${n+1} + C.`],'Первообразная');const v=a*n;return result(`${fmt(v)}x^${n-1}`,[`Правило степени: (xⁿ)' = n·xⁿ⁻¹.`,`f'(x) = ${a}·${n}x^${n-1} = ${fmt(v)}x^${n-1}.`],'Производная');}
 // Elementary arithmetic word problems: marker first, then check operand count and question branch.
 const values=nums(s);
 if(values.length>=2 && !/цена|скидк|налог|процент|скорост|км\s*\/\s*ч|треугольник|прогресс|вероятност|уравнен|функци/i.test(s)) {
   if(/всего|сумм[аыу]|стало вместе|общее количество/i.test(s) && !/в кажд(?:ом|ой)|поровну|разделил|в каждой группе по/i.test(s)) { const a=values[0],b=values[1],v=a+b; return result(fmt(v),[`Проверка условия: спрашивают общее количество, указаны два слагаемых ${a} и ${b}.`,`1-е действие: ${a} + ${b} = ${fmt(v)}.`,`Ответ: всего ${fmt(v)}.`],'Сложение'); }
   if(/остал|убрал|продал|израсход|потратил/i.test(s)) { const a=values[0],b=values[1],v=a-b; if(v>=0)return result(fmt(v),[`Проверка условия: есть начальное количество ${a} и уменьшение на ${b}.`,`1-е действие: ${a} − ${b} = ${fmt(v)}.`,`Ответ: осталось ${fmt(v)}.`],'Вычитание'); }
   if(/в кажд(?:ом|ой)|по \d|одинаков.*групп|в \d+ раз(а)? больше/i.test(s)) { const a=values[0],b=values[1],v=a*b; return result(fmt(v),[`Проверка условия: ${a} предметов в каждой из ${b} одинаковых групп.`,`1-е действие: ${a} · ${b} = ${fmt(v)}.`,`Ответ: ${fmt(v)}.`],'Умножение'); }
   if(/поровну|разделил|каждому|в каждой группе по/i.test(s)) { const total=values[0],parts=values[1];if(parts!==0)return result(fmt(total/parts),[`Проверка условия: ${total} предметов распределяют поровну на ${parts} частей.`,`1-е действие: ${total} ÷ ${parts} = ${fmt(total/parts)}.`,`Ответ: ${fmt(total/parts)} в каждой части.`],'Деление'); }
   if(/на сколько больше|на сколько меньше/i.test(s)){const [a,b]=values.slice(0,2),v=Math.abs(a-b);return result(fmt(v),[`Сравним величины: ${a} и ${b}.`,`1-е действие: ${Math.max(a,b)} − ${Math.min(a,b)} = ${fmt(v)}.`,`Ответ: на ${fmt(v)}.`],'Сравнение');}
 }
 return null;
}
