#!/usr/bin/env python3
"""PLM & ERP – Pipsta Classic Belegdruck
Aufruf: py print_receipt.py --data '{"name":"...","number":"...","params":{...},"price":9.90}'
"""
import sys
import json
import argparse
from datetime import datetime

try:
    import usb.core
    import usb.util
except ImportError:
    print("FEHLER: pyusb nicht installiert. Bitte ausfuehren: pip install pyusb", file=sys.stderr)
    sys.exit(2)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("FEHLER: Pillow nicht installiert. Bitte ausfuehren: pip install Pillow", file=sys.stderr)
    sys.exit(2)

# ── Pipsta Classic USB-Konstanten ─────────────────────────────
VID            = 0x0483   # STMicroelectronics
PID            = 0xa052   # Pipsta Classic
PRINT_WIDTH    = 384      # Druckbreite in Pixeln
BYTES_PER_LINE = PRINT_WIDTH // 8  # 48 Bytes pro Zeile
FEED_LINES     = 10       # Leerzeilen am Ende (Papierschub)

# ── Drucker initialisieren ────────────────────────────────────
def get_printer_ep():
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        raise RuntimeError(
            f"Pipsta Classic nicht gefunden (VID=0x{VID:04x} PID=0x{PID:04x}). "
            "Ist der Drucker angeschlossen und der WinUSB-Treiber installiert (Zadig)?"
        )
    # Windows: Treiber wird nicht losgeloest (nur Linux noetig)
    try:
        if dev.is_kernel_driver_active(0):
            dev.detach_kernel_driver(0)
    except Exception:
        pass
    try:
        dev.set_configuration()
    except usb.core.USBError:
        pass  # Bereits konfiguriert
    cfg  = dev.get_active_configuration()
    intf = cfg[(0, 0)]
    ep   = usb.util.find_descriptor(
        intf,
        custom_match=lambda e:
            usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
    )
    if ep is None:
        raise RuntimeError("USB Output-Endpoint nicht gefunden")
    return ep

# ── Bild zum Drucker senden ───────────────────────────────────
def send_image(ep, img):
    img = img.convert('1')  # 1-Bit monochrom
    blank = bytes(BYTES_PER_LINE)
    # 2 Leerzeilen als oberer Rand
    for _ in range(2):
        ep.write(blank, timeout=2000)
    for y in range(img.height):
        row = bytearray(BYTES_PER_LINE)
        for x in range(PRINT_WIDTH):
            if img.getpixel((x, y)) == 0:  # Schwarzer Pixel
                row[x >> 3] |= 0x80 >> (x & 7)
        ep.write(bytes(row), timeout=3000)
    # Papierschub am Ende
    for _ in range(FEED_LINES):
        ep.write(blank, timeout=1000)

# ── Schriftarten laden ────────────────────────────────────────
def load_font(size, bold=False):
    # Windows-Systemfonts (monospace bevorzugt fuer saubere Ausrichtung)
    candidates = (
        ['consolab.ttf', 'courbd.ttf', 'consola.ttf', 'cour.ttf', 'lucon.ttf']
        if bold else
        ['consola.ttf', 'cour.ttf', 'lucon.ttf', 'consolab.ttf', 'courbd.ttf']
    )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            pass
    return ImageFont.load_default()

# ── Beleg-Bild aufbauen ───────────────────────────────────────
def build_receipt(data):
    W   = PRINT_WIDTH
    PAD = 8

    f_title  = load_font(20, bold=True)
    f_bold   = load_font(15, bold=True)
    f_normal = load_font(14)
    f_small  = load_font(12)
    f_price  = load_font(18, bold=True)

    SEP = '─' * 34

    now    = datetime.now().strftime('%d.%m.%Y  %H:%M')
    name   = data.get('name') or '—'
    number = data.get('number') or ''
    desc   = data.get('desc') or ''
    qty    = data.get('qty', 1)
    unit   = data.get('unit', 'Stk')
    price  = data.get('price')
    params = data.get('params') or {}

    # Zeilen: (text, font, zentriert, margin_top)
    rows = [
        ('PLM & ERP',           f_bold,   True,  6),
        (now,                   f_small,  True,  2),
        (SEP,                   f_small,  True,  4),
    ]
    if number:
        rows.append((number,    f_bold,   False, 8))
    rows.append((name,          f_title,  False, 2))
    if desc and desc != name:
        rows.append((desc,      f_normal, False, 2))
    rows.append((f'Menge: {qty} {unit}', f_normal, False, 4))
    rows.append((SEP,           f_small,  True,  6))

    if params:
        rows.append(('DRUCKPARAMETER', f_bold, False, 2))
        rows.append(('',              f_small, False, 1))
        for label, val in params.items():
            if val and str(val).strip() not in ('', '—', 'None'):
                rows.append((f'{label}: {val}', f_normal, False, 1))
        rows.append((SEP, f_small, True, 6))

    if price is not None:
        rows.append((f'Preis:  CHF {float(price):.2f}', f_price, False, 4))
        rows.append((SEP, f_small, True, 6))

    # Hoehe berechnen
    tmp   = Image.new('RGB', (W, 100), 'white')
    tdraw = ImageDraw.Draw(tmp)
    line_heights = []
    total_h = PAD
    for (text, font, _, mt) in rows:
        if text:
            bb = tdraw.textbbox((0, 0), text, font=font)
            h  = bb[3] - bb[1]
        else:
            h = 4
        line_heights.append(h)
        total_h += mt + h
    total_h += PAD

    # Bild zeichnen
    img  = Image.new('1', (W, total_h), 1)   # weisser Hintergrund
    draw = ImageDraw.Draw(img)
    y = PAD
    for i, (text, font, center, mt) in enumerate(rows):
        y += mt
        if text:
            if center:
                bb = draw.textbbox((0, 0), text, font=font)
                x  = max(0, (W - (bb[2] - bb[0])) // 2)
            else:
                x = PAD + 4
            draw.text((x, y), text, font=font, fill=0)
        y += line_heights[i]

    return img

# ── Einstiegspunkt ────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='PLM Pipsta Belegdruck')
    parser.add_argument('--data', required=True,
                        help='JSON: {"name":…,"number":…,"params":{…},"price":…}')
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as e:
        print(f"FEHLER: Ungültiges JSON – {e}", file=sys.stderr)
        sys.exit(1)

    try:
        ep  = get_printer_ep()
        img = build_receipt(data)
        send_image(ep, img)
        print(f"OK: {data.get('number') or data.get('name')} gedruckt ({img.height} Zeilen)")
    except Exception as e:
        print(f"FEHLER: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
