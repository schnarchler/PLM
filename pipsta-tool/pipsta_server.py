#!/usr/bin/env python3
"""
Pipsta Freitext-Drucker  –  Standalone HTTP-Server
Start:   python pipsta_server.py
Browser: http://localhost:8765
"""
import sys, json, os, threading, webbrowser, struct, base64
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

PORT     = 8765
HTML_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pipsta_print.html')

# ── ESC/POS ────────────────────────────────────────────────────
ESC      = b'\x1b'
ALIGN_L  = ESC + b'\x61\x00'
ALIGN_C  = ESC + b'\x61\x01'
BOLD_ON  = ESC + b'\x45\x01'
BOLD_OFF = ESC + b'\x45\x00'
FONT_A   = ESC + b'\x4d\x00'   # normal
FONT_B   = ESC + b'\x4d\x01'   # klein
NL       = b'\x0a'

def enc(t):
    return str(t).encode('cp437', errors='replace')

def build_escpos(payload):
    width    = max(16, min(80, int(payload.get('line_width', 32))))
    header   = (payload.get('header') or '').strip()
    footer   = (payload.get('footer') or '').strip()
    show_dt  = bool(payload.get('show_datetime', False))
    lines    = payload.get('lines', [])

    out = NL + ALIGN_L

    # Kopfzeile
    if header:
        out += BOLD_ON + ALIGN_C + enc(header[:width]) + NL + BOLD_OFF + ALIGN_L
    if show_dt:
        out += FONT_B + ALIGN_C + enc(datetime.now().strftime('%d.%m.%Y  %H:%M')) + NL + FONT_A + ALIGN_L
    if header or show_dt:
        out += ALIGN_L + enc('-' * width) + NL

    # Zeilen
    for line in lines:
        text      = line.get('text', '')
        bold      = line.get('bold', False)
        small     = line.get('small', False)
        centered  = line.get('centered', False)
        separator = line.get('separator', False)

        if separator:
            out += ALIGN_L + enc('-' * width) + NL
            continue

        if centered:
            pad  = max(0, (width - len(text)) // 2)
            text = ' ' * pad + text

        if small:  out += FONT_B
        if bold:   out += BOLD_ON
        out += ALIGN_L + enc(text) + NL
        if bold:   out += BOLD_OFF
        if small:  out += FONT_A

    # Fusszeile
    if footer:
        out += ALIGN_L + enc('-' * width) + NL
        out += FONT_B + ALIGN_C + enc(footer[:width]) + NL + FONT_A + ALIGN_L

    out += NL * 3
    return out

# ── Windows WinUSB ─────────────────────────────────────────────
def _try_winusb(data):
    import ctypes, ctypes.wintypes as wt, winreg

    class USB_INTERFACE_DESCRIPTOR(ctypes.Structure):
        _fields_ = [('bLength',ctypes.c_uint8),('bDescriptorType',ctypes.c_uint8),
                    ('bInterfaceNumber',ctypes.c_uint8),('bAlternateSetting',ctypes.c_uint8),
                    ('bNumEndpoints',ctypes.c_uint8),('bInterfaceClass',ctypes.c_uint8),
                    ('bInterfaceSubClass',ctypes.c_uint8),('bInterfaceProtocol',ctypes.c_uint8),
                    ('iInterface',ctypes.c_uint8)]

    class WINUSB_PIPE_INFORMATION(ctypes.Structure):
        _fields_ = [('PipeType',ctypes.c_int),('PipeId',ctypes.c_uint8),
                    ('MaximumPacketSize',ctypes.c_uint16),('Interval',ctypes.c_uint8)]

    def reg_paths(guid):
        base = f'SYSTEM\\CurrentControlSet\\Control\\DeviceClasses\\{guid}'
        paths, i = [], 0
        try:
            root = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base)
        except OSError:
            return paths
        while True:
            try:
                sub = winreg.EnumKey(root, i); i += 1
            except OSError:
                break
            if sub.startswith('##?#'):
                paths.append('\\\\?\\' + sub[4:])
        winreg.CloseKey(root)
        return paths

    guids = ['{A5DCBF10-6530-11D2-901F-00C04FB951ED}', '{28d78fad-5a12-11d1-ae5b-0000f803a8c2}']
    paths, seen = [], set()
    for g in guids:
        for p in reg_paths(g):
            if p not in seen and '0483' in p.upper():
                seen.add(p); paths.append(p)
    if not paths:
        for g in guids:
            for p in reg_paths(g):
                if p not in seen:
                    seen.add(p); paths.append(p)
    if not paths:
        raise RuntimeError("Kein WinUSB-Gerät gefunden.")

    k32  = ctypes.WinDLL('kernel32', use_last_error=True)
    wusb = ctypes.WinDLL('winusb',   use_last_error=True)
    GENERIC_RW, OPEN_EXISTING, FILE_FLAG_OVERLAPPED = 0xC0000000, 3, 0x40000000

    for path in paths:
        h = k32.CreateFileW(path, GENERIC_RW, 0, None, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
        hval = ctypes.cast(h, ctypes.c_void_p).value
        if hval == ctypes.cast(wt.HANDLE(-1), ctypes.c_void_p).value:
            continue
        intf = ctypes.c_void_p()
        if not wusb.WinUsb_Initialize(h, ctypes.byref(intf)):
            k32.CloseHandle(h); continue
        try:
            iface = USB_INTERFACE_DESCRIPTOR()
            wusb.WinUsb_QueryInterfaceSettings(intf, 0, ctypes.byref(iface))
            ep_out = None
            for i in range(iface.bNumEndpoints):
                pi = WINUSB_PIPE_INFORMATION()
                if wusb.WinUsb_QueryPipe(intf, 0, i, ctypes.byref(pi)):
                    if pi.PipeType == 3 and not (pi.PipeId & 0x80):
                        ep_out = pi.PipeId; break
            if ep_out is None:
                ep_out = 0x02
            transferred = wt.ULONG(0)
            for i in range(0, len(data), 64):
                seg = data[i:i+64]
                buf = (ctypes.c_uint8 * len(seg))(*seg)
                wusb.WinUsb_WritePipe(intf, ep_out, buf, len(seg), ctypes.byref(transferred), None)
            wusb.WinUsb_Free(intf); k32.CloseHandle(h)
            return f'WinUSB ({path})'
        except Exception:
            wusb.WinUsb_Free(intf); k32.CloseHandle(h); raise

    raise RuntimeError("WinUSB: alle Gerätepfade fehlgeschlagen.")

# ── PyUSB (Linux + Windows mit libusb) ─────────────────────────
def _try_pyusb(data):
    import usb.core, usb.util
    dev = usb.core.find(idVendor=0x0483, idProduct=0xA053)
    if dev is None:
        raise RuntimeError("Pipsta (VID_0483&PID_A053) nicht gefunden.")
    if dev.is_kernel_driver_active(0):
        dev.detach_kernel_driver(0)
    dev.set_configuration()
    cfg  = dev.get_active_configuration()
    intf = cfg[(0, 0)]
    ep   = usb.util.find_descriptor(intf, custom_match=lambda e: (
        usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
        and (e.bmAttributes & 0x03) == usb.util.ENDPOINT_TYPE_BULK))
    if ep is None:
        raise RuntimeError("Bulk-OUT-Endpoint nicht gefunden.")
    for i in range(0, len(data), 64):
        ep.write(data[i:i+64])
    usb.util.dispose_resources(dev)
    return 'PyUSB'

# ── Windows Spooler Fallback ────────────────────────────────────
def _try_spooler(data):
    import win32print
    printers = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if not printers:
        raise RuntimeError("Kein Drucker gefunden.")
    name = None
    for kw in ['pipsta', 'ap1400', 'generic', 'text']:
        for p in printers:
            if kw in p.lower():
                name = p; break
        if name: break
    if not name:
        name = printers[0]
    h = win32print.OpenPrinter(name)
    try:
        win32print.StartDocPrinter(h, 1, ("Pipsta Druck", None, "RAW"))
        try:
            win32print.StartPagePrinter(h)
            win32print.WritePrinter(h, data)
            win32print.EndPagePrinter(h)
        finally:
            win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)
    return f"Spooler ({name})"

def build_product_label_bitmap(payload):
    """Kompaktes Produkt-Etikett als Bitmap: QR links, Text rechts.
    Benötigt: pip install qrcode pillow
    """
    try:
        import qrcode as _qr
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as ex:
        raise RuntimeError(f'pip install qrcode pillow\n({ex})')

    art_nr   = (payload.get('article_number') or '').strip()
    name     = (payload.get('name') or '').strip()
    lot      = (payload.get('lot_number') or '').strip()
    brand    = (payload.get('brand') or '').strip()
    color    = (payload.get('color') or '').strip()
    material = (payload.get('material_type') or '').strip()
    p_temp   = payload.get('print_temp')
    b_temp   = payload.get('bed_temp')
    qr_data  = (payload.get('qr_content') or art_nr or lot or name).strip()
    DOTS     = 384

    # QR-Matrix erzeugen
    qrc = _qr.QRCode(version=None,
                     error_correction=_qr.constants.ERROR_CORRECT_M,
                     box_size=1, border=2)
    qrc.add_data(qr_data); qrc.make(fit=True)
    matrix  = qrc.get_matrix()
    qr_mod  = len(matrix)

    # Textzeilen (ohne Bestand)
    raw_lines = []
    if art_nr:  raw_lines.append((art_nr,  True,  16))
    if name:    raw_lines.append((name,    False, 11))
    if lot:     raw_lines.append((f'LOT: {lot}', False, 10))
    spec = ' · '.join(x for x in [material, color, brand] if x)
    if spec:    raw_lines.append((spec, False, 9))
    if p_temp:
        tmp = f'{p_temp}°C / {b_temp}°C' if b_temp else f'{p_temp}°C'
        raw_lines.append((tmp, False, 9))

    # Schriften laden (Cross-Platform)
    def load_font(size, bold=False):
        paths = ([
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
            '/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf',
            'C:/Windows/Fonts/courbd.ttf', 'C:/Windows/Fonts/arialbd.ttf',
        ] if bold else [
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            '/usr/share/fonts/TTF/DejaVuSansMono.ttf',
            'C:/Windows/Fonts/cour.ttf',   'C:/Windows/Fonts/arial.ttf',
        ])
        for p in paths:
            try: return ImageFont.truetype(p, size)
            except: pass
        try:    return ImageFont.load_default(size=size)
        except: return ImageFont.load_default()

    lines = [(t, load_font(s, b)) for t, b, s in raw_lines]

    # QR-Skalierung (Ziel: ~96px)
    qr_scale = max(2, min(4, 96 // qr_mod))
    qr_size  = qr_mod * qr_scale

    # Gesamthöhe
    text_h  = sum(f.size + 3 for _, f in lines) + 4
    label_h = max(qr_size + 4, text_h + 4)

    # Bild erstellen (1-Bit, weiss)
    img  = Image.new('1', (DOTS, label_h), 1)
    draw = ImageDraw.Draw(img)

    # QR links, vertikal zentriert
    qr_y0 = (label_h - qr_size) // 2
    for ry, row in enumerate(matrix):
        for rx, dark in enumerate(row):
            if dark:
                x0, y0 = rx * qr_scale, qr_y0 + ry * qr_scale
                draw.rectangle([x0, y0, x0+qr_scale-1, y0+qr_scale-1], fill=0)

    # Trennlinie
    sep_x = qr_size + 5
    draw.line([(sep_x, 2), (sep_x, label_h-3)], fill=0)

    # Text rechts
    tx    = sep_x + 7
    avail = DOTS - tx - 4
    ty    = (label_h - text_h) // 2 + 2
    for text, font in lines:
        # Kürzen bis es passt
        t = text
        while len(t) > 1:
            try:    w = font.getlength(t)
            except: w = len(t) * font.size * 0.6
            if w <= avail: break
            t = t[:-1]
        draw.text((tx, ty), t, font=font, fill=0)
        ty += font.size + 3

    # Bitmap → ESC/POS GS v 0
    width_bytes = (DOTS + 7) // 8
    bdata = []
    for y in range(label_h):
        for bx in range(width_bytes):
            byte = 0
            for b in range(8):
                x = bx * 8 + b
                if x < DOTS and img.getpixel((x, y)) == 0:
                    byte |= (1 << (7 - b))
            bdata.append(byte)

    out  = NL + ALIGN_C
    out += b'\x1d\x76\x30\x00'
    out += struct.pack('<H', width_bytes)
    out += struct.pack('<H', label_h)
    out += bytes(bdata)
    out += NL * 3
    return out

def qr_escpos(data, module_size=4):
    """Nativer ESC/POS QR-Code (GS ( k)"""
    d  = data.encode('utf-8')
    n  = len(d) + 3
    pL = n & 0xFF
    pH = (n >> 8) & 0xFF
    out  = b'\x1d\x28\x6b\x04\x00\x31\x41\x32\x00'           # model 2
    out += bytes([0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,module_size])  # Modulgrösse
    out += b'\x1d\x28\x6b\x03\x00\x31\x45\x31'                # Fehlerkorrektur M
    out += bytes([0x1d,0x28,0x6b,pL,pH,0x31,0x50,0x30]) + d   # Daten speichern
    out += b'\x1d\x28\x6b\x03\x00\x31\x51\x30'                # Drucken
    return out

def build_label_escpos(payload):
    w           = int(payload.get('line_width', 32))
    art_nr      = payload.get('article_number', '')
    name        = payload.get('name', '')
    lot         = payload.get('lot_number', '')
    brand       = payload.get('brand', '')
    color       = payload.get('color', '')
    material    = payload.get('material_type', '')
    qty         = payload.get('remaining_qty', '')
    unit        = payload.get('unit', '')
    print_temp  = payload.get('print_temp')
    bed_temp    = payload.get('bed_temp')
    qr_content  = payload.get('qr_content') or art_nr or lot or name
    module_size = int(payload.get('qr_size', 4))

    out = NL + ALIGN_C

    # Artikel-Nummer gross + fett
    if art_nr:
        out += BOLD_ON + enc(art_nr) + NL + BOLD_OFF
        out += ALIGN_L + enc('-' * w) + NL

    # Materialinfos
    out += ALIGN_L
    if name:  out += BOLD_ON + enc(name[:w]) + NL + BOLD_OFF
    if lot:   out += enc(f'LOT: {lot}'[:w]) + NL
    if brand: out += FONT_B + enc(brand[:w]) + NL + FONT_A
    spec_parts = [p for p in [material, color] if p]
    if spec_parts: out += FONT_B + enc(' · '.join(spec_parts)[:w]) + NL + FONT_A
    if qty != '': out += enc(f'Bestand: {qty} {unit}'[:w]) + NL
    if print_temp: out += FONT_B + enc(f'{print_temp}°C / Bett {bed_temp}°C'[:w] if bed_temp else f'{print_temp}°C'[:w]) + NL + FONT_A
    out += ALIGN_L + enc('-' * w) + NL

    # QR-Code zentriert
    out += ALIGN_C
    out += qr_escpos(qr_content, module_size)
    out += NL * 3
    return out

def build_bitmap_escpos(payload):
    data_b64   = payload.get('data', '')
    width_bytes = int(payload.get('width_bytes', 48))
    height      = int(payload.get('height', 100))
    bitmap      = base64.b64decode(data_b64)
    # GS v 0  –  raster bit image, normal density
    out  = NL + ALIGN_C
    out += b'\x1d\x76\x30\x00'
    out += struct.pack('<H', width_bytes)
    out += struct.pack('<H', height)
    out += bitmap
    out += NL * 4
    return out

def send_to_printer(data):
    errors = []
    for fn, label in [(_try_winusb, 'WinUSB'), (_try_pyusb, 'PyUSB'), (_try_spooler, 'Spooler')]:
        try:
            return fn(data)
        except Exception as ex:
            errors.append(f'{label}: {ex}')
    # Alle drei fehlgeschlagen — prüfen ob es ein "nicht gefunden"-Fehler ist
    not_found = all(any(kw in e.lower() for kw in ('nicht gefunden', 'not found', 'no device', 'kein'))
                    for e in errors)
    raise RuntimeError('\n'.join(errors), not_found)

# ── HTTP Handler ───────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # kein stdout-Spam

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            try:
                with open(HTML_FILE, 'rb') as f:
                    body = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', len(body))
                self._cors()
                self.end_headers()
                self.wfile.write(body)
            except FileNotFoundError:
                self.send_error(404, 'pipsta_print.html nicht gefunden')
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/quit':
            resp = json.dumps({'ok': True}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', len(resp))
            self._cors()
            self.end_headers()
            self.wfile.write(resp)
            threading.Thread(target=_server.shutdown, daemon=True).start()
            return
        if self.path not in ('/print', '/print-image', '/print-label'):
            self.send_error(404); return
        length  = int(self.headers.get('Content-Length', 0))
        payload = json.loads(self.rfile.read(length))
        try:
            if self.path == '/print-image':
                escpos = build_bitmap_escpos(payload)
            elif self.path == '/print-label':
                try:
                    escpos = build_product_label_bitmap(payload)
                except RuntimeError as bex:
                    if 'pip install' in str(bex):
                        # Fallback: ESC/POS Text + nativer QR
                        print(f'INFO: Bitmap-Label nicht verfügbar ({bex.args[0].splitlines()[0]}), nutze Text-Fallback')
                        escpos = build_label_escpos(payload)
                    else:
                        raise
            else:
                escpos = build_escpos(payload)
            method = send_to_printer(escpos)
            resp   = json.dumps({'ok': True, 'method': method}).encode()
        except RuntimeError as ex:
            args      = ex.args
            details   = args[0] if args else str(ex)
            not_found = args[1] if len(args) > 1 else False
            resp = json.dumps({'ok': False, 'error': details, 'not_found': not_found}).encode()
        except Exception as ex:
            resp = json.dumps({'ok': False, 'error': str(ex), 'not_found': False}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(resp))
        self._cors()
        self.end_headers()
        self.wfile.write(resp)

# ── Start ──────────────────────────────────────────────────────
_server = None
if __name__ == '__main__':
    _server = HTTPServer(('127.0.0.1', PORT), Handler)
    url     = f'http://localhost:{PORT}'
    print(f'Pipsta-Tool läuft auf {url}')
    print('Beenden mit Ctrl+C oder über den Browser-Button')
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        _server.serve_forever()
    except KeyboardInterrupt:
        pass
    print('Beendet.')
