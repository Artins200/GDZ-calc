/* Deterministic algorithmic solvers for common grades 7–11 exercises. */
import { evaluate, fmt, solveQuadratic, preprocess } from './mathcore.js';
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
