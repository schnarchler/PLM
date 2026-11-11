// Screenshots für das README neu erzeugen: startet PLM mit einer leeren
// Wegwerf-Datenbank, legt Demo-Daten an und fotografiert die Ansichten mit
// headless Chrome (DevTools-Protokoll). Echte Daten werden nicht berührt.
//
//   node docs/make-screenshots.js en      → docs/images/en/*.png
//   node docs/make-screenshots.js de      → docs/images/de/*.png
//   CHROME=/pfad/zu/chrome node docs/make-screenshots.js en
//
// Braucht Node 22 (WebSocket) und Chrome oder Chromium.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const LANG = process.argv[2] || 'en';
const OUT = process.argv[3] || path.join(__dirname, 'images', LANG);
const PORT = 3975, CDP = 9335, W = 1440, H = 900;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const T = {
  en: { project: 'Desk lamp', project2: 'Cable organizer', asm: 'Desk lamp assembly', base: 'Base', arm: 'Arm', head: 'Lamp head', drawing: 'Assembly drawing',
    clip: 'Cable clip', baseDesc: 'Weighted base with cable channel, printed upside down', armDesc: 'Arm segment with friction hinge',
    std: 'Socket head cap screw', cls: ['In-house part', 'Purchased part'], cust1: 'Northwind Workshop Ltd', cust2: 'Alpine Makers', city1: 'Basel', city2: 'Chur',
    order: 'Desk lamps for showroom', quote: 'Cable organizers, 50 pcs', prod: 'Desk lamps, batch 1', labour: 'Assembly and testing',
    rm: 'PETG Black 1000g', rmType: 'PETG', rmColor: 'Black', inv: 'Screw M4x12', ecr: 'Stronger arm joint', ecrReason: 'Hinge loosens after a few weeks',
    company: 'Example Workshop', street: '12 Sample Street', city: 'Zurich', country: 'Switzerland', terms: '30 days net' },
  de: { project: 'Schreibtischlampe', project2: 'Kabelorganizer', asm: 'Schreibtischlampe komplett', base: 'Fuss', arm: 'Arm', head: 'Lampenkopf', drawing: 'Montagezeichnung',
    clip: 'Kabelclip', baseDesc: 'Beschwerter Fuss mit Kabelkanal, kopfüber gedruckt', armDesc: 'Armsegment mit Reibgelenk',
    std: 'Zylinderschraube', cls: ['Eigenteil', 'Kaufteil'], cust1: 'Werkstatt Muster AG', cust2: 'Alpen Maker GmbH', city1: 'Basel', city2: 'Chur',
    order: 'Schreibtischlampen für Ausstellung', quote: 'Kabelorganizer, 50 Stück', prod: 'Schreibtischlampen, Los 1', labour: 'Montage und Prüfung',
    rm: 'PETG Schwarz 1000g', rmType: 'PETG', rmColor: 'Schwarz', inv: 'Schraube M4x12', ecr: 'Armgelenk verstärken', ecrReason: 'Gelenk lockert sich nach einigen Wochen',
    company: 'Muster Werkstatt', street: 'Musterstrasse 12', city: 'Zürich', country: 'Schweiz', terms: '30 Tage netto' },
}[LANG];

async function api(url, method = 'GET', body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Lampenfuss als STL: flacher Zylinder mit Fase, damit Vorschau und 3D-Ansicht etwas zeigen
function baseStl() {
  const seg = 48, f = [];
  const ring = (r, z) => Array.from({ length: seg }, (_, i) => [r * Math.cos(2 * Math.PI * i / seg), r * Math.sin(2 * Math.PI * i / seg), z]);
  const rings = [ring(55, 0), ring(55, 14), ring(46, 22), ring(14, 22), ring(14, 70), ring(10, 74)];
  const tri = (a, b, c) => f.push([a, b, c]);
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg, A = rings[k][i], B = rings[k][j], C = rings[k + 1][j], D = rings[k + 1][i];
    tri(A, B, C); tri(A, C, D);
  }
  const top = rings[rings.length - 1], bot = rings[0];
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; tri([0, 0, 74], top[i], top[j]); tri([0, 0, 0], bot[j], bot[i]); }
  const n = (a, b, c) => { const u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]);
    const r = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...r) || 1; return r.map(x => x / l); };
  return 'solid base\n' + f.map(([a, b, c]) => `facet normal ${n(a, b, c).join(' ')}\nouter loop\n${[a, b, c].map(p => `vertex ${p.join(' ')}`).join('\n')}\nendloop\nendfacet`).join('\n') + '\nendsolid base\n';
}

async function seed() {
  await api('/api/settings', 'PUT', { ui_lang: LANG, doc_lang: LANG, company_name: T.company, company_street: T.street, company_postal_code: '8000',
    company_city: T.city, company_country: T.country, company_email: 'info@example.com', bank_name: 'Example Bank', bank_iban: 'CH00 0000 0000 0000 0000 0',
    default_tax_rate: '8.1', hourly_rate: '95', default_class_own: T.cls[0], default_class_bought: T.cls[1] });
  const p = await api('/api/projects', 'POST', { name: T.project, description: '' });
  const p2 = await api('/api/projects', 'POST', { name: T.project2 });
  const asm = await api(`/api/projects/${p.id}/items`, 'POST', { name: T.asm, item_type: 'asm', description: T.project });
  const base = await api(`/api/projects/${p.id}/items`, 'POST', { name: T.base, item_type: 'prt', description: T.baseDesc, parent_id: asm.id });
  const arm = await api(`/api/projects/${p.id}/items`, 'POST', { name: T.arm, item_type: 'prt', description: T.armDesc, parent_id: asm.id });
  const head = await api(`/api/projects/${p.id}/items`, 'POST', { name: T.head, item_type: 'prt', parent_id: asm.id });
  await api(`/api/projects/${p.id}/items`, 'POST', { name: T.drawing, item_type: 'doc' });
  const clip = await api(`/api/projects/${p2.id}/items`, 'POST', { name: T.clip, item_type: 'prt', source_url: 'https://www.printables.com/' });
  const full = async it => api(`/api/items/${it.id}`);
  for (const [it, w, price, cls] of [[base, 182, 18.5, T.cls[0]], [arm, 64, 9.8, T.cls[0]], [head, 48, 12.4, T.cls[0]], [clip, 6, 0.9, T.cls[1]]])
    await api(`/api/items/${it.id}`, 'PUT', { name: it.name, description: it.description || '', classification: cls, weight_g: w, default_price: price });
  const baseRev = (await full(base)).revisions[0];
  const fd = new FormData();
  fd.append('file', new Blob([baseStl()], { type: 'model/stl' }), 'base.stl');
  const up = await fetch(`${BASE}/api/revisions/${baseRev.id}/datasets`, { method: 'POST', body: fd });
  if (!up.ok) throw new Error('STL-Upload: ' + up.status + ' ' + await up.text());
  await api(`/api/revisions/${baseRev.id}/print-settings`, 'PUT', { material: 'PETG', layer_height: 0.2, infill: 20, infill_pattern: 'gyroid', supports: 0,
    nozzle: 0.4, print_temp: 240, bed_temp: 80, printer: 'Prusa MK4S', part_weight: 182, filament_weight_total: 191, print_duration: 6.5 });
  await api(`/api/revisions/${baseRev.id}/status`, 'PUT', { status: 'REL' });
  const asmRev = (await full(asm)).revisions[0];
  for (const [it, q] of [[base, 1], [arm, 2], [head, 1]]) await api(`/api/revisions/${asmRev.id}/bom`, 'POST', { child_item_id: it.id, quantity: q, unit: 'pcs' });
  const sp = await api('/api/standard-parts', 'POST', { designation: `DIN 912 ${T.std} M4x12 A2-70`, standard: 'DIN', std_number: '912', name: T.std, size: 'M4x12', material: 'A2-70', unit_price: 0.12, weight_g: 2.1 });
  await api(`/api/revisions/${asmRev.id}/bom-std`, 'POST', { std_part_id: sp.id, quantity: 6, unit: 'pcs' });
  const c1 = await api('/api/customers', 'POST', { name: T.cust1, city: T.city1, country: T.country, email: 'orders@example.com' });
  const c2 = await api('/api/customers', 'POST', { name: T.cust2, city: T.city2, country: T.country });
  const o = await api('/api/orders', 'POST', { title: T.order, customer_id: c1.id, delivery_date: day(2) });
  await api(`/api/orders/${o.id}/items`, 'POST', { item_id: asm.id, description: T.asm, quantity: 4, unit: 'pcs', unit_price: 145 });
  await api(`/api/orders/${o.id}/items`, 'POST', { description: T.labour, quantity: 3, unit: 'h', unit_price: 95 });
  await api(`/api/orders/${o.id}/status`, 'PUT', { status: 'CONFIRMED' });
  const q = await api('/api/orders', 'POST', { title: T.quote, customer_id: c2.id, status: 'QUOTE', valid_until: day(3) });
  await api(`/api/orders/${q.id}/items`, 'POST', { item_id: clip.id, description: T.clip, quantity: 50, unit: 'pcs', unit_price: 2.9 });
  const d = await api('/api/deliveries', 'POST', { title: T.prod, customer_id: c1.id, delivery_date: day(1) });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { item_id: asm.id, description: T.asm, quantity: 4, unit: 'pcs' });
  await api('/api/raw-materials', 'POST', { name: T.rm, material_type: T.rmType, color: T.rmColor, brand: 'Prusament', stock_qty: 6, min_qty: 2, unit: 'pcs', weight_g: 1000, print_temp: 240, bed_temp: 80, lot_number: 'LOT-2026-014' });
  await api('/api/inventory', 'POST', { name: T.inv, unit: 'pcs', min_qty: 50 });
  await api('/api/ecrs', 'POST', { title: T.ecr, reason: T.ecrReason, items: [{ item_id: arm.id }] });
  return { p, asm, base, o, d };
}

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map();
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.wait.has(m.id)) { this.wait.get(m.id)(m); this.wait.delete(m.id); } }; }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise(r => this.wait.set(id, r)); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; }
  async shot(file) { const s = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')); }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-shots-'));
  fs.writeFileSync(path.join(dir, 'plm.config'), `data_dir=${dir}\n`);
  fs.mkdirSync(OUT, { recursive: true });
  const srv = spawn('node', [path.join(ROOT, 'backend', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dir, PLM_PORT: String(PORT), PLM_CONFIG: path.join(dir, 'plm.config') }, stdio: 'ignore' });
  let chrome;
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/stats'); break; } catch { await sleep(200); } }
    const ids = await seed();
    chrome = spawn(CHROME, ['--headless', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${CDP}`,
      `--user-data-dir=${dir}/chrome`, `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
    let targets;
    for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); break; } catch { await sleep(200); } }
    const ws = new WebSocket(targets.find(x => x.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);
    const pg = new Page(ws);
    await pg.send('Page.enable'); await pg.send('Runtime.enable');
    await pg.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await pg.send('Page.navigate', { url: BASE + '/favicon.png' }); await sleep(600);
    await pg.eval(`localStorage.setItem('plm.lang', '${LANG}'); localStorage.removeItem('plm_recent'); 1`);
    await pg.send('Page.navigate', { url: BASE + '/' }); await sleep(2500);
    await pg.eval(`document.querySelectorAll('#dynModal').forEach(m => m.remove()); 1`);

    await pg.eval(`gotoView('dashboard').then(() => 1)`); await sleep(1200);
    await pg.shot(path.join(OUT, 'dashboard.png'));

    await pg.eval(`gotoView('projects').then(() => openProject(${ids.p.id})).then(() => gotoPlmItem(${ids.base.id})).then(() => 1)`); await sleep(1500);
    await pg.eval(`document.querySelector('#left-body [onclick*="togN"]')?.click(); 1`); await sleep(2500);
    await pg.shot(path.join(OUT, 'item.png'));

    await pg.eval(`Promise.resolve(openItemMindmap(${ids.asm.id})).then(() => 1)`); await sleep(2500);
    await pg.shot(path.join(OUT, 'mindmap.png'));
    await pg.eval(`document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')); document.querySelectorAll('#dynModal').forEach(m => m.remove()); 1`);

    await pg.eval(`gotoView('orders').then(() => openOrderDetail(${ids.o.id})).then(() => 1)`); await sleep(1800);
    await pg.shot(path.join(OUT, 'order.png'));

    // Rechnung: HTML abfangen und in einer eigenen Seite zeigen
    await pg.eval(`window.__doc = ''; window.open = () => ({ document: { write: h => { window.__doc = h; }, close() {} }, focus() {}, print() {} }); 1`);
    await pg.eval(`generateDoc(${ids.o.id}, 'invoice').then(() => 1)`); await sleep(800);
    const html = await pg.eval('window.__doc');
    fs.writeFileSync(path.join(dir, 'invoice.html'), html.replace(/window\.print\(\);?/g, ''));
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1050, deviceScaleFactor: 1, mobile: false });
    await pg.send('Page.navigate', { url: 'file://' + path.join(dir, 'invoice.html') }); await sleep(1500);
    await pg.shot(path.join(OUT, 'invoice.png'));
    ws.close();
    console.log('fertig:', fs.readdirSync(OUT).join(', '));
  } finally {
    chrome?.kill(); srv.kill(); await sleep(500);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
