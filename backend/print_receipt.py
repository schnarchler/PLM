#!/usr/bin/env python3
# PLM & ERP - Pipsta AP1400 Belegdruck (ESC/POS via PyUSB/WinUSB)
# Einrichtung: Zadig -> WinUSB fuer VID_0483/PID_A053 installieren
# pip install pyusb pywin32
import sys, json, argparse
from datetime import datetime

# ── ESC/POS Konstanten ────────────────────────────────────────
ESC = b'\x1b'; GS = b'\x1d'
INIT=ESC+b'\x40'; ALIGN_L=ESC+b'\x61\x00'; ALIGN_C=ESC+b'\x61\x01'
BOLD_ON=ESC+b'\x45\x01'; BOLD_OFF=ESC+b'\x45\x00'
FONT_A=ESC+b'\x4d\x00'; FONT_B=ESC+b'\x4d\x01'
DBL_H_ON=GS+b'\x21\x01'; DBL_H_OFF=GS+b'\x21\x00'
NL=b'\x0a'; CUT=GS+b'\x56\x42\x40'
LINE_W=32

def e(t): return str(t).encode('cp437', errors='replace')
def sep(): return e('-'*LINE_W)+NL

def row(text='', align=ALIGN_L, bold=False, small=False, tall=False):
    o = align
    o += BOLD_ON  if bold  else b''
    o += FONT_B   if small else b''
    o += DBL_H_ON if tall  else b''
    o += e(str(text))+NL
    o += DBL_H_OFF if tall  else b''
    o += FONT_A    if small else b''
    o += BOLD_OFF  if bold  else b''
    return o

def lr(label, value, width=LINE_W):
    lbl=str(label)[:width-10]; val=str(value)
    return e(lbl+' '*max(1,width-len(lbl)-len(val))+val)+NL

def build_receipt(data):
    name=data.get('name') or '-'; number=data.get('number') or ''
    desc=data.get('desc') or ''; qty=data.get('qty',1); unit=data.get('unit','Stk')
    price=data.get('price'); params=data.get('params') or {}
    now=datetime.now().strftime('%d.%m.%Y  %H:%M')
    o=INIT+ALIGN_L
    o+=row('PLM & ERP',align=ALIGN_C,bold=True)
    o+=row(now,align=ALIGN_C,small=True); o+=sep()
    if number: o+=row(number,bold=True)
    o+=row(name,bold=True,tall=True)
    if desc and desc!=name: o+=row(desc,small=True)
    o+=row(f'Menge: {qty} {unit}'); o+=sep()
    if params:
        o+=row('DRUCKPARAMETER',bold=True)
        for k,v in params.items():
            vs=str(v).strip()
            if vs and vs not in ('','-','None'): o+=lr(str(k)[:14],vs[:16])
        o+=sep()
    if price is not None:
        o+=row(f'CHF {float(price):.2f}',align=ALIGN_C,bold=True,tall=True); o+=sep()
    o+=NL*3+CUT
    return o

# ── PyUSB Direktdruck ─────────────────────────────────────────
PIPSTA_VID = 0x0483
PIPSTA_PID = 0xA053

def print_usb(data):
    try:
        import usb.core, usb.util
    except ImportError:
        raise RuntimeError("pyusb nicht installiert. Bitte ausfuehren: pip install pyusb")

    dev = usb.core.find(idVendor=PIPSTA_VID, idProduct=PIPSTA_PID)
    if dev is None:
        raise RuntimeError(
            f"Pipsta AP1400 nicht gefunden (VID_{PIPSTA_VID:04X}&PID_{PIPSTA_PID:04X}). "
            "WinUSB-Treiber mit Zadig installiert? Drucker eingesteckt?"
        )

    # Claim interface (detach kernel driver on Linux)
    if dev.is_kernel_driver_active(0):
        dev.detach_kernel_driver(0)

    dev.set_configuration()
    cfg = dev.get_active_configuration()
    intf = cfg[(0, 0)]

    # Bulk-OUT Endpoint finden
    ep_out = usb.util.find_descriptor(
        intf,
        custom_match=lambda e: (
            usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
            and (e.bmAttributes & 0x03) == usb.util.ENDPOINT_TYPE_BULK
        )
    )
    if ep_out is None:
        raise RuntimeError("Bulk-OUT-Endpoint nicht gefunden. Anderen USB-Port versuchen.")

    # In 64-Byte-Pakete aufteilen (Pipsta-Anforderung)
    chunk = 64
    for i in range(0, len(data), chunk):
        ep_out.write(data[i:i+chunk])

    usb.util.dispose_resources(dev)

# ── Spooler-Fallback (win32print) ─────────────────────────────
def print_spooler(data, preferred=''):
    try:
        import win32print
    except ImportError:
        raise RuntimeError("pywin32 nicht installiert.")

    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if not printers:
        raise RuntimeError("Kein Drucker in Windows gefunden.")

    name = None
    if preferred:
        for p in printers:
            if preferred.lower() in p.lower(): name = p; break
    if not name:
        for kw in ['pipsta','ap1400','generic','text']:
            for p in printers:
                if kw in p.lower(): name = p; break
            if name: break
    if not name: name = printers[0]

    h = win32print.OpenPrinter(name)
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
    return name

# ── Main ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True)
    parser.add_argument('--printer', default='')
    args = parser.parse_args()

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as ex:
        print(f"FEHLER: Ungültiges JSON - {ex}", file=sys.stderr); sys.exit(1)

    try:
        receipt = build_receipt(data)

        usb_err = None
        try:
            print_usb(receipt)
            print("OK: Beleg via USB (WinUSB/PyUSB) gedruckt")
            return
        except Exception as ex:
            usb_err = ex
            print(f"INFO: USB-Direktdruck fehlgeschlagen: {ex}", file=sys.stderr)

        try:
            name = print_spooler(receipt, args.printer)
            print(f"OK: Beleg via Spooler gedruckt auf '{name}'")
        except Exception as sp_err:
            raise RuntimeError(f"USB: {usb_err} | Spooler: {sp_err}")

    except Exception as ex:
        print(f"FEHLER: {ex}", file=sys.stderr); sys.exit(1)

if __name__ == '__main__':
    main()
