# Cafe Loyalty

A free digital loyalty card for a cafe that runs entirely on **GitHub Pages**. There's no server and no monthly cost.

- **Customers** scan the fixed QR code on their table, sign up with name + mobile, and get a loyalty card on their phone.
- **The cafe's database lives on the admin's phone** (in the browser's storage). That phone is also the scanner at the counter.
- Data moves between phones by scanning QR codes at the counter.

## How it works

```
Table QR (printed once)
   └─► customer's phone: sign up → card with QR (saved on their phone)

At the counter, on the cafe phone (admin/staff):
   1. Scan the customer's card QR → customer is found by mobile number (or added if new)
   2. Tap "Record visit" or "Redeem reward" → saved in the cafe phone's database
   3. The cafe phone shows an "update" QR → customer scans it → their card shows new points and badges
```

| Who | Can |
|---|---|
| Customer | Sign up from the table QR · see their QR card, points, visits, progress to the reward, badges · save their card link |
| Staff (staff PIN) | Scan cards · record visits · redeem rewards · find a customer by mobile · see the Wi-Fi password |
| Admin (admin PIN) | Everything, plus: customers (edit, block, correct points, void visits), loyalty rules, badges, table QR codes, reminders and offers via WhatsApp/SMS, backup/restore, audit log |

Built-in protection: one counted visit per N hours per customer; customers are matched by mobile number (no duplicates, and a customer on a new phone keeps their points); corrections are added as new history entries (nothing silently deleted); every action is in the audit log; offers only go to customers who ticked "send me offers".

---

## Publish on GitHub Pages (once, about 10 minutes)

1. Create a free account at **github.com** if you don't have one.
2. Click **New repository** → name it `cafe-loyalty` → **Public** → don't add a README → **Create repository**.
3. Upload the files. Either:
   - **Easiest (browser):** on the new repo page, click **uploading an existing file**, drag the **`docs` folder** from `C:\Users\user\Documents\cafe-loyalty` into the page, then click **Commit changes**.
   - **Or with git (PowerShell, in the `cafe-loyalty` folder):**
     ```powershell
     git config user.name "Your Name"
     git config user.email "you@example.com"
     git add .
     git commit -m "Cafe loyalty app"
     git remote add origin https://github.com/YOUR-USERNAME/cafe-loyalty.git
     git push -u origin main
     ```
4. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder: `/docs` → Save**.
5. After about a minute, the site is live at **`https://YOUR-USERNAME.github.io/cafe-loyalty/`**

No customer data is ever uploaded to GitHub. It only stays on the phones.

## Set up the cafe phone (admin)

1. On the phone that stays at the counter, open `https://YOUR-USERNAME.github.io/cafe-loyalty/#/admin`.
2. Enter the cafe name, country code (91 for India) and an **admin PIN** → **Create cafe database**.
3. **Add it to the home screen** (Chrome: ⋮ → *Add to Home screen*; iPhone Safari: Share → *Add to Home Screen*) and always open it from there. This protects the data from being cleared automatically.
4. **Rules & cafe:** set points per visit, the reward, Instagram and Wi-Fi. Optionally set a **staff PIN** for employees.
5. **Badges:** "First Sip" (1 visit) and "Regular" (10 visits) are already there. Add your own.
6. **Table QR codes:** add each table → **Print QR codes** → stick one on each table.

## Daily use

- **New customer:** scans the table QR → fills in name + mobile → shows their card at the counter.
- **At the counter:** open the app → **Scan** → **Start camera** → scan the customer's card → **Record visit** (or **Redeem**) → the customer scans the update QR on your screen with their camera.
- **Customer lost their phone or cleared the browser:** they sign up again from any table QR with the **same mobile number**. On the next scan their old points and visits are there.
- **Reminders & offers:** lists customers close to a reward and lets you send an offer to everyone who agreed. Each message opens in your WhatsApp or SMS ready to send, so it's free.

## 🔔 Free push notifications (OneSignal)

Customers can tap **"Yes, notify me"** on their card to get offers and reward reminders as phone notifications, in Chrome/Android and iPhone Safari. It costs nothing per message, unlike SMS or WhatsApp. OneSignal's free plan allows unlimited web push subscribers (up to 10,000 per send).

**Set up once:**
1. Sign up free at **onesignal.com** → **New App/Website** → choose **Web**.
2. Choose **Typical Site** and fill in:
   - Site Name: your cafe name
   - Site URL: `https://vormirtech-ai.github.io`
   - Icon: upload `docs/icon-512.png` (optional)
   - Leave the bell and permission prompts **off**. The card has its own "Yes, notify me" button.
3. Save, then copy the **App ID** (Settings → Keys & IDs).
4. Put it in `docs/config.js`: `window.ONESIGNAL_APP_ID = 'your-app-id';` and push to GitHub.

**iPhone customers:** Apple only allows web notifications for sites added to the Home Screen (iOS 16.4+). The card shows them the steps.

**Sending a message:** In the admin panel, open **Reminders & offers → Open OneSignal to send**. Write the message (use `{{ first_name | default: "there" }}` for the name) and pick an audience:
- everyone: **Subscribed Users**
- close to a reward: segment with tag `visits_away` = `2`
- reward waiting: tag `reward_ready` = `yes`

Tags (first name, points, visits, visits away) update whenever the customer scans the "update" QR after a visit.

## ⚠️ Backups (important)

All customer data is stored **only on the cafe phone**. If that phone is lost, factory-reset, or the browser's site data is cleared, the data is gone.

- Go to **Backup → Save backup file** at least once a week, and save the file to Google Drive, email, or WhatsApp it to yourself. The app reminds you when a backup is more than 7 days old.
- **New phone:** open `…/#/admin` on the new phone → *Moving from another phone?* → choose the backup file.

## Limits of a no-server setup

- **One cafe phone holds the database.** A second phone at the counter would have its own separate data. Use one counter phone (or tablet) for scanning.
- **Push notifications are sent from the OneSignal dashboard**, not from the admin panel. Automatic reminders aren't set up; you send them to the "close to reward" segment yourself.
- **Customer cards update when the customer scans the update QR** at the counter. If they skip it, their phone shows older points until next time, but the cafe phone always has the correct numbers.
- The customer's card QR contains their name and mobile number so the cafe phone can add them. It's only shown on their screen at the counter.

## Project layout
```
docs/                 ← everything GitHub Pages serves
  index.html          page shell
  app.js              screens: customer card, scanner, admin panel
  store.js            the cafe database on the admin's phone (IndexedDB)
  styles.css          design (light and dark mode)
  sw.js               lets the app open without internet
  manifest.webmanifest, icon*.png, icon.svg   home-screen app
  vendor/             QR code generator (qrcode-generator) and reader (jsQR)
```
