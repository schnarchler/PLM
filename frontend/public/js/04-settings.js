// 04-settings.js — Einstellungen, Drucker/Düsen/Material, Datei-Index
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── SETTINGS ──────────────────────────────────────────────────
function _stTab(name) {
  document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.st-tab-pane').forEach(p => p.hidden = p.dataset.tab !== name);
}

async function renderSettings() {
  setLeftHeader('Einstellungen', `<button class="btn btn-primary btn-sm" onclick="saveSettings()">💾 Speichern</button>`);
  closeDetail();
  const s = state.settings;
  const fi = (id, label, val, ph='', type='text') =>
    `<div class="fg"><label class="fl">${label}</label><input class="fi" id="st-${id}" type="${type}" value="${esc(val||'')}" placeholder="${ph}"></div>`;
  const ft = (id, label, val, ph='') =>
    `<div class="fg"><label class="fl">${label}</label><textarea class="ft" id="st-${id}" rows="2" placeholder="${ph}">${esc(val||'')}</textarea></div>`;
  const fck = (id, label, val) =>
    `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--t2)"><input type="checkbox" id="st-${id}" ${val !== '0' ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">${label}</label>`;

  const stor = await api('/api/storage').catch(() => null);
  function fmtBytes(b) {
    if (b == null) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
    if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
    return (b/1024/1024/1024).toFixed(2) + ' GB';
  }
  const storHtml = stor ? `
    <div style="display:flex;gap:16px;align-items:center;background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:8px 14px;margin-bottom:18px;font-size:12px;color:var(--t3)">
      <span style="color:var(--t2);font-weight:600;font-size:13px">Speicher</span>
      <span>Datenbank: <strong style="color:var(--t1)">${fmtBytes(stor.db_bytes)}</strong></span>
      <span>Dateien: <strong style="color:var(--t1)">${fmtBytes(stor.files_bytes)}</strong></span>
      <span style="margin-left:auto">Gesamt: <strong style="color:var(--blue)">${fmtBytes(stor.total_bytes)}</strong></span>
    </div>` : '';

  setLeftBody(`
    <div style="max-width:720px">
      ${storHtml}
      <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:20px">
        <button class="st-tab-btn active" data-tab="firma"   onclick="_stTab('firma')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Firma</button>
        <button class="st-tab-btn"        data-tab="kalk"    onclick="_stTab('kalk')"    style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Kalkulation</button>
        <button class="st-tab-btn"        data-tab="bon"     onclick="_stTab('bon')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Kassabon</button>
        <button class="st-tab-btn"        data-tab="druck3d" onclick="_stTab('druck3d')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">3D-Druck</button>
        <button class="st-tab-btn"        data-tab="plm"     onclick="_stTab('plm')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">PLM</button>
        <button class="st-tab-btn"        data-tab="daten"   onclick="_stTab('daten')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Daten</button>
        <button class="st-tab-btn"        data-tab="loeschen" onclick="_stTab('loeschen')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--red);border-bottom:2px solid transparent;margin-bottom:-1px">Admin</button>
      </div>

      <!-- TAB: Firma -->
      <div class="st-tab-pane" data-tab="firma">
        <div class="sep-label" style="margin-top:0">Firma / Briefkopf</div>
        <div class="form-row cols2">
          ${fi('company_name','Firmenname *',s.company_name,'Muster GmbH')}
          ${fi('company_uid','UID / MwSt-Nr.',s.company_uid,'CHE-123.456.789 MWST')}
        </div>
        <div class="form-row">
          ${fi('company_street','Straße + Hausnummer',s.company_street,'Industriestraße 42')}
        </div>
        <div class="form-row cols3">
          ${fi('company_postal_code','PLZ',s.company_postal_code,'8000')}
          ${fi('company_city','Ort',s.company_city,'Zürich')}
          ${fi('company_country','Land',s.company_country,'Schweiz')}
        </div>
        <div class="form-row cols3">
          ${fi('company_phone','Telefon',s.company_phone,'+41 44 000 00 00')}
          ${fi('company_email','E-Mail',s.company_email,'info@firma.ch','email')}
          ${fi('company_website','Website',s.company_website,'www.firma.ch')}
        </div>
        <div class="sep-label">Bankangaben</div>
        <div class="form-row cols3">
          ${fi('bank_name','Bank',s.bank_name,'Zürcher Kantonalbank')}
          ${fi('bank_iban','IBAN',s.bank_iban,'CH00 0000 0000 0000 0000 0')}
          ${fi('bank_bic','BIC / SWIFT',s.bank_bic,'ZKBKCHZZ80A')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: Kalkulation -->
      <div class="st-tab-pane" data-tab="kalk" hidden>
        <div class="sep-label" style="margin-top:0">Standardwerte</div>
        <div class="form-row cols3">
          ${fi('default_tax_rate','Standard MwSt. (%)',s.default_tax_rate,'','number')}
          ${fi('quote_validity_days','Angebot gültig (Tage)',s.quote_validity_days,'','number')}
          ${fi('default_payment_terms','Zahlungsbedingungen',s.default_payment_terms,'30 Tage netto')}
        </div>
        <div class="form-row cols3">
          ${fi('hourly_rate','Stundensatz (CHF/h)',s.hourly_rate,'z.B. 120','number')}
        </div>
        <div class="sep-label">Dokument-Fussnoten</div>
        <div class="form-row">
          ${ft('invoice_footer','Fusszeile Rechnung',s.invoice_footer,'Zahlungshinweis, Bankverbindung …')}
        </div>
        <div class="form-row">
          ${ft('quote_footer','Fusszeile Angebot',s.quote_footer,'Hinweis Gültigkeit, Lieferbedingungen …')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: Kassabon -->
      <div class="st-tab-pane" data-tab="bon" hidden>
        <div class="sep-label" style="margin-top:0">Fusszeile</div>
        <div class="form-row">
          ${ft('receipt_footer','Fusszeile Kassabon',s.receipt_footer,'z.B. Vielen Dank für Ihren Auftrag!')}
        </div>
        <div class="sep-label">Bon-Aufbau</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px">
          <div class="form-row cols2" style="margin-bottom:8px">
            ${fi('receipt_line_width','Zeilenbreite (Zeichen)',s.receipt_line_width,'32','number')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${fck('receipt_show_datetime','Datum &amp; Uhrzeit anzeigen',s.receipt_show_datetime)}
            ${fck('receipt_show_customer','Kundenname anzeigen',s.receipt_show_customer)}
            ${fck('receipt_show_item_number','Artikelnummer anzeigen',s.receipt_show_item_number)}
            ${fck('receipt_show_notes','Notizen anzeigen',s.receipt_show_notes)}
          </div>
        </div>
        <div class="sep-label">Rohmaterial-Etikett</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${fck('label_show_qr','QR-Code auf Etikett drucken',s.label_show_qr ?? '1')}
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: 3D-Druck -->
      <div class="st-tab-pane" data-tab="druck3d" hidden>
        <div class="sep-label" style="margin-top:0">Drucker</div>
        <div id="st-printers-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input class="fi" id="st-pr-name" style="width:200px" placeholder="Druckername">
          <input class="fi" id="st-pr-cost" type="number" step="0.01" style="width:110px" placeholder="CHF/h (z.B. 1.50)">
          <button class="btn btn-ghost btn-sm" onclick="addPrinter()">+ Drucker hinzufügen</button>
        </div>

        <div class="sep-label" style="margin-top:20px">Düsen</div>
        <div id="st-nozzles-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="fi" id="st-nz-size" style="width:120px" placeholder="Grösse (z.B. 0.4)">
          <button class="btn btn-ghost btn-sm" onclick="addNozzle()">+ Düse hinzufügen</button>
        </div>

        <div class="sep-label" style="margin-top:20px">Material-Vorlagen</div>
        <div id="st-mats-list" style="margin-bottom:8px"></div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px;margin-top:4px">
          <div class="form-row cols3">
            <div class="fg"><label class="fl">Name *</label><input class="fi" id="st-mat-name" placeholder="z.B. PLA"></div>
            <div class="fg"><label class="fl">Düse</label>
              <select class="fs" id="st-mat-nozzle"><option value="">—</option></select>
            </div>
            <div class="fg"><label class="fl">Filamentpreis (CHF/kg)</label><input class="fi" id="st-mat-price" type="number" step="0.01" placeholder="22.00"></div>
          </div>
          <div class="form-row cols3">
            <div class="fg"><label class="fl">Drucktemp (°C)</label><input class="fi" id="st-mat-temp" placeholder="210"></div>
            <div class="fg"><label class="fl">Bett (°C)</label><input class="fi" id="st-mat-bed" placeholder="60"></div>
            <div class="fg"><label class="fl">Notizen</label><input class="fi" id="st-mat-notes" placeholder="optional"></div>
          </div>
          <input type="hidden" id="st-mat-id" value="">
          <button class="btn btn-ghost btn-sm" id="st-mat-add-btn" onclick="addMaterialPreset()">+ Vorlage hinzufügen</button>
        </div>
      </div>

      <!-- TAB: PLM -->
      <div class="st-tab-pane" data-tab="plm" hidden>
        <div class="sep-label" style="margin-top:0">Klassifizierungen</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:12px">Verfügbare Klassifizierungen für Bauteile, Baugruppen und Dokumente. Reihenfolge per Drag &amp; Drop ändern.</div>
        <div id="st-class-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="st-class-new" placeholder="Neue Klassifizierung…" style="max-width:240px" onkeydown="if(event.key==='Enter')_addClass()">
          <button class="btn btn-ghost btn-sm" onclick="_addClass()">+ Hinzufügen</button>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="_saveClassifications()">Speichern</button>
          <span id="st-class-msg" style="font-size:13px;color:var(--t3);margin-left:8px"></span>
        </div>
      </div>

      <!-- TAB: Daten -->
      <div class="st-tab-pane" data-tab="daten" hidden>
        <div class="sep-label" style="margin-top:0">Darstellung</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">Schriftgrösse der Benutzeroberfläche anpassen.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['0.8','Klein'],['0.9','Mittel-klein'],['1','Normal'],['1.1','Mittel-gross'],['1.2','Gross'],['1.35','Sehr gross']].map(([sc,l]) => {
            const active = (s.font_scale || '1') === sc ? ' btn-primary' : ' btn-ghost';
            return `<button class="btn btn-sm fs-preset-btn${active}" data-scale="${sc}" onclick="setFontScale('${sc}')">${l}</button>`;
          }).join('')}
        </div>

        <div class="sep-label" style="margin-top:24px">Datenpfad</div>
        <div id="st-datapath-info" style="font-size:13px;color:var(--t3);margin-bottom:10px">Lädt aktuelle Pfade…</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">Datenverzeichnis (Datenbank + Dateien)</label>
            <input class="fi" id="st-data-dir" placeholder="/absoluter/pfad/zum/datenverzeichnis">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveDataPath()">Pfad speichern</button>
          <span id="st-datapath-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:20px">CAD-Programm</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px">Pfad zur ausführbaren Datei des CAD-Programms. Wird über den CAD-Button in der Topbar gestartet.</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">CAD-Pfad</label>
            <input class="fi" id="st-cad-path" placeholder="z.B. /usr/bin/solidedge oder C:\\Program Files\\...">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveCadPath()">Pfad speichern</button>
          <span id="st-cad-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:20px">Checkout-Verzeichnis</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px">Ordner, in den ausgecheckte CAD-Dateien kopiert werden. Leer lassen für Standard: <code style="font-family:var(--mono)">[Datenverzeichnis]/checkout</code></div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">Checkout-Pfad</label>
            <input class="fi" id="st-checkout-dir" placeholder="z.B. /home/user/CAD-Checkout">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveCheckoutDir()">Pfad speichern</button>
          <span id="st-checkout-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:24px">Datensicherung</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">Lädt alle PLM-Daten als ZIP-Archiv herunter.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-ghost" href="/api/export" download>&#x1F4E6; Gesamtexport (Rohdaten)</a>
          <a class="btn btn-ghost" href="/api/export-named" download title="Dateien werden wie beim Checkout mit korrekten Namen und Ordnerstruktur exportiert">&#x1F4C1; Export mit Klarnamen</a>
        </div>
        <div style="font-size:11px;color:var(--t4);margin-top:6px">
          Klarnamen-Export: Dateien werden nach Projekt/Item/Revision sortiert und mit Original-Dateinamen abgelegt — wie beim Checkout.
        </div>

        <div class="sep-label" style="margin-top:24px">Datei-Index</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">Übersicht aller gespeicherten Dateien mit angezeigtem Namen und tatsächlichem Dateinamen auf der Festplatte (Notfall-Referenz).</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="gotoView('fileindex')">&#x1F4C2; Datei-Index öffnen</button>
        </div>
      </div>

      <!-- TAB: Admin -->
      <div class="st-tab-pane" data-tab="loeschen" hidden>
        <div style="background:var(--red-soft);border:1px solid var(--red-line);border-radius:var(--r);padding:10px 14px;margin-bottom:20px;font-size:13px;color:var(--red)">
          ⚠ Änderungen hier können bestehende Daten und Nummernkreise dauerhaft beschädigen. Nur vornehmen wenn du weisst was du tust.
        </div>

        <div class="sep-label" style="margin-top:0;color:var(--red)">Datensätze löschen</div>
        <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:14px">
          <button class="adm-del-tab active" data-deltab="teile"    onclick="_admDelTab('teile')"    style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--red);border-bottom:2px solid var(--red);margin-bottom:-1px;font-weight:600">Teile</button>
          <button class="adm-del-tab"        data-deltab="projekte" onclick="_admDelTab('projekte')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">Projekte</button>
          <button class="adm-del-tab"        data-deltab="auftraege"  onclick="_admDelTab('auftraege')"  style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">Aufträge</button>
          <button class="adm-del-tab"        data-deltab="produktion" onclick="_admDelTab('produktion')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">Produktion</button>
        </div>
        <div id="adm-del-teile">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">Freigegebene (REL/OBS) Bauteile, Baugruppen und Dokumente</div>
          <div id="st-del-items" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-projekte" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">Projekte mit Inhalten (Items, Dateien)</div>
          <div id="st-del-projects" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-auftraege" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">Aufträge (nicht Entwurf)</div>
          <div id="st-del-orders" style="display:flex;flex-direction:column;gap:4px"></div>
          <div style="font-size:13px;color:var(--t3);margin:10px 0 6px">Angebote (nicht Entwurf)</div>
          <div id="st-del-quotes" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-produktion" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">Produktionsaufträge (nicht Entwurf)</div>
          <div id="st-del-deliveries" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div class="sep-label" style="margin-top:28px">Nummernpräfixe</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:12px">Präfixe für neu erstellte Datensätze. Bestehende Nummern werden <b>nicht</b> geändert.</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Aufträge</label><input class="fi" id="adm-prefix-order" placeholder="AUF"></div>
          <div class="fg"><label class="fl">Angebote</label><input class="fi" id="adm-prefix-quote" placeholder="ANG"></div>
          <div class="fg"><label class="fl">Produktion</label><input class="fi" id="adm-prefix-delivery" placeholder="LS"></div>
          <div class="fg"><label class="fl">Kunden</label><input class="fi" id="adm-prefix-customer" placeholder="KD"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">Stellen Geschäftsnummern</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Aufträge</label><input class="fi" id="adm-pad-order" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">Angebote</label><input class="fi" id="adm-pad-quote" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">Produktion</label><input class="fi" id="adm-pad-delivery" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">Kunden</label><input class="fi" id="adm-pad-customer" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">Projekte</label><input class="fi" id="adm-pad-project" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg" style="display:flex;align-items:center;gap:10px;padding-top:20px">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--t2)">
              <input type="checkbox" id="adm-num-yearly" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
              Jahreszahl in Nummer
            </label>
          </div>
        </div>

        <div class="sep-label" style="margin-top:20px">Struktur Item-Nummern</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">Gilt nur für <b>neu erstellte</b> Items. Bestehende Nummern werden nicht geändert.</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Trennzeichen</label><input class="fi" id="adm-num-sep" placeholder="-" maxlength="3"></div>
          <div class="fg"><label class="fl">Stellen Baugruppe</label><input class="fi" id="adm-pad-asm" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Stellen Part</label><input class="fi" id="adm-pad-prt" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Stellen Dokument</label><input class="fi" id="adm-pad-doc" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Baugruppen-Kürzel</label><input class="fi" id="adm-seg-asm" placeholder="asm" maxlength="10"></div>
          <div class="fg"><label class="fl">Part-Kürzel</label><input class="fi" id="adm-seg-prt" placeholder="prt" maxlength="10"></div>
          <div class="fg"><label class="fl">Dokument-Kürzel</label><input class="fi" id="adm-seg-doc" placeholder="doc" maxlength="10"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">Revisionen</div>
        <div class="form-row">
          <div class="fg"><label class="fl">Format</label>
            <select class="fs" id="adm-rev-format">
              <option value="num">Numerisch (1, 2, 3 …)</option>
              <option value="letter">Buchstaben (A, B, C …)</option>
            </select>
          </div>
        </div>

        <div style="font-size:13px;color:var(--t3);margin-top:14px;font-family:var(--mono);line-height:2;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px" id="adm-preview"></div>

        <div style="margin-top:16px">
          <button class="btn btn-red" onclick="saveAdminSettings()">⚠ Admin-Einstellungen speichern</button>
        </div>
      </div>

    </div>`);

  // active tab styling
  document.querySelectorAll('.st-tab-btn').forEach(b => {
    b.addEventListener('mouseenter', () => { if (!b.classList.contains('active')) b.style.color = 'var(--t1)'; });
    b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.color = 'var(--t2)'; });
  });
  const styleActiveTabs = () => document.querySelectorAll('.st-tab-btn').forEach(b => {
    const isLoeschen = b.dataset.tab === 'loeschen';
    const activeColor = isLoeschen ? 'var(--red)' : 'var(--blue)';
    const inactiveColor = isLoeschen ? 'var(--red)' : 'var(--t2)';
    b.style.color = b.classList.contains('active') ? activeColor : inactiveColor;
    b.style.borderBottomColor = b.classList.contains('active') ? activeColor : 'transparent';
    b.style.fontWeight = b.classList.contains('active') ? '600' : '400';
  });
  styleActiveTabs();
  document.querySelectorAll('.st-tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      styleActiveTabs();
      if (b.dataset.tab === 'loeschen') _loadDelTab();
      if (b.dataset.tab === 'plm') _loadPlmTab();
    });
  });

  loadAndRenderPrinterConfig();
  api('/api/data-path').then(d => {
    document.getElementById('st-datapath-info').innerHTML =
      `DB: <code style="user-select:all">${d.db_path}</code><br>Dateien: <code style="user-select:all">${d.files_dir}</code>`
      + (d.config_file ? `<br><span style="color:var(--t4);font-size:12px">Konfigdatei: <code style="user-select:all">${d.config_file}</code></span>` : '');
    document.getElementById('st-data-dir').value = d.data_dir;
    if (!d.configured) _showFirstRunModal(d.data_dir);
  });
  api('/api/settings').then(s => {
    const el = document.getElementById('st-checkout-dir');
    if (el) el.value = s.checkout_dir || '';
    const ec = document.getElementById('st-cad-path');
    if (ec) ec.value = s.cad_path || '';
  });
}

async function saveCadPath() {
  const val = document.getElementById('st-cad-path')?.value.trim() || '';
  await api('/api/settings', 'PUT', { cad_path: val });
  const msg = document.getElementById('st-cad-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  state.settings = await api('/api/settings');
  const btn = document.getElementById('tb-cad-btn');
  if (btn) btn.style.display = val ? '' : 'none';
}

async function launchCad() {
  const path = state.settings?.cad_path;
  if (!path) { toast('Kein CAD-Pfad konfiguriert — bitte unter Einstellungen → System hinterlegen', 'err'); return; }
  try {
    await api('/api/launch-cad', 'POST');
    toast('CAD wird gestartet…', 'ok');
  } catch(e) { toast('CAD konnte nicht gestartet werden', 'err'); }
}

async function saveCheckoutDir() {
  const val = document.getElementById('st-checkout-dir')?.value.trim() || '';
  await api('/api/settings', 'PUT', { checkout_dir: val });
  const msg = document.getElementById('st-checkout-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  state.settings = await api('/api/settings');
}

async function saveSettings() {
  const keys = ['company_name','company_uid','company_street','company_postal_code','company_city',
    'company_country','company_phone','company_email','company_website',
    'bank_name','bank_iban','bank_bic',
    'default_tax_rate','quote_validity_days','default_payment_terms',
    'hourly_rate',
    'invoice_footer','quote_footer','receipt_footer','receipt_line_width','checkout_dir'];
  const checkboxKeys = ['receipt_show_datetime','receipt_show_customer','receipt_show_item_number','receipt_show_notes','label_show_qr'];
  const body = {};
  keys.forEach(k => {
    const el = document.getElementById('st-' + k);
    if (el) body[k] = el.value;
  });
  checkboxKeys.forEach(k => {
    const el = document.getElementById('st-' + k);
    if (el) body[k] = el.checked ? '1' : '0';
  });
  state.settings = await api('/api/settings','PUT',body);
  toast('Einstellungen gespeichert','ok');
}

function _showFirstRunModal(suggestedPath) {
  const id = 'first-run-modal';
  if (document.getElementById(id)) return;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:var(--r);padding:32px;max-width:520px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.4)">
      <div style="font-size:18px;font-weight:600;margin-bottom:8px">Willkommen bei PLM</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:20px">
        Bitte wähle, wo die Daten (Datenbank und Dateien) gespeichert werden sollen.
        Der Pfad wird dauerhaft in <code style="font-family:var(--mono);font-size:12px">~/.config/plm/config.json</code> gespeichert und kann später unter Einstellungen geändert werden.
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:13px;color:var(--t3);display:block;margin-bottom:4px">Datenverzeichnis</label>
        <input id="fr-data-dir" class="fi" style="width:100%;box-sizing:border-box" value="${esc(suggestedPath)}" placeholder="/absoluter/pfad/zum/datenverzeichnis">
      </div>
      <div id="fr-msg" style="font-size:13px;min-height:18px;margin-bottom:16px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('first-run-modal').remove()">Später</button>
        <button class="btn btn-primary" onclick="_saveFirstRunPath()">Speichern &amp; Server neu starten</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function _saveFirstRunPath() {
  const input = document.getElementById('fr-data-dir');
  const msg   = document.getElementById('fr-msg');
  if (!input?.value.trim()) return;
  try {
    const r = await api('/api/data-path', 'PUT', { data_dir: input.value.trim() });
    msg.textContent = r.message || 'Gespeichert';
    msg.style.color = 'var(--green)';
    setTimeout(() => document.getElementById('first-run-modal')?.remove(), 2500);
  } catch(e) {
    msg.textContent = 'Fehler beim Speichern';
    msg.style.color = 'var(--red)';
  }
}

async function saveDataPath() {
  const input = document.getElementById('st-data-dir');
  const msg   = document.getElementById('st-datapath-msg');
  if (!input || !input.value.trim()) return;
  try {
    const r = await api('/api/data-path', 'PUT', { data_dir: input.value.trim() });
    msg.textContent = r.message;
    msg.style.color = 'var(--green)';
  } catch(e) {
    msg.textContent = 'Fehler beim Speichern';
    msg.style.color = 'var(--red)';
  }
}

// ── PRINTER / NOZZLE / MATERIAL SETTINGS ──────────────────────
async function loadAndRenderPrinterConfig() {
  [state.printers, state.nozzles, state.materialPresets] = await Promise.all([
    api('/api/printers'), api('/api/nozzles'), api('/api/material-presets')
  ]);
  state._psConfigLoaded = true;
  _renderPrinterList(); _renderNozzleList(); _renderMatList();
  // populate nozzle select in material form
  const nzSel = document.getElementById('st-mat-nozzle');
  if (nzSel) nzSel.innerHTML = '<option value="">—</option>' +
    state.nozzles.map(n=>`<option value="${n.size}">${n.size} mm</option>`).join('');
}
function _renderPrinterList() {
  const el = document.getElementById('st-printers-list'); if (!el) return;
  el.innerHTML = state.printers.length ? state.printers.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);margin-bottom:4px">
      <span style="flex:1;font-weight:500">${esc(p.name)}</span>
      <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${p.cost_per_hour} CHF/h</span>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="editPrinter(${p.id},'${esc(p.name)}',${p.cost_per_hour})">✏️</button>
      <button class="btn btn-icon btn-red btn-sm" onclick="delPrinter(${p.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--t3);font-size:13px;padding:4px 0">Noch keine Drucker hinterlegt.</div>';
}
function _renderNozzleList() {
  const el = document.getElementById('st-nozzles-list'); if (!el) return;
  el.innerHTML = state.nozzles.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">` +
    state.nozzles.map(n => `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:13px">
      <span>${n.size} mm</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;width:14px;height:14px;font-size:13px" onclick="delNozzle(${n.id})">✕</button>
    </div>`).join('') + '</div>' : '<div style="color:var(--t3);font-size:13px;padding:4px 0">Noch keine Düsen hinterlegt.</div>';
}
function _renderMatList() {
  const el = document.getElementById('st-mats-list'); if (!el) return;
  el.innerHTML = state.materialPresets.length ? state.materialPresets.map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);margin-bottom:4px">
      <span style="font-weight:500;min-width:60px">${esc(m.name)}</span>
      <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${[m.print_temp&&m.print_temp+'°C',m.bed_temp&&'Bett '+m.bed_temp+'°C',m.nozzle&&m.nozzle+' mm',m.filament_price_kg&&m.filament_price_kg+' CHF/kg'].filter(Boolean).join(' · ')}</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="margin-left:auto" onclick="editMaterialPreset(${m.id})">✏️</button>
      <button class="btn btn-icon btn-red btn-sm" onclick="delMaterialPreset(${m.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--t3);font-size:13px;padding:4px 0">Noch keine Vorlagen hinterlegt.</div>';
}
async function addPrinter() {
  const name = document.getElementById('st-pr-name').value.trim();
  const cost = parseFloat(document.getElementById('st-pr-cost').value)||0;
  if (!name) return toast('Name fehlt','err');
  await api('/api/printers','POST',{name,cost_per_hour:cost});
  document.getElementById('st-pr-name').value = '';
  document.getElementById('st-pr-cost').value = '';
  await loadAndRenderPrinterConfig(); toast('Drucker gespeichert','ok');
}
async function editPrinter(id, name, cost) {
  const newName = prompt('Druckername:', name); if (!newName) return;
  const newCost = prompt('Kosten (CHF/h):', cost);
  await api(`/api/printers/${id}`,'PUT',{name:newName, cost_per_hour:parseFloat(newCost)||0});
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Gespeichert','ok');
}
async function delPrinter(id) {
  await api(`/api/printers/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Drucker gelöscht','ok');
}
async function addNozzle() {
  const size = document.getElementById('st-nz-size').value.trim();
  if (!size) return toast('Grösse fehlt','err');
  await api('/api/nozzles','POST',{size});
  document.getElementById('st-nz-size').value = '';
  await loadAndRenderPrinterConfig(); toast('Düse hinzugefügt','ok');
}
async function delNozzle(id) {
  await api(`/api/nozzles/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Düse gelöscht','ok');
}
function editMaterialPreset(id) {
  const m = state.materialPresets.find(x => x.id === id); if (!m) return;
  document.getElementById('st-mat-id').value = id;
  set('st-mat-name', m.name); set('st-mat-temp', m.print_temp||'');
  set('st-mat-bed', m.bed_temp||''); set('st-mat-price', m.filament_price_kg||'');
  set('st-mat-notes', m.notes||'');
  document.getElementById('st-mat-nozzle').value = m.nozzle||'';
  document.getElementById('st-mat-add-btn').textContent = '✓ Speichern';
}
async function addMaterialPreset() {
  const name = document.getElementById('st-mat-name').value.trim();
  if (!name) return toast('Name fehlt','err');
  const body = {
    name, print_temp: document.getElementById('st-mat-temp').value,
    bed_temp: document.getElementById('st-mat-bed').value,
    nozzle: document.getElementById('st-mat-nozzle').value,
    filament_price_kg: parseFloat(document.getElementById('st-mat-price').value)||null,
    notes: document.getElementById('st-mat-notes').value
  };
  const editId = document.getElementById('st-mat-id').value;
  if (editId) {
    await api(`/api/material-presets/${editId}`,'PUT',body);
    document.getElementById('st-mat-id').value = '';
    document.getElementById('st-mat-add-btn').textContent = '+ Vorlage hinzufügen';
  } else {
    await api('/api/material-presets','POST',body);
  }
  ['st-mat-name','st-mat-temp','st-mat-bed','st-mat-price','st-mat-notes'].forEach(f=>set(f,''));
  document.getElementById('st-mat-nozzle').value = '';
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Vorlage gespeichert','ok');
}
async function delMaterialPreset(id) {
  await api(`/api/material-presets/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Vorlage gelöscht','ok');
}

// ── FILE INDEX ────────────────────────────────────────────────
async function renderFileIndex() {
  setLeftHeader('Datei-Index', `<button class="btn btn-ghost btn-sm" onclick="exportFileIndex()">&#x1F4CB; Als CSV</button>`);
  closeDetail();
  const { datasets, documents } = await api('/api/file-index');

  const fmtSize = b => {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
  };

  const dsRows = datasets.map(f => `
    <tr>
      <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(f.project_number)}</td>
      <td style="font-size:13px">${esc(f.item_number||'—')}</td>
      <td style="font-size:13px;color:var(--t2)">${esc(f.revision||'')}</td>
      <td style="font-size:13px;font-weight:500">${esc(f.original_name)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${esc(f.filename)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3);text-align:right">${fmtSize(f.file_size)}</td>
      <td style="font-size:13px;color:var(--t3)">${(f.uploaded_at||'').slice(0,10)}</td>
    </tr>`).join('');

  const docRows = documents.map(f => `
    <tr>
      <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(f.project_number)}</td>
      <td style="font-size:13px;color:var(--t3)" colspan="2">Projektdokument</td>
      <td style="font-size:13px;font-weight:500">${esc(f.original_name)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${esc(f.filename)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3);text-align:right">${fmtSize(f.file_size)}</td>
      <td style="font-size:13px;color:var(--t3)">${(f.uploaded_at||'').slice(0,10)}</td>
    </tr>`).join('');

  const total = datasets.length + documents.length;
  const totalBytes = [...datasets,...documents].reduce((s,f) => s + (f.file_size||0), 0);

  setLeftBody(`<div style="padding:4px 0;max-width:1200px">
    <div style="font-size:13px;color:var(--t3);margin-bottom:16px;line-height:1.6">
      Alle gespeicherten Dateien mit ihrem <strong>angezeigten Namen</strong> und dem <strong>tatsächlichen Dateinamen</strong> auf der Festplatte.<br>
      Speicherort: <code style="font-family:var(--mono);background:var(--bg2);padding:1px 5px;border-radius:3px">data/files/</code>
      &nbsp;·&nbsp; ${total} Dateien &nbsp;·&nbsp; ${fmtSize(totalBytes)} gesamt
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:2px solid var(--line)">
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">Projekt</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">Artikel-Nr.</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Rev.</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Angezeigter Name</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Dateiname auf Festplatte</th>
          <th style="text-align:right;padding:6px 8px;color:var(--t3);font-weight:600">Grösse</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Datum</th>
        </tr>
      </thead>
      <tbody>
        ${dsRows}${docRows}
        ${!total ? '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Dateien vorhanden</td></tr>' : ''}
      </tbody>
    </table>
  </div>`);

  // Store for CSV export
  window._fileIndexData = { datasets, documents };
}

function exportFileIndex() {
  const { datasets, documents } = window._fileIndexData || { datasets:[], documents:[] };
  const rows = [
    ['Projekt','Artikel-Nr.','Revision','Angezeigter Name','Dateiname auf Festplatte','Typ','Grösse (Bytes)','Datum'],
    ...datasets.map(f => [f.project_number, f.item_number||'', f.revision||'', f.original_name, f.filename, f.ds_type||'', f.file_size||'', (f.uploaded_at||'').slice(0,10)]),
    ...documents.map(f => [f.project_number, '', '', f.original_name, f.filename, f.ds_type||'', f.file_size||'', (f.uploaded_at||'').slice(0,10)])
  ];
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'datei-index.csv';
  a.click();
}
