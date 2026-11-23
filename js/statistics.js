/* Descriptive statistics, robust input parsing, paired-data regression and SVG histogram. */
export function parseNumberList(raw, label = 'значения') {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error(`Введите ${label}.`);
  let parts;
  if (/[;\n\t]/.test(text)) parts = text.split(/[;\n\t]/);
  else if ((text.match(/,/g) || []).length > 1) parts = text.split(',');
  else if (/,[ \t]+/.test(text)) parts = text.split(/,\s*/);
  else if (/\s+/.test(text)) parts = text.split(/\s+/);
  else parts = [text];
  const values = parts.map((part) => {
    const token = part.trim().replace(/[−–—]/g, '-');
    if (!token || !/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
      throw new Error(`Некорректное значение «${token || 'пустое'}»; разделяйте числа точкой с запятой или новой строкой.`);
    }
    const value = Number(token.replace(',', '.'));
    if (!Number.isFinite(value)) throw new Error(`Число «${token}» слишком велико.`);
    return value;
  });
  if (values.length > 100000) throw new Error('Для одного расчёта допускается не более 100 000 чисел.');
  return values;
}

const quantile = (sorted, p) => {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export function descriptiveStatistics(values) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) {
    throw new Error('Нужен непустой список конечных чисел.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  // Kahan summation reduces loss of precision for lists with very different scales.
  let sum = 0, correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  const n = values.length, mean = sum / n;
  if (!Number.isFinite(sum) || !Number.isFinite(mean)) throw new Error('Сумма или среднее вышли за пределы числового диапазона.');
  const median = quantile(sorted, .5), q1 = quantile(sorted, .25), q3 = quantile(sorted, .75);
  const deviations = values.map((value) => (value - mean) ** 2);
  const populationVariance = deviations.reduce((a, b) => a + b, 0) / n;
  const sampleVariance = n > 1 ? deviations.reduce((a, b) => a + b, 0) / (n - 1) : null;
  const frequencies = new Map();
  for (const value of values) frequencies.set(value, (frequencies.get(value) || 0) + 1);
  let maxFrequency = 0;
  for (const count of frequencies.values()) maxFrequency = Math.max(maxFrequency, count);
  const modes = maxFrequency > 1 ? [...frequencies].filter(([, count]) => count === maxFrequency).map(([value]) => value).sort((a, b) => a - b) : [];
  const iqr = q3 - q1, lowerFence = q1 - 1.5 * iqr, upperFence = q3 + 1.5 * iqr;
  const outliers = sorted.filter((value) => value < lowerFence || value > upperFence);
  const geometricMean = values.every((value) => value > 0)
    ? Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / n) : null;
  const harmonicMean = values.every((value) => value !== 0) && values.every((value) => value > 0)
    ? n / values.reduce((total, value) => total + 1 / value, 0) : null;
  if (!Number.isFinite(populationVariance) || (sampleVariance !== null && !Number.isFinite(sampleVariance))) {
    throw new Error('Разброс чисел слишком велик для безопасного вычисления дисперсии.');
  }
  const sampleStdDev = sampleVariance === null ? null : Math.sqrt(sampleVariance);
  const standardError = sampleStdDev === null ? null : sampleStdDev / Math.sqrt(n);
  return {
    n, sum, mean, median, modes, modeFrequency: maxFrequency,
    min: sorted[0], max: sorted[n - 1], range: sorted[n - 1] - sorted[0],
    q1, q3, iqr, lowerFence, upperFence, outliers,
    populationVariance, sampleVariance,
    populationStdDev: Math.sqrt(populationVariance), sampleStdDev, standardError,
    confidence95: standardError === null ? null : [mean - 1.96 * standardError, mean + 1.96 * standardError],
    geometricMean, harmonicMean, sorted,
  };
}

export function weightedMean(values, weights) {
  if (!Array.isArray(values) || !Array.isArray(weights) || values.length === 0 || values.length !== weights.length) {
    throw new Error('Введите одинаковое количество значений и весов.');
  }
  if (![...values, ...weights].every(Number.isFinite) || weights.some((weight) => weight < 0)) {
    throw new Error('Значения и веса должны быть конечными числами, веса — неотрицательными.');
  }
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || !(totalWeight > 0)) throw new Error('Сумма весов должна быть конечным числом больше нуля.');
  const weightedSum = values.reduce((sum, value, index) => sum + value * weights[index], 0);
  if (!Number.isFinite(weightedSum)) throw new Error('Слишком большие значения для вычисления.');
  return { value: weightedSum / totalWeight, weightedSum, totalWeight, count: values.length };
}

export function linearRegression(xs, ys) {
  if (!Array.isArray(xs) || !Array.isArray(ys) || xs.length < 2 || xs.length !== ys.length
    || ![...xs, ...ys].every(Number.isFinite)) throw new Error('Нужно не менее двух пар конечных чисел x;y.');
  const n = xs.length, xMean = xs.reduce((s, x) => s + x, 0) / n, yMean = ys.reduce((s, y) => s + y, 0) / n;
  const xx = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const yy = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  if (xx < 1e-20) throw new Error('Для регрессии значения x не должны быть одинаковыми.');
  const xy = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const slope = xy / xx, intercept = yMean - slope * xMean;
  const correlation = yy < 1e-20 ? null : xy / Math.sqrt(xx * yy);
  const residualSumSquares = xs.reduce((s, x, i) => s + (ys[i] - (slope * x + intercept)) ** 2, 0);
  if (![slope, intercept, ...(correlation === null ? [] : [correlation]), residualSumSquares].every(Number.isFinite)) {
    throw new Error('Масштаб данных слишком велик для стабильной линейной регрессии.');
  }
  return { n, slope, intercept, correlation, rSquared: yy < 1e-20 ? null : 1 - residualSumSquares / yy,
    points: xs.map((x, i) => ({ x, y: ys[i] })) };
}

export function histogramSVG(values, width = 640, height = 230) {
  if (!values?.length || !values.every(Number.isFinite)) throw new Error('Невозможно построить гистограмму без числовых данных.');
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const span = max - min || 1;
  if (!Number.isFinite(span)) throw new Error('Размах значений слишком велик для построения гистограммы.');
  const bins = Math.max(1, Math.min(14, Math.ceil(Math.log2(values.length) + 1)));
  const counts = Array(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / span * bins))]++;
  const pad = 30, plotW = width - 2 * pad, plotH = height - 2 * pad, maxCount = counts.reduce((a, b) => Math.max(a, b), 1);
  const barW = plotW / bins;
  const bars = counts.map((count, i) => {
    const h = count / maxCount * plotH, x = pad + i * barW, y = pad + plotH - h;
    return `<rect x="${x + 2}" y="${y}" width="${Math.max(1, barW - 4)}" height="${h}" rx="3" fill="#ff9f0a"><title>${count} наблюдений</title></rect><text x="${x + barW / 2}" y="${height - 8}" fill="#a8b1bd" font-size="10" text-anchor="middle">${(min + span * i / bins).toPrecision(3)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Гистограмма частот" style="width:100%;height:auto;background:#11151a;border:1px solid #30363d;border-radius:12px"><title>Распределение значений по ${bins} интервалам</title><line x1="${pad}" y1="${pad + plotH}" x2="${width-pad}" y2="${pad + plotH}" stroke="#69727e"/>${bars}</svg>`;
}

export function regressionSVG(model, width = 640, height = 260) {
  const xs = model.points.map((p) => p.x), ys = model.points.map((p) => p.y);
  const minX = xs.reduce((a, b) => Math.min(a, b), Infinity), maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity);
  const minY = ys.reduce((a, b) => Math.min(a, b), Infinity), maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity);
  const xSpan = maxX - minX || 1, ySpan = maxY - minY || 1, pad = 32;
  const px = (x) => pad + (x - minX) / xSpan * (width - 2 * pad);
  const py = (y) => height - pad - (y - minY) / ySpan * (height - 2 * pad);
  const points = model.points.map((p) => `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="4" fill="#4b9bff"><title>(${p.x}; ${p.y})</title></circle>`).join('');
  const y0 = model.slope * minX + model.intercept, y1 = model.slope * maxX + model.intercept;
  const line = `<line x1="${px(minX)}" y1="${py(y0)}" x2="${px(maxX)}" y2="${py(y1)}" stroke="#ff9f0a" stroke-width="2.5"/>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Точки данных и линия линейной регрессии" style="width:100%;height:auto;background:#11151a;border:1px solid #30363d;border-radius:12px"><title>Диаграмма рассеяния и линия наилучшего линейного приближения</title>${line}${points}</svg>`;
}
