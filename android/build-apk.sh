#!/usr/bin/env bash
# ============================================================================
#  Сборка GDZ-calc.apk — без Android Studio, Gradle и без Node-зависимостей.
#
#  Конвейер:
#    res/*.png, xml  --aapt2 compile-->  .flat  --aapt2 link-->  base APK
#    *.java          --ecj (Java 8)-->   .class --d8-->           classes.dex
#    zip + zipalign  --> apksigner (v1+v2+v3) --> GDZ-calc.apk
#
#  Требуется только JRE (java) и curl/tar/unzip. JDK и Android SDK НЕ нужны:
#    * компилятор — Eclipse ECJ (обычный jar, работает на голом JRE);
#    * dex-компилятор — d8.jar (R8);
#    * упаковщик ресурсов — aapt2 (готовый Linux-бинарник);
#    * подпись — apksigner.jar + debug.keystore.
#
#  Запуск:  ./android/build-apk.sh          (соберёт ../GDZ-calc.apk)
#           JAVA=... ./android/build-apk.sh
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
WORK="${WORK:-$HERE/.build}"
TOOLS="$HERE/tools"
OUT="$REPO/GDZ-calc.apk"

PKG="com.gdzcalc.app"
MIN_SDK=21
TARGET_SDK=34

say() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- Java
if [ -z "${JAVA:-}" ]; then
  if command -v java >/dev/null 2>&1; then
    JAVA=$(command -v java)
  elif python3 -c "import jdk4py" 2>/dev/null; then
    JAVA="$(python3 -c "import jdk4py,os;print(os.path.join(jdk4py.JAVA_HOME,'bin','java'))")"
  else
    die "не найден java. Поставьте JRE: apt install default-jre  (или pip install jdk4py)"
  fi
fi
say "java: $JAVA"

# ------------------------------------------------------------- инструменты
mkdir -p "$TOOLS" "$WORK"
AAPT2="$TOOLS/aapt2"
ANDROID_JAR="$TOOLS/android.jar"
D8_JAR="$TOOLS/d8.jar"
ECJ_JAR="$TOOLS/ecj.jar"
APKSIGNER_JAR="$TOOLS/apksigner.jar"
KEYSTORE="$TOOLS/debug.keystore"

fetch() { # url dest
  [ -s "$2" ] && return 0
  say "скачиваю $(basename "$2") …"
  curl -fsSL "$1" -o "$2.part" || die "не удалось скачать $1"
  mv "$2.part" "$2"
}

if [ ! -x "$AAPT2" ]; then
  fetch "https://registry.npmjs.org/aaptjs3/-/aaptjs3-2.0.2.tgz" "$WORK/aapt.tgz"
  mkdir -p "$WORK/aapt" && tar xzf "$WORK/aapt.tgz" -C "$WORK/aapt"
  cp "$WORK/aapt/package/bin/x64/linux/aapt2" "$AAPT2"
  chmod +x "$AAPT2"
fi

if [ ! -s "$ANDROID_JAR" ] || [ ! -s "$D8_JAR" ] || [ ! -s "$ECJ_JAR" ] \
   || [ ! -s "$APKSIGNER_JAR" ] || [ ! -s "$KEYSTORE" ]; then
  fetch "https://registry.npmjs.org/@drxiaozhi/minapk/-/minapk-0.5.1.tgz" "$WORK/minapk.tgz"
  mkdir -p "$WORK/minapk" && tar xzf "$WORK/minapk.tgz" -C "$WORK/minapk"
  cp "$WORK/minapk/package/tools/android.jar" "$ANDROID_JAR"
  cp "$WORK/minapk/package/tools/d8.jar" "$D8_JAR"
  cp "$WORK/minapk/package/tools/ecj-3.45.0.jar" "$ECJ_JAR"
  cp "$WORK/minapk/package/tools/apksigner.jar" "$APKSIGNER_JAR"
  cp "$WORK/minapk/package/tools/debug.keystore" "$KEYSTORE"
fi

# ------------------------------------------------------------------ ресурсы
say "ресурсы: aapt2 compile"
rm -rf "$WORK/res" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/assets"
mkdir -p "$WORK/res" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/assets/www"

"$AAPT2" compile --dir "$HERE/res" -o "$WORK/res/resources.zip"

# Содержимое веб-приложения кладём в assets/www (см. MainActivity.serve()).
cp "$REPO/index.html" "$REPO/styles.css" "$WORK/assets/www/"
mkdir -p "$WORK/assets/www/js"
# Копируем только рабочие модули, чтобы в APK не попадали временные файлы тестов.
for f in app.js mathcore.js formulas.js intervals.js inequalities.js tasks.js dispatcher.js dispatcher-model.js families.js; do
  cp "$REPO/js/$f" "$WORK/assets/www/js/"
done
say "assets: $(find "$WORK/assets/www" -type f | wc -l) файлов, $(du -sh "$WORK/assets/www" | cut -f1)"

say "ресурсы: aapt2 link"
"$AAPT2" link \
  -o "$WORK/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$HERE/AndroidManifest.xml" \
  -A "$WORK/assets" \
  --java "$WORK/gen" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code 1 --version-name 1.0 \
  "$WORK/res/resources.zip"

# -------------------------------------------------------------------- Java
say "java: компиляция (ECJ, source/target 8)"
find "$HERE/src" -name '*.java' > "$WORK/sources.txt"
# shellcheck disable=SC2046
"$JAVA" -jar "$ECJ_JAR" \
  -source 8 -target 8 -nowarn -proc:none \
  -cp "$ANDROID_JAR" \
  -d "$WORK/classes" @"$WORK/sources.txt"

say "dex: d8"
find "$WORK/classes" -name '*.class' > "$WORK/classes.txt"
# shellcheck disable=SC2046
"$JAVA" -cp "$D8_JAR" com.android.tools.r8.D8 \
  --release --min-api "$MIN_SDK" \
  --lib "$ANDROID_JAR" \
  --output "$WORK/dex" \
  @"$WORK/classes.txt"

# --------------------------------------------------------------- упаковка
say "упаковка APK"
cp "$WORK/base.apk" "$WORK/unaligned.apk"
( cd "$WORK/dex" && zip -q -X "$WORK/unaligned.apk" classes.dex )

# zipalign: выравниваем НЕСЖАТЫЕ записи на границу 4 байта (требование Android).
# Отдельный бинарник zipalign не нужен — делаем это на Python.
python3 "$HERE/tools/zipalign.py" "$WORK/unaligned.apk" "$WORK/aligned.apk" 4

say "подпись (apksigner, v1+v2+v3)"
rm -f "$WORK/signed.apk"
"$JAVA" -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --min-sdk-version "$MIN_SDK" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$WORK/signed.apk" "$WORK/aligned.apk" 2>/dev/null

say "проверка подписи"
"$JAVA" -jar "$APKSIGNER_JAR" verify --verbose "$WORK/signed.apk" 2>/dev/null | head -8

cp "$WORK/signed.apk" "$OUT"
say "готово: $OUT ($(du -h "$OUT" | cut -f1))"

# Краткая сводка содержимого
python3 - "$OUT" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
print(f"  файлов в APK: {len(names)}")
for must in ('AndroidManifest.xml', 'classes.dex', 'resources.arsc'):
    print(f"  {'✓' if must in names else '✗'} {must}")
for n in sorted(names):
    if n.startswith('assets/www/'):
        print(f"    {n}  ({z.getinfo(n).file_size} Б)")
PY
