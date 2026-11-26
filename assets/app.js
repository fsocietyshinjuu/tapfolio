import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import {
  PLATFORMS,
  THEMES,
  STATUSES,
  ACCENT_PRESETS,
  SAMPLE_PROFILE,
  platformMeta,
  slugify,
  linkHref,
  makeId,
  createDefaultProfile,
  normalizeProfile
} from "./data.js";

const FB_VERSION = "11.6.0";
const SDK = {
  app: `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-app.js`,
  auth: `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-auth.js`,
  firestore: `https://www.gstatic.com/firebasejs/${FB_VERSION}/firebase-firestore.js`
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const state = {
  mode: "demo",
  firebase: null,
  user: null,
  profile: null,
  viewProfile: null,
  viewHandle: null,
  route: "landing",
  dirty: false,
  actionUrl: "",
  routeToken: 0
};

init();

async function init() {
  bindStaticEvents();
  bindEditorEvents();
  applyStoredTheme();
  populateSelects();
  await setupFirebase();
  await handleRoute();
}

/* ------------------------------------------------------------------ */
/* Firebase / session                                                   */
/* ------------------------------------------------------------------ */

async function setupFirebase() {
  if (!isFirebaseConfigured) {
    state.mode = "demo";
    restoreDemoSession();
    updateHeaderAuth();
    return;
  }

  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import(SDK.app),
      import(SDK.auth),
      import(SDK.firestore)
    ]);

    const app = appMod.initializeApp(firebaseConfig);
    state.firebase = {
      auth: authMod.getAuth(app),
      db: dbMod.getFirestore(app),
      authMod,
      dbMod
    };
    state.mode = "firebase";

    authMod.onAuthStateChanged(state.firebase.auth, async (user) => {
      state.user = user
        ? {
            uid: user.uid,
            name: user.displayName || "Creator",
            email: user.email || "",
            demo: false
          }
        : null;
      updateHeaderAuth();
      if (state.route === "dashboard") await showDashboard(true);
    });
  } catch (error) {
    console.warn("Tapfolio: Firebase could not be initialized.", error);
    state.mode = "demo";
    restoreDemoSession();
    showToast("Firebase could not load. Running in local demo mode.", "error");
  }
}

function restoreDemoSession() {
  try {
    const raw = safeGet("tapfolio:demoUser");
    state.user = raw ? JSON.parse(raw) : null;
  } catch {
    state.user = null;
  }
}

async function signInWithGoogle() {
  if (!isFirebaseConfigured || !state.firebase) {
    showToast("Add your Firebase config in assets/firebase-config.js to enable Google sign-in.", "error");
    openAuth();
    return;
  }

  try {
    const { signInWithPopup, GoogleAuthProvider } = state.firebase.authMod;
    await signInWithPopup(state.firebase.auth, new GoogleAuthProvider());
    state.mode = "firebase";
    closeDialog($("#authDialog"));
    closeDialog($("#actionDialog"));
    showToast("Signed in with Google. Welcome to Tapfolio!", "success");
  } catch (error) {
    if (error?.code === "auth/popup-closed-by-user") return;
    if (error?.code === "auth/unauthorized-domain") {
      showToast("Add this site's domain to Firebase Authorized Domains.", "error");
    } else {
      showToast(error?.message || "Google sign-in failed.", "error");
    }
  }
}

function startDemo() {
  const user = {
    uid: "demo-user",
    name: "Demo Explorer",
    email: "you@example.com",
    demo: true
  };
  safeSet("tapfolio:demoUser", JSON.stringify(user));
  state.user = user;
  state.mode = "demo";
  state.profile = null;
  closeDialog($("#authDialog"));
  navigate("dashboard");
  showToast("Demo mode is on. Your edits save in this browser.", "success");
}

async function signOut() {
  try {
    if (state.firebase?.authMod) await state.firebase.authMod.signOut(state.firebase.auth);
  } catch { /* ignore */ }
  safeRemove("tapfolio:demoUser");
  state.user = null;
  state.profile = null;
  state.mode = isFirebaseConfigured ? "firebase" : "demo";
  navigate("landing");
  showToast("You're signed out.", "success");
}

async function loadOwnProfile() {
  const user = state.user;
  if (!user) return createDefaultProfile({ name: "Creator" }, "creator");
  const suggested = suggestedHandle(user);

  if (state.mode === "firebase" && state.firebase) {
    const { doc, getDoc } = state.firebase.dbMod;
    const db = state.firebase.db;
    try {
      const withTimeout = (promise) => Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
      const userSnap = await withTimeout(getDoc(doc(db, "users", user.uid)));
      const handle = userSnap?.exists() ? userSnap.data().handle : suggested;
      if (handle) {
        const profileSnap = await withTimeout(getDoc(doc(db, "profiles", handle)));
        if (profileSnap?.exists()) return normalizeProfile(profileSnap.data());
      }
    } catch (error) {
      console.warn("Tapfolio: could not load profile.", error);
      showToast("Could not load your cloud profile. Fill in the form to continue.", "error");
    }
    return createDefaultProfile(user, suggested);
  }

  const handle = safeGet("tapfolio:demoHandle");
  if (handle) {
    const raw = safeGet(`tapfolio:profile:${handle}`);
    if (raw) {
      try { return normalizeProfile(JSON.parse(raw)); } catch { /* ignore */ }
    }
  }
  return createDefaultProfile(user, "demo");
}

async function loadPublicProfile(handle) {
  if (state.mode === "firebase" && state.firebase) {
    const { doc, getDoc } = state.firebase.dbMod;
    try {
      // Never hold the public page hostage to a slow/offline Firestore call.
      const snap = await Promise.race([
        getDoc(doc(state.firebase.db, "profiles", handle)),
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
      if (snap?.exists()) return normalizeProfile(snap.data());
    } catch (error) {
      console.warn("Tapfolio: could not load public profile.", error);
    }
  }

  const raw = safeGet(`tapfolio:profile:${handle}`);
  if (raw) {
    try { return normalizeProfile(JSON.parse(raw)); } catch { /* ignore */ }
  }

  if (handle === "shinjuu" || handle === "demo") return normalizeProfile(SAMPLE_PROFILE);
  return null;
}

async function saveProfile() {
  if (!state.user) {
    openAuth();
    return;
  }

  const previousHandle = state.profile?.handle;
  syncProfileFromForm();
  const profile = normalizeProfile(state.profile);
  const handleError = validateHandle(profile.handle);
  if (handleError) {
    showToast(handleError, "error");
    $("#handleInput").focus();
    return;
  }

  const saveBtn = $("#saveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const oldHandle = previousHandle;
    profile.uid = state.user.uid;

    if (state.mode === "firebase" && state.firebase) {
      const { doc, runTransaction, serverTimestamp } = state.firebase.dbMod;
      const db = state.firebase.db;

      await runTransaction(db, async (transaction) => {
        const targetRef = doc(db, "profiles", profile.handle);
        const targetSnap = await transaction.get(targetRef);
        if (targetSnap.exists() && targetSnap.data().uid !== state.user.uid) {
          throw new Error("That handle is already taken. Try another one.");
        }

        if (oldHandle && oldHandle !== profile.handle) {
          const oldRef = doc(db, "profiles", oldHandle);
          const oldSnap = await transaction.get(oldRef);
          if (oldSnap.exists() && oldSnap.data().uid === state.user.uid) transaction.delete(oldRef);
        }

        transaction.set(targetRef, { ...profile, updatedAt: serverTimestamp() });
        transaction.set(doc(db, "users", state.user.uid), {
          handle: profile.handle,
          updatedAt: serverTimestamp()
        });
      });
    } else {
      safeSet(`tapfolio:profile:${profile.handle}`, JSON.stringify(profile));
      safeSet("tapfolio:demoHandle", profile.handle);
    }

    state.profile = profile;
    markClean();
    renderPreview();
    updateProfileUrl();
    showToast("Profile saved. Your page is ready to share!", "success");
  } catch (error) {
    showToast(error?.message || "Could not save your profile.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span aria-hidden="true">✓</span> Save changes';
  }
}

/* ------------------------------------------------------------------ */
/* Routing                                                              */
/* ------------------------------------------------------------------ */

function getBasePath() {
  const path = location.pathname;
  const uIndex = path.indexOf("/u/");
  if (uIndex !== -1) return path.slice(0, uIndex).replace(/\/$/, "");
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length).replace(/\/$/, "");
  return path.replace(/\/$/, "");
}

function getProfileUrl(handle) {
  const base = getBasePath();
  return `${location.origin}${base}/u/${encodeURIComponent(handle || "creator")}`;
}

function currentProfileUrl() {
  const handle = state.viewHandle || state.profile?.handle || "shinjuu";
  return getProfileUrl(handle);
}

function parseRoute() {
  const params = new URLSearchParams(location.search);
  const match = location.pathname.match(/\/u\/([^/]+)\/?$/);
  const rawHandle = match ? decodeURIComponent(match[1]) : params.get("u");
  if (rawHandle) return { name: "profile", handle: slugify(rawHandle) || rawHandle.toLowerCase() };
  if (params.get("app") === "1") return { name: "dashboard" };
  return { name: "landing" };
}

function navigate(kind, handle) {
  const base = getBasePath();
  let url = `${base}/`;
  if (kind === "profile") url = `${base}/u/${encodeURIComponent(handle || "creator")}`;
  if (kind === "dashboard") url = `${base}/?app=1`;
  history.pushState({}, "", url);
  handleRoute();
}

async function handleRoute() {
  const token = ++state.routeToken;
  const route = parseRoute();
  state.route = route.name;
  document.body.dataset.view = route.name;
  if (route.name !== "profile") {
    state.viewHandle = null;
    state.viewProfile = null;
  }

  $("#landingView").classList.toggle("hidden", route.name !== "landing");
  $("#dashboardView").classList.toggle("hidden", route.name !== "dashboard");
  $("#profileView").classList.toggle("hidden", route.name !== "profile");
  updateHeaderAuth();

  if (route.name === "landing") {
    renderLanding();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    return;
  }

  if (route.name === "profile") {
    await renderProfileRoute(route.handle, token);
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  await showDashboard();
}

function updateHeaderAuth() {
  const button = $("#headerAuthBtn");
  if (!button) return;
  if (state.user) {
    button.textContent = state.user.demo ? "Demo mode" : "Dashboard";
  } else {
    button.textContent = "Sign in";
  }
}

function renderLanding() {
  const label = state.user
    ? '<span aria-hidden="true">✦</span> Open dashboard'
    : '<span aria-hidden="true">✦</span> Create your Tapfolio';
  $$('[data-action="start"]').forEach((button) => { button.innerHTML = label; });
}

async function showDashboard(force = false) {
  if (!state.user) {
    navigate("landing");
    openAuth();
    return;
  }

  if (force || !state.profile || state.profile.uid !== state.user.uid) {
    state.profile = await loadOwnProfile();
  }

  state.profile = normalizeProfile(state.profile);
  populateEditor();
  renderLinkList();
  renderPreview();
  updateProfileUrl();
  markClean();

  $("#dashUserChip").textContent = state.user.demo
    ? `Demo mode · ${state.user.email}`
    : `Signed in as ${state.user.email || state.user.name}`;
  $("#demoHint").textContent = state.mode === "demo"
    ? "Demo mode saves in this browser only. Connect Firebase to sync across devices."
    : "Your changes sync to Firebase when you save.";
}

async function renderProfileRoute(handle, token) {
  state.viewHandle = handle;
  state.viewProfile = null;
  $("#profileRoot").innerHTML = '<div class="profile-shell"><div class="profile-card"><p style="text-align:center;color:#9aa3bd">Loading profile…</p></div></div>';

  const profile = await loadPublicProfile(handle);
  if (token !== state.routeToken) return;

  if (!profile) {
    renderNotFound(handle);
    return;
  }

  state.viewProfile = profile;
  const isOwner = !!state.user && profile.uid === state.user.uid;
  $("#profileRoot").innerHTML = "";
  renderProfile(profile, $("#profileRoot"), { isOwner, preview: false });
}

function renderNotFound(handle) {
  $("#profileRoot").innerHTML = `
    <div class="profile-shell" style="--accent:#7c5cff" data-theme="midnight">
      <div class="profile-card profile-not-found">
        <div class="profile-bg"></div>
        <div class="avatar-fallback" style="margin:0 auto;width:70px;height:70px;font-size:28px">?</div>
        <h1 class="profile-name">No Tapfolio here yet</h1>
        <p>Nobody has claimed <strong>/u/${escapeHtml(handle)}</strong>. Create your own page and claim a handle.</p>
        <div class="profile-links">
          <button class="profile-link" type="button" data-action="start"><span class="link-icon" style="--icon-bg:#7c5cff">✦</span><span class="link-label">Create your Tapfolio</span><span class="link-arrow">↗</span></button>
          <button class="profile-link" type="button" data-action="open-sample"><span class="link-icon" style="--icon-bg:#22d3ee">◆</span><span class="link-label">See the sample profile</span><span class="link-arrow">↗</span></button>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Profile rendering                                                    */
/* ------------------------------------------------------------------ */

function renderProfile(input, host, options = {}) {
  const profile = normalizeProfile(input);
  const activeLinks = profile.links.filter((link) => link.active);
  const initials = getInitials(profile.name);
  const away = /break|not available|learning/i.test(profile.status || "");
  const avatar = profile.avatar
    ? `<img class="avatar" src="${escapeAttr(profile.avatar)}" alt="${escapeAttr(profile.name)}" data-avatar />`
    : "";

  const linksHtml = activeLinks.length
    ? activeLinks.map((link, index) => {
        const meta = platformMeta(link.platform);
        return `
        <a class="profile-link" href="${escapeAttr(linkHref(link))}" target="_blank" rel="noopener noreferrer" style="animation-delay:${index * 45}ms">
          <span class="link-icon" style="--icon-bg:${escapeAttr(meta.color)}">${escapeHtml(meta.icon)}</span>
          <span class="link-label">${escapeHtml(link.title || meta.label)}</span>
          <span class="link-arrow" aria-hidden="true">↗</span>
        </a>`;
      }).join("")
    : '<div class="link-empty">Add a link from the editor to get started.</div>';

  const ownerBar = options.isOwner
    ? `<div class="owner-bar">
        <button class="btn btn-primary btn-sm" type="button" data-action="edit">✎ Edit profile</button>
        <button class="btn btn-glass btn-sm" type="button" data-action="qr">▦ QR code</button>
        <button class="btn btn-glass btn-sm" type="button" data-action="nfc">⚡ Write NFC</button>
       </div>`
    : "";

  const actions = options.preview
    ? ""
    : `<div class="profile-actions">
        <button class="btn" type="button" data-action="vcf">◍ Save contact</button>
        <button class="btn" type="button" data-action="share">⇪ Share</button>
        <button class="btn" type="button" data-action="qr">▦ QR</button>
       </div>`;

  const badge = profile.showBadge
    ? `<div class="profile-footer">Made with <strong>tapfolio.</strong> <span aria-hidden="true">·</span> <span>/u/${escapeHtml(profile.handle)}</span></div>`
    : "";

  host.innerHTML = `
    ${ownerBar}
    <div class="profile-shell profile-button-${profile.buttonStyle}" style="--accent:${escapeAttr(profile.accent)}" data-theme="${escapeAttr(profile.theme)}">
      <article class="profile-card">
        <div class="profile-bg"></div>
        <header class="profile-head">
          <div class="avatar-wrap">
            ${avatar}
            <div class="avatar-fallback">${escapeHtml(initials)}</div>
          </div>
          <span class="status-pill ${away ? "away" : ""}"><i aria-hidden="true"></i>${escapeHtml(profile.status)}</span>
          <h1 class="profile-name">${escapeHtml(profile.name)}</h1>
          <p class="profile-headline">${escapeHtml(profile.headline)}</p>
          <p class="profile-bio">${escapeHtml(profile.bio)}</p>
          <div class="profile-meta">
            ${profile.location ? `<span>⌖ ${escapeHtml(profile.location)}</span>` : ""}
            <span>◉ /u/${escapeHtml(profile.handle)}</span>
          </div>
        </header>
        <div class="profile-links">${linksHtml}</div>
        ${actions}
        ${badge}
      </article>
    </div>`;

  host.querySelectorAll("[data-avatar]").forEach((img) => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
  attachTilt(host.querySelectorAll(".profile-card"));
}

function attachTilt(cards) {
  cards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${-y * 3.5}deg) rotateY(${x * 3.5}deg)`;
    });
    card.addEventListener("pointerleave", () => { card.style.transform = ""; });
  });
}

/* ------------------------------------------------------------------ */
/* Editor                                                               */
/* ------------------------------------------------------------------ */

function populateSelects() {
  $("#statusSelect").innerHTML = STATUSES.map((status) => `<option value="${escapeAttr(status)}">${escapeHtml(status)}</option>`).join("");
  $("#themeSelect").innerHTML = THEMES.map((theme) => `<option value="${escapeAttr(theme.id)}">${escapeHtml(theme.label)}</option>`).join("");
  $("#accentPresets").innerHTML = ACCENT_PRESETS.map((color) =>
    `<button class="preset-swatch" type="button" data-accent="${escapeAttr(color)}" style="background:${escapeAttr(color)}" aria-label="Use ${escapeAttr(color)}"></button>`
  ).join("");
}

function populateEditor() {
  const p = state.profile;
  $("#avatarInput").value = p.avatar || "";
  $("#nameInput").value = p.name || "";
  $("#handleInput").value = p.handle || "";
  $("#headlineInput").value = p.headline || "";
  $("#bioInput").value = p.bio || "";
  $("#locationInput").value = p.location || "";
  $("#statusSelect").value = p.status || STATUSES[0];
  $("#themeSelect").value = p.theme || "aurora";
  $("#buttonStyleSelect").value = p.buttonStyle || "pill";
  $("#accentInput").value = p.accent || "#7c5cff";
  $("#accentValue").textContent = p.accent || "#7c5cff";
  $("#badgeToggle").checked = p.showBadge !== false;
  $$("#accentPresets .preset-swatch").forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.accent.toLowerCase() === (p.accent || "").toLowerCase());
  });
}

function syncProfileFromForm() {
  if (!state.profile) state.profile = createDefaultProfile(state.user || { name: "Creator" }, "creator");
  const p = state.profile;
  p.avatar = $("#avatarInput").value.trim();
  p.name = $("#nameInput").value;
  p.handle = slugify($("#handleInput").value);
  p.headline = $("#headlineInput").value;
  p.bio = $("#bioInput").value;
  p.location = $("#locationInput").value;
  p.status = $("#statusSelect").value;
  p.theme = $("#themeSelect").value;
  p.buttonStyle = $("#buttonStyleSelect").value;
  p.accent = $("#accentInput").value;
  p.showBadge = $("#badgeToggle").checked;
  state.profile = normalizeProfile(p);
}

function markDirty() {
  state.dirty = true;
  const el = $("#saveState");
  el.textContent = "Unsaved changes";
  el.classList.add("dirty");
}

function markClean() {
  state.dirty = false;
  const el = $("#saveState");
  el.textContent = state.mode === "demo" ? "Saved in browser" : "All changes saved";
  el.classList.remove("dirty");
}

function updateProfileUrl() {
  const handle = state.profile?.handle || "creator";
  $("#profileUrlInput").value = getProfileUrl(handle);
}

function renderPreview() {
  if (!state.profile) return;
  renderProfile(state.profile, $("#previewRoot"), { preview: true });
}

function bindEditorEvents() {
  const textFields = {
    avatarInput: "avatar",
    nameInput: "name",
    headlineInput: "headline",
    bioInput: "bio",
    locationInput: "location"
  };

  Object.entries(textFields).forEach(([id, key]) => {
    const el = $("#" + id);
    el.addEventListener("input", () => {
      if (!state.profile) return;
      state.profile[key] = el.value;
      syncProfileFromForm();
      markDirty();
      renderPreview();
    });
  });

  $("#handleInput").addEventListener("input", (event) => {
    event.target.value = slugify(event.target.value);
    syncProfileFromForm();
    markDirty();
    renderPreview();
    updateProfileUrl();
  });

  ["statusSelect", "themeSelect", "buttonStyleSelect"].forEach((id) => {
    $("#" + id).addEventListener("change", () => {
      syncProfileFromForm();
      markDirty();
      renderPreview();
    });
  });

  $("#accentInput").addEventListener("input", (event) => {
    $("#accentValue").textContent = event.target.value;
    syncProfileFromForm();
    markDirty();
    renderPreview();
  });

  $("#badgeToggle").addEventListener("change", () => {
    syncProfileFromForm();
    markDirty();
    renderPreview();
  });

  $("#accentPresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-accent]");
    if (!button) return;
    $("#accentInput").value = button.dataset.accent;
    $("#accentValue").textContent = button.dataset.accent;
    $$("#accentPresets .preset-swatch").forEach((swatch) => swatch.classList.toggle("active", swatch === button));
    syncProfileFromForm();
    markDirty();
    renderPreview();
  });

  $("#addLinkBtn").addEventListener("click", () => {
    if (!state.profile) return;
    state.profile.links.push({
      id: makeId(),
      platform: "website",
      title: "",
      url: "",
      active: true
    });
    renderLinkList();
    renderPreview();
    markDirty();
    const rows = $$(".link-row", $("#linkList"));
    rows[rows.length - 1]?.querySelector(".link-title")?.focus();
  });

  bindLinkListEvents();
}

function platformOptions(selected) {
  return PLATFORMS.map((platform) =>
    `<option value="${escapeAttr(platform.id)}" ${platform.id === selected ? "selected" : ""}>${escapeHtml(platform.label)}</option>`
  ).join("");
}

function renderLinkList() {
  const list = $("#linkList");
  if (!state.profile || !state.profile.links.length) {
    list.innerHTML = '<div class="link-empty">No links yet. Add your first one below.</div>';
    return;
  }

  list.innerHTML = state.profile.links.map((link) => {
    const meta = platformMeta(link.platform);
    return `
      <div class="link-row ${link.active ? "" : "inactive"}" draggable="true" data-link-id="${escapeAttr(link.id)}">
        <div class="link-drag">
          <span class="link-grip" title="Drag to reorder" aria-hidden="true">⋮⋮</span>
          <span class="link-move">
            <button type="button" data-link-action="up" aria-label="Move link up">▲</button>
            <button type="button" data-link-action="down" aria-label="Move link down">▼</button>
          </span>
        </div>
        <select class="link-platform" aria-label="Link platform">${platformOptions(link.platform)}</select>
        <input class="link-title" type="text" maxlength="80" value="${escapeAttr(link.title)}" placeholder="Title" aria-label="Link title" />
        <input class="link-url" type="text" maxlength="500" value="${escapeAttr(link.url)}" placeholder="${escapeAttr(meta.label)} URL" aria-label="Link URL" />
        <button class="link-toggle ${link.active ? "on" : ""}" type="button" data-link-action="toggle" aria-label="${link.active ? "Hide" : "Show"} link" title="Show/hide">${link.active ? "✓" : "○"}</button>
        <button class="link-del" type="button" data-link-action="delete" aria-label="Delete link" title="Delete">×</button>
      </div>`;
  }).join("");
}

function getLink(id) {
  return state.profile?.links.find((link) => link.id === id);
}

function bindLinkListEvents() {
  const list = $("#linkList");
  let draggingId = null;

  list.addEventListener("input", (event) => {
    const row = event.target.closest(".link-row");
    if (!row) return;
    const link = getLink(row.dataset.linkId);
    if (!link) return;
    if (event.target.matches(".link-title")) link.title = event.target.value;
    if (event.target.matches(".link-url")) link.url = event.target.value;
    markDirty();
    renderPreview();
  });

  list.addEventListener("change", (event) => {
    if (!event.target.matches(".link-platform")) return;
    const row = event.target.closest(".link-row");
    const link = row && getLink(row.dataset.linkId);
    if (!link) return;
    link.platform = event.target.value;
    if (!link.title) link.title = platformMeta(link.platform).label;
    renderLinkList();
    renderPreview();
    markDirty();
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-link-action]");
    if (!button) return;
    const row = button.closest(".link-row");
    const link = row && getLink(row.dataset.linkId);
    if (!link) return;
    const action = button.dataset.linkAction;
    const links = state.profile.links;
    const index = links.indexOf(link);

    if (action === "toggle") link.active = !link.active;
    if (action === "delete") links.splice(index, 1);
    if (action === "up" && index > 0) [links[index - 1], links[index]] = [links[index], links[index - 1]];
    if (action === "down" && index < links.length - 1) [links[index + 1], links[index]] = [links[index], links[index + 1]];

    renderLinkList();
    renderPreview();
    markDirty();
  });

  list.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".link-row");
    if (!row) return;
    draggingId = row.dataset.linkId;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggingId);
  });

  list.addEventListener("dragover", (event) => {
    event.preventDefault();
    const row = event.target.closest(".link-row");
    if (row && row.dataset.linkId !== draggingId) row.classList.add("drag-over");
  });

  list.addEventListener("dragleave", (event) => {
    const row = event.target.closest(".link-row");
    if (row) row.classList.remove("drag-over");
  });

  list.addEventListener("drop", (event) => {
    event.preventDefault();
    const targetRow = event.target.closest(".link-row");
    if (!draggingId || !targetRow || !state.profile) return;
    const links = state.profile.links;
    const from = links.findIndex((link) => link.id === draggingId);
    const to = links.findIndex((link) => link.id === targetRow.dataset.linkId);
    if (from !== -1 && to !== -1 && from !== to) {
      const [moved] = links.splice(from, 1);
      links.splice(to, 0, moved);
      renderLinkList();
      renderPreview();
      markDirty();
    }
    draggingId = null;
  });

  list.addEventListener("dragend", () => {
    draggingId = null;
    $$(".link-row", list).forEach((row) => row.classList.remove("dragging", "drag-over"));
  });
}

/* ------------------------------------------------------------------ */
/* Actions, dialogs, sharing                                            */
/* ------------------------------------------------------------------ */

function bindStaticEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest(".preview-root .profile-link")) {
      event.preventDefault();
      showToast("This is a preview — save and open your public link to visit it.");
      return;
    }

    const trigger = event.target.closest("[data-action]");
    if (!trigger) return;
    handleAction(trigger.dataset.action, trigger, event);
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  $$("dialog.modal").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    safeSet("tapfolio:theme", next);
    $("#themeToggleIcon").textContent = next === "dark" ? "◐" : "☀";
  });

  window.addEventListener("popstate", () => handleRoute());
}

async function handleAction(action, trigger, event) {
  switch (action) {
    case "header-auth":
    case "start":
      if (state.user) navigate("dashboard");
      else openAuth();
      break;
    case "google-signin":
      await signInWithGoogle();
      break;
    case "demo-signin":
      startDemo();
      break;
    case "signout":
      await signOut();
      break;
    case "save":
      await saveProfile();
      break;
    case "home":
      closeDialog($("#authDialog"));
      closeDialog($("#actionDialog"));
      navigate("landing");
      break;
    case "open-sample":
      navigate("profile", "shinjuu");
      break;
    case "open-profile":
      navigate("profile", state.profile?.handle || "shinjuu");
      break;
    case "edit":
      navigate("dashboard");
      break;
    case "copy-url":
      await copyText(currentProfileUrl());
      break;
    case "share":
      await shareProfile();
      break;
    case "qr":
      openQrDialog(currentProfileUrl());
      break;
    case "nfc":
      openNfcDialog(currentProfileUrl());
      break;
    case "write-nfc":
      await writeNfc(state.actionUrl || currentProfileUrl());
      break;
    case "open-qr-from-nfc":
      closeDialog($("#actionDialog"));
      openQrDialog(state.actionUrl || currentProfileUrl());
      break;
    case "download-qr":
      downloadQr();
      break;
    case "vcf":
      downloadVCard();
      break;
    default:
      break;
  }
}

function openAuth() {
  const note = isFirebaseConfigured
    ? "Secure sign-in is powered by Firebase Authentication."
    : "Firebase keys aren't connected yet. Demo mode works now; follow README.md to enable real Google sign-up and cloud syncing.";
  $("#authNote").textContent = note;
  if (!$("#authDialog").open) $("#authDialog").showModal();
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function openQrDialog(url) {
  state.actionUrl = url;
  const body = $("#actionDialogBody");
  body.innerHTML = `
    <div class="dialog-icon" aria-hidden="true">▦</div>
    <h2 id="actionDialogTitle">Scan to open</h2>
    <p class="modal-subtitle">Print this code on your card, or save it as an image.</p>
    <div class="dialog-url"><input type="text" readonly value="${escapeAttr(url)}" /><button class="icon-btn" type="button" data-action="copy-url" aria-label="Copy link">⧉</button></div>
    <div class="qr-host" id="qrHost"></div>
    <div class="dialog-actions">
      <button class="btn btn-primary" type="button" data-action="download-qr">↓ Download QR</button>
      <button class="btn btn-glass" type="button" data-action="copy-url">⧉ Copy link</button>
    </div>`;

  const dialog = $("#actionDialog");
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => generateQr($("#qrHost"), url));
}

function generateQr(host, url) {
  if (!host) return;
  host.innerHTML = "";
  if (!window.QRCode) {
    host.innerHTML = "<p style='padding:20px;color:#111'>QR library unavailable. Copy the link instead.</p>";
    return;
  }
  try {
    new window.QRCode(host, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#0b0e1c",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });
  } catch (error) {
    host.innerHTML = "<p style='padding:20px;color:#111'>Could not generate QR. Copy the link instead.</p>";
  }
}

function openNfcDialog(url) {
  state.actionUrl = url;
  const supported = "NDEFReader" in window && window.isSecureContext;
  const body = $("#actionDialogBody");
  body.innerHTML = `
    <div class="dialog-icon" aria-hidden="true">⚡</div>
    <h2 id="actionDialogTitle">Write to an NFC tag</h2>
    <p class="modal-subtitle">The tag will open this exact URL when tapped by a phone.</p>
    <span class="support-badge ${supported ? "" : "no"}">${supported ? "● Web NFC available on this device" : "○ Web NFC unavailable here"}</span>
    <div class="dialog-url"><input type="text" readonly value="${escapeAttr(url)}" /><button class="icon-btn" type="button" data-action="copy-url" aria-label="Copy link">⧉</button></div>
    ${supported
      ? `<button class="btn btn-primary full" type="button" data-action="write-nfc">⚡ Hold tag near device to write</button>`
      : `<ul class="dialog-list">
          <li><strong>iPhone:</strong> install NFC Tools or NXP TagWriter, choose “Add record → URL”, paste the link above, then write the tag.</li>
          <li><strong>Android without Web NFC:</strong> use the same tag-writer apps.</li>
          <li>Use a rewritable NTAG213/215/216 tag. Web NFC needs Chrome on Android over HTTPS.</li>
        </ul>`}
    <div class="dialog-actions">
      <button class="btn btn-glass" type="button" data-action="copy-url">⧉ Copy URL</button>
      <button class="btn btn-glass" type="button" data-action="open-qr-from-nfc">▦ Use QR instead</button>
    </div>`;

  const dialog = $("#actionDialog");
  if (!dialog.open) dialog.showModal();
}

async function writeNfc(url) {
  if (!("NDEFReader" in window)) {
    showToast("Web NFC isn't supported in this browser. Use the QR code or a tag-writer app.", "error");
    return;
  }
  try {
    const reader = new NDEFReader();
    await reader.write({
      records: [{ recordType: "url", data: url }]
    });
    closeDialog($("#actionDialog"));
    showToast("Tag written! Tap it with any phone to open your profile.", "success");
  } catch (error) {
    if (error?.name === "NotAllowedError") showToast("NFC permission was denied.", "error");
    else if (error?.name === "AbortError") showToast("NFC write was cancelled.", "error");
    else showToast(error?.message || "Could not write the NFC tag.", "error");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Link copied to clipboard.", "success");
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    showToast(ok ? "Link copied to clipboard." : "Could not copy. Select the link manually.", ok ? "success" : "error");
    return ok;
  }
}

async function shareProfile() {
  const url = currentProfileUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: `${state.profile?.name || "Tapfolio"} on Tapfolio`, text: "One tap to my world.", url });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await copyText(url);
}

function downloadVCard() {
  const profile = state.route === "profile" && state.viewProfile ? state.viewProfile : state.profile;
  if (!profile) return;

  const clean = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const emailLink = profile.links.find((link) => link.platform === "email" && link.active);
  const phoneLink = profile.links.find((link) => link.platform === "phone" && link.active);
  const webLink = profile.links.find((link) => ["website", "portfolio"].includes(link.platform) && link.active);

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${clean(profile.name)}`,
    `TITLE:${clean(profile.headline)}`,
    `NOTE:${clean(profile.bio)}`,
    profile.location ? `ADR:;;${clean(profile.location)};;;;` : "",
    emailLink ? `EMAIL;TYPE=INTERNET:${clean(emailLink.url)}` : "",
    phoneLink ? `TEL;TYPE=CELL:${clean(phoneLink.url)}` : "",
    webLink ? `URL:${clean(linkHref(webLink))}` : "",
    `URL:${clean(getProfileUrl(profile.handle))}`,
    "END:VCARD"
  ].filter(Boolean);

  downloadBlob(lines.join("\r\n"), `tapfolio-${profile.handle}.vcf`, "text/vcard;charset=utf-8");
  showToast("Contact card downloaded.", "success");
}

function downloadQr() {
  const host = $("#qrHost");
  const canvas = host?.querySelector("canvas");
  const img = host?.querySelector("img");
  const dataUrl = canvas ? canvas.toDataURL("image/png") : img?.src;
  if (!dataUrl) {
    showToast("Could not download this QR code. Try another browser.", "error");
    return;
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `tapfolio-${(state.viewHandle || state.profile?.handle || "profile")}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function validateHandle(handle) {
  if (!handle || handle.length < 3) return "Your handle needs at least 3 characters.";
  if (!/^[a-z0-9_-]+$/.test(handle)) return "Use lowercase letters, numbers, - or _ only.";
  const reserved = new Set(["app", "u", "api", "admin", "www", "assets", "index", "404", "home", "login", "signup"]);
  if (reserved.has(handle)) return "That handle is reserved. Try another one.";
  return null;
}

function suggestedHandle(user) {
  return slugify(user?.name) || slugify(user?.email?.split("@")[0]) || "creator";
}

function getInitials(name) {
  return String(name || "T")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function applyStoredTheme() {
  const theme = safeGet("tapfolio:theme") || "dark";
  document.documentElement.dataset.theme = theme;
  $("#themeToggleIcon").textContent = theme === "dark" ? "◐" : "☀";
}

function showToast(message, kind = "info") {
  const region = $("#toastRegion");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  toast.innerHTML = `<span aria-hidden="true">${kind === "error" ? "!" : kind === "success" ? "✓" : "◉"}</span><span>${escapeHtml(message)}</span>`;
  region.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 260);
  }, 3400);
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
