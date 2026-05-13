#!/usr/bin/env python3
"""PLM & ERP – Pipsta AP1400 Belegdruck (ESC/POS via Windows-Druckerspooler)
Einrichtung: Drucker als "Generic / Text Only" auf Port USB001 in Windows anlegen.
             pip install pywin32
Aufruf:  py print_receipt.py --data '{"name":"...","number":"...","params":{...},"price":9.90}'
"""
import sys
import json
import argparse
from datetime import datetime

try:
    import win32print
except ImportError:
    print("FEHLER: pywin32 nicht installiert. Bitte ausfuehren: pip install pywin32", file=sys.stderr)
    sys.exit(2)

# ── ESC/POS Befehle ───────────────────────────────────────────
ESC = b'\x1b'
GS  = b'\x1d'

INIT      = ESC + b'\x40'          # Drucker initialisieren
ALIGN_L   = ESC + b'\x61\x00'      # Linksbündig
ALIGN_C   = ESC + b'\x61\x01'      # Zentriert
BOLD_ON   = ESC + b'\x45\x01'      # Fett an
BOLD_OFF  = ESC + b'\x45\x00'      # Fett aus
FONT_A    = ESC + b'\x4d\x00'      # Normal (~32 Zeichen/Zeile)
FONT_B    = ESC + b'\x4d\x01'      # Klein  (~42 Zeichen/Zeile)
DBL_H_ON  = GS  + b'\x21\x01'     # Doppelte Höhe an
DBL_H_OFF = GS  + b'\x21\x00'     # Doppelte Höhe aus
NL        = b'\x0a'                # Zeilenumbruch
CUT       = GS  + b'\x56\x42\x40' # Teilschnitt (mit Papiervorschub)

LINE_W = 32  # Zeichen pro Zeile bei 58mm Papier, Font A

def e(text):
    """Text zu Bytes (CP437 für Thermodrucker)"""
    return str(text).encode('cp437', errors='replace')

def sep():
    return e('-' * LINE_W) + NL

def row(text='', align=ALIGN_L, bold=False, small=False, tall=False):
    out  = align
    out += BOLD_ON  if bold  else b''
    out += FONT_B   if small else b''
    out += DBL_H_ON if tall  else b''
    out += e(str(text)) + NL
    out += DBL_H_OFF if tall  else b''
    out += FONT_A    if small else b''
    out += BOLD_OFF  if bold  else b''
    return out

def lr(label, value, width=LINE_W):
    """Zeile mit Label links, Wert rechts"""
    lbl = str(label)[:width - 10]
    val = str(value)
    pad = max(1, width - len(lbl) - len(val))
    return e(lbl + ' ' * pad + val) + NL

# ── Beleg zusammenbauen ───────────────────────────────────────
def build_receipt(data):
    name   = data.get('name')   or '—'
    number = data.get('number') or ''
    desc   = data.get('desc')   or ''
    qty    = data.get('qty', 1)
    unit   = data.get('unit', 'Stk')
    price  = data.get('price')
    params = data.get('params') or {}
    now    = datetime.now().strftime('%d.%m.%Y  %H:%M')

    out = INIT + ALIGN_L

    # ── Kopfzeile
    out += row('PLM & ERP', align=ALIGN_C, bold=True)
    out += row(now,          align=ALIGN_C, small=True)
    out += sep()

    # ── Bauteil
    if number:
        out += row(number, bold=True)
    out += row(name, align=ALIGN_L, bold=True, tall=True)
    if desc and desc != name:
        out += row(desc, small=True)
    out += row(f'Menge: {qty} {unit}')
    out += sep()

    # ── Druckparameter
    if params:
        out += row('DRUCKPARAMETER', bold=True)
        for label, val in params.items():
            val_str = str(val).strip()
            if val_str and val_str not in ('', '-', 'None'):
                out += lr(str(label)[:14], val_str[:16])
        out += sep()

    # ── Preis
    if price is not None:
        out += row(f'CHF {float(price):.2f}', align=ALIGN_C, bold=True, tall=True)
        out += sep()

    # ── Abschluss
    out += NL * 3
    out += CUT
    return out

# ── Windows-Drucker finden ────────────────────────────────────
def find_printer(preferred=''):
    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )]
    if not printers:
        raise RuntimeError(
            "Kein Drucker in Windows gefunden.\n"
            "Bitte Drucker einrichten: Einstellungen → Drucker & Scanner → "
            "Drucker hinzufügen → Lokal → USB001 → Generic / Text Only"
        )
    if preferred:
        for p in printers:
            if preferred.lower() in p.lower():
                return p
    for kw in ['pipsta', 'ap1400', 'generic', 'text only']:
        for p in printers:
            if kw in p.lower():
                return p
    return printers[0]  # Fallback: erster verfügbarer Drucker

# ── Druckauftrag senden ───────────────────────────────────────
def print_raw(printer_name, data):
    h = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(h, 1, ("PLM Beleg", None, "RAW"))
        try:
            win32print.StartPagePrinter(h)
            win32print.WritePrinter(h, data)
            win32print.EndPagePrinter(h)
        finally:
            win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)

# ── Einstiegspunkt ────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='PLM Pipsta AP1400 Belegdruck')
    parser.add_argument('--data',    required=True,
                        help='JSON: name, number, desc, qty, unit, price, params')
    parser.add_argument('--printer', default='',
                        help='Windows-Druckername (optional, sonst Auto-Erkennung)')
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as e:
        print(f"FEHLER: Ungültiges JSON – {e}", file=sys.stderr)
        sys.exit(1)

    try:
        printer = find_printer(args.printer)
        receipt = build_receipt(data)
        print_raw(printer, receipt)
        print(f"OK: Beleg gedruckt auf '{printer}'")
    except Exception as e:
        print(f"FEHLER: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
