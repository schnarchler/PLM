// 15-mindmap.js — Abhaengigkeitsgraph eines Items als Mindmap.
// Links die Baugruppen, die das Item verwenden (Where-Used), rechts die
// Teile, aus denen es besteht (Stueckliste). Daten von /api/items/:id/graph.
// Teil der aufgeteilten app.js; klassisches Script mit globalem Scope.

const _MM = {
  NODE_W: 174, NODE_H: 44,
  GAP_X: 96, GAP_Y: 14,
  data: null, scale: 1, tx: 0, ty: 0,
  up: 3, down: 3, rootId: null,
};

let _mmDragMove = null, _mmDragUp = null;
const _mmKey = e => { if (e.key === 'Escape') _mmClose(); };

function _mmTypeColor(n) {
  if (n.kind === 'std') return 'var(--amber)';
  return n.item_type === 'asm' ? 'var(--blue)'
       : n.item_type === 'doc' ? 'var(--purple)' : 'var(--teal)';
}
function _mmStatusColor(status) {
  return status === 'REL' ? 'var(--green)'
       : status === 'REV' ? 'var(--amber)'
       : status === 'ECO' ? 'var(--purple)'
       : status === 'OBS' ? 'var(--t4)' : 'var(--blue)';
}

// ── Layout: Ebenen nach Level, y per Schwerpunkt der Nachbarn ──
function _mmLayout(data) {
  const byKey = new Map(data.nodes.map(n => [n.key, n]));
  const levels = new Map();
  for (const n of data.nodes) {
    if (!levels.has(n.level)) levels.set(n.level, []);
    levels.get(n.level).push(n);
  }
  // Nachbarschaften
  const parentsOf = new Map(), childrenOf = new Map();
  for (const e of data.edges) {
    if (!parentsOf.has(e.to)) parentsOf.set(e.to, []);
    if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
    parentsOf.get(e.to).push(e.from);
    childrenOf.get(e.from).push(e.to);
  }

  // Von der Mitte nach aussen platzieren, damit jede Ebene sich an der
  // bereits gesetzten Nachbarebene ausrichtet.
  const order = [...levels.keys()].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  for (const lv of order) {
    const nodes = levels.get(lv);
    const refSide = lv >= 0 ? parentsOf : childrenOf;   // rechts an Eltern, links an Kindern
    nodes.forEach((n, i) => {
      const refs = (refSide.get(n.key) || []).map(k => byKey.get(k)).filter(r => r && r._y != null);
      n._y = refs.length ? refs.reduce((s, r) => s + r._y, 0) / refs.length : i * (_MM.NODE_H + _MM.GAP_Y);
    });
    // Ueberlappungen aufloesen
    nodes.sort((a, b) => a._y - b._y);
    const min = _MM.NODE_H + _MM.GAP_Y;
    for (let i = 1; i < nodes.length; i++) {
      if (nodes[i]._y - nodes[i - 1]._y < min) nodes[i]._y = nodes[i - 1]._y + min;
    }
    // Ebene um ihren Mittelpunkt zentrieren
    if (nodes.length) {
      const mid = (nodes[0]._y + nodes[nodes.length - 1]._y) / 2;
      nodes.forEach(n => { n._y -= mid; });
    }
  }

  for (const n of data.nodes) n._x = n.level * (_MM.NODE_W + _MM.GAP_X);

  const xs = data.nodes.map(n => n._x), ys = data.nodes.map(n => n._y);
  // Rechts Platz fuer die Schlaufen gleich-Ebene-Kanten lassen (bulge 52 + Rand)
  const hasBackward = data.edges.some(e => {
    const a = byKey.get(e.from), b = byKey.get(e.to);
    return a && b && b._x <= a._x + _MM.NODE_W + 12;
  });
  return {
    byKey,
    bounds: {
      x0: Math.min(...xs) - 20,
      x1: Math.max(...xs) + _MM.NODE_W + (hasBackward ? 80 : 20),
      y0: Math.min(...ys) - 20, y1: Math.max(...ys) + _MM.NODE_H + 20,
    },
  };
}

function _mmNodeSvg(n) {
  const col = _mmTypeColor(n);
  const isRoot = n.is_root;
  // Normteile tragen rechts oben die NORM-Marke, deshalb bleibt dort weniger Platz
  const maxName = n.kind === 'std' ? 20 : 24;
  const name = n.name && n.name.length > maxName ? n.name.slice(0, maxName - 1) + '…' : (n.name || '');
  const num = n.item_number && n.item_number.length > 22 ? '…' + n.item_number.slice(-21) : (n.item_number || '');
  const clickable = n.kind === 'item';
  // CSS-Variablen funktionieren nur in style, nicht in Praesentationsattributen.
  return `<g class="mm-node" data-key="${esc(n.key)}"${clickable ? ` onclick="_mmOpen(${n.id})"` : ''}
      style="${clickable ? 'cursor:pointer' : ''}">
    <rect x="${n._x}" y="${n._y}" width="${_MM.NODE_W}" height="${_MM.NODE_H}" rx="7"
      style="fill:var(--bg2);stroke:${isRoot ? col : 'var(--line2)'};stroke-width:${isRoot ? 2 : 1}"/>
    <rect x="${n._x}" y="${n._y}" width="3" height="${_MM.NODE_H}" rx="1.5" style="fill:${col}"/>
    <text x="${n._x + 11}" y="${n._y + 17}"
      style="font-family:var(--mono);font-size:11.5px;fill:${col};font-weight:500">${esc(num)}</text>
    <text x="${n._x + 11}" y="${n._y + 33}"
      style="font-family:var(--sans);font-size:11.5px;fill:var(--t2)">${esc(name)}</text>
    ${n.status ? `<circle cx="${n._x + _MM.NODE_W - 11}" cy="${n._y + 13}" r="4"
      style="fill:${_mmStatusColor(n.status)}"><title>rev${esc(n.rev)} · ${esc(n.status)}</title></circle>` : ''}
    ${n.kind === 'std' ? `<text x="${n._x + _MM.NODE_W - 9}" y="${n._y + 17}" text-anchor="end"
      style="font-family:var(--mono);font-size:9.5px;fill:var(--t4)">NORM</text>` : ''}
  </g>`;
}

// Punkt auf einer kubischen Bezierkurve bei Parameter t
function _mmBezier(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}

function _mmEdgeSvg(e, L) {
  const a = L.byKey.get(e.from), b = L.byKey.get(e.to);
  if (!a || !b) return '';
  const ax = a._x + _MM.NODE_W, ay = a._y + _MM.NODE_H / 2;
  const bxL = b._x,             by = b._y + _MM.NODE_H / 2;
  const bxR = b._x + _MM.NODE_W;

  // Mehrfach verwendete Teile koennen auf derselben Ebene landen. Dann gaebe
  // eine Kurve nach rechts eine Schlaufe aus dem Bild — solche Kanten laufen
  // stattdessen gestrichelt von rechts nach rechts zurueck.
  const backward = bxL <= ax + 12;
  let c1x, c2x, endX;
  if (backward) {
    const bulge = 52;
    c1x = ax + bulge; c2x = bxR + bulge; endX = bxR;
  } else {
    const dx = Math.max(28, (bxL - ax) / 2);
    c1x = ax + dx; c2x = bxL - dx; endX = bxL;
  }

  // Fixierte Positionen bekommen die Revision ins Label — sonst sieht man
  // nicht, dass dieser Zweig bewusst auf einem alten Stand steht.
  // Kein Emoji: in SVG haengt dessen Darstellung von der Systemschrift ab,
  // die Farbe traegt die Bedeutung zuverlaessiger.
  const qty = e.quantity != null
    ? `${fmtN(e.quantity, e.quantity % 1 ? 1 : 0)}${e.unit ? ' ' + e.unit : '×'}`
    : '';
  const pin = e.pinned_rev ? `rev${e.pinned_rev}` : '';
  const label = [qty, pin].filter(Boolean).join(' · ');
  // Label kurz vor dem Zielknoten: dort hat sich der Faecher aufgeteilt und
  // jede Kante liegt auf der Hoehe ihres eigenen Ziels. Am Startknoten wuerden
  // sich alle Beschriftungen uebereinanderstapeln.
  const lw = label.length * 5.9 + 8;
  let lx, ly;
  if (backward) {
    lx = _mmBezier(0.5, ax, c1x, c2x, endX);
    ly = _mmBezier(0.5, ay, ay, by, by);
  } else {
    lx = endX - 7 - lw / 2;
    ly = by;
  }

  return `<g class="mm-edge" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
    <path d="M${ax} ${ay} C${c1x} ${ay}, ${c2x} ${by}, ${endX} ${by}"
      style="fill:none;stroke:var(--line3);stroke-width:1.4${backward ? ';stroke-dasharray:4 3' : ''}"/>
    ${label ? `<g><rect x="${lx - lw / 2}" y="${ly - 7}" width="${lw}" height="14" rx="3"
        style="fill:var(--bg0);opacity:.9"/>
      <text x="${lx}" y="${ly + 3.5}" text-anchor="middle"
        style="font-family:var(--mono);font-size:10px;fill:var(--t3)">${esc(qty)}${
          pin ? `${qty ? ' · ' : ''}<tspan style="fill:var(--amber)">${esc(pin)}</tspan>` : ''}</text></g>` : ''}
  </g>`;
}

function _mmRender() {
  const host = document.getElementById('mm-canvas');
  if (!host || !_MM.data) return;
  const data = _MM.data;

  if (!data.nodes.length) {
    host.innerHTML = '<div class="empty"><div class="empty-text">Keine Verknüpfungen</div></div>';
    return;
  }
  const L = _mmLayout(data);
  const w = L.bounds.x1 - L.bounds.x0, h = L.bounds.y1 - L.bounds.y0;

  host.innerHTML = `<svg id="mm-svg" width="100%" height="100%" style="display:block;cursor:grab">
    <g id="mm-view" transform="translate(${_MM.tx},${_MM.ty}) scale(${_MM.scale})">
      <g id="mm-edges">${data.edges.map(e => _mmEdgeSvg(e, L)).join('')}</g>
      <g id="mm-nodes">${data.nodes.map(n => _mmNodeSvg(n)).join('')}</g>
    </g>
  </svg>`;

  host.dataset.w = w; host.dataset.h = h;
  host.dataset.x0 = L.bounds.x0; host.dataset.y0 = L.bounds.y0;
  _mmWire();
}

// Ansicht einpassen
function _mmFit() {
  const host = document.getElementById('mm-canvas');
  if (!host || !host.dataset.w) return;
  const w = parseFloat(host.dataset.w), h = parseFloat(host.dataset.h);
  const x0 = parseFloat(host.dataset.x0), y0 = parseFloat(host.dataset.y0);
  const bw = host.clientWidth, bh = host.clientHeight;
  _MM.scale = Math.min(bw / w, bh / h, 1.3);
  _MM.tx = (bw - w * _MM.scale) / 2 - x0 * _MM.scale;
  _MM.ty = (bh - h * _MM.scale) / 2 - y0 * _MM.scale;
  _mmApply();
}
function _mmApply() {
  const g = document.getElementById('mm-view');
  if (g) g.setAttribute('transform', `translate(${_MM.tx},${_MM.ty}) scale(${_MM.scale})`);
  const z = document.getElementById('mm-zoom');
  if (z) z.textContent = Math.round(_MM.scale * 100) + '%';
}
function _mmZoom(factor, cx, cy) {
  const host = document.getElementById('mm-canvas');
  if (!host) return;
  const px = cx != null ? cx : host.clientWidth / 2;
  const py = cy != null ? cy : host.clientHeight / 2;
  const next = Math.min(3, Math.max(0.15, _MM.scale * factor));
  // Punkt unter dem Zeiger festhalten
  _MM.tx = px - (px - _MM.tx) * (next / _MM.scale);
  _MM.ty = py - (py - _MM.ty) * (next / _MM.scale);
  _MM.scale = next;
  _mmApply();
}

function _mmWire() {
  const svg = document.getElementById('mm-svg');
  const host = document.getElementById('mm-canvas');
  if (!svg || !host) return;

  // Jedes Rendern baut das SVG neu — alte Window-Listener zuerst abmelden,
  // sonst sammeln sie sich bei jeder Tiefenaenderung an.
  _mmUnwire();

  let dragging = false, sx = 0, sy = 0;
  svg.addEventListener('mousedown', e => {
    if (e.target.closest('.mm-node')) return;
    dragging = true; sx = e.clientX - _MM.tx; sy = e.clientY - _MM.ty;
    svg.style.cursor = 'grabbing';
    e.preventDefault();
  });
  _mmDragMove = e => {
    if (!dragging) return;
    _MM.tx = e.clientX - sx; _MM.ty = e.clientY - sy; _mmApply();
  };
  _mmDragUp = () => { dragging = false; if (svg) svg.style.cursor = 'grab'; };
  window.addEventListener('mousemove', _mmDragMove);
  window.addEventListener('mouseup', _mmDragUp);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const r = host.getBoundingClientRect();
    _mmZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Verbundene Kanten hervorheben
  host.querySelectorAll('.mm-node').forEach(g => {
    const key = g.dataset.key;
    g.addEventListener('mouseenter', () => {
      host.querySelectorAll('.mm-edge').forEach(ed => {
        const on = ed.dataset.from === key || ed.dataset.to === key;
        const path = ed.querySelector('path');
        path.style.stroke = on ? 'var(--blue)' : 'var(--line3)';
        path.style.strokeWidth = on ? '2.2' : '1.4';
      });
    });
    g.addEventListener('mouseleave', () => {
      host.querySelectorAll('.mm-edge path').forEach(p => {
        p.style.stroke = 'var(--line3)';
        p.style.strokeWidth = '1.4';
      });
    });
  });
}

function _mmOpen(itemId) {
  _mmClose();
  openItemDetail(itemId);
}
function _mmUnwire() {
  if (_mmDragMove) window.removeEventListener('mousemove', _mmDragMove);
  if (_mmDragUp)   window.removeEventListener('mouseup', _mmDragUp);
  _mmDragMove = null; _mmDragUp = null;
}
function _mmClose() {
  _mmUnwire();
  document.removeEventListener('keydown', _mmKey);
  document.getElementById('mindmapOverlay')?.remove();
}

async function _mmLoad() {
  const host = document.getElementById('mm-canvas');
  if (host) host.innerHTML = '<div class="empty"><div class="empty-text">Wird geladen…</div></div>';
  try {
    _MM.data = await api(`/api/items/${_MM.rootId}/graph?up=${_MM.up}&down=${_MM.down}`);
  } catch (e) {
    if (host) host.innerHTML = '<div class="empty"><div class="empty-text">Graph konnte nicht geladen werden</div></div>';
    return;
  }
  _mmRender();
  _mmFit();
  _mmInfo();
}

function _mmInfo() {
  const el = document.getElementById('mm-info');
  if (!el || !_MM.data) return;
  const d = _MM.data;
  const items = d.nodes.filter(n => n.kind === 'item').length;
  const std = d.nodes.filter(n => n.kind === 'std').length;
  const upN = d.nodes.filter(n => n.level < 0).length;
  const downN = d.nodes.filter(n => n.level > 0).length;
  const warn = [];
  if (d.truncated?.up)   warn.push('oben abgeschnitten');
  if (d.truncated?.down) warn.push('unten abgeschnitten');
  el.innerHTML = `
    <span>${upN} verwenden es</span><span style="color:var(--line2)">│</span>
    <span>${downN} enthalten</span><span style="color:var(--line2)">│</span>
    <span>${items} Teile${std ? ` + ${std} Normteile` : ''}</span>
    ${d.historic_up ? `<span style="color:var(--line2)">│</span><span style="color:var(--amber)">${d.historic_up} nur in älteren Revisionen</span>` : ''}
    ${warn.length ? `<span style="color:var(--line2)">│</span><span style="color:var(--amber)">⚠ ${warn.join(', ')}</span>` : ''}`;
}

function _mmSetDepth(which, delta) {
  if (which === 'up')   _MM.up   = Math.min(6, Math.max(0, _MM.up + delta));
  if (which === 'down') _MM.down = Math.min(6, Math.max(0, _MM.down + delta));
  document.getElementById('mm-up').textContent = _MM.up;
  document.getElementById('mm-down').textContent = _MM.down;
  _mmLoad();
}

function openItemMindmap(itemId) {
  _MM.rootId = itemId;
  _MM.scale = 1; _MM.tx = 0; _MM.ty = 0;
  const it = state.item;
  const title = it && it.id === itemId ? `${it.item_number} · ${it.name}` : 'Abhängigkeiten';

  document.getElementById('mindmapOverlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.id = 'mindmapOverlay';
  ov.innerHTML = `<div class="modal" style="max-width:min(1500px,96vw);width:96vw;height:90vh;display:flex;flex-direction:column">
    <div class="modal-head" style="gap:12px;flex-wrap:wrap">
      <div class="modal-title" style="display:flex;align-items:center;gap:9px;min-width:0">
        <span>⌗ Mindmap</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap">
        <span style="font-size:11px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.8px">Verwendung</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmSetDepth('up',-1)">−</button>
        <span id="mm-up" style="font-family:var(--mono);font-size:13px;min-width:14px;text-align:center">${_MM.up}</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmSetDepth('up',1)">+</button>
        <span style="color:var(--line2)">│</span>
        <span style="font-size:11px;font-family:var(--mono);color:var(--t4);text-transform:uppercase;letter-spacing:.8px">Bestandteile</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmSetDepth('down',-1)">−</button>
        <span id="mm-down" style="font-family:var(--mono);font-size:13px;min-width:14px;text-align:center">${_MM.down}</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmSetDepth('down',1)">+</button>
        <span style="color:var(--line2)">│</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmZoom(1/1.2)">−</button>
        <span id="mm-zoom" style="font-family:var(--mono);font-size:13px;min-width:38px;text-align:center;color:var(--t3)">100%</span>
        <button class="btn btn-ghost btn-sm" onclick="_mmZoom(1.2)">+</button>
        <button class="btn btn-ghost btn-sm" onclick="_mmFit()">Einpassen</button>
        <button class="btn btn-ghost btn-sm" onclick="_mmClose()">✕</button>
      </div>
    </div>
    <div id="mm-canvas" style="flex:1;min-height:0;background:var(--bg0);position:relative;overflow:hidden"></div>
    <div style="display:flex;align-items:center;gap:10px;padding:9px 20px;border-top:1px solid var(--line);flex-wrap:wrap;background:var(--bg1);border-radius:0 0 var(--r-xl) var(--r-xl)">
      <div id="mm-info" style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--t3);flex-wrap:wrap"></div>
      <div style="margin-left:auto;display:flex;align-items:center;gap:12px;font-size:11px;color:var(--t4);flex-wrap:wrap">
        ${[['Baugruppe','var(--blue)'],['Bauteil','var(--teal)'],['Dokument','var(--purple)'],['Normteil','var(--amber)']]
          .map(([l,c]) => `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:2px;background:${c}"></span>${l}</span>`).join('')}
        <span style="color:var(--line2)">│</span>
        <span style="display:inline-flex;align-items:center;gap:5px"><span style="font-family:var(--mono);color:var(--amber)">rev1</span> feste Revision</span>
        <span style="color:var(--line2)">│</span>
        <span>Ziehen zum Verschieben · Rad zum Zoomen · Klick öffnet das Teil</span>
      </div>
    </div>
  </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) _mmClose(); });
  document.body.appendChild(ov);
  document.addEventListener('keydown', _mmKey);
  _mmLoad();
  window.addEventListener('resize', () => _mmFit(), { once: true });
}
