#!/usr/bin/env python3
"""PLM & ERP – Pipsta AP1400 Belegdruck (ESC/POS, direkter USB-Gerätezugriff)
Umgeht den Windows-Spooler vollständig.
pip install pywin32
Aufruf:  py print_receipt.py --data '{"name":"...","number":"...","params":{...},"price":9.90}'
"""
import sys
import json
import argparse
import winreg
from datetime import datetime

try:
    import win32file
    import win32con
    import win32print
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

# ── USB-Drucker-Gerätepfad aus Registry ──────────────────────
# GUID_DEVINTERFACE_USBPRINT: Schnittstelle für USB-Druckergeräte
GUID_USBPRINT = '{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'

def find_usb_printer_paths():
    """Alle USB-Drucker-Gerätepfade aus der Registry lesen."""
    base = r'SYSTEM\CurrentControlSet\Control\DeviceClasses\{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'
    paths = []
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base)
    except OSError:
        return paths

    i = 0
    while True:
        try:
            subname = winreg.EnumKey(key, i)
            i += 1
        except OSError:
            break
        try:
            sub = winreg.OpenKey(key, subname + r'\#')
            sym = winreg.QueryValueEx(sub, 'SymbolicLink')[0]
            winreg.CloseKey(sub)
            if sym:
                paths.append(sym)
        except OSError:
            pass

    winreg.CloseKey(key)
    return paths

def print_direct_usb(data):
    """Schreibt ESC/POS direkt auf das USB-Gerät (kein Spooler)."""
    paths = find_usb_printer_paths()
    if not paths:
        raise RuntimeError(
            "Kein USB-Drucker-Interface in Registry gefunden "
            "(GUID_DEVINTERFACE_USBPRINT). Drucker eingesteckt?"
        )

    errors = []
    for path in paths:
        try:
            h = win32file.CreateFile(
                path,
                win32con.GENERIC_WRITE,
                win32con.FILE_SHARE_READ | win32con.FILE_SHARE_WRITE,
                None,
                win32con.OPEN_EXISTING,
                0,
                None
            )
            win32file.WriteFile(h, data)
            win32file.CloseHandle(h)
            return path  # Erfolg
        except Exception as ex:
            errors.append(f"{path}: {ex}")

    raise RuntimeError("USB-Direktzugriff fehlgeschlagen:\n" + "\n".join(errors))

# ── Fallback: Windows-Spooler ─────────────────────────────────
def find_printer_name(preferred=''):
    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )]
    if not printers:
        raise RuntimeError("Kein Drucker in Windows gefunden.")
    if preferred:
        for p in printers:
            if preferred.lower() in p.lower():
                return p
    for kw in ['pipsta', 'ap1400', 'generic', 'text']:
        for p in printers:
            if kw in p.lower():
                return p
    return printers[0]

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
    parser = argparse.ArgumentParser()
    parser.add_argument('--data',    required=True)
    parser.add_argument('--printer', default='')
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as ex:
        print(f"FEHLER: Ungültiges JSON – {ex}", file=sys.stderr)
        sys.exit(1)

    try:
        receipt = build_receipt(data)

        # 1. Direkt auf USB-Gerät schreiben (kein Spooler)
        try:
            used_path = print_direct_usb(receipt)
            print(f"OK: Beleg direkt gedruckt via {used_path}")
            return
        except Exception as usb_err:
            print(f"INFO: USB-Direktzugriff fehlgeschlagen: {usb_err}", file=sys.stderr)

        # 2. Spooler-Fallback
        printer_name = find_printer_name(args.printer)
        try:
            print_via_spooler(printer_name, receipt)
            print(f"OK: Beleg via Spooler gedruckt auf '{printer_name}'")
        except Exception as spool_err:
            raise RuntimeError(
                f"Spooler '{printer_name}': {spool_err}\n"
                f"(USB-Direktzugriff hatte auch versagt – siehe oben)"
            )

    except Exception as ex:
        print(f"FEHLER: {ex}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
