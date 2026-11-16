/* Генератор иконки GDZ-calc: график функции + галочка проверки.
 * Рисуем попиксельно с суперсэмплингом — без SVG-рендера, чтобы иконка
 * выглядела одинаково на всех плотностях экрана. */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = process.argv[2] || '.';
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const BG_TOP = [26, 30, 37];
const BG_BOT = [11, 13, 16];
const AMBER = [255, 159, 10];
const AMBER_LIGHT = [255, 199, 96];
const MINT = [55, 211, 153];

const cov = (px, py, fn, n = 3) => {
  let hit = 0;
  for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
    if (fn(px + (sx + 0.5) / n, py + (sy + 0.5) / n)) hit++;
  }
  return hit / (n * n);
};

const segDist = (x, y, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay;
  const L2 = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / L2, 0, 1);
  return Math.hypot(wx - vx * t, wy - vy * t);
};

const roundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = clamp(x, x0 + r, x1 - r);
  const cy = clamp(y, y0 + r, y1 - r);
  return Math.hypot(x - cx, y - cy) <= r;
};

function render(size, { adaptive = false } = {}) {
  const png = new PNG({ width: size, height: size });
  const S = size;
  const pad = S * 0.08;
  const x0 = adaptive ? 0 : pad, y0 = adaptive ? 0 : pad;
  const x1 = adaptive ? S : S - pad, y1 = adaptive ? S : S - pad;
  const radius = adaptive ? S * 0.5 : S * 0.24;

  // Координаты «графика» внутри плитки.
  const gx0 = S * 0.20, gx1 = S * 0.80;
  const gy0 = S * 0.22, gy1 = S * 0.78;      // ось Y сверху вниз

  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const i = (S * py + px) << 2;
      const tileA = adaptive ? 1 : cov(px, py, (x, y) => roundRect(x, y, x0, y0, x1, y1, radius), 2);

      // фон: вертикальный градиент + тёплое свечение в центре
      const g = clamp((px / S) * 0.35 + (py / S) * 0.65);
      let col = mix(BG_TOP, BG_BOT, g);
      const dGlow = Math.hypot(px - S * 0.52, py - S * 0.52) / (S * 0.55);
      col = mix(col, AMBER, Math.pow(clamp(1 - dGlow), 3) * 0.13);

      // оси графика — тонкие и приглушённые
      const axisT = S * 0.014;
      const axisCov = cov(px, py, (x, y) =>
        (Math.abs(y - gy1) < axisT && x > gx0 - S * 0.03 && x < gx1) ||
        (Math.abs(x - gx0) < axisT && y > gy0 && y < gy1 + S * 0.03), 2);
      if (axisCov > 0) col = mix(col, [120, 130, 145], axisCov * 0.55);

      // кривая: арка функции, толстая янтарная
      const stroke = S * 0.085;
      const curveCov = cov(px, py, (x, y) => {
        const nx = (x - S * 0.5) / (S * 0.30);
        const yCurve = S * 0.60 - S * 0.30 * (1 - nx * nx); // парабола
        return Math.abs(y - yCurve) <= stroke / 2 && x >= S * 0.20 && x <= S * 0.80;
      }, 3);
      if (curveCov > 0) {
        const grad = mix(AMBER_LIGHT, AMBER, clamp((py / S - 0.2) / 0.6));
        col = mix(col, grad, curveCov);
      }

      // галочка проверки — мятная, справа внизу
      const ck = S * 0.26;
      const ax = S * 0.55, ay = S * 0.72;
      const checkCov = cov(px, py, (x, y) => {
        const t = S * 0.032;
        return segDist(x, y, ax - ck * 0.42, ay, ax - ck * 0.08, ay + ck * 0.34) <= t
          || segDist(x, y, ax - ck * 0.08, ay + ck * 0.34, ax + ck * 0.52, ay - ck * 0.34) <= t;
      }, 3);
      if (checkCov > 0) col = mix(col, MINT, checkCov);

      png.data[i] = Math.round(col[0]);
      png.data[i + 1] = Math.round(col[1]);
      png.data[i + 2] = Math.round(col[2]);
      png.data[i + 3] = Math.round(tileA * 255);
    }
  }
  return PNG.sync.write(png);
}

for (const [dpi, size] of Object.entries(SIZES)) {
  const dir = path.join(OUT, `mipmap-${dpi}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), render(size));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), render(Math.round(size * 1.6), { adaptive: true }));
  console.log(dpi, size);
}
fs.writeFileSync(path.join(OUT, 'icon-512.png'), render(512));
console.log('icon-512.png');
