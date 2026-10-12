// 14-qr.js — minimaler QR-Encoder fuer Teilenummern.
// Byte-Modus, Fehlerkorrektur M, Versionen 1–10 (bis 42 Zeichen).
// Bewusst ohne externe Bibliothek, damit PLM offline bleibt.
// Teil der aufgeteilten app.js; klassisches Script mit globalem Scope.

// ── Galois-Feld GF(256), Primitivpolynom 0x11d ────────────────
const _QR_EXP = new Uint8Array(512);
const _QR_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    _QR_EXP[i] = x;
    _QR_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) _QR_EXP[i] = _QR_EXP[i - 255];
})();

function _qrMul(a, b) { return (a === 0 || b === 0) ? 0 : _QR_EXP[_QR_LOG[a] + _QR_LOG[b]]; }

// Generatorpolynom fuer n Fehlerkorrektur-Codewoerter
function _qrGenPoly(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j]     ^= _qrMul(g[j], _QR_EXP[i]);
      next[j + 1] ^= g[j];
    }
    // _qrMul(g[j], alpha^i) in next[j], g[j] verschoben in next[j+1]
    g = next;
  }
  return g;
}

// Reed-Solomon-Rest von data mit n Pruefbytes
function _qrEcc(data, n) {
  // _qrGenPoly liefert aufsteigende Grade; die Division braucht sie absteigend.
  const gd = _qrGenPoly(n).slice().reverse();   // gd[0] = Leitkoeffizient 1
  const res = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) for (let i = 0; i < n; i++) res[i] ^= _qrMul(gd[i + 1], factor);
  }
  return res;
}

// ── Versionstabelle, Fehlerkorrektur-Level M ──────────────────
// [Gesamt-Codewoerter, EC-Codewoerter pro Block, [Bloecke mit k Daten, ...]]
const _QR_VERSIONS = {
  1:  { total: 26,  ecPerBlock: 10, blocks: [[1, 16]] },
  2:  { total: 44,  ecPerBlock: 16, blocks: [[1, 28]] },
  3:  { total: 70,  ecPerBlock: 26, blocks: [[1, 44]] },
  4:  { total: 100, ecPerBlock: 18, blocks: [[2, 32]] },
  5:  { total: 134, ecPerBlock: 24, blocks: [[2, 43]] },
  6:  { total: 172, ecPerBlock: 16, blocks: [[4, 27]] },
  7:  { total: 196, ecPerBlock: 18, blocks: [[4, 31]] },
  8:  { total: 242, ecPerBlock: 22, blocks: [[2, 38], [2, 39]] },
  9:  { total: 292, ecPerBlock: 22, blocks: [[3, 36], [2, 37]] },
  10: { total: 346, ecPerBlock: 26, blocks: [[4, 43], [1, 44]] },
};
const _QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function _qrDataCapacity(v) {
  const spec = _QR_VERSIONS[v];
  return spec.blocks.reduce((s, [n, k]) => s + n * k, 0);
}

// ── Bitstrom ──────────────────────────────────────────────────
function _qrBitBuffer() {
  const bits = [];
  return {
    bits,
    put(value, length) { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); },
    get length() { return bits.length; },
  };
}

// ── Kodierung ─────────────────────────────────────────────────
function _qrEncodeData(text) {
  const bytes = new TextEncoder().encode(text);
  // Der Byte-Modus gilt laut Norm als ISO-8859-1. Fuer Nicht-ASCII setzen wir
  // einen ECI-Header auf UTF-8 (Kennung 26), sonst liest ein Scanner Umlaute
  // falsch. Reines ASCII bleibt ohne Header — das verstehen auch aeltere Geraete.
  const needsEci = bytes.some(b => b > 0x7f);
  const eciBits = needsEci ? 12 : 0;               // 4 Bit Modus + 8 Bit Kennung

  let version = null;
  for (let v = 1; v <= 10; v++) {
    const lenBits = v <= 9 ? 8 : 16;
    const needed = eciBits + 4 + lenBits + bytes.length * 8;
    if (needed <= _qrDataCapacity(v) * 8) { version = v; break; }
  }
  if (version === null) throw new Error('QR: Text zu lang (max. ~42 Zeichen)');

  const buf = _qrBitBuffer();
  if (needsEci) { buf.put(0b0111, 4); buf.put(26, 8); }   // ECI, UTF-8
  buf.put(0b0100, 4);                              // Byte-Modus
  buf.put(bytes.length, version <= 9 ? 8 : 16);    // Zeichenzahl
  for (const b of bytes) buf.put(b, 8);

  const capacityBits = _qrDataCapacity(version) * 8;
  buf.put(0, Math.min(4, capacityBits - buf.length));        // Terminator
  while (buf.length % 8 !== 0) buf.bits.push(0);             // auf Bytegrenze

  const codewords = [];
  for (let i = 0; i < buf.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    codewords.push(byte);
  }
  const pad = [0xec, 0x11];
  let p = 0;
  while (codewords.length < _qrDataCapacity(version)) codewords.push(pad[p++ % 2]);

  return { version, codewords };
}

// Bloecke bilden und verschachteln
function _qrInterleave(version, codewords) {
  const spec = _QR_VERSIONS[version];
  const dataBlocks = [], ecBlocks = [];
  let offset = 0;
  for (const [count, k] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const block = codewords.slice(offset, offset + k);
      offset += k;
      dataBlocks.push(block);
      ecBlocks.push(_qrEcc(block, spec.ecPerBlock));
    }
  }
  const out = [];
  const maxData = Math.max(...dataBlocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < spec.ecPerBlock; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ── BCH-Pruefbits fuer Format- und Versionsinformation ────────
function _qrBch(value, dataBits, genPoly, genBits) {
  let v = value << (genBits - 1);
  while (_qrBitLength(v) >= genBits) v ^= genPoly << (_qrBitLength(v) - genBits);
  return (value << (genBits - 1)) | v;
}
function _qrBitLength(v) { let n = 0; while (v) { n++; v >>>= 1; } return n; }

function _qrFormatBits(maskId) {
  const ecBits = 0b00;                       // Level M
  const data = (ecBits << 3) | maskId;
  return _qrBch(data, 5, 0b10100110111, 11) ^ 0b101010000010010;
}
function _qrVersionBits(version) {
  return _qrBch(version, 6, 0b1111100100101, 13);
}

// ── Lage der Formatinformation ────────────────────────────────
// Kopie 1 rund um das linke obere Suchmuster, MSB zuerst.
const _QR_FORMAT_POS_1 = [
  [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
  [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
];
// Kopie 2: Bits 14-8 senkrecht unten links, Bits 7-0 waagerecht oben rechts.
function _qrFormatPos2(size) {
  const pos = [];
  for (let i = 0; i < 7; i++) pos.push([size - 1 - i, 8]);
  for (let i = 0; i < 8; i++) pos.push([8, size - 8 + i]);
  return pos;
}

// ── Matrixaufbau ──────────────────────────────────────────────
function _qrBuildMatrix(version, interleaved, maskId) {
  const size = 17 + version * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFn = (r, c, val) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = val; fn[r][c] = true; } };

  // Suchmuster 7x7 plus Trennlinie
  for (const [br, bc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setFn(br + r, bc + c, (inRing || inCore) ? 1 : 0);
    }
  }
  // Taktmuster
  for (let i = 8; i < size - 8; i++) { setFn(6, i, i % 2 === 0 ? 1 : 0); setFn(i, 6, i % 2 === 0 ? 1 : 0); }
  // Ausrichtungsmuster
  const centers = _QR_ALIGN[version];
  for (const r of centers) for (const c of centers) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      setFn(r + dr, c + dc, (ring === 1) ? 0 : 1);
    }
  }
  // Dunkelmodul und Platzhalter fuer die Formatinformation
  setFn(size - 8, 8, 1);
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) setFn(8, i, 0); if (!fn[i][8]) setFn(i, 8, 0); }
  for (let i = 0; i < 8; i++) { if (!fn[8][size - 1 - i]) setFn(8, size - 1 - i, 0); if (!fn[size - 1 - i][8]) setFn(size - 1 - i, 8, 0); }
  // Versionsinformation ab Version 7
  if (version >= 7) {
    const vb = _qrVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = (vb >> i) & 1;
      setFn(Math.floor(i / 3), size - 11 + (i % 3), bit);
      setFn(size - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }

  // Daten im Zickzack von rechts unten, Spalte 6 wird uebersprungen
  const maskFn = (r, c) => {
    switch (maskId) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };

  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let k = 0; k < 2; k++) {
        const c = right - k;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (fn[r][c]) continue;
        let bit = 0;
        if (bitIdx < totalBits) {
          bit = (interleaved[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        m[r][c] = maskFn(r, c) ? bit ^ 1 : bit;
      }
    }
  }

  // Formatinformation — 15 Bit, in BEIDEN Kopien MSB zuerst.
  // Die Reihenfolge ist gegen qrencode(1) Modul fuer Modul geprueft.
  const fb = _qrFormatBits(maskId);
  for (let i = 0; i < 15; i++) {
    const bit = (fb >> (14 - i)) & 1;
    const [r1, c1] = _QR_FORMAT_POS_1[i];
    m[r1][c1] = bit;
    const [r2, c2] = _qrFormatPos2(size)[i];
    m[r2][c2] = bit;
  }
  // Dunkelmodul steht fest und liegt ausserhalb beider Kopien
  m[size - 8][8] = 1;

  return m;
}

// ── Maskenbewertung nach ISO/IEC 18004 ────────────────────────
function _qrPenalty(m) {
  const n = m.length;
  let score = 0;

  const runPenalty = line => {
    let p = 0, run = 1;
    for (let i = 1; i < line.length; i++) {
      if (line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) p += 3 + (run - 5);
    return p;
  };
  for (let i = 0; i < n; i++) {
    score += runPenalty(m[i]);
    score += runPenalty(m.map(row => row[i]));
  }
  // 2x2-Bloecke
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // Muster 1:1:3:1:1 mit vier hellen Modulen
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const hasAt = (line, i, pat) => pat.every((v, k) => line[i + k] === v);
  for (let i = 0; i < n; i++) {
    const row = m[i], col = m.map(r => r[i]);
    for (let j = 0; j + 11 <= n; j++) {
      if (hasAt(row, j, pat1) || hasAt(row, j, pat2)) score += 40;
      if (hasAt(col, j, pat1) || hasAt(col, j, pat2)) score += 40;
    }
  }
  // Abweichung vom Gleichgewicht hell/dunkel
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

// ── Oeffentliche API ──────────────────────────────────────────
// qrMatrix(text) -> 2D-Array aus 0/1
function qrMatrix(text) {
  const { version, codewords } = _qrEncodeData(String(text));
  const interleaved = _qrInterleave(version, codewords);
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = _qrBuildMatrix(version, interleaved, mask);
    const s = _qrPenalty(m);
    if (s < bestScore) { bestScore = s; best = m; }
  }
  return best;
}

// qrSvg(text, px) -> SVG-String, skaliert auf px Kantenlaenge
function qrSvg(text, px = 120, opts = {}) {
  let m;
  try { m = qrMatrix(text); } catch (e) { return ''; }
  const n = m.length;
  const quiet = opts.quiet != null ? opts.quiet : 2;
  const span = n + quiet * 2;
  const dark = opts.dark || '#0b0d12';
  const light = opts.light || '#ffffff';
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!m[r][c]) { c++; continue; }
      let len = 1;
      while (c + len < n && m[r][c + len]) len++;
      d += `M${c + quiet} ${r + quiet}h${len}v1h-${len}z`;
      c += len;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR-Code ${String(text).replace(/[<>&"]/g, '')}">`
    + `<rect width="${span}" height="${span}" fill="${light}"/>`
    + `<path d="${d}" fill="${dark}"/></svg>`;
}
