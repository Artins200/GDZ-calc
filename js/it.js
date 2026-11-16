/* =========================================================================
 * it.js — режим «Информатика».
 *
 * 1) Единицы информации: бит, Б, КБ, МБ, ГБ, ТБ, ПБ и двоичные КиБ/МиБ/…
 *    «1 КБ = 1024 Б» и «1 Кбайт = 1000 байт» — оба варианта, с пояснением.
 * 2) Количество информации: N = K^i, i = log_K N, формула Хартли N = 2^i.
 * 3) Объём сообщения: I = K · i (символы × бит на символ).
 * 4) Скорость передачи: V = I / t, t = I / V.
 * 5) Системы счисления: перевод и арифметика.
 * 6) Оформление «Дано — Найти — Решение — Ответ».
 * ========================================================================= */

export const INFO_UNITS = [
  { id: 'bit', short: 'бит', name: 'бит', bytes: 1 / 8 },
  { id: 'B', short: 'Б', name: 'байт', bytes: 1 },
  { id: 'KB', short: 'КБ', name: 'килобайт', bytes: 1024 },
  { id: 'MB', short: 'МБ', name: 'мегабайт', bytes: 1024 ** 2 },
  { id: 'GB', short: 'ГБ', name: 'гигабайт', bytes: 1024 ** 3 },
  { id: 'TB', short: 'ТБ', name: 'терабайт', bytes: 1024 ** 4 },
  { id: 'PB', short: 'ПБ', name: 'петабайт', bytes: 1024 ** 5 },
  { id: 'KiB', short: 'КиБ', name: 'кибибайт', bytes: 1024 },
  { id: 'MiB', short: 'МиБ', name: 'мебибайт', bytes: 1024 ** 2 },
  { id: 'GiB', short: 'ГиБ', name: 'гибибайт', bytes: 1024 ** 3 },
];

const UNIT_BY_ID = new Map(INFO_UNITS.map((u) => [u.id, u]));

/** Разбирает строку вида «1,5 ГБ», «2048 бит», «512 КБ». */
export function parseInfoSize(text) {
  const s = String(text || '').trim().replace(',', '.');
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*([а-яa-z.]*)/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const raw = m[2].toLowerCase().replace(/\.$/, '');
  const alias = [
    ['бит', 'bit'], ['bit', 'bit'], ['б', 'B'], ['байт', 'B'], ['byte', 'B'],
    ['кб', 'KB'], ['кбайт', 'KB'], ['kb', 'KB'], ['килобайт', 'KB'],
    ['мб', 'MB'], ['мбайт', 'MB'], ['mb', 'MB'], ['мегабайт', 'MB'],
    ['гб', 'GB'], ['гбайт', 'GB'], ['gb', 'GB'], ['гигабайт', 'GB'],
    ['тб', 'TB'], ['тбайт', 'TB'], ['tb', 'TB'], ['терабайт', 'TB'],
    ['пб', 'PB'], ['пбайт', 'PB'], ['pb', 'PB'], ['петабайт', 'PB'],
    ['киб', 'KiB'], ['kib', 'KiB'], ['миб', 'MiB'], ['mib', 'MiB'], ['гиб', 'GiB'], ['gib', 'GiB'],
  ];
  const hit = alias.find(([a]) => raw === a || raw.startsWith(a));
  if (!hit) return null;
  return { value, unit: hit[1] };
}

const fmtNum = (v) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4).replace('.', ',');
  const r = Math.round(v * 1e6) / 1e6;
  return String(r).replace('.', ',');
};

/** Перевод размера во все основные единицы. */
export function convertInfoSize(value, fromUnit, { binary = true } = {}) {
  const from = UNIT_BY_ID.get(fromUnit);
  if (!from) return null;
  const bytes = value * (fromUnit === 'bit' ? 1 / 8 : from.bytes);
  const base = binary ? 1024 : 1000;
  const pow = (n) => base ** n;
  return [
    { unit: 'бит', value: bytes * 8 },
    { unit: 'байт', value: bytes },
    { unit: 'КБ', value: bytes / pow(1) },
    { unit: 'МБ', value: bytes / pow(2) },
    { unit: 'ГБ', value: bytes / pow(3) },
    { unit: 'ТБ', value: bytes / pow(4) },
    { unit: 'ПБ', value: bytes / pow(5) },
  ];
}

/** Степень двойки: 2^i = N ⇔ i = log₂N. */
export function powerOfTwo(n) {
  const i = Math.log2(n);
  return { i, exact: Math.abs(i - Math.round(i)) < 1e-9 };
}

/** N = K^i: сколько информации несёт один символ при алфавите мощность K. */
export function hartley(K, N) {
  if (!(K > 1) || !(N > 0)) return null;
  const i = Math.log(N) / Math.log(K);
  return { i, exact: Math.abs(i - Math.round(i)) < 1e-9 };
}

/** Объём сообщения: I = K·i (K — число символов, i — бит на символ). */
export function messageVolume(chars, bitsPerChar) {
  const bits = chars * bitsPerChar;
  return { bits, bytes: bits / 8, kib: bits / 8 / 1024 };
}

/** Скорость передачи: V = I / t. */
export function transferTime(size, sizeUnit, speed, speedUnit) {
  const bytes = (sizeUnit === 'bit' ? size / 8 : size * (UNIT_BY_ID.get(sizeUnit)?.bytes || 1));
  const speedBytes = (speedUnit === 'bit/s' ? speed / 8 : speed * (UNIT_BY_ID.get(speedUnit)?.bytes || 1));
  if (!(speedBytes > 0)) return null;
  const seconds = bytes / speedBytes;
  return { seconds, minutes: seconds / 60, hours: seconds / 3600 };
}

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Перевод целого числа из одной системы счисления в другую (2…36). */
export function convertBase(value, fromBase = 10, toBase = 10) {
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  if (!Number.isInteger(fromBase) || fromBase < 2 || fromBase > 36) return null;
  if (!Number.isInteger(toBase) || toBase < 2 || toBase > 36) return null;
  let n = 0;
  for (const ch of raw) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= fromBase) return null;
    n = n * fromBase + d;
  }
  if (!Number.isSafeInteger(n)) return null;
  if (n === 0) return { value: n, result: '0', steps: ['Число 0 в любой системе записывается как 0.'] };
  const steps = [];
  let rest = n;
  const parts = [];
  while (rest > 0) {
    const d = rest % toBase;
    parts.push({ d, ch: DIGITS[d] });
    rest = Math.floor(rest / toBase);
  }
  const result = parts.reverse().map((p) => p.ch).join('').toUpperCase();
  const sub = (b) => (b === 2 ? '₂' : b === 8 ? '₈' : b === 10 ? '₁₀' : b === 16 ? '₁₆' : ` (основание ${b})`);
  if (fromBase === 10) {
    steps.push(`Переводим ${raw} из десятичной в ${toBase}-ю: последовательно делим на ${toBase} и собираем остатки.`);
    steps.push(`Остатки снизу вверх: ${parts.map((p) => p.d).join(', ')}.`);
  } else if (toBase === 10) {
    steps.push(`Раскладываем по разрядам: ${raw.split('').map((ch, i) => `${DIGITS.indexOf(ch)}·${fromBase}^${raw.length - 1 - i}`).join(' + ')}.`);
    steps.push(`Считаем сумму — это и есть значение в десятичной системе.`);
  } else {
    steps.push(`Сначала переводим ${raw.toUpperCase()}${sub(fromBase)} в десятичную: получаем ${n}.`);
    steps.push(`Затем делим ${n} на ${toBase} и собираем остатки: ${parts.map((p) => p.d).join(', ')}.`);
  }
  steps.push(`Ответ: ${raw.toUpperCase()}${sub(fromBase)} = ${result}${sub(toBase)}.`);
  return { value: n, result, steps, digits: parts.map((p) => p.d) };
}

/** Сложение/вычитание в двоичной и других системах. */
export function baseArithmetic(a, b, base, op = '+') {
  const x = parseInt(String(a), base);
  const y = parseInt(String(b), base);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const res = op === '-' ? x - y : op === '*' ? x * y : x + y;
  if (res < 0) return null;
  return { value: res, result: res.toString(base).toUpperCase() };
}

/** Готовая карточка «Дано — Найти — Решение — Ответ». */
export function itCard({ title, given = [], find = [], formulas = [], steps = [], answer = '' }) {
  return { title, given, find, formulas, steps, answer };
}

/**
 * Решатель по тексту задачи по информатике.
 * Возвращает карточку с «Дано» или null.
 */
export function solveItTask(raw) {
  const text = String(raw || '').replace(/ё/gi, 'е');
  const s = text.toLowerCase().replace(/\s+/g, ' ');

  // 5) Системы счисления: «переведите 1011 из двоичной в десятичную».
  let mb = s.match(/(\d+)\s*(?:из|в)\s*(\d+)-?(?:й|ой|ичной)?\s*(?:в|из)\s*(\d+)-?(?:ю|ой|ичную)?/);
  const baseWords = /систем|счислен/.test(s);
  if (!mb && baseWords) {
    const named = s.match(/(\d+)[^\d]*(?:из|в)\s*(двоичн|восьмеричн|десятичн|шестнадцатеричн)[^\d]*(?:в|из)\s*(двоичн|восьмеричн|десятичн|шестнадцатеричн)/);
    const b = (w) => ({ двоичн: 2, восьмеричн: 8, десятичн: 10, шестнадцатеричн: 16 }[w.slice(0, 4).replace('шест', 'шестнадцатеричн').slice(0, 4)] || ({ 'двои': 2, 'вось': 8, 'деся': 10, 'шест': 16 }[w.slice(0, 4)]));
    if (named) mb = [named[0], named[1], b(named[2]), b(named[3])];
  }
  if (mb && mb[2] && mb[3]) {
    const value = mb[1], fromBase = Number(mb[2]), toBase = Number(mb[3]);
    const r = convertBase(value, fromBase, toBase);
    if (r) {
      return itCard({
        title: 'Перевод между системами счисления',
        given: [{ label: 'число', value }, { label: 'система', value: `${fromBase}-я` }],
        find: [`запись в ${toBase}-й системе`],
        formulas: ['делим на основание и собираем остатки', 'разряды: d·base^k'],
        steps: r.steps,
        answer: r.result,
      });
    }
  }

  // 4) Скорость передачи.
  if (/скорост|передач|скачива/.test(s)) {
    const sz = parseInfoSize(s);
    const speedM = s.match(/(\d+(?:[.,]\d+)?)\s*(кб|мб|гб|бит|байт)\s*\/\s*с/);
    if (sz && speedM) {
      const speed = Number(speedM[1].replace(',', '.'));
      const unit = { кб: 'KB', мб: 'MB', гб: 'GB', бит: 'bit', байт: 'B' }[speedM[2]];
      const r = transferTime(sz.value, sz.unit, speed, unit);
      if (r) {
        return itCard({
          title: 'Время передачи файла',
          given: [{ label: 'I', value: `${fmtNum(sz.value)} ${INFO_UNITS.find((u) => u.id === sz.unit)?.short || ''}` }, { label: 'V', value: `${fmtNum(speed)} ${speedM[2]}/с` }],
          find: ['t'],
          formulas: ['t = I / V'],
          steps: [
            `t = I / V = ${fmtNum(sz.value)} / ${fmtNum(speed)} = ${fmtNum(r.seconds)} с.`,
            r.minutes >= 1 ? `Это ${fmtNum(r.minutes)} мин${r.hours >= 1 ? ` ≈ ${fmtNum(r.hours)} ч` : ''}.` : '',
          ].filter(Boolean),
          answer: `${fmtNum(r.seconds)} с`,
        });
      }
    }
  }


  // 1) Перевод единиц: «сколько МБ в 2 ГБ», «переведите 1,5 КБ в байты».
  const size = parseInfoSize(s);
  if (size && !/скорост|передач|скачива/.test(s) && /(перевед|сколько|выраз|в\s+(?:бит|байт|кб|мб|гб|тб))/i.test(s)) {
    const aliasMap = [
      [/(^|[^а-я])байт/, 'байт'], [/(^|[^а-я])бит/, 'бит'], [/(^|[^а-я])(кб|килобайт)/, 'КБ'],
      [/(^|[^а-я])(мб|мегабайт)/, 'МБ'], [/(^|[^а-я])(гб|гигабайт)/, 'ГБ'],
      [/(^|[^а-я])(тб|терабайт)/, 'ТБ'], [/(^|[^а-я])(пб|петабайт)/, 'ПБ'],
    ];
    const srcUnitObj = INFO_UNITS.find((u) => u.id === size.unit);
    const stripped = s.replace(new RegExp(`${String(size.value).replace('.', '[.,]')}\\s*${srcUnitObj ? '(бит|байт|б|кб|мб|гб|тб|пб|килобайт|мегабайт|гигабайт|терабайт|петабайт)' : ''}`), ' ');
    const targetHit = aliasMap.find(([re]) => re.test(stripped));
    const all = convertInfoSize(size.value, size.unit);
    if (all && targetHit) {
      const target = all.find((x) => x.unit === targetHit[1]);
      if (target && target.unit !== (INFO_UNITS.find((u) => u.id === size.unit)?.short || '')) {
        const srcUnit = INFO_UNITS.find((u) => u.id === size.unit);
        const targetUnit = INFO_UNITS.find((u) => u.short === targetHit[1]);
        const steps = [
          `1 байт = 8 бит, 1 КБ = 1024 байт, 1 МБ = 1024 КБ.`,
          `Переводим в байты: ${fmtNum(size.value)} ${srcUnit?.short || ''} = ${fmtNum(all[1].value)} Б.`,
          `Переводим в ${target.unit}: ${fmtNum(all[1].value)} Б / ${fmtNum((targetUnit?.bytes) || 1)} = ${fmtNum(target.value)} ${target.unit}.`,
        ];
        return itCard({
          title: 'Перевод единиц информации',
          given: [{ label: 'дано', value: `${fmtNum(size.value)} ${srcUnit?.short || ''}` }],
          find: [`в ${target.unit}`],
          formulas: ['1 Б = 8 бит', '1 КБ = 1024 Б', '1 МБ = 1024 КБ'],
          steps,
          answer: `${fmtNum(target.value)} ${target.unit}`,
        });
      }
    }
    if (all) {
      return itCard({
        title: 'Перевод единиц информации',
        given: [{ label: 'дано', value: `${fmtNum(size.value)} ${INFO_UNITS.find((u) => u.id === size.unit)?.short || ''}` }],
        find: ['во всех единицах'],
        formulas: ['1 Б = 8 бит', '1 КБ = 1024 Б'],
        steps: all.map((x, i) => `${i + 1}) ${x.unit} = ${fmtNum(x.value)}`),
        answer: all.map((x) => `${x.unit} = ${fmtNum(x.value)}`).join('; '),
      });
    }
  }

  // 3) Объём сообщения: K символов по i бит.
  const mVol = s.match(/(\d+)\s*(?:символ\w*|знак\w*)/);
  const bitsM = s.match(/(?:по|вес\w*|i\s*=)\s*(\d+)\s*бит/) || s.match(/(\d+)\s*бит\w*\s*(?:на|в)\s*(?:один\s*)?символ/) || s.match(/символ\w*\s+(\d+)\s*бит/);
  if (mVol && bitsM && !/цвет|вариант/.test(s)) {
    const chars = Number(mVol[1]), bits = Number(bitsM[1]);
    const v = messageVolume(chars, bits);
    return itCard({
      title: 'Объём сообщения',
      given: [{ label: 'K', value: `${chars} символов` }, { label: 'i', value: `${bits} бит на символ` }],
      find: ['I — информационный объём'],
      formulas: ['I = K · i'],
      steps: [
        `I = K · i = ${chars} · ${bits} = ${v.bits} бит.`,
        `Переводим в байты: ${v.bits} ÷ 8 = ${fmtNum(v.bytes)} байт.`,
      ],
      answer: `${fmtNum(v.bytes)} байт (${v.bits} бит)`,
    });
  }


  // 2) N = K^i или N = 2^i: «сколько бит нужно, чтобы закодировать 32 цвета».
  let m = s.match(/(\d+)\s*(?:различн\w*|вариант\w*|символ\w*|цвет\w*|букв\w*|уровн\w*)/);
  if (m && /(бит|закодир|вариант|мощност|алфавит|хартли|n\s*=|i\s*=)/.test(s)) {
    const n = Number(m[1]);
    const baseM = s.match(/(?:алфавит\w*|мощност\w*)\s*(?:из\s*)?(\d+)/);
    const K = baseM ? Number(baseM[1]) : 2;
    const p = K === 2 ? powerOfTwo(n) : hartley(K, n);
    if (p) {
      return itCard({
        title: K === 2 ? 'Количество информации (формула Хартли)' : `Количество информации: N = K^i`,
        given: [{ label: 'N', value: String(n) }, ...(K !== 2 ? [{ label: 'K', value: String(K) }] : [])],
        find: ['i — информационный вес одного символа'],
        formulas: K === 2 ? ['N = 2^i', 'i = log₂N'] : ['N = K^i', 'i = log_K N'],
        steps: p.exact
          ? [`Подставляем: N = ${K}^i ⇔ ${n} = ${K}^i.`, `i = ${fmtNum(p.i)}, потому что ${K}^${fmtNum(p.i)} = ${n}.`, `Ответ: i = ${fmtNum(p.i)} бит.`]
          : [`i = log_${K} ${n} ≈ ${fmtNum(p.i)} — целым число бит не получается.`, `Вероятно, в условии N — степень ${K}; проверьте данные.`],
        answer: p.exact ? `${fmtNum(p.i)} бит` : `i ≈ ${fmtNum(p.i)} бит`,
      });
    }
  }

  return null;
}
