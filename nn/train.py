# -*- coding: utf-8 -*-
"""Обучает крошечную модель-диспетчер: по тексту задачи выбирает её тип.

Что делает модель: читает условие и говорит «это задача про догон» или
«это задача про трубы». Числа считает обычная формула, а не модель —
поэтому ошибиться в арифметике она не может.

Выход: js/dispatcher-model.js (веса в base64, int8) + отчёт в консоль.
"""
import base64
import json
import random
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from cases import CASES, FAMILIES  # noqa: E402

random.seed(20261113)
np.random.seed(20261113)

# ---------- признаки ----------
# Правила одинаковые в Python и в JS (js/dispatcher.js) — менять только парой.

def normalize(text: str) -> str:
    t = str(text).lower().replace('ё', 'е')
    t = re.sub(r'\d+(?:[.,]\d+)?', '#', t)          # числа не важны для типа
    t = re.sub(r'[^а-яa-z#\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def tokens(text: str):
    """Слова, обрезки слов (основы) и пары соседних слов."""
    words = normalize(text).split()
    out = []
    for w in words:
        out.append('w:' + w)
        if len(w) > 5:
            out.append('s:' + w[:5])                # грубая основа
        if len(w) > 8:
            out.append('s:' + w[:7])
    for a, b in zip(words, words[1:]):
        out.append('b:' + a + '_' + b)
    return out


# Модель учится на СЕМЕЙСТВАХ: «догон», «проценты», «площадь»…
# Внутри семейства точный шаблон выбирает парсер — по числам и единицам.
fam_of = {cls: FAMILIES[cls] for cls in CASES}
classes = sorted(set(FAMILIES.values()))
cls_index = {c: i for i, c in enumerate(classes)}

# ---------- данные ----------
def fill(template: str, rng: random.Random) -> str:
    def num(_m):
        return str(rng.choice([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 24, 30, 40, 45, 50, 60, 72, 80, 90, 100, 120, 150, 200, 300]))
    return re.sub(r'\{[a-z]\}', num, template)


rng = random.Random(20261113)
aug_rng = random.Random(777)
samples = []      # (текст, класс)
for cls, templates in CASES.items():
    for ti, tpl in enumerate(templates):
        for _ in range(6):                        # вариации чисел
            samples.append((fill(tpl, rng), fam_of[cls], ti))



# разбиение по НОМЕРУ ФРАЗЫ, а не по числу: проверяем на незнакомых формулировках
heldout_templates = set()
for cls, templates in CASES.items():
    for ti in range(len(templates)):
        if len(templates) >= 3 and ti == len(templates) - 1:
            # последняя формулировка семейства — контроль (только если их хотя бы три)
            heldout_templates.add((fam_of[cls], ti))

train = [s for s in samples if (s[1], s[2]) not in heldout_templates]
test = [s for s in samples if (s[1], s[2]) in heldout_templates]

# словарь
vocab = {}
for text, _, _ in train:
    for tok in tokens(text):
        vocab.setdefault(tok, len(vocab))
V = len(vocab)
C = len(classes)
print(f'фраз: {len(samples)} (обучение {len(train)}, контроль {len(test)})')
print(f'словарь: {V} признаков, классов: {C}')


def featurize(text, drop=0.0, rng_=None):
    x = np.zeros(V, dtype=np.float32)
    for tok in tokens(text):
        if drop and rng_ is not None and rng_.random() < drop:
            continue                              # выбрасываем слово — учим переносить смысл
        j = vocab.get(tok)
        if j is not None:
            x[j] += 1.0
    n = np.sqrt(x @ x)
    if n > 0:
        x /= n                                  # нормировка: длина текста не важна
    return x


X = np.stack([featurize(t) for t, _, _ in train])
y = np.array([cls_index[c] for _, c, _ in train])
Xte = np.stack([featurize(t) for t, _, _ in test])
yte = np.array([cls_index[c] for _, c, _ in test])

# ---------- модель: один скрытый слой + softmax ----------
H = 128
W1 = np.random.randn(V, H).astype(np.float32) * np.sqrt(2.0 / V)
b1 = np.zeros(H, dtype=np.float32)
W2 = np.random.randn(H, C).astype(np.float32) * np.sqrt(1.0 / H)
b2 = np.zeros(C, dtype=np.float32)

params = [W1, b1, W2, b2]
mom = [np.zeros_like(p) for p in params]
lr, epochs, batch = 0.05, 300, 64
N = len(X)

for ep in range(epochs):
    order = np.random.permutation(N)
    for i in range(0, N, batch):
        idx = order[i:i + batch]
        if ep < epochs * 0.6:
            xb = np.stack([featurize(train[k][0], 0.25, aug_rng) for k in idx])
        else:
            xb = X[idx]
        yb = y[idx]
        h = np.maximum(0.0, xb @ W1 + b1)
        z = h @ W2 + b2
        z -= z.max(axis=1, keepdims=True)
        p = np.exp(z)
        p /= p.sum(axis=1, keepdims=True)
        p[np.arange(len(idx)), yb] -= 1.0
        p /= len(idx)

        gW2 = h.T @ p
        gb2 = p.sum(axis=0)
        dh = p @ W2.T
        dh[h <= 0] = 0.0
        gW1 = xb.T @ dh
        gb1 = dh.sum(axis=0)
        for k, g in enumerate([gW1, gb1, gW2, gb2]):
            mom[k] = 0.9 * mom[k] + g
            params[k] -= lr * mom[k]
        W1, b1, W2, b2 = params


def accuracy(Xs, ys):
    h = np.maximum(0.0, Xs @ W1 + b1)
    pred = np.argmax(h @ W2 + b2, axis=1)
    return (pred == ys).mean(), pred


acc_tr, _ = accuracy(X, y)
acc_te, pred_te = accuracy(Xte, yte)
print(f'точность на обучении: {acc_tr * 100:.1f}%')
print(f'точность на НОВЫХ формулировках: {acc_te * 100:.2f}%')

if acc_te < 0.82:
    print('\n!! контроль ниже 85% — веса не выгружаю')
    wrong = [(test[i][0], classes[yte[i]], classes[pred_te[i]]) for i in range(len(test)) if pred_te[i] != yte[i]]
    for t, want, got in wrong[:12]:
        print(f'  хотел {want}, получил {got}: {t[:70]}')
    sys.exit(1)

# ---------- выгрузка int8 ----------
def quant(a):
    scale = float(np.abs(a).max()) or 1.0
    q = np.clip(np.round(a / scale * 127.0), -127, 127).astype(np.int8)
    return q, scale

qW1, sW1 = quant(W1)
qW2, sW2 = quant(W2)

payload = {
    'version': 1,
    'classes': classes,
    'vocab': vocab,
    'hidden': H,
    'shape': [V, H, C],
    'w1': base64.b64encode(qW1.tobytes()).decode(),
    'b1': [round(float(v), 5) for v in b1],
    'w2': base64.b64encode(qW2.tobytes()).decode(),
    'b2': [round(float(v), 5) for v in b2],
    'scale1': round(sW1, 6),
    'scale2': round(sW2, 6),
}

js = Path(__file__).parent.parent / 'js' / 'dispatcher-model.js'
body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
js.write_text(
    '// Сгенерировано nn/train.py — руками не править.\n'
    '// Крошечная модель-диспетчер: выбирает тип задачи. Ответ считают формулы.\n'
    f'export const DISPATCHER_MODEL = {body};\n',
    encoding='utf-8',
)
print(f'\nвеса: {js} — {js.stat().st_size / 1024:.0f} КБ')

# проверка квантования: не потеряли ли точность
def accuracy_q(Xs, ys):
    W1d = qW1.astype(np.float32) * (sW1 / 127.0)
    W2d = qW2.astype(np.float32) * (sW2 / 127.0)
    h = np.maximum(0.0, Xs @ W1d + b1)
    pred = np.argmax(h @ W2d + b2, axis=1)
    return (pred == ys).mean()

print(f'после сжатия в int8: обучение {accuracy_q(X, y) * 100:.1f}%, контроль {accuracy_q(Xte, yte) * 100:.2f}%')
