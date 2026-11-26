# Tapfolio — one tap. Your whole world.

**Tapfolio** is a modern, NFC-ready digital card for sharing your portfolio, social networks and contact details. It is a zero-build static site, so it deploys cleanly to GitHub Pages.

- Live editor with real-time phone preview
- Drag-and-drop link list with platform icons
- Themes, accent colors and button styles
- Google sign-in and cloud sync with Firebase (when configured)
- Photo uploads for your avatar and a personal background, with live preview and overlay control
- Web NFC writer for Android Chrome, plus tag-writer instructions for iPhone
- Downloadable QR code and vCard contact file
- Public profile URLs like `https://<you>.github.io/tapfolio/u/shinjuu`

Developer: **Shinjuu** · fsociety.shinjuu@gmail.com

**Live deployment:** <https://fsocietyshinjuu.github.io/tapfolio/> · sample profile: <https://fsocietyshinjuu.github.io/tapfolio/u/shinjuu>

---

## 1. Run it locally

Node.js 18+ is enough; there are no npm packages to install.

```powershell
npm start
# open http://localhost:4173
```

The sample profile lives at `/u/shinjuu`. Without Firebase keys the app runs in **Demo Mode**, which saves edits in your browser's `localStorage`.

---

## 2. Connect Google sign-up + cloud profiles

1. Create a project at <https://console.firebase.google.com/>.
2. Go to **Authentication → Sign-in method → Google**, enable it, and choose a support email.
3. Go to **Authentication → Settings → Authorized domains** and add:
   - `localhost`
   - `<your-username>.github.io`
   - your custom domain, if you use one
4. Create a Web app in **Project settings → Your apps**, then copy the config values.
5. Paste them into [`assets/firebase-config.js`](assets/firebase-config.js), replacing every `YOUR_*` placeholder.

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

6. Create a **Cloud Firestore** database, go to the **Rules** tab, and paste the contents of [`firestore.rules`](firestore.rules).

Google sign-in and saving now work for real. Profiles are public reads, and only the signed-in owner can edit their own document.

---

## 3. Deploy to GitHub Pages

Git is not installed on this machine yet. Install it from <https://git-scm.com/download/win> (or `winget install --id Git.Git -e`), then restart your terminal.

Create a **public** repository named `tapfolio` (if that name is taken, use `tapfolio-shinjuu` and update the URLs below). Then run:

```powershell
.\deploy.ps1 -GitHubUser YOUR_GITHUB_USERNAME
```

Or do it manually:

```powershell
git init -b main
git add .
git commit -m "Initial Tapfolio release"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/tapfolio.git
git push -u origin main
```

In the GitHub repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.

The included [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publishes the site automatically on every push to `main`.

Your site:

- Home: `https://YOUR_GITHUB_USERNAME.github.io/tapfolio/`
- Profile: `https://YOUR_GITHUB_USERNAME.github.io/tapfolio/u/shinjuu`

If you change the repo name, change `tapfolio` in those URLs too.

### Custom domain (optional)

A short domain makes the NFC tag feel premium, for example `tapfolio.link`, `shinjuu.dev` or `meetshinjuu.com` (check availability and buy it wherever you prefer).

1. Add a `CNAME` file at the repo root containing only your domain.
2. Add an `A` record pointing to `185.199.108.153` (plus `.109`, `.110`, `.111`) or a `CNAME` to `<username>.github.io`, depending on your registrar.
3. In GitHub Pages settings, enter the same domain.
4. Add the domain to Firebase Authorized Domains.

---

## 4. Write your profile to an NFC tag

1. Open your public profile URL on the device you will use for writing.
2. Click **Write NFC** (in the editor Launchpad or the owner bar on your profile).
3. **Android + Chrome, HTTPS:** hold a rewritable NTAG213/215/216 tag near the phone and approve the browser prompt. Tapfolio writes a URL record.
4. **iPhone / other browsers:** Web NFC is not available. Use a free app such as **NFC Tools** or **NXP TagWriter**, choose **Add record → URL**, paste your Tapfolio URL, and write the tag.

The QR dialog is a fallback for phones that cannot read the tag, and the vCard button lets visitors save your contact details.

> Web NFC requires HTTPS (or `localhost`) and a supported Android browser. GitHub Pages provides HTTPS automatically.

---

## 5. Editing your profile

- Claim a unique handle in **Profile → Unique handle**. Allowed: lowercase letters, numbers, `-` and `_` (3–30 characters).
- Upload a **Profile → Avatar photo** and crop it in the circular crop dialog (drag to reposition, slider to zoom) before applying. A **Style → Personal background photo** can also be uploaded instead of pasting a URL. Photos are compressed in your browser before saving; an overlay slider keeps profile text readable over a busy background. You can still paste an image URL in either field, and **Remove** clears an uploaded image.
- Add links with the **Add a link** button. Pick a well-known platform (Website, Portfolio, GitHub, LinkedIn, X, Instagram, Facebook, YouTube, TikTok, WhatsApp, Email, Phone, Résumé or Other). For social platforms the site URL is filled in for you — just type your username, and Tapfolio builds the full link automatically. Existing full URLs keep working. Use the grip to drag, the arrows to reorder, and the check button to show/hide.
- Sample links in the `shinjuu` demo profile are placeholders — replace them with your real URLs before printing your card.
- Click **Save changes** to publish. In Demo Mode it saves only in the current browser.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Landing page, editor and public profile shell |
| `assets/styles.css` | Theme, layout and animation system |
| `assets/app.js` | Auth, Firestore, editor, routing, NFC, QR and vCard logic |
| `assets/data.js` | Platforms, themes, statuses and the sample profile |
| `assets/firebase-config.js` | Replace with your Firebase web config |
| `firestore.rules` | Security rules for public profiles and owner-only writes |
| `server.js` | Local static server with SPA fallback |
| `404.html` | Redirects `/u/handle` to `?u=handle` on GitHub Pages |
| `.github/workflows/deploy.yml` | GitHub Pages deployment workflow |

Built with care by **Shinjuu** — fsociety.shinjuu@gmail.com.
