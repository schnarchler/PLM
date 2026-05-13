#!/usr/bin/env python3
# PLM & ERP - Pipsta AP1400 Belegdruck (ESC/POS)
# pip install pywin32
import sys, json, argparse, ctypes, ctypes.wintypes as wt, winreg
from datetime import datetime

try:
    import win32file, win32con, win32print
except ImportError:
    print("FEHLER: pywin32 nicht installiert. Bitte ausfuehren: pip install pywin32", file=sys.stderr)
    sys.exit(2)

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

# ── Beleg ─────────────────────────────────────────────────────
def build_receipt(data):
    name=data.get('name') or '—'; number=data.get('number') or ''
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

# ── USB-Gerätepfade suchen ────────────────────────────────────
GUID_USBPRINT = '{28d78fad-5a12-11d1-ae5b-0000f803a8c2}'

def _reg_usb_enum_paths():
    # Konstruiert Geraetepfade aus HKLM Enum USBPRINT
    paths = []
    base = r'SYSTEM\CurrentControlSet\Enum\USBPRINT'
    try:
        root = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base)
    except OSError:
        return paths
    i = 0
    while True:
        try: cls = winreg.EnumKey(root, i); i += 1
        except OSError: break
        try:
            ck = winreg.OpenKey(root, cls)
            j = 0
            while True:
                try: inst = winreg.EnumKey(ck, j); j += 1
                except OSError: break
                paths.append(f'\\\\?\\USBPRINT#{cls}#{inst}#{GUID_USBPRINT}')
            winreg.CloseKey(ck)
        except OSError: pass
    winreg.CloseKey(root)
    return paths

def _reg_devclass_paths():
    # ##?#USB#VID...#{GUID} in Registry -> \\?\USB#VID...#{GUID} als Geraetepfad
    paths = []
    base = f'SYSTEM\\CurrentControlSet\\Control\\DeviceClasses\\{GUID_USBPRINT}'
    try: root = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base)
    except OSError: return paths
    i = 0
    while True:
        try: sub = winreg.EnumKey(root, i); i += 1
        except OSError: break
        if sub.startswith('##?#'):
            paths.append('\\\\?\\' + sub[4:])
    winreg.CloseKey(root)
    return paths

def _setupapi_paths():
    # SetupDiGetClassDevs - zuverlaessigste Methode
    try:
        setupapi = ctypes.windll.SetupAPI
    except Exception:
        return []

    class GUID_S(ctypes.Structure):
        _fields_ = [('D1',wt.DWORD),('D2',wt.WORD),('D3',wt.WORD),('D4',ctypes.c_uint8*8)]

    def make_guid():
        g=GUID_S(); g.D1=0x28D78FAD; g.D2=0x5A12; g.D3=0x11D1
        for i,b in enumerate((0xAE,0x5B,0x00,0x00,0xF8,0x03,0xA8,0xC2)): g.D4[i]=b
        return g

    class IFACE(ctypes.Structure):
        _fields_ = [('cbSize',wt.DWORD),('Guid',GUID_S),('Flags',wt.DWORD),('Reserved',ctypes.c_ulong)]

    guid = make_guid()
    hdi = setupapi.SetupDiGetClassDevsW(ctypes.byref(guid), None, None, 0x02|0x10)
    INVALID = ctypes.cast(ctypes.c_void_p(-1), ctypes.c_void_p).value
    if ctypes.cast(hdi, ctypes.c_void_p).value == INVALID:
        return []

    paths = []
    iface = IFACE(); iface.cbSize = ctypes.sizeof(IFACE)
    idx = 0
    while setupapi.SetupDiEnumDeviceInterfaces(hdi, None, ctypes.byref(guid), idx, ctypes.byref(iface)):
        idx += 1
        needed = wt.DWORD(0)
        setupapi.SetupDiGetDeviceInterfaceDetailW(hdi, ctypes.byref(iface), None, 0, ctypes.byref(needed), None)
        if needed.value < 8: continue
        buf = ctypes.create_unicode_buffer(needed.value // 2 + 4)
        ctypes.cast(buf, ctypes.POINTER(wt.DWORD))[0] = 8 if ctypes.sizeof(ctypes.c_void_p)==8 else 6
        if setupapi.SetupDiGetDeviceInterfaceDetailW(hdi, ctypes.byref(iface), buf, needed, None, None):
            path = ctypes.wstring_at(ctypes.addressof(buf)+4)
            if path: paths.append(path)
    setupapi.SetupDiDestroyDeviceInfoList(hdi)
    return paths

def find_all_usb_paths():
    seen = set(); paths = []
    for p in _setupapi_paths() + _reg_devclass_paths() + _reg_usb_enum_paths():
        if p not in seen: seen.add(p); paths.append(p)
    return paths

# ── Direkt auf USB schreiben ──────────────────────────────────
def print_direct(data):
    paths = find_all_usb_paths()
    if not paths:
        raise RuntimeError("Kein USB-Druckerpfad gefunden – Treiber pruefen.")
    errors = []
    for p in paths:
        try:
            h = win32file.CreateFile(p, win32con.GENERIC_WRITE,
                win32con.FILE_SHARE_READ|win32con.FILE_SHARE_WRITE,
                None, win32con.OPEN_EXISTING, 0, None)
            win32file.WriteFile(h, data)
            win32file.CloseHandle(h)
            return p
        except Exception as ex:
            errors.append(f'{p}: {ex}')
    raise RuntimeError("USB-Direktzugriff fehlgeschlagen:\n" + "\n".join(errors))

# ── Spooler-Fallback ──────────────────────────────────────────
def find_printer(preferred=''):
    ps = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL|win32print.PRINTER_ENUM_CONNECTIONS)]
    if not ps: raise RuntimeError("Kein Drucker gefunden.")
    if preferred:
        for p in ps:
            if preferred.lower() in p.lower(): return p
    for kw in ['pipsta','ap1400','generic','text']:
        for p in ps:
            if kw in p.lower(): return p
    return ps[0]

def print_spooler(name, data):
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

# ── Main ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', required=True)
    parser.add_argument('--printer', default='')
    parser.add_argument('--debug', action='store_true', help='Zeigt gefundene USB-Pfade')
    args = parser.parse_args()

    if args.debug:
        paths = find_all_usb_paths()
        print(f"USB-Pfade gefunden ({len(paths)}):")
        for p in paths: print(f"  {p}")
        return

    try:
        data = json.loads(args.data)
    except json.JSONDecodeError as ex:
        print(f"FEHLER: Ungültiges JSON – {ex}", file=sys.stderr); sys.exit(1)

    try:
        receipt = build_receipt(data)

        usb_err = None
        try:
            used = print_direct(receipt)
            print(f"OK: Direkt gedruckt via {used}")
            return
        except Exception as ex:
            usb_err = ex
            print(f"INFO: USB-Direkt fehlgeschlagen: {ex}", file=sys.stderr)

        printer = find_printer(args.printer)
        try:
            print_spooler(printer, receipt)
            print(f"OK: Spooler '{printer}' (USB hatte versagt)")
        except Exception as sp_err:
            raise RuntimeError(f"USB: {usb_err} | Spooler '{printer}': {sp_err}")

    except Exception as ex:
        print(f"FEHLER: {ex}", file=sys.stderr); sys.exit(1)

if __name__ == '__main__':
    main()
