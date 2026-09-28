#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocr_scanned_hebrew_pdf.py — OCR לספר עברי סרוק (תמונות בלבד, ללא שכבת טקסט).

הבעיה
-----
ספרים סרוקים רבים נשמרים ב-PDF כתמונות JPEG בלבד. `pdftotext` מחזיר אפס
תווים. בנוסף, סריקות רבות **מסובבות 90°** — מה שמייצר "ג'יבריש" מוחלט
במנוע OCR, עם המון ספרות ואותיות לטיניות במקום עברית.

הפתרון
------
1. חילוץ התמונה המוטבעת מכל עמוד (PyMuPDF) — ברזולוציה המקורית, בלי דגימה מחדש.
2. **זיהוי סיבוב אוטומטי**: מריצים OCR על 0°/90°/180°/270° ובוחרים את הזווית
   שמניבה את **המספר הרב ביותר של אותיות עבריות**. זו שיטה עמידה בהרבה
   מניסיון "לראות" את העמוד.
3. סף אוטומטי (Otsu) — משפר דרמטית סריקות דהויות.
4. Tesseract עם מודל `heb` במוד `--psm 6`.

דרישות מקדימות
--------------
    pip install pymupdf opencv-python
וכן קובץ מודל `heb.traineddata` (מ-tessdata_best) בתיקיית tessdata מקומית:

    https://github.com/tesseract-ocr/tessdata_best/raw/main/heb.traineddata

הרצה
----
    python tools/ocr_scanned_hebrew_pdf.py input.pdf output_dir \
        --tessdata /path/to/tessdata \
        --tesseract "C:/Program Files/Tesseract-OCR/tesseract.exe"

הפלט: `page-01.txt`, `page-02.txt`, ... וכן `all.txt` מאוחד.

אזהרה: OCR אינו מושלם. סריקות עבריות עם ניקוד/כתב רש"י עלולות לשבש תווים
דומים (ס↔פ, ו↔ן). יש לקרוא את הפלט בזהירות ולא להסתמך עליו כציטוט מלולי.
"""

import argparse
import os
import subprocess
import sys
import tempfile

try:
    import fitz                      # PyMuPDF
    import cv2
except ImportError as e:             # pragma: no cover
    sys.exit("חסרה תלויה: %s. התקן עם: pip install pymupdf opencv-python" % e)

# זוויות לניסיון, בסדר סביר: עמוד ישר נפוץ יותר, אך סריקות מסובבות שכיחות.
ANGLES = [None, cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE]
ANGLE_NAMES = {None: '0', cv2.ROTATE_90_CLOCKWISE: '90', cv2.ROTATE_180: '180',
               cv2.ROTATE_90_COUNTERCLOCKWISE: '270'}


def hebrew_letters(text):
    return sum(1 for c in text if '\u0590' <= c <= '\u05FF')


def extract_page_image(doc, index):
    """מחלץ את התמונה המוטבעת בעמוד. אם אין — מרנדר את העמוד."""
    page = doc[index]
    images = page.get_images(full=True)
    if images:
        xref = images[0][0]
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:                       # CMYK וכדומה
            pix = fitz.Pixmap(fitz.csRGB, pix)
        data = pix.tobytes("png")
        import numpy as np
        arr = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
        if arr is not None:
            return arr
    # נפילה חזרה: רינדור ברזולוציה גבוהה
    pm = page.get_pixmap(dpi=300)
    import numpy as np
    arr = cv2.imdecode(np.frombuffer(pm.tobytes("png"), dtype=np.uint8),
                       cv2.IMREAD_GRAYSCALE)
    return arr


def run_tesseract(gray, tesseract, tessdata, psm):
    """שומר PNG זמני ומריץ tesseract; מחזיר את הטקסט."""
    with tempfile.TemporaryDirectory() as tmp:
        png = os.path.join(tmp, 'p.png')
        out = os.path.join(tmp, 'o')
        cv2.imwrite(png, gray)
        cmd = [tesseract, png, out, '-l', 'heb', '--psm', str(psm)]
        if tessdata:
            cmd += ['--tessdata-dir', tessdata]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        path = out + '.txt'
        if not os.path.exists(path):
            return ''
        with open(path, encoding='utf-8', errors='replace') as fh:
            return fh.read()


def ocr_page(gray, tesseract, tessdata, psm, angles=None):
    """בוחר את הסיבוב שמייצר הכי הרבה עברית, ומחזיר (טקסט, שם-זווית)."""
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    best = ('', '0', -1)
    for angle in (angles if angles is not None else ANGLES):
        img = binary if angle is None else cv2.rotate(binary, angle)
        text = run_tesseract(img, tesseract, tessdata, psm)
        count = hebrew_letters(text)
        if count > best[2]:
            best = (text, ANGLE_NAMES[angle], count)
    return best[0], best[1], best[2]


def main(argv=None):
    ap = argparse.ArgumentParser(description='OCR לספר עברי סרוק ב-PDF')
    ap.add_argument('pdf')
    ap.add_argument('outdir')
    ap.add_argument('--tesseract', default='tesseract')
    ap.add_argument('--tessdata', default=None)
    ap.add_argument('--psm', type=int, default=6,
                    help='מצב חלוקה של Tesseract (ברירת מחדל 6: גוש טקסט אחיד)')
    ap.add_argument('--rotate', default='auto',
                    help="'auto' (ברירת מחדל), או '0'/'90'/'180'/'270' לכפייה")
    ap.add_argument('--first', type=int, default=1)
    ap.add_argument('--last', type=int, default=0, help='0 = עד הסוף')
    args = ap.parse_args(argv)

    forced = None
    if args.rotate in ('0', '90', '180', '270'):
        forced = {'0': [None], '90': [cv2.ROTATE_90_CLOCKWISE],
                  '180': [cv2.ROTATE_180],
                  '270': [cv2.ROTATE_90_COUNTERCLOCKWISE]}[args.rotate]

    os.makedirs(args.outdir, exist_ok=True)
    doc = fitz.open(args.pdf)
    last = args.last or doc.page_count

    chunks = []
    for i in range(args.first - 1, min(last, doc.page_count)):
        gray = extract_page_image(doc, i)
        if gray is None:
            sys.stderr.write('עמוד %d: לא ניתן לחלץ תמונה\n' % (i + 1))
            continue
        text, angle, count = ocr_page(gray, args.tesseract, args.tessdata,
                                      args.psm, forced)
        name = os.path.join(args.outdir, 'page-%02d.txt' % (i + 1))
        with open(name, 'w', encoding='utf-8') as fh:
            fh.write(text)
        chunks.append('\n===== PAGE %d =====\n' % (i + 1) + text)
        sys.stderr.write('עמוד %-3d סיבוב=%-4s עברית=%d\n' % (i + 1, angle, count))

    with open(os.path.join(args.outdir, 'all.txt'), 'w', encoding='utf-8') as fh:
        fh.write(''.join(chunks))
    sys.stderr.write('\nנכתבו %d קבצים אל %s\n' % (len(chunks), args.outdir))


if __name__ == '__main__':
    main()
