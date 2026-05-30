#!/usr/bin/env python3
# PLM & ERP - Pipsta AP1400 Belegdruck (ESC/POS)
# Methode 1: WinUSB direkt via ctypes (kein libusb noetig, erfordert Zadig)
# Methode 2: Windows-Spooler via pywin32 (Fallback)
# pip install pywin32
import sys, json, argparse, ctypes
from datetime import datetime

# ── ESC/POS ───────────────────────────────────────────────────
ESC=b'\x1b'
ALIGN_L=ESC+b'\x61\x00'
ALIGN_C=ESC+b'\x61\x01'
BOLD_ON=ESC+b'\x45\x01'; BOLD_OFF=ESC+b'\x45\x00'
FONT_A=ESC+b'\x4d\x00'; FONT_B=ESC+b'\x4d\x01'
NL=b'\x0a'
LINE_W=32  # default, overridden per print job

def e(t): return str(t).encode('cp437', errors='replace')
def rnd5(v): import math; return math.floor(float(v) * 20) / 20

def sep(w=LINE_W): return ALIGN_L+e('-'*w)+NL

def row(text='', bold=False, small=False, centered=False, w=LINE_W):
    o=ALIGN_L
    o+=BOLD_ON if bold else b''
    o+=FONT_B if small else b''
    if centered:
        t=str(text); pad=max(0,(w-len(t))//2)
        o+=e(' '*pad+t)
    else:
        o+=e(str(text))
    o+=NL
    o+=FONT_A if small else b''
    o+=BOLD_OFF if bold else b''
    return o

def lr(label, value, w=LINE_W):
    lbl=str(label)[:w-10]; val=str(value)
    return ALIGN_L+e(lbl+' '*max(1,w-len(lbl)-len(val))+val)+NL

def build_receipt(data):
    w   = int(data.get('line_width') or LINE_W)
    s_dt  = data.get('show_datetime',  True)
    s_cu  = data.get('show_customer',  True)
    s_nr  = data.get('show_item_number', True)
    s_no  = data.get('show_notes',     True)
    header=data.get('header') or 'PLM & ERP'
    name=data.get('name') or '-'; number=data.get('number') or ''
    desc=data.get('desc') or ''; qty=data.get('qty',1); unit=data.get('unit','Stk')
    price=data.get('price'); params=data.get('params') or {}
    customer=data.get('customer') or ''; notes=data.get('notes') or ''
    footer=data.get('footer') or ''
    now=datetime.now().strftime('%d.%m.%Y  %H:%M')
    o=NL+ALIGN_L
    o+=row(header,bold=True,centered=True,w=w)
    if s_dt: o+=row(now,small=True,centered=True,w=w)
    if s_cu and customer: o+=row(customer,small=True,centered=True,w=w)
    o+=sep(w)
    if s_nr and number: o+=row(number,bold=True,w=w)
    o+=row(name,bold=True,w=w)
    if desc and desc!=name: o+=row(desc,small=True,w=w)
    if s_no and notes: o+=row(notes,small=True,w=w)
    if price is not None:
        o+=lr(f'{qty} {unit}', f'CHF {rnd5(price * qty):.2f}', w=w)
    else:
        o+=row(f'{qty} {unit}',w=w)
    o+=sep(w)
    if params:
        o+=row('DRUCKPARAMETER',bold=True,w=w)
        for k,v in params.items():
            vs=str(v).strip()
            if vs and vs not in ('','-','None'): o+=lr(str(k)[:14],vs[:16],w=w)
        o+=sep(w)
    if price is not None:
        o+=row(f'Total CHF {rnd5(price * qty):.2f}',bold=True,centered=True,w=w); o+=sep(w)
    if footer: o+=row(footer,small=True,centered=True,w=w)
    o+=NL*3
    return o

def build_multi_receipt(data):
    w   = int(data.get('line_width') or LINE_W)
    s_dt  = data.get('show_datetime',  True)
    s_cu  = data.get('show_customer',  True)
    s_nr  = data.get('show_item_number', True)
    s_no  = data.get('show_notes',     True)
    header=data.get('header') or 'PLM & ERP'
    customer=data.get('customer') or ''
    items=data.get('items') or []
    total=data.get('total')
    footer=data.get('footer') or ''
    now=datetime.now().strftime('%d.%m.%Y  %H:%M')
    o=NL+ALIGN_L
    o+=row(header,bold=True,centered=True,w=w)
    if s_dt: o+=row(now,small=True,centered=True,w=w)
    if s_cu and customer: o+=row(customer,small=True,centered=True,w=w)
    o+=sep(w)
    for item in items:
        name=item.get('name') or '-'; number=item.get('number') or ''
        qty=item.get('qty',1); unit=item.get('unit','Stk')
        price=item.get('price'); notes=item.get('notes') or ''
        if s_nr and number: o+=row(number,small=True,w=w)
        o+=row(name,bold=True,w=w)
        if s_no and notes: o+=row(notes,small=True,w=w)
        if price is not None:
            o+=lr(f'{qty} {unit}',f'CHF {rnd5(price):.2f}',w=w)
        else:
            o+=row(f'{qty} {unit}',small=True,w=w)
        o+=sep(w)
    if total is not None:
        o+=row(f'Total CHF {rnd5(total):.2f}',bold=True,centered=True,w=w)
        o+=sep(w)
    if footer: o+=row(footer,small=True,centered=True,w=w)
    o+=NL*3
    return o

# ── Geraetepfade aus Registry ─────────────────────────────────
def _reg_paths_for_guid(guid):
    try:
        import winreg
    except ImportError:
        return []
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
    try:
        import ctypes.wintypes as wt
    except (ImportError, ValueError):
        raise RuntimeError("WinUSB nicht verfügbar (kein Windows)")
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

# ── Label (Produkt-Etikett) ────────────────────────────────────
def _qr_escpos(text, module_size=4):
    d  = text.encode('utf-8')
    n  = len(d) + 3
    pL = n & 0xFF; pH = (n >> 8) & 0xFF
    out  = b'\x1d\x28\x6b\x04\x00\x31\x41\x32\x00'
    out += bytes([0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,module_size])
    out += b'\x1d\x28\x6b\x03\x00\x31\x45\x31'
    out += bytes([0x1d,0x28,0x6b,pL,pH,0x31,0x50,0x30]) + d
    out += b'\x1d\x28\x6b\x03\x00\x31\x51\x30'
    return out

def build_label(data):
    # Versuch 1: Bitmap mit QR (qrcode + Pillow)
    try:
        return _build_label_bitmap(data)
    except Exception as ex:
        print(f"INFO: Bitmap-Label nicht verfügbar ({ex})", file=sys.stderr)
    # Versuch 2: Text mit QR als Unicode-Blockzeichen (nur qrcode, kein Pillow)
    try:
        return _build_label_qr_text(data)
    except Exception as ex:
        print(f"INFO: QR-Text nicht verfügbar ({ex}), nutze Text-Fallback", file=sys.stderr)
    # Versuch 3: Reiner Text
    return _build_label_text(data)


def _ensure_qrcode():
    """qrcode bei Bedarf automatisch installieren"""
    try:
        import qrcode
        return qrcode
    except ImportError:
        import subprocess
        print("INFO: Installiere qrcode...", file=sys.stderr)
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'qrcode', '--quiet'],
                       check=True, capture_output=True)
        import qrcode
        return qrcode


def _build_label_qr_text(data):
    """QR-Code als Unicode-Halbblock-Zeichen (cp437-kompatibel, kein Pillow nötig)"""
    _qr = _ensure_qrcode()

    w       = int(data.get('line_width', 32))
    art_nr  = (data.get('article_number') or '').strip()
    name    = (data.get('name') or '').strip()
    lot     = (data.get('lot_number') or '').strip()
    qr_data = (data.get('qr_content') or art_nr or lot or name).strip()

    # ── Kopf ──────────────────────────────────────────────────
    out = NL + sep(w)
    if art_nr:
        out += row(art_nr, bold=True, centered=True, w=w)
    out += sep(w)
    out += row(name, bold=True, w=w)
    out += row(f'LOT: {lot}' if lot else 'LOT: -', w=w)
    out += sep(w)

    # ── QR als Halbblock ────────────────────────────────────────
    # Jede Zeile enthält 2 QR-Reihen: █ ▀ ▄ (Leerzeichen)
    # cp437: █=0xDB ▀=0xDF ▄=0xDC
    FULL = '█'; UPPER = '▀'; LOWER = '▄'; SPC = ' '

    qrc = _qr.QRCode(
        version=None,
        error_correction=_qr.constants.ERROR_CORRECT_M,
        box_size=1, border=2)
    qrc.add_data(qr_data)
    qrc.make(fit=True)
    matrix = qrc.get_matrix()
    size   = len(matrix)
    pad    = max(0, (w - size) // 2)

    out += ALIGN_C
    for y in range(0, size, 2):
        line = SPC * pad
        for x in range(size):
            top = matrix[y][x]
            bot = matrix[y+1][x] if (y+1) < size else False
            if   top and bot:  line += FULL
            elif top:          line += UPPER
            elif bot:          line += LOWER
            else:              line += SPC
        out += ALIGN_L + e(line) + NL

    out += sep(w)
    out += NL * 3
    return out

def _build_label_bitmap(data):
    import struct as _st
    import qrcode as _qr
    from PIL import Image, ImageDraw, ImageFont as _IF

    art_nr   = (data.get('article_number') or '').strip()
    name     = (data.get('name') or '').strip()
    lot      = (data.get('lot_number') or '').strip()
    brand    = (data.get('brand') or '').strip()
    color    = (data.get('color') or '').strip()
    material = (data.get('material_type') or '').strip()
    p_temp   = data.get('print_temp')
    b_temp   = data.get('bed_temp')
    qr_data  = (data.get('qr_content') or art_nr or lot or name).strip()
    DOTS     = 384

    qrc = _qr.QRCode(version=None, error_correction=_qr.constants.ERROR_CORRECT_M, box_size=1, border=2)
    qrc.add_data(qr_data); qrc.make(fit=True)
    matrix = qrc.get_matrix(); qr_mod = len(matrix)

    raw_lines = []
    if art_nr:  raw_lines.append((art_nr, True, 16))
    if name:    raw_lines.append((name, False, 11))
    raw_lines.append((f'LOT: {lot}' if lot else 'LOT: -', True, 11))

    def load_font(size, bold=False):
        candidates = ([
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf',
            'C:/Windows/Fonts/courbd.ttf', 'C:/Windows/Fonts/arialbd.ttf',
        ] if bold else [
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            '/usr/share/fonts/TTF/DejaVuSansMono.ttf',
            'C:/Windows/Fonts/cour.ttf', 'C:/Windows/Fonts/arial.ttf',
        ])
        for p in candidates:
            try: return _IF.truetype(p, size)
            except: pass
        try:    return _IF.load_default(size=size)
        except: return _IF.load_default()

    lines = [(t, load_font(s, b)) for t, b, s in raw_lines]
    qr_scale = max(2, min(4, 96 // qr_mod))
    qr_size  = qr_mod * qr_scale
    text_h   = sum(f.size + 3 for _, f in lines) + 4
    label_h  = max(qr_size + 4, text_h + 4)

    img  = Image.new('1', (DOTS, label_h), 1)
    draw = ImageDraw.Draw(img)

    qr_y0 = (label_h - qr_size) // 2
    for ry, row in enumerate(matrix):
        for rx, dark in enumerate(row):
            if dark:
                x0, y0 = rx*qr_scale, qr_y0+ry*qr_scale
                draw.rectangle([x0,y0,x0+qr_scale-1,y0+qr_scale-1], fill=0)

    sep_x = qr_size + 5
    draw.line([(sep_x,2),(sep_x,label_h-3)], fill=0)

    tx = sep_x + 7; avail = DOTS - tx - 4
    ty = (label_h - text_h) // 2 + 2
    for text, font in lines:
        t = text
        while len(t) > 1:
            try:    w = font.getlength(t)
            except: w = len(t) * font.size * 0.6
            if w <= avail: break
            t = t[:-1]
        draw.text((tx, ty), t, font=font, fill=0)
        ty += font.size + 3

    width_bytes = (DOTS + 7) // 8
    bdata = []
    for y in range(label_h):
        for bx in range(width_bytes):
            byte = 0
            for b in range(8):
                x = bx*8+b
                if x < DOTS and img.getpixel((x,y)) == 0:
                    byte |= (1 << (7-b))
            bdata.append(byte)

    out  = NL + ALIGN_C
    out += b'\x1d\x76\x30\x00'
    out += _st.pack('<H', width_bytes)
    out += _st.pack('<H', label_h)
    out += bytes(bdata)
    out += NL * 3
    return out

def _build_label_text(data):
    w       = int(data.get('line_width', 32))
    art_nr  = (data.get('article_number') or '').strip()
    name    = (data.get('name') or '').strip()
    lot     = (data.get('lot_number') or '').strip()
    brand   = (data.get('brand') or '').strip()
    p_temp  = data.get('print_temp')
    b_temp  = data.get('bed_temp')
    out  = NL + sep(w)
    if art_nr:
        out += row(art_nr, bold=True, centered=True, w=w)
    out += sep(w)
    out += row(name, bold=True, w=w)
    out += row(f'LOT: {lot}' if lot else 'LOT: -', w=w)
    out += sep(w) + NL * 3
    return out

# ── Main ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data', default=None)
    parser.add_argument('--printer', default='')
    parser.add_argument('--mode', default='single')
    args = parser.parse_args()

    try:
        raw = args.data if args.data else sys.stdin.read()
        if not raw:
            print("FEHLER: Keine Daten (--data erwartet)", file=sys.stderr); sys.exit(1)
        data = json.loads(raw)
    except json.JSONDecodeError as ex:
        print(f"FEHLER: Ungültiges JSON - {ex}", file=sys.stderr); sys.exit(1)

    try:
        if args.mode == 'label':
            receipt = build_label(data)
        elif args.mode == 'multi':
            receipt = build_multi_receipt(data)
        else:
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
