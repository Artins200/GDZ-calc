// Крошечная модель-диспетчер: по тексту задачи угадывает её семейство
// («догон», «проценты», «площадь»…). Ответ всё равно считает формула —
// модель только подсказывает парсеру, с какой стороны смотреть.
//
// Правила признаков должны совпадать с nn/train.py — иначе веса не подойдут.

import { DISPATCHER_MODEL as M } from './dispatcher-model.js';

const HIDDEN = M.hidden;
const [V, , C] = M.shape;

function b64ToBytes(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
    return out;
  }
  // запасной путь для Node
  return Int8Array.from(Buffer.from(b64, 'base64'), (b) => (b << 24) >> 24);
}

const W1 = b64ToBytes(M.w1);
const W2 = b64ToBytes(M.w2);
const B1 = Float32Array.from(M.b1);
const B2 = Float32Array.from(M.b2);
const S1 = M.scale1 / 127;
const S2 = M.scale2 / 127;

const CLASSES = M.classes;
const VOCAB = M.vocab;

/** Те же правила, что в nn/train.py: слова, обрезки основ и пары слов. */
export function tokens(text) {
  const norm = String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/[^а-яa-z#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = norm ? norm.split(' ') : [];
  const out = [];
  for (const w of words) {
    out.push('w:' + w);
    if (w.length > 5) out.push('s:' + w.slice(0, 5));
    if (w.length > 8) out.push('s:' + w.slice(0, 7));
  }
  for (let i = 0; i + 1 < words.length; i++) out.push('b:' + words[i] + '_' + words[i + 1]);
  return out;
}

/**
 * @returns {{family: string, p: number, top: Array<{family: string, p: number}>}}
 *   family — самое вероятное семейство, p — его вероятность (0…1).
 */
export function predictFamily(text) {
  // признаки → разреженный вектор с нормировкой
  const idx = [];
  const val = [];
  for (const tok of tokens(text)) {
    const j = VOCAB[tok];
    if (j !== undefined) { idx.push(j); val.push(1); }
  }
  let norm = 0;
  for (const v of val) norm += v * v;
  norm = Math.sqrt(norm) || 1;

  // скрытый слой: h = relu(x · W1 + b1)
  const h = new Float32Array(HIDDEN);
  for (let i = 0; i < HIDDEN; i++) h[i] = B1[i];
  for (let k = 0; k < idx.length; k++) {
    const row = idx[k] * HIDDEN;
    const x = val[k] / norm;
    for (let i = 0; i < HIDDEN; i++) h[i] += x * W1[row + i] * S1;
  }
  for (let i = 0; i < HIDDEN; i++) if (h[i] < 0) h[i] = 0;

  // выход: z = h · W2 + b2, затем softmax
  const z = new Float32Array(C);
  for (let c = 0; c < C; c++) z[c] = B2[c];
  for (let i = 0; i < HIDDEN; i++) {
    const hv = h[i];
    if (hv === 0) continue;
    for (let c = 0; c < C; c++) z[c] += hv * W2[i * C + c] * S2;
  }
  let max = -Infinity;
  for (let c = 0; c < C; c++) if (z[c] > max) max = z[c];
  let sum = 0;
  for (let c = 0; c < C; c++) { z[c] = Math.exp(z[c] - max); sum += z[c]; }
  for (let c = 0; c < C; c++) z[c] /= sum;

  const order = [...z.keys()].sort((a, b) => z[b] - z[a]);
  const top = order.slice(0, 3).map((c) => ({ family: CLASSES[c], p: z[c] }));
  return { family: CLASSES[order[0]], p: top[0].p, top };
}

export const DISPATCHER_INFO = {
  classes: CLASSES.length,
  features: V,
  hidden: HIDDEN,
  params: V * HIDDEN + HIDDEN * C + HIDDEN + C,
};
