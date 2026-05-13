#!/usr/bin/env python3
"""PLM & ERP – Pipsta AP1400 Belegdruck (ESC/POS, direkter USB-Port-Zugriff)
Umgeht den Windows-Spooler – schreibt direkt auf den USB-Druckerport.
Einrichtung: Drucker als "Generic / Text Only" auf USB001 anlegen (nur um den
             Port zu reservieren; der Spooler wird nicht verwendet).
             pip install pywin32
Aufruf:  py print_receipt.py --data '{"name":"...","number":"...","params":{...},"price":9.90}'
"""
import sys
import json
import argparse
from datetime import datetime

try:
    import win32print
    import win32file
    import win32con
except ImportError:
    print("FEHLER: pywin32 nicht installiert. Bitte ausfuehren: pip install pywin32", file=sys.stderr)
    sys.exit(2)

# ── ESC/POS Befehle ───────────────────────────────────────────
ESC = b'\x1b'
GS  = b'\x1d'

INIT      = ESC + b'\x40'
ALIGN_L   = ESC + b'\x61\x00'
ALIGN_C   = ESC + b'\x61\x01'
BOLD_ON   = ESC + b'\x45\x01'
BOLD_OFF  = ESC + b'\x45\x00'
FONT_A    = ESC + b'\x4d\x00'
FONT_B    = ESC + b'\x4d\x01'
DBL_H_ON  = GS  + b'\x21\x01'
DBL_H_OFF = GS  + b'\x21\x00'
NL        = b'\x0a'
CUT       = GS  + b'\x56\x42\x40'

LINE_W = 32

def e(text):
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
    out += row('PLM & ERP', align=ALIGN_C, bold=True)
    out += row(now,          align=ALIGN_C, small=True)
    out += sep()

    if number:
        out += row(number, bold=True)
    out += row(name, align=ALIGN_L, bold=True, tall=True)
    if desc and desc != name:
        out += row(desc, small=True)
    out += row(f'Menge: {qty} {unit}')
    out += sep()

    if params:
        out += row('DRUCKPARAMETER', bold=True)
        for label, val in params.items():
            val_str = str(val).strip()
            if val_str and val_str not in ('', '-', 'None'):
                out += lr(str(label)[:14], val_str[:16])
        out += sep()

    if price is not None:
        out += row(f'CHF {float(price):.2f}', align=ALIGN_C, bold=True, tall=True)
        out += sep()

    out += NL * 3
    out += CUT
    return out

# ── Drucker-Port ermitteln ────────────────────────────────────
def get_printer_port(preferred=''):
    """Gibt (druckername, portname) zurück, z.B. ('Pipsta AP1400', 'USB001')"""
    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )]
    if not printers:
        raise RuntimeError("Kein Drucker in Windows gefunden.")

    # Drucker nach Name auswählen
    chosen = None
    if preferred:
        for p in printers:
            if preferred.lower() in p.lower():
                chosen = p
                break
    if not chosen:
        for kw in ['pipsta', 'ap1400', 'generic', 'text']:
            for p in printers:
                if kw in p.lower():
                    chosen = p
                    break
            if chosen:
                break
    if not chosen:
        chosen = printers[0]

    # Port-Name aus den Druckereigenschaften lesen
    h = win32print.OpenPrinter(chosen)
    try:
        info = win32print.GetPrinter(h, 2)
        port = info['pPortName']  # z.B. 'USB001'
    finally:
        win32print.ClosePrinter(h)

    return chosen, port

# ── Direkt auf USB-Port schreiben (Spooler umgehen) ──────────
def print_direct(port, data):
    # Schreibt ESC/POS-Daten direkt auf den Port (z.B. USB001) - kein Spooler.
    device = r'\\.\{}'.format(port)
    h = win32file.CreateFile(
        device,
        win32con.GENERIC_WRITE,
        0,
        None,
        win32con.OPEN_EXISTING,
        0,
        None
    )
    if h == win32file.INVALID_HANDLE_VALUE:
        raise RuntimeError(f"Port {device} konnte nicht geoeffnet werden.")
    try:
        win32file.WriteFile(h, data)
    finally:
        win32file.CloseHandle(h)

# ── Fallback: über Windows-Spooler drucken ───────────────────
def print_via_spooler(printer_name, data):
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
    parser.add_argument('--port',    default='',
                        help='Direkt-Port z.B. USB001 (optional, sonst aus Druckerkonfig)')
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as ex:
        print(f"FEHLER: Ungültiges JSON – {ex}", file=sys.stderr)
        sys.exit(1)

    try:
        printer_name, port = get_printer_port(args.printer)
        if args.port:
            port = args.port
        receipt = build_receipt(data)

        # Erst direkten Zugriff versuchen, dann Spooler als Fallback
        try:
            print_direct(port, receipt)
            print(f"OK: Beleg direkt auf Port {port} gedruckt (Drucker: '{printer_name}')")
        except Exception as direct_err:
            print(f"INFO: Direktzugriff fehlgeschlagen ({direct_err}), versuche Spooler...", file=sys.stderr)
            print_via_spooler(printer_name, receipt)
            print(f"OK: Beleg via Spooler gedruckt auf '{printer_name}'")

    except Exception as ex:
        print(f"FEHLER: {ex}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
