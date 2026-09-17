#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_hebrew_pdf.py — חילוץ טקסט עברי מ-PDF שסבל מקידוד גופנים פגום.

רקע
----
חלק מהספרים העבריים (בעיקר כאלה שהופקו בתוכנות סְפָרִים ותיקות) נשמרים
ב-PDF עם גופנים subset שאין להם מיפוי Unicode תקני. התוצאה: `pdftotext`
ו-PyMuPDF מחזירים טקסט חסר — לרוב *כל האותיות הסופיות* (ם ן ץ ף ך) נעלמות,
וחלק מהעמודים מחזירים קודי בקרה (\x10) או אותיות לטיניות (Â, ‰, ˙).

הסקריפט הזה משחזר את הטקסט בארבעה שלבים:
  1. קורא את טבלאות ה-/Differences של כל גופן וממפה שמות גליפים עבריים
     (/memfinal, /nunfinal...) לאותיות. זה משחזר במדויק את *גוף* הספר.
  2. מזהה שני קידודים נוספים בגופני הכותרות: cp1255 שנקרא כ-cp1252,
     ו-Mac OS Hebrew שנקרא כ-MacRoman.
  3. בונה מודל ביגרמות מגוף הספר עצמו, ובאמצעותו קובע לכל גופן גם את
     *כיוון הטקסט* (לוגי/ויזואלי-הפוך) וגם את פענוח קודי הבקרה שנותרו.
  4. מרכיב שורות לפי קואורדינטות: הפרדה לעמודות, מיון y, מיון טווחים
     מימין-לשמאל, ורווח לפי המרווח הגיאומטרי בפועל.

הרצה
----
    python tools/extract_hebrew_pdf.py input.pdf output.txt

תלויות: PyMuPDF (fitz), pypdf.

הערה: PyMuPDF ו-pypdf נדרשים גם יחד — הראשון לחילוץ גיאומטרי מדויק
לכל גליף, והשני לקריאת מילוני ה-/Encoding של הגופנים.
"""

import sys
import math
import re
from collections import defaultdict, Counter

try:
    import fitz          # PyMuPDF
    import pypdf
except ImportError as e:  # pragma: no cover
    sys.exit("חסרה תלויה: %s. התקן עם: pip install pymupdf pypdf" % e)

# --------------------------------------------------------------------------
# 1. טבלאות מיפוי
# --------------------------------------------------------------------------

# שמות גליפים עבריים (מטבלאות /Differences) -> אות עברית
GLYPH2HEB = {
    'alef': 'א', 'bet': 'ב', 'gimel': 'ג', 'dalet': 'ד', 'he': 'ה', 'vav': 'ו',
    'zayin': 'ז', 'het': 'ח', 'tet': 'ט', 'yod': 'י', 'kaf': 'כ', 'kaffinal': 'ך',
    'lamed': 'ל', 'mem': 'מ', 'memfinal': 'ם', 'nun': 'נ', 'nunfinal': 'ן',
    'samekh': 'ס', 'ayin': 'ע', 'pe': 'פ', 'pefinal': 'ף', 'tsadi': 'צ',
    'tsadifinal': 'ץ', 'qof': 'ק', 'resh': 'ר', 'shin': 'ש', 'tav': 'ת',
    # סימני ניקוד
    'hiriq': '\u05B4', 'patah': '\u05B7', 'sheva': '\u05B0', 'qamats': '\u05B8',
    'holam': '\u05B9', 'tsere': '\u05B5', 'segol': '\u05B6', 'qubuts': '\u05BB',
    'dagesh': '\u05BC', 'pewithdagesh': 'פ\u05BC', 'betwithdagesh': 'ב\u05BC',
}

# שמות גליפים ASCII (סימני פיסוק וספרות) -> תו
STD2ASCII = {
    'hyphenminus': '-', 'hyphen': '-', 'quotedbl': '"', 'quotesingle': "'",
    'parenleft': '(', 'parenright': ')', 'asterisk': '*', 'comma': ',',
    'period': '.', 'slash': '/', 'colon': ':', 'semicolon': ';', 'equal': '=',
    'bracketleft': '[', 'bracketright': ']', 'zero': '0', 'one': '1', 'two': '2',
    'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7',
    'eight': '8', 'nine': '9', 'space': ' ',
}

PUNCT = set('.,;:()[]{}"\'*/=+-<>!?%#&@_|')

# Mac OS Hebrew (עברית של מקינטוש): 0xE0–0xFA, אותה פריסה כמו cp1255.
# ל-Python אין קודק 'mac_hebrew', ולכן הטבלה בנויה מפורשות.
_MAC_HEB_SEQ = ('\u05D0\u05D1\u05D2\u05D3\u05D4\u05D5\u05D6\u05D7\u05D8\u05D9'
                '\u05DA\u05DB\u05DC\u05DD\u05DE\u05DF\u05E0\u05E1\u05E2\u05E3'
                '\u05E4\u05E5\u05E6\u05E7\u05E8\u05E9\u05EA')
MAC_HEB = {0xE0 + i: ch for i, ch in enumerate(_MAC_HEB_SEQ)}


def _byte_map(src_enc):
    """מיפוי תו-כפי-שהוא-נקרא -> אות עברית, עבור קידוד עברי טיפוסי."""
    m = {}
    for b in range(0x80, 0x100):
        try:
            ch = bytes([b]).decode(src_enc)
        except Exception:
            continue
        if b in MAC_HEB:
            m[ch] = MAC_HEB[b]
    return m


CP_FROM_LATIN = _byte_map('cp1252')       # cp1255 שנקרא כ-cp1252
MAC_FROM_LATIN = _byte_map('mac_roman')   # MacHebrew שנקרא כ-MacRoman

HEB_LETTERS = 'אבגדהוזחטיךכלםמןנסעףפץצקרשת'
NIKUD = set('\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05B9\u05BA\u05BB\u05BC\u05BD\u05C1\u05C2')


def is_hebrew(ch):
    return '\u0590' <= ch <= '\u05FF'


# --------------------------------------------------------------------------
# 2. קריאת ה-PDF
# --------------------------------------------------------------------------

def parse_diffs(diffs):
    """ממיר מערך /Differences ל-{קוד: שם-גליף}."""
    out, code = {}, None
    for item in diffs:
        if isinstance(item, (int, float)):
            code = int(item)
        else:
            name = str(item).lstrip('/')
            if code is not None:
                out[code] = name
            code = (code or 0) + 1
    return out


def collect_differences(path):
    """{שם-גופן: מערך Differences} עבור כל הגופנים במסמך."""
    reader = pypdf.PdfReader(path)
    out = {}
    for page in reader.pages:
        try:
            fonts = page['/Resources']['/Font'].get_object()
        except Exception:
            continue
        for _key, ref in fonts.items():
            try:
                font = ref.get_object()
            except Exception:
                continue
            name = str(font.get('/BaseFont', '')).split('+')[-1]
            enc = font.get('/Encoding')
            try:
                enc = enc.get_object()
            except Exception:
                pass
            if isinstance(enc, dict) and '/Differences' in enc:
                out.setdefault(name, enc['/Differences'])
    return out


def load_lines(path, top_margin=155.0, bottom_margin=778.0, headers=None):
    """מחזיר רשימת עמודים; בכל עמוד רשימת שורות עם הטווחים שבהן.

    **הכותרות העליונות נשמרות לצד הגוף ולא נזרקות.** מעל `top_margin` יושבת
    הכותרת הרצה של הספר — ובה **מספור הפרקים** ("שיעורי טהרה — פרק כ"ב"),
    שאינו מופיע בגוף העמוד. בלעדיה אי אפשר לאמת מראי מקום לפי **פרק**. לכן,
    כשמעבירים רשימה ב-`headers`, נאספות שם שורות הכותרת של כל עמוד בנפרד
    (באותו מבנה שורה/טווחים, כדי ש-`render` יעבד אותן כדרך שהוא עובד על הגוף).

    :param headers: רשימה ריקה שתתמלא; כל אבר בה הוא רשימת שורות הכותרת של עמוד.
    """
    doc = fitz.open(path)
    pages = []
    for page in doc:
        lines = []
        page_headers = []
        for block in page.get_text('rawdict')['blocks']:
            if block['type'] != 0:
                continue
            for line in block['lines']:
                y = round(line['bbox'][1], 1)
                if y > bottom_margin:
                    continue      # מספרי עמוד
                spans = [{'font': s['font'], 'x': s['bbox'][0],
                          'x1': s['bbox'][2],
                          'chars': [c['c'] for c in s['chars']]}
                         for s in line['spans']]
                # הכותרת הרצה (מספור הפרק) נשמרת בנפרד ולא נכנסת לגוף.
                target = page_headers if y < top_margin else lines
                target.append({'y': y, 'spans': spans})
        pages.append(lines)
        if headers is not None:
            headers.append(page_headers)
    return pages


# --------------------------------------------------------------------------
# 3. פענוח לפי מצב
# --------------------------------------------------------------------------

def glyph_text(chars, gmap):
    """פענוח לפי שמות הגליפים שבטבלת Differences."""
    out = []
    for ch in chars:
        if ch == ' ' or is_hebrew(ch):
            out.append(ch)
            continue
        if ord(ch) == 0x20:
            out.append(' ')
            continue
        name = gmap.get(ord(ch))
        if name in GLYPH2HEB:
            out.append(GLYPH2HEB[name])
        elif name in STD2ASCII:
            out.append(STD2ASCII[name])
        elif ord(ch) < 0x20:
            pass                                  # קוד בקרה ללא שם — ילמד
        elif ch in PUNCT:
            out.append(ch)
        else:
            out.append('\uFFFD')
    return ''.join(out)


def latin_text(chars, table):
    """פענוח גופן שבו האותיות העבריות הוקלדו בקודי לטינית."""
    out = []
    for ch in chars:
        if ch == ' ':
            out.append(' ')
        elif is_hebrew(ch):
            out.append(ch)
        else:
            out.append(table.get(ch, '\uFFFD'))
    return ''.join(out)


def reverse_span(text):
    """היפוך טווח שנכתב בסדר ויזואלי, בלי להפוך רצפי ספרות."""
    return re.sub(r'\d+', lambda m: m.group(0)[::-1], text[::-1])


# --------------------------------------------------------------------------
# 4. מודל ביגרמות לבחירת מצב
# --------------------------------------------------------------------------

def build_bigram(texts):
    bg, total = Counter(), 0
    for text in texts:
        prev = None
        for ch in text:
            if ch == '\uFFFD':
                prev = None
                continue
            if prev is not None:
                bg[prev + ch] += 1
                total += 1
            prev = ch
    return bg, total


def score_text(text, bg, total):
    """ציון ממוצע-לוג-הסתברות. טקסט ריק מקבל -999 כדי שלא 'ינצח' בטעות."""
    acc, prev, n = 0.0, None, 0
    for ch in text:
        if ch == '\uFFFD':
            prev = None
            continue
        if prev is not None:
            acc += math.log((bg.get(prev + ch, 0) + 0.05) / (total + 2))
            n += 1
        prev = ch
    return -999.0 if n == 0 else acc / n


# --------------------------------------------------------------------------
# 5. הצינור הראשי
# --------------------------------------------------------------------------

def determine_modes(pages, gmaps, inventory):
    body_fonts = [f for f in inventory
                  if sum(1 for n in gmaps.get(f, {}).values() if n in GLYPH2HEB) >= 10]
    model = [glyph_text(s['chars'], gmaps[s['font']])
             for page in pages for line in page for s in line['spans']
             if s['font'] in body_fonts]
    bg, total = build_bigram(model)

    sample = defaultdict(list)
    for page in pages:
        for line in page:
            for s in line['spans']:
                if len(sample[s['font']]) < 400:
                    sample[s['font']].append(s)

    modes, extras = {}, {}
    for font, counter in inventory.items():
        gmap = gmaps.get(font, {})
        heb_glyphs = sum(1 for n in gmap.values() if n in GLYPH2HEB)
        heb_capable = (sum(1 for c in counter if is_hebrew(c))
                       + sum(1 for c in counter if c in CP_FROM_LATIN or c in MAC_FROM_LATIN)
                       + (1 if heb_glyphs >= 5 else 0))

        options = []
        if heb_glyphs >= 5:
            options += ['glyph', 'glyph_r']
        if sum(1 for n in gmap.values() if n in STD2ASCII) >= 3:
            options += ['glyph']
        options += ['cp', 'cp_r', 'mac', 'mac_r', 'raw']

        best = None
        for opt in options:
            rev = opt.endswith('_r')
            base = opt[:-2] if rev else opt
            chunks = []
            for s in sample[font]:
                chunks.append(_apply(s['chars'], base, gmap, None, rev))
            val = score_text(' '.join(chunks), bg, total)
            if best is None or val > best[0]:
                best = (val, opt)

        base = best[1][:-2] if best[1].endswith('_r') else best[1]
        rev = best[1].endswith('_r')

        # גופן פיסוק/ספרות טהור — אין בו עברית כלל; נשתמש בשמות הגליפים
        # כדי לפענח לפחות ספרות ומקפים.
        if heb_capable == 0:
            best = (0.0, 'glyph' if sum(1 for n in gmap.values() if n in STD2ASCII) >= 3
                    else 'raw')
            base = best[1]
            rev = False

        modes[font] = best[1]

        # לימוד קודי בקרה בודדים שנותרו (אלה שהחזיקו אותיות סופיות)
        if base in ('cp', 'mac', 'glyph') and heb_capable > 0:
            extra = {}
            candidates = [c for c, _ in counter.most_common() if ord(c) < 0x20]
            for code in candidates[:4]:
                choice = None
                for cand in list(HEB_LETTERS) + [' ']:
                    trial = dict(extra, **{code: cand})
                    chunks = [_apply(s['chars'], base, gmap, trial, rev)
                              for s in sample[font]]
                    val = score_text(' '.join(chunks), bg, total)
                    if choice is None or val > choice[0]:
                        choice = (val, cand)
                extra[code] = choice[1]
            if extra:
                extras[font] = extra
    return modes, extras


def _apply(chars, base, gmap, extra, rev):
    if base == 'glyph':
        text = glyph_text(chars, gmap)
    elif base == 'cp':
        text = latin_text(chars, CP_FROM_LATIN)
    elif base == 'mac':
        text = latin_text(chars, MAC_FROM_LATIN)
    else:
        text = ''.join(chars)
    if extra:
        text = ''.join(extra.get(c, c) for c in text)
    return reverse_span(text) if rev else text


def render(pages, modes, extras, gmaps, column_split=273.0):
    out = []
    for index, page in enumerate(pages):
        columns = {0: [], 1: []}
        for line in page:
            for s in line['spans']:
                item = dict(s)
                item['y'] = line['y']
                columns[0 if s['x'] < column_split else 1].append(item)
        out.append('\n===== PAGE %d =====' % (index + 1))
        # בספר עברי הנסרק בפריסה: העמוד הימני קודם.
        for label, key in (('RIGHT', 1), ('LEFT', 0)):
            if not columns[key]:
                continue
            groups = []
            for s in sorted(columns[key], key=lambda z: z['y']):
                if groups and abs(s['y'] - groups[-1][0]) < 4:
                    groups[-1][1].append(s)
                else:
                    groups.append((s['y'], [s]))
            out.append('--- %s ---' % label)
            for _y, spans in sorted(groups, key=lambda g: g[0]):
                buf, prev = '', None
                for s in sorted(spans, key=lambda z: -z['x']):
                    mode = modes.get(s['font'], 'ltr')
                    rev = mode.endswith('_r')
                    base = mode[:-2] if rev else mode
                    text = _apply(s['chars'], base, gmaps.get(s['font'], {}),
                                  extras.get(s['font']), rev)
                    if prev is not None and prev['x'] - s['x1'] > 1.0 \
                            and not buf.endswith(' ') and not text.startswith(' '):
                        buf += ' '
                    buf += text
                    prev = s
                text = re.sub(r' {2,}', ' ', buf).strip()
                if text:
                    out.append(text)
    return '\n'.join(out)


def main(argv):
    if len(argv) != 3:
        sys.exit(__doc__ + '\nשימוש: python tools/extract_hebrew_pdf.py input.pdf output.txt')
    src, dst = argv[1], argv[2]

    headers = []
    pages = load_lines(src, headers=headers)
    gmaps = {name: parse_diffs(d) for name, d in collect_differences(src).items()}
    inventory = defaultdict(Counter)
    # הכותרות נכנסות אף הן למניין הגופנים, שאם לא כן גופן שמופיע רק בכותרת
    # לא היה מקבל mode והפענוח היה נכשל בקריאה.
    for page in pages + headers:
        for line in page:
            for s in line['spans']:
                for ch in s['chars']:
                    inventory[s['font']][ch] += 1

    modes, extras = determine_modes(pages, gmaps, inventory)

    sys.stderr.write('%-16s %-9s %s\n' % ('FONT', 'MODE', 'CHARS'))
    for font, mode in sorted(modes.items()):
        sys.stderr.write('%-16s %-9s %d\n'
                         % (font, mode, sum(inventory[font].values())))

    text = render(pages, modes, extras, gmaps)
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(text)
    sys.stderr.write('\nנכתב: %s (%d תווים)\n' % (dst, len(text)))

    # הכותרות הרצות — מספור הפרקים — נכתבות כקובץ צד נפרד, בעמוד מול עמוד,
    # כדי שמראי מקום לפי פרק יהיו ניתנים לאימות בלי לפגוע בגוף החילוץ.
    header_text = render(headers, modes, extras, gmaps)
    if header_text.strip():
        hdst = dst + '.headers.txt'
        with open(hdst, 'w', encoding='utf-8') as fh:
            fh.write(header_text)
        sys.stderr.write('נכתבו כותרות הפרקים: %s\n' % hdst)


if __name__ == '__main__':
    main(sys.argv)
