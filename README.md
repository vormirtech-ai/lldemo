# Catering POS — Quotations, Final Bills, POS

Catering management + POS app for Android phones and tablets (also runs on any computer browser).
Built for **Mujahid's Sterlling Caterrer** branding (editable in Settings).

- **Quotation (Catering Proposal)**: its own screen, number series (`QT/2026-27/0001`) and PDF in the style of the reference dinner menu.
- **Final Bill / Tax Invoice**: a separate screen, number series (`INV/2026-27/0001`), PDF, payments and balance due.
- POS (dine-in / takeaway / delivery, tables, split payments, 80 mm receipt), events, clients, menu catalogue, reports, roles, audit log, backup.
- Works **offline**. Data is stored on the device. No API keys needed.

---

## जल्दी शुरू करें (Hindi quick start)

1. **Web app (सबसे आसान):** `dist` फ़ोल्डर को Netlify Drop (app.netlify.com/drop) पर drag करें, या GitHub Pages पर deploy करें। मिलने वाला `https://…` link Android Chrome में खोलें → ⋮ menu → **Install app**। App होम-स्क्रीन पर आ जाएगा और offline चलेगा।
2. **APK:** यह project GitHub पर push करें → **Actions → Build Android APK → Run workflow** → run पूरा होने पर **Artifacts** से `catering-pos-debug.apk` डाउनलोड करके फ़ोन/टैबलेट में install करें।
3. पहली बार खोलने पर Owner का नाम और PIN बनाएं। फिर **Settings** में address, phone, GSTIN, logo, tax और Menu में rates डालें।

---

## Deploy options

### A. Installable web app (PWA) — recommended first
The `dist/` folder is a complete static site (HTTPS is required for install/offline).

| Host | How |
|---|---|
| Netlify Drop | Drag the `dist` folder onto app.netlify.com/drop |
| GitHub Pages | Push repo → Settings → Pages → Source **GitHub Actions** → the included `deploy-pages.yml` publishes on every push to `main` |
| Any server | Upload the contents of `dist/` to any HTTPS web root or sub-folder |

On Android: open the URL in Chrome → **Install app**. On tablets it opens full-screen in landscape or portrait.

### B. Android APK
`.github/workflows/android-apk.yml` builds the APK on GitHub's servers (Node 22, Java 21, Android SDK):

1. Create a GitHub repo and push this folder (`git init && git add . && git commit -m init && git push`).
2. GitHub → **Actions → Build Android APK → Run workflow**.
3. Download **catering-pos-apk** from the run's *Artifacts*, unzip, install `catering-pos-debug.apk` (allow "Install unknown apps").

For a Play Store / signed build, create a keystore and add repo secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; the workflow then also outputs `catering-pos-release.apk`.

Local build (needs Android Studio / SDK): `npm ci && npx cap add android && npm run apk:debug`.

### Develop
```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # money maths: totals, discounts, taxes, rounding, payments
npm run build      # production build in dist/
```

---

## How the two documents stay separate

| | Quotation | Final bill |
|---|---|---|
| Record | `quotations` table | `invoices` table |
| Numbering | `QT/<FY>/0001` (on save) | `INV/<FY>/0001` (only when **Finalized**) |
| PDF | "QUOTATION • CATERING PROPOSAL", menu by section with descriptions, commercial proposal, inclusions/exclusions, *Estimated total* | "FINAL BILL" / "TAX INVOICE", bill-to, items charged, grand total, payment summary, **Balance due**, PAID/UNPAID stamp |
| Changes | Revisions tracked; locked once converted | Draft → Finalize (locked); manager can edit/void with audit trail |

**Convert to final bill** copies the quotation into a new draft bill (inside one transaction, so a quotation can never create two bills). The quotation is kept exactly as sent and marked *Converted*. On the bill you change actual pax, add extras, discounts, taxes and record payments.

Adding a menu item to a document **copies** its name, description and rate, so later price changes never alter old quotations or bills.

## WhatsApp sharing
- Generate → **preview** → **Share to WhatsApp**. On Android this opens the share sheet with the PDF attached; pick WhatsApp and the client's chat. The client's number is shown, and **Open chat** opens `wa.me/<number>` directly.
- Where file sharing isn't supported (desktop browsers) the PDF downloads and the client's WhatsApp chat opens to attach it.
- The app never claims "sent" on its own: after sharing it asks *"Did the PDF reach the client?"* and only then marks the quotation **Sent**. Every attempt is logged (Settings → Backup & data → Sharing log).
- Fully automatic sending (WhatsApp Business Cloud API) is **not configured**. It needs a Meta business account, an approved document template and a server that holds the access token — never put the token in this app. See `.env.example`.

## Roles
| Role | Can |
|---|---|
| Owner | Everything, incl. settings, users, backup |
| Manager | Prices, reports, audit log, unlimited discount, delete, edit/void finalized bills and payments |
| Cashier | Quotations, bills, payments, POS, clients; discount up to the limit in Settings (default 5%) |
| Staff | Take POS orders, view menu and events |

Users sign in with a PIN (salted, hashed; never stored in plain text). Important actions go to the audit log.

## Data, offline & backup
- Storage: IndexedDB on the device (relational layout: settings, users, categories, items, clients, quotations, invoices, payments, orders, diningTables, counters, audit, shares). Schema: `src/db.js`.
- Everything works offline. Internet is only needed to open WhatsApp / share and for the first load of the web app.
- Money is calculated in paise (integers) to avoid rounding errors; financial writes (numbering, conversion, finalizing, payments) run in database transactions. Payments use a unique id so a double-tap can't record twice.
- **Backup:** Settings → Backup & data → *Download backup* (JSON). Restore on any device with *Restore from file*. Do this regularly — data lives on one device and there is no cloud sync in this version.

## Project layout
```
src/
  App.jsx            shell, login/PIN, navigation (sidebar on tablet, bottom bar on phone)
  db.js  repo.js     schema, numbering, audit, business operations
  calc.js format.js  money maths, ₹ formatting, amount in words
  pdf/               quotationPdf.js, invoicePdf.js, receiptPdf.js (jsPDF)
  screens/           Dashboard, Quotations, Bills, POS, Events, Clients, Menu, Reports, Settings
  share.js native.js WhatsApp / share sheet / Android bridge
tests/calc.test.js   automated tests
```

## Demo data
Settings → Backup & data → **Load demo data** creates a sample quotation (the reference dinner menu), a bill and a part-payment, all marked **DEMO**. Use *Remove demo data* before going live (numbering restarts if nothing else exists).
