export const PLATFORMS = [
  { id: "portfolio", label: "Portfolio", icon: "◆", color: "#22d3ee" },
  { id: "website", label: "Website", icon: "↗", color: "#8b5cf6" },
  { id: "github", label: "GitHub", icon: "GH", color: "#30363d" },
  { id: "linkedin", label: "LinkedIn", icon: "in", color: "#0a66c2" },
  { id: "x", label: "X / Twitter", icon: "𝕏", color: "#0f172a" },
  { id: "instagram", label: "Instagram", icon: "◎", color: "#e1306c" },
  { id: "youtube", label: "YouTube", icon: "▶", color: "#ff0033" },
  { id: "tiktok", label: "TikTok", icon: "♪", color: "#111827" },
  { id: "threads", label: "Threads", icon: "@", color: "#111827" },
  { id: "dribbble", label: "Dribbble", icon: "◉", color: "#ea4c89" },
  { id: "behance", label: "Behance", icon: "Bē", color: "#1769ff" },
  { id: "figma", label: "Figma", icon: "◈", color: "#f24e1e" },
  { id: "spotify", label: "Spotify", icon: "♫", color: "#1db954" },
  { id: "discord", label: "Discord", icon: "◜", color: "#5865f2" },
  { id: "medium", label: "Medium", icon: "M", color: "#111827" },
  { id: "email", label: "Email", icon: "✉", color: "#ea4335", scheme: "mailto:" },
  { id: "phone", label: "Phone", icon: "☎", color: "#16a34a", scheme: "tel:" },
  { id: "resume", label: "Resume / CV", icon: "PDF", color: "#f97316" },
  { id: "whatsapp", label: "WhatsApp", icon: "WA", color: "#25d366" },
  { id: "other", label: "Other link", icon: "•", color: "#64748b" }
];

export const THEMES = [
  { id: "aurora", label: "Aurora" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
  { id: "mint", label: "Mint" },
  { id: "grid", label: "Grid" }
];

export const STATUSES = [
  "Open to work",
  "Available for freelance",
  "Building something new",
  "Currently learning",
  "Taking a break",
  "Not available"
];

export const ACCENT_PRESETS = [
  "#7c5cff",
  "#22d3ee",
  "#f43f5e",
  "#22c55e",
  "#f59e0b",
  "#ec4899"
];

export const SAMPLE_PROFILE = {
  uid: "sample-shinjuu",
  handle: "shinjuu",
  name: "Shinjuu",
  headline: "Developer & digital builder",
  bio: "I design and build fast, delightful web experiences. Tap a link to explore the work, or drop me a message.",
  avatar: "",
  location: "Working remotely",
  status: "Open to work",
  accent: "#7c5cff",
  theme: "aurora",
  buttonStyle: "pill",
  showBadge: true,
  sample: true,
  links: [
    { id: "sample-1", platform: "portfolio", title: "Featured work", url: "https://example.com", active: true },
    { id: "sample-2", platform: "github", title: "GitHub", url: "https://github.com/your-handle", active: true },
    { id: "sample-3", platform: "linkedin", title: "LinkedIn", url: "https://www.linkedin.com/in/your-handle", active: true },
    { id: "sample-4", platform: "email", title: "Email Shinjuu", url: "fsociety.shinjuu@gmail.com", active: true },
    { id: "sample-5", platform: "resume", title: "Résumé / CV", url: "https://example.com/resume.pdf", active: false }
  ]
};

export function platformMeta(id) {
  return PLATFORMS.find((item) => item.id === id) || PLATFORMS[PLATFORMS.length - 1];
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30);
}

export function linkHref(link) {
  const meta = platformMeta(link.platform);
  let value = String(link.url || "").trim();
  if (!value) return "#";
  if (meta.scheme) {
    return meta.scheme + value.replace(new RegExp(`^${meta.scheme}`, "i"), "");
  }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return "https://" + value.replace(/^\/+/, "");
}

export function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2, 10);
}

export function createDefaultProfile(user, handle) {
  const name = user?.name || "New Creator";
  return {
    uid: user?.uid || "local-user",
    handle: slugify(handle) || "creator",
    name,
    headline: "Creator · Developer · Maker",
    bio: "Welcome to my Tapfolio. One tap for everything I'm working on.",
    avatar: "",
    location: "",
    status: STATUSES[0],
    accent: "#7c5cff",
    theme: "aurora",
    buttonStyle: "pill",
    showBadge: true,
    links: user?.email
      ? [{ id: makeId(), platform: "email", title: "Email me", url: user.email, active: true }]
      : []
  };
}

export function normalizeProfile(profile) {
  const base = createDefaultProfile({ name: "Creator" }, "creator");
  const merged = { ...base, ...(profile || {}) };
  merged.handle = slugify(merged.handle) || "creator";
  merged.accent = /^#[0-9a-f]{6}$/i.test(merged.accent || "") ? merged.accent : base.accent;
  merged.theme = THEMES.some((theme) => theme.id === merged.theme) ? merged.theme : base.theme;
  merged.buttonStyle = ["pill", "soft", "outline"].includes(merged.buttonStyle) ? merged.buttonStyle : "pill";
  merged.links = Array.isArray(merged.links)
    ? merged.links.filter((link) => link && typeof link === "object").map((link) => ({
        id: link.id || makeId(),
        platform: platformMeta(link.platform).id,
        title: String(link.title || "").slice(0, 80),
        url: String(link.url || "").slice(0, 500),
        active: link.active !== false
      }))
    : [];
  return merged;
}
