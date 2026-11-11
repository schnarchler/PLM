# PLM & ERP — Quick start

[Deutsch](SCHNELLSTART.md) · **English**

The essentials on one page. Everything in detail is in the **[README](README.md)** (the step-by-step
[manual](HANDBUCH.md) is currently only available in German).

---

## 1. Start

| | |
|---|---|
| **Windows** | Double-click `START-PLM.bat` (desktop icon: run `VERKNUEPFUNG-ERSTELLEN.bat` once) |
| **Linux** | `bash start-plm.sh` or double-click `PLM-ERP` |
| **Address** | `http://localhost:3000`, from other PCs on the network `http://<pc-name>:3000` |
| **Quit** | top right **■ Quit** |

The browser opens by itself. On first start, PLM installs the required packages, which takes
a little longer once. Requires [Node.js](https://nodejs.org) (LTS).

**Language:** PLM follows the browser language; switch under **Settings → Data → Appearance**.
Printed documents have their own language under **Settings → Company**.

**Data folder:** set in `plm.config` (line `data_dir=`), without an entry `backend/data/`.
It holds the database, files and backups. `plm.config` and the data folder never go into Git.
The data folder may be on a network drive and be used by several PCs — but only one PLM works
with it at a time; a second one asks on start-up whether it should take over (see the
[README](README.md#data-on-a-network-drive-several-pcs)).

## 2. Set up once

Everything under **Settings**:

1. **Company** — name, address, bank details, logo, document language (for quotes, invoices,
   delivery notes)
2. **Calculation** — hourly rate, VAT, payment terms
3. **3D printing** — printers (with CHF/h) and nozzles
4. **Users** — people with a role, if several people work with PLM
5. **Data → Checkout directory** — if you work with CAD; applies to this PC only
6. **PLM → Release workflow** — **With release** (default) or **Without release**

## 3. The workflow in eight steps

| | Step | How |
|---|---|---|
| 1 | Create a project | **Projects → + Project** → name |
| 2 | Create a part | Open the project → **+ Part** → name (or **Parts → + Part** and choose a project) |
| 3 | Files and weight | **Revisions** tab → **+ File** (a 3MF provides the print parameters); weight on the **Data sheet** → **✏** |
| 4 | Release | **Revisions** tab → **✓ Release** |
| 5 | Customer | **Customers → + Customer** |
| 6 | Quote | **Orders → + Quote** → **+ Line** with a PLM item → **📄 Quote PDF** |
| 7 | Order and production | **✓ Quote accepted** → **🔧 Create production order** → status **Delivered** |
| 8 | Invoice | **📄 Invoice PDF** → mark as invoiced |

Changing a released part: **Revisions** tab → **⚡ Start ECO** → enter a reason. PLM creates a
new revision and carries over files, BOM and print parameters.

## 4. The most important data

**Numbers** (prefixes can be changed under Settings → Admin)

| What | Example | | What | Example |
|---|---|---|---|---|
| Project | `0001` | | Order / quote | `ORD-2026-0001` |
| Assembly | `0001-asm-001` | | Production order | `PRD-2026-0001` |
| Part | `0001-prt-001` | | Purchase order | `PO-2026-0001` |
| Document | `0001-doc-001` | | Customer / supplier | `CUS-0001` / `SUP-0001` |
| Short code to print on the part | `XHJ-1` (= rev1) | | | |

New installations with the English interface use these prefixes; installations with existing
German data keep AUF, LS, EK, KD and LF.

**Revision status**

| Status | Meaning |
|---|---|
| **DFT** | Draft, freely editable |
| **REV** | In review (only with two-person approval) |
| **REL** | Released, locked |
| **ECO** | Being changed, the new revision is in draft |
| **OBS** | Obsolete, kept for traceability |

**Per revision:** files, BOM, print parameters, weight, selling price and description. A new
revision takes them over from the previous one.

**In the data folder**

| Folder / file | Content |
|---|---|
| `plm.db` | database |
| `files/` | all uploaded files |
| `backups/` | backup at start-up, one per day (the last 14), plus manual ones |
| `papierkorb/` | deleted files (trash), kept for 30 days |
| `checkout/` | checked-out files (if no separate directory is set) |
| `plm.lock` | which PLM currently holds the data — do not delete by hand while PLM is running |

## 5. Used every day

- **Search** at the top: finds items, orders, customers. A short code like `XHJ-1` (also via
  barcode scanner) opens the part directly in that revision.
- **Check out / Check in** on the item: files for editing in CAD. On check-in, only changed
  files are taken over.
- **History** on the item: who changed what and when, with old and new value.
- **Back up:** Settings → **Data → 💾 Back up now**, or **Full export** as a ZIP.

---

More in the **[README](README.md)**: [Release workflow](README.md#release-workflow) ·
[As-delivered configuration](README.md#as-delivered-configuration) ·
[Check-out / check-in](README.md#check-out--check-in-cad-workflow-with-solid-edge) ·
[Backups](README.md#backups)
