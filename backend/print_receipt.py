#!/usr/bin/env python3
# PLM & ERP - Pipsta AP1400 Belegdruck (ESC/POS)
# Methode 1: WinUSB direkt via ctypes (kein libusb noetig, erfordert Zadig)
# Methode 2: Windows-Spooler via pywin32 (Fallback)
# pip install pywin32
import sys, json, argparse, ctypes, ctypes.wintypes as wt, winreg
from datetime import datetime

# ── ESC/POS ───────────────────────────────────────────────────
ESC=b'\x1b'; GS=b'\x1d'
INIT=ESC+b'\x40'; ALIGN_L=ESC+b'\x61\x00'; ALIGN_C=ESC+b'\x61\x01'
BOLD_ON=ESC+b'\x45\x01'; BOLD_OFF=ESC+b'\x45\x00'
FONT_A=ESC+b'\x4d\x00'; FONT_B=ESC+b'\x4d\x01'
DBL_H_ON=GS+b'\x21\x01'; DBL_H_OFF=GS+b'\x21\x00'
NL=b'\x0a'; CUT=GS+b'\x56\x42\x40'
LINE_W=32

def e(t): return str(t).encode('cp437', errors='replace')
def sep(): return ALIGN_L+e('-'*LINE_W)+NL

def center(text, width=LINE_W):
    t=str(text); pad=max(0,(width-len(t))//2)
    return ALIGN_L+e(' '*pad+t)+NL

def row(text='', align=ALIGN_L, bold=False, small=False, tall=False, centered=False):
    o=ALIGN_L
    o+=BOLD_ON if bold else b''
    o+=FONT_B if small else b''
    o+=DBL_H_ON if tall else b''
    if centered:
        t=str(text); pad=max(0,(LINE_W-len(t))//2)
        o+=e(' '*pad+t)
    else:
        o+=e(str(text))
    o+=NL
    o+=DBL_H_OFF if tall else b''
    o+=FONT_A if small else b''
    o+=BOLD_OFF if bold else b''
    return o

def lr(label, value, width=LINE_W):
    lbl=str(label)[:width-10]; val=str(value)
    return ALIGN_L+e(lbl+' '*max(1,width-len(lbl)-len(val))+val)+NL

def build_receipt(data):
    header=data.get('header') or 'PLM & ERP'
    name=data.get('name') or '-'; number=data.get('number') or ''
    desc=data.get('desc') or ''; qty=data.get('qty',1); unit=data.get('unit','Stk')
    price=data.get('price'); params=data.get('params') or {}
    customer=data.get('customer') or ''; notes=data.get('notes') or ''
    now=datetime.now().strftime('%d.%m.%Y  %H:%M')
    o=INIT+ALIGN_L
    o+=row(header,bold=True,centered=True)
    o+=row(now,small=True,centered=True)
    if customer:
        o+=row(customer,small=True,centered=True)
    o+=sep()
    if number: o+=row(number,bold=True)
    o+=row(name,bold=True,tall=True)
    if desc and desc!=name: o+=row(desc,small=True)
    o+=sep()
    if notes: o+=row(notes,small=True)
    o+=row(f'Menge: {qty} {unit}'); o+=sep()
    if params:
        o+=row('DRUCKPARAMETER',bold=True)
        for k,v in params.items():
            vs=str(v).strip()
            if vs and vs not in ('','-','None'): o+=lr(str(k)[:14],vs[:16])
        o+=sep()
    if price is not None:
        o+=row(f'Total CHF {float(price):.2f}',bold=True,tall=True,centered=True); o+=sep()
    o+=NL*3+CUT
    return o

# ── Geraetepfade aus Registry ─────────────────────────────────
def _reg_paths_for_guid(guid):
    base = f'SYSTEM\\CurrentControlSet\\Control\\DeviceClasses\\{guid}'
    paths = []
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

def find_device_paths():
    # Zadig/WinUSB registriert unter USB_DEVICE GUID oder USBPRINT GUID
    guids = [
        '{A5DCBF10-6530-11D2-901F-00C04FB951ED}',  # GUID_DEVINTERFACE_USB_DEVICE
        '{28d78fad-5a12-11d1-ae5b-0000f803a8c2}',  # GUID_DEVINTERFACE_USBPRINT
    ]
    paths = []
    seen = set()
    for g in guids:
        for p in _reg_paths_for_guid(g):
            if p not in seen and '0483' in p.upper():
                seen.add(p); paths.append(p)
    # Alle Pfade falls VID-Filter nichts findet
    if not paths:
        for g in guids:
            for p in _reg_paths_for_guid(g):
                if p not in seen:
                    seen.add(p); paths.append(p)
    return paths

# ── WinUSB ctypes Strukturen ──────────────────────────────────
class USB_INTERFACE_DESCRIPTOR(ctypes.Structure):
    _fields_ = [
        ('bLength',            ctypes.c_uint8),
        ('bDescriptorType',    ctypes.c_uint8),
        ('bInterfaceNumber',   ctypes.c_uint8),
        ('bAlternateSetting',  ctypes.c_uint8),
        ('bNumEndpoints',      ctypes.c_uint8),
        ('bInterfaceClass',    ctypes.c_uint8),
        ('bInterfaceSubClass', ctypes.c_uint8),
        ('bInterfaceProtocol', ctypes.c_uint8),
        ('iInterface',         ctypes.c_uint8),
    ]

class WINUSB_PIPE_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('PipeType',          ctypes.c_int),
        ('PipeId',            ctypes.c_uint8),
        ('MaximumPacketSize', ctypes.c_uint16),
        ('Interval',          ctypes.c_uint8),
    ]

def print_winusb(data):
    paths = find_device_paths()
    if not paths:
        raise RuntimeError(
            "Kein WinUSB-Geraet gefunden. Zadig ausgefuehrt? "
            "Drucker eingesteckt und eingeschaltet?"
        )

    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    try:
        wusb = ctypes.WinDLL('winusb', use_last_error=True)
    except OSError:
        raise RuntimeError("winusb.dll nicht gefunden – Windows-Installation beschaedigt?")

    GENERIC_RW            = 0xC0000000
    OPEN_EXISTING         = 3
    FILE_FLAG_OVERLAPPED  = 0x40000000  # WinUsb_Initialize erfordert dieses Flag

    last_err = [f'Pfade gefunden: {paths}']
    for path in paths:
        h = k32.CreateFileW(path, GENERIC_RW, 0, None, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
        hval = ctypes.cast(h, ctypes.c_void_p).value
        if hval == ctypes.cast(wt.HANDLE(-1), ctypes.c_void_p).value:
            last_err.append(f'{path}: CreateFile fehlgeschlagen (err={ctypes.get_last_error()})')
            continue

        intf = ctypes.c_void_p()
        if not wusb.WinUsb_Initialize(h, ctypes.byref(intf)):
            last_err.append(f'{path}: WinUsb_Initialize fehlgeschlagen (err={ctypes.get_last_error()})')
            k32.CloseHandle(h)
            continue

        try:
            iface = USB_INTERFACE_DESCRIPTOR()
            wusb.WinUsb_QueryInterfaceSettings(intf, 0, ctypes.byref(iface))

            ep_out = None
            BULK = 3
            for i in range(iface.bNumEndpoints):
                pi = WINUSB_PIPE_INFORMATION()
                if wusb.WinUsb_QueryPipe(intf, 0, i, ctypes.byref(pi)):
                    if pi.PipeType == BULK and not (pi.PipeId & 0x80):
                        ep_out = pi.PipeId
                        break

            if ep_out is None:
                # Pipsta klassisch: EP 0x02
                ep_out = 0x02

            transferred = wt.ULONG(0)
            chunk = 64
            for i in range(0, len(data), chunk):
                seg = data[i:i+chunk]
                buf = (ctypes.c_uint8 * len(seg))(*seg)
                if not wusb.WinUsb_WritePipe(intf, ep_out, buf, len(seg),
                                              ctypes.byref(transferred), None):
                    raise RuntimeError(
                        f'WinUsb_WritePipe fehlgeschlagen (err={ctypes.get_last_error()}, ep=0x{ep_out:02x})'
                    )

            wusb.WinUsb_Free(intf)
            k32.CloseHandle(h)
            return path

        except Exception as ex:
            wusb.WinUsb_Free(intf)
            k32.CloseHandle(h)
            raise

    raise RuntimeError("WinUSB-Zugriff fehlgeschlagen:\n" + "\n".join(last_err))

# ── PyUSB Fallback ───────────────────────────────────────────
PIPSTA_VID = 0x0483
PIPSTA_PID = 0xA053

def print_pyusb(data):
    try:
        import usb.core, usb.util, usb.backend.libusb1
    except ImportError:
        raise RuntimeError("pyusb nicht installiert.")

    backend = None
    try:
        import libusb
        backend = usb.backend.libusb1.get_backend(find_library=lambda x: libusb.dll._name)
    except Exception:
        backend = usb.backend.libusb1.get_backend()

    if backend is None:
        raise RuntimeError("libusb-Backend nicht gefunden.")

    dev = usb.core.find(idVendor=PIPSTA_VID, idProduct=PIPSTA_PID, backend=backend)
    if dev is None:
        raise RuntimeError(f"Pipsta (VID_{PIPSTA_VID:04X}&PID_{PIPSTA_PID:04X}) nicht gefunden.")

    if dev.is_kernel_driver_active(0):
        dev.detach_kernel_driver(0)
    dev.set_configuration()
    cfg = dev.get_active_configuration()
    intf = cfg[(0, 0)]
    ep_out = usb.util.find_descriptor(intf, custom_match=lambda ep: (
        usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_OUT
        and (ep.bmAttributes & 0x03) == usb.util.ENDPOINT_TYPE_BULK
    ))
    if ep_out is None:
        raise RuntimeError("Bulk-OUT-Endpoint nicht gefunden.")
    chunk = 64
    for i in range(0, len(data), chunk):
        ep_out.write(data[i:i+chunk])
    usb.util.dispose_resources(dev)

# ── Spooler-Fallback ──────────────────────────────────────────
def print_spooler(data, preferred=''):
    try:
        import win32print
    except ImportError:
        raise RuntimeError("pywin32 nicht installiert.")
    ps = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if not ps: raise RuntimeError("Kein Drucker gefunden.")
    name = None
    if preferred:
        for p in ps:
            if preferred.lower() in p.lower(): name=p; break
    if not name:
        for kw in ['pipsta','ap1400','generic','text']:
            for p in ps:
                if kw in p.lower(): name=p; break
            if name: break
    if not name: name = ps[0]
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
        err1 = err2 = None
        try:
            used = print_winusb(receipt)
            print(f"OK: Beleg via WinUSB gedruckt ({used})")
            return
        except Exception as ex:
            err1 = ex
            print(f"INFO: WinUSB fehlgeschlagen: {ex}", file=sys.stderr)
        try:
            print_pyusb(receipt)
            print("OK: Beleg via PyUSB gedruckt")
            return
        except Exception as ex:
            err2 = ex
            print(f"INFO: PyUSB fehlgeschlagen: {ex}", file=sys.stderr)
        try:
            name = print_spooler(receipt, args.printer)
            print(f"OK: Beleg via Spooler gedruckt auf '{name}'")
        except Exception as sp_err:
            raise RuntimeError(f"WinUSB: {err1} | PyUSB: {err2} | Spooler: {sp_err}")
    except Exception as ex:
        print(f"FEHLER: {ex}", file=sys.stderr); sys.exit(1)

if __name__ == '__main__':
    main()
