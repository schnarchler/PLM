// 04-settings.js — Einstellungen, Drucker/Düsen/Material, Datei-Index
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── SETTINGS ──────────────────────────────────────────────────
function _stTab(name) {
  document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.st-tab-pane').forEach(p => p.hidden = p.dataset.tab !== name);
}

function _fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}

// Schriftgrösse und Design — darf jede Person ändern
function _appearanceHtml(s) {
  return `
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Sprache der Benutzeroberfläche.')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px">
          ${Object.entries(LANGS).map(([code, name]) =>
            `<button class="btn btn-sm ${code === LANG ? 'btn-primary' : 'btn-ghost'}" onclick="setLang('${code}')">${name}</button>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Schriftgrösse der Benutzeroberfläche anpassen.')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['0.8',_t('Klein')],['0.9',_t('Mittel-klein')],['1',_t('Normal')],['1.1',_t('Mittel-gross')],['1.2',_t('Gross')],['1.35',_t('Sehr gross')]].map(([sc,l]) => {
            const active = (s.font_scale || '1') === sc ? ' btn-primary' : ' btn-ghost';
            return `<button class="btn btn-sm fs-preset-btn${active}" data-scale="${sc}" onclick="setFontScale('${sc}')">${l}</button>`;
          }).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3);margin:18px 0 10px">${_t('Farbdesign der Benutzeroberfläche.')}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[['',_t('Standard')],['angepasst',_t('Helleres Design')]].map(([th,l]) => {
            const active = (s.theme || '') === th ? ' btn-primary' : ' btn-ghost';
            return `<button class="btn btn-sm theme-preset-btn${active}" data-theme="${th}" onclick="setTheme('${th}')">${l}</button>`;
          }).join('')}
        </div>`;
}

// User und Superuser im Team: nur, was sie selbst ändern können. Firma,
// Kalkulation, Drucker, PLM-Vorgaben, Daten und Sicherungen verwaltet ein Admin.
function _renderPersonalSettings() {
  const u = state.session.user;
  setLeftHeader(_t('Einstellungen'), '');
  setLeftBody(`
    <div style="max-width:720px">
      <div class="st-notice">${_t('Gewählt ist {name} ({role}).', { name: esc(u?.name || _t('niemand')), role: esc(ROLE_LABEL[u?.role] || '—') })}
        ${_t('Firmen-, Druck-, PLM- und Dateneinstellungen verwaltet ein Admin.')}</div>
      <div class="sep-label" style="margin-top:0">${_t('Darstellung')}</div>
      ${_appearanceHtml(state.settings)}
      <div class="sep-label" style="margin-top:28px">${_t('Person')}</div>
      <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Arbeitet jemand anderes an diesem Gerät, hier oder oben über den Namen wechseln.')}</div>
      <button class="btn btn-ghost btn-sm" onclick="askWhoIsThere('switch')">${_t('Person wechseln')}</button>
      <div class="sep-label" style="margin-top:28px">${_t('PIN')}</div>
      <div style="font-size:13px;color:var(--t3);margin-bottom:10px;line-height:1.55">${u?.has_pin
        ? _t('Deine Kachel ist mit einer PIN geschützt. Wer zu dir wechseln will, muss sie eingeben.')
        : _t('Ohne PIN kann jede Person deine Kachel wählen und unter deinem Namen arbeiten. Mit einer PIN geht das nur, wenn man sie kennt.')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="openOwnPinModal()">${u?.has_pin ? _t('PIN ändern') : _t('PIN setzen')}</button>
        ${u?.has_pin ? '<button class="btn btn-ghost btn-sm" onclick="openOwnPinModal(true)">' + _t('PIN entfernen') + '</button>' : ''}
      </div>
    </div>`);
}

async function renderSettings() {
  closeDetail();
  if (!state.session) await loadSession();
  if (state.session?.mode === 'team' && !isAdmin()) return _renderPersonalSettings();
  setLeftHeader(_t('Einstellungen'), `<button class="btn btn-primary btn-sm" onclick="saveSettings()">${_t('💾 Speichern')}</button>`);
  const s = state.settings;
  const fi = (id, label, val, ph='', type='text') =>
    `<div class="fg"><label class="fl">${label}</label><input class="fi" id="st-${id}" type="${type}" value="${esc(val||'')}" placeholder="${ph}"></div>`;
  const ft = (id, label, val, ph='') =>
    `<div class="fg"><label class="fl">${label}</label><textarea class="ft" id="st-${id}" rows="2" placeholder="${ph}">${esc(val||'')}</textarea></div>`;
  const fck = (id, label, val) =>
    `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--t2)"><input type="checkbox" id="st-${id}" ${val !== '0' ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">${label}</label>`;

  const stor = await api('/api/storage').catch(() => null);
  const fmtBytes = _fmtBytes;
  const storHtml = stor ? `
    <div style="display:flex;gap:16px;align-items:center;background:var(--bg2);border:1px solid var(--line);border-radius:6px;padding:8px 14px;margin-bottom:18px;font-size:12px;color:var(--t3)">
      <span style="color:var(--t2);font-weight:600;font-size:13px">${_t('Speicher')}</span>
      <span>${_t('Datenbank:')} <strong style="color:var(--t1)">${fmtBytes(stor.db_bytes)}</strong></span>
      <span>${_t('Dateien:')} <strong style="color:var(--t1)">${fmtBytes(stor.files_bytes)}</strong></span>
      ${stor.trash_bytes ? `<span title="${_t('Gelöschte Dateien, die eine wiederhergestellte Sicherung noch braucht')}">${_t('Papierkorb:')} <strong style="color:var(--t1)">${fmtBytes(stor.trash_bytes)}</strong></span>` : ''}
      <span style="margin-left:auto">${_t('Gesamt:')} <strong style="color:var(--blue)">${fmtBytes(stor.total_bytes)}</strong></span>
    </div>` : '';

  setLeftBody(`
    <div style="max-width:720px">
      ${storHtml}
      <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:20px">
        <button class="st-tab-btn active" data-tab="firma"   onclick="_stTab('firma')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Firma')}</button>
        <button class="st-tab-btn"        data-tab="kalk"    onclick="_stTab('kalk')"    style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Kalkulation')}</button>
        <button class="st-tab-btn"        data-tab="bon"     onclick="_stTab('bon')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Kassabon')}</button>
        <button class="st-tab-btn"        data-tab="druck3d" onclick="_stTab('druck3d')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('3D-Druck')}</button>
        <button class="st-tab-btn"        data-tab="plm"     onclick="_stTab('plm')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">PLM</button>
        <button class="st-tab-btn"        data-tab="daten"   onclick="_stTab('daten')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Daten')}</button>
        <button class="st-tab-btn"        data-tab="benutzer" onclick="_stTab('benutzer')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Benutzer')}</button>
        <button class="st-tab-btn"        data-tab="loeschen" onclick="_stTab('loeschen')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--red);border-bottom:2px solid transparent;margin-bottom:-1px">Admin</button>
      </div>

      <!-- TAB: Benutzer -->
      <div class="st-tab-pane" data-tab="benutzer" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Wer arbeitet mit PLM?')}</div>
        <div id="st-users-box" style="font-size:13px;color:var(--t3)">${_t('Lädt…')}</div>
      </div>

      <!-- TAB: Firma -->
      <div class="st-tab-pane" data-tab="firma">
        <div class="sep-label" style="margin-top:0">${_t('Firma / Briefkopf')}</div>
        <div class="form-row cols2">
          ${fi('company_name',_t('Firmenname *'),s.company_name,_t('Muster GmbH'))}
          ${fi('company_uid',_t('UID / MwSt-Nr.'),s.company_uid,'CHE-123.456.789 MWST')}
        </div>
        <div class="form-row">${_logoBlock(s)}</div>
        <div class="form-row">
          ${fi('company_street',_t('Strasse + Hausnummer'),s.company_street,_t('Industriestrasse 42'))}
        </div>
        <div class="form-row cols3">
          ${fi('company_postal_code',_t('PLZ'),s.company_postal_code,'8000')}
          ${fi('company_city',_t('Ort'),s.company_city,_t('Zürich'))}
          ${fi('company_country',_t('Land'),s.company_country,_t('Schweiz'))}
        </div>
        <div class="form-row cols3">
          ${fi('company_phone',_t('Telefon'),s.company_phone,'+41 44 000 00 00')}
          ${fi('company_email','E-Mail',s.company_email,'info@firma.ch','email')}
          ${fi('company_website',_t('Website'),s.company_website,'www.firma.ch')}
        </div>
        <div class="sep-label">${_t('Bankangaben')}</div>
        <div class="form-row cols3">
          ${fi('bank_name',_t('Bank'),s.bank_name,'Zürcher Kantonalbank')}
          ${fi('bank_iban','IBAN',s.bank_iban,'CH00 0000 0000 0000 0000 0')}
          ${fi('bank_bic',_t('BIC / SWIFT'),s.bank_bic,'ZKBKCHZZ80A')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">${_t('💾 Speichern')}</button>
        </div>
      </div>

      <!-- TAB: Kalkulation -->
      <div class="st-tab-pane" data-tab="kalk" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Standardwerte')}</div>
        <div class="form-row cols3">
          ${fi('default_tax_rate',_t('Standard MwSt. (%)'),s.default_tax_rate,'','number')}
          ${fi('quote_validity_days',_t('Angebot gültig (Tage)'),s.quote_validity_days,'','number')}
          ${fi('default_payment_terms',_t('Zahlungsbedingungen'),s.default_payment_terms,_t('30 Tage netto'))}
        </div>
        <div class="form-row cols3">
          ${fi('hourly_rate',_t('Stundensatz (CHF/h)'),s.hourly_rate,'z.B. 120','number')}
        </div>
        <div class="sep-label">${_t('Sprache der Belege')}</div>
        <div class="form-row cols3">
          <div class="fg"><select class="fs" id="st-doc_lang">${Object.entries(LANGS).map(([code, name]) =>
            `<option value="${code}"${_docLang() === code ? ' selected' : ''}>${name}</option>`).join('')}</select></div>
        </div>
        <div style="font-size:12px;color:var(--t3);margin:-4px 0 12px;line-height:1.5">${_t('Gilt für Rechnung, Angebot, Lieferschein, Bestellung, Datenblatt, Stückliste, Prüfprotokoll, Etiketten und die Belege des Thermodruckers — unabhängig von der Sprache der Oberfläche. Fusszeilen und Zahlungsbedingungen stehen so auf den Belegen, wie sie hier eingetragen sind.')}</div>
        <div class="sep-label">${_t('Dokument-Fussnoten')}</div>
        <div class="form-row">
          ${ft('invoice_footer',_t('Fusszeile Rechnung'),s.invoice_footer,_t('Zahlungshinweis, Bankverbindung …'))}
        </div>
        <div class="form-row">
          ${ft('quote_footer',_t('Fusszeile Angebot'),s.quote_footer,_t('Hinweis Gültigkeit, Lieferbedingungen …'))}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">${_t('💾 Speichern')}</button>
        </div>
      </div>

      <!-- TAB: Kassabon -->
      <div class="st-tab-pane" data-tab="bon" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Fusszeile')}</div>
        <div class="form-row">
          ${ft('receipt_footer',_t('Fusszeile Kassabon'),s.receipt_footer,_t('z.B. Vielen Dank für Ihren Auftrag!'))}
        </div>
        <div class="sep-label">${_t('Bon-Aufbau')}</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px">
          <div class="form-row cols2" style="margin-bottom:8px">
            ${fi('receipt_line_width',_t('Zeilenbreite (Zeichen)'),s.receipt_line_width,'32','number')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${fck('receipt_show_datetime',_t('Datum &amp; Uhrzeit anzeigen'),s.receipt_show_datetime)}
            ${fck('receipt_show_customer',_t('Kundenname anzeigen'),s.receipt_show_customer)}
            ${fck('receipt_show_item_number',_t('Item-Nummer anzeigen'),s.receipt_show_item_number)}
            ${fck('receipt_show_notes',_t('Notizen anzeigen'),s.receipt_show_notes)}
          </div>
        </div>
        <div class="sep-label">${_t('Rohmaterial-Etikett')}</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${fck('label_show_qr',_t('QR-Code auf Etikett drucken'),s.label_show_qr ?? '1')}
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">${_t('💾 Speichern')}</button>
        </div>
      </div>

      <!-- TAB: 3D-Druck -->
      <div class="st-tab-pane" data-tab="druck3d" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Slicer')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px">${_t('Für „Im Slicer öffnen“ im Datenblatt und bei den Dateien einer Revision. Das Programm wird an den üblichen Installationsorten gesucht.')}</div>
        <div id="st-slicer-box" style="font-size:13px;color:var(--t3)">${_t('Sucht installierte Slicer…')}</div>

        <div class="sep-label" style="margin-top:20px">${_t('@heading:Drucker')}</div>
        <div id="st-printers-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input class="fi" id="st-pr-name" style="width:200px" placeholder="${_t('Druckername')}">
          <input class="fi" id="st-pr-cost" type="number" step="0.01" style="width:110px" placeholder="${_t('CHF/h (z.B. 1.50)')}">
          <button class="btn btn-ghost btn-sm" onclick="addPrinter()">${_t('+ Drucker hinzufügen')}</button>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('Düsen')}</div>
        <div id="st-nozzles-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="fi" id="st-nz-size" style="width:120px" placeholder="${_t('Grösse (z.B. 0.4)')}">
          <button class="btn btn-ghost btn-sm" onclick="addNozzle()">${_t('+ Düse hinzufügen')}</button>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('Material-Vorlagen')}</div>
        <div id="st-mats-list" style="margin-bottom:8px"></div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px;margin-top:4px">
          <div class="form-row cols3">
            <div class="fg"><label class="fl">${_t('Name *')}</label><input class="fi" id="st-mat-name" placeholder="${_t('z.B. PLA')}"></div>
            <div class="fg"><label class="fl">${_t('Düse')}</label>
              <select class="fs" id="st-mat-nozzle"><option value="">—</option></select>
            </div>
            <div class="fg"><label class="fl">${_t('Filamentpreis (CHF/kg)')}</label><input class="fi" id="st-mat-price" type="number" step="0.01" placeholder="22.00"></div>
          </div>
          <div class="form-row cols3">
            <div class="fg"><label class="fl">${_t('Düsentemperatur (°C)')}</label><input class="fi" id="st-mat-temp" placeholder="210"></div>
            <div class="fg"><label class="fl">${_t('Betttemperatur (°C)')}</label><input class="fi" id="st-mat-bed" placeholder="60"></div>
            <div class="fg"><label class="fl">${_t('Notizen')}</label><input class="fi" id="st-mat-notes" placeholder="${_t('optional')}"></div>
          </div>
          <input type="hidden" id="st-mat-id" value="">
          <button class="btn btn-ghost btn-sm" id="st-mat-add-btn" onclick="addMaterialPreset()">${_t('+ Vorlage hinzufügen')}</button>
        </div>
      </div>

      <!-- TAB: PLM -->
      <div class="st-tab-pane" data-tab="plm" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Klassifizierungen')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:12px;line-height:1.55">${_t('Verfügbare Klassifizierungen für Bauteile, Baugruppen und Dokumente. Reihenfolge per Drag &amp; Drop ändern. Ein umbenannter Eintrag wird beim Speichern an allen Items übernommen. In der Suche filtern die Chips nach diesen Einträgen.')}</div>
        <div id="st-class-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
        <div id="st-class-orphans" style="margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="st-class-new" placeholder="${_t('Neue Klassifizierung…')}" style="max-width:240px" onkeydown="if(event.key==='Enter')_addClass()">
          <button class="btn btn-ghost btn-sm" onclick="_addClass()">${_t('+ Hinzufügen')}</button>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="_saveClassifications()">${_t('Speichern')}</button>
          <span id="st-class-msg" style="font-size:13px;color:var(--t3);margin-left:8px"></span>
        </div>

        <div class="sep-label" style="margin-top:28px">${_t('Standard-Klassifizierung')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">
          ${_t('Neue Teile bekommen die Klassifizierung automatisch — abhängig davon, ob eine Quelle bzw. ein Download-Link hinterlegt ist. „—“ lässt das Feld leer.')}
        </div>
        <div class="form-row cols2">
          <div class="fg">
            <label class="fl">${_t('Ohne Quelle (Eigenteil)')}</label>
            <select class="fs" id="st-class-own"></select>
          </div>
          <div class="fg">
            <label class="fl">${_t('Mit Quelle (Kaufteil)')}</label>
            <select class="fs" id="st-class-bought"></select>
          </div>
        </div>

        <div class="sep-label" style="margin-top:28px">${_t('Freigabe-Workflow')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">
          ${_t('Bestimmt, welche Schritte eine Revision durchläuft.')}
        </div>
        <div id="st-wf-options" style="display:flex;flex-direction:column;gap:6px;max-width:560px"></div>
        <label style="display:flex;align-items:baseline;gap:7px;cursor:pointer;font-size:13px;color:var(--t2);margin-top:12px">
          <input type="checkbox" id="st-four-eyes" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue);position:relative;top:2px">
          <span>${_t('Vier-Augen-Prinzip: Freigabe durch eine zweite Person')}</span></label>
        <div id="st-four-eyes-hint" style="font-size:12.5px;color:var(--t3);margin:3px 0 0 22px;max-width:540px;line-height:1.5"></div>

        <div class="sep-label" style="margin-top:28px">${_t('Prüfung vor der Freigabe')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px;line-height:1.55">
          ${_t('Was eine Revision mitbringen muss, bevor sie freigegeben werden kann. Fehlt etwas, nennt PLM es im Datenblatt und sperrt „Freigeben“. Dazu kommen die als Pflicht markierten Eigenschaften der Klassifizierung. Gilt nur mit Freigabe-Workflow. Standard: eine Datei und das Gewicht.')}
        </div>
        <div id="st-release-checks" style="display:flex;flex-direction:column;gap:7px"></div>

        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="_savePlmPrefs()">${_t('Speichern')}</button>
          <span id="st-plmprefs-msg" style="font-size:13px;color:var(--t3);margin-left:8px"></span>
        </div>

        <div class="sep-label" style="margin-top:28px">${_t('Prüfprotokoll')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px;line-height:1.55">
          ${_t('Vorlage für „Dokument erstellen → Prüfprotokoll“. Die Prüfpunkte erscheinen in dieser Reihenfolge, ein Soll-Wert wird ins Protokoll vorgedruckt. „Vorschau“ zeigt die Vorlage, wie sie gerade hier steht.')}
        </div>
        <div id="st-pruef-box"></div>
      </div>

      <!-- TAB: Daten -->
      <div class="st-tab-pane" data-tab="daten" hidden>
        <div class="sep-label" style="margin-top:0">${_t('Darstellung')}</div>
        ${_appearanceHtml(s)}

        <div style="font-size:13px;color:var(--t3);margin:18px 0 8px">
          ${_t('Setzt die Farben der Klassifizierungen auf die Standardwerte der aktuellen Palette zurück. Nötig für Datenbanken, die noch die Farben der alten Palette gespeichert haben. Namen, Reihenfolge und Schriftgrösse bleiben erhalten.')}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="resetDesignColors()">${_t('Design zurücksetzen')}</button>
          <span id="st-design-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:24px">${_t('Datenpfad')}</div>
        <div id="st-datapath-info" style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Lädt aktuelle Pfade…')}</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">${_t('Datenverzeichnis (Datenbank + Dateien)')}</label>
            <input class="fi" id="st-data-dir" placeholder="${_t('/absoluter/pfad/zum/datenverzeichnis')}">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveDataPath()">${_t('Pfad speichern')}</button>
          <span id="st-datapath-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>
        <div style="font-size:11px;color:var(--t4);margin-top:6px">
          ${_t('Achtung: „Pfad speichern“ ändert nur, wo PLM beim nächsten Start sucht — vorhandene Daten bleiben am alten Ort. Zum Umziehen der bestehenden Daten den Bereich „Daten verschieben“ verwenden.')}
        </div>

        <div class="sep-label" style="margin-top:24px">${_t('Daten verschieben')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">
          ${_t('Kopiert das komplette Datenverzeichnis (Datenbank, alle Dateien, Sicherungen, Papierkorb) an einen neuen Ort, prüft die Kopie und schaltet PLM sofort darauf um — ein Neustart ist nicht nötig. Erst nach erfolgreicher Prüfung wird der alte Ordner gelöscht.')}
        </div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">${_t('Neues Datenverzeichnis (leerer oder neuer Ordner)')}</label>
            <input class="fi" id="st-move-dir" placeholder="${_t('/absoluter/pfad/zum/neuen/ordner')}">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--t2);margin-top:4px">
          <input type="checkbox" id="st-move-keep" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
          ${_t('Daten am alten Ort behalten (kopieren statt verschieben)')}
        </label>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <button class="btn btn-ghost btn-sm" id="st-move-btn" onclick="moveDataDir()">${_t('&#x1F4E6; Daten verschieben')}</button>
          <span id="st-move-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>
        <div id="st-move-progress" style="display:none;margin-top:10px;max-width:420px">
          <div style="height:6px;background:var(--bg2);border:1px solid var(--line);border-radius:4px;overflow:hidden">
            <div id="st-move-bar" style="height:100%;width:0;background:var(--blue);transition:width .3s"></div>
          </div>
          <div id="st-move-detail" style="font-size:12px;color:var(--t4);margin-top:5px"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('CAD-Programm')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px">${_t('Wird über den CAD-Knopf oben gestartet.')}</div>
        <div id="st-cad-box" style="font-size:13px;color:var(--t3)">${_t('Prüft das CAD-Programm…')}</div>

        <div class="sep-label" style="margin-top:20px">${_t('Checkout-Verzeichnis')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px;line-height:1.55">${_t('Ordner, in den ausgecheckte CAD-Dateien kopiert werden. Gilt nur für diesen PC (steht in {file}) — liegen die Daten auf einem Netzlaufwerk, hat jeder PC seinen eigenen lokalen Ordner. Leer lassen für Standard: {default}', { file: '<code style="font-family:var(--mono)">plm.config</code>', default: `<code style="font-family:var(--mono)">${_t('[Datenverzeichnis]/checkout')}</code>` })}</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">${_t('Checkout-Pfad')}</label>
            <input class="fi" id="st-checkout-dir" placeholder="${_t('wird geladen…')}" disabled>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" id="st-checkout-save" onclick="saveCheckoutDir()" disabled>${_t('Pfad speichern')}</button>
          <span id="st-checkout-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>
        <div id="st-checkout-note" style="font-size:12px;color:var(--t4);margin-top:6px;line-height:1.5"></div>

        <div class="sep-label" style="margin-top:24px">${_t('Datensicherung')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px;line-height:1.55">
          ${_t('PLM sichert die Datenbank bei jedem Start einmal pro Tag und behält die letzten 14 Tage. Gelöschte Dateien bleiben 30 Tage im Papierkorb, damit eine wiederhergestellte Sicherung sie wiederfindet. Vor jedem Wiederherstellen wird der jetzige Stand automatisch gesichert.')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn btn-ghost" onclick="createBackupNow()">${_t('💾 Jetzt sichern')}</button>
          <label class="btn btn-ghost" style="cursor:pointer" title="${_t('Eine Sicherung (.db) oder einen Gesamtexport (.zip) wiederherstellen')}">
            ${_t('⬆ Aus Datei wiederherstellen…')}
            <input type="file" accept=".db,.zip" style="display:none" onchange="restoreBackupFromFile(this)">
          </label>
          <span id="st-backup-msg" style="font-size:13px;color:var(--t3)"></span>
        </div>
        <div id="st-backup-list" style="margin-top:10px;font-size:13px;color:var(--t3)">${_t('Lädt Sicherungen…')}</div>

        <div class="sep-label" style="margin-top:24px">${_t('Export')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Lädt alle PLM-Daten als ZIP-Archiv herunter. Der Gesamtexport lässt sich oben über „Aus Datei wiederherstellen" komplett zurückspielen, inklusive Dateien.')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-ghost" href="/api/export" download>${_t('&#x1F4E6; Gesamtexport (Rohdaten)')}</a>
          <a class="btn btn-ghost" href="/api/export-named" download title="${_t('Dateien werden wie beim Checkout mit korrekten Namen und Ordnerstruktur exportiert')}">${_t('&#x1F4C1; Export mit Klarnamen')}</a>
        </div>
        <div style="font-size:11px;color:var(--t4);margin-top:6px">
          ${_t('Klarnamen-Export: Dateien werden nach Projekt/Item/Revision sortiert und mit Original-Dateinamen abgelegt — wie beim Checkout.')}
        </div>

        <div class="sep-label" style="margin-top:24px">${_t('Datei-Index')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Übersicht aller gespeicherten Dateien mit angezeigtem Namen und tatsächlichem Dateinamen auf der Festplatte (Notfall-Referenz).')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="gotoView('fileindex')">${_t('&#x1F4C2; Datei-Index öffnen')}</button>
        </div>
      </div>

      <!-- TAB: Admin -->
      <div class="st-tab-pane" data-tab="loeschen" hidden>
        <div style="background:var(--red-soft);border:1px solid var(--red-line);border-radius:var(--r);padding:10px 14px;margin-bottom:20px;font-size:13px;color:var(--red)">
          ${_t('⚠ Änderungen hier können bestehende Daten und Nummernkreise dauerhaft beschädigen. Nur vornehmen wenn du weisst was du tust.')}
        </div>

        <div class="sep-label" style="margin-top:0;color:var(--red)">${_t('Datensätze löschen')}</div>
        <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:14px">
          <button class="adm-del-tab active" data-deltab="teile"    onclick="_admDelTab('teile')"    style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--red);border-bottom:2px solid var(--red);margin-bottom:-1px;font-weight:600">Items</button>
          <button class="adm-del-tab"        data-deltab="projekte" onclick="_admDelTab('projekte')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Projekte')}</button>
          <button class="adm-del-tab"        data-deltab="auftraege"  onclick="_admDelTab('auftraege')"  style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Aufträge')}</button>
          <button class="adm-del-tab"        data-deltab="produktion" onclick="_admDelTab('produktion')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:13px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">${_t('Produktion')}</button>
        </div>
        <div id="adm-del-teile">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">${_t('Freigegebene (REL/OBS/ECO) oder gelieferte Items — Bauteile, Baugruppen und Dokumente')}</div>
          <div id="st-del-items" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-projekte" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">${_t('Projekte mit Inhalten (Items, Dateien)')}</div>
          <div id="st-del-projects" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-auftraege" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">${_t('Aufträge (nicht Entwurf)')}</div>
          <div id="st-del-orders" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-produktion" style="display:none">
          <div style="font-size:13px;color:var(--t3);margin-bottom:6px">${_t('Produktionsaufträge (nicht Entwurf)')}</div>
          <div id="st-del-deliveries" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div class="sep-label" style="margin-top:28px">${_t('Nummernpräfixe')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:12px">${_t('Präfixe für neu angelegte Datensätze. Bestehende Nummern werden <b>nicht</b> geändert.')}</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">${_t('Aufträge')}</label><input class="fi" id="adm-prefix-order" placeholder="AUF"></div>
          <div class="fg"><label class="fl">${_t('Produktion')}</label><input class="fi" id="adm-prefix-delivery" placeholder="LS"></div>
          <div class="fg"><label class="fl">${_t('Kunden')}</label><input class="fi" id="adm-prefix-customer" placeholder="KD"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('Stellen Geschäftsnummern')}</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">${_t('Aufträge')}</label><input class="fi" id="adm-pad-order" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Produktion')}</label><input class="fi" id="adm-pad-delivery" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Kunden')}</label><input class="fi" id="adm-pad-customer" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Projekte')}</label><input class="fi" id="adm-pad-project" type="number" min="1" max="8" placeholder="3"></div>
          <div class="fg" style="display:flex;align-items:center;gap:10px;padding-top:20px">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--t2)">
              <input type="checkbox" id="adm-num-yearly" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
              ${_t('Jahreszahl in Nummer')}
            </label>
          </div>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('Struktur Item-Nummern')}</div>
        <div style="font-size:13px;color:var(--t3);margin-bottom:10px">${_t('Gilt nur für <b>neu angelegte</b> Items. Bestehende Nummern werden nicht geändert.')}</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">${_t('Trennzeichen')}</label><input class="fi" id="adm-num-sep" placeholder="-" maxlength="3"></div>
          <div class="fg"><label class="fl">${_t('Stellen Baugruppe')}</label><input class="fi" id="adm-pad-asm" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Stellen Part')}</label><input class="fi" id="adm-pad-prt" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Stellen Dokument')}</label><input class="fi" id="adm-pad-doc" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">${_t('Baugruppen-Kürzel')}</label><input class="fi" id="adm-seg-asm" placeholder="asm" maxlength="10"></div>
          <div class="fg"><label class="fl">${_t('Part-Kürzel')}</label><input class="fi" id="adm-seg-prt" placeholder="prt" maxlength="10"></div>
          <div class="fg"><label class="fl">${_t('Dokument-Kürzel')}</label><input class="fi" id="adm-seg-doc" placeholder="doc" maxlength="10"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">${_t('Revisionen')}</div>
        <div class="form-row">
          <div class="fg"><label class="fl">${_t('Format')}</label>
            <select class="fs" id="adm-rev-format">
              <option value="num">${_t('Numerisch (1, 2, 3 …)')}</option>
              <option value="letter">${_t('Buchstaben (A, B, C …)')}</option>
            </select>
          </div>
        </div>

        <div style="font-size:13px;color:var(--t3);margin-top:14px;font-family:var(--mono);line-height:2;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px" id="adm-preview"></div>

        <div style="margin-top:16px">
          <button class="btn btn-red" onclick="saveAdminSettings()">${_t('⚠ Admin-Einstellungen speichern')}</button>
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
      if (b.dataset.tab === 'benutzer') _renderUsersSettings();
      // Prüfprotokoll nicht in _loadPlmTab: das läuft auch nach dem Speichern
      // der Klassifizierungen und würfe ungespeicherte Änderungen hier weg
      if (b.dataset.tab === 'plm') { _loadPlmTab(); _renderPruefSettings(); }
      if (b.dataset.tab === 'daten') loadBackupList();
    });
  });

  loadAndRenderPrinterConfig();
  _renderSlicerSettings();
  _renderCadSettings();
  api('/api/data-path').then(d => {
    document.getElementById('st-datapath-info').innerHTML =
      `DB: <code style="user-select:all">${d.db_path}</code><br>${_t('Dateien:')} <code style="user-select:all">${d.files_dir}</code>`
      + (d.config_file ? `<br><span style="color:var(--t4);font-size:12px">${_t('Konfigdatei:')} <code style="user-select:all">${d.config_file}</code></span>` : '');
    document.getElementById('st-data-dir').value = d.data_dir;
    if (!d.configured) _showFirstRunModal(d.data_dir, d.config_file);
  });
  _loadCheckoutDir();
}

// Checkout-Verzeichnis: steht in plm.config, gilt also nur für diesen PC.
// Feld und Knopf erst nach dem Laden freigeben: sonst speichert ein früher
// Klick (oder einer nach einem Ladefehler) einen leeren Pfad, und PLM sucht
// die Checkouts plötzlich im Standardordner. Ändern nur am PC selbst.
function _loadCheckoutDir() {
  return api('/api/checkout-dir').then(c => {
    const el = document.getElementById('st-checkout-dir');
    if (!el) return;
    el.value = c.dir;
    el.dataset.loaded = c.dir;
    el.placeholder = c.default;
    el.disabled = !c.local;
    const btn = document.getElementById('st-checkout-save');
    if (btn) btn.disabled = !c.local;
    const note = document.getElementById('st-checkout-note');
    if (note) note.innerHTML = [
      c.legacy_path ? `<span style="color:var(--amber)">${_t('Früher für alle PCs eingetragen: {path} — auf diesem PC nicht vorhanden.', { path: `<code style="font-family:var(--mono)">${esc(c.legacy_path)}</code>` })}</span>` : '',
      c.local ? '' : _t('Ändern geht nur am PC, auf dem das PLM läuft.'),
    ].filter(Boolean).join('<br>');
  }).catch(() => {});
}

// ── SICHERUNGEN ───────────────────────────────────────────────
// Liste aus backups/ im Datenverzeichnis. Wiederherstellen tauscht die
// Datenbank im laufenden Betrieb; danach lädt die Oberfläche neu, damit nichts
// Veraltetes stehen bleibt.
const BACKUP_KIND_LABEL = { auto: _t('täglich'), manuell: _t('von Hand'), 'vor-wiederherstellung': _t('vor Wiederherstellung'),
  'nicht-gespeichert': _t('nicht gespeichert'), sonstige: _t('Datei') };
const BACKUP_STAT_LABEL = [['projects', _t('Projekte')], ['items', 'Items'], ['revisions', _t('Revisionen')], ['datasets', _t('Dateien')],
  ['orders', _t('Aufträge')], ['deliveries', _t('Produktionsaufträge')], ['customers', _t('Kunden')]];
let _backupData = null;

async function loadBackupList() {
  const el = document.getElementById('st-backup-list');
  if (!el) return;
  try { _backupData = await api('/api/backups'); }
  catch { el.innerHTML = '<span style="color:var(--red)">' + _t('Sicherungen konnten nicht geladen werden.') + '</span>'; return; }
  const list = _backupData.backups || [];
  if (!list.length) { el.innerHTML = _t('Noch keine Sicherungen vorhanden.'); return; }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:5px">${list.map((b, i) => {
    const ok = b.stats?.ok;
    const facts = ok ? [['projects', _t('Projekt'), _t('Projekte')], ['items', 'Item', 'Items'], ['orders', _t('Auftrag'), _t('Aufträge')]]
      .filter(([k]) => b.stats[k] != null).map(([k, one, many]) => `${b.stats[k]} ${b.stats[k] === 1 ? one : many}`).join(' · ') : '';
    return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
      <span class="chip" style="flex-shrink:0">${esc(BACKUP_KIND_LABEL[b.kind] || b.kind)}</span>
      <div style="flex:1;min-width:200px">
        <div style="font-family:var(--mono);font-size:12.5px;color:var(--t1)">${esc(b.name)}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:1px">${fmtDate(b.modified_at)} · ${_fmtBytes(b.size)}${facts ? ' · ' + facts : ''}${ok ? '' : ' · <span style="color:var(--red)">' + _t('beschädigt') + '</span>'}</div>
      </div>
      ${ok ? `<button class="btn btn-ghost btn-sm" onclick="confirmRestoreBackup(${i})">${_t('Wiederherstellen')}</button>` : ''}
      <button class="btn btn-ghost btn-icon btn-sm" title="${_t('Sicherung löschen')}" onclick="deleteBackup(${i})">✕</button>
    </div>`;
  }).join('')}</div>`;
}

async function createBackupNow() {
  const msg = document.getElementById('st-backup-msg');
  try {
    const r = await api('/api/backups', 'POST');
    if (msg) { msg.textContent = _t('Gesichert als {name}', { name: r.name }); msg.style.color = 'var(--green)'; }
    toast(_t('Sicherung erstellt'), 'ok');
    loadBackupList();
  } catch {}
}

async function deleteBackup(i) {
  const b = _backupData?.backups?.[i];
  if (!b || !confirm(_t('Sicherung {name} löschen?', { name: b.name }))) return;
  try { await api(`/api/backups/${encodeURIComponent(b.name)}`, 'DELETE'); toast(_t('Sicherung gelöscht'), 'ok'); }
  catch {}
  loadBackupList();
}

// Vorher zeigen, was sich ändert: Kennzahlen jetzt gegen Sicherung
function confirmRestoreBackup(i) {
  const b = _backupData?.backups?.[i];
  if (!b) return;
  const cur = _backupData.current || {};
  const rows = BACKUP_STAT_LABEL.filter(([k]) => b.stats[k] != null || cur[k] != null).map(([k, l]) => {
    const diff = (b.stats[k] ?? 0) - (cur[k] ?? 0);
    return `<tr><td>${l}</td><td style="text-align:right;font-family:var(--mono)">${cur[k] ?? '—'}</td>
      <td style="text-align:right;font-family:var(--mono)">${b.stats[k] ?? '—'}</td>
      <td style="text-align:right;font-family:var(--mono);color:${diff < 0 ? 'var(--red)' : diff > 0 ? 'var(--green)' : 'var(--t4)'}">${diff > 0 ? '+' : ''}${diff || '±0'}</td></tr>`;
  }).join('');
  _showDynModal(`<div class="modal" style="max-width:520px">
    <div class="modal-head"><div class="modal-title">${_t('Sicherung wiederherstellen')}</div></div>
    <div class="modal-body" style="font-size:13px;color:var(--t2)">
      <div style="font-family:var(--mono);color:var(--t1)">${esc(b.name)}</div>
      <div style="color:var(--t3);margin:2px 0 12px">${_t('gesichert {date}', { date: fmtDate(b.modified_at) })}${b.stats.last_change ? ' · ' + _t('letzte Änderung darin {date}', { date: fmtDate(b.stats.last_change) }) : ''}</div>
      <div class="tbl-wrap"><table>
        <thead><tr><th></th><th style="text-align:right">${_t('Jetzt')}</th><th style="text-align:right">${_t('Sicherung')}</th><th style="text-align:right">${_t('Differenz')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div style="margin-top:12px;line-height:1.55;color:var(--t3)">
        ${_t('Alles, was seit dieser Sicherung erfasst wurde, ist danach nicht mehr in PLM. Der jetzige Stand wird vorher als „vor Wiederherstellung" gesichert — du kannst also zurück. Gelöschte Dateien holt PLM aus dem Papierkorb zurück, neuere Dateien bleiben im Dateiordner liegen.')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
      <button class="btn btn-amber" onclick="_doRestoreBackup(${i})">${_t('Wiederherstellen')}</button>
    </div>
  </div>`);
}

async function _doRestoreBackup(i) {
  const b = _backupData?.backups?.[i];
  _hideDynModal();
  if (!b) return;
  try { _showRestoreResult(await api(`/api/backups/${encodeURIComponent(b.name)}/restore`, 'POST')); }
  catch {}
}

async function restoreBackupFromFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!confirm(_t('„{name}" wiederherstellen?', { name: file.name }) + '\n\n' + _t('Alles, was danach erfasst wurde, ist anschliessend nicht mehr in PLM. Der jetzige Stand wird vorher gesichert.'))) return;
  const msg = document.getElementById('st-backup-msg');
  if (msg) { msg.textContent = _t('Wird wiederhergestellt…'); msg.style.color = 'var(--t3)'; }
  const fd = new FormData();
  fd.append('file', file);
  let body;
  try { body = await apiForm('/api/backups/restore-upload', fd); }
  catch { if (msg) msg.textContent = ''; return; }   // apiForm meldet den Fehler
  _showRestoreResult(body);
}

function _showRestoreResult(r) {
  const f = r.files || {};
  _showDynModal(`<div class="modal" style="max-width:480px">
    <div class="modal-head"><div class="modal-title" style="color:var(--green)">${_t('✓ Sicherung wiederhergestellt')}</div></div>
    <div class="modal-body" style="font-size:13px;color:var(--t2);line-height:1.6">
      <div>${_t('{name} ist jetzt der aktuelle Stand.', { name: `<span style="font-family:var(--mono)">${esc(r.source)}</span>` })}</div>
      <div style="color:var(--t3)">${_t('Der vorherige Stand liegt als {name} in der Liste.', { name: `<span style="font-family:var(--mono)">${esc(r.safety_backup)}</span>` })}</div>
      ${f.extracted ? `<div style="margin-top:8px">${_t('{n} Datei(en) aus dem ZIP ergänzt.', { n: f.extracted })}</div>` : ''}
      ${f.restored_from_trash ? `<div style="margin-top:8px">${_t('{n} gelöschte Datei(en) aus dem Papierkorb zurückgeholt.', { n: f.restored_from_trash })}</div>` : ''}
      ${f.missing ? `<div style="margin-top:8px;color:var(--amber)">⚠ ${_t('{n} Datei(en) fehlen im Dateiordner und im Papierkorb:', { n: f.missing })}
          <div style="font-family:var(--mono);font-size:12px;color:var(--t3);margin-top:4px">${(f.missing_names || []).map(esc).join('<br>')}${f.missing > (f.missing_names || []).length ? '<br>…' : ''}</div></div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" onclick="location.reload()">${_t('Neu laden')}</button>
    </div>
  </div>`);
}

// ── SLICER ────────────────────────────────────────────────────
// Gewählt wird nur der Slicer, nicht der Pfad: Die Einstellungen sind ohne
// Anmeldung im Netz erreichbar — ein Programmpfad gehört in plm.config.
async function _renderSlicerSettings() {
  const box = document.getElementById('st-slicer-box');
  if (!box) return;
  await loadSlicerStatus();
  const st = state.slicer;
  if (!st) { box.textContent = _t('Slicer-Status konnte nicht geladen werden.'); return; }
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
      ${st.slicers.map(s => `<label style="display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--t2)">
        <input type="radio" name="st-slicer" value="${s.id}" ${st.active === s.id ? 'checked' : ''}
          onchange="saveSlicerChoice(this.value)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
        <span style="min-width:110px">${esc(s.name)}</span>
        ${s.found
          ? `<span class="chip" style="color:var(--green)">installiert</span>
             <span style="font-size:12px;color:var(--t4);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${esc(s.where)}">${esc(s.where)}</span>`
          : `<span class="chip">${_t('nicht gefunden')}</span>${s.error ? `<span style="font-size:12px;color:var(--amber)">${esc(s.error)}</span>` : ''}`}
      </label>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <button class="btn btn-ghost btn-sm" onclick="_renderSlicerSettings()">${_t('↻ Neu suchen')}</button>
      <span id="st-slicer-msg" style="font-size:13px"></span>
    </div>
    <div style="font-size:11px;color:var(--t4);margin-top:6px;line-height:1.5">
      ${_t('Woanders installiert? In der Konfigdatei {file} {a}, {b} bzw. {c} eintragen und neu suchen. Arbeitskopien landen im Unterordner {dir} des Checkout-Verzeichnisses.', {
        file: '<code style="font-family:var(--mono)">plm.config</code>', a: `<code style="font-family:var(--mono)">prusaslicer=${_t('/pfad/zum/programm')}</code>`,
        b: '<code style="font-family:var(--mono)">bambustudio=…</code>', c: '<code style="font-family:var(--mono)">crealityprint=…</code>',
        dir: '<code style="font-family:var(--mono)">Slicer</code>' })}
    </div>`;
}

async function saveSlicerChoice(id) {
  await api('/api/settings', 'PUT', { slicer: id });
  state.settings = await api('/api/settings');
  await _renderSlicerSettings();
  const msg = document.getElementById('st-slicer-msg');
  if (msg) { msg.textContent = _t('Gespeichert'); msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

// CAD-Programm: wie beim Slicer nur der Status — der Pfad steht in plm.config
async function _renderCadSettings() {
  const box = document.getElementById('st-cad-box');
  if (!box) return;
  await loadCadStatus();
  const c = state.cad;
  if (!c) { box.textContent = _t('Status konnte nicht geladen werden.'); return; }
  const code = t => `<code style="font-family:var(--mono)">${esc(t)}</code>`;
  const chip = !c.configured ? '<span class="chip">' + _t('nicht eingetragen') + '</span>'
    : c.found ? '<span class="chip" style="color:var(--green)">gefunden</span>'
    : '<span class="chip" style="color:var(--amber)">' + _t('nicht gefunden') + '</span>';
  box.innerHTML = `<div style="display:flex;align-items:center;gap:8px;min-width:0">
      ${chip}
      ${c.where ? `<span style="font-size:12px;color:var(--t4);font-family:var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${esc(c.where)}">${esc(c.where)}</span>` : ''}
      <button class="btn btn-ghost btn-sm" style="margin-left:auto;flex-shrink:0" onclick="_renderCadSettings()">${_t('↻ Neu prüfen')}</button>
    </div>
    ${c.legacy_path ? `<div style="font-size:12px;color:var(--amber);margin-top:6px">${_t('Früher eingetragen: {path} — auf diesem PC nicht vorhanden.', { path: code(c.legacy_path) })}</div>` : ''}
    <div style="font-size:11px;color:var(--t4);margin-top:6px;line-height:1.5">
      ${_t('In der Konfigdatei {file} als {key} eintragen, dann neu prüfen.', { file: code('plm.config'), key: code('cad_path=' + _t('/pfad/zum/programm')) })}
      ${_t('Nicht hier in der Oberfläche, weil die Einstellungen ohne Anmeldung im ganzen Netz erreichbar sind.')}
    </div>`;
}

async function launchCad() {
  try {
    await api('/api/launch-cad', 'POST');
    toast(_t('CAD wird gestartet…'), 'ok');
  } catch { /* api() meldet den Fehler */ }
}

async function saveCheckoutDir() {
  const el = document.getElementById('st-checkout-dir');
  if (!el || el.dataset.loaded === undefined) return;   // noch nicht geladen
  const val = el.value.trim();
  // Laufende Checkouts bleiben im alten Ordner liegen — PLM sähe sie nicht mehr
  const changed = val !== (el.dataset.loaded || '').trim();
  if (changed) await loadCheckouts();
  if (changed && state.checkouts.length && !confirm(_t('{n} Checkout(s) liegen im bisherigen Verzeichnis.', { n: state.checkouts.length }) + '\n\n'
    + _t('Nach dem Wechsel zeigt PLM sie nicht mehr an, bis der alte Pfad wieder eingestellt ist. Trotzdem wechseln?'))) return;
  await api('/api/checkout-dir', 'PUT', { dir: val });
  _loadCheckoutDir();
  loadCheckouts();
  const msg = document.getElementById('st-checkout-msg');
  if (msg) { msg.textContent = _t('Gespeichert'); msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

// Firmenlogo für Angebote, Rechnungen und Lieferscheine. Wird sofort
// gespeichert; neu gezeichnet wird nur dieser Block, damit noch nicht
// gespeicherte Eingaben in den übrigen Feldern bleiben.
function _logoBlock(s) {
  const has = !!s.company_logo_at;
  return `<div class="fg" id="st-logo"><label class="fl">${_t('Logo auf Angeboten, Rechnungen und Lieferscheinen')}</label>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      ${has ? `<img src="/api/settings/logo?v=${esc(s.company_logo_at)}" alt="Logo" style="max-height:48px;max-width:200px;background:#fff;padding:4px;border-radius:var(--r-sm)">`
            : `<span style="font-size:13px;color:var(--t3)">${_t('Kein Logo — die Belege zeigen den Firmennamen wie bisher')}</span>`}
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">${has ? _t('Anderes Logo…') : _t('Logo hochladen…')}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none" onchange="uploadCompanyLogo(this.files[0])"></label>
      ${has ? `<button class="btn btn-ghost btn-sm" onclick="removeCompanyLogo()">${_t('Entfernen')}</button>` : ''}
    </div>
  </div>`;
}
function _refreshLogoBlock() {
  const el = document.getElementById('st-logo');
  if (el) el.outerHTML = _logoBlock(state.settings);
}
async function uploadCompanyLogo(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try { state.settings = await apiForm('/api/settings/logo', fd); } catch { return; }
  _refreshLogoBlock();
  toast(_t('Logo gespeichert'), 'ok');
}
async function removeCompanyLogo() {
  if (!confirm(_t('Logo entfernen? Die Belege zeigen dann wieder den Firmennamen.'))) return;
  state.settings = await api('/api/settings/logo', 'DELETE');
  _refreshLogoBlock();
  toast(_t('Logo entfernt'), 'ok');
}

async function saveSettings() {
  const keys = ['company_name','company_uid','company_street','company_postal_code','company_city',
    'company_country','company_phone','company_email','company_website',
    'bank_name','bank_iban','bank_bic',
    'default_tax_rate','quote_validity_days','default_payment_terms',
    'hourly_rate',
    'invoice_footer','quote_footer','receipt_footer','receipt_line_width','doc_lang'];   // Checkout-Pfad: eigener Knopf
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
  toast(_t('Einstellungen gespeichert'),'ok');
}

function _showFirstRunModal(suggestedPath, configFile) {
  const id = 'first-run-modal';
  if (document.getElementById(id)) return;
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--bg2);border-radius:var(--r);padding:32px;max-width:520px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.4)">
      <div style="font-size:18px;font-weight:600;margin-bottom:8px">${_t('Willkommen bei PLM')}</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:20px">
        ${_t('Bitte wähle, wo die Daten (Datenbank und Dateien) gespeichert werden sollen. Der Pfad wird dauerhaft in {file} gespeichert und kann später unter Einstellungen → Daten geändert werden.', { file: `<code style="font-family:var(--mono);font-size:12px">${esc(configFile || 'plm.config')}</code>` })}
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:13px;color:var(--t3);display:block;margin-bottom:4px">${_t('Datenverzeichnis')}</label>
        <input id="fr-data-dir" class="fi" style="width:100%;box-sizing:border-box" value="${esc(suggestedPath)}" placeholder="${_t('/absoluter/pfad/zum/datenverzeichnis')}">
      </div>
      <div id="fr-msg" style="font-size:13px;min-height:18px;margin-bottom:16px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="document.getElementById('first-run-modal').remove()">${_t('Später')}</button>
        <button class="btn btn-primary" onclick="_saveFirstRunPath()">${_t('Speichern &amp; Server neu starten')}</button>
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
    msg.textContent = r.message || _t('Gespeichert');
    msg.style.color = 'var(--green)';
    setTimeout(() => document.getElementById('first-run-modal')?.remove(), 2500);
  } catch(e) {
    msg.textContent = _t('Fehler beim Speichern');
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
    msg.textContent = _t('Fehler beim Speichern');
    msg.style.color = 'var(--red)';
  }
}

// ── DATEN VERSCHIEBEN ─────────────────────────────────────────
const _MOVE_PHASES = {
  prepare: _t('Vorbereiten…'),
  copy:    _t('Kopieren…'),
  verify:  _t('Kopie wird geprüft…'),
  switch:  _t('Umschalten auf neuen Pfad…'),
  cleanup: _t('Alten Ordner löschen…'),
  done:    _t('Fertig'),
};

async function moveDataDir() {
  const input  = document.getElementById('st-move-dir');
  const target = input?.value.trim();
  const keep   = !!document.getElementById('st-move-keep')?.checked;
  const msg    = document.getElementById('st-move-msg');
  const btn    = document.getElementById('st-move-btn');
  if (!target) { toast(_t('Bitte Zielpfad angeben'), 'err'); return; }

  const warn = keep
    ? _t('Alle PLM-Daten werden dorthin kopiert. Der neue Ordner wird danach verwendet, die alten Daten bleiben erhalten.')
    : _t('Alle PLM-Daten werden dorthin verschoben. Der alte Ordner wird erst gelöscht, nachdem die Kopie geprüft wurde.');
  if (!confirm(_t('Datenverzeichnis umziehen nach:') + `\n${target}\n\n${warn}\n\n` + _t('Während des Vorgangs nicht weiterarbeiten. Fortfahren?'))) return;

  btn.disabled = true;
  msg.textContent = '';
  const prog = document.getElementById('st-move-progress');
  const bar  = document.getElementById('st-move-bar');
  const det  = document.getElementById('st-move-detail');
  bar.style.width = '0';
  det.textContent = _t('Wird gestartet…');
  prog.style.display = '';

  try {
    await api('/api/data-path/move', 'POST', { target_dir: target, keep_source: keep });
  } catch (e) {
    btn.disabled = false;
    prog.style.display = 'none';
    msg.textContent = e.message || _t('Fehler');
    msg.style.color = 'var(--red)';
    return;
  }
  _pollDataMove();
}

function _pollDataMove() {
  const btn = document.getElementById('st-move-btn');
  const msg = document.getElementById('st-move-msg');
  const bar = document.getElementById('st-move-bar');
  const det = document.getElementById('st-move-detail');
  const timer = setInterval(async () => {
    let s;
    try { s = await api('/api/data-path/move-status'); } catch { return; }
    if (!det) { clearInterval(timer); return; }

    const pct = s.total_bytes ? Math.min(100, Math.round(s.copied_bytes / s.total_bytes * 100)) : (s.running ? 0 : 100);
    bar.style.width = pct + '%';
    det.textContent = `${_MOVE_PHASES[s.phase] || s.phase} ${_fmtBytes(s.copied_bytes)} / ${_fmtBytes(s.total_bytes)} (${_t('{n} Dateien', { n: s.total_files })})`;

    if (s.running) return;
    clearInterval(timer);
    if (btn) btn.disabled = false;

    if (s.error) {
      bar.style.background = 'var(--red)';
      det.textContent = _t('Abgebrochen — die Daten am alten Ort sind unverändert.');
      msg.textContent = s.error;
      msg.style.color = 'var(--red)';
      toast(_t('Verschieben fehlgeschlagen'), 'err');
      return;
    }

    bar.style.width = '100%';
    det.textContent = s.message || _t('Fertig');
    msg.textContent = _t('Neuer Pfad aktiv');
    msg.style.color = 'var(--green)';
    toast(_t('Daten erfolgreich verschoben'), 'ok');
    document.getElementById('st-move-dir').value = '';
    _refreshDataPathInfo();
  }, 700);
}

async function _refreshDataPathInfo() {
  const d = await api('/api/data-path').catch(() => null);
  if (!d) return;
  const info = document.getElementById('st-datapath-info');
  if (info) info.innerHTML =
    `DB: <code style="user-select:all">${esc(d.db_path)}</code><br>${_t('Dateien:')} <code style="user-select:all">${esc(d.files_dir)}</code>`
    + (d.config_file ? `<br><span style="color:var(--t4);font-size:12px">${_t('Konfigdatei:')} <code style="user-select:all">${esc(d.config_file)}</code></span>` : '');
  const inp = document.getElementById('st-data-dir');
  if (inp) inp.value = d.data_dir;
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
    </div>`).join('') : '<div style="color:var(--t3);font-size:13px;padding:4px 0">' + _t('Noch keine Drucker hinterlegt.') + '</div>';
}
function _renderNozzleList() {
  const el = document.getElementById('st-nozzles-list'); if (!el) return;
  el.innerHTML = state.nozzles.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">` +
    state.nozzles.map(n => `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:13px">
      <span>${n.size} mm</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;width:14px;height:14px;font-size:13px" onclick="delNozzle(${n.id})">✕</button>
    </div>`).join('') + '</div>' : '<div style="color:var(--t3);font-size:13px;padding:4px 0">' + _t('Noch keine Düsen hinterlegt.') + '</div>';
}
function _renderMatList() {
  const el = document.getElementById('st-mats-list'); if (!el) return;
  el.innerHTML = state.materialPresets.length ? state.materialPresets.map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);margin-bottom:4px">
      <span style="font-weight:500;min-width:60px">${esc(m.name)}</span>
      <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${[m.print_temp&&m.print_temp+'°C',m.bed_temp&&_t('Bett')+' '+m.bed_temp+'°C',m.nozzle&&m.nozzle+' mm',m.filament_price_kg&&m.filament_price_kg+' CHF/kg'].filter(Boolean).join(' · ')}</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="margin-left:auto" onclick="editMaterialPreset(${m.id})">✏️</button>
      <button class="btn btn-icon btn-red btn-sm" onclick="delMaterialPreset(${m.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--t3);font-size:13px;padding:4px 0">' + _t('Noch keine Vorlagen hinterlegt.') + '</div>';
}
async function addPrinter() {
  const name = document.getElementById('st-pr-name').value.trim();
  const cost = parseFloat(document.getElementById('st-pr-cost').value)||0;
  if (!name) return toast(_t('Name fehlt'),'err');
  await api('/api/printers','POST',{name,cost_per_hour:cost});
  document.getElementById('st-pr-name').value = '';
  document.getElementById('st-pr-cost').value = '';
  await loadAndRenderPrinterConfig(); toast(_t('Drucker gespeichert'),'ok');
}
async function editPrinter(id, name, cost) {
  const newName = prompt(_t('Druckername:'), name); if (!newName) return;
  const newCost = prompt(_t('Kosten (CHF/h):'), cost);
  await api(`/api/printers/${id}`,'PUT',{name:newName, cost_per_hour:parseFloat(newCost)||0});
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast(_t('Gespeichert'),'ok');
}
async function delPrinter(id) {
  await api(`/api/printers/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast(_t('Drucker gelöscht'),'ok');
}
async function addNozzle() {
  const size = document.getElementById('st-nz-size').value.trim();
  if (!size) return toast(_t('Grösse fehlt'),'err');
  await api('/api/nozzles','POST',{size});
  document.getElementById('st-nz-size').value = '';
  await loadAndRenderPrinterConfig(); toast(_t('Düse hinzugefügt'),'ok');
}
async function delNozzle(id) {
  await api(`/api/nozzles/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast(_t('Düse gelöscht'),'ok');
}
function editMaterialPreset(id) {
  const m = state.materialPresets.find(x => x.id === id); if (!m) return;
  document.getElementById('st-mat-id').value = id;
  set('st-mat-name', m.name); set('st-mat-temp', m.print_temp||'');
  set('st-mat-bed', m.bed_temp||''); set('st-mat-price', m.filament_price_kg||'');
  set('st-mat-notes', m.notes||'');
  document.getElementById('st-mat-nozzle').value = m.nozzle||'';
  document.getElementById('st-mat-add-btn').textContent = _t('✓ Speichern');
}
async function addMaterialPreset() {
  const name = document.getElementById('st-mat-name').value.trim();
  if (!name) return toast(_t('Name fehlt'),'err');
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
    document.getElementById('st-mat-add-btn').textContent = _t('+ Vorlage hinzufügen');
  } else {
    await api('/api/material-presets','POST',body);
  }
  ['st-mat-name','st-mat-temp','st-mat-bed','st-mat-price','st-mat-notes'].forEach(f=>set(f,''));
  document.getElementById('st-mat-nozzle').value = '';
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast(_t('Vorlage gespeichert'),'ok');
}
async function delMaterialPreset(id) {
  await api(`/api/material-presets/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast(_t('Vorlage gelöscht'),'ok');
}

// ── FILE INDEX ────────────────────────────────────────────────
async function renderFileIndex() {
  setLeftHeader(_t('Datei-Index'), `<button class="btn btn-ghost btn-sm" onclick="exportFileIndex()">${_t('&#x1F4CB; Als CSV')}</button>`);
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
      <td style="font-size:13px;color:var(--t3)">${fmtD(f.uploaded_at,'')}</td>
    </tr>`).join('');

  const docRows = documents.map(f => `
    <tr>
      <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(f.project_number)}</td>
      <td style="font-size:13px;color:var(--t3)" colspan="2">${_t('Projektdokument')}</td>
      <td style="font-size:13px;font-weight:500">${esc(f.original_name)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${esc(f.filename)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3);text-align:right">${fmtSize(f.file_size)}</td>
      <td style="font-size:13px;color:var(--t3)">${fmtD(f.uploaded_at,'')}</td>
    </tr>`).join('');

  const total = datasets.length + documents.length;
  const totalBytes = [...datasets,...documents].reduce((s,f) => s + (f.file_size||0), 0);

  setLeftBody(`<div style="padding:4px 0;max-width:1200px">
    <div style="font-size:13px;color:var(--t3);margin-bottom:16px;line-height:1.6">
      ${_t('Alle gespeicherten Dateien mit ihrem <strong>angezeigten Namen</strong> und dem <strong>tatsächlichen Dateinamen</strong> auf der Festplatte.')}<br>
      ${_t('Speicherort:')} <code style="font-family:var(--mono);background:var(--bg2);padding:1px 5px;border-radius:3px">data/files/</code>
      &nbsp;·&nbsp; ${_t('{n} Dateien', { n: total })} &nbsp;·&nbsp; ${_t('{size} gesamt', { size: fmtSize(totalBytes) })}
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="border-bottom:2px solid var(--line)">
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">${_t('Projekt')}</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">${_t('Artikel-Nr.')}</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">${_t('Rev.')}</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">${_t('Angezeigter Name')}</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">${_t('Dateiname auf Festplatte')}</th>
          <th style="text-align:right;padding:6px 8px;color:var(--t3);font-weight:600">${_t('Grösse')}</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">${_t('Datum')}</th>
        </tr>
      </thead>
      <tbody>
        ${dsRows}${docRows}
        ${!total ? '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">' + _t('Keine Dateien vorhanden') + '</td></tr>' : ''}
      </tbody>
    </table>
  </div>`);

  // Store for CSV export
  window._fileIndexData = { datasets, documents };
}

function exportFileIndex() {
  const { datasets, documents } = window._fileIndexData || { datasets:[], documents:[] };
  const rows = [
    [_t('Projekt'),_t('Artikel-Nr.'),_t('Revision'),_t('Angezeigter Name'),_t('Dateiname auf Festplatte'),_t('Typ'),_t('Grösse (Bytes)'),_t('Datum')],
    ...datasets.map(f => [f.project_number, f.item_number||'', f.revision||'', f.original_name, f.filename, f.ds_type||'', f.file_size||'', fmtD(f.uploaded_at,'')]),
    ...documents.map(f => [f.project_number, '', '', f.original_name, f.filename, f.ds_type||'', f.file_size||'', fmtD(f.uploaded_at,'')])
  ];
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'datei-index.csv';
  a.click();
}
