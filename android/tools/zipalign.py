#!/usr/bin/env python3
"""zipalign для APK без Android SDK.

Android требует, чтобы НЕСЖАТЫЕ (stored) записи внутри APK начинались с
выровненного абсолютного смещения: 4 байта для ресурсов и 4096 для
нативных библиотек .so. Официальный `zipalign` пересобирает zip, добавляя
к локальному заголовку каждого файла «пустое» extra-поле такой длины,
чтобы данные легли на нужную границу.

Здесь то же самое делается вручную: локальные заголовки, данные, центральный
каталог и EOCD пишутся напрямую, поэтому выравнивание считается от реального
смещения в файле (zipfile этого не умеет — он не знает будущий офсет).

Использование:
    python3 zipalign.py вход.apk выход.apk [выравнивание=4]

Код возврата 0 — успех, 1 — ошибка, 2 — неверные аргументы.
Проверка: `python3 zipalign.py --check файл.apk [выравнивание]`.
"""
import struct
import sys
import zipfile
import zlib

# Нативные библиотеки выравниваем на 4096 — этого достаточно для любой версии
# Android (16 КБ нужно лишь на устройствах с 16-КБ страницами памяти, а .so
# в этом приложении отсутствуют вовсе).
SO_ALIGN = 4096

# Поля, которые переносим в новый заголовок как есть.
LOCAL_FMT = "<IHHHHHIIIHH"   # signature..extra_len
# signature, ver_made, ver_need, flags, method, time, date, crc,
# csize, usize, nlen, elen, clen, disk, int_attr, ext_attr, offset
CENTRAL_FMT = "<IHHHHHHIIIHHHHHII"


def align_of(name: str, default: int) -> int:
    return SO_ALIGN if name.endswith(".so") else default


def make_extra(offset: int, name_len: int, align: int) -> bytes:
    """Extra-поле такой длины, чтобы данные встали на границу align.

    Заголовок локального файла: 30 байт + имя + extra; данные — сразу после.
    """
    base = offset + 30 + name_len
    pad = (-base) % align
    if pad == 0:
        return b""
    if pad < 4:                 # минимальное extra-поле — 4 байта (id + размер)
        pad += align
    payload = pad - 4
    # id 0xD935 — тот же «пустой» блок, что использует официальный zipalign
    return struct.pack("<HH", 0xD935, payload) + b"\x00" * payload


def read_local_header(fp, info):
    """Читает исходный локальный заголовок, чтобы сохранить флаги и метод."""
    fp.seek(info.header_offset)
    raw = fp.read(30)
    (sig, ver, flags, method, mtime, mdate, crc, csize, usize,
     nlen, elen) = struct.unpack(LOCAL_FMT, raw)
    assert sig == 0x04034B50, f"битый локальный заголовок у {info.filename}"
    name = fp.read(nlen)
    extra = fp.read(elen)
    fp.seek(info.header_offset + 30 + nlen + elen)
    data = fp.read(csize)
    return dict(ver=ver, flags=flags, method=method, mtime=mtime, mdate=mdate,
                crc=crc, csize=csize, usize=usize, name=name, extra=extra,
                data=data), info.header_offset


def realign(src: str, dst: str, default: int) -> int:
    with zipfile.ZipFile(src) as zin:
        infos = zin.infolist()
        comment = zin.comment

    out = open(dst, "w+b")
    central = []
    try:
        with open(src, "rb") as fp:
            for info in infos:
                hdr, _ = read_local_header(fp, info)
                name = hdr["name"]
                align = align_of(info.filename, default)

                offset = out.tell()
                # Сжатые записи выравнивать не требуется.
                if hdr["method"] != 0 or align <= 1:
                    extra = b""      # оставляем заголовок «как есть» по длине
                    if hdr["extra"]:
                        extra = hdr["extra"]
                else:
                    extra = make_extra(offset, len(name), align)

                flags = hdr["flags"]
                local = struct.pack(
                    LOCAL_FMT, 0x04034B50, hdr["ver"], flags, hdr["method"],
                    hdr["mtime"], hdr["mdate"], hdr["crc"],
                    hdr["csize"], hdr["usize"],
                    len(name), len(extra))
                out.write(local)
                out.write(name)
                out.write(extra)
                out.write(hdr["data"])

                central.append(struct.pack(
                    CENTRAL_FMT,
                    0x02014B50,
                    (info.create_system << 8) | info.create_version,
                    hdr["ver"], flags, hdr["method"],
                    hdr["mtime"], hdr["mdate"], hdr["crc"],
                    hdr["csize"], hdr["usize"],
                    len(name), len(extra), 0, 0, 0,
                    info.external_attr >> 16 if info.create_system == 3 else 0,
                    offset) + name + extra)

        cd_start = out.tell()
        for c in central:
            out.write(c)
        cd_size = out.tell() - cd_start
        out.write(struct.pack(
            "<IHHHHIIH",
            0x06054B50, 0, 0,
            len(central), len(central),
            cd_size, cd_start,
            len(comment)))
        out.write(comment)
    finally:
        out.close()
    return check_offsets(dst, default)


def check_offsets(apk: str, default: int) -> int:
    """Читает APK заново и убеждается, что stored-записи выровнены."""
    bad = []
    with zipfile.ZipFile(apk) as z:
        for i in z.infolist():
            if i.compress_type != zipfile.ZIP_STORED:
                continue
            align = align_of(i.filename, default)
            if align <= 1:
                continue
            with open(apk, "rb") as f:
                f.seek(i.header_offset + 26)
                nlen, elen = struct.unpack("<HH", f.read(4))
            off = i.header_offset + 30 + nlen + elen
            if off % align:
                bad.append(f"{i.filename}: смещение {off} не кратно {align}")
    for b in bad:
        print(f"  ✗ {b}", file=sys.stderr)
    return 1 if bad else 0


def main() -> int:
    args = [a for a in sys.argv[1:]]
    if args[:1] == ["--check"]:
        if len(args) < 2:
            print(__doc__)
            return 2
        return check_offsets(args[1], int(args[2]) if len(args) > 2 else 4)
    if len(args) < 2:
        print(__doc__)
        return 2
    return realign(args[0], args[1], int(args[2]) if len(args) > 2 else 4)


if __name__ == "__main__":
    sys.exit(main())
