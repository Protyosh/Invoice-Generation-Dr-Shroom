# 🍄 Dr. Shroom — B2B Invoice App

A mobile-friendly invoicing app for giving invoices to stores/distributors you supply
products to. This is **separate** from your existing customer-ordering website — it
writes to new tabs in the **same spreadsheet**, so everything stays in one place.

- Generates invoices numbered `INV/26-27/DS01`, `DS02`, ... (resets each financial year)
- Manages your **Products** (with photos, prices, stock), **Recipients** (stores you
  deliver to), and your **Business Info**
- Generates a clean PDF per invoice, matching your existing invoice style
- Works on Android (as an installed APK) and iOS (as a home-screen web app) — same
  codebase, since it's just a website under the hood
- All data lives in your Google Sheet, so you and your teammate see the same products,
  recipients, stock, and invoice history

---

## 1. Set up the backend (Google Apps Script)

You said you'll create a **new deployment** of your Apps Script project. Here's exactly
what to do:

1. Open your existing Apps Script project (the one with `doGet`/`doPost` for customer
   orders) at [script.google.com](https://script.google.com).
2. Add a **new file** in the project: click the `+` next to "Files" → Script → name it
   `InvoiceBackend` → paste in the entire contents of
   [`apps-script/InvoiceBackend.gs`](./apps-script/InvoiceBackend.gs) from this repo.
3. Open your **existing main script file** (the one with your current `doGet`/`doPost`)
   and make these two small edits — both are called out at the top of
   `InvoiceBackend.gs` too:

   In `doGet(e)`, add this as the very first line inside the function:
   ```js
   function doGet(e) {
     const action = e.parameter.action;
     if (action) return routeInvoiceGet(action, e);
     // ... your existing orderId tracking code stays exactly as it is below ...
   }
   ```

   In `doPost(e)`, add one line right after `JSON.parse`:
   ```js
   function doPost(e) {
     const lock = LockService.getScriptLock();
     try { lock.waitLock(30000); } catch(err) { return buildResponse({success:false,error:'Busy, retry'}); }
     try {
       const data = JSON.parse(e.postData.contents);
       if (data.action) return routeInvoicePost(data);   // <-- ADD THIS LINE
       // ... your existing order-creation code stays exactly as it is below ...
     } finally { lock.releaseLock(); }
   }
   ```

   This means: if the incoming request has an `action` field, it's routed to the
   invoice app's logic. If not, it falls through to your existing order-handling code,
   completely untouched.

4. **Deploy as a new Web App:**
   - Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (this is what lets the app reach it without a Google
     login prompt — the URL itself is the only "key", so don't share it publicly)
   - Click **Deploy**, authorize the permissions it asks for
   - Copy the **Web app URL** (ends in `/exec`) — you'll paste this into the app's
     Settings screen in step 3 below

5. The first time any of the new actions run (e.g. opening **Products** in the app),
   the script automatically creates four new tabs in your spreadsheet:
   - `B2B_Invoices` — every invoice you generate
   - `Products` — seeded with your 3 flavours (Peri Peri, Magic Masala, Cream & Onion)
     at ₹170 each, 0 stock — edit stock/prices from the app or directly in the sheet
   - `Recipients` — empty at first; fills in as you create invoices or add manually
   - `BusinessInfo` — seeded with the details from your existing invoice (Dr. Shroom
     Snacks, Tripura address, FSSAI number) — editable from the app

   Your existing **Orders** sheet/tab is untouched.

---

## 2. Run the app locally (to test before installing on a phone)

```bash
cd app
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser, go to the hamburger menu → **Settings**,
paste your Web App URL from step 1.4, tap **Save Settings**, then **Test Connection**.

---

## 3. Use the app

- **Generate Invoice**: pick or add a recipient → add items from your product list (or
  a custom line item) → preview → confirm. The invoice number is only assigned when you
  confirm, so nothing gets "used up" on a draft you cancel.
- **Products**: add/edit products, attach a quick photo (used in-app only, to help you
  pick the right item fast — it's not printed on the PDF, since you asked to keep the
  PDF clean), and track stock.
- **Recipients**: stores/people you deliver to regularly. New recipients are saved
  automatically the first time you invoice them, so re-typing is rare.
- **Business Info**: your own details, pre-filled, editable any time.
- **History**: every invoice you've made, searchable, with one-tap PDF re-generation if
  you need to resend or reprint.

---

## 4. Package as an Android APK

Since the app is just static HTML/CSS/JS, the fastest path to a real installable
`.apk` is **[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)** (Google's
own tool for wrapping a website into an Android app — this is the same technique
Google uses for "Trusted Web Activities"). It supports Android 11/12 and up without
any extra work.

You'll need the app hosted somewhere with a real URL first (GitHub Pages is the
easiest free option once you push this repo — Settings → Pages → deploy from the
`app/` folder).

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://yourusername.github.io/dr-shroom-invoice/app/manifest.json
bubblewrap build
```

This produces an `app-release-signed.apk` you can install directly on Android 11/12+
phones, or upload to the Play Store later if you ever want to.

**For your iOS teammate:** no packaging needed. She opens the same URL in Safari, taps
**Share → Add to Home Screen**, and gets an app icon that opens full-screen — this is
the standard, fully-supported way to get an app-like experience on iOS without the App
Store, since `.apk` files are Android-only and can't be installed on iPhones.

---

## 5. Project structure

```
dr-shroom-invoice/
├── app/                    # the actual app (deploy this folder as your website)
│   ├── index.html
│   ├── styles.css
│   ├── config.js           # script URL storage
│   ├── api.js               # talks to your Apps Script backend
│   ├── pdf.js                # generates the invoice PDF
│   ├── app.js                  # all screen logic
│   ├── manifest.json       # PWA manifest (for installability)
│   ├── icon-192.png / icon-512.png   # placeholder icons — swap for your real logo
├── apps-script/
│   └── InvoiceBackend.gs   # paste into your existing Apps Script project
└── docs/
```

---

## Notes & things worth knowing

- **Internet required.** Every screen talks to your spreadsheet live — there's no
  offline mode, which matches what you asked for.
- **Product photos are compressed automatically** to small thumbnails (~160px) before
  being saved, so they don't blow past Google Sheets' per-cell size limit. They're for
  picking items quickly in the app and are never printed on the invoice PDF.
- **Invoice numbers are reserved server-side**, in Script Properties, so two phones
  invoicing at the same time won't ever collide or skip a number.
- The **Preview step doesn't reserve a number** — only tapping "Confirm & Generate"
  does, so a cancelled draft never wastes a number.
