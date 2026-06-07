// Harkly AI dashboard — single-page app, vanilla JS, no build step.
// Uses Lucide for icons (loaded from CDN in index.html).

const API = "";
const API_PREFIX = "/api";

// ── Shared Vapi singleton ─────────────────────────────────────────────────────
// Eagerly instantiated at script load — gives WebRTC time to pre-warm before
// the user clicks anything, cutting connection time by ~400-700ms.
let _vapiInstance = null;
let _micPermitted  = false;   // true once getUserMedia has resolved at least once

function getVapi() {
  if (!_vapiInstance) {
    const VapiClass = window.Vapi && (window.Vapi.default || window.Vapi);
    if (VapiClass) _vapiInstance = new VapiClass("bace6e2b-19b8-403f-84aa-7c9b8ae0dea8");
  }
  return _vapiInstance;
}

// Eagerly boot the Vapi singleton so the SDK's WebSocket and STUN pre-warm
// happens before the user's first click.  We do NOT request mic here — that
// must follow a user gesture or browsers silently deny it, giving no benefit.
(function _eagerBoot() {
  getVapi(); // force SDK construction now so it can pre-warm its WebSocket
})();

// ── Safe Vapi call helper ─────────────────────────────────────────────────────
// Skips the mic request when already permitted (saves ~200ms per call), then
// clears ALL existing listeners before registering fresh ones so repeated
// sessions never accumulate duplicate handlers on the shared singleton.
async function startVapiCall(assistantId, overrides, { onStart, onEnd, onSpeechStart, onSpeechEnd, onVolume, onError } = {}) {
  const vapi = getVapi();
  if (!vapi) return null;

  if (!_micPermitted) {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      _micPermitted = true;
    } catch (micErr) {
      console.warn("[Harkly Vapi] Mic permission denied:", micErr.message);
      if (onError) onError(micErr);
      return null;
    }
  }

  try {
    try { vapi.removeAllListeners?.(); } catch (_) {}
    if (onStart)       vapi.on("call-start",  onStart);
    if (onEnd)         vapi.on("call-end",     onEnd);
    if (onSpeechStart) vapi.on("speech-start", onSpeechStart);
    if (onSpeechEnd)   vapi.on("speech-end",   onSpeechEnd);
    if (onVolume)      vapi.on("volume-level", onVolume);
    if (onError)       vapi.on("error",        onError);

    vapi.start(assistantId, overrides || {});
  } catch (err) {
    console.error("[Harkly Vapi] vapi.start() threw:", err);
    if (onError) onError(err);
  }
  return vapi;
}
function stopVapiCall() {
  try { _vapiInstance?.stop(); } catch (_) {}
}
// Hot-swap: stops the running call and immediately starts a fresh one.
// The 120 ms gap lets the SDK cleanly close the peer connection before re-dialling.
async function restartVapiCall(assistantId, overrides, callbacks) {
  try { _vapiInstance?.stop(); } catch (_) {}
  await new Promise(r => setTimeout(r, 120));
  return startVapiCall(assistantId, overrides, callbacks);
}

// ── Harkly AI Vapi production mapping dictionaries ───────────────────────────
// Cartesia voice IDs (used as the 'voice.voiceId' in Vapi assistantOverrides)
const HARKLY_VOICE_MAP = {
  "maya":   "244f6fbf-8afb-47e2-8958-3d1487216a90", // warm, mid-30s female
  "arjun":  "57dcab65-68ac-45a6-8480-6c4c52ec1cd1", // calm, deep male
  "sofia":  "f785af04-229c-4a7c-b71b-f3194c7f08bb", // bright, friendly female
  "daniel": "3b554273-4299-48b9-9aaf-eefd438e3941", // professional male
  "linh":   "a0e99841-438c-4a64-b679-ae501e7d6091", // soft, soothing female
  "emma":   "79a125e8-cd45-4c13-8a67-188112f4dd22", // empathetic female
  "chris":  "2ee87190-8f84-4925-97da-e52547f9462c", // energetic male
};

// Deepgram transcriber language codes (BCP-47 → short code for Vapi/Deepgram)
const HARKLY_LANG_MAP = {
  "English (US)":            "en",
  "English (UK)":            "en-GB",
  "Hindi (हिंदी)":           "hi",
  "Spanish (Español)":       "es",
  "French (Français)":       "fr",
  "Mandarin (普通话)":        "zh",
  "Portuguese (Português)":  "pt",
  "Arabic (العربية)":        "ar",
  "Vietnamese (Tiếng Việt)": "vi",
  "Bengali (বাংলা)":         "bn",
  "Russian (Русский)":       "ru",
  "Japanese (日本語)":        "ja",
  "Korean (한국어)":          "ko",
  "German (Deutsch)":        "de",
  "Italian (Italiano)":      "it",
  "Turkish (Türkçe)":        "tr",
  "Polish (Polski)":         "pl",
  "Dutch (Nederlands)":      "nl",
  "Thai (ภาษาไทย)":          "th",
  "Swahili (Kiswahili)":     "sw",
  "Tagalog (Filipino)":      "fil",
  "Marathi (मराठी)":         "mr",
  "Tamil (தமிழ்)":           "ta",
  "Telugu (తెలుగు)":         "te",
  "Urdu (اردو)":             "ur",
  "Persian (فارسی)":         "fa",
  "Malay (Bahasa Melayu)":   "ms",
  "Ukrainian (Українська)":  "uk",
  "Amharic (አማርኛ)":         "am",
  "Hausa (Hausa)":           "ha",
};

// Deepgram nova-2 only natively supports a subset of languages.
// For the rest, "multi" enables auto-detection. zh must be zh-CN.
// Reference: https://developers.deepgram.com/docs/models-languages-overview
const DEEPGRAM_CODE = {
  "en":    "en",    "en-GB": "en-GB",
  "hi":    "hi",    "es":    "es",     "fr":  "fr",
  "zh":    "zh-CN", "pt":    "pt",     "vi":  "vi",
  "ru":    "ru",    "ja":    "ja",     "ko":  "ko",
  "de":    "de",    "it":    "it",     "tr":  "tr",
  "pl":    "pl",    "nl":    "nl",     "ta":  "ta",
  "ms":    "ms",    "uk":    "uk",     "sv":  "sv",
  // Languages not natively in nova-2 → use multi (auto-detect)
  "ar":    "multi", "bn":    "multi",  "th":  "multi",
  "sw":    "multi", "fil":   "multi",  "mr":  "multi",
  "te":    "multi", "ur":    "multi",  "fa":  "multi",
  "am":    "multi", "ha":    "multi",
};

// System prompt templates keyed by agent-type designation
const HARKLY_PROMPT_MAP = {
  "Dental clinic front desk":    "You are an elite, professional medical receptionist handling clinic inquiries for a dental office. Be concise, warm and help callers book or reschedule appointments efficiently.",
  "Real Estate Agent":           "You are a professional real estate scheduling associate. Guide callers smoothly through booking property viewings and answering listing questions.",
  "Hair salon receptionist":     "You are a friendly hair salon receptionist. Help callers book appointments with their preferred stylist, ask about their hair goals, and confirm timing.",
  "Restaurant host":             "You are a warm and welcoming restaurant host. Help callers make reservations, check availability, and share tonight's specials when asked.",
  "HVAC dispatcher":             "You are a professional HVAC service dispatcher. Determine whether the caller needs an emergency repair or routine maintenance, then schedule the right technician.",
  "Law firm intake":             "You are a professional law firm intake specialist. Collect a brief overview of the caller's matter and route them to the appropriate attorney or schedule a consultation.",
  "professional front desk receptionist": "You are a warm, professional front-desk receptionist. Help callers with scheduling, general enquiries, and routing to the right team member.",
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; };
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const Store = {
  get token() { return localStorage.getItem("oc_token"); },
  set token(v) { v ? localStorage.setItem("oc_token", v) : localStorage.removeItem("oc_token"); },
  get user() { try { return JSON.parse(localStorage.getItem("oc_user") || "null"); } catch { return null; } },
  set user(v) { v ? localStorage.setItem("oc_user", JSON.stringify(v)) : localStorage.removeItem("oc_user"); },
};

function apiPath(path) {
  if (/^https?:\/\//.test(path) || path.startsWith(API_PREFIX) || path === "/health") return API + path;
  return API + API_PREFIX + path;
}

function apiErrorMessage(payload, fallback) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join("; ");
  }
  return detail.message || JSON.stringify(detail);
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Store.token) headers["Authorization"] = `Bearer ${Store.token}`;
  const res = await fetch(apiPath(path), { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && auth) {
    Store.token = null;
    Store.user = null;
    if (location.hash === "#/login" || location.hash === "#/signup") {
      location.hash = "#/";
    }
    throw new Error("Please sign in again");
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = apiErrorMessage(await res.json(), msg); } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Toasts ---
function toast(msg, type = "info") {
  let wrap = $(".toast-wrap");
  if (!wrap) { wrap = h(`<div class="toast-wrap"></div>`); document.body.appendChild(wrap); }
  const icon = type === "success" ? "check-circle-2" : type === "error" ? "alert-circle" : "info";
  const t = h(`<div class="toast ${type}"><i data-lucide="${icon}" class="icon"></i><div>${escapeHtml(msg)}</div></div>`);
  wrap.appendChild(t);
  if (window.lucide) lucide.createIcons({ attrs: { class: "icon" } });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 200); }, 3500);
}

// --- Router ---
const routes = {};
function route(name, fn) { routes[name] = fn; }
function navigate(hash) { location.hash = hash; }

window.addEventListener("hashchange", render);

function parseRoute() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path: "/" + parts.join("/"), parts, params };
}

// --- Icon helper ---
function renderIcons(root) { if (window.lucide) window.lucide.createIcons({ attrs: { class: "icon" }, ...(root ? { context: root } : {}) }); }

// --- Real brand SVGs (no external CDN, embedded inline so they always render) ---
const BRAND_SVG = {
  whatsapp: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#25D366"/><path fill="#fff" d="M22.7 18.5c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2 0 1.3 1 2.6 1.1 2.7.1.2 1.9 2.9 4.6 4.1 2.7 1.1 2.7.7 3.2.7.5 0 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/><path fill="#fff" d="M16 6C10.5 6 6 10.5 6 16c0 1.8.5 3.5 1.4 5L6 27l6.2-1.4c1.4.8 3 1.2 4.7 1.2H17c5.5 0 10-4.5 10-10S21.5 6 16 6zm0 18.4h-.1c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.6.8.9-3.5-.2-.3c-.8-1.4-1.3-2.9-1.3-4.5 0-4.6 3.7-8.4 8.4-8.4 2.2 0 4.3.9 5.9 2.5 1.6 1.6 2.5 3.7 2.5 5.9-.1 4.7-3.9 8.4-8.4 8.4z"/></svg>`,
  gmail: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#4285F4" d="M5 26h4V14L3 9.5V24c0 1.1.9 2 2 2z"/><path fill="#34A853" d="M23 26h4c1.1 0 2-.9 2-2V9.5L23 14z"/><path fill="#FBBC04" d="M23 8v6l6-4.5V7c0-1.6-1.8-2.6-3.2-1.6L23 8z"/><path fill="#EA4335" d="M9 14V8l7 5 7-5v6l-7 5z"/><path fill="#C5221F" d="M3 7v2.5L9 14V8L6.2 5.4C4.8 4.4 3 5.4 3 7z"/></svg>`,
  gcal: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="5" y="5" width="22" height="22" rx="2" fill="#fff"/><path fill="#1A73E8" d="M5 9h22v3H5z"/><path fill="#EA4335" d="M22 5h3v6h-3z"/><path fill="#FBBC04" d="M7 5h3v6H7z"/><text x="16" y="22.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#1A73E8">31</text></svg>`,
  ig: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="igG" cx=".3" cy="1.05" r="1.1"><stop offset="0%" stop-color="#FED576"/><stop offset="26%" stop-color="#F47133"/><stop offset="61%" stop-color="#BC3081"/><stop offset="100%" stop-color="#4C63D2"/></radialGradient></defs><rect x="4" y="4" width="24" height="24" rx="6" fill="url(#igG)"/><circle cx="16" cy="16" r="5.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="22.5" cy="9.5" r="1.4" fill="#fff"/></svg>`,
  phone: `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g class="ph-rings" fill="none" stroke="#0d6efd" stroke-width="1.6" stroke-linecap="round"><path d="M22.5 9.5c1.7 1.2 3 2.9 3.6 4.9"/><path d="M24.5 6.5c2.7 1.6 4.7 4.1 5.5 7.1"/><path d="M26.5 3.5c3.6 2 6.2 5.4 7.2 9.4"/></g><path fill="#0d6efd" d="M11.4 14.5c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V23c0 .6-.4 1-1 1C13.4 24 8 18.6 8 11.4c0-.6.4-1 1-1h2.9c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .7-.2 1l-1.9 2.3z"/></svg>`,
  // Harkly AI AI agent — orange gradient orb with "OC"
  agent: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="ocG" cx=".35" cy=".3" r=".9"><stop offset="0%" stop-color="#ffe39a"/><stop offset="55%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#9a3412"/></radialGradient></defs><circle cx="16" cy="16" r="14" fill="url(#ocG)"/><circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1"/><text x="16" y="20.5" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-size="11" font-weight="800" fill="#fff">OC</text></svg>`,
  // Talking points — sticky note
  text: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="5" y="6" width="22" height="22" rx="3" fill="#fef9c3" stroke="#eab308" stroke-width="1.2"/><path d="M9 12h14M9 16h14M9 20h10" stroke="#854d0e" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  // Upload — cloud + arrow up
  upload: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 22a5 5 0 1 1 1.2-9.85A7 7 0 0 1 24 14a4.5 4.5 0 0 1 0 9H9z" fill="#dbeafe" stroke="#2563eb" stroke-width="1.4"/><path d="M16 13v8M12 17l4-4 4 4" stroke="#1d4ed8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  // Slack
  slack: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="6" y="14" width="6" height="2.5" rx="1.25" fill="#36C5F0"/><rect x="14" y="6" width="2.5" height="6" rx="1.25" fill="#2EB67D"/><rect x="20" y="15.5" width="6" height="2.5" rx="1.25" fill="#ECB22E"/><rect x="15.5" y="20" width="2.5" height="6" rx="1.25" fill="#E01E5A"/><circle cx="11" cy="11" r="2.2" fill="#36C5F0"/><circle cx="21" cy="11" r="2.2" fill="#2EB67D"/><circle cx="21" cy="21" r="2.2" fill="#ECB22E"/><circle cx="11" cy="21" r="2.2" fill="#E01E5A"/></svg>`,
};
function brandSvg(key) { return BRAND_SVG[key] || ""; }

// --- Auth view ---
// --- Landing view (white paper-grid + 3D carousel + parabola footer) ---

const SUBTITLES = [
  "Answers every call in your voice — books, reschedules, and texts you the recap.",
  "Picks up in two seconds, even at 3am, even when you're already on another call.",
  "Drag-and-drop setup in twelve minutes. No code. No phone tree. No missed revenue.",
  "Built for clinics, salons, restaurants and the calls that turn into customers.",
];

// Sticky-note features below the hero title — laid out in a horizontal sequence.
// Each note carries a real, vivid problem the AI solves, in long-form Poppins copy.
// Each arrow uses a different artistic style (loop, zigzag, double-curl, hook).
const HERO_NOTES = [
  {
    title: "Drag-and-drop setup. Live in minutes.",
    body: "Build your autonomous agent visually — no code. Drop integrations, set your tone, hit go. Most agents are on real calls within the hour.",
    arrowStyle: "loop",
  },
  {
    title: "Books appointments automatically",
    body: "Reads your live calendar, offers real slots, confirms the booking mid-call. Zero double-booking, zero back-and-forth.",
    arrowStyle: "zigzag",
  },
  {
    title: "Speaks 30+ languages fluently",
    body: "Detects the caller's language and switches instantly. Sounds human — not robotic. Can even mimic your front-desk voice.",
    arrowStyle: "doublecurl",
  },
  {
    title: "WhatsApp recap after every call",
    body: "Caller name, request, urgency flag, full transcript link — sent to your phone before you even notice the call ended.",
    arrowStyle: "hook",
  },
];

// Integrations shown in the glassmorphic plate under the hero CTA.
const HERO_INTEGRATIONS = [
  { key: "phone",    label: "Phone",            icon: "phone",          tilt: -8,  x: 6,  y: 18, scale: 1.05 },
  { key: "whatsapp", label: "WhatsApp",         icon: "message-circle", tilt: 5,   x: 28, y: 62, scale: 1.15 },
  { key: "ig",       label: "Instagram",        icon: "camera",         tilt: -3,  x: 50, y: 12, scale: 0.95 },
  { key: "gcal",     label: "Google Calendar",  icon: "calendar",       tilt: 7,   x: 72, y: 52, scale: 1.1  },
  { key: "gmail",    label: "Gmail",            icon: "mail",           tilt: -6,  x: 90, y: 22, scale: 0.9  },
];

// 4-tier pricing for the landing billing section.
const LANDING_PLANS = [
  {
    key: "starter", name: "Starter", price: 39, sub: "Solo operators, low call volume",
    features: [
      "AI voice agent in one language",
      "Updates on WhatsApp",
      "1 phone number",
      "1 AI agent",
      "Email support",
    ],
    badge: null,
  },
  {
    key: "growth", name: "Growth", price: 99, sub: "Most busy front desks pick this",
    features: [
      "Multi-language voice agent",
      "Live WhatsApp + email recaps",
      "2 phone numbers",
      "3 AI agents",
      "Google Calendar sync",
      "Priority support",
    ],
    badge: "Most popular",
  },
  {
    key: "scale", name: "Scale", price: 149, sub: "Multi-location, high volume",
    features: [
      "1,000 calls per month",
      "Custom voice clone",
      "WhatsApp + Slack + email recaps",
      "Unlimited numbers",
      "10 AI agents",
      "API + webhooks",
      "Dedicated CSM",
    ],
    badge: null,
  },
  {
    key: "enterprise", name: "Enterprise", price: null, sub: "SOC2, BAA, custom SLAs",
    features: [
      "Unlimited minutes",
      "Unlimited agents",
      "On-prem option",
      "HIPAA / SOC2",
      "White-glove onboarding",
      "24/7 hotline",
    ],
    badge: "Talk to us",
  },
];

// QnA section (better written, no image — pure CSS gradient panel)

// 7 product mockup frames — SVG illustrations as data URIs
function makeFrameSvg(bg, content) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'>
    <rect width='320' height='240' fill='${bg}'/>
    ${content}
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const FRAMES = [
  {
    title: "Drag-and-drop call flow",
    sub: "Build branching conversations on a visual canvas.",
    img: makeFrameSvg('#fafaf7', `
      <rect x='14' y='14' width='90' height='42' rx='8' fill='#ffcd5c'/>
      <text x='59' y='40' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='700' fill='#1a1408'>Greeting</text>
      <rect x='118' y='14' width='90' height='42' rx='8' fill='#fff' stroke='#0d0d0f' stroke-width='1.2'/>
      <text x='163' y='40' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Ask reason</text>
      <rect x='222' y='14' width='84' height='42' rx='8' fill='#fff' stroke='#0d0d0f' stroke-width='1.2' stroke-dasharray='4 3'/>
      <text x='264' y='40' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Branch</text>
      <path d='M104 35 L118 35 M208 35 L222 35' stroke='#0d0d0f' stroke-width='1.4'/>
      <rect x='42' y='90' width='110' height='42' rx='8' fill='#fff' stroke='#0d0d0f' stroke-width='1.2'/>
      <text x='97' y='116' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Book visit</text>
      <rect x='168' y='90' width='110' height='42' rx='8' fill='#fff' stroke='#0d0d0f' stroke-width='1.2'/>
      <text x='223' y='116' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Escalate</text>
      <path d='M264 56 L264 70 L97 70 L97 90 M264 70 L223 70 L223 90' stroke='#0d0d0f' stroke-width='1.2' fill='none' stroke-dasharray='3 3'/>
      <rect x='42' y='160' width='236' height='52' rx='8' fill='#0d0d0f'/>
      <text x='160' y='185' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='700' fill='#ffcd5c'>Send WhatsApp summary</text>
      <text x='160' y='201' text-anchor='middle' font-family='Poppins' font-size='9' fill='#fafaf7' opacity='0.7'>to owner@clinic.com</text>
    `),
  },
  {
    title: "Live call dashboard",
    sub: "Track every call, intent, and outcome in real time.",
    img: makeFrameSvg('#fafaf7', `
      <rect x='14' y='14' width='292' height='52' rx='10' fill='#fff' stroke='#0d0d0f' stroke-width='1' opacity='0.95'/>
      <circle cx='38' cy='40' r='14' fill='#ffcd5c'/>
      <text x='38' y='44' text-anchor='middle' font-family='Poppins' font-size='13' font-weight='700' fill='#1a1408'>24</text>
      <text x='62' y='34' font-family='Poppins' font-size='10' fill='#0d0d0f' opacity='0.55'>CALLS TODAY</text>
      <text x='62' y='52' font-family='Poppins' font-size='13' font-weight='600' fill='#0d0d0f'>+8 vs yesterday</text>
      <rect x='180' y='24' width='70' height='32' rx='8' fill='#0d0d0f'/>
      <text x='215' y='44' text-anchor='middle' font-family='Poppins' font-size='10' font-weight='600' fill='#ffcd5c'>87% booked</text>
      <rect x='258' y='24' width='40' height='32' rx='8' fill='#fff' stroke='#0d0d0f'/>
      <text x='278' y='44' text-anchor='middle' font-family='Poppins' font-size='10' font-weight='600' fill='#0d0d0f'>$2.4k</text>
      <g font-family='Poppins' font-size='10' fill='#0d0d0f'>
        <rect x='14' y='80' width='292' height='34' rx='8' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
        <circle cx='30' cy='97' r='5' fill='#16a34a'/>
        <text x='44' y='100' font-weight='600'>Sarah · booked Tue 10am</text>
        <text x='250' y='100' opacity='0.5'>2m ago</text>
        <rect x='14' y='120' width='292' height='34' rx='8' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
        <circle cx='30' cy='137' r='5' fill='#d97706'/>
        <text x='44' y='140' font-weight='600'>Mike · transferred to staff</text>
        <text x='250' y='140' opacity='0.5'>9m ago</text>
        <rect x='14' y='160' width='292' height='34' rx='8' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
        <circle cx='30' cy='177' r='5' fill='#16a34a'/>
        <text x='44' y='180' font-weight='600'>Linh · question answered</text>
        <text x='250' y='180' opacity='0.5'>14m ago</text>
        <rect x='14' y='200' width='292' height='28' rx='8' fill='#fff5cc'/>
        <text x='30' y='219' font-weight='600' fill='#1a1408'>+ 21 more this morning</text>
      </g>
    `),
  },
  {
    title: "Ringing through",
    sub: "Customers hear your warm, branded greeting in two seconds.",
    img: makeFrameSvg('#0d0d0f', `
      <circle cx='160' cy='115' r='62' fill='none' stroke='#ffcd5c' stroke-width='2' opacity='0.3'/>
      <circle cx='160' cy='115' r='42' fill='none' stroke='#ffcd5c' stroke-width='2' opacity='0.55'/>
      <circle cx='160' cy='115' r='26' fill='#ffcd5c'/>
      <path d='M152 109 q4 -4 8 0 q4 4 8 0 v6 q-4 4 -8 0 q-4 -4 -8 0 z' fill='#1a1408'/>
      <text x='160' y='200' text-anchor='middle' font-family='Poppins' font-size='14' font-weight='700' fill='#fff'>Glow Salon · incoming</text>
      <text x='160' y='220' text-anchor='middle' font-family='Poppins' font-size='10' fill='#fff' opacity='0.55'>+1 (415) 555 · 0142</text>
    `),
  },
  {
    title: "Sounds like your team",
    sub: "Clone your voice in 30 seconds. Patients can't tell.",
    img: makeFrameSvg('#fafaf7', `
      <rect x='30' y='40' width='260' height='160' rx='14' fill='#fff' stroke='#0d0d0f' stroke-width='1'/>
      <text x='50' y='70' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f' opacity='0.55'>VOICE PROFILE</text>
      <text x='50' y='92' font-family='Poppins' font-size='15' font-weight='700' fill='#0d0d0f'>"Maya at Glow Salon"</text>
      <g>
        ${Array.from({length:32}).map((_,i)=>{const h=8+Math.abs(Math.sin(i*0.7))*46;return `<rect x='${50+i*7}' y='${130-h/2}' width='4' height='${h}' rx='2' fill='#0d0d0f' opacity='${0.4+Math.sin(i*0.5)*0.3}'/>`}).join('')}
      </g>
      <rect x='50' y='160' width='90' height='28' rx='14' fill='#0d0d0f'/>
      <text x='95' y='178' text-anchor='middle' font-family='Poppins' font-size='11' font-weight='700' fill='#ffcd5c'>▶ play sample</text>
      <text x='160' y='178' font-family='Poppins' font-size='10' fill='#0d0d0f' opacity='0.6'>0:18 / 0:30</text>
    `),
  },
  {
    title: "WhatsApp summary",
    sub: "Owner gets the recap before the caller hits the parking lot.",
    img: makeFrameSvg('#e6f5e0', `
      <rect x='30' y='30' width='260' height='180' rx='16' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
      <rect x='30' y='30' width='260' height='32' rx='16' fill='#075e54'/>
      <text x='48' y='51' font-family='Poppins' font-size='12' font-weight='700' fill='#fff'>Harkly AI · Summary</text>
      <text x='240' y='51' font-family='Poppins' font-size='10' fill='#fff' opacity='0.7'>now</text>
      <rect x='44' y='78' width='200' height='90' rx='10' fill='#dcf8c6'/>
      <text x='54' y='98' font-family='Poppins' font-size='10' font-weight='700' fill='#1a1408'>Sarah Mehta · 2:14pm</text>
      <text x='54' y='114' font-family='Poppins' font-size='10' fill='#1a1408' opacity='0.85'>Booked: Tue 10am — color</text>
      <text x='54' y='128' font-family='Poppins' font-size='10' fill='#1a1408' opacity='0.85'>Stylist requested: Maya</text>
      <text x='54' y='142' font-family='Poppins' font-size='10' fill='#1a1408' opacity='0.85'>First-time client · referral</text>
      <text x='54' y='158' font-family='Poppins' font-size='10' font-weight='700' fill='#16a34a'>$220 estimated</text>
      <rect x='44' y='180' width='90' height='22' rx='11' fill='#0d0d0f'/>
      <text x='89' y='194' text-anchor='middle' font-family='Poppins' font-size='9' font-weight='700' fill='#ffcd5c'>view recording</text>
    `),
  },
  {
    title: "Smart triage",
    sub: "Urgent calls get flagged. The rest get handled.",
    img: makeFrameSvg('#fff5e0', `
      <rect x='20' y='28' width='280' height='52' rx='12' fill='#fff' stroke='#dc2626' stroke-width='1.5'/>
      <circle cx='44' cy='54' r='10' fill='#dc2626'/>
      <text x='44' y='58' text-anchor='middle' font-family='Poppins' font-size='12' font-weight='800' fill='#fff'>!</text>
      <text x='62' y='50' font-family='Poppins' font-size='11' font-weight='700' fill='#dc2626'>URGENT · chest pain mentioned</text>
      <text x='62' y='66' font-family='Poppins' font-size='10' fill='#0d0d0f' opacity='0.6'>Texted Dr. Lee + 911 protocol shown</text>
      <rect x='20' y='94' width='280' height='40' rx='10' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
      <circle cx='40' cy='114' r='6' fill='#16a34a'/>
      <text x='56' y='117' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Routine: cleaning rebook</text>
      <rect x='20' y='144' width='280' height='40' rx='10' fill='#fff' stroke='#0d0d0f' stroke-opacity='0.1'/>
      <circle cx='40' cy='164' r='6' fill='#16a34a'/>
      <text x='56' y='167' font-family='Poppins' font-size='11' font-weight='600' fill='#0d0d0f'>Routine: insurance question</text>
      <rect x='20' y='194' width='280' height='30' rx='8' fill='#0d0d0f'/>
      <text x='160' y='213' text-anchor='middle' font-family='Poppins' font-size='10' font-weight='700' fill='#ffcd5c'>3 calls handled · 0 missed</text>
    `),
  },
  {
    title: "Twelve-minute setup",
    sub: "Forward your line. Pick a voice. You're live.",
    img: makeFrameSvg('#fafaf7', `
      <text x='30' y='40' font-family='Poppins' font-size='11' font-weight='700' fill='#0d0d0f' opacity='0.55'>SETUP · 3 OF 4</text>
      <rect x='30' y='52' width='260' height='6' rx='3' fill='rgba(15,15,20,0.08)'/>
      <rect x='30' y='52' width='195' height='6' rx='3' fill='#ffcd5c'/>
      <g font-family='Poppins'>
        <rect x='30' y='78' width='260' height='38' rx='10' fill='#16a34a' opacity='0.12'/>
        <text x='44' y='102' font-size='11' font-weight='700' fill='#15803d'>1 · Forward your number</text>
        <text x='270' y='102' text-anchor='end' font-size='14' fill='#15803d'>✓</text>
        <rect x='30' y='124' width='260' height='38' rx='10' fill='#16a34a' opacity='0.12'/>
        <text x='44' y='148' font-size='11' font-weight='700' fill='#15803d'>2 · Pick a voice</text>
        <text x='270' y='148' text-anchor='end' font-size='14' fill='#15803d'>✓</text>
        <rect x='30' y='170' width='260' height='38' rx='10' fill='#fff' stroke='#0d0d0f' stroke-width='1.4'/>
        <text x='44' y='194' font-size='11' font-weight='700' fill='#0d0d0f'>3 · Test a call</text>
        <text x='270' y='194' text-anchor='end' font-size='12' fill='#0d0d0f' opacity='0.5'>↻</text>
      </g>
    `),
  },
];

// Reviews — short, punchy, one specific result per person
const REVIEWS = [
  {
    quote: "Caught 23 missed calls in week one — two became same-day patients. Harkly AI books into my calendar and sends a WhatsApp summary before I've had my first coffee.",
    name: "Dr. Marisol Ruiz",
    place: "Family Physician · Austin, TX",
    img: "https://i.pravatar.cc/120?img=47",
  },
  {
    quote: "Clients book, rebook, and ask pricing without ever realising it's AI. No-show rate dropped 40% in 30 days — that alone paid for the whole year.",
    name: "Jamie Lin",
    place: "Salon Owner · Glow Salon, Brooklyn",
    img: "https://i.pravatar.cc/120?img=32",
  },
  {
    quote: "Real emergencies get escalated instantly; routine jobs book themselves. We captured $6,000 in weekend work we used to lose to voicemail.",
    name: "Andre Thompson",
    place: "HVAC Business Owner · Phoenix, AZ",
    img: "https://i.pravatar.cc/120?img=12",
  },
  {
    quote: "Three-month receptionist vacancy — configured Harkly AI in twelve minutes and saved the full salary. Patient experience scores actually went up.",
    name: "Dr. Priya Nair",
    place: "Practice Manager · Bright Smiles Dental",
    img: "https://i.pravatar.cc/120?img=44",
  },
  {
    quote: "I can't answer mid-job and used to lose every caller to whoever picked up first. Harkly AI recovered 8 booked jobs in my very first month.",
    name: "Mike Hartman",
    place: "Plumber · Hartman Plumbing Co.",
    img: "https://i.pravatar.cc/120?img=15",
  },
  {
    quote: "The agent switches Spanish, Vietnamese, and Mandarin mid-call without missing a beat. Cancellation rate fell from 22% to 6% in two months.",
    name: "Linh Pham",
    place: "Med Spa Director · Lotus Med Spa",
    img: "https://i.pravatar.cc/120?img=49",
  },
  {
    quote: "Pre-screens callers, runs conflict checks, flags urgency — all before the call reaches me. Two partners thought we'd hired a new paralegal.",
    name: "Carla Jensen",
    place: "Attorney · Jensen & Vega Law",
    img: "https://i.pravatar.cc/120?img=28",
  },
  {
    quote: "Takes reservations, reads our live availability, handles every dietary question on autopilot. After-hours bookings tripled in month one.",
    name: "Rohan Shah",
    place: "Restaurant Owner · Marigold Kitchen",
    img: "https://i.pravatar.cc/120?img=8",
  },
  {
    quote: "All 12 locations now have their own AI receptionist with the right hours, staff, and pricing. I know what happened everywhere before my first coffee.",
    name: "Eva Müller",
    place: "Operations Lead · BrightMinds Tutoring",
    img: "https://i.pravatar.cc/120?img=20",
  },
  {
    quote: "Harkly AI pre-screens every caller and flags urgent ones for immediate callback. Client acquisition up 35% in just 60 days.",
    name: "Devin Okafor",
    place: "Solo Attorney · Houston, TX",
    img: "https://i.pravatar.cc/120?img=33",
  },
];

// ── Global voice-preview data (used by dashboard + agent setup) ──────────────
const PREVIEW_VOICES = [
  { id: "maya",   label: "Maya",   sub: "Warm · Mid-30s",     rate: 0.95, pitch: 1.15, gender: "female" },
  { id: "arjun",  label: "Arjun",  sub: "Calm · Deep",        rate: 0.88, pitch: 0.65, gender: "male"   },
  { id: "sofia",  label: "Sofia",  sub: "Bright · Friendly",  rate: 1.08, pitch: 1.35, gender: "female" },
  { id: "daniel", label: "Daniel", sub: "Professional",       rate: 1.00, pitch: 0.90, gender: "male"   },
  { id: "linh",   label: "Linh",   sub: "Soft · Soothing",    rate: 0.85, pitch: 1.05, gender: "female" },
  { id: "emma",   label: "Emma",   sub: "Empathetic",         rate: 0.92, pitch: 1.20, gender: "female" },
  { id: "chris",  label: "Chris",  sub: "Energetic",          rate: 1.05, pitch: 0.85, gender: "male"   },
];
const PREVIEW_LANGS = [
  "English (US)","English (UK)","Hindi (हिंदी)","Spanish (Español)","French (Français)",
  "Mandarin (普通话)","Portuguese (Português)","Arabic (العربية)","Vietnamese (Tiếng Việt)",
  "Bengali (বাংলা)","Russian (Русский)","Japanese (日本語)","Korean (한국어)","German (Deutsch)",
  "Italian (Italiano)","Turkish (Türkçe)","Polish (Polski)","Dutch (Nederlands)","Thai (ภาษาไทย)",
  "Swahili (Kiswahili)","Tagalog (Filipino)","Marathi (मराठी)","Tamil (தமிழ்)","Telugu (తెలుగు)",
  "Urdu (اردو)","Persian (فارسی)","Malay (Bahasa Melayu)","Ukrainian (Українська)",
  "Amharic (አማርኛ)","Hausa (Hausa)",
];
const PREVIEW_LANG_MAP = {
  "English (US)":"en-US","English (UK)":"en-GB","Hindi (हिंदी)":"hi-IN",
  "Spanish (Español)":"es-ES","French (Français)":"fr-FR","Mandarin (普通话)":"zh-CN",
  "Portuguese (Português)":"pt-PT","Arabic (العربية)":"ar-SA","Vietnamese (Tiếng Việt)":"vi-VN",
  "Bengali (বাংলা)":"bn-BD","Russian (Русский)":"ru-RU","Japanese (日本語)":"ja-JP",
  "Korean (한국어)":"ko-KR","German (Deutsch)":"de-DE","Italian (Italiano)":"it-IT",
  "Turkish (Türkçe)":"tr-TR","Polish (Polski)":"pl-PL","Dutch (Nederlands)":"nl-NL",
  "Thai (ภาษาไทย)":"th-TH","Swahili (Kiswahili)":"sw-KE","Tagalog (Filipino)":"fil-PH",
  "Marathi (मराठी)":"mr-IN","Tamil (தமிழ்)":"ta-IN","Telugu (తెలుగు)":"te-IN",
  "Urdu (اردو)":"ur-PK","Persian (فارسی)":"fa-IR","Malay (Bahasa Melayu)":"ms-MY",
  "Ukrainian (Українська)":"uk-UA","Amharic (አማርኛ)":"am-ET","Hausa (Hausa)":"ha-NG",
};

// ── Language-specific opening greetings ───────────────────────────────────────
// Overriding firstMessage forces the agent to open in the target language,
// establishing the correct conversational context from the very first word.
// Without this, the base Vapi assistant's English firstMessage dominates.
const HARKLY_FIRST_MSG = {
  "en":  "Hello! How can I help you today?",
  "en-GB": "Hello! How can I help you today?",
  "hi":  "नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?",
  "es":  "¡Hola! ¿En qué puedo ayudarle hoy?",
  "fr":  "Bonjour! Comment puis-je vous aider aujourd'hui?",
  "zh":  "您好！我今天可以怎么帮您？",
  "pt":  "Olá! Como posso ajudá-lo hoje?",
  "ar":  "مرحباً! كيف يمكنني مساعدتك اليوم؟",
  "vi":  "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?",
  "de":  "Hallo! Wie kann ich Ihnen heute helfen?",
  "ja":  "こんにちは！本日はどのようにお手伝いできますか？",
  "ko":  "안녕하세요! 오늘 어떻게 도와드릴까요?",
  "ru":  "Здравствуйте! Чем могу помочь?",
  "it":  "Ciao! Come posso aiutarti oggi?",
  "tr":  "Merhaba! Bugün size nasıl yardımcı olabilirim?",
  "pl":  "Cześć! Jak mogę ci pomóc?",
  "nl":  "Hallo! Hoe kan ik u helpen?",
  "bn":  "হ্যালো! আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "ta":  "வணக்கம்! இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
  "te":  "నమస్కారం! నేను ఈరోజు మీకు ఎలా సహాయపడగలను?",
  "mr":  "नमस्कार! मी आज तुम्हाला कशी मदत करू शकतो?",
  "ur":  "ہیلو! میں آج آپ کی کیا مدد کر سکتا ہوں؟",
  "fa":  "سلام! امروز چطور می‌توانم کمکتان کنم؟",
  "ms":  "Halo! Bagaimana saya boleh membantu anda hari ini?",
  "uk":  "Привіт! Як я можу вам допомогти сьогодні?",
  "sw":  "Habari! Naweza kukusaidia vipi leo?",
  "fil": "Kumusta! Paano kita matutulungan ngayon?",
  "am":  "ሰላም! ዛሬ እንዴት ልረዳዎ?",
  "ha":  "Sannu! Yaya zan iya taimaka muku yau?",
  "th":  "สวัสดี! วันนี้ฉันช่วยคุณได้อย่างไร?",
};

// ── Shared Vapi override builder ──────────────────────────────────────────────
// Builds a fully valid Vapi assistantOverrides payload.
// KEY REQUIREMENTS for language switching:
//   1. firstMessage     — overrides the base assistant's English greeting (CRITICAL)
//   2. transcriber.language — tells Deepgram which language to expect from the user
//   3. voice.model      — must be "sonic-multilingual" (not sonic-english)
//   4. voice.language   — tells Cartesia which language to synthesise
//   5. Language instruction at TOP of system prompt so the LLM obeys it
function buildVapiOverrides(voice, lang, agentType, agentConfig) {
  const cartesiaId   = HARKLY_VOICE_MAP[voice?.id] || HARKLY_VOICE_MAP["maya"];
  const langCode     = HARKLY_LANG_MAP[lang] || "en";
  const deepgramCode = DEEPGRAM_CODE[langCode] || "multi"; // "multi" = auto-detect
  // Clean language name for the system prompt (strip native script in parens)
  const langName     = (lang || "English").split(" (")[0];

  const promptTemplate = agentType && HARKLY_PROMPT_MAP[agentType]
    ? HARKLY_PROMPT_MAP[agentType]
    : "You are a warm, professional AI receptionist. Be concise and helpful.";

  // Business context from canvas/agent config
  const ctx = agentConfig || {};
  const ctxLines = [];
  if (ctx.business_name)     ctxLines.push(`Business: ${ctx.business_name}`);
  if (ctx.business_info)     ctxLines.push(`About: ${ctx.business_info}`);
  if (ctx.business_hours)    ctxLines.push(`Hours: ${ctx.business_hours}`);
  if (ctx.business_services) ctxLines.push(`Services: ${ctx.business_services}`);
  if (ctx.business_pricing)  ctxLines.push(`Pricing: ${ctx.business_pricing}`);
  if (ctx.business_address)  ctxLines.push(`Address: ${ctx.business_address}`);
  if (ctx.business_faq)      ctxLines.push(`FAQ: ${ctx.business_faq}`);
  if (ctx.calendly_url)      ctxLines.push(`Booking link: ${ctx.calendly_url}`);
  const ctxBlock = ctxLines.length ? `\n\nBUSINESS CONTEXT:\n${ctxLines.join('\n')}` : '';

  // Agentic tools block — tells the LLM exactly what it can do and when to use each tool
  const toolsBlock = `

TOOLS YOU MUST USE PROACTIVELY:
- book_appointment_calendar: Call this whenever a caller wants to schedule, book, or reschedule. Collect customer name, preferred date, preferred time (and email if given). Confirm details before booking.
- check_availability: Call this FIRST when a caller asks about available slots or before confirming a time. Return the slots you receive.
- connect_to_human: Call this if the caller explicitly asks for a human, in emergencies, or if you genuinely cannot help.
- send_summary_whatsapp: Call this at the END of every call — include caller name, their request, booking result, and any follow-up needed.

APPOINTMENT REMINDERS:
- When you book an appointment, always tell the caller they will receive a WhatsApp or email reminder 24 hours before.
- If a caller says they cannot make their appointment, note the cancellation clearly and use send_summary_whatsapp to notify the owner immediately.

NO-SHOW / TECHNICAL ERROR HANDLING:
- If a call drops or a technical error occurs mid-conversation, use send_summary_whatsapp to notify the owner with caller details and what was discussed.
- If a caller confirms an appointment but does not appear (owner reports no-show), the system will auto-send a follow-up message — you can acknowledge this to the caller.

CALL TRANSCRIPT:
- After every call, a concise transcript is automatically sent to the owner via WhatsApp and email. You do not need to mention this unless asked.

RESPONSE STYLE:
- Be concise — 1–2 sentences per turn unless giving directions or reading back booking details.
- Always confirm names, dates, and times by repeating them back before committing.
- Use the caller's name if they gave it.`;

  // Language rule goes FIRST in the prompt — LLMs follow the first instruction most reliably
  const systemPrompt = [
    `[LANGUAGE RULE] You MUST speak and respond ONLY in ${langName}. Every single word of every response must be in ${langName}. Never use English unless ${langName} is English. This rule overrides everything else.`,
    ``,
    promptTemplate,
    ctxBlock,
    toolsBlock,
  ].join("\n");

  // Cartesia custom voice IDs are English-only clones — using them for non-English
  // causes Vapi to reject with "voiceId must be a string / invalid for X language".
  // For non-English we switch to OpenAI TTS which renders any language naturally
  // without needing a language-specific voiceId whitelist.
  const isEnglish = langCode === "en" || langCode === "en-GB";
  const isMaleVoice = ["arjun", "daniel", "chris"].includes(voice?.id);
  const voiceBlock = isEnglish
    ? { provider: "cartesia", model: "sonic-multilingual", voiceId: cartesiaId, language: langCode }
    : { provider: "openai", voiceId: isMaleVoice ? "onyx" : "nova" };

  return {
    backgroundDenoisingEnabled: false,        // Krisp init adds ~2s lag — keep disabled
    firstMessage: HARKLY_FIRST_MSG[langCode] || HARKLY_FIRST_MSG["en"],
    transcriber: {
      provider: "deepgram",
      // nova-2 for natively-supported langs; falls back to "multi" auto-detect for the rest
      model:    deepgramCode === "multi" ? "nova-2-general" : "nova-2",
      language: deepgramCode,
    },
    model: {
      provider: "google",
      model:    "gemini-2.0-flash",           // no thinking overhead → fastest responses
      temperature: 0,                         // deterministic = less compute = lower latency
      messages: [
        { role: "system", content: systemPrompt },
      ],
    },
    voice: voiceBlock,
  };
}
// Variant that takes a BCP-47 code directly (used by the agent setup page).
function buildVapiOverridesFromBcp47(voice, bcp47) {
  const label = Object.keys(PREVIEW_LANG_MAP).find(k => PREVIEW_LANG_MAP[k] === bcp47) || bcp47;
  return buildVapiOverrides(voice, label);
}

// Pre-warm WebRTC — fires silently after mic permission is confirmed.
// Establishes ICE/STUN paths so the next vapi.start() connects in <500 ms
// instead of the 5–10 s it takes when the browser negotiates cold.
async function preWarmWebRTC() {
  try {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    pc.createDataChannel("harkly-prewarm");
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    // Keep the peer connection alive for 6 s so ICE gathering completes,
    // then close it — the gathered candidates are cached by the OS.
    setTimeout(() => { try { pc.close(); } catch (_) {} }, 6000);
  } catch (_) {} // silently ignore — pre-warm is best-effort
}

// Mount a self-contained voice preview into any container element.
// container must have children with data-preview-canvas, data-preview-play, data-preview-lbl,
// data-preview-voice, data-preview-lang attributes.
function mountVoicePreview(container, preselectedLang) {
  const canvas  = container.querySelector("[data-preview-canvas]");
  const playBtn = container.querySelector("[data-preview-play]");
  const lbl     = container.querySelector("[data-preview-lbl]");
  if (!canvas || !playBtn) return {};
  const ctx = canvas.getContext("2d");
  let speaking = false, t = 0, level = 0.1, raf = null, currentPitch = 1.15;
  let selectedVoice = PREVIEW_VOICES[0];
  let selectedLang  = preselectedLang || PREVIEW_LANGS[0];
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = r.width  * dpr;
    canvas.height = r.height * dpr;
  }
  window.addEventListener("resize", resize);

  function drawWave() {
    t += 0.04 * (0.7 + currentPitch * 0.3);
    level += ((speaking ? 0.85 : 0.12) - level) * 0.08;
    const w = canvas.width, h = canvas.height;
    if (!w || !h) { raf = requestAnimationFrame(drawWave); return; }
    ctx.clearRect(0, 0, w, h);
    const bars = 64;
    const bw = w / bars;
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0,   "rgba(255,205,92,0.9)");
    grd.addColorStop(0.5, "rgba(255,138,61,0.95)");
    grd.addColorStop(1,   "rgba(99,102,241,0.85)");
    ctx.fillStyle = grd;
    for (let i = 0; i < bars; i++) {
      const phase = i * 0.35 + t;
      const amp = Math.sin(phase)*0.35 + Math.sin(phase*1.7)*0.35 + Math.sin(phase*0.7)*0.30;
      const a = Math.abs(amp) * level;
      const bh = Math.max(4*dpr, a * h * 0.9 * (0.6 + currentPitch * 0.4));
      const x = i * bw + bw * 0.18;
      const y = (h - bh) / 2;
      ctx.fillRect(x, y, bw * 0.6, bh);
    }
    raf = requestAnimationFrame(drawWave);
  }
  requestAnimationFrame(() => { resize(); drawWave(); });

  container.querySelectorAll("[data-preview-voice]").forEach(b => b.addEventListener("click", () => {
    container.querySelectorAll("[data-preview-voice]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    selectedVoice = PREVIEW_VOICES.find(v => v.id === b.dataset.previewVoice) || PREVIEW_VOICES[0];
    currentPitch  = selectedVoice.pitch;
  }));
  container.querySelectorAll("[data-preview-lang]").forEach(b => b.addEventListener("click", () => {
    container.querySelectorAll("[data-preview-lang]").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    selectedLang = b.dataset.previewLang;
  }));

  const GREETINGS = {
    "hi-IN":"नमस्ते, यहाँ Harkly AI है। मैं आपकी कैसे मदद कर सकता हूँ?",
    "es-ES":"Hola, le habla Harkly AI. ¿En qué le puedo ayudar?",
    "fr-FR":"Bonjour, ici Harkly AI. Comment puis-je vous aider?",
    "zh-CN":"您好，这里是Harkly AI。我可以如何帮助您？",
    "vi-VN":"Xin chào, đây là Harkly AI. Tôi có thể giúp gì cho bạn?",
    "ar-SA":"مرحبا، هذا Harkly AI. كيف يمكنني مساعدتك؟",
    "de-DE":"Hallo, hier ist Harkly AI. Wie kann ich Ihnen helfen?",
    "ja-JP":"こんにちは、Harkly AIです。どのようにお手伝いできますか？",
    "pt-PT":"Olá, aqui é o Harkly AI. Como posso ajudá-lo?",
    "ko-KR":"안녕하세요, Harkly AI입니다. 어떻게 도와드릴까요?",
  };
  const PREVIEW_ASSISTANT_ID = "d5f28a96-25da-4905-bac8-5dee52a15f4e";
  let pvCallActive = false;
  let _pvAgentConfig = null;

  function pvOverrides() {
    return buildVapiOverrides(selectedVoice, selectedLang, null, _pvAgentConfig);
  }

  playBtn.addEventListener("click", () => {
    if (pvCallActive) { stopVapiCall(); return; }
    if (!getVapi()) { toast("Vapi not available — check your connection", "error"); return; }
    lbl.textContent = "Connecting…"; playBtn.disabled = true;
    startVapiCall(PREVIEW_ASSISTANT_ID, pvOverrides(), {
      onStart: () => {
        pvCallActive = true; speaking = true;
        lbl.textContent = "🛑 Stop"; playBtn.classList.add("playing"); playBtn.disabled = false;
      },
      onEnd: () => {
        pvCallActive = false; speaking = false;
        lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); playBtn.disabled = false;
      },
      onSpeechStart: () => { speaking = true; level = 0.88; },
      onSpeechEnd:   () => { speaking = false; level = 0.12; },
      onVolume: (vol) => { level = 0.12 + vol * 0.80; },
      onError: () => {
        pvCallActive = false; speaking = false;
        lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); playBtn.disabled = false;
        toast("Could not connect — please check mic permissions", "error");
      },
    });
  });

  return {
    setVoice(v)         { selectedVoice = v; currentPitch = v.pitch; },
    setLang(l)          { selectedLang  = l; },
    setAgentConfig(cfg) { _pvAgentConfig = cfg || null; },
  };
}

route("auth", async () => {
  const root = h(`
    <div class="landing">
      <!-- NAV -->
      <nav class="lp-nav">
        <div class="lp-brand"><span class="dot"></span>Harkly AI</div>
        <div class="lp-links">
          <a data-scroll="lp-cases">Use cases</a>
          <a data-scroll="lp-try">Try it live</a>
          <a data-scroll="lp-billing">Pricing</a>
        </div>
        <div class="lp-cta">
          <button class="lp-signin" data-open-auth="login">Sign in</button>
          <button class="lp-getstarted" data-open-auth="signup">
            <span>Get started</span><span class="arr">→</span>
          </button>
        </div>
      </nav>

      <!-- HERO -->
      <section class="lp-hero" id="lp-hero">
        <div class="lp-mesh"></div>
        <div class="lp-side-fade lp-side-fade-l"></div>
        <div class="lp-side-fade lp-side-fade-r"></div>

        <!-- 3D glassmorphic floating integration cards with REAL brand logos -->
        <div class="lp-floats" aria-hidden="true">
          <div class="lp-float lp-float-brand" data-k="whatsapp" title="WhatsApp">${brandSvg("whatsapp")}</div>
          <div class="lp-float lp-float-brand" data-k="gcal" title="Google Calendar">${brandSvg("gcal")}</div>
          <div class="lp-float lp-float-brand" data-k="gmail" title="Gmail">${brandSvg("gmail")}</div>
          <div class="lp-float lp-float-brand" data-k="phone" title="Phone — ringing">${brandSvg("phone")}</div>
        </div>

        <div class="lp-hero-inner">
          <span class="lp-eyebrow"><span class="pulse"></span><span>VOICE AI · LIVE 24/7</span></span>
          <h1 class="lp-title lp-title-one">
            <span class="lp-title-line opacity-[1] text-[48px]">Your Phone Rings. <em class="opacity-[1]">Harkly AI</em> Answers.</span>
            <span class="lp-title-line opacity-[1] text-[48px]">Human-Like Voice. <em class="opacity-[1]">Every Call. 24/7.</em></span>
          </h1>
          <div class="lp-sub" id="lp-sub-rotate">
            <span id="lp-sub-text"></span><span class="caret"></span>
          </div>
          <div class="lp-cta-mega-row">
            <div class="lp-cta-with-icons">
              <div class="lp-cta-side-icons">
                <div class="lp-glass-icon-card" data-brand="whatsapp">
                  <div class="lp-gic-shine"></div>
                  <div class="lp-gic-icon">${brandSvg("whatsapp")}</div>
                  <div class="lp-gic-label">WhatsApp</div>
                </div>
                <div class="lp-glass-icon-card" data-brand="gmail">
                  <div class="lp-gic-shine"></div>
                  <div class="lp-gic-icon">${brandSvg("gmail")}</div>
                  <div class="lp-gic-label">Gmail</div>
                </div>
              </div>
              <div class="lp-cta-row">
                <button class="lp-cta-primary" data-open-auth="signup">
                  <span>Get started free</span><span class="arr">→</span>
                </button>
                <button class="lp-cta-secondary" data-scroll="lp-try">Hear it talk →</button>
              </div>
              <div class="lp-cta-side-icons">
                <div class="lp-glass-icon-card" data-brand="gcal">
                  <div class="lp-gic-shine"></div>
                  <div class="lp-gic-icon">${brandSvg("gcal")}</div>
                  <div class="lp-gic-label">Calendar</div>
                </div>
                <div class="lp-glass-icon-card lp-gic-ringing" data-brand="phone">
                  <div class="lp-gic-shine"></div>
                  <div class="lp-gic-icon">${brandSvg("phone")}</div>
                  <div class="lp-gic-label">Calling…</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Glassmorphic plate of integrations (Phone, WhatsApp, IG, GCal, Gmail) -->
          <div class="lp-glass-plate" aria-hidden="true">
            <div class="lp-glass-plate-inner">
              ${HERO_INTEGRATIONS.map(it => `
                <div class="lp-int lp-int-brand" style="left:${it.x}%; top:${it.y}%; transform:translate(-50%,-50%) rotate(${it.tilt}deg) scale(${it.scale})">
                  <div class="lp-int-ic-brand">${brandSvg(it.key)}</div>
                  <div class="lp-int-lbl">${it.label}</div>
                </div>
              `).join("")}
              <div class="lp-glass-shine"></div>
            </div>
          </div>
        </div>

        <!-- Sticky-note SEQUENCE row (4 notes side-by-side BELOW the title) -->
        <div class="lp-notes-row">
          ${HERO_NOTES.map((n, i) => `
            <div class="lp-note lp-note-3d font-thin" data-i="${i}">
              <div class="lp-note-paper"></div>
              <div class="lp-note-tape"></div>
              <div class="lp-note-fold"></div>
              <div class="lp-note-content">
                <div class="lp-note-num">${String(i+1).padStart(2,'0')}</div>
                <div class="lp-note-title">${n.title}</div>
                <div class="lp-note-body">${n.body}</div>
              </div>
            </div>
            ${i < HERO_NOTES.length - 1
              ? `<svg class="lp-note-arr lp-arr-${HERO_NOTES[i].arrowStyle}" viewBox="0 0 120 80" aria-hidden="true">
                  ${arrowSvgPath(HERO_NOTES[i].arrowStyle)}
                </svg>`
              : ''}
          `).join("")}
        </div>
      </section>

      <!-- soft gradient strip -->
      <div class="lp-grad-soft" aria-hidden="true"></div>

      <!-- USE CASES (forward-facing infinite slider) -->
      <section class="lp-cases" id="lp-cases">
        <div class="lp-cases-glow"></div>
        <div class="lp-cases-head">
          <span class="eb">SEE IT IN ACTION</span>
          <h2>One agent. <em>Every part</em> of the call.</h2>
          <p>From the first ring to the WhatsApp summary, all on autopilot.</p>
        </div>
        <div class="lp-slider lp-slider-auto" id="lp-slider">
          <div class="lp-slider-track" id="lp-slider-track"></div>
        </div>
      </section>

      <!-- soft gradient between sections -->
      <div class="lp-grad-soft lp-grad-soft-dark" aria-hidden="true"></div>

      <!-- TRY IT LIVE — real voice bot with mic input, STT, AI response, TTS -->
      <section class="lp-try" id="lp-try">
        <div class="lp-try-head">
          <span class="eb">TALK TO THE AGENT — RIGHT NOW</span>
          <h2>Speak. The AI <em>listens</em> and <em>responds</em>.</h2>
          <p>Tap the mic, allow access, and speak — the agent will hear you in your language and reply with a real AI voice. No signup needed.</p>
        </div>
        <div class="lp-try-card">
          <div class="lp-try-controls">
            <label class="lp-try-field">
              <span>Language</span>
              <select id="lp-try-lang">
                <option>English (US)</option>
                <option>Hindi (हिंदी)</option>
                <option>Spanish (Español)</option>
                <option>French (Français)</option>
                <option>Mandarin (普通话)</option>
                <option>Vietnamese (Tiếng Việt)</option>
                <option>Arabic (العربية)</option>
                <option>Portuguese (Português)</option>
              </select>
            </label>
            <label class="lp-try-field">
              <span>Voice</span>
              <select id="lp-try-voice">
                <option>Maya — warm, mid-30s</option>
                <option>Arjun — calm, deep</option>
                <option>Sofia — bright, friendly</option>
                <option>Daniel — professional</option>
                <option>Linh — soft, soothing</option>
              </select>
            </label>
            <label class="lp-try-field">
              <span>Agent type</span>
              <select id="lp-try-agent">
                <option>Dental clinic front desk</option>
                <option>Hair salon receptionist</option>
                <option>Restaurant host</option>
                <option>HVAC dispatcher</option>
                <option>Law firm intake</option>
              </select>
            </label>
          </div>
          <div class="lp-try-chat" id="lp-try-chat">
            <div class="lp-try-chat-hint" id="lp-try-chat-hint">
              <div class="lp-try-mic-pulse">🎙️</div>
              <p>Tap <strong>Speak to agent</strong> below, allow mic access, and say something. The AI agent will respond in your language with a natural voice.</p>
            </div>
          </div>
          <div class="lp-try-stage" style="height:110px">
            <canvas class="lp-try-wave" id="lp-try-wave"></canvas>
            <div class="lp-try-status" id="lp-try-status">Tap the mic to start the conversation.</div>
          </div>
          <div class="lp-try-actions">
            <button class="lp-try-talk" id="lp-try-talk">
              <span class="lp-try-talk-dot"></span>
              <span id="lp-try-talk-label">🎙️ Speak to agent</span>
            </button>
            <button class="lp-try-secondary" data-open-auth="signup">Build your own — free →</button>
          </div>
        </div>
      </section>

      <!-- REVIEWS (white bg, dots moving down, anime sticky note realistic, avatars) -->
      <section class="lp-reviews" id="lp-reviews">
        <div class="lp-reviews-head">
          <span class="eb">FROM REAL FRONT DESKS</span>
          <h2>Owners are <em>obsessed</em>.</h2>
        </div>
        <div class="lp-track-wrap" id="lp-track-wrap">
          <div class="lp-track" id="lp-track-1"></div>
          <div class="lp-track reverse" id="lp-track-2"></div>
          <div class="lp-track-tip" id="lp-track-tip">Click to pause</div>
        </div>
      </section>

      <!-- soft gradient -->
      <div class="lp-grad-soft" aria-hidden="true"></div>

      <!-- GRADIENT TRANSITION: → billing -->
      <div class="lp-grad-cream" aria-hidden="true"></div>

      <!-- BILLING / PRICING -->
      <section class="lp-billing" id="lp-billing">
        <div class="lp-billing-head">
          <span class="eb">PRICING</span>
          <h2>Pay only for the calls you <em>actually</em> answer.</h2>
          <p>Every plan starts with a <strong>7-day free trial</strong>. No credit card required. Cancel any time.</p>
        </div>
        <div class="lp-plan-grid">
          ${LANDING_PLANS.map(p => `
            <div class="lp-plan ${p.key === 'growth' ? 'featured' : ''}">
              ${p.key === 'growth' ? `
                <div class="lp-plan-popular-wrap">
                  <span class="lp-plan-popular-badge">
                    <span class="lp-popular-dot"></span>Most popular
                  </span>
                </div>` : ""}
              ${p.badge && p.key !== 'growth' ? `<span class="lp-plan-badge">${p.badge}</span>` : ""}
              <div class="lp-plan-name">${p.name}</div>
              <div class="lp-plan-sub">${p.sub}</div>
              <div class="lp-plan-price">
                ${p.price !== null
                  ? `<span class="amt">$${p.price}</span><span class="per">/mo</span>`
                  : `<span class="amt amt-talk">Custom</span>`}
              </div>
              <div class="lp-plan-divider"></div>
              <ul class="lp-plan-feats">
                ${p.features.map(f => `<li><span class="tick">✓</span>${f}</li>`).join("")}
              </ul>
              <button class="lp-plan-cta" data-open-auth="signup">
                ${p.key === 'enterprise' ? "Talk to us" : p.key === 'growth' ? "Start free — it's on us" : "Start free trial"}
              </button>
            </div>`).join("")}
        </div>
      </section>

      <!-- GRADIENT TRANSITION: cream → black footer -->
      <div class="lp-grad-tofoot" aria-hidden="true"></div>

      <!-- FOOTER -->
      <footer class="lp-footer">
        <div class="lp-footer-light"></div>

        <div class="lp-bigword-wrap">
          <div class="lp-bigword" id="lp-bigword" aria-label="HARKLY AI">
            ${"HARKLY AI".split("").map(c => c === " " ? `<span class="ltr ltr-space" aria-hidden="true">&nbsp;</span>` : `<span class="ltr" aria-hidden="true">${c}</span>`).join("")}
          </div>
        </div>

        <div class="lp-footer-tagline">Calls that matter.</div>

        <div class="lp-footer-bottom">
          <span>© 2026 Harkly AI, Inc.</span>
          <span>Made with ♥ for every missed call that wasn't.</span>
        </div>
      </footer>
    </div>`);

  setTimeout(() => {
    initSubtitleRotator(root.querySelector("#lp-sub-text"));
    initFrameSlider(root);
    initReviewTracks(root);
    initParabolaWord(root);
    initLandingNavScroll(root);
    initVoiceTester(root);
    if (window.lucide) lucide.createIcons({ attrs: { class: "icon" } });
  }, 0);

  root.querySelectorAll("[data-open-auth]").forEach(b =>
    b.addEventListener("click", () => openAuthModal(b.dataset.openAuth))
  );

  return root;
});

// SVG path strings for the four arrow art-styles between hero notes.
function arrowSvgPath(style) {
  const stroke = `stroke="rgba(15,15,20,0.55)" stroke-width="2" fill="none" stroke-linecap="round" marker-end="url(#lp-arrtip)"`;
  const head = `<defs><marker id="lp-arrtip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="rgba(15,15,20,0.55)"/></marker></defs>`;
  if (style === "loop") {
    return head + `<path d="M5 40 C 30 5, 50 5, 60 40 C 65 60, 90 60, 110 40" stroke-dasharray="3 5" ${stroke}/>`;
  }
  if (style === "zigzag") {
    return head + `<path d="M5 40 L 35 18 L 60 50 L 90 22 L 110 40" stroke-dasharray="2 4" ${stroke}/>`;
  }
  if (style === "doublecurl") {
    return head + `<path d="M5 40 C 25 12, 45 60, 60 35 C 75 12, 95 60, 110 40" stroke-dasharray="4 3" ${stroke}/>`;
  }
  // hook
  return head + `<path d="M5 40 C 35 40, 60 0, 80 35 C 90 55, 100 50, 110 40" ${stroke}/>`;
}

// Smooth-scroll the in-page nav links.
function initLandingNavScroll(root) {
  root.querySelectorAll("[data-scroll]").forEach(a => {
    a.addEventListener("click", (ev) => {
      const id = a.dataset.scroll;
      const target = root.querySelector(`#${id}`);
      if (!target) return;
      ev.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

// Voice-tester: animated waveform + Web Speech API with proper language + tone switching
const TRY_LANG_MAP = {
  "English (US)":         { code: "en-US", greet: "Hi, this is" },
  "Hindi (हिंदी)":         { code: "hi-IN", greet: "नमस्ते, यह है" },
  "Spanish (Español)":    { code: "es-ES", greet: "Hola, le habla" },
  "French (Français)":    { code: "fr-FR", greet: "Bonjour, ici" },
  "Mandarin (普通话)":    { code: "zh-CN", greet: "您好,这里是" },
  "Vietnamese (Tiếng Việt)": { code: "vi-VN", greet: "Xin chào, đây là" },
  "Arabic (العربية)":     { code: "ar-SA", greet: "مرحبا، هذه" },
  "Portuguese (Português)": { code: "pt-PT", greet: "Olá, fala" },
};
const TRY_VOICE_MAP = {
  "Maya — warm, mid-30s":      { rate: 0.95, pitch: 1.15, gender: "female" },
  "Arjun — calm, deep":        { rate: 0.88, pitch: 0.65, gender: "male" },
  "Sofia — bright, friendly":  { rate: 1.08, pitch: 1.35, gender: "female" },
  "Daniel — professional":     { rate: 1.00, pitch: 0.90, gender: "male" },
  "Linh — soft, soothing":     { rate: 0.85, pitch: 1.05, gender: "female" },
};
const TRY_LINES = {
  "Dental clinic front desk": "Hi, this is City Dental. How can I help you today? I can book a cleaning, look up your insurance, or transfer you to Doctor Patel.",
  "Hair salon receptionist":  "Hello, you've reached Glow Salon, this is Maya. Are you calling to book with your usual stylist, or trying us for the first time?",
  "Restaurant host":          "Good evening, thanks for calling Lumière. Would you like to book a table for tonight, or hear about our new winter tasting menu?",
  "HVAC dispatcher":          "Thanks for calling A and T Heating. Is your heat out right now? I can dispatch a tech, or schedule a tune up — which would you like?",
  "Law firm intake":          "Jensen and Vega Law, this is the intake line. Can you tell me a bit about the matter so I can route you to the right partner?",
};

// Cache voices once they load (Chrome populates voices asynchronously)
let _ttsVoices = [];
function _loadVoices() {
  if (!window.speechSynthesis) return;
  _ttsVoices = window.speechSynthesis.getVoices() || [];
}
if (window.speechSynthesis) {
  _loadVoices();
  window.speechSynthesis.onvoiceschanged = _loadVoices;
}

function pickBestVoice(langCode, gender) {
  if (!_ttsVoices.length) _loadVoices();
  if (!_ttsVoices.length) return null;
  const base = langCode.split("-")[0].toLowerCase();
  const exact = _ttsVoices.filter(v => v.lang && v.lang.toLowerCase() === langCode.toLowerCase());
  const same  = _ttsVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith(base));
  const pool  = exact.length ? exact : (same.length ? same : _ttsVoices);
  // Try gender hint by voice name
  const female = pool.find(v => /female|woman|maya|sofia|linh|aria|samantha|victoria|tessa|fiona|karen|moira|zoe/i.test(v.name));
  const male   = pool.find(v => /male|man|arjun|daniel|alex|david|fred|tom|oliver|aaron|bruce/i.test(v.name));
  if (gender === "female" && female) return female;
  if (gender === "male"   && male)   return male;
  return pool[0];
}

function initVoiceTester(root) {
  const canvas   = root.querySelector("#lp-try-wave");
  const status   = root.querySelector("#lp-try-status");
  const btn      = root.querySelector("#lp-try-talk");
  const lbl      = root.querySelector("#lp-try-talk-label");
  const langSel  = root.querySelector("#lp-try-lang");
  const voiceSel = root.querySelector("#lp-try-voice");
  const agentSel = root.querySelector("#lp-try-agent");
  const chat     = root.querySelector("#lp-try-chat");
  const chatHint = root.querySelector("#lp-try-chat-hint");
  if (!canvas || !btn) return;

  // Re-check Vapi each time — SDK may load async after page paint
  function liveVapi() { return getVapi(); }

  const ctx = canvas.getContext("2d");
  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = r.width  * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
  }
  resize();
  window.addEventListener("resize", resize);

  // Live preview when user changes language or voice dropdown
  if (langSel) langSel.addEventListener("change", () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const langDef  = TRY_LANG_MAP[langSel.value]  || TRY_LANG_MAP["English (US)"];
      const voiceKey = voiceSel ? voiceSel.value : "Maya — warm, mid-30s";
      const voiceDef = TRY_VOICE_MAP[voiceKey] || TRY_VOICE_MAP["Maya — warm, mid-30s"];
      const agentName = voiceKey.split("—")[0].trim();
      const preview   = `${langDef.greet} ${agentName}.`;
      const u = new SpeechSynthesisUtterance(preview);
      const v = pickBestVoice(langDef.code, voiceDef.gender);
      if (v) u.voice = v;
      u.lang  = (v && v.lang) || langDef.code;
      u.rate  = voiceDef.rate;
      u.pitch = voiceDef.pitch;
      window.speechSynthesis.speak(u);
    }
    if (status) status.innerHTML = `Language set to <strong>${escapeHtml(langSel.value)}</strong> — tap the mic to start a live conversation.`;
  });

  if (voiceSel) voiceSel.addEventListener("change", () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const langKey  = langSel ? langSel.value : "English (US)";
      const langDef  = TRY_LANG_MAP[langKey]   || TRY_LANG_MAP["English (US)"];
      const voiceDef = TRY_VOICE_MAP[voiceSel.value] || TRY_VOICE_MAP["Maya — warm, mid-30s"];
      const agentName = voiceSel.value.split("—")[0].trim();
      const preview   = `${langDef.greet} ${agentName}.`;
      const u = new SpeechSynthesisUtterance(preview);
      const v = pickBestVoice(langDef.code, voiceDef.gender);
      if (v) u.voice = v;
      u.lang  = (v && v.lang) || langDef.code;
      u.rate  = voiceDef.rate;
      u.pitch = voiceDef.pitch;
      window.speechSynthesis.speak(u);
    }
    if (status) status.innerHTML = `Voice set to <strong>${escapeHtml(voiceSel.value.split("—")[0].trim())}</strong> — tap the mic to start a live conversation.`;
  });

  let agentSpeaking = false, listening = false, t = 0, level = 0.1, currentPitch = 1;
  (function frame() {
    t += 0.04 * (0.7 + currentPitch * 0.3);
    level += (((agentSpeaking || listening) ? 0.85 : 0.12) - level) * 0.08;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    if (listening) {
      grd.addColorStop(0,   "rgba(99,102,241,0.9)");
      grd.addColorStop(0.5, "rgba(139,92,246,0.95)");
      grd.addColorStop(1,   "rgba(59,130,246,0.85)");
    } else {
      grd.addColorStop(0,   "rgba(255,205,92,0.9)");
      grd.addColorStop(0.5, "rgba(255,138,61,0.95)");
      grd.addColorStop(1,   "rgba(99,102,241,0.85)");
    }
    ctx.fillStyle = grd;
    const bars = 64, bw = w / bars;
    for (let i = 0; i < bars; i++) {
      const phase = i * 0.35 + t;
      const amp   = Math.sin(phase) * 0.35 + Math.sin(phase * 1.7) * 0.35 + Math.sin(phase * 0.7) * 0.30;
      const a     = Math.abs(amp) * level;
      const bh    = Math.max(4 * devicePixelRatio, a * h * 0.9 * (0.6 + currentPitch * 0.4));
      ctx.fillRect(i * bw + bw * 0.18, (h - bh) / 2, bw * 0.6, bh);
    }
    requestAnimationFrame(frame);
  })();

  function addChatMsg(role, text) {
    if (chatHint) chatHint.style.display = "none";
    const el = document.createElement("div");
    el.className = `lp-try-msg lp-try-msg-${role}`;
    el.innerHTML = `<span class="lp-try-msg-who">${role === "user" ? "You" : "Agent"}</span><span class="lp-try-msg-text">${escapeHtml(text)}</span>`;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function speakText(text, langKey, voiceKey) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const langDef  = TRY_LANG_MAP[langKey]  || TRY_LANG_MAP["English (US)"];
    const voiceDef = TRY_VOICE_MAP[voiceKey] || TRY_VOICE_MAP["Maya — warm, mid-30s"];
    const u = new SpeechSynthesisUtterance(text);
    const v = pickBestVoice(langDef.code, voiceDef.gender);
    if (v) u.voice = v;
    u.lang  = (v && v.lang) || langDef.code;
    u.rate  = voiceDef.rate;
    u.pitch = voiceDef.pitch;
    currentPitch = voiceDef.pitch;
    agentSpeaking = true;
    u.onend = () => { agentSpeaking = false; };
    try { window.speechSynthesis.speak(u); } catch (_) {}
  }

  async function getDemoResponse(message, agentType, language) {
    try {
      const r = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, agent_type: agentType, language }),
      });
      if (!r.ok) throw new Error("api error");
      return (await r.json()).response;
    } catch (_) {
      return TRY_LINES[agentType] || TRY_LINES["Dental clinic front desk"];
    }
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null, recActive = false;

  async function startConversation() {
    if (recActive) {
      if (recognition) recognition.stop();
      return;
    }

    // Request microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      status.innerHTML = `<strong style="color:#ff5868">Mic blocked.</strong> Allow microphone access in your browser settings, then tap again.`;
      return;
    }

    if (!SpeechRec) {
      // Fallback: play preset TTS response
      const agent = agentSel ? agentSel.value : "Dental clinic front desk";
      const line  = TRY_LINES[agent] || TRY_LINES["Dental clinic front desk"];
      addChatMsg("agent", line);
      speakText(line, langSel.value, voiceSel.value);
      status.innerHTML = `<strong>Demo mode</strong> — your browser doesn't support live speech recognition. Playing a sample response.`;
      return;
    }

    recognition = new SpeechRec();
    const langDef   = TRY_LANG_MAP[langSel.value] || TRY_LANG_MAP["English (US)"];
    recognition.lang            = langDef.code;
    recognition.continuous      = false;
    recognition.interimResults  = true;

    recActive = true; listening = true;
    btn.classList.add("live");
    lbl.textContent = "Listening…";
    status.innerHTML = `<strong>Listening…</strong> Speak to the agent in ${escapeHtml(langSel.value)}.`;

    let finalTranscript = "";

    recognition.onresult = (e) => {
      let interim = "";
      finalTranscript = "";
      for (const result of e.results) {
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (interim) status.innerHTML = `<strong>Hearing:</strong> "${escapeHtml(interim)}…"`;
    };

    recognition.onend = async () => {
      recActive = false; listening = false;
      btn.classList.remove("live");
      lbl.textContent = "🎙️ Speak to agent";

      if (!finalTranscript.trim()) {
        status.innerHTML = `Didn't catch that — tap the mic and try again.`;
        return;
      }

      const agentType = agentSel ? agentSel.value : "Dental clinic front desk";
      const langKey   = langSel.value;
      const voiceKey  = voiceSel.value;

      addChatMsg("user", finalTranscript);
      status.innerHTML = `<strong>Thinking…</strong>`;

      const response = await getDemoResponse(finalTranscript, agentType, langKey);
      addChatMsg("agent", response);
      speakText(response, langKey, voiceKey);
      status.innerHTML = `<strong>Agent speaking…</strong> <span class="lp-try-lang-tag">${escapeHtml(langKey)} · ${escapeHtml(voiceKey.split("—")[0].trim())}</span>`;
    };

    recognition.onerror = (e) => {
      recActive = false; listening = false;
      btn.classList.remove("live");
      lbl.textContent = "🎙️ Speak to agent";
      if (e.error === "not-allowed" || e.error === "permission-denied") {
        status.innerHTML = `<strong style="color:#ff5868">Mic permission denied.</strong> Enable it in browser settings.`;
      } else if (e.error === "no-speech") {
        status.innerHTML = `No speech detected. Speak closer to your mic and try again.`;
      } else {
        status.innerHTML = `Couldn't hear you clearly — tap the mic and try again.`;
      }
    };

    recognition.start();
  }

  // Always try Vapi (SDK loads async so `liveVapi()` may return a valid instance even
  // if it was null when initVoiceTester() was first called).  Fall back to browser
  // SpeechRecognition only when Vapi is genuinely unavailable.
  let vapiCallActive = false;

  function setButtonIdle() {
    lbl.textContent = "🎙️ Speak to agent";
    btn.classList.remove("live");
    btn.disabled = false;
    vapiCallActive = false;
  }
  function setButtonConnecting() {
    lbl.textContent = "Connecting…";
    btn.disabled = true;
    btn.classList.remove("live");
  }
  function setButtonActive() {
    lbl.textContent = "🛑 Stop";
    btn.disabled = false;
    btn.classList.add("live");
    vapiCallActive = true;
  }

  // Pre-warm mic permission on pointerdown (~200 ms before 'click' fires)
  btn.addEventListener("pointerdown", () => {
    if (!_micPermitted && !vapiCallActive) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => { _micPermitted = true; })
        .catch(() => {});
    }
  }, { passive: true });

  btn.addEventListener("click", () => {
    const vapi = liveVapi();

    // ── Stop a running Vapi call ────────────────────────────────────────────
    if (vapiCallActive) {
      try { vapi?.stop(); } catch (_) {}
      setButtonIdle();
      return;
    }

    // ── Vapi path ───────────────────────────────────────────────────────────
    if (vapi) {
      setButtonConnecting();
      status.innerHTML = `<strong>Connecting…</strong> Starting session…`;

      (async () => {
        if (!_micPermitted) {
          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            _micPermitted = true;
          } catch (_) {
            setButtonIdle();
            status.innerHTML = `<strong style="color:#ff5868">Mic blocked.</strong> Allow microphone access in your browser settings, then tap again.`;
            return;
          }
        }

        const langVal   = langSel  ? langSel.value  : "English (US)";
        const voiceVal  = voiceSel ? voiceSel.value : "maya";
        const agentType = agentSel ? agentSel.value : "professional front desk receptionist";

        const voiceKey  = voiceVal.includes("—") ? voiceVal.split("—")[0].trim().toLowerCase() : voiceVal.toLowerCase();
        const voiceObj  = PREVIEW_VOICES.find(v => v.id === voiceKey) || PREVIEW_VOICES[0];
        const overrides = buildVapiOverrides(voiceObj, langVal, agentType);

        status.innerHTML = `<strong>Connecting…</strong> Starting call in ${escapeHtml(langVal)}…`;

        let connectTimeout;
        startVapiCall("5b54d785-e86b-420e-ace0-26092882287e", overrides, {
          onStart: () => {
            clearTimeout(connectTimeout);
            setButtonActive();
            status.innerHTML = `<strong>Connected!</strong> The agent is listening — speak now.`;
            listening = true;
          },
          onEnd: () => {
            clearTimeout(connectTimeout);
            setButtonIdle();
            status.innerHTML = `Call ended. Tap the mic to start a new conversation.`;
            listening = false; agentSpeaking = false;
          },
          onSpeechStart: () => {
            agentSpeaking = true;
            status.innerHTML = `<strong>Agent speaking…</strong>`;
          },
          onSpeechEnd: () => {
            agentSpeaking = false;
            status.innerHTML = `<strong>Listening…</strong> Go ahead and speak.`;
          },
          onError: (err) => {
            clearTimeout(connectTimeout);
            setButtonIdle();
            console.warn("[Harkly] Vapi error:", JSON.stringify(err));
            // err.message can be an object/array from Vapi — always stringify first
            const rawMsg = err?.message ?? err?.error ?? "";
            const msg = (typeof rawMsg === "string" ? rawMsg : JSON.stringify(rawMsg)).toLowerCase();
            if (msg.includes("ice") || msg.includes("network") || msg.includes("transport")) {
              status.innerHTML = `Connection hiccup — tap the mic again to reconnect.`;
            } else if (msg.includes("voiceid") || msg.includes("voice") || msg.includes("bad request")) {
              status.innerHTML = `Voice config issue — please try a different language or voice.`;
            } else {
              status.innerHTML = `Something went wrong — tap the mic to try again.`;
            }
            listening = false; agentSpeaking = false;
          },
        });

        // Register message handler for live chat transcript
        vapi.on("message", (msg) => {
          if (msg?.type === "transcript" && msg.transcriptType === "final") {
            addChatMsg(msg.role === "assistant" ? "agent" : "user", msg.transcript);
          }
        });

        // 25 s timeout — shows friendly nudge but does NOT kill the call
        connectTimeout = setTimeout(() => {
          if (!vapiCallActive) {
            status.innerHTML = `Still connecting… tap again if nothing happens in a few seconds.`;
          }
        }, 25000);
      })();

    // ── SpeechRecognition fallback (Vapi not yet loaded) ────────────────────
    } else {
      startConversation();
    }
  });
}

// --- Landing helpers ---

function initSubtitleRotator(el) {
  if (!el) return;
  let idx = 0, charIdx = 0, deleting = false, current = SUBTITLES[0];
  function tick() {
    if (!deleting) {
      charIdx++;
      el.textContent = current.slice(0, charIdx);
      if (charIdx >= current.length) { deleting = true; setTimeout(tick, 2600); return; }
      setTimeout(tick, 22 + Math.random() * 30);
    } else {
      charIdx -= 2;
      el.textContent = current.slice(0, Math.max(0, charIdx));
      if (charIdx <= 0) {
        deleting = false;
        idx = (idx + 1) % SUBTITLES.length;
        current = SUBTITLES[idx];
        setTimeout(tick, 280);
        return;
      }
      setTimeout(tick, 12);
    }
  }
  tick();
}

// Forward-facing image slider (frames + caption below)
// Auto-loops via CSS keyframe; we just duplicate content for seamless loop.
function initFrameSlider(root) {
  const track = root.querySelector("#lp-slider-track");
  if (!track) return;
  const html = FRAMES.map(f => `
    <article class="lp-frame">
      <img class="lp-frame-img" src="${f.img}" alt="${f.title}" />
      <div class="lp-frame-caption">
        <h4>${f.title}</h4>
        <p>${f.sub}</p>
      </div>
    </article>`).join("");
  track.innerHTML = html + html; // duplicate for seamless -50% loop
}

function initReviewTracks(root) {
  const top = root.querySelector("#lp-track-1");
  const bot = root.querySelector("#lp-track-2");
  if (!top || !bot) return;
  const half = REVIEWS.slice(0, Math.ceil(REVIEWS.length / 2));
  const rest = REVIEWS.slice(Math.ceil(REVIEWS.length / 2));
  const card = (r) => `
    <div class="lp-review">
      <div class="quote">"${r.quote}"</div>
      <div class="who">
        <img src="${r.img}" alt="${r.name}" loading="lazy"
             onerror="this.style.display='none'"/>
        <div>
          <div class="name">${r.name}</div>
          <div class="place">${r.place}</div>
        </div>
      </div>
    </div>`;
  const topHtml = half.map(card).join("");
  const botHtml = rest.map(card).join("");
  top.innerHTML = topHtml + topHtml;
  bot.innerHTML = botHtml + botHtml;
}

// Giant HARKLY AI letters arch upward in a visually-even parabola,
// settling perfectly flat as the section scrolls into view.
function initParabolaWord(root) {
  const wrap = root.querySelector("#lp-bigword");
  if (!wrap) return;
  const allSpans = Array.from(wrap.querySelectorAll(".ltr"));
  if (!allSpans.length) return;

  // Pixel-based positions — measured once after render so the arch is
  // visually centred on the actual rendered text width, not character count.
  let positions = null;

  function measurePositions() {
    const rects = allSpans.map(el => el.getBoundingClientRect());
    const leftMid  = rects[0].left + rects[0].width / 2;
    const rightMid = rects[rects.length - 1].left + rects[rects.length - 1].width / 2;
    const center   = (leftMid + rightMid) / 2;
    const half     = Math.max(rightMid - center, center - leftMid, 1);
    positions = rects.map(r => ((r.left + r.width / 2) - center) / half);
  }

  function update() {
    if (!positions) measurePositions();
    // Use the wrapper (parent of lp-bigword) for scroll progress
    const target = wrap.parentElement || wrap;
    const rect = target.getBoundingClientRect();
    const vh   = window.innerHeight;
    // progress: 0 = not yet in view, 1 = fully centred in viewport
    const raw  = 1 - (rect.top + rect.height * 0.5) / vh;
    const t    = Math.max(0, Math.min(1, raw * 1.6));
    // Ease-out⁵ — settles flat smoothly
    const ease = 1 - Math.pow(1 - t, 5);
    const remaining = 1 - ease;
    const flat = remaining < 0.05 ? 0 : remaining;

    // Symmetric inverted-U parabola — amplitude capped so letters
    // stay inside the wrapper (no overflow clipping needed)
    const wrapH  = target.getBoundingClientRect().height;
    const maxAmp = Math.min(wrapH * 1.4, 520);  // tall arch — reaches top of footer
    const curve  = flat * maxAmp;
    const maxRot = flat * 14;   // stronger tilt at edges for a dramatic arch
    allSpans.forEach((el, i) => {
      const x    = positions[i];
      // Inverted U: center lifts up, edges stay at baseline
      const lift = -curve * (1 - x * x);
      const rot  = maxRot * x;
      el.style.transform = `translateY(${lift.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
    });
  }

  // Measure after fonts load, then run initial update
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measurePositions(); update(); });
  } else {
    setTimeout(() => { measurePositions(); update(); }, 200);
  }

  let raf;
  window.addEventListener("scroll", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }, { passive: true });
  window.addEventListener("resize", () => { positions = null; update(); });
}

const BUSINESS_TYPES = [
  "Restaurant / Café","Medical / Clinic","Dental","Legal / Law Firm","Real Estate",
  "Hotel / Hospitality","Beauty / Salon / Spa","Auto / Car Dealership","Financial / Accounting",
  "Retail / E-commerce","Fitness / Gym","Education / Tutoring","Construction / Trades",
  "IT / Software","Marketing / Agency","Other",
];

function openAuthModal(initialMode = "login") {
  document.querySelectorAll(".auth-modal-backdrop").forEach(n => n.remove());
  let mode = initialMode === "signup" ? "signup" : "login";

  const BUSINESS_TYPES = [
    "Dental clinic","Hair salon / spa","Restaurant / café","Medical clinic",
    "HVAC / home services","Law firm","Real estate","Retail store",
    "Education / tutoring","Other",
  ];
  const USER_ROLES = [
    "Owner / Founder","Manager","Receptionist","Front desk staff","Admin","Other",
  ];
  const dropOpts = (opts, placeholder) =>
    `<option value="" disabled selected>${placeholder}</option>` +
    opts.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");

  const modal = h(`
    <div class="auth-modal-backdrop auth-modal-backdrop-light">
      <div class="auth-mesh" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-a" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-b" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-c" aria-hidden="true"></div>
      <div class="auth-modal auth-modal-pop" role="dialog" aria-modal="true">
        <button class="x-close" aria-label="Close">×</button>
        <h2 id="m-title">${mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <div class="modal-sub" id="m-sub">${mode === "signup" ? "Set up your AI receptionist in minutes." : "Sign in to manage your agents and calls."}</div>

        <div class="auth-tabs" id="m-tabs">
          <button class="${mode==='login'?'active':''}" data-mode="login">Sign in</button>
          <button class="${mode==='signup'?'active':''}" data-mode="signup">Create account</button>
        </div>

        <form id="m-form" class="grid" style="gap:14px">

          <!-- Signup-only: email at top -->
          <div id="m-signup-email-wrap" style="display:${mode==='signup'?'block':'none'}">
            <label class="am-label">Email</label>
            <input id="m-email-signup" type="email" class="am-field" placeholder="you@example.com" autocomplete="email"/>
          </div>

          <!-- Username (both modes) -->
          <div>
            <label class="am-label">Username</label>
            <input id="m-username" class="am-field" placeholder="e.g. janecooper" autocomplete="username" required/>
          </div>

          <!-- Login-only: email field -->
          <div id="m-login-email-wrap" style="display:${mode==='login'?'block':'none'}">
            <label class="am-label">Email</label>
            <input id="m-email-login" type="email" class="am-field" placeholder="you@example.com" autocomplete="email"/>
          </div>

          <!-- Signup-only: dropdowns -->
          <div id="m-signup-fields" style="display:${mode==='signup'?'contents':'none'}">
            <div class="am-row-2">
              <div>
                <label class="am-label">Business type</label>
                <div class="am-select-wrap">
                  <select id="m-btype" class="am-select">
                    ${dropOpts(BUSINESS_TYPES, "Select type…")}
                  </select>
                  <span class="am-chevron">▾</span>
                </div>
              </div>
              <div>
                <label class="am-label">Your role</label>
                <div class="am-select-wrap">
                  <select id="m-role" class="am-select">
                    ${dropOpts(USER_ROLES, "Select role…")}
                  </select>
                  <span class="am-chevron">▾</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Password (both modes) -->
          <div>
            <label class="am-label">Password</label>
            <input id="m-password" type="password" class="am-field" placeholder="${mode==='signup'?'Choose a secure password':'Enter your password'}" minlength="4" autocomplete="${mode==='signup'?'new-password':'current-password'}" required/>
          </div>

          <button class="am-submit" id="m-submit" type="submit">
            <span>${mode==='signup'?'Create account':'Sign in'}</span>
            <i data-lucide="arrow-right" class="icon"></i>
          </button>
          <div id="m-err" class="am-err hidden"></div>
        </form>
      </div>
    </div>`);
  document.body.appendChild(modal);
  renderIcons(modal);

  const close = () => modal.remove();
  modal.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest(".auth-modal")) close();
  });
  $(".x-close", modal).addEventListener("click", close);
  document.addEventListener("keydown", function escClose(ev) {
    if (ev.key === "Escape" && document.body.contains(modal)) {
      close();
      document.removeEventListener("keydown", escClose);
    }
  });

  const signupFields      = $("#m-signup-fields", modal);
  const signupEmailWrap   = $("#m-signup-email-wrap", modal);
  const loginEmailWrap    = $("#m-login-email-wrap", modal);
  const pwEl              = $("#m-password", modal);

  const setMode = (m) => {
    mode = m;
    $$("#m-tabs button", modal).forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    const isSignup = m === "signup";

    if (signupFields)    { signupFields.style.display    = isSignup ? "contents" : "none"; }
    if (signupEmailWrap) { signupEmailWrap.style.display = isSignup ? "block" : "none"; }
    if (loginEmailWrap)  { loginEmailWrap.style.display  = isSignup ? "none" : "block"; }
    if (pwEl) {
      pwEl.placeholder        = isSignup ? "Choose a secure password" : "Enter your password";
      pwEl.autocomplete       = isSignup ? "new-password" : "current-password";
    }

    $("#m-submit span", modal).textContent = isSignup ? "Create account" : "Sign in";
    $("#m-title", modal).textContent       = isSignup ? "Create your account" : "Welcome back";
    $("#m-sub", modal).textContent         = isSignup
      ? "Set up your AI receptionist in minutes."
      : "Sign in to manage your agents and calls.";
  };
  $$("#m-tabs button", modal).forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("#m-form", modal).addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#m-err", modal);
    err.classList.add("hidden");
    modal.querySelectorAll(".field-error").forEach(el => el.remove());
    modal.querySelectorAll(".field-invalid").forEach(el => el.classList.remove("field-invalid"));

    let hasError = false;
    const fieldErr = (inputEl, msg) => {
      if (!inputEl) return;
      inputEl.classList.add("field-invalid");
      const tag = document.createElement("div");
      tag.className = "field-error";
      tag.textContent = msg;
      inputEl.after(tag);
      hasError = true;
    };

    const userEl       = $("#m-username", modal);
    const emailSignup  = $("#m-email-signup", modal);
    const emailLogin   = $("#m-email-login", modal);

    if (mode === "signup") {
      if (!userEl.value.trim()) fieldErr(userEl, "Please enter a username.");
      else if (userEl.value.trim().length < 3) fieldErr(userEl, "Username must be at least 3 characters.");
    } else {
      // For login, require either username or email
      const hasUser  = userEl.value.trim().length > 0;
      const hasEmail = emailLogin && emailLogin.value.trim().length > 0;
      if (!hasUser && !hasEmail) fieldErr(userEl, "Please enter your username or email.");
    }
    if (!pwEl.value) fieldErr(pwEl, "Please enter your password.");
    else if (pwEl.value.length < 4) fieldErr(pwEl, "Password must be at least 4 characters.");

    if (hasError) return;

    const submitBtn = $("#m-submit", modal);
    const origLabel = submitBtn.querySelector("span")?.textContent || "Sign in";
    submitBtn.disabled = true;
    if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = "Please wait…";

    // For login, use email if provided, otherwise fall back to username
    const loginIdentifier = (emailLogin && emailLogin.value.trim())
      ? emailLogin.value.trim()
      : userEl.value.trim();

    const body = mode === "signup"
      ? {
          username:      userEl.value.trim(),
          email:         (emailSignup?.value.trim() || ""),
          password:      pwEl.value,
          business_type: ($("#m-btype", modal)?.value || ""),
          user_role:     ($("#m-role", modal)?.value || ""),
        }
      : { username: loginIdentifier, password: pwEl.value };

    try {
      const r = await api(`/auth/${mode === "signup" ? "signup" : "login"}`, { method: "POST", body, auth: false });
      Store.token = r.access_token;
      Store.user  = r.user;
      Store._refreshed = true;
      const displayName = r.user?.username || r.user?.name || "";
      toast(`Welcome${displayName ? ", " + displayName.split(" ")[0] : ""}!`, "success");
      close();
      navigate("#/dashboard");
    } catch (ex) {
      const msg = (ex.message || "").toLowerCase();
      if (msg.includes("wrong") || msg.includes("invalid") || msg.includes("credentials") || msg.includes("password")) {
        err.textContent = "Wrong credentials. Please try again.";
      } else if (msg.includes("taken") || msg.includes("already") || msg.includes("exists") || msg.includes("in use")) {
        if (msg.includes("email")) {
          err.textContent = "That email is already registered. Try signing in instead.";
        } else {
          err.innerHTML = `That username is already taken. <a href="#" id="m-switch-login" style="color:#f97316;text-decoration:underline;">Sign in instead →</a>`;
          const sw = $("#m-switch-login", modal);
          if (sw) sw.addEventListener("click", (ev) => { ev.preventDefault(); setMode("login"); err.classList.add("hidden"); });
        }
      } else {
        err.textContent = ex.message || "Something went wrong. Please try again.";
      }
      err.classList.remove("hidden");
      submitBtn.disabled = false;
      if (submitBtn.querySelector("span")) submitBtn.querySelector("span").textContent = origLabel;
    }
  });

  setTimeout(() => {
    const firstField = mode === "signup"
      ? $("#m-email-signup", modal)
      : $("#m-username", modal);
    if (firstField) firstField.focus();
  }, 50);
}

// --- Layout shell ---
function shell(activeKey, title, subtitle, action) {
  const items = [
    { k: "agents",  label: "Agents",  icon: "bot",        hash: "#/agents"  },
    { k: "calls",   label: "Calls",   icon: "phone",      hash: "#/calls"   },
    { k: "preview", label: "Preview", icon: "radio",      hash: "#/preview" },
    { k: "settings",label: "Settings",icon: "settings",   hash: "#/settings"},
    { k: "billing", label: "Billing", icon: "credit-card",hash: "#/billing" },
  ];
  const u = Store.user || { name: "—", username: "", email: "" };
  const initials = (u.username || u.name || "?").split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const wrap = h(`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">O</div>
          <div><div style="font-weight:700">Harkly AI</div><div style="font-size:11px;color:var(--muted)">Voice AI</div></div>
        </div>
        <nav>
          ${items.map(i => `<button class="nav-item ${activeKey===i.k?'active':''}" data-hash="${i.hash}"><i data-lucide="${i.icon}" class="icon"></i>${i.label}</button>`).join("")}
        </nav>
        <div class="footer">
          <div class="user-chip">
            <div class="avatar">${escapeHtml(initials)}</div>
            <div style="min-width:0;flex:1">
              <div class="text-sm font-medium truncate">${escapeHtml(u.username || u.name || "—")}</div>
              <div class="text-xs text-muted truncate">${escapeHtml(u.business_type || u.user_role || "")}</div>
            </div>
          </div>
          <button class="nav-item" id="logout"><i data-lucide="log-out" class="icon"></i>Log out</button>
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <h1>${escapeHtml(title)}</h1>
            ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
          </div>
          <div id="topbar-action"></div>
        </div>
        <div class="page" id="page"></div>
      </main>
      <div class="mobile-tabs">
        ${items.slice(0,5).map(i => `<button data-hash="${i.hash}" class="${activeKey===i.k?'active':''}"><div><i data-lucide="${i.icon}" class="icon"></i></div><div>${i.label}</div></button>`).join("")}
      </div>
    </div>`);
  $$(".nav-item[data-hash]", wrap).forEach(b => b.addEventListener("click", () => navigate(b.dataset.hash)));
  $$(".mobile-tabs button", wrap).forEach(b => b.addEventListener("click", () => navigate(b.dataset.hash)));
  $("#logout", wrap).addEventListener("click", () => { Store.token = null; Store.user = null; navigate("#/"); });
  if (action) $("#topbar-action", wrap).appendChild(action);
  return wrap;
}

function statCard({ label, value, sub, accent, icon }) {
  return `
    <div class="card card-hover p-5">
      <div class="flex items-center justify-between">
        <div class="stat-label">${escapeHtml(label)}</div>
        ${icon ? `<i data-lucide="${icon}" class="icon" style="color:var(--muted);width:16px;height:16px"></i>` : ""}
      </div>
      <div class="stat-value" style="${accent ? "color:var(--primary)" : ""}">${value}</div>
      ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function skeleton(rows = 3) {
  return Array.from({length: rows}).map(() => `<div class="skel" style="height:46px;margin-bottom:8px"></div>`).join("");
}

function callBadge(c) {
  if (c.is_urgent) return `<span class="badge badge-danger">Urgent</span>`;
  if (c.booking_made) return `<span class="badge badge-success">Booked</span>`;
  return `<span class="badge badge-muted">${escapeHtml(c.status || "—")}</span>`;
}

function renderRecentCalls(el, calls, opts = {}) {
  if (!calls.length) {
    el.innerHTML = `<div class="text-center text-muted text-sm" style="padding:40px 20px">
      <i data-lucide="phone-off" class="icon" style="width:32px;height:32px;color:var(--muted-2)"></i>
      <div class="mt-3">No calls yet.</div>
      <div class="text-xs mt-1">Activate an agent and forward your business number to get started.</div>
    </div>`;
    renderIcons(el);
    return;
  }
  el.innerHTML = calls.map(c => `
    <button class="list-item" data-id="${c.id}">
      <div class="dot ${c.is_urgent ? 'dot-danger' : c.booking_made ? 'dot-success' : 'dot-muted'}"></div>
      <div style="flex:1;min-width:0">
        <div class="text-sm font-medium truncate">${escapeHtml(c.caller_number || "Unknown caller")}</div>
        <div class="text-xs text-muted">${c.created_at ? new Date(c.created_at).toLocaleString() : ""}</div>
      </div>
      ${callBadge(c)}
      <i data-lucide="chevron-right" class="icon" style="color:var(--muted-2)"></i>
    </button>`).join("");
  $$("[data-id]", el).forEach(b => b.addEventListener("click", () => openCallPanel(b.dataset.id)));
  renderIcons(el);
}

// --- Side panel for call details ---
async function openCallPanel(callId) {
  const overlay = h(`<div class="side-panel-overlay"></div>`);
  const panel = h(`<aside class="side-panel"><div class="p-6" id="cp-body"><div class="skel" style="height:24px;width:60%"></div><div class="mt-4 skel" style="height:120px"></div></div></aside>`);
  document.body.append(overlay, panel);
  const close = () => { overlay.remove(); panel.remove(); };
  overlay.addEventListener("click", close);

  try {
    const c = await api(`/calls/${callId}`);
    $("#cp-body", panel).innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <div class="stat-label">Call from</div>
          <div class="text-xl font-semibold mt-1">${escapeHtml(c.caller_number || "Unknown")}</div>
        </div>
        <div class="flex gap-2 items-center">
          ${callBadge(c)}
          <button class="btn btn-ghost btn-sm" id="cp-close"><i data-lucide="x" class="icon"></i></button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="card p-4"><div class="stat-label">When</div><div class="text-sm mt-2">${c.created_at ? new Date(c.created_at).toLocaleString() : "—"}</div></div>
        <div class="card p-4"><div class="stat-label">Duration</div><div class="text-sm mt-2">${c.duration_seconds || 0}s</div></div>
        <div class="card p-4"><div class="stat-label">Status</div><div class="text-sm mt-2">${escapeHtml(c.status || "—")}</div></div>
      </div>
      ${c.booking_details ? `<div class="card p-4 mb-4" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.05)"><div class="stat-label" style="color:#6ee7b7">Booking</div><pre class="text-xs mt-2" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(c.booking_details, null, 2))}</pre></div>` : ""}
      <div class="card p-5">
        <div class="font-semibold mb-4 flex items-center gap-2"><i data-lucide="message-square" class="icon"></i>Conversation</div>
        ${(c.conversation || []).map(t => `
          <div class="bubble-row ${t.role}">
            <div class="bubble-avatar ${t.role}">${t.role === "user" ? "C" : "AI"}</div>
            <div class="bubble ${t.role}">${escapeHtml(t.content)}</div>
          </div>`).join("") || `<div class="text-sm text-muted">No transcript yet.</div>`}
      </div>`;
    $("#cp-close", panel).addEventListener("click", close);
    renderIcons(panel);
  } catch (e) {
    $("#cp-body", panel).innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`;
  }
}

// --- Onboarding QnA (post-signup, glass cards on gradient wallpaper) ---
const ONBOARDING_QUESTIONS = [
  {
    key: "business_name", required: true, type: "text",
    q: "What's your business called?",
    sub: "We'll use this whenever the AI introduces itself on a call.",
    placeholder: "e.g. Glow Salon, City Dental",
  },
  {
    key: "business_type", required: true, type: "choice",
    q: "What kind of business are you running?",
    sub: "We tune the AI's tone, vocabulary, and triage rules to match.",
    options: ["Clinic / healthcare", "Salon / spa", "Restaurant / hospitality", "Home services (HVAC, plumbing)", "Legal / professional", "Real estate", "Education / tutoring", "Other"],
  },
  {
    key: "team_size", required: true, type: "choice",
    q: "How many people are on your team?",
    sub: "Helps us decide who gets the WhatsApp summaries.",
    options: ["Just me", "2–5 people", "6–20 people", "21–100 people", "100+"],
  },
  {
    key: "call_volume", required: true, type: "choice",
    q: "Roughly how many calls do you get per week?",
    sub: "We'll recommend a plan that fits.",
    options: ["Under 20", "20–100", "100–500", "500+"],
  },
  {
    key: "primary_goal", required: false, type: "choice",
    q: "What's the #1 thing you want the AI to handle?",
    sub: "Optional — you can skip and tell us later.",
    options: ["Book appointments", "Answer FAQs", "Take messages", "Triage urgent calls", "After-hours coverage", "All of the above"],
  },
  {
    key: "current_pain", required: false, type: "text",
    q: "What's frustrating about your current phone setup?",
    sub: "Optional. The more you tell us, the better we tune the agent.",
    placeholder: "e.g. We miss calls at lunch and lose bookings to competitors.",
    multiline: true,
  },
  {
    key: "languages", required: false, type: "choice",
    q: "Any other languages your callers speak?",
    sub: "Optional. The AI can switch mid-call.",
    options: ["English only", "English + Spanish", "English + Hindi", "English + Mandarin", "English + Vietnamese", "Multiple — I'll add later"],
  },
  {
    key: "contact_name", required: false, type: "text",
    q: "What should we call you?",
    sub: "Optional — used in your dashboard greeting.",
    placeholder: "Your first name",
  },
];

route("onboarding", async () => {
  const root = h(`
    <div class="ob-wrap">
      <div class="ob-bg"></div>
      <div class="ob-grain"></div>
      <div class="ob-shell">
        <div class="ob-brand">
          <div class="ob-brand-mark">O</div>
          <div>
            <div class="ob-brand-name">Harkly AI</div>
            <div class="ob-brand-sub">Let's set up your AI receptionist</div>
          </div>
          <button class="ob-skip-all" id="ob-skip-all" title="Skip for now">Skip for now →</button>
        </div>

        <div class="ob-progress">
          <div class="ob-progress-bar"><div class="ob-progress-fill" id="ob-fill"></div></div>
          <div class="ob-progress-text" id="ob-step">Step 1 of ${ONBOARDING_QUESTIONS.length}</div>
        </div>

        <div class="ob-card-stack" id="ob-stack"></div>
      </div>
    </div>`);

  const state = {
    idx: 0,
    answers: {},
  };

  function renderQuestion() {
    const stack = root.querySelector("#ob-stack");
    const q = ONBOARDING_QUESTIONS[state.idx];
    const isLast = state.idx === ONBOARDING_QUESTIONS.length - 1;
    const fill = root.querySelector("#ob-fill");
    fill.style.width = `${((state.idx) / ONBOARDING_QUESTIONS.length) * 100}%`;
    root.querySelector("#ob-step").textContent =
      `Step ${state.idx + 1} of ${ONBOARDING_QUESTIONS.length}`;

    const card = h(`
      <div class="ob-card" id="ob-card">
        <div class="ob-q-meta">
          <span class="ob-q-num">Q${state.idx + 1}</span>
          ${q.required
            ? `<span class="ob-q-req">required</span>`
            : `<span class="ob-q-opt">optional · skippable</span>`}
        </div>
        <h2 class="ob-q-title">${escapeHtml(q.q)}</h2>
        <p class="ob-q-sub">${escapeHtml(q.sub)}</p>

        <div class="ob-q-input">
          ${q.type === "choice"
            ? `<div class="ob-choices">
                ${q.options.map((opt, i) => `
                  <button class="ob-choice" data-val="${escapeHtml(opt)}" data-i="${i}">
                    <span class="ob-choice-dot"></span>
                    <span>${escapeHtml(opt)}</span>
                  </button>`).join("")}
              </div>`
            : q.multiline
            ? `<textarea class="ob-text-input" id="ob-input" rows="4"
                  placeholder="${escapeHtml(q.placeholder || '')}"></textarea>`
            : `<input class="ob-text-input" id="ob-input" type="text"
                  placeholder="${escapeHtml(q.placeholder || '')}" autocomplete="off"/>`
          }
        </div>

        <div class="ob-actions">
          ${state.idx > 0
            ? `<button class="ob-back" id="ob-back">← Back</button>`
            : `<span></span>`}
          <div class="ob-actions-right">
            ${!q.required ? `<button class="ob-skip" id="ob-skip">Skip</button>` : ""}
            <button class="ob-next" id="ob-next" ${q.required ? 'disabled' : ''}>
              ${isLast ? "Finish setup" : "Next"} →
            </button>
          </div>
        </div>
      </div>`);

    stack.innerHTML = "";
    stack.appendChild(card);

    // Pre-fill if user came back
    const prev = state.answers[q.key];
    if (q.type !== "choice" && prev) {
      const inp = card.querySelector("#ob-input");
      inp.value = prev;
      card.querySelector("#ob-next").disabled = false;
    }
    if (q.type === "choice" && prev) {
      const sel = card.querySelector(`.ob-choice[data-val="${CSS.escape(prev)}"]`);
      if (sel) sel.classList.add("selected");
      card.querySelector("#ob-next").disabled = false;
    }

    // Choice handlers
    card.querySelectorAll(".ob-choice").forEach(b => {
      b.addEventListener("click", () => {
        card.querySelectorAll(".ob-choice").forEach(x => x.classList.remove("selected"));
        b.classList.add("selected");
        state.answers[q.key] = b.dataset.val;
        card.querySelector("#ob-next").disabled = false;
      });
    });

    // Text input handlers
    const inp = card.querySelector("#ob-input");
    if (inp) {
      inp.addEventListener("input", () => {
        state.answers[q.key] = inp.value.trim();
        card.querySelector("#ob-next").disabled = q.required && !inp.value.trim();
      });
      setTimeout(() => inp.focus(), 60);
    }

    const back = card.querySelector("#ob-back");
    if (back) back.addEventListener("click", () => { state.idx--; renderQuestion(); });

    const skip = card.querySelector("#ob-skip");
    if (skip) skip.addEventListener("click", () => {
      delete state.answers[q.key];
      advance();
    });

    card.querySelector("#ob-next").addEventListener("click", advance);
  }

  async function advance() {
    if (state.idx < ONBOARDING_QUESTIONS.length - 1) {
      state.idx++;
      renderQuestion();
    } else {
      await finishOnboarding(true);
    }
  }

  async function finishOnboarding(completed) {
    const fill = root.querySelector("#ob-fill");
    fill.style.width = "100%";
    try {
      const me = await api("/auth/onboarding", {
        method: "POST",
        body: { profile: state.answers, completed },
      });
      Store.user = me;
      toast("All set — let's build your first agent.", "success");
      navigate("#/agents");
    } catch (e) {
      toast(e.message, "error");
    }
  }

  root.querySelector("#ob-skip-all").addEventListener("click", async () => {
    if (!confirm("Skip the rest of setup? You can finish it any time from Settings.")) return;
    await finishOnboarding(true);
  });

  renderQuestion();
  return root;
});

// --- Pages ---
// ── Quick-activate sheet: shown when an agent has no phone linked ─────────────
function showQuickActivate(container, btn, agentId, agent) {
  container.querySelector("#dmi-qa-sheet")?.remove();
  const sheet = h(`
    <div id="dmi-qa-sheet" class="dmi-qa-sheet">
      <div class="dmi-qa-title">📞 Link a phone number to go live</div>
      <div class="dmi-qa-sub">Callers forwarded here will be answered by <strong>${escapeHtml(agent?.name || "your agent")}</strong>.</div>
      <div class="dmi-qa-row">
        <input class="input dmi-qa-inp" id="dmi-qa-phone" placeholder="+1 555 000 0000" type="tel"/>
        <button class="btn btn-primary btn-sm" id="dmi-qa-save">⚡ Activate</button>
      </div>
      <div class="dmi-qa-hint">Enter the forwarding number your phone provider will redirect missed calls to.</div>
      <button class="dmi-qa-cancel" id="dmi-qa-cancel">✕ Cancel</button>
    </div>`);
  btn.closest(".dmi-row").after(sheet);
  const inp = sheet.querySelector("#dmi-qa-phone");
  inp.focus();
  sheet.querySelector("#dmi-qa-cancel").addEventListener("click", () => sheet.remove());
  sheet.querySelector("#dmi-qa-save").addEventListener("click", async () => {
    const phone = inp.value.trim();
    if (!phone) { inp.focus(); inp.classList.add("input-error"); return; }
    inp.classList.remove("input-error");
    const saveBtn = sheet.querySelector("#dmi-qa-save");
    saveBtn.disabled = true; saveBtn.textContent = "Activating…";
    try {
      const cfg = agent?.config || {};
      await api(`/agents/${agentId}`, { method: "PUT", body: {
        name: agent?.name || "My Agent",
        twilio_number: phone,
        forwarding_number: phone,
        config: { ...cfg, forwarding_number: phone },
      }});
      await api(`/agents/${agentId}/activate`, { method: "POST" });
      sheet.remove();
      const row = btn.closest(".dmi-row");
      row.querySelector(".dmi-dot").className = "dmi-dot dmi-dot-live";
      btn.className = "dmi-toggle dmi-pause-btn";
      btn.textContent = "Pause"; btn.dataset.active = "true"; btn.dataset.hasPhone = "true";
      toast("🎉 Agent is live and answering calls!", "success");
    } catch(e) { toast(e.message, "error"); saveBtn.disabled = false; saveBtn.textContent = "⚡ Activate"; }
  });
}

// ── Quick-create modal: 3-step agent wizard from the dashboard ────────────────
function openQuickCreate(page) {
  document.querySelector("#qcm-overlay")?.remove();
  let qcStep = 1, qcVoice = PREVIEW_VOICES[0], qcLang = PREVIEW_LANGS[0], qcBizType = "";

  const overlay = h(`
    <div id="qcm-overlay" class="qcm-overlay">
      <div class="qcm-card">
        <button class="qcm-close" id="qcm-x">✕</button>
        <div class="qcm-header">
          <div class="qcm-title">Create a new agent</div>
          <div class="qcm-steps-row" id="qcm-steps-row">
            <div class="qcm-step qcm-step-on" data-n="1"><span class="qcm-snum">1</span>Details</div>
            <div class="qcm-step-line"></div>
            <div class="qcm-step" data-n="2"><span class="qcm-snum">2</span>Voice</div>
            <div class="qcm-step-line"></div>
            <div class="qcm-step" data-n="3"><span class="qcm-snum">3</span>Phone</div>
          </div>
        </div>
        <!-- Step 1 -->
        <div class="qcm-body" id="qcm-s1">
          <label class="qcm-lbl">Agent name</label>
          <input class="input" id="qcm-name" placeholder="e.g. City Clinic Reception" autofocus/>
          <label class="qcm-lbl" style="margin-top:16px">Business type</label>
          <div class="qcm-type-grid">
            ${["🏥 Clinic","🏨 Hotel","🍽️ Restaurant","✂️ Salon","🏢 Office","⚖️ Legal","🛍️ Retail","🎓 Education","💆 Wellness","📦 Other"].map(t=>`
              <button class="qcm-type-btn" data-btype="${escapeHtml(t)}">${t}</button>`).join("")}
          </div>
        </div>
        <!-- Step 2 -->
        <div class="qcm-body qcm-hidden" id="qcm-s2">
          <label class="qcm-lbl">Voice character</label>
          <div class="qcm-voice-grid" id="qcm-voice-grid">
            ${PREVIEW_VOICES.map((v,i)=>`
              <button class="qcm-voice-btn${i===0?' active':''}" data-vid="${v.id}">
                <span class="qcm-vname">${v.label}</span>
                <span class="qcm-vsub">${v.sub}</span>
              </button>`).join("")}
          </div>
          <label class="qcm-lbl" style="margin-top:16px">Language <span class="qcm-opt">(${PREVIEW_LANGS.length} available)</span></label>
          <select class="input" id="qcm-lang" style="cursor:pointer">
            ${PREVIEW_LANGS.map(l=>`<option>${escapeHtml(l)}</option>`).join("")}
          </select>
        </div>
        <!-- Step 3 -->
        <div class="qcm-body qcm-hidden" id="qcm-s3">
          <div class="qcm-phone-icon">📞</div>
          <label class="qcm-lbl">Forwarding phone number <span class="qcm-opt">optional</span></label>
          <input class="input" id="qcm-phone" placeholder="+1 555 000 0000" type="tel"/>
          <div class="qcm-phone-hint">Set call forwarding on your business phone to this number. You can add it later in the agent builder.</div>
        </div>
        <div class="qcm-footer">
          <button class="btn btn-ghost" id="qcm-back" style="visibility:hidden">← Back</button>
          <button class="btn btn-primary" id="qcm-next">Next →</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("qcm-in"));

  const close = () => { overlay.classList.remove("qcm-in"); setTimeout(() => overlay.remove(), 220); };
  overlay.querySelector("#qcm-x").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  // Business type selection
  overlay.querySelectorAll(".qcm-type-btn").forEach(b => b.addEventListener("click", () => {
    overlay.querySelectorAll(".qcm-type-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); qcBizType = b.dataset.btype;
  }));

  // Voice selection
  overlay.querySelectorAll(".qcm-voice-btn").forEach(b => b.addEventListener("click", () => {
    overlay.querySelectorAll(".qcm-voice-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active"); qcVoice = PREVIEW_VOICES.find(v => v.id === b.dataset.vid) || qcVoice;
  }));

  // Step navigation
  const goStep = (n) => {
    qcStep = n;
    overlay.querySelectorAll(".qcm-body").forEach((el, i) => el.classList.toggle("qcm-hidden", i + 1 !== n));
    overlay.querySelectorAll(".qcm-step").forEach(el => {
      const s = +el.dataset.n;
      el.classList.toggle("qcm-step-on", s === n);
      el.classList.toggle("qcm-step-done", s < n);
    });
    overlay.querySelector("#qcm-back").style.visibility = n === 1 ? "hidden" : "visible";
    const nxt = overlay.querySelector("#qcm-next");
    nxt.textContent = n === 3 ? "✓ Create agent" : "Next →";
  };

  overlay.querySelector("#qcm-back").addEventListener("click", () => goStep(qcStep - 1));
  overlay.querySelector("#qcm-next").addEventListener("click", async () => {
    if (qcStep === 1) {
      const name = overlay.querySelector("#qcm-name").value.trim();
      if (!name) { overlay.querySelector("#qcm-name").focus(); return; }
      goStep(2);
    } else if (qcStep === 2) {
      qcLang = overlay.querySelector("#qcm-lang").value || PREVIEW_LANGS[0];
      goStep(3);
    } else {
      // Create the agent
      const name = overlay.querySelector("#qcm-name").value.trim();
      const phone = overlay.querySelector("#qcm-phone").value.trim();
      const nxt = overlay.querySelector("#qcm-next");
      nxt.disabled = true; nxt.textContent = "Creating…";
      try {
        const created = await api("/agents/create", { method: "POST", body: {
          name, twilio_number: phone,
          config: {
            agent_name: name, business_type: qcBizType.replace(/[^\w\s]/g,"").trim(),
            voice_id: qcVoice.id, language: qcLang,
          }
        }});
        if (phone) {
          try { await api(`/agents/${created.agent?.id || created.id}/activate`, { method: "POST" }); } catch(_) {}
        }
        close();
        toast(`🎉 ${name} created${phone ? " and activated!" : "!"}`, "success");
        setTimeout(() => navigate(`#/agents/${created.agent?.id || created.id}/flow`), 400);
      } catch(e) { toast(e.message, "error"); nxt.disabled = false; nxt.textContent = "✓ Create agent"; }
    }
  });

  // Keyboard
  overlay.addEventListener("keydown", e => {
    if (e.key === "Escape") close();
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") overlay.querySelector("#qcm-next").click();
  });
}

route("dashboard", async () => {
  const action = h(`<button class="btn btn-primary"><i data-lucide="plus" class="icon"></i>New agent</button>`);
  action.addEventListener("click", () => navigate("#/agents/new"));
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();
  const name = (Store.user?.name || "").split(" ")[0] || "there";
  const wrap = shell("dashboard", `${greeting}, ${name}`, new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }), action);
  const page = $("#page", wrap);
  page.innerHTML = `
    <div class="grid grid-cols-4 mb-6" id="stats">${skeleton(1)}</div>
    <div class="dash-sparkline-row mb-4" id="dash-sparkline" style="display:none">
      <div class="dash-spark-label">Calls — last 7 days</div>
      <div class="dash-spark-bars" id="dash-spark-bars"></div>
    </div>
    <div class="grid" style="grid-template-columns: 1.7fr 1fr; gap:16px">
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="font-semibold">Recent calls</div>
          <button class="btn btn-ghost btn-sm" id="see-all"><span>See all</span><i data-lucide="arrow-right" class="icon"></i></button>
        </div>
        <div id="recent">${skeleton(4)}</div>
      </div>
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="font-semibold">Your agents</div>
          <button class="btn btn-primary btn-sm" id="new-agent2"><i data-lucide="plus" class="icon"></i> New</button>
        </div>
        <div id="agents-mini">${skeleton(3)}</div>
      </div>
    </div>

    <div class="card mt-4" id="dash-preview">
      <div class="dash-prev-head">
        <div>
          <div class="font-semibold" style="font-size:14px">Voice Preview — <span id="dash-prev-agent-name" style="color:var(--primary)">Harkly AI</span></div>
          <div class="text-xs text-muted mt-1" id="dash-prev-agent-meta">Select an agent to preview their exact voice, or pick manually below.</div>
        </div>
        <button class="dash-prev-play" id="dash-prev-play">
          <span class="dash-prev-dot"></span><span id="dash-prev-lbl">Play sample</span>
        </button>
      </div>
      <div class="dash-prev-body">
        <div class="dash-prev-wave-wrap">
          <canvas id="dash-prev-wave" class="dash-prev-wave"></canvas>
        </div>
        <div class="dash-prev-controls">
          <div class="dash-prev-section-label">Voice</div>
          <div class="dash-prev-voices" id="dash-prev-voices">
            ${PREVIEW_VOICES.map((v, i) => `
              <button class="dash-prev-voice ${i === 0 ? 'active' : ''}" data-vid="${v.id}">
                <div class="dash-prev-voice-name">${v.label}</div>
                <div class="dash-prev-voice-sub">${v.sub}</div>
              </button>`).join("")}
          </div>
          <div class="dash-prev-section-label" style="margin-top:14px">Language <span class="dash-prev-lang-count">(${PREVIEW_LANGS.length})</span></div>
          <div class="dash-prev-langs" id="dash-prev-langs">
            ${PREVIEW_LANGS.map((l, i) => `
              <button class="dash-prev-lang ${i === 0 ? 'active' : ''}" data-lang="${escapeHtml(l)}">${escapeHtml(l)}</button>`).join("")}
          </div>
        </div>
      </div>
    </div>`;
  renderIcons(page);
  $("#see-all", page).addEventListener("click", () => navigate("#/calls"));
  $("#new-agent2", page).addEventListener("click", () => openQuickCreate(page));

  // --- Dashboard Preview section: waveform + voices + languages ---
  let _dpc = (function initDashPreview() {
    const canvas = page.querySelector("#dash-prev-wave");
    const playBtn = page.querySelector("#dash-prev-play");
    const lbl = page.querySelector("#dash-prev-lbl");
    if (!canvas || !playBtn) return;
    const ctx = canvas.getContext("2d");
    let speaking = false, t = 0, level = 0.1, raf = null, currentPitch = 1.15;
    // Restore last canvas-selected voice + language so dashboard preview stays in sync
    const _savedVoice = localStorage.getItem("oc_last_voice");
    const _savedLang  = localStorage.getItem("oc_last_lang");
    let selectedVoice = PREVIEW_VOICES.find(v => v.id === _savedVoice) || PREVIEW_VOICES[0];
    let selectedLang  = (PREVIEW_LANGS.includes(_savedLang) ? _savedLang : null) || PREVIEW_LANGS[0];
    currentPitch = selectedVoice.pitch;

    function resize() {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * devicePixelRatio;
      canvas.height = r.height * devicePixelRatio;
    }
    resize();
    window.addEventListener("resize", resize);

    function drawWave() {
      t += 0.038 * (0.7 + currentPitch * 0.3);
      level += ((speaking ? 0.92 : 0.10) - level) * 0.07;
      const w = canvas.width, h = canvas.height;
      if (!w || !h) { raf = requestAnimationFrame(drawWave); return; }
      /* black stage */
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const bars = 28;
      const gap = w * 0.012;
      const totalGap = gap * (bars - 1);
      const bww = (w - totalGap) / bars;
      const COLORS = [
        [255,220,50],   // bright yellow
        [255,200,30],
        [255,175,40],
        [255,145,30],   // amber
        [255,115,20],   // orange
        [255,85,15],
        [240,60,20],    // orange-red
        [200,60,100],
        [160,60,180],   // purple-indigo
        [99,102,241],   // indigo
      ];
      for (let i = 0; i < bars; i++) {
        const phase = i * 0.48 + t;
        const amp = Math.sin(phase)*0.40 + Math.sin(phase*1.9)*0.32 + Math.sin(phase*0.55)*0.28;
        const a = Math.abs(amp) * level;
        const bh = Math.max(4 * devicePixelRatio, a * h * 0.96);
        const x = i * (bww + gap);
        const y = (h - bh) / 2;
        const ratio = i / (bars - 1);
        const ci = ratio * (COLORS.length - 1);
        const lo = Math.floor(ci), hi = Math.min(lo + 1, COLORS.length - 1);
        const frac = ci - lo;
        const rc = Math.round(COLORS[lo][0] + (COLORS[hi][0]-COLORS[lo][0])*frac);
        const gc = Math.round(COLORS[lo][1] + (COLORS[hi][1]-COLORS[lo][1])*frac);
        const bc = Math.round(COLORS[lo][2] + (COLORS[hi][2]-COLORS[lo][2])*frac);
        const grd = ctx.createLinearGradient(0, y, 0, y+bh);
        grd.addColorStop(0,   `rgba(${rc},${gc},${bc},0.55)`);
        grd.addColorStop(0.5, `rgba(${rc},${gc},${bc},1.00)`);
        grd.addColorStop(1,   `rgba(${rc},${gc},${bc},0.55)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        const r = Math.min(bww * 0.38, 5 * devicePixelRatio);
        ctx.roundRect(x, y, bww, bh, r);
        ctx.fill();
      }
      raf = requestAnimationFrame(drawWave);
    }
    // Wait one frame so the canvas has been laid out before reading its size
    requestAnimationFrame(() => { resize(); drawWave(); });

    // Sync active state on load to match restored prefs
    page.querySelectorAll(".dash-prev-voice").forEach(b => b.classList.toggle("active", b.dataset.vid === selectedVoice.id));
    page.querySelectorAll(".dash-prev-lang").forEach(b => b.classList.toggle("active", b.dataset.lang === selectedLang));

    // ── Vapi-powered dashboard preview ──────────────────────────────────────
    const DASH_ASSISTANT_ID = "d5f28a96-25da-4905-bac8-5dee52a15f4e";
    let dashCallActive = false;
    // Agent business context — populated by syncAgent() when user clicks an agent
    let _dashAgentCfg  = {};
    let _dashAgentType = null;

    function dashOverrides() {
      return buildVapiOverrides(selectedVoice, selectedLang, _dashAgentType, _dashAgentCfg);
    }

    // Shared callbacks — extracted so hot-swap restarts can reuse them
    const dashCbs = {
      onStart: () => {
        dashCallActive = true; speaking = true;
        lbl.textContent = "🛑 Stop";
        playBtn.classList.add("playing"); playBtn.disabled = false;
      },
      onEnd: () => {
        dashCallActive = false; speaking = false;
        lbl.textContent = "Play sample";
        playBtn.classList.remove("playing"); playBtn.disabled = false;
      },
      onSpeechStart: () => { speaking = true;  level = 0.85; },
      onSpeechEnd:   () => { speaking = false; level = 0.12; },
      onVolume: (vol) => { level = 0.12 + vol * 0.80; },
      onError: () => {
        dashCallActive = false; speaking = false;
        lbl.textContent = "Play sample";
        playBtn.classList.remove("playing"); playBtn.disabled = false;
        toast("Could not start preview — allow microphone access and retry", "error");
      },
    };

    // Hot-swap: instantly switch voice/lang mid-call
    async function dashHotSwap() {
      if (!dashCallActive) return;
      lbl.textContent = "Switching…";
      playBtn.disabled = true;
      speaking = false; level = 0.12;
      await restartVapiCall(DASH_ASSISTANT_ID, dashOverrides(), dashCbs);
    }

    // Pre-warm mic + WebRTC ICE paths on first hover so click → connect is instant
    playBtn.addEventListener("pointerenter", () => {
      if (!_micPermitted) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(s => { s.getTracks().forEach(t => t.stop()); _micPermitted = true; preWarmWebRTC(); })
          .catch(() => {});
      } else {
        preWarmWebRTC();
      }
    }, { passive: true, once: true });

    playBtn.addEventListener("click", () => {
      if (dashCallActive) { stopVapiCall(); return; }
      if (!getVapi()) { toast("Vapi unavailable — check your internet connection", "error"); return; }
      lbl.textContent = "Connecting…";
      playBtn.disabled = true;
      startVapiCall(DASH_ASSISTANT_ID, dashOverrides(), dashCbs);
    });

    // Voice buttons — update selection and instantly hot-swap if call is live
    page.querySelectorAll(".dash-prev-voice").forEach(b => b.addEventListener("click", () => {
      page.querySelectorAll(".dash-prev-voice").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      selectedVoice = PREVIEW_VOICES.find(v => v.id === b.dataset.vid) || PREVIEW_VOICES[0];
      currentPitch = selectedVoice.pitch;
      localStorage.setItem("oc_last_voice", selectedVoice.id);
      dashHotSwap();
    }));

    // Language buttons — update selection, auto-scroll into view, and hot-swap
    page.querySelectorAll(".dash-prev-lang").forEach(b => b.addEventListener("click", () => {
      page.querySelectorAll(".dash-prev-lang").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      selectedLang = b.dataset.lang;
      localStorage.setItem("oc_last_lang", selectedLang);
      b.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      dashHotSwap();
    }));

    // Expose controller so the agents mini-panel can sync voice/lang/name and hot-swap
    return {
      syncAgent(agent) {
        if (!agent) return;
        const vid = agent.config?.voice_id || agent.config?.voice || agent.voice_id;
        const v = vid
          ? (PREVIEW_VOICES.find(x => x.id === vid || x.label.toLowerCase() === String(vid).toLowerCase()) || selectedVoice)
          : selectedVoice;
        selectedVoice = v; currentPitch = v.pitch;
        page.querySelectorAll(".dash-prev-voice").forEach(b => b.classList.toggle("active", b.dataset.vid === v.id));

        const rawLang = agent.config?.language || agent.language || "";
        const l = rawLang
          ? (PREVIEW_LANGS.find(x => x.toLowerCase().includes(rawLang.toLowerCase().split("(")[0].trim())) || selectedLang)
          : selectedLang;
        selectedLang = l;
        page.querySelectorAll(".dash-prev-lang").forEach(b => {
          b.classList.toggle("active", b.dataset.lang === l);
          if (b.dataset.lang === l) b.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        });

        // Store business context so dashOverrides() passes it to buildVapiOverrides
        _dashAgentCfg  = agent.config || {};
        _dashAgentType = agent.config?.agent_type || null;

        const nameEl = page.querySelector("#dash-prev-agent-name");
        const metaEl = page.querySelector("#dash-prev-agent-meta");
        if (nameEl) nameEl.textContent = agent.name;
        if (metaEl) metaEl.textContent = `${v.label} · ${l} · ${agent.is_active ? "🟢 Live" : "⏸ Paused"}`;

        // If preview is playing, hot-swap immediately to the new agent's voice + lang
        dashHotSwap();
      }
    };
  })();

  try {
    const [stats, agents, recent, weekly] = await Promise.all([
      api("/dashboard/stats"),
      api("/agents/list"),
      api("/calls/recent"),
      api("/dashboard/weekly").catch(() => null),
    ]);
    const active = (agents.agents || []).filter(a => a.is_active).length;
    const total = (agents.agents || []).length;
    $("#stats", page).innerHTML = [
      statCard({ label: "Calls today",    value: stats.calls_today    ?? 0, sub: `${stats.calls_total ?? 0} all-time`,                    icon: "phone" }),
      statCard({ label: "Bookings today", value: stats.bookings_today ?? 0, sub: `${stats.bookings  ?? 0} total`,                         icon: "calendar-check", accent: true }),
      statCard({ label: "Urgent today",   value: stats.urgent_today   ?? 0, sub: `${stats.urgent_calls ?? 0} total flagged`,               icon: "alert-triangle" }),
      statCard({ label: "Minutes saved",  value: stats.total_minutes  ?? 0, sub: `${active} of ${total} agent${total !== 1 ? "s" : ""} live`, icon: "clock" }),
    ].join("");
    renderIcons($("#stats", page));

    // Weekly sparkline
    if (weekly?.days?.length) {
      const sparksEl = $("#dash-spark-bars", page);
      const max = Math.max(1, ...weekly.days.map(d => d.count));
      sparksEl.innerHTML = weekly.days.map(d => {
        const pct = Math.max(6, Math.round((d.count / max) * 100));
        const isToday = d.date === new Date().toLocaleDateString("en-US", { weekday: "short" }).slice(0,3);
        return `<div class="dash-spark-col">
          <div class="dash-spark-bar${isToday ? " dash-spark-today" : ""}" style="height:${pct}%" title="${d.count} calls"></div>
          <div class="dash-spark-day">${d.date}</div>
        </div>`;
      }).join("");
      $("#dash-sparkline", page).style.display = "";
    }

    renderRecentCalls($("#recent", page), (recent.calls || []).slice(0, 6));
    const agentList = agents.agents || [];
    const am = $("#agents-mini", page);
    if (!total) {
      am.innerHTML = `
        <div class="dmi-empty">
          <div class="dmi-empty-icon">🤖</div>
          <div class="dmi-empty-txt">No agents yet</div>
          <button class="btn btn-primary btn-sm" id="ca">Create your first agent</button>
        </div>`;
      $("#ca", am).addEventListener("click", () => openQuickCreate(page));
    } else {
      am.innerHTML = agentList.slice(0, 6).map(a => {
        const cfg = a.config || {};
        const lang  = cfg.language || a.language || "English (US)";
        const voice = cfg.voice_id || cfg.voice || a.voice_id || "maya";
        const vLabel = PREVIEW_VOICES.find(v => v.id === voice)?.label || voice;
        const hasPhone = !!(a.twilio_number || cfg.forwarding_number || cfg.phone);
        return `
        <div class="dmi-row" data-aid="${a.id}" data-voice="${escapeHtml(voice)}" data-lang="${escapeHtml(lang)}">
          <div class="dmi-dot ${a.is_active ? 'dmi-dot-live' : 'dmi-dot-paused'}"></div>
          <div class="dmi-body">
            <div class="dmi-name">${escapeHtml(a.name)}</div>
            <div class="dmi-meta">${escapeHtml(vLabel)} · ${escapeHtml(lang.split("(")[0].trim())}</div>
          </div>
          <button class="dmi-toggle ${a.is_active ? 'dmi-pause-btn' : 'dmi-live-btn'}"
            data-id="${a.id}" data-active="${a.is_active}" data-has-phone="${hasPhone}"
            data-name="${escapeHtml(a.name)}">
            ${a.is_active ? 'Pause' : '⚡ Go Live'}
          </button>
        </div>`;
      }).join("") + `<button class="dmi-new-row" id="dmi-new"><i data-lucide="plus" class="icon" style="width:13px;height:13px"></i> Create new agent</button>`;
      renderIcons(am);

      // Row click → select + sync preview
      am.querySelectorAll(".dmi-row").forEach(row => {
        row.addEventListener("click", e => {
          if (e.target.closest(".dmi-toggle")) return;
          am.querySelectorAll(".dmi-row").forEach(r => r.classList.remove("dmi-selected"));
          row.classList.add("dmi-selected");
          const agent = agentList.find(a => a.id == row.dataset.aid);
          if (agent && _dpc) _dpc.syncAgent(agent);
        });
      });

      // ⚡ Go Live / Pause toggle
      am.querySelectorAll(".dmi-toggle").forEach(btn => {
        btn.addEventListener("click", async e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const isActive = btn.dataset.active === "true";
          const hasPhone = btn.dataset.hasPhone === "true";
          const agentObj = agentList.find(a => a.id == id);

          if (!isActive && !hasPhone) {
            showQuickActivate(am, btn, id, agentObj); return;
          }
          btn.disabled = true;
          try {
            await api(`/agents/${id}/${isActive ? "deactivate" : "activate"}`, { method: "POST" });
            const row = btn.closest(".dmi-row");
            const dot = row.querySelector(".dmi-dot");
            if (isActive) {
              dot.className = "dmi-dot dmi-dot-paused";
              btn.className = "dmi-toggle dmi-live-btn";
              btn.textContent = "⚡ Go Live"; btn.dataset.active = "false";
              if (agentObj) agentObj.is_active = false;
            } else {
              dot.className = "dmi-dot dmi-dot-live";
              btn.className = "dmi-toggle dmi-pause-btn";
              btn.textContent = "Pause"; btn.dataset.active = "true";
              if (agentObj) agentObj.is_active = true;
            }
            if (_dpc && agentObj && row.classList.contains("dmi-selected")) _dpc.syncAgent(agentObj);
            toast(isActive ? "Agent paused." : "🎉 Agent is now live!", isActive ? "info" : "success");
          } catch(err) { toast(err.message, "error"); }
          btn.disabled = false;
        });
      });

      $("#dmi-new", am)?.addEventListener("click", () => openQuickCreate(page));

      // Auto-select first active agent
      const firstActive = agentList.find(a => a.is_active) || agentList[0];
      if (firstActive) {
        am.querySelector(`[data-aid="${firstActive.id}"]`)?.classList.add("dmi-selected");
        if (_dpc) _dpc.syncAgent(firstActive);
      }
    }
    // ── Usage bar (async — non-blocking) ──────────────────────────────────
    api("/dashboard/usage").then(usage => {
      if (!usage || usage.plan === "trial") {
        const daysLeft = Store.user?.trial_ends_at
          ? Math.max(0, Math.ceil((new Date(Store.user.trial_ends_at) - new Date()) / 86400000))
          : 7;
        const usageEl = h(`
          <div class="dash-usage-bar card p-4 mt-4">
            <div class="dash-usage-head">
              <span class="dash-usage-plan">Trial</span>
              <span class="dash-usage-days">${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining</span>
              <button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">Upgrade →</button>
            </div>
            <div class="dash-usage-track"><div class="dash-usage-fill" style="width:${Math.round((1 - daysLeft/7)*100)}%"></div></div>
            <div class="dash-usage-meta">Free trial · Upgrade to keep your agent live after trial ends</div>
          </div>`);
        page.appendChild(usageEl);
        return;
      }
      const pct = Math.min(100, usage.pct_used || 0);
      const fillClass = pct >= 100 ? "dash-usage-fill-red" : pct >= 80 ? "dash-usage-fill-amber" : "";
      const usageEl = h(`
        <div class="dash-usage-bar card p-4 mt-4">
          <div class="dash-usage-head">
            <span class="dash-usage-plan">${escapeHtml(usage.plan || "Pro")}</span>
            <span class="dash-usage-mins">${usage.minutes_used ?? 0} / ${usage.total_available ?? "∞"} min used</span>
            ${pct >= 80 ? `<button class="btn btn-primary btn-sm" onclick="location.hash='#/billing'">Upgrade →</button>` : ""}
          </div>
          <div class="dash-usage-track"><div class="dash-usage-fill ${fillClass}" style="width:${pct}%"></div></div>
          <div class="dash-usage-meta">${usage.minutes_remaining ?? 0} minutes remaining · ${usage.rollover_minutes ? usage.rollover_minutes + " rollover min · " : ""}Overage at $0.10/min</div>
        </div>`);
      page.appendChild(usageEl);
    }).catch(() => {});
  } catch (e) { toast(e.message, "error"); }
  return wrap;
});

// === Calls page — three-column layout: agent history (left) · call cards (center)
//     · calendar + comic notes (right). Click any call → paper-textured detail popup. ===
// Per-day custom notes — stored locally so the user can scribble plans on the calendar.
function clNotesKey() { return "oc_cal_notes_v1_" + (Store.user?.id || "guest"); }
function loadUserNotes() {
  try {
    const raw = JSON.parse(localStorage.getItem(clNotesKey()) || "{}");
    // Migrate old single-note format { text, color } → array [{ id, text, color }]
    const result = {};
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) { result[k] = v; }
      else if (v && typeof v === "object" && v.text) {
        result[k] = [{ id: k + "_0", text: v.text, color: v.color || "amber" }];
      }
    }
    return result;
  } catch { return {}; }
}
function saveUserNotes(map) { localStorage.setItem(clNotesKey(), JSON.stringify(map)); }

route("calls", async () => {
  const wrap = shell("calls", "Calls", "Every call, every booking, every reminder — in one place.");
  const page = $("#page", wrap);
  page.innerHTML = `
    <div class="cl-layout cl-layout-2">
      <aside class="cl-left cl-left-tall">
        <div class="cl-side-head"><i data-lucide="bot" class="icon"></i>Agent history</div>
        <div id="cl-agents">${skeleton(4)}</div>

        <div class="cl-side-head" style="margin-top:18px">
          <i data-lucide="phone-incoming" class="icon"></i>Recent callers
        </div>
        <div id="cl-recent-callers" class="cl-recent-callers">${skeleton(4)}</div>
      </aside>

      <section class="cl-center cl-center-cal">
        <div class="cl-toolbar">
          <div class="cl-search">
            <i data-lucide="search" class="icon"></i>
            <input id="cl-q" placeholder="Search by number, name, company, or transcript…"/>
          </div>
          <div class="cl-filters">
            <button class="cl-filter active" data-f="all">All</button>
            <button class="cl-filter" data-f="urgent">Urgent</button>
            <button class="cl-filter" data-f="booking">Booked</button>
          </div>
        </div>

        <!-- BIG CALENDAR with month navigation, booking rectangles, user notes -->
        <div class="cl-bigcal" id="cl-bigcal"></div>

        <div class="cl-side-head" style="margin-top:6px">
          <i data-lucide="list" class="icon"></i>Recent calls
        </div>
        <div id="cl-list" class="cl-list">${skeleton(4)}</div>
      </section>
    </div>`;
  renderIcons(page);

  // Load data in parallel
  let calls = [], agents = [];
  try {
    const [c, a] = await Promise.all([api("/calls/recent"), api("/agents/list")]);
    calls = c.calls || [];
    agents = a.agents || [];
  } catch (e) {
    $("#cl-list", page).innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`;
    return wrap;
  }

  // --- Left: agents with their call counts ---
  const agentsEl = $("#cl-agents", page);
  if (!agents.length) {
    agentsEl.innerHTML = `<div class="cl-side-empty">No agents yet.</div>`;
  } else {
    agentsEl.innerHTML = agents.map(a => {
      const count = calls.filter(c => c.agent_id === a.id).length;
      const company = (a.config && (a.config.business_name || a.config.business_type)) || "—";
      return `
        <button class="cl-agent-row" data-aid="${a.id}">
          <span class="dot ${a.is_active ? 'dot-success' : 'dot-muted'}"></span>
          <div class="cl-agent-info">
            <div class="cl-agent-name">${escapeHtml(a.name)}</div>
            <div class="cl-agent-meta">${escapeHtml(company)} · ${count} call${count === 1 ? '' : 's'}</div>
            <div class="cl-agent-meta-2">${escapeHtml(a.twilio_number || 'no number')}</div>
          </div>
          <i data-lucide="chevron-right" class="icon"></i>
        </button>`;
    }).join("");
    renderIcons(agentsEl);
  }

  // --- Recent callers list (with phone, name, company) ---
  const recentEl = $("#cl-recent-callers", page);
  const lookup = (aid) => agents.find(a => a.id === aid);
  if (!calls.length) {
    recentEl.innerHTML = `<div class="cl-side-empty">No calls yet — the moment your agent answers one, it shows up here.</div>`;
  } else {
    recentEl.innerHTML = calls.slice(0, 8).map(c => {
      const ag = lookup(c.agent_id) || {};
      const company = ag.config?.business_name || "—";
      const name = c.caller_name || (c.booking_details && c.booking_details.name) || "Unknown caller";
      const ago = c.created_at ? timeAgo(new Date(c.created_at)) : "";
      return `
        <button class="cl-recent-caller" data-id="${c.id}">
          <div class="cl-recent-num">${escapeHtml(c.caller_number || "Unknown")}</div>
          <div class="cl-recent-name">${escapeHtml(name)} · <span class="cl-recent-co">${escapeHtml(company)}</span></div>
          <div class="cl-recent-when">${escapeHtml(ago)}</div>
        </button>`;
    }).join("");
    $$("[data-id]", recentEl).forEach(b => b.addEventListener("click", () => openCallPaperPopup(b.dataset.id)));
  }

  // --- BIG CALENDAR with month navigation + booking blocks + user notes ---
  const calState = { y: new Date().getFullYear(), m: new Date().getMonth() };
  const bigEl = $("#cl-bigcal", page);

  function bookingsByDate() {
    const map = {};
    calls.forEach(c => {
      if (!c.booking_made || !c.booking_details) return;
      const det = c.booking_details;
      const raw = det.datetime || det.when || det.date || c.created_at;
      const dt = raw ? new Date(raw) : null;
      if (!dt || isNaN(dt)) return;
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      (map[key] = map[key] || []).push({ call: c, det });
    });
    return map;
  }

  function renderBigCalendar() {
    const userNotes = loadUserNotes();
    const { y, m } = calState;
    const monthName = new Date(y, m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const startDow = new Date(y, m, 1).getDay();
    const daysIn = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear() === y && today.getMonth() === m;
    const bk = bookingsByDate();

    let html = `
      <div class="cl-bigcal-head">
        <button class="cl-cal-nav" data-nav="-1"><i data-lucide="chevron-left" class="icon"></i></button>
        <div class="cl-bigcal-title">${monthName}</div>
        <button class="cl-cal-nav" data-nav="0">Today</button>
        <button class="cl-cal-nav" data-nav="1"><i data-lucide="chevron-right" class="icon"></i></button>
      </div>
      <div class="cl-bigcal-grid">
        ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cl-bigcal-dow">${d}</div>`).join("")}`;
    for (let i = 0; i < startDow; i++) html += `<div class="cl-bigcal-cell cl-bigcal-empty"></div>`;
    for (let d = 1; d <= daysIn; d++) {
      const key = `${y}-${m}-${d}`;
      const isToday = isThisMonth && d === today.getDate();
      const dayBookings = bk[key] || [];
      const dayNotes  = userNotes[key] || [];
      const firstNote = dayNotes[0];
      const noteCol   = firstNote?.color || "amber";
      html += `
        <div class="cl-bigcal-cell ${isToday ? 'cl-bigcal-today' : ''}" data-key="${key}" data-d="${d}">
          <div class="cl-bigcal-num">${d}</div>
          <div class="cl-bigcal-blocks">
            ${dayBookings.slice(0, 3).map(b => `
              <div class="cl-bigcal-block cl-bigcal-block-booking" title="${escapeHtml(b.det.name || b.call.caller_number || 'Booking')}">
                <span class="cl-bigcal-dot"></span>${escapeHtml((b.det.service || b.det.topic || 'Booking').slice(0, 18))}
              </div>`).join("")}
            ${dayBookings.length > 3 ? `<div class="cl-bigcal-more">+${dayBookings.length - 3} more</div>` : ""}
            ${dayNotes.slice(0, 2).map((note, ni) => `
              <div class="cl-bigcal-sn cl-bigcal-sn-${note.color || 'amber'}" data-note-key="${key}" data-note-i="${ni}" title="${escapeHtml(note.text)}">
                ${escapeHtml((note.text || '').slice(0, 13))}${(note.text||'').length > 13 ? '…' : ''}
              </div>`).join("")}
            ${dayNotes.length > 2 ? `<div class="cl-bigcal-more">+${dayNotes.length - 2}</div>` : ""}
          </div>
        </div>`;
    }
    html += `</div>`;
    bigEl.innerHTML = html;
    renderIcons(bigEl);

    bigEl.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => {
      const nav = +b.dataset.nav;
      if (nav === 0) { calState.y = new Date().getFullYear(); calState.m = new Date().getMonth(); }
      else { calState.m += nav; if (calState.m < 0) { calState.m = 11; calState.y--; } if (calState.m > 11) { calState.m = 0; calState.y++; } }
      renderBigCalendar();
    }));
    bigEl.querySelectorAll("[data-key]").forEach(cell => cell.addEventListener("click", (ev) => {
      const noteEl = ev.target.closest("[data-note-key]");
      if (noteEl) {
        ev.stopPropagation();
        openNoteEditPopup(noteEl.dataset.noteKey, +noteEl.dataset.noteI, () => renderBigCalendar());
        return;
      }
      openDayPopup(cell.dataset.key, cell.dataset.d, bk[cell.dataset.key] || [], () => renderBigCalendar());
    }));
  }
  renderBigCalendar();

  // --- Calls list ---
  let filter = "all", q = "", agentFilter = null;
  const list = $("#cl-list", page);
  function renderList() {
    let v = calls;
    if (filter === "urgent") v = v.filter(c => c.is_urgent);
    if (filter === "booking") v = v.filter(c => c.booking_made);
    if (agentFilter) v = v.filter(c => c.agent_id === agentFilter);
    if (q) v = v.filter(c => {
      const ag = lookup(c.agent_id) || {};
      const s = (c.caller_number || "") + " " +
                (c.caller_name || "") + " " +
                (ag.config?.business_name || "") + " " +
                (c.summary || "") + " " +
                JSON.stringify(c.conversation || "");
      return s.toLowerCase().includes(q);
    });

    if (!v.length) {
      list.innerHTML = `
        <div class="cl-empty">
          <i data-lucide="phone-off" class="icon"></i>
          <div class="cl-empty-title">No calls match.</div>
          <div class="cl-empty-sub">${calls.length === 0
            ? "Once your agent starts taking calls, they'll appear here."
            : "Try a different filter or clear your search."}</div>
        </div>`;
      renderIcons(list);
      return;
    }

    list.innerHTML = v.map(c => {
      const status = c.is_urgent ? "urgent" : c.booking_made ? "booked" : "handled";
      const when = c.created_at ? new Date(c.created_at) : null;
      const ago = when ? timeAgo(when) : "";
      const ag = lookup(c.agent_id) || {};
      const company = ag.config?.business_name || "";
      const name = c.caller_name || (c.booking_details && c.booking_details.name) || "Unknown caller";
      const initials = name.split(/\s+/).map(s => s[0] || "").slice(0, 2).join("").toUpperCase() || "?";
      const dur = c.duration_seconds ? (c.duration_seconds >= 60 ? `${Math.floor(c.duration_seconds/60)}m ${c.duration_seconds%60}s` : `${c.duration_seconds}s`) : "";
      return `
        <button class="cl-card cl-card-${status}" data-id="${c.id}">
          <div class="cl-card-avatar ${status === 'urgent' ? 'av-urgent' : status === 'booked' ? 'av-booked' : ''}">${escapeHtml(initials)}</div>
          <div class="cl-card-body">
            <div class="cl-card-toprow">
              <span class="cl-card-caller-name">${escapeHtml(name)}</span>
              <span class="cl-card-badge badge-${status}">${status}</span>
              ${company ? `<span class="cl-card-badge" style="background:rgba(99,102,241,0.1);color:#6366f1">${escapeHtml(company)}</span>` : ''}
            </div>
            <div class="cl-card-phone-num">${escapeHtml(c.caller_number || "Unknown number")}</div>
            <div class="cl-card-summ">${escapeHtml((c.summary || "Tap to read the full transcript and summary.").slice(0, 120))}</div>
          </div>
          <div class="cl-card-meta">
            <div class="cl-card-time-lbl">${escapeHtml(ago)}</div>
            ${dur ? `<div class="cl-card-dur-lbl">${escapeHtml(dur)}</div>` : ""}
          </div>
        </button>`;
    }).join("");
    $$("[data-id]", list).forEach(b => b.addEventListener("click", () => openCallPaperPopup(b.dataset.id)));
  }

  $("#cl-q", page).addEventListener("input", e => { q = e.target.value.toLowerCase(); renderList(); });
  $$(".cl-filter", page).forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f;
    $$(".cl-filter", page).forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    renderList();
  }));
  $$("[data-aid]", page).forEach(b => b.addEventListener("click", () => {
    agentFilter = agentFilter === b.dataset.aid ? null : b.dataset.aid;
    $$("[data-aid]", page).forEach(x => x.classList.toggle("selected", x.dataset.aid === agentFilter));
    renderList();
  }));

  renderList();
  return wrap;
});

// Day-detail popup: multi-note support — add multiple notes, delete individual ones.
function openDayPopup(key, dayNum, bookings, onChange) {
  let notes = [...(loadUserNotes()[key] || [])];
  const overlay = h(`<div class="cl-pop-overlay"></div>`);
  const [yy, mm, dd] = key.split("-").map(Number);
  const dateLabel = new Date(yy, mm, dd).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const COLORS = ["green","amber","pink","blue","violet"];
  let chosenColor = notes[0]?.color || "amber";

  function persistNotes() {
    const all = loadUserNotes();
    if (notes.length) all[key] = notes; else delete all[key];
    saveUserNotes(all); onChange && onChange();
  }

  const pop = h(`
    <div class="cl-anime-note">
      <div class="cl-anime-note-header">
        <div class="cl-anime-note-dot"></div>
        <div class="cl-anime-note-date">${escapeHtml(dateLabel)}</div>
        <button class="cl-anime-note-close" title="Close">×</button>
      </div>

      ${bookings.length ? `
        <div class="cl-anime-note-section-label">Bookings <span class="cl-notes-count">(${bookings.length})</span></div>
        <div class="cl-anime-note-bookings">
          ${bookings.map(b => `
            <div class="cl-anime-booking" data-call-id="${b.call.id}">
              <div class="cl-anime-booking-time">${escapeHtml(b.det.time || b.det.when || "—")}</div>
              <div class="cl-anime-booking-info">
                <div class="cl-anime-booking-who">${escapeHtml(b.det.name || b.call.caller_number || "Caller")}</div>
                <div class="cl-anime-booking-what">${escapeHtml(b.det.service || b.det.topic || b.det.reason || "Appointment")}</div>
              </div>
              <button class="cl-anime-booking-open">→</button>
            </div>`).join("")}
        </div>` : ""}

      <div class="cl-anime-note-section-label">
        Notes <span class="cl-notes-count" id="cl-notes-count">(${notes.length})</span>
      </div>
      <div class="cl-note-list" id="cl-note-list"></div>

      <div class="cl-anime-add-form">
        <textarea class="cl-anime-note-textarea" id="cl-day-note" placeholder="Add a note for this day…" rows="2"></textarea>
        <div class="cl-anime-note-footer">
          <div class="cl-anime-note-colors">
            ${COLORS.map(c => `<button class="cl-anime-color cl-anime-c-${c} ${c === chosenColor ? 'sel' : ''}" data-c="${c}" title="${c}"></button>`).join("")}
          </div>
          <button class="cl-anime-save">Add note</button>
        </div>
      </div>
    </div>`);

  document.body.append(overlay, pop);
  const close = () => { overlay.remove(); pop.remove(); };
  overlay.addEventListener("click", close);
  $(".cl-anime-note-close", pop).addEventListener("click", close);

  // Color picker
  pop.querySelectorAll(".cl-anime-color").forEach(b => b.addEventListener("click", () => {
    chosenColor = b.dataset.c;
    pop.querySelectorAll(".cl-anime-color").forEach(x => x.classList.remove("sel"));
    b.classList.add("sel");
  }));

  // Render/refresh note list in-place
  function renderNoteList() {
    const listEl = $("#cl-note-list", pop);
    const countEl = $("#cl-notes-count", pop);
    if (countEl) countEl.textContent = `(${notes.length})`;
    if (!notes.length) {
      listEl.innerHTML = `<div class="cl-note-empty">No notes yet — write one below and press Add note.</div>`;
      return;
    }
    listEl.innerHTML = notes.map((n, i) => `
      <div class="cl-note-item" data-nii="${i}">
        <span class="cl-note-item-dot" style="background:var(--anime-c-${n.color || 'amber'})"></span>
        <span class="cl-note-item-text">${escapeHtml(n.text)}</span>
        <button class="cl-note-item-edit" data-nie="${i}" title="Edit note">✎</button>
        <button class="cl-note-item-del" data-ni="${i}" title="Delete this note">×</button>
      </div>`).join("");
    listEl.querySelectorAll(".cl-note-item-del").forEach(btn => {
      btn.addEventListener("click", () => {
        notes.splice(+btn.dataset.ni, 1);
        persistNotes(); renderNoteList();
      });
    });
    listEl.querySelectorAll(".cl-note-item-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.nie;
        const n = notes[idx];
        if (!n) return;
        const itemEl = btn.closest(".cl-note-item");
        if (itemEl.querySelector(".cl-note-inline-edit")) return;
        const orig = itemEl.querySelector(".cl-note-item-text");
        if (orig) orig.style.display = "none";
        btn.style.display = "none";
        const ta = document.createElement("textarea");
        ta.className = "cl-note-inline-edit";
        ta.value = n.text;
        const saveBtn = document.createElement("button");
        saveBtn.className = "cl-note-inline-save btn btn-sm btn-primary";
        saveBtn.textContent = "Save";
        saveBtn.addEventListener("click", () => {
          const t = ta.value.trim();
          if (!t) return;
          notes[idx] = { ...n, text: t };
          persistNotes(); renderNoteList();
        });
        itemEl.insertBefore(ta, btn.nextSibling);
        itemEl.insertBefore(saveBtn, ta.nextSibling);
        ta.focus(); ta.select();
      });
    });
    // Update header accent from first note
    pop.style.setProperty("--note-accent", `var(--anime-c-${notes[0]?.color || chosenColor})`);
  }
  renderNoteList();

  // Add note
  $(".cl-anime-save", pop).addEventListener("click", () => {
    const ta = $("#cl-day-note", pop);
    const text = ta.value.trim();
    if (!text) { ta.style.borderColor = "#dc2626"; ta.focus(); setTimeout(() => ta.style.borderColor = "", 700); return; }
    notes.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, color: chosenColor });
    ta.value = "";
    persistNotes(); renderNoteList();
  });

  // Open booking
  pop.querySelectorAll(".cl-anime-booking-open").forEach(btn => btn.addEventListener("click", () => {
    const callId = btn.closest("[data-call-id]").dataset.callId;
    close(); setTimeout(() => openCallPaperPopup(callId), 80);
  }));

  pop.style.setProperty("--note-accent", `var(--anime-c-${notes[0]?.color || chosenColor})`);
  renderIcons(pop);
}

function openNoteEditPopup(key, noteIdx, onChange) {
  const allNotes = loadUserNotes();
  const dayNotes = [...(allNotes[key] || [])];
  const note = dayNotes[noteIdx];
  if (!note) return;
  const [yy, mm, dd] = key.split("-").map(Number);
  const dateLabel = new Date(yy, mm, dd).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const COLORS = ["green","amber","pink","blue","violet"];
  let chosenColor = note.color || "amber";

  const overlay = h(`<div class="cl-pop-overlay"></div>`);
  const pop = h(`
    <div class="cne-pop">
      <div class="cne-header" style="--nc:var(--anime-c-${chosenColor})">
        <div class="cne-dot"></div>
        <div class="cne-date">${escapeHtml(dateLabel)}</div>
        <button class="cne-close">×</button>
      </div>
      <div class="cne-body">
        <textarea class="cne-ta" id="cne-ta">${escapeHtml(note.text)}</textarea>
        <div class="cne-colors">
          ${COLORS.map(c => `<button class="cne-color cne-c-${c} ${c === chosenColor ? "sel" : ""}" data-c="${c}"></button>`).join("")}
        </div>
        <div class="cne-actions">
          <button class="cne-del btn btn-sm btn-danger" id="cne-del"><i data-lucide="trash-2" class="icon"></i>Delete note</button>
          <button class="cne-save btn btn-sm btn-primary" id="cne-save"><i data-lucide="check" class="icon"></i>Save changes</button>
        </div>
      </div>
    </div>`);

  document.body.append(overlay, pop);
  renderIcons(pop);

  const close = () => { overlay.remove(); pop.remove(); };
  overlay.addEventListener("click", close);
  $(".cne-close", pop).addEventListener("click", close);

  pop.querySelectorAll(".cne-color").forEach(b => b.addEventListener("click", () => {
    chosenColor = b.dataset.c;
    pop.querySelectorAll(".cne-color").forEach(x => x.classList.remove("sel"));
    b.classList.add("sel");
    pop.querySelector(".cne-dot").style.setProperty("background", `var(--anime-c-${chosenColor})`);
  }));

  $("#cne-save", pop).addEventListener("click", () => {
    const text = $("#cne-ta", pop).value.trim();
    if (!text) { $("#cne-ta", pop).style.borderColor = "#dc2626"; setTimeout(() => { const t = $("#cne-ta", pop); if (t) t.style.borderColor = ""; }, 700); return; }
    dayNotes[noteIdx] = { ...note, text, color: chosenColor };
    const all = loadUserNotes();
    all[key] = dayNotes;
    saveUserNotes(all);
    onChange && onChange();
    close();
    toast("Note updated", "success");
  });

  $("#cne-del", pop).addEventListener("click", () => {
    if (!confirm("Delete this note?")) return;
    dayNotes.splice(noteIdx, 1);
    const all = loadUserNotes();
    if (dayNotes.length) all[key] = dayNotes; else delete all[key];
    saveUserNotes(all);
    onChange && onChange();
    close();
    toast("Note deleted", "success");
  });

  setTimeout(() => { const ta = $("#cne-ta", pop); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 60);
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + "s ago";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return d.toLocaleDateString();
}

function buildMiniCalendar(el) {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const startDow = first.getDay();
  const daysInMonth = last.getDate();
  const monthName = today.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  let html = `<div class="cl-cal-head">${monthName}</div>
    <div class="cl-cal-grid">
      ${["S","M","T","W","T","F","S"].map(d => `<div class="cl-cal-dow">${d}</div>`).join("")}`;
  for (let i = 0; i < startDow; i++) html += `<div class="cl-cal-day cl-cal-empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate();
    html += `<div class="cl-cal-day ${isToday ? 'cl-cal-today' : ''}">${d}</div>`;
  }
  html += `</div>`;
  el.innerHTML = html;
}

// Paper-textured popup with full transcript and booking details.
async function openCallPaperPopup(callId) {
  const overlay = h(`<div class="cl-pop-overlay"></div>`);
  const pop = h(`
    <div class="cl-pop-paper">
      <div class="cl-pop-paper-bg"></div>
      <button class="cl-pop-close" title="Close">×</button>
      <div class="cl-pop-body" id="cl-pop-body">
        <div class="skel" style="height:24px;width:60%"></div>
        <div class="skel mt-3" style="height:80px"></div>
      </div>
    </div>`);
  document.body.append(overlay, pop);
  const close = () => { overlay.remove(); pop.remove(); };
  overlay.addEventListener("click", close);
  $(".cl-pop-close", pop).addEventListener("click", close);
  document.addEventListener("keydown", function escK(ev) {
    if (ev.key === "Escape") { close(); document.removeEventListener("keydown", escK); }
  });

  try {
    const c = await api(`/calls/${callId}`);
    let agentInfo = {};
    try { agentInfo = (await api(`/agents/${c.agent_id}`)).agent || {}; } catch { /* ok */ }
    const company = agentInfo.config?.business_name || "—";
    const callerName = c.caller_name || (c.booking_details && c.booking_details.name) || "Unknown caller";

    // Build a 5-line summary from whatever we have.
    function buildFiveLineSummary(call, ag) {
      const det = call.booking_details || {};
      const conv = (call.conversation || []);
      const firstLine = conv.find(t => t.role === "user")?.content?.trim();
      const lastAi = [...conv].reverse().find(t => t.role === "assistant")?.content?.trim();
      const goal = det.service || det.topic || det.reason || (call.is_urgent ? "Urgent issue raised" : "General inquiry");
      const outcome = call.booking_made
        ? `Booking confirmed${det.datetime || det.when || det.date ? ' for ' + (det.datetime || det.when || det.date) : ''}.`
        : call.is_urgent ? "Owner alerted on WhatsApp for follow-up."
        : "Caller acknowledged, no booking made.";
      const lines = [
        `Caller: ${callerName} (${call.caller_number || 'unknown number'}) reached ${ag.name || 'the agent'}${company !== '—' ? ' at ' + company : ''}.`,
        `Reason: ${goal}.`,
        firstLine ? `Opening: "${firstLine.slice(0, 140)}"` : `Opening: caller began conversation immediately.`,
        lastAi ? `Closing: "${lastAi.slice(0, 140)}"` : `Closing: agent ended the call politely.`,
        `Outcome: ${outcome} Total duration ${call.duration_seconds || 0}s.`,
      ];
      return lines;
    }
    const fiveLines = buildFiveLineSummary(c, agentInfo);

    const body = $("#cl-pop-body", pop);
    body.innerHTML = `
      <div class="cl-pop-head">
        <div>
          <div class="cl-pop-eyebrow">CALL FROM</div>
          <div class="cl-pop-num">${escapeHtml(c.caller_number || "Unknown")}</div>
          <div class="cl-pop-when">
            <strong>${escapeHtml(callerName)}</strong>
            ${company !== "—" ? ` · ${escapeHtml(company)}` : ""}
            ${c.created_at ? ` · ${new Date(c.created_at).toLocaleString()}` : ""}
          </div>
        </div>
        <div class="cl-pop-tags">
          ${c.is_urgent ? `<span class="cl-pop-tag cl-pop-tag-urgent">URGENT</span>` : ""}
          ${c.booking_made ? `<span class="cl-pop-tag cl-pop-tag-booked">BOOKED</span>` : ""}
          <span class="cl-pop-tag cl-pop-tag-muted">${c.duration_seconds || 0}s</span>
        </div>
      </div>

      <div class="cl-pop-section">
        <div class="cl-pop-section-title">5-line summary</div>
        <ol class="cl-pop-five">
          ${fiveLines.map(l => `<li>${escapeHtml(l)}</li>`).join("")}
        </ol>
      </div>

      ${c.summary ? `
        <div class="cl-pop-section">
          <div class="cl-pop-section-title">Notes from the agent</div>
          <div class="cl-pop-summary">${escapeHtml(c.summary)}</div>
        </div>` : ""}

      ${c.booking_details ? `
        <div class="cl-pop-section cl-pop-booking">
          <div class="cl-pop-section-title">Booking</div>
          <pre class="cl-pop-pre">${escapeHtml(JSON.stringify(c.booking_details, null, 2))}</pre>
        </div>` : ""}

      <div class="cl-pop-section">
        <div class="cl-pop-section-title">Your note on this call</div>
        <textarea class="cl-pop-callnote" id="cl-pop-callnote" placeholder="Add a private note for yourself…">${escapeHtml(loadCallNotes()[callId] || "")}</textarea>
        <div class="cl-pop-callnote-row">
          <span class="cl-pop-callnote-status" id="cl-pop-callnote-status"></span>
          <button class="cl-pop-callnote-save" id="cl-pop-callnote-save">Save note</button>
        </div>
      </div>

      <div class="cl-pop-section">
        <div class="cl-pop-section-title">Transcript</div>
        <div class="cl-pop-transcript">
          ${(c.conversation || []).map(t => `
            <div class="cl-pop-line cl-pop-line-${t.role}">
              <span class="cl-pop-role">${t.role === "user" ? "Caller" : "AI"}</span>
              <span class="cl-pop-text">${escapeHtml(t.content)}</span>
            </div>`).join("") || `<div class="cl-side-empty">No transcript captured.</div>`}
        </div>
      </div>
    `;
    // Wire per-call note save (persists in localStorage)
    const saveBtn = $("#cl-pop-callnote-save", pop);
    const noteEl  = $("#cl-pop-callnote", pop);
    const status  = $("#cl-pop-callnote-status", pop);
    const persist = () => {
      const all = loadCallNotes();
      const v = (noteEl.value || "").trim();
      if (v) all[callId] = v; else delete all[callId];
      saveCallNotes(all);
      status.textContent = "Saved ✓";
      setTimeout(() => { status.textContent = ""; }, 1400);
    };
    saveBtn && saveBtn.addEventListener("click", persist);
    noteEl && noteEl.addEventListener("blur", persist);
  } catch (e) {
    $("#cl-pop-body", pop).innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`;
  }
}

// Per-call private notes (separate from per-day notes)
const CL_CALL_NOTES_KEY = "oc_call_notes_v1";
function loadCallNotes() {
  try { return JSON.parse(localStorage.getItem(CL_CALL_NOTES_KEY) || "{}"); } catch { return {}; }
}
function saveCallNotes(map) { localStorage.setItem(CL_CALL_NOTES_KEY, JSON.stringify(map)); }

// === Agents page — visual builder with phone/whatsapp/agent/calendar/text/upload boxes
//     connected by curved lines with sticky notes ===
const AGB_BOX_DEFS = [
  { kind: "phone",      label: "Your Phone Line",        icon: "phone",          brand: "phone",    accent: "#0d6efd",
    note: "Forward your business number here. Callers get answered in 2 seconds." },
  { kind: "whatsapp",   label: "WhatsApp Notifications", icon: "message-circle", brand: "whatsapp", accent: "#25d366",
    note: "Owner gets a recap text the moment each caller hangs up." },
  { kind: "agentinfo",  label: "Agent Identity",         icon: "user-circle",    brand: "agent",    accent: "#f59e0b",
    note: "Give your AI a name, role, voice and the languages it speaks." },
  { kind: "calendar",   label: "Google Calendar",        icon: "calendar",       brand: "gcal",     accent: "#4285f4",
    note: "Bookings drop straight into your real calendar." },
  { kind: "gmail",      label: "Gmail Follow-ups",       icon: "mail",           brand: "gmail",    accent: "#ea4335",
    note: "Send the caller a personalised follow-up email after every call." },
  { kind: "points",     label: "Key Talking Points",     icon: "list",           brand: "text",     accent: "#eab308",
    note: "Important things the AI must mention — hours, prices, policies." },
  { kind: "upload",     label: "Business Knowledge",     icon: "upload-cloud",   brand: "upload",   accent: "#2563eb",
    note: "Paste text, a URL, or upload PDFs for the AI to learn from." },
];

function agbDefaultLayout(agent) {
  // Start with just the agentinfo box — user adds integrations with the "+" orb.
  return {
    boxes: [
      { id: "ag", kind: "agentinfo", x: 340, y: 180,
        data: { name: agent.config?.agent_name || agent.name || "My Agent", role: agent.config?.agent_type || "Voice AI Receptionist", bizName: agent.config?.business_name || "", bizType: agent.config?.business_type || "", greeting: "", persona: "" } },
    ],
    edges: [],
  };
}

route("agents", async () => {
  const action = h(`<button class="btn btn-primary"><i data-lucide="plus" class="icon"></i>New agent</button>`);
  action.addEventListener("click", () => navigate("#/agents/new"));
  const wrap = shell("agents", "Agents", "Your AI receptionists — build, activate, and manage.", action);
  const page = $("#page", wrap);
  page.innerHTML = `<div class="ag-loading">${skeleton(4)}</div>`;

  let agents = [], calls = [];
  try {
    const [ar, cr] = await Promise.all([api("/agents/list"), api("/calls/recent")]);
    agents = ar.agents || [];
    calls  = cr.calls  || [];
  } catch (e) {
    page.innerHTML = `<div class="card p-6 text-danger">${escapeHtml(e.message)}</div>`;
    return wrap;
  }

  if (!agents.length) {
    page.innerHTML = `
      <div class="ag-empty">
        <div class="ag-empty-inner">
          <div class="ag-empty-orb">OC</div>
          <h2 class="ag-empty-h">No agents yet</h2>
          <p class="ag-empty-p">Spin up your first AI receptionist in minutes — it'll answer every call, book appointments, and send you a WhatsApp summary.</p>
          <button class="btn btn-primary btn-lg" id="c1">
            <i data-lucide="sparkles" class="icon"></i>Create your first agent
          </button>
          <div class="ag-empty-chips">
            ${["Phone answering","Booking","WhatsApp summaries","30+ languages"].map(f=>`<span class="ag-empty-chip">${f}</span>`).join("")}
          </div>
        </div>
      </div>`;
    renderIcons(page);
    $("#c1", page).addEventListener("click", () => navigate("#/agents/new"));
    return wrap;
  }

  // --- Stats row + card grid ---
  const liveCount = agents.filter(a => a.is_active).length;
  const urgentCalls = calls.filter(c => c.is_urgent).length;

  page.innerHTML = `
    <div class="ag-stats-row">
      <div class="ag-stat">
        <div class="ag-stat-ic ag-stat-ic-indigo"><i data-lucide="bot" class="icon"></i></div>
        <div><div class="ag-stat-val">${agents.length}</div><div class="ag-stat-lbl">Agents</div></div>
      </div>
      <div class="ag-stat">
        <div class="ag-stat-ic ag-stat-ic-green"><i data-lucide="radio" class="icon"></i></div>
        <div><div class="ag-stat-val">${liveCount}</div><div class="ag-stat-lbl">Live</div></div>
      </div>
      <div class="ag-stat">
        <div class="ag-stat-ic ag-stat-ic-amber"><i data-lucide="phone-call" class="icon"></i></div>
        <div><div class="ag-stat-val">${calls.length}</div><div class="ag-stat-lbl">Recent calls</div></div>
      </div>
      ${urgentCalls > 0 ? `
      <div class="ag-stat">
        <div class="ag-stat-ic ag-stat-ic-red"><i data-lucide="alert-triangle" class="icon"></i></div>
        <div><div class="ag-stat-val">${urgentCalls}</div><div class="ag-stat-lbl">Urgent</div></div>
      </div>` : ""}
    </div>
    <div class="ag-grid" id="ag-grid"></div>`;
  renderIcons(page);

  const grid = $("#ag-grid", page);
  grid.innerHTML = agents.map((a) => {
    const cfg = a.config || {};
    const callCount = calls.filter(c => c.agent_id === a.id).length;
    const biz = cfg.business_name || cfg.business_type || "";
    const phone = a.twilio_number || "";
    const lang  = cfg.language || a.language || "English";
    const voice = a.voice_id || "Default";
    const colorIdx = a.id ? a.id.charCodeAt(0) % 6 : 0;
    const COLORS = ["#6366f1","#10b981","#f59e0b","#3b82f6","#ec4899","#8b5cf6"];
    const col = COLORS[colorIdx];
    return `
      <div class="ag-card">
        <div class="ag-card-header">
          <div class="ag-card-av" style="background:${col}22;border:1.5px solid ${col}44">
            <span class="ag-card-av-text" style="color:${col}">OC</span>
            ${a.is_active ? `<span class="ag-card-av-dot"></span>` : ""}
          </div>
          <div class="ag-card-id">
            <div class="ag-card-name">${escapeHtml(a.name)}</div>
            ${biz ? `<div class="ag-card-biz">${escapeHtml(biz)}</div>` : ""}
          </div>
          <span class="ag-card-status ${a.is_active ? "ag-status-live" : "ag-status-paused"}">
            ${a.is_active ? "Live" : "Paused"}
          </span>
        </div>

        <div class="ag-card-meta">
          ${phone ? `<div class="ag-meta-row"><i data-lucide="phone" class="icon"></i><span>${escapeHtml(phone)}</span></div>` : `<div class="ag-meta-row ag-meta-dim"><i data-lucide="phone-missed" class="icon"></i><span>No number linked</span></div>`}
          ${biz ? `` : `<div class="ag-meta-row ag-meta-dim"><i data-lucide="building-2" class="icon"></i><span>Open Flow to configure</span></div>`}
          ${(a.config?.agent_language || a.config?.voice_name) ? `
          <div class="ag-meta-row ag-meta-voice">
            <i data-lucide="mic-2" class="icon"></i>
            <span>${escapeHtml(a.config?.agent_language || "English")}${a.config?.voice_name ? " · " + escapeHtml(a.config.voice_name) : ""}</span>
          </div>` : ""}
        </div>

        <div class="ag-card-calls-bar">
          <div class="ag-calls-count">
            <span class="ag-calls-num">${callCount}</span>
            <span class="ag-calls-lbl">call${callCount !== 1 ? "s" : ""} handled</span>
          </div>
          <div class="ag-calls-mini-dots">
            ${Array.from({length: Math.min(callCount, 10)}, () => `<span class="ag-call-dot"></span>`).join("")}
          </div>
        </div>

        <div class="ag-card-actions">
          <button class="ag-btn ${a.is_active ? "ag-btn-warn" : "ag-btn-success"}" data-act="toggle" data-id="${a.id}" data-active="${a.is_active}">
            <i data-lucide="${a.is_active ? "pause" : "play"}" class="icon"></i>${a.is_active ? "Pause" : "Activate"}
          </button>
          <button class="ag-btn ag-btn-del" data-act="del" data-id="${a.id}" data-name="${escapeHtml(a.name)}" title="Delete">
            <i data-lucide="trash-2" class="icon"></i>
          </button>
        </div>
      </div>`;
  }).join("");

  renderIcons(grid);

  grid.querySelectorAll("[data-act]").forEach(btn => {
    btn.addEventListener("click", async ev => {
      ev.stopPropagation();
      const { act, id, name, active } = btn.dataset;
      if (act === "flow")   navigate(`#/agents/${id}/flow`);
      else if (act === "edit") navigate(`#/agents/${id}/edit`);
      else if (act === "toggle") {
        try {
          const isActive = active === "true";
          btn.disabled = true;
          await api(`/agents/${id}/${isActive ? "deactivate" : "activate"}`, { method: "POST" });
          toast(isActive ? "Agent paused" : "Agent is now live!", "success");
          location.reload();
        } catch (e) { toast(e.message, "error"); btn.disabled = false; }
      } else if (act === "del") {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
          await api(`/agents/${id}`, { method: "DELETE" });
          toast("Agent deleted", "success");
          location.reload();
        } catch (e) { toast(e.message, "error"); }
      }
    });
  });

  return wrap;
});

// First-time builder tutorial — shown once, gated by localStorage so even after
// deleting the agent the user never sees it again.
const BUILDER_TUTORIAL_KEY = "oc_seen_builder_tutorial";
function maybeShowBuilderTutorial(stage) {
  if (localStorage.getItem(BUILDER_TUTORIAL_KEY)) return;
  // Wait one frame so the canvas/orb have measured layouts
  requestAnimationFrame(() => showBuilderTutorial(stage));
}

function showBuilderTutorial(stage) {
  const isFirstEver = !localStorage.getItem(BUILDER_TUTORIAL_KEY);
  const canvas = $("#agb-canvas-wrap", stage);
  if (!canvas) return;

  const STEPS = [
    {
      target: () => $(".agb-orb", stage),
      title: "Meet your AI Agent",
      body: "This glowing orb is your Harkly AI agent — the brain that picks up the phone. Everything you add will plug into it.",
      placement: "right",
    },
    {
      target: () => $("#agb-orb-plus", stage),
      title: "Add an integration",
      body: "Click the plus to open the menu — phone, WhatsApp, Google Calendar, Gmail, FAQs, files. Click plus again any time to close it.",
      placement: "right",
    },
    {
      target: () => $(".agb-box", stage) || $(".agb-orb", stage),
      title: "Drag from anywhere",
      body: "Cards are draggable from anywhere on them — just press and move. Drop them wherever you want on the canvas.",
      placement: "bottom",
    },
    {
      target: () => $(".agb-handle-out", stage) || $(".agb-orb", stage),
      title: "Connect the dots",
      body: "Drag the small handle on the right edge of any card onto another card to connect them. Label the line with what should happen.",
      placement: "bottom",
    },
    {
      target: () => $("#agb-save", stage),
      title: "Save when ready",
      body: "Hit Save to lock in your setup. You can come back and edit any time — nothing's permanent.",
      placement: "bottom",
    },
  ];

  let i = 0;
  const overlay = h(`
    <div class="agb-tut-overlay" role="dialog" aria-label="Agent builder tutorial">
      <div class="agb-tut-mask"></div>
      <div class="agb-tut-spot" id="agb-tut-spot"></div>
      <div class="agb-tut-arrow" id="agb-tut-arrow"></div>
      <div class="agb-tut-card" id="agb-tut-card">
        <div class="agb-tut-step">Step <span id="agb-tut-i">1</span> of ${STEPS.length}</div>
        <div class="agb-tut-title" id="agb-tut-title"></div>
        <div class="agb-tut-body" id="agb-tut-body"></div>
        <div class="agb-tut-actions">
          ${isFirstEver ? `<button class="agb-tut-skip" id="agb-tut-skip">Skip tour</button>` : `<span></span>`}
          <div class="agb-tut-nav">
            <button class="agb-tut-back" id="agb-tut-back" disabled>← Back</button>
            <button class="agb-tut-next" id="agb-tut-next">Next →</button>
          </div>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);

  function close(markSeen) {
    if (markSeen) localStorage.setItem(BUILDER_TUTORIAL_KEY, "1");
    overlay.remove();
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
  }

  function place() {
    const step = STEPS[i];
    const target = step.target();
    if (!target) return;
    const r = target.getBoundingClientRect();
    const spot = $("#agb-tut-spot", overlay);
    const card = $("#agb-tut-card", overlay);
    const arrow = $("#agb-tut-arrow", overlay);
    const pad = 10;
    spot.style.left = (r.left - pad) + "px";
    spot.style.top  = (r.top - pad) + "px";
    spot.style.width = (r.width + pad * 2) + "px";
    spot.style.height = (r.height + pad * 2) + "px";

    // Card placement
    const cw = 320, ch = 180;
    let cx, cy, ax, ay, arot = 0;
    const placement = step.placement || "right";
    if (placement === "right" && r.right + cw + 40 < window.innerWidth) {
      cx = r.right + 28; cy = Math.max(20, r.top + r.height / 2 - ch / 2);
      ax = r.right + 4; ay = r.top + r.height / 2; arot = 0;
    } else if (placement === "bottom" && r.bottom + ch + 40 < window.innerHeight) {
      cx = Math.max(20, Math.min(window.innerWidth - cw - 20, r.left + r.width / 2 - cw / 2));
      cy = r.bottom + 28;
      ax = r.left + r.width / 2; ay = r.bottom + 4; arot = 90;
    } else {
      // Fallback above
      cx = Math.max(20, Math.min(window.innerWidth - cw - 20, r.left + r.width / 2 - cw / 2));
      cy = Math.max(20, r.top - ch - 28);
      ax = r.left + r.width / 2; ay = r.top - 4; arot = -90;
    }
    card.style.left = cx + "px";
    card.style.top  = cy + "px";
    arrow.style.left = ax + "px";
    arrow.style.top  = ay + "px";
    arrow.style.transform = `translate(-50%, -50%) rotate(${arot}deg)`;
  }
  function reposition() { try { place(); } catch (_) {} }

  function render() {
    const step = STEPS[i];
    $("#agb-tut-i", overlay).textContent = String(i + 1);
    $("#agb-tut-title", overlay).textContent = step.title;
    $("#agb-tut-body", overlay).textContent = step.body;
    $("#agb-tut-back", overlay).disabled = (i === 0);
    $("#agb-tut-next", overlay).textContent = (i === STEPS.length - 1) ? "Got it ✓" : "Next →";
    place();
  }

  $("#agb-tut-back", overlay).addEventListener("click", () => { if (i > 0) { i--; render(); } });
  $("#agb-tut-next", overlay).addEventListener("click", () => {
    if (i === STEPS.length - 1) { close(true); return; }
    // Auto-open the orb menu when we reach the "Add an integration" step preview
    if (i === 1) {
      const orbMenu = $("#agb-orb-menu", stage);
      const orbPlus = $("#agb-orb-plus", stage);
      if (orbMenu) { orbMenu.hidden = false; }
      if (orbPlus) orbPlus.classList.add("is-open");
    }
    i++; render();
  });
  const skipBtn = $("#agb-tut-skip", overlay);
  if (skipBtn) skipBtn.addEventListener("click", () => close(true));
  // Esc closes
  document.addEventListener("keydown", function onKey(e) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener("keydown", onKey);
      return;
    }
    if (e.key === "Escape") close(true);
  });
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  render();
}

// Builder canvas: draggable boxes, curved dotted connections with sticky-note labels.
function initBuilderCanvas(stage, layout) {
  const canvas = $("#agb-canvas", stage);
  const svg = $("#agb-svg", stage);
  const wrap = $("#agb-canvas-wrap", stage);

  const state = {
    dragBox: null,           // { id, ox, oy, mx, my }
    dragEdge: null,          // { fromId, gx, gy }
    selectedEdge: null,
  };

  const BOX_W = 260, BOX_H = 220;

  function defOf(kind) { return AGB_BOX_DEFS.find(d => d.kind === kind) || AGB_BOX_DEFS[0]; }
  function boxById(id) { return layout.boxes.find(b => b.id === id); }
  function genId() { return "b" + Math.random().toString(36).slice(2, 9); }

  function curvePath(a, b) {
    const sx = a.x + BOX_W, sy = a.y + BOX_H / 2;
    const tx = b.x,         ty = b.y + BOX_H / 2;
    const dx = Math.max(60, Math.abs(tx - sx) * 0.55);
    return `M ${sx} ${sy} C ${sx + dx} ${sy + 12}, ${tx - dx} ${ty - 12}, ${tx} ${ty}`;
  }
  function ghostPath(a, gx, gy) {
    const sx = a.x + BOX_W, sy = a.y + BOX_H / 2;
    const dx = Math.max(60, Math.abs(gx - sx) * 0.55);
    return `M ${sx} ${sy} C ${sx + dx} ${sy + 12}, ${gx - dx} ${gy - 12}, ${gx} ${gy}`;
  }

  // Brand-aware icon for the box header — every kind has a real brand SVG
  function boxHeadIcon(kind) {
    const def = defOf(kind);
    if (def.brand && BRAND_SVG[def.brand]) {
      return `<div class="agb-box-icon agb-box-icon-brand">${brandSvg(def.brand)}</div>`;
    }
    return `<div class="agb-box-icon"><i data-lucide="${def.icon}" class="icon"></i></div>`;
  }

  function renderBoxBody(box) {
    const def = defOf(box.kind);
    let body = "";
    if (box.kind === "phone") {
      const linked = !!(box.data.number || "").trim();
      body = `
        <div class="agb-phone-rings" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <label class="agb-flabel">Business phone number</label>
        <input class="agb-inline" data-field="number" placeholder="+1 555 0100" value="${escapeHtml(box.data.number || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Forwarding number</label>
        <input class="agb-inline" data-field="forward" placeholder="+1 555 0199" value="${escapeHtml(box.data.forward || '')}"/>
        <div class="agb-cal-status ${linked ? 'is-linked' : ''}" style="margin-top:6px">${linked ? '✓ Receiving calls' : 'Add your number to get started'}</div>`;
    } else if (box.kind === "whatsapp") {
      const linked = !!(box.data.number || "").trim();
      body = `
        <label class="agb-flabel">Owner WhatsApp number</label>
        <input class="agb-inline" data-field="number" placeholder="+1 555 0100" value="${escapeHtml(box.data.number || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Recap message</label>
        <input class="agb-inline" data-field="template" placeholder="Call recap for {name}: {summary}" value="${escapeHtml(box.data.template || '')}"/>
        <div class="agb-cal-status ${linked ? 'is-linked' : ''}" style="margin-top:6px">${linked ? '✓ Recaps will be sent here' : 'Owner gets a recap after every call'}</div>`;
    } else if (box.kind === "agentinfo") {
      const BIZ_TYPES = ["Hotel / Resort","Restaurant / Café","Medical Clinic","Dental Practice","Salon / Spa","Law Firm","Consultancy","Real Estate","Fitness / Gym","Retail Store","Startup / Tech","Other"];
      body = `
        <label class="agb-flabel">Agent name</label>
        <input class="agb-inline" data-field="name" placeholder="e.g. Maya" value="${escapeHtml(box.data.name || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Business name</label>
        <input class="agb-inline" data-field="bizName" placeholder="e.g. Sunrise Dental" value="${escapeHtml(box.data.bizName || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Business type</label>
        <select class="agb-inline" data-field="bizType">
          <option value="">Select type…</option>
          ${BIZ_TYPES.map(t => `<option value="${t}" ${box.data.bizType === t ? 'selected' : ''}>${t}</option>`).join("")}
        </select>
        <label class="agb-flabel" style="margin-top:6px">Greeting message</label>
        <input class="agb-inline" data-field="greeting" placeholder="e.g. Thank you for calling Sunrise Dental!" value="${escapeHtml(box.data.greeting || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Agent persona / tone</label>
        <input class="agb-inline" data-field="persona" placeholder="e.g. Warm, professional, empathetic" value="${escapeHtml(box.data.persona || '')}"/>`;
    } else if (box.kind === "calendar") {
      const linked = !!(box.data.url || "").trim();
      body = `
        <label class="agb-flabel">Calendar / booking link</label>
        <input class="agb-inline" data-field="url" placeholder="calendly.com/yourname" value="${escapeHtml(box.data.url || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Default meeting duration</label>
        <select class="agb-inline" data-field="duration">
          ${["15 min","30 min","45 min","60 min"].map(d =>
            `<option ${box.data.duration === d ? 'selected' : ''}>${d}</option>`).join("")}
        </select>
        <div class="agb-cal-status ${linked ? 'is-linked' : ''}" style="margin-top:6px">${linked ? '✓ Linked — bookings drop in' : 'Paste a Calendly or Google Meet link'}</div>`;
    } else if (box.kind === "gmail") {
      const linked = !!(box.data.email || "").trim();
      body = `
        <label class="agb-flabel">From email address</label>
        <input class="agb-inline" data-field="email" placeholder="hello@yourbiz.com" value="${escapeHtml(box.data.email || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Email subject line</label>
        <input class="agb-inline" data-field="subject" placeholder="Thanks for calling {business_name}" value="${escapeHtml(box.data.subject || '')}"/>
        <div class="agb-cal-status ${linked ? 'is-linked' : ''}" style="margin-top:6px">${linked ? '✓ Follow-ups will be sent' : 'Email caller a summary after the call'}</div>`;
    } else if (box.kind === "points") {
      const pts = Array.isArray(box.data.points) ? box.data.points : (box.data.points ? [box.data.points] : []);
      body = `
        <label class="agb-flabel">Title / topic</label>
        <input class="agb-inline" data-field="title" placeholder="e.g. Pricing FAQ" value="${escapeHtml(box.data.title || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Key talking points</label>
        <textarea class="agb-inline agb-textarea" data-field="content" placeholder="• We're open Mon–Sat 9am–6pm&#10;• Free estimates on all jobs&#10;• 10% off for first-time clients">${escapeHtml(box.data.content || '')}</textarea>`;
    } else if (box.kind === "upload") {
      const files = Array.isArray(box.data.files) ? box.data.files : [];
      body = `
        <label class="agb-flabel">Website URL (AI will learn from it)</label>
        <input class="agb-inline" data-field="url" placeholder="https://yourbiz.com" value="${escapeHtml(box.data.url || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Business hours</label>
        <input class="agb-inline" data-field="hours" placeholder="Mon–Fri 9am–6pm, Sat 10am–4pm" value="${escapeHtml(box.data.hours || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Services / products offered</label>
        <input class="agb-inline" data-field="services" placeholder="e.g. Haircut, Colour, Beard Trim" value="${escapeHtml(box.data.services || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Pricing summary</label>
        <input class="agb-inline" data-field="pricing" placeholder="e.g. Haircut ₹300, Colour from ₹800" value="${escapeHtml(box.data.pricing || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Address / location</label>
        <input class="agb-inline" data-field="address" placeholder="123 Main St, City, State" value="${escapeHtml(box.data.address || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Frequently asked questions</label>
        <textarea class="agb-inline agb-textarea" data-field="faq" placeholder="Q: Do you take walk-ins? A: Yes until 5pm.&#10;Q: Is parking available? A: Yes, free parking behind the building.">${escapeHtml(box.data.faq || '')}</textarea>
        <label class="agb-flabel" style="margin-top:6px">Extra knowledge (policies, notes, intake forms)</label>
        <textarea class="agb-inline agb-textarea" data-field="text" placeholder="Paste any additional info — menus, policies, staff bios…">${escapeHtml(box.data.text || '')}</textarea>
        <label class="agb-upload-label" style="margin-top:8px">
          <input type="file" class="agb-upload-input" data-field="files" multiple accept=".pdf,.doc,.docx,.txt,.csv"/>
          <span class="agb-upload-ic">${brandSvg("upload")}</span>
          <span>${files.length ? `${files.length} file(s) attached` : 'Upload PDF / DOC / TXT / CSV'}</span>
        </label>`;
    }
    return `
      <div class="agb-box-head" style="--ax:${def.accent}">
        ${boxHeadIcon(box.kind)}
        <div class="agb-box-title">${def.label}</div>
        <button class="agb-box-x" data-act="del" title="Delete">×</button>
      </div>
      <div class="agb-box-body">${body}</div>
      <div class="agb-handle agb-handle-in" title="Connect from here"></div>
      <div class="agb-handle agb-handle-out" title="Drag to connect to another card"></div>
    `;
  }

  function redraw() {
    // Boxes
    Array.from(canvas.querySelectorAll(".agb-box")).forEach(n => n.remove());
    layout.boxes.forEach(box => {
      const el = h(`
        <div class="agb-box agb-box-${box.kind}" data-id="${box.id}"
             style="left:${box.x}px;top:${box.y}px;width:${BOX_W}px;height:${BOX_H}px">
          ${renderBoxBody(box)}
        </div>`);
      canvas.appendChild(el);
    });
    renderIcons(canvas);

    // Edges (curved dotted SVG paths — double-click to delete)
    svg.innerHTML = `
      <defs>
        <marker id="agb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="rgba(15,15,20,0.55)"/>
        </marker>
      </defs>`;
    Array.from(canvas.querySelectorAll(".agb-edge-note")).forEach(n => n.remove());

    layout.edges.forEach((edge, idx) => {
      const a = boxById(edge.from), b = boxById(edge.to);
      if (!a || !b) return;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("class", "agb-edge");
      p.setAttribute("d", curvePath(a, b));
      p.setAttribute("data-i", idx);
      p.setAttribute("pointer-events", "stroke");
      p.style.cursor = "pointer";
      svg.appendChild(p);
      p.addEventListener("dblclick", () => {
        layout.edges.splice(idx, 1);
        redraw();
      });
    });

    // Ghost path while dragging an edge
    if (state.dragEdge) {
      const a = boxById(state.dragEdge.fromId);
      if (a) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("class", "agb-edge agb-edge-ghost");
        p.setAttribute("d", ghostPath(a, state.dragEdge.gx, state.dragEdge.gy));
        svg.appendChild(p);
      }
    }

    // Wire box interactions
    Array.from(canvas.querySelectorAll(".agb-box")).forEach(el => {
      const id = el.dataset.id;
      const box = boxById(id);
      // Drag from ANYWHERE on the box (except inputs/buttons/handles).
      el.addEventListener("mousedown", (ev) => {
        const t = ev.target;
        if (!t) return;
        if (t.closest(".agb-box-x")) return;                 // delete button
        if (t.closest(".agb-handle")) return;                // edge-handles handle their own drag
        if (t.matches("input, textarea, select, button, label, .agb-upload-label")) return;
        if (t.closest("input, textarea, select, button, label, .agb-upload-label")) return;
        ev.preventDefault();
        el.classList.add("is-dragging");
        state.dragBox = { id, ox: box.x, oy: box.y, mx: ev.clientX, my: ev.clientY };
      });
      // Language chip toggles for agentinfo card
      el.querySelectorAll(".agb-lang-chip").forEach(chip => {
        chip.addEventListener("mousedown", (ev) => ev.stopPropagation());
        chip.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const lang = chip.dataset.lang;
          if (!Array.isArray(box.data.languages)) box.data.languages = ["English (US)"];
          if (box.data.languages.includes(lang)) {
            box.data.languages = box.data.languages.filter(l => l !== lang);
          } else {
            box.data.languages = [...box.data.languages, lang];
          }
          chip.classList.toggle("sel", box.data.languages.includes(lang));
        });
      });
      // Field bindings
      el.querySelectorAll("[data-field]").forEach(inp => {
        inp.addEventListener("input", (ev) => {
          if (inp.type === "file") {
            box.data.files = Array.from(inp.files || []).map(f => ({ name: f.name, size: f.size, type: f.type }));
            redraw();
          } else {
            box.data[inp.dataset.field] = ev.target.value;
          }
        });
        inp.addEventListener("mousedown", (ev) => ev.stopPropagation());
      });
      el.querySelector('[data-act="del"]').addEventListener("click", (ev) => {
        ev.stopPropagation();
        layout.boxes = layout.boxes.filter(b => b.id !== id);
        layout.edges = layout.edges.filter(e => e.from !== id && e.to !== id);
        redraw();
      });
      // Out-handle drag → start edge
      el.querySelector(".agb-handle-out").addEventListener("mousedown", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        const r = canvas.getBoundingClientRect();
        state.dragEdge = { fromId: id, gx: ev.clientX - r.left, gy: ev.clientY - r.top };
        redraw();
      });
    });
  }

  // Window-level mouse handlers
  function onMove(ev) {
    if (state.dragBox) {
      const box = boxById(state.dragBox.id);
      if (box) {
        box.x = Math.max(0, state.dragBox.ox + (ev.clientX - state.dragBox.mx));
        box.y = Math.max(0, state.dragBox.oy + (ev.clientY - state.dragBox.my));
        const el = canvas.querySelector(`.agb-box[data-id="${box.id}"]`);
        if (el) { el.style.left = box.x + "px"; el.style.top = box.y + "px"; }
        // Redraw only edges + notes for performance
        redrawEdgesOnly();
      }
    } else if (state.dragEdge) {
      const r = canvas.getBoundingClientRect();
      state.dragEdge.gx = ev.clientX - r.left;
      state.dragEdge.gy = ev.clientY - r.top;
      redrawEdgesOnly();
    }
  }
  function onUp(ev) {
    if (state.dragEdge) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest && el.closest(".agb-box");
      if (target && target.dataset.id !== state.dragEdge.fromId) {
        const toId = target.dataset.id;
        if (!layout.edges.find(e => e.from === state.dragEdge.fromId && e.to === toId)) {
          layout.edges.push({ from: state.dragEdge.fromId, to: toId, note: "" });
        }
      }
      state.dragEdge = null;
      redraw();
    }
    if (state.dragBox) {
      const el = canvas.querySelector(`.agb-box[data-id="${state.dragBox.id}"]`);
      if (el) el.classList.remove("is-dragging");
    }
    state.dragBox = null;
  }

  function redrawEdgesOnly() {
    // Re-render svg edges without rebuilding boxes; no sticky-note labels
    svg.innerHTML = `
      <defs>
        <marker id="agb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="rgba(15,15,20,0.55)"/>
        </marker>
      </defs>`;
    Array.from(canvas.querySelectorAll(".agb-edge-note")).forEach(n => n.remove());
    layout.edges.forEach((edge, idx) => {
      const a = boxById(edge.from), b = boxById(edge.to);
      if (!a || !b) return;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("class", "agb-edge");
      p.setAttribute("d", curvePath(a, b));
      p.setAttribute("data-i", idx);
      p.setAttribute("pointer-events", "stroke");
      p.style.cursor = "pointer";
      svg.appendChild(p);
      p.addEventListener("dblclick", () => {
        layout.edges.splice(idx, 1); redraw();
      });
    });
    if (state.dragEdge) {
      const a = boxById(state.dragEdge.fromId);
      if (a) {
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("class", "agb-edge agb-edge-ghost");
        p.setAttribute("d", ghostPath(a, state.dragEdge.gx, state.dragEdge.gy));
        svg.appendChild(p);
      }
    }
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  // Cleanup when stage detaches (best effort)
  const cleanupObserver = new MutationObserver(() => {
    if (!document.body.contains(stage)) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanupObserver.disconnect();
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });

  // Drag from palette to canvas
  stage.querySelectorAll(".agb-pal-item").forEach(item => {
    item.addEventListener("dragstart", ev => ev.dataTransfer.setData("text/plain", item.dataset.kind));
  });
  wrap.addEventListener("dragover", ev => ev.preventDefault());
  wrap.addEventListener("drop", ev => {
    ev.preventDefault();
    const kind = ev.dataTransfer.getData("text/plain");
    if (!kind) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.max(0, ev.clientX - r.left - BOX_W / 2);
    const y = Math.max(0, ev.clientY - r.top - BOX_H / 2);
    layout.boxes.push({ id: genId(), kind, x, y, data: {} });
    redraw();
  });

  redraw();
}

function agentForm(initial = null) {
  const def = {
    name: "", twilio_number: "", forwarding_number: "",
    config: {
      business_name: "", business_type: "", agent_name: "", greeting_message: "How can I help you today?",
      operating_hours: "Mon–Sat 9am–6pm", services: "", location: "", pricing: "",
      faqs: "", booking_instructions: "", escalation_triggers: "emergency, urgent",
      owner_name: "", owner_whatsapp: "", language: "English", calendly_url: "",
    },
  };
  const v = initial ? { ...def, ...initial, config: { ...def.config, ...(initial.config || {}) } } : def;
  return h(`
    <form id="agent-form" class="grid" style="gap:18px">
      <section class="card p-5">
        <div class="font-semibold mb-3">Identity & numbers</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Agent label</label><input class="field" name="name" value="${escapeHtml(v.name)}" required placeholder="Front desk"/></div>
          <div><label class="label">Receptionist name</label><input class="field" name="agent_name" value="${escapeHtml(v.config.agent_name)}" placeholder="Priya"/></div>
          <div><label class="label">Twilio number</label><input class="field" name="twilio_number" value="${escapeHtml(v.twilio_number)}" placeholder="+15555550111"/></div>
          <div><label class="label">Owner WhatsApp</label><input class="field" name="owner_whatsapp" value="${escapeHtml(v.config.owner_whatsapp)}" placeholder="+15555550100"/></div>
          <div><label class="label">Forwarding number</label><input class="field" name="forwarding_number" value="${escapeHtml(v.forwarding_number)}" placeholder="+15555550199"/></div>
          <div><label class="label">Language</label>
            <select class="field" name="language">
              ${["English","Hindi","Hinglish","Tamil"].map(l => `<option ${v.config.language===l?'selected':''}>${l}</option>`).join("")}
            </select>
          </div>
        </div>
      </section>
      <section class="card p-5">
        <div class="font-semibold mb-3">Business</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Business name</label><input class="field" name="business_name" value="${escapeHtml(v.config.business_name)}" placeholder="City Dental" required/></div>
          <div><label class="label">Business type</label><input class="field" name="business_type" value="${escapeHtml(v.config.business_type)}" placeholder="clinic / hotel / salon"/></div>
          <div><label class="label">Operating hours</label><input class="field" name="operating_hours" value="${escapeHtml(v.config.operating_hours)}"/></div>
          <div><label class="label">Owner name</label><input class="field" name="owner_name" value="${escapeHtml(v.config.owner_name)}" placeholder="Dr. Sarah"/></div>
          <div><label class="label">Location</label><input class="field" name="location" value="${escapeHtml(v.config.location)}" placeholder="MG Road"/></div>
          <div><label class="label">Pricing summary</label><input class="field" name="pricing" value="${escapeHtml(v.config.pricing)}" placeholder="Cleaning ₹500, Checkup ₹300"/></div>
        </div>
        <div class="mt-3"><label class="label">Services</label><textarea class="field" name="services" placeholder="What you offer">${escapeHtml(v.config.services)}</textarea></div>
        <div class="mt-3"><label class="label">FAQs (one per line)</label><textarea class="field" name="faqs" placeholder="Q: Do you take insurance?&#10;A: Yes, all major plans">${escapeHtml(v.config.faqs)}</textarea></div>
      </section>
      <section class="card p-5">
        <div class="font-semibold mb-3">Booking & escalation</div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">Calendly URL</label><input class="field" name="calendly_url" value="${escapeHtml(v.config.calendly_url)}" placeholder="https://calendly.com/your-business"/></div>
          <div><label class="label">Escalation triggers</label><input class="field" name="escalation_triggers" value="${escapeHtml(v.config.escalation_triggers)}"/></div>
        </div>
        <div class="mt-3"><label class="label">Booking instructions</label><textarea class="field" name="booking_instructions" placeholder="When a caller asks to book…">${escapeHtml(v.config.booking_instructions)}</textarea></div>
        <div class="mt-3"><label class="label">Greeting message</label><input class="field" name="greeting_message" value="${escapeHtml(v.config.greeting_message)}"/></div>
      </section>
      <div class="flex gap-2">
        <button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${initial ? "Save changes" : "Create agent"}</button>
      </div>
      <div id="err" class="text-xs text-danger hidden"></div>
    </form>`);
}

function readAgentForm(form) {
  const get = (n) => form.querySelector(`[name="${n}"]`)?.value || "";
  return {
    name: get("name"),
    twilio_number: get("twilio_number"),
    forwarding_number: get("forwarding_number"),
    config: {
      business_name: get("business_name"), business_type: get("business_type"),
      agent_name: get("agent_name"), greeting_message: get("greeting_message"),
      operating_hours: get("operating_hours"), services: get("services"),
      location: get("location"), pricing: get("pricing"),
      faqs: get("faqs"), booking_instructions: get("booking_instructions"),
      escalation_triggers: get("escalation_triggers"),
      owner_name: get("owner_name"), owner_whatsapp: get("owner_whatsapp"),
      language: get("language"), calendly_url: get("calendly_url"),
    },
  };
}

// Skip the form. Spin up a sensibly-named blank agent and drop the user straight onto
// the drag-and-drop canvas — exactly like Make.com.
route("agentNew", async () => {
  const wrap = shell("agents", "Create agent", "Building your blank canvas…");
  const page = $("#page", wrap);
  page.innerHTML = `<div class="agb-empty"><div class="agb-empty-card">
    <i data-lucide="loader" class="icon agb-empty-icon"></i>
    <h2>Spinning up a blank agent…</h2>
    <p>You'll be on the canvas in a second.</p>
  </div></div>`;
  renderIcons(page);
  try {
    let n = 1;
    try {
      const list = await api("/agents/list");
      n = (list.agents || []).length + 1;
    } catch { /* ok */ }
    const created = await api("/agents/create", {
      method: "POST",
      body: {
        name: `New agent ${n}`,
        twilio_number: "",
        forwarding_number: "",
        config: {
          business_name: "", business_type: "",
          agent_name: "", greeting_message: "How can I help you today?",
          operating_hours: "Mon–Sat 9am–6pm", services: "",
          location: "", pricing: "", faqs: "", booking_instructions: "",
          escalation_triggers: "emergency, urgent",
          owner_name: "", owner_whatsapp: "",
          language: "English", calendly_url: "",
        },
      },
    });
    toast("Agent created — let's build it!", "success");
    navigate(`#/agents/${created.agent.id}/flow`);
  } catch (ex) {
    page.innerHTML = `<div class="card p-6 text-danger">${escapeHtml(ex.message)}</div>`;
  }
  return wrap;
});

route("agentEdit", async (id) => {
  const wrap = shell("agents", "Edit agent", "Profile, business knowledge, and the agent's voice & language.");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(4);
  try {
    const a = (await api(`/agents/${id}`)).agent;
    if (!a) throw new Error("Agent not found");
    page.innerHTML = "";
    const form = agentForm(a);
    page.appendChild(form);
    $("#cancel", form).addEventListener("click", () => navigate("#/agents"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        // Preserve existing flow when saving profile changes.
        const body = readAgentForm(form);
        if (a.config && a.config.flow) body.config.flow = a.config.flow;
        await api(`/agents/${id}`, { method: "PUT", body });
        toast("Saved", "success");
      } catch (ex) { $("#err", form).textContent = ex.message; $("#err", form).classList.remove("hidden"); }
    });
  } catch (e) { page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
  return wrap;
});

route("agentSetup", async (id) => {
  const wrap = shell("agents", "Connect this agent", "Wire up the phone, WhatsApp, and bookings — one step at a time.");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(3);
  try {
    const a = (await api(`/agents/${id}`)).agent;
    if (!a) throw new Error("Agent not found");

    const status = a.connection_status || {};
    const cfg = a.config || {};
    const stepRow = (n, title, body, done, action) => `
      <div class="connect-step ${done ? 'done' : ''}">
        <div class="step-num">${done ? '✓' : n}</div>
        <div>
          <h4>${escapeHtml(title)}</h4>
          <p>${body}</p>
        </div>
        <div>${action || ''}</div>
      </div>`;

    const phoneAction = a.twilio_number
      ? `<button class="btn btn-sm" data-act="copy-num">Copy ${escapeHtml(a.twilio_number)}</button>`
      : `<button class="btn btn-sm btn-primary" data-act="edit-phone">Add number</button>`;
    const waAction = cfg.owner_whatsapp
      ? `<button class="btn btn-sm" data-act="edit-wa">Edit</button>`
      : `<button class="btn btn-sm btn-primary" data-act="edit-wa">Add WhatsApp</button>`;
    const bookAction = cfg.calendly_url
      ? `<button class="btn btn-sm" data-act="edit-book">Edit</button>`
      : `<button class="btn btn-sm" data-act="edit-book">Add link</button>`;
    const flowAction = status.flow_configured
      ? `<button class="btn btn-sm" data-act="flow">Open</button>`
      : `<button class="btn btn-sm btn-primary" data-act="flow">Build</button>`;
    const activateAction = a.is_active
      ? `<button class="btn btn-sm" data-act="pause">Pause agent</button>`
      : `<button class="btn btn-sm btn-primary" data-act="activate">Go live</button>`;

    const carrierBlock = a.twilio_number ? `
      <div class="card p-5 mt-4">
        <div class="font-semibold mb-1">Forward your business number</div>
        <div class="text-xs text-muted mb-3">Harkly AI only answers calls you miss — your phone always rings first.</div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="stat-label mb-2">Activate code</div>
            <div class="flex items-center gap-2">
              <div class="code-chip" id="code">…</div>
              <button class="btn btn-sm" id="copy-code"><i data-lucide="copy" class="icon"></i></button>
            </div>
            <div class="text-xs text-muted mt-2">Deactivate any time with <strong id="dcode">#71</strong></div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="stat-label">Your phone / carrier</div>
              <select id="carrier" class="field" style="max-width:180px">
                ${[
                  { v: "iphone", l: "iPhone" }, { v: "android", l: "Android" },
                  { v: "airtel", l: "Airtel" }, { v: "jio", l: "Jio" },
                  { v: "bsnl", l: "BSNL" }, { v: "vi", l: "Vi" },
                  { v: "generic", l: "Other" },
                ].map(c => `<option value="${c.v}">${c.l}</option>`).join("")}
              </select>
            </div>
            <div id="note" class="text-sm" style="line-height:1.5">…</div>
          </div>
        </div>
      </div>
      <div class="card p-5 mt-4">
        <div class="font-semibold mb-2">Twilio webhook (one-time)</div>
        <div class="text-xs text-muted mb-2">In Twilio console, set Voice → A Call Comes In → POST →</div>
        <div class="code-chip">${escapeHtml(window.location.origin + "/calls/incoming")}</div>
      </div>
    ` : "";

    page.appendChild(h(`
      <div class="grid" style="grid-template-columns: 1.4fr 1fr; gap:18px">
        <div>
          <div class="card p-5">
            <div class="font-semibold mb-1">Setup checklist</div>
            <div class="text-xs text-muted mb-4">Finish each step to get your AI receptionist live.</div>
            ${stepRow(1, "Add a Twilio phone number", "This is the number callers dial (or that your business phone forwards to).", !!status.phone, phoneAction)}
            ${stepRow(2, "WhatsApp summaries", "Where you receive call summaries and urgent alerts after each call.", !!status.whatsapp, waAction)}
            ${stepRow(3, "Booking link (optional)", "Calendly URL the AI shares when a caller wants to book.", !!status.booking, bookAction)}
            ${stepRow(4, "Design the conversation flow", "Drag-and-drop the steps your AI should follow on every call.", !!status.flow_configured, flowAction)}
            ${stepRow(5, "Go live", a.is_active ? "Your agent is currently answering calls." : "Activate to start handling missed calls.", a.is_active, activateAction)}
          </div>
          ${carrierBlock}
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="card p-4" id="svp-card">
            ${(cfg.agent_name && cfg.agent_name.trim() && cfg.language && cfg.language.trim() && cfg.business_name && cfg.business_name.trim()) ? `
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="font-semibold" style="font-size:13px">Voice Preview</div>
                <div class="text-xs text-muted">Hear exactly how your agent will greet callers.</div>
              </div>
              <button class="dash-prev-play" id="svp-play" style="padding:8px 14px;font-size:12px">
                <span class="dash-prev-dot"></span><span id="svp-lbl">Play</span>
              </button>
            </div>
            <canvas id="svp-wave" class="dash-prev-wave" style="height:60px;margin-bottom:10px"></canvas>
            <div style="display:flex;gap:5px;flex-wrap:wrap">
              ${PREVIEW_VOICES.map((v, i) => `
                <button class="dash-prev-voice ${i === 0 ? 'active' : ''}" data-svid="${v.id}" style="flex:1;min-width:64px;padding:6px 4px">
                  <div class="dash-prev-voice-name" style="font-size:11px">${v.label}</div>
                  <div class="dash-prev-voice-sub" style="font-size:9.5px">${v.sub}</div>
                </button>`).join("")}
            </div>
            ` : `
            <div class="font-semibold mb-2" style="font-size:13px">Voice Preview</div>
            <div class="svp-incomplete">
              <div class="svp-incomplete-icon">🎙️</div>
              <div class="svp-incomplete-title">Agent not fully configured</div>
              <div class="svp-incomplete-sub">Create and complete the agent properly with data and activate it before using the voice preview.</div>
            </div>
            `}
          </div>
          <div class="card p-5" style="display:flex;flex-direction:column;max-height:60vh">
            <div class="font-semibold mb-1">Try it in chat</div>
            <div class="text-xs text-muted mb-3">Test the AI with text — same brain that answers your calls.</div>
            ${testChatWidget(id)}
          </div>
        </div>
      </div>
    `));
    renderIcons(page);

    // ── Setup-page mini voice preview ─────────────────────────────────────────
    (function initSetupVoicePreview() {
      const svpCanvas = page.querySelector("#svp-wave");
      const svpPlay   = page.querySelector("#svp-play");
      const svpLbl    = page.querySelector("#svp-lbl");
      if (!svpCanvas || !svpPlay) return;
      const ctx2 = svpCanvas.getContext("2d");
      let spk2 = false, t2 = 0, lv2 = 0.1, raf2 = null, cPitch2 = 1.15;
      let sVoice2 = PREVIEW_VOICES[0];
      const dpr2 = window.devicePixelRatio || 1;
      function sz2() { const r = svpCanvas.getBoundingClientRect(); svpCanvas.width = r.width*dpr2; svpCanvas.height = r.height*dpr2; }
      window.addEventListener("resize", sz2);
      function dw2() {
        t2 += 0.035*(0.7 + cPitch2*0.3); lv2 += ((spk2 ? 0.88 : 0.08) - lv2)*0.06;
        const w = svpCanvas.width, h = svpCanvas.height;
        if (!w || !h) { raf2 = requestAnimationFrame(dw2); return; }
        ctx2.clearRect(0, 0, w, h);
        const bars = 40, bw = w/bars;
        for (let i = 0; i < bars; i++) {
          const phase = i*0.4 + t2;
          const amp = Math.sin(phase)*0.35 + Math.sin(phase*1.7)*0.35 + Math.sin(phase*0.6)*0.3;
          const bh = Math.max(3*dpr2, Math.abs(amp)*lv2*h*0.88);
          const ratio = i/bars;
          ctx2.fillStyle = `rgba(${Math.round(255-ratio*156)},${Math.round(138-ratio*36)},${Math.round(61+ratio*180)},0.88)`;
          ctx2.fillRect(i*bw+bw*0.18, (h-bh)/2, bw*0.64, bh);
        }
        raf2 = requestAnimationFrame(dw2);
      }
      requestAnimationFrame(() => { sz2(); dw2(); });
      // Map the agent's stored language (plain word like "Hindi") to a PREVIEW_LANGS label
      const LANG_LABEL_MAP = { Hindi:"Hindi (हिंदी)", Spanish:"Spanish (Español)", French:"French (Français)", Mandarin:"Mandarin (普通话)", Vietnamese:"Vietnamese (Tiếng Việt)", Arabic:"Arabic (العربية)", German:"German (Deutsch)", Japanese:"Japanese (日本語)", Portuguese:"Portuguese (Português)", Korean:"Korean (한국어)" };
      let svpLangLabel = LANG_LABEL_MAP[cfg.language] || "English (US)";
      const agentName = cfg.agent_name || "your AI receptionist";
      const bizName   = cfg.business_name || "Harkly AI";
      const SVP_ASSISTANT_ID = "d5f28a96-25da-4905-bac8-5dee52a15f4e";
      let svpCallActive = false;
      function svpOverrides() { return buildVapiOverrides(sVoice2, svpLangLabel, cfg.agent_type || null, cfg); }

      let svpTimeout;
      const svpReset = () => {
        clearTimeout(svpTimeout);
        svpCallActive = false; spk2 = false;
        svpLbl.textContent = "Play"; svpPlay.classList.remove("playing"); svpPlay.disabled = false;
      };
      const svpCbs = {
        onStart: () => { clearTimeout(svpTimeout); svpCallActive = true; spk2 = true; svpLbl.textContent = "🛑 Stop"; svpPlay.classList.add("playing"); svpPlay.disabled = false; },
        onEnd:         () => { svpReset(); },
        onSpeechStart: () => { spk2 = true;  lv2 = 0.88; },
        onSpeechEnd:   () => { spk2 = false; lv2 = 0.12; },
        onVolume: (vol) => { lv2 = 0.12 + vol * 0.80; },
        onError: () => { svpReset(); toast("Could not start preview — allow microphone access and retry", "error"); },
      };

      // Hot-swap when voice changed while call is active
      async function svpHotSwap() {
        if (!svpCallActive) return;
        svpLbl.textContent = "Switching…"; svpPlay.disabled = true;
        spk2 = false; lv2 = 0.12;
        await restartVapiCall(SVP_ASSISTANT_ID, svpOverrides(), svpCbs);
      }

      // Voice buttons — update + hot-swap if live
      page.querySelectorAll("[data-svid]").forEach(b => b.addEventListener("click", () => {
        page.querySelectorAll("[data-svid]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        sVoice2 = PREVIEW_VOICES.find(v => v.id === b.dataset.svid) || PREVIEW_VOICES[0];
        cPitch2 = sVoice2.pitch;
        svpHotSwap();
      }));

      // Pre-warm mic on first hover
      svpPlay.addEventListener("pointerenter", () => {
        if (!_micPermitted) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(s => { s.getTracks().forEach(t => t.stop()); _micPermitted = true; preWarmWebRTC(); })
            .catch(() => {});
        } else {
          preWarmWebRTC(); // already have permission — just warm the ICE paths
        }
      }, { passive: true, once: true });

      svpPlay.addEventListener("click", () => {
        if (svpCallActive) { stopVapiCall(); return; }
        if (!getVapi()) { toast("Vapi unavailable — check your connection", "error"); return; }
        svpLbl.textContent = "Connecting…"; svpPlay.disabled = true;
        startVapiCall(SVP_ASSISTANT_ID, svpOverrides(), svpCbs);
        svpTimeout = setTimeout(() => { if (!svpCallActive) svpReset(); }, 8000);
      });
    })();

    // Wire up checklist actions
    page.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async () => {
      const act = b.dataset.act;
      if (act === "edit-phone" || act === "edit-wa" || act === "edit-book") {
        navigate(`#/agents/${id}/edit`);
      } else if (act === "flow") {
        navigate(`#/agents/${id}/flow`);
      } else if (act === "copy-num") {
        try { await navigator.clipboard.writeText(a.twilio_number); toast("Number copied", "success"); } catch { toast("Copy failed", "error"); }
      } else if (act === "activate" || act === "pause") {
        try {
          await api(`/agents/${id}/${act === "activate" ? "activate" : "deactivate"}`, { method: "POST" });
          toast(act === "activate" ? "Agent is live" : "Agent paused", "success");
          render();
        } catch (e) { toast(e.message, "error"); }
      }
    }));

    if (a.twilio_number) {
      mountTestChat(page.querySelector(".test-chat"), id, cfg);
      const fetchInst = async (carrier) => api(`/agents/${id}/setup-instructions?carrier=${carrier}`);
      const updateCarrier = async (c) => {
        const r = await fetchInst(c);
        $("#code", page).textContent = r.activate_code;
        $("#dcode", page).textContent = r.deactivate_code;
        $("#note", page).textContent = r.carrier_notes[c] || r.carrier_notes.generic;
      };
      await updateCarrier("iphone");
      $("#carrier", page).addEventListener("change", e => updateCarrier(e.target.value));
      $("#copy-code", page).addEventListener("click", async () => {
        try { await navigator.clipboard.writeText($("#code", page).textContent); toast("Copied", "success"); } catch { toast("Copy failed", "error"); }
      });
    } else {
      mountTestChat(page.querySelector(".test-chat"), id, cfg);
    }
  } catch (e) { page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
  return wrap;
});

function agentSubtabs(id, active) {
  const items = [
    { k: "flow", label: "Flow", icon: "git-branch", hash: `#/agents/${id}/flow` },
  ];
  const wrap = h(`<div class="subtabs">${items.map(i =>
    `<button class="subtab ${active===i.k?'active':''}" data-h="${i.hash}"><i data-lucide="${i.icon}" class="icon"></i>${i.label}</button>`).join("")}</div>`);
  $$("[data-h]", wrap).forEach(b => b.addEventListener("click", () => navigate(b.dataset.h)));
  return wrap;
}

function testChatWidget(id) {
  return `
    <div class="test-chat">
      <div class="messages"></div>
      <form class="test-chat-input">
        <input class="field" placeholder="Type as if you're the caller…" required/>
        <button class="btn btn-primary" type="submit"><i data-lucide="send" class="icon"></i></button>
      </form>
    </div>`;
}

function mountTestChat(root, agentId, cfg) {
  if (!root) return;
  const messages = root.querySelector(".messages");
  const form = root.querySelector(".test-chat-input");
  const input = form.querySelector("input");
  const greet = `Hello! Thanks for calling ${cfg.business_name || "us"}. ${cfg.greeting_message || "How can I help you today?"}`;
  const history = [];
  const push = (role, content) => {
    history.push({ role, content });
    const el = h(`<div class="msg ${role}">${escapeHtml(content)}</div>`);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  };
  push("assistant", greet);
  renderIcons(root);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    push("user", text);
    const typing = h(`<div class="msg assistant" style="opacity:0.7">…</div>`);
    messages.appendChild(typing);
    try {
      const r = await api(`/agents/${agentId}/test-chat`, { method: "POST", body: { message: text, history: history.slice(0, -1) } });
      typing.remove();
      push("assistant", r.reply || "(no reply)");
    } catch (ex) {
      typing.remove();
      push("assistant", "⚠️ " + ex.message);
    }
  });
}

route("settings", async () => {
  const wrap = shell("settings", "Settings", "Account, notifications and integration status.");
  const page = $("#page", wrap);
  const u = Store.user || {};
  const bp = u.business_profile || {};

  const TIMEZONES = [
    "UTC","Asia/Kolkata","Asia/Dubai","Asia/Singapore","Asia/Tokyo",
    "Asia/Shanghai","Asia/Seoul","Asia/Jakarta","Asia/Manila","Asia/Karachi",
    "Asia/Dhaka","Asia/Colombo","Asia/Kathmandu","Africa/Lagos","Africa/Nairobi",
    "Africa/Cairo","Europe/London","Europe/Paris","Europe/Berlin","Europe/Moscow",
    "America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
    "America/Sao_Paulo","America/Mexico_City","Australia/Sydney","Pacific/Auckland",
  ];

  page.innerHTML = `
    <div class="settings-grid">

      <!-- ── Account card ─────────────────────────────────────── -->
      <div class="card p-5">
        <div class="set-card-title"><i data-lucide="user" class="icon"></i>Account</div>
        <form id="set-acct-form">
          <div class="set-field-row">
            <div class="set-field">
              <label class="label">Display name</label>
              <input class="field" id="set-name" value="${escapeHtml(u.name||'')}" placeholder="Your name"/>
            </div>
            <div class="set-field">
              <label class="label">Username <span class="set-readonly-badge">read-only</span></label>
              <input class="field" value="${escapeHtml(u.username||u.name||'')}" disabled/>
            </div>
          </div>
          <div class="set-field-row">
            <div class="set-field">
              <label class="label">WhatsApp number <span class="set-hint">receives call summaries &amp; alerts</span></label>
              <input class="field" id="set-wa" value="${escapeHtml(u.whatsapp_number||'')}" placeholder="+1 555 000 0000" type="tel"/>
            </div>
            <div class="set-field">
              <label class="label">Timezone</label>
              <select class="field" id="set-tz">
                ${TIMEZONES.map(tz => `<option${tz === (bp.timezone||'Asia/Kolkata') ? ' selected' : ''}>${escapeHtml(tz)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="set-save-row">
            <span class="set-save-status" id="set-save-status"></span>
            <button class="btn btn-primary" type="submit" id="set-save">Save changes</button>
          </div>
        </form>
      </div>

      <!-- ── Notifications card ────────────────────────────────── -->
      <div class="card p-5">
        <div class="set-card-title"><i data-lucide="bell" class="icon"></i>Notifications</div>
        <div class="set-notif-list">
          <div class="set-notif-row">
            <div>
              <div class="set-notif-label">WhatsApp call summaries</div>
              <div class="set-notif-sub">Receive a short summary after every handled call</div>
            </div>
            <label class="set-toggle"><input type="checkbox" id="set-notif-wa" ${u.whatsapp_number ? "checked" : ""}/><span class="set-toggle-track"></span></label>
          </div>
          <div class="set-notif-row">
            <div>
              <div class="set-notif-label">Urgent alerts</div>
              <div class="set-notif-sub">Instant WhatsApp ping when a caller triggers an escalation</div>
            </div>
            <label class="set-toggle"><input type="checkbox" id="set-notif-urgent" checked/><span class="set-toggle-track"></span></label>
          </div>
          <div class="set-notif-row">
            <div>
              <div class="set-notif-label">Booking confirmations</div>
              <div class="set-notif-sub">Notify you when the AI books an appointment</div>
            </div>
            <label class="set-toggle"><input type="checkbox" id="set-notif-book" checked/><span class="set-toggle-track"></span></label>
          </div>
        </div>
        <div class="text-xs text-muted mt-3">Notifications are sent to your WhatsApp number above.</div>
      </div>

      <!-- ── Integration status card ───────────────────────────── -->
      <div class="card p-5" style="grid-column:1/-1">
        <div class="set-card-title"><i data-lucide="plug" class="icon"></i>Integration status</div>
        <div id="set-health" class="set-health-grid">${skeleton(2)}</div>
      </div>

    </div>`;
  renderIcons(page);

  // Save handler
  $("#set-acct-form", page).addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#set-save", page);
    const status = $("#set-save-status", page);
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const res = await api("/auth/profile", {
        method: "PUT",
        body: {
          name:             $("#set-name", page).value.trim(),
          whatsapp_number:  $("#set-wa",   page).value.trim(),
          timezone:         $("#set-tz",   page).value,
        },
      });
      if (res.user) { Object.assign(Store.user, res.user); }
      status.textContent = "Saved ✓"; status.style.color = "var(--success)";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch (err) {
      status.textContent = err.message; status.style.color = "var(--danger)";
    }
    btn.disabled = false; btn.textContent = "Save changes";
  });

  // Load health — response is { status, services: { database, openai, telnyx, … } }
  try {
    const h = await api("/health", { auth: false });
    const svc = h.services || {};
    const intRow = (label, ok, note="") => `
      <div class="set-int-row">
        <span class="set-int-dot ${ok ? 'set-int-ok' : 'set-int-off'}"></span>
        <div class="set-int-body">
          <div class="set-int-label">${label}</div>
          ${note ? `<div class="set-int-note">${escapeHtml(note)}</div>` : ""}
        </div>
        <span class="badge ${ok ? 'badge-success' : 'badge-muted'}">${ok ? 'Connected' : 'Not set'}</span>
      </div>`;
    $("#set-health", page).innerHTML = [
      intRow("PostgreSQL",         svc.database,    "Agent data, calls, users"),
      intRow("OpenAI (AI brain)",  svc.openai,      "Conversation intelligence"),
      intRow("Telnyx (calls)",     svc.telnyx,      "Inbound phone calls"),
      intRow("ElevenLabs (TTS)",   svc.elevenlabs,  "High-quality voice synthesis"),
      intRow("Twilio",             svc.twilio,      "Fallback voice & WhatsApp"),
      intRow("Stripe (billing)",   svc.stripe,      "Subscription management"),
      intRow("Redis (cache)",      svc.redis,       "Response caching & rate limits"),
      intRow("Google Calendar",    svc.google_calendar, "AI booking integration"),
    ].join("");
  } catch (e) { toast(e.message, "error"); }
  return wrap;
});

route("preview", async () => {
  const wrap = shell("preview", "Preview", "Hear your AI agent speak before going live.");
  const page = $("#page", wrap);

  let agents = [];
  try {
    const r = await api("/agents/list");
    agents = r.agents || [];
  } catch (_) {}

  // If no agents exist, show a friendly prompt
  if (!agents.length) {
    page.innerHTML = `
      <div class="pv2-no-agent">
        <div class="pv2-no-agent-icon"><i data-lucide="bot" class="icon"></i></div>
        <div class="pv2-no-agent-title">No agent created yet</div>
        <div class="pv2-no-agent-sub">Build your first AI agent and come back here to hear it speak in any of 30+ languages.</div>
        <button class="btn btn-primary mt-6" onclick="location.hash='#/agents'">Create your first agent →</button>
      </div>`;
    renderIcons(page);
    return wrap;
  }

  const firstAgent = agents[0];

  // Helper: match agent config to PREVIEW_VOICES/PREVIEW_LANGS indexes.
  // Checks all key variants: config.voice, config.voice_id, and agent.voice_id
  // (canvas saves to voice_id, quick-create saves to voice).
  function agentVoiceIdx(agent) {
    const v = agent?.config?.voice || agent?.config?.voice_id || agent?.voice_id;
    if (!v) return 0;
    const idx = PREVIEW_VOICES.findIndex(x => x.id === v || x.label.toLowerCase() === v.toLowerCase());
    return idx >= 0 ? idx : 0;
  }
  function agentLangIdx(agent) {
    const l = agent?.config?.language || agent?.language;
    if (!l) return 0;
    const idx = PREVIEW_LANGS.findIndex(x => x.toLowerCase().startsWith(l.toLowerCase()) || l.toLowerCase().startsWith(x.split(" ")[0].toLowerCase()));
    return idx >= 0 ? idx : 0;
  }

  // If the user came from the canvas builder, prefer its live state over the saved agent's config.
  // window.harklyCanvasState is set by the flow builder on every field change.
  const _cs = window.harklyCanvasState || null;
  let initVoiceIdx = _cs?.voiceId
    ? Math.max(0, PREVIEW_VOICES.findIndex(x => x.id === _cs.voiceId))
    : agentVoiceIdx(firstAgent);
  let initLangIdx = _cs?.language
    ? Math.max(0, PREVIEW_LANGS.findIndex(l => l.toLowerCase().startsWith((_cs.language || "").toLowerCase().split("-")[0])))
    : agentLangIdx(firstAgent);

  // Derive voice/lang display labels from agent config for the info badges
  const _initVoiceLabel = PREVIEW_VOICES[initVoiceIdx]?.label || "Maya";
  const _initLangLabel  = PREVIEW_LANGS[initLangIdx]  || "English (US)";

  page.innerHTML = `
    <div class="pv2-shell">

      <!-- LEFT: Agent selector only — voice & language come from agent config -->
      <div class="pv2-controls">
        <div class="pv2-ctrl-section">
          <div class="pv2-ctrl-label">Agent</div>
          <select class="pv2-select" id="pv2-agent-sel">
            ${agents.map((a, i) => `<option value="${i}">${escapeHtml(a.name)}${a.is_active ? " ●" : ""}</option>`).join("")}
          </select>
        </div>

        <div class="pv2-ctrl-section" style="margin-top:18px">
          <div class="pv2-ctrl-label" style="margin-bottom:8px">Configured from agent setup</div>
          <div class="pv2-cfg-badges" id="pv2-cfg-badges">
            <span class="pv2-cfg-badge" id="pv2-badge-voice">🎙️ <span id="pv2-badge-voice-txt">${escapeHtml(_initVoiceLabel)}</span></span>
            <span class="pv2-cfg-badge" id="pv2-badge-lang">🌐 <span id="pv2-badge-lang-txt">${escapeHtml(_initLangLabel)}</span></span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">Voice &amp; language are set in the agent builder (drag-and-drop setup). Change them there to update this preview.</div>
        </div>
      </div>

      <!-- RIGHT: Demo-style voice agent stage -->
      <div class="pv2-stage" id="pv-stage">
        <div class="pv2-stage-content">

          <div class="pv2-agent-label">
            <div class="pv2-agt-name" id="pv-agt-name">${escapeHtml(firstAgent.name)}</div>
            <div class="pv2-agt-role">Voice AI Receptionist</div>
          </div>

          <canvas class="pv2-wave" data-preview-canvas width="600" height="72"></canvas>

          <div class="pv2-play-row">
            <button class="pv2-play" data-preview-play>
              <span class="pv2-play-ic"><i data-lucide="play" class="icon"></i></span>
              <span data-preview-lbl>Play sample</span>
            </button>
          </div>

          <div class="pv2-status-row">
            <span class="pv2-status-dot" id="pv-status-dot"></span>
            <span class="pv2-status-txt" id="pv-status-txt">Ready to preview</span>
          </div>

        </div>
      </div>

    </div>
  `;
  renderIcons(page);

  let selVoice = PREVIEW_VOICES[initVoiceIdx];
  let selLang  = PREVIEW_LANGS[initLangIdx];
  let selAgent = firstAgent;

  function updateAgentName() {
    const el = $("#pv-agt-name", page);
    if (el) el.textContent = selAgent ? selAgent.name : "Harkly AI AI";
  }

  const agentSel = $("#pv2-agent-sel", page);
  function buildMergedCfg(agentCfg) {
    return Object.assign({}, agentCfg || {}, {
      business_name:     _cs?.business_name     || agentCfg?.business_name     || "",
      business_info:     _cs?.business_info     || agentCfg?.business_info     || "",
      business_hours:    _cs?.business_hours    || agentCfg?.business_hours    || "",
      business_services: _cs?.business_services || agentCfg?.business_services || "",
      business_pricing:  _cs?.business_pricing  || agentCfg?.business_pricing  || "",
      business_address:  _cs?.business_address  || agentCfg?.business_address  || "",
      business_faq:      _cs?.business_faq      || agentCfg?.business_faq      || "",
      calendly_url:      _cs?.calendly_url      || agentCfg?.calendly_url      || "",
    });
  }

  function updateConfigBadges() {
    const vt = $("#pv2-badge-voice-txt", page);
    const lt = $("#pv2-badge-lang-txt", page);
    if (vt) vt.textContent = selVoice?.label || "Maya";
    if (lt) lt.textContent = selLang || "English (US)";
  }

  if (agentSel) agentSel.addEventListener("change", () => {
    const i = +agentSel.value;
    selAgent = agents[i] || null;
    updateAgentName();
    const vi = agentVoiceIdx(selAgent);
    const li = agentLangIdx(selAgent);
    selVoice = PREVIEW_VOICES[vi];
    selLang  = PREVIEW_LANGS[li];
    updateConfigBadges();
    if (pvCtrl) {
      pvCtrl.setVoice(selVoice);
      pvCtrl.setLang(selLang);
      pvCtrl.setAgentConfig(buildMergedCfg(selAgent?.config));
    }
  });

  const stageEl = $("#pv-stage", page);
  const pvCtrl = mountVoicePreview(stageEl, selLang);
  if (pvCtrl) {
    pvCtrl.setVoice(selVoice);
    pvCtrl.setAgentConfig(buildMergedCfg(selAgent?.config));
  }

  return wrap;
});

route("billing", async () => {
  const wrap = shell("billing", "Billing", "Pick a plan that fits how busy your phone gets.");
  const page = $("#page", wrap);
  page.innerHTML = `
    <div id="status" class="card p-5 mb-4">${skeleton(1)}</div>
    <div class="grid grid-cols-3" id="plans">${skeleton(1)}${skeleton(1)}${skeleton(1)}</div>`;
  try {
    const [status, plans] = await Promise.all([api("/billing/status"), api("/billing/plans")]);
    const trialEnds = status.trial_ends_at ? new Date(status.trial_ends_at) : null;
    const days = trialEnds ? Math.max(0, Math.ceil((trialEnds - new Date()) / 86400000)) : null;
    $("#status", page).innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-muted">Current plan</div>
          <div class="text-xl font-semibold mt-1">${escapeHtml(status.plan_name)}</div>
          <div class="text-xs text-muted mt-1">Status: ${escapeHtml(status.status)}${days !== null && status.plan === 'trial' ? ` · ${days} days left in trial` : ''}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn" id="portal" ${status.stripe_customer_id ? '' : 'disabled'}>Manage subscription</button>
        </div>
      </div>
      ${!status.stripe_ready ? `<div class="mt-3 text-xs text-warning">Stripe is not configured yet — set <code>STRIPE_SECRET_KEY</code> and price IDs in Secrets to enable checkout.</div>` : ''}`;
    $("#portal", page).addEventListener("click", async () => {
      try { const r = await api("/billing/create-portal", { method: "POST" }); window.location.href = r.portal_url; }
      catch (e) { toast(e.message, "error"); }
    });
    const featured = "growth";
    $("#plans", page).innerHTML = Object.entries(plans.plans).map(([key, p]) => `
      <div class="card p-5 ${key===featured?'card-hover':''}" style="${key===featured?'border-color:var(--primary)':''}">
        ${key===featured?'<span class="badge badge-primary mb-3">Most popular</span>':''}
        <div class="text-lg font-semibold">${escapeHtml(p.name)}</div>
        <div class="mt-2"><span class="text-2xl font-bold">$${p.price_monthly}</span><span class="text-muted">/mo</span></div>
        <div class="text-xs text-muted mt-1">${p.calls_limit ? p.calls_limit + ' calls/mo' : 'Unlimited calls'}</div>
        <div class="divider"></div>
        <ul class="text-sm" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">
          <li class="flex items-center gap-2"><i data-lucide="check" class="icon" style="color:var(--success)"></i>AI voice receptionist</li>
          <li class="flex items-center gap-2"><i data-lucide="check" class="icon" style="color:var(--success)"></i>WhatsApp summaries</li>
          <li class="flex items-center gap-2"><i data-lucide="check" class="icon" style="color:var(--success)"></i>Calendly bookings</li>
          ${key!=='starter'?'<li class="flex items-center gap-2"><i data-lucide="check" class="icon" style="color:var(--success)"></i>Multi-language</li>':''}
          ${key==='scale'?'<li class="flex items-center gap-2"><i data-lucide="check" class="icon" style="color:var(--success)"></i>Priority support</li>':''}
        </ul>
        <button class="btn btn-primary mt-4" style="width:100%" data-plan="${key}" ${status.plan===key?'disabled':''}>${status.plan===key?'Current plan':'Choose '+p.name}</button>
      </div>`).join("");
    renderIcons($("#plans", page));
    $$("[data-plan]", page).forEach(b => b.addEventListener("click", async () => {
      try {
        const r = await api("/billing/create-checkout", { method: "POST", body: { plan: b.dataset.plan } });
        window.location.href = r.checkout_url;
      } catch (e) { toast(e.message, "error"); }
    }));
  } catch (e) { toast(e.message, "error"); }
  return wrap;
});

route("billingSuccess", async () => {
  const wrap = shell("billing", "Welcome aboard 🎉", "Your subscription is active.");
  $("#page", wrap).innerHTML = `<div class="card p-6 text-center"><i data-lucide="check-circle-2" class="icon" style="width:48px;height:48px;color:var(--success)"></i><div class="text-lg font-semibold mt-3">You're all set</div><div class="text-sm text-muted mt-2 mb-4">Your Harkly AI subscription is now active.</div><button class="btn btn-primary" id="go">Go to dashboard</button></div>`;
  renderIcons($("#page", wrap));
  $("#go", $("#page", wrap)).addEventListener("click", () => navigate("#/"));
  return wrap;
});

// --- Flow builder ---
const FLOW_NODE_TYPES = [
  { type: "greeting", label: "Greeting", icon: "smile", text: "Hello! Thanks for calling. How can I help you?" },
  { type: "ask", label: "Ask a question", icon: "help-circle", text: "Could I get your name and what you're calling about?" },
  { type: "info", label: "Share info", icon: "info", text: "Our hours are Mon–Sat, 9am–6pm." },
  { type: "branch", label: "Branch / decision", icon: "git-fork", text: "What does the caller want to do?" },
  { type: "book", label: "Book appointment", icon: "calendar-check", text: "Let's schedule that — what day works best?" },
  { type: "whatsapp", label: "Send WhatsApp", icon: "message-circle", text: "I'll text you the details on WhatsApp." },
  { type: "escalate", label: "Escalate to human", icon: "alert-triangle", text: "This sounds urgent — flagging the owner now." },
  { type: "end", label: "End call", icon: "phone-off", text: "Thanks for calling. Have a great day!" },
];

function nodeTypeMeta(type) {
  return FLOW_NODE_TYPES.find(t => t.type === type) || FLOW_NODE_TYPES[0];
}

function defaultFlow() {
  return {
    nodes: [
      { id: "n1", type: "greeting", label: "Greeting", text: "Hello! Thanks for calling. How can I help you today?", x: 200, y: 200 },
      { id: "n2", type: "ask", label: "What do they want", text: "Are you calling to book, with a question, or something urgent?", x: 500, y: 200 },
      { id: "n3", type: "branch", label: "Route", text: "Pick the right path", x: 800, y: 200 },
      { id: "n4", type: "book", label: "Book", text: "Let's get you on the schedule.", x: 1100, y: 80 },
      { id: "n5", type: "info", label: "Answer Q", text: "Share the relevant info from the FAQs.", x: 1100, y: 220 },
      { id: "n6", type: "escalate", label: "Urgent", text: "Flag the owner immediately.", x: 1100, y: 360 },
      { id: "n7", type: "end", label: "Wrap up", text: "Anything else I can help with?", x: 1400, y: 220 },
    ],
    edges: [
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4", label: "wants to book" },
      { from: "n3", to: "n5", label: "has a question" },
      { from: "n3", to: "n6", label: "is urgent" },
      { from: "n4", to: "n7" },
      { from: "n5", to: "n7" },
    ],
  };
}

route("agentFlow", async (id) => {
  const wrap = shell("agents", "Agent Builder", "Drag integrations from the panel onto the canvas. Connect cards to build your agent's call flow.");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(2);

  let a;
  try {
    a = (await api(`/agents/${id}`)).agent;
    if (!a) throw new Error("Agent not found");
  } catch (e) {
    page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`;
    return wrap;
  }

  const cfg = a.config || {};
  page.innerHTML = "";
  page.appendChild(agentSubtabs(id, "flow"));

  const INT_CARDS = [
    { type: "phone",     label: "Phone Number",     color: "#0D6EFD", brandKey: "phone",    icon: "phone"          },
    { type: "agent",     label: "Agent (AI Brain)", color: "#8B5CF6", brandKey: "agent",    icon: "cpu"            },
    { type: "whatsapp",  label: "WhatsApp Notify",  color: "#25D366", brandKey: "whatsapp", icon: "message-circle" },
    { type: "gmail",     label: "Gmail Follow-up",  color: "#EA4335", brandKey: "gmail",    icon: "mail"           },
    { type: "gcal",      label: "Google Calendar",  color: "#1A73E8", brandKey: "gcal",     icon: "calendar"       },
    { type: "voice",     label: "Voice Type",       color: "#F59E0B", brandKey: null,       icon: "mic"            },
    { type: "language",  label: "Language",         color: "#10B981", brandKey: null,       icon: "globe"          },
    { type: "info",      label: "Business Info",    color: "#6366F1", brandKey: null,       icon: "file-text"      },
    { type: "slack",     label: "Slack Alerts",     color: "#4A154B", brandKey: "slack",    icon: "layers"         },
  ];

  function genId() { return "c" + Math.random().toString(36).slice(2, 9); }

  // Auto-populate starter layout from existing agent config when no flow_v2 saved yet.
  // This means a brand-new agent lands on a canvas that already reflects its profile
  // (name, language, phone, business info) rather than a blank slate.
  function makeStarterLayout() {
    const pId = genId(), vId = genId(), lId = genId();
    const aId = genId(), iId = genId();
    const waId = cfg.owner_whatsapp ? genId() : null;
    const gcId = cfg.calendly_url   ? genId() : null;
    const cards = [
      { id: pId, type: "phone",    x: 30,  y: 50,  config: { phone: a.forwarding_number || "" } },
      { id: vId, type: "voice",    x: 370, y: 50,  config: { voice: cfg.voice_id || "maya" } },
      { id: lId, type: "language", x: 370, y: 250, config: { language: cfg.language || "English (US)" } },
      { id: aId, type: "agent",    x: 710, y: 50,  config: { name: cfg.agent_name || "", greeting: cfg.greeting_message || "How can I help you today?", biz_type: cfg.agent_type || "", text: "" } },
      { id: iId, type: "info",     x: 30,  y: 250, config: { bizname: cfg.business_name || "", hours: cfg.operating_hours || "", services: cfg.services || "", pricing: cfg.pricing || "", address: cfg.location || "", faq: cfg.faqs || "" } },
      ...(waId ? [{ id: waId, type: "whatsapp", x: 1050, y: 50,  config: { whatsapp: cfg.owner_whatsapp } }] : []),
      ...(gcId ? [{ id: gcId, type: "gcal",     x: 1050, y: 250, config: { calendly: cfg.calendly_url  } }] : []),
    ];
    const edges = [
      { from: pId, to: aId }, { from: vId, to: aId },
      { from: lId, to: aId }, { from: iId, to: aId },
      ...(waId ? [{ from: aId, to: waId }] : []),
      ...(gcId ? [{ from: aId, to: gcId }] : []),
    ];
    return { cards, edges };
  }

  const saved = (cfg.flow_v2?.cards?.length) ? cfg.flow_v2 : makeStarterLayout();
  const state = { cards: saved.cards, edges: saved.edges, dragEdgeFrom: null, mouse: { x: 0, y: 0 } };
  const CARD_W = 280, CARD_H = 152;

  // Start with an empty canvas — the tutorial guides first-time users through the panel

  function cardMeta(type) { return INT_CARDS.find(c => c.type === type) || INT_CARDS[3]; }

  const shellEl = h(`
    <div class="fb-shell">
      <div class="fb-canvas-area">
        <div class="fb-canvas-bar">
          <span class="fb-canvas-bar-title">Canvas · <span id="fb-cnt">0</span> cards</span>
          <div id="fb-act-bar" class="fb-act-bar"></div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" id="fb-guide" title="How to use the builder" style="gap:5px"><i data-lucide="book-open" class="icon" style="width:13px;height:13px"></i>Guide</button>
            <button class="btn btn-sm" id="fb-clear">Clear</button>
            <button class="btn btn-primary btn-sm" id="fb-save"><i data-lucide="save" class="icon"></i>Save &amp; activate</button>
          </div>
        </div>
        <div class="fb-canvas" id="fb-canvas">
          <svg class="fb-svg" id="fb-svg" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1"></svg>
          <div class="fb-items" id="fb-items" style="position:absolute;inset:0;z-index:2"></div>
          <div class="fb-empty-hint" id="fb-hint">
            <div class="fb-hint-arrow">←</div>
            <div>Drag integrations from the panel onto the canvas</div>
          </div>
        </div>
      </div>
      <aside class="fb-glass-panel">
        <div class="fb-gp-scroll">
          <div class="fb-gp-head">
            <div class="fb-gp-title">Integrations</div>
            <div class="fb-gp-sub">Drag to canvas · click to add</div>
          </div>
          <div class="fb-gp-list" id="fb-gp-list"></div>
          <div class="fb-gp-divider"></div>
          <div class="fb-gp-preview-head">Agent preview</div>
          <div class="fb-gp-preview" id="fb-gp-preview"><div class="fb-pv-empty">Fill cards to see a live preview.</div></div>
        </div>
      </aside>
    </div>
  `);

  page.appendChild(shellEl);
  renderIcons(shellEl);
  shellEl.querySelector("#fb-guide")?.addEventListener("click", openDemoGuide);

  const canvasEl = $("#fb-canvas", shellEl);
  const itemsEl  = $("#fb-items", shellEl);
  const svgEl    = $("#fb-svg", shellEl);
  const hintEl   = $("#fb-hint", shellEl);
  const cntEl    = $("#fb-cnt", shellEl);
  const gpList   = $("#fb-gp-list", shellEl);

  // Build glass panel
  gpList.innerHTML = INT_CARDS.map(c => `
    <div class="fb-gpc" draggable="true" data-type="${c.type}" style="--cc:${c.color}">
      <div class="fb-gpc-icon" style="background:${c.color}1a;border:1.5px solid ${c.color}55">
        ${c.brandKey ? brandSvg(c.brandKey) : `<i data-lucide="${c.icon}" class="icon" style="color:${c.color};width:17px;height:17px"></i>`}
      </div>
      <div class="fb-gpc-label">${c.label}</div>
      <div class="fb-gpc-drag">drag</div>
    </div>`).join("");
  renderIcons(gpList);

  // ── Card validation system ────────────────────────────────────────────────
  const CARD_REQUIRED = {
    phone:    [{ field: "phone",    label: "forwarding number" }],
    whatsapp: [{ field: "whatsapp", label: "WhatsApp number"   }],
    gmail:    [{ field: "email",    label: "Gmail address"     }],
    gcal:     [{ field: "calendly", label: "booking URL"       }],
    slack:    [{ field: "webhook",  label: "Slack webhook URL" }],
    agent:    [],
    voice:    [],
    language: [],
    info:     [],
  };
  const ACTIVATION_LABELS = {
    phone_number:     "a forwarding phone number",
    business_name:    "a business name (Settings tab)",
    greeting_message: "a greeting message (Settings tab)",
    telnyx_phone:     "a Telnyx phone number",
  };

  function validateCards() {
    const issues = [];
    state.cards.forEach(card => {
      (CARD_REQUIRED[card.type] || []).forEach(req => {
        if (!String(card.config?.[req.field] || "").trim()) {
          issues.push({ card, req });
        }
      });
    });
    return issues;
  }

  function updateActivationBar() {
    const barEl  = shellEl.querySelector("#fb-act-bar");
    const prvEl  = shellEl.querySelector("#fb-gp-preview");
    const issues = validateCards();

    // ── Per-card invalid highlighting ─────────────────────────────────────
    state.cards.forEach(card => {
      const cardEl = itemsEl.querySelector(`[data-cid="${card.id}"]`);
      if (!cardEl) return;
      const cardIssues = issues.filter(i => i.card.id === card.id);
      cardEl.classList.toggle("fb-card-invalid", cardIssues.length > 0);
      let badge = cardEl.querySelector(".fb-valid-badge");
      if (cardIssues.length > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "fb-valid-badge";
          const head = cardEl.querySelector(".fb-card-head");
          if (head) head.insertBefore(badge, head.querySelector(".fb-card-x"));
        }
        badge.textContent = "!";
        badge.title = "Required: " + cardIssues.map(i => i.req.label).join(", ");
      } else {
        badge?.remove();
      }
    });

    // ── Activation status bar ─────────────────────────────────────────────
    if (barEl) {
      const phoneCard = state.cards.find(c => c.type === "phone");
      const hasPhone  = !!String(phoneCard?.config?.phone || "").trim();
      if (a.is_active) {
        barEl.innerHTML = `<span class="fb-act-chip fb-act-live"><span class="fb-act-dot"></span>Agent is live</span>`;
      } else if (issues.length === 0 && hasPhone) {
        barEl.innerHTML = `<span class="fb-act-chip fb-act-ready">✅ Ready — click Save to go live</span>`;
      } else {
        const reasons = [];
        if (!phoneCard)  reasons.push("Drag the Phone card to start");
        else if (!hasPhone) reasons.push("Phone card: add forwarding number");
        issues.forEach(i => reasons.push(`${cardMeta(i.card.type).label}: add ${i.req.label}`));
        const tip = reasons.join(" · ");
        barEl.innerHTML = `<span class="fb-act-chip fb-act-warn" title="${tip}">⚠️ ${reasons[0]}${reasons.length > 1 ? `<em class="fb-act-more"> +${reasons.length - 1} more</em>` : ""}</span>`;
      }
    }

    // ── Live preview panel ────────────────────────────────────────────────
    if (!prvEl) return;
    const vc = state.cards.find(c => c.type === "voice");
    const lc = state.cards.find(c => c.type === "language");
    const pc = state.cards.find(c => c.type === "phone");
    const wc = state.cards.find(c => c.type === "whatsapp");
    const ic = state.cards.find(c => c.type === "info");
    const gc = state.cards.find(c => c.type === "gcal");

    if (!pc && !vc && !lc) {
      prvEl.innerHTML = `<div class="fb-pv-empty">Fill cards to see a live preview.</div>`;
      return;
    }

    const voiceName = PREVIEW_VOICES.find(v => v.id === (vc?.config?.voice || "maya"))?.label || "Maya";
    const langName  = lc?.config?.language || "English (US)";
    const phoneNum  = pc?.config?.phone || a.forwarding_number || "—";
    const waNum     = wc?.config?.whatsapp || cfg.owner_whatsapp || "—";
    const calUrl    = gc?.config?.calendly || cfg.calendly_url || "";
    const infoSnip  = ic?.config?.text ? ic.config.text.slice(0, 80) + (ic.config.text.length > 80 ? "…" : "") : "";

    const row = (lbl, val, cls = "") =>
      val && val !== "—"
        ? `<div class="fb-pv-row"><span class="fb-pv-lbl">${lbl}</span><span class="fb-pv-val ${cls}">${escapeHtml(val)}</span></div>`
        : `<div class="fb-pv-row fb-pv-row-dim"><span class="fb-pv-lbl">${lbl}</span><span class="fb-pv-val fb-pv-miss">not set</span></div>`;

    const statusCls = a.is_active ? "fb-pv-live" : "fb-pv-draft";
    const statusLbl = a.is_active ? "Live" : "Draft";
    const acCard = state.cards.find(c => c.type === "agent");
    const voiceForPreview = acCard?.config?.voice || vc?.config?.voice || "maya";
    const langForPreview  = lc?.config?.language || "English (US)";
    const bizName = ic?.config?.bizname || "";

    prvEl.innerHTML = `
      <div class="fb-pv-status-row">
        <div class="fb-pv-dot ${statusCls}"></div>
        <span class="fb-pv-status-lbl">${statusLbl}</span>
        <span class="fb-pv-agent-name">${escapeHtml(a.name || "")}</span>
      </div>
      ${bizName ? `<div class="fb-pv-biz">${escapeHtml(bizName)}</div>` : ""}
      ${row("Voice",    voiceName)}
      ${row("Language", langForPreview)}
      ${row("Phone",    phoneNum)}
      ${wc ? row("WhatsApp", waNum) : ""}
      ${gc ? row("Booking",  calUrl || "—") : ""}
      ${infoSnip ? `<div class="fb-pv-info">${escapeHtml(infoSnip)}</div>` : ""}
        <canvas id="fb-pv-wave" class="fb-pv-wave"></canvas>
      <button class="fb-pv-talk-btn" id="fb-pv-talk" data-voice="${escapeHtml(voiceForPreview)}" data-lang="${escapeHtml(langForPreview)}">
        <svg viewBox="0 0 20 20" style="width:14px;height:14px;margin-right:5px;flex-shrink:0"><path d="M10 12a2 2 0 0 0 2-2V5a2 2 0 0 0-4 0v5a2 2 0 0 0 2 2zm4-2a4 4 0 0 1-8 0H4a6 6 0 0 0 12 0h-2z" fill="currentColor"/></svg>
        <span id="fb-pv-talk-lbl">Talk to your agent</span>
      </button>
    `;

    // ── Inline Vapi preview for the flow builder ──────────────────────────
    const FLOW_PREV_AID = "d5f28a96-25da-4905-bac8-5dee52a15f4e";
    let fbCallActive = false;
    const talkBtn  = prvEl.querySelector("#fb-pv-talk");
    const talkLbl  = prvEl.querySelector("#fb-pv-talk-lbl");
    const waveEl   = prvEl.querySelector("#fb-pv-wave");

    // Mini waveform
    if (waveEl) {
      const wCtx = waveEl.getContext("2d");
      const dpr  = window.devicePixelRatio || 1;
      let wT = 0, wLv = 0.08, wSpk = false, wRaf;
      function wResize() { const r = waveEl.getBoundingClientRect(); waveEl.width = r.width*dpr; waveEl.height = r.height*dpr; }
      wResize();
      window.addEventListener("resize", wResize);
      function wDraw() {
        wT += 0.04; wLv += ((wSpk ? 0.82 : 0.08) - wLv) * 0.06;
        const w = waveEl.width, h = waveEl.height;
        if (!w || !h) { wRaf = requestAnimationFrame(wDraw); return; }
        wCtx.fillStyle = "rgba(10,15,30,0.96)"; wCtx.fillRect(0, 0, w, h);
        const bars = 22, gap = 3 * dpr, bw = (w - gap*(bars-1)) / bars;
        for (let i = 0; i < bars; i++) {
          const ph = i*0.52 + wT;
          const amp = Math.sin(ph)*0.4 + Math.sin(ph*1.9)*0.32 + Math.sin(ph*0.55)*0.28;
          const bh = Math.max(3*dpr, Math.abs(amp)*wLv*h*0.88);
          const x = i*(bw+gap), y = (h-bh)/2;
          const ratio = i/(bars-1);
          const r2 = Math.round(99+ratio*156), g2 = Math.round(102-ratio*72), b2 = Math.round(241-ratio*80);
          wCtx.fillStyle = `rgba(${r2},${g2},${b2},0.9)`;
          wCtx.beginPath(); wCtx.roundRect(x, y, bw, bh, 2); wCtx.fill();
        }
        wRaf = requestAnimationFrame(wDraw);
      }
      requestAnimationFrame(() => { wResize(); wDraw(); });

      // Expose so parent can animate
      talkBtn._wSpk = (v) => { wSpk = v; };
    }

    // Expose globally so any other widget can trigger it
    window._vapiStart = (_vid, _lang) => { talkBtn?.click(); };

    // Mic permission state machine
    let _micState = "unknown"; // unknown | ok | blocked | requesting
    const micBanner = document.createElement("div");
    micBanner.className = "fb-mic-banner fb-mic-req";
    micBanner.innerHTML = `<span class="fb-mic-ico">🎙️</span><div class="fb-mic-txt"><b>Microphone access needed</b>Click "Talk to your agent" — your browser will ask for mic permission.</div>`;
    talkBtn?.parentNode?.insertBefore(micBanner, talkBtn);

    const setMicState = (state, msg) => {
      _micState = state;
      micBanner.className = `fb-mic-banner fb-mic-${state === "ok" ? "ok" : state === "blocked" ? "err" : "req"}`;
      if (state === "ok") {
        micBanner.innerHTML = `<span class="fb-mic-ico">✅</span><div class="fb-mic-txt"><b>Microphone ready</b>${msg || "Tap the button below to call your agent."}</div>`;
        talkBtn?.classList.remove("mic-blocked");
        if (talkBtn) talkBtn.disabled = false;
      } else if (state === "blocked") {
        micBanner.innerHTML = `<span class="fb-mic-ico">🚫</span><div class="fb-mic-txt"><b>Microphone blocked</b>${msg || "Allow mic access in your browser settings, then refresh."}</div>`;
        talkBtn?.classList.add("mic-blocked");
      } else {
        micBanner.innerHTML = `<span class="fb-mic-ico">🎙️</span><div class="fb-mic-txt"><b>Microphone access needed</b>${msg || 'Click \u201cTalk to your agent\u201d — your browser will ask for mic permission.'}</div>`;
        talkBtn?.classList.remove("mic-blocked");
      }
    };
    // Probe mic permission silently on load (doesn't show browser prompt)
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" }).then(ps => {
        if (ps.state === "granted")  setMicState("ok",      "Microphone ready.");
        if (ps.state === "denied")   setMicState("blocked", "Open browser settings → Site settings → Microphone and allow this site.");
        ps.onchange = () => {
          if (ps.state === "granted") setMicState("ok");
          if (ps.state === "denied")  setMicState("blocked", "Open browser settings → Site settings → Microphone and allow this site.");
        };
      }).catch(() => {});
    }

    talkBtn?.addEventListener("click", () => {
      localStorage.setItem("oc_last_voice", voiceForPreview);
      localStorage.setItem("oc_last_lang",  langForPreview);
      if (fbCallActive) { stopVapiCall(); return; }
      if (_micState === "blocked") { toast("Microphone is blocked — allow mic in browser settings and refresh", "error"); return; }
      if (!getVapi()) { toast("Vapi unavailable — check your connection and retry", "error"); return; }

      // If mic permission unknown, request it first, then proceed
      if (_micState !== "ok") {
        setMicState("requesting", "Requesting microphone access…");
        talkBtn.disabled = true;
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            stream.getTracks().forEach(t => t.stop()); // immediately release
            setMicState("ok", "Microphone ready — connecting…");
            preWarmWebRTC(); // heat ICE/STUN paths NOW so vapi.start() is fast
            talkBtn.disabled = false;
            talkBtn.click(); // re-fire after permission granted
          })
          .catch(err => {
            const msg = err.name === "NotAllowedError"
              ? "Open browser settings → Site settings → Microphone and allow this site."
              : `Could not access mic: ${err.message}`;
            setMicState("blocked", msg);
            toast("Microphone blocked — " + msg, "error");
          });
        return;
      }

      if (talkLbl) talkLbl.textContent = "Connecting…";
      talkBtn.disabled = true;
      const voiceObj = PREVIEW_VOICES.find(v => v.id === voiceForPreview) || PREVIEW_VOICES[0];
      // Gather all card configs so the agent "knows" the full business context during the preview call
      const _cardCfg = {};
      state.cards.forEach(card => {
        const cc = card.config || {};
        if (card.type === "info") {
          if (cc.bizname)  _cardCfg.business_name     = cc.bizname;
          if (cc.text)     _cardCfg.business_info     = cc.text;
          if (cc.hours)    _cardCfg.business_hours    = cc.hours;
          if (cc.services) _cardCfg.business_services = cc.services;
          if (cc.pricing)  _cardCfg.business_pricing  = cc.pricing;
          if (cc.address)  _cardCfg.business_address  = cc.address;
          if (cc.faq)      _cardCfg.business_faq      = cc.faq;
        }
        if (card.type === "gcal" && cc.calendly) _cardCfg.calendly_url = cc.calendly;
      });
      let fbConnTimeout;
      const fbReset = () => {
        clearTimeout(fbConnTimeout);
        fbCallActive = false;
        if (talkLbl) talkLbl.textContent = "Talk to your agent";
        talkBtn.classList.remove("playing"); talkBtn.disabled = false;
        talkBtn._wSpk?.(false);
      };
      startVapiCall(FLOW_PREV_AID, buildVapiOverrides(voiceObj, langForPreview, null, _cardCfg), {
        onStart: () => {
          clearTimeout(fbConnTimeout);
          fbCallActive = true;
          if (talkLbl) talkLbl.textContent = "Stop call";
          talkBtn.classList.add("playing"); talkBtn.disabled = false;
          talkBtn._wSpk?.(true);
        },
        onEnd:         () => { fbReset(); },
        onSpeechStart: () => { talkBtn._wSpk?.(true);  },
        onSpeechEnd:   () => { talkBtn._wSpk?.(false); },
        onVolume: () => {},
        onError: () => { fbReset(); toast("Could not start preview — allow microphone access and retry", "error"); },
      });
      fbConnTimeout = setTimeout(() => { if (!fbCallActive) fbReset(); }, 25000);
    });
    renderIcons(prvEl);
  }

  function cardBodyHTML(card) {
    const c = card.config || {};
    const ci = (ph, field, val) => `<input class="fb-ci" placeholder="${ph}" data-field="${field}" value="${escapeHtml(val || '')}" />`;
    if (card.type === "agent") {
      const AGENT_TYPES = [
        "","Dental clinic front desk","Real Estate Agent","Hair salon receptionist",
        "Restaurant host","HVAC dispatcher","Law firm intake","professional front desk receptionist",
      ];
      return `
        ${ci("Agent name (e.g. Maya or Aria)", "name", c.name)}
        ${ci("Opening greeting", "greeting", c.greeting)}
        <select class="fb-ci" data-field="biz_type" style="margin-top:4px">
          ${AGENT_TYPES.map(t => `<option value="${escapeHtml(t)}"${c.biz_type===t?" selected":""}>${escapeHtml(t)||"Agent type / designation (optional)"}</option>`).join("")}
        </select>
        <textarea class="fb-ci" style="resize:vertical;min-height:46px;margin-top:4px" data-field="text" placeholder="Persona / tone — e.g. Warm, professional, concise">${escapeHtml(c.text||'')}</textarea>`;
    }
    if (card.type === "voice") return `<select class="fb-ci" data-field="voice">${PREVIEW_VOICES.map(v => `<option value="${v.id}"${c.voice===v.id?" selected":""}>${v.label} — ${v.sub}</option>`).join("")}</select>`;
    if (card.type === "language") {
      const parts = (c.language || "English (US)").split(",").map(s => s.trim()).filter(Boolean);
      const primary = parts[0] || "English (US)";
      const secondary = parts[1] || "";
      const opts = PREVIEW_LANGS.map(l => `<option value="${escapeHtml(l)}"${l===primary?" selected":""}>${escapeHtml(l)}</option>`).join("");
      const opts2 = `<option value="">None (single language)</option>` +
        PREVIEW_LANGS.filter(l => l !== primary).map(l => `<option value="${escapeHtml(l)}"${l===secondary?" selected":""}>${escapeHtml(l)}</option>`).join("");
      return `
        <input class="fb-ci-lang-hidden" data-field="language" value="${escapeHtml(c.language||'English (US)')}" style="display:none" readonly/>
        <div class="fb-lang-select-wrap">
          <select class="fb-lang-sel" data-lang-primary>${opts}</select>
        </div>
        <div class="fb-lang-select-wrap" style="margin-top:5px">
          <select class="fb-lang-sel2" data-lang-secondary>
            ${opts2}
          </select>
        </div>
        <div class="fb-lang-hint">Primary language · Optional second language for bilingual calls</div>`;
    }
    if (card.type === "phone") return ci("Forwarding number e.g. +1 555 0100", "phone", c.phone);
    if (card.type === "whatsapp") return ci("WhatsApp number for summaries", "whatsapp", c.whatsapp);
    if (card.type === "gmail") return ci("Gmail address", "email", c.email);
    if (card.type === "gcal") return ci("Calendly or Google Calendar URL", "calendly", c.calendly);
    if (card.type === "slack") return ci("Slack webhook URL", "webhook", c.webhook);
    if (card.type === "info") return `
      ${ci("Business name (e.g. Sunrise Dental)", "bizname", c.bizname)}
      ${ci("Website URL (AI learns from it)", "url", c.url)}
      ${ci("Business hours (e.g. Mon–Fri 9am–6pm)", "hours", c.hours)}
      ${ci("Services / products offered", "services", c.services)}
      ${ci("Pricing summary (e.g. Haircut ₹300)", "pricing", c.pricing)}
      ${ci("Address / location", "address", c.address)}
      <textarea class="fb-ci" style="resize:vertical;min-height:48px;margin-top:4px" data-field="faq" placeholder="Q: Do you take walk-ins? A: Yes until 5pm.">${escapeHtml(c.faq||'')}</textarea>
      <textarea class="fb-ci" style="resize:vertical;min-height:44px;margin-top:4px" data-field="text" placeholder="Extra info — policies, staff bios, intake forms…">${escapeHtml(c.text||'')}</textarea>
      <label class="fb-file-btn"><input type="file" accept=".pdf,.txt,.docx,.csv" data-field="file" style="display:none"><span>Upload file (PDF / TXT / DOCX)</span></label>`;
    return "";
  }

  function portPos(card, side) {
    const el = itemsEl.querySelector(`[data-cid="${card.id}"]`);
    const h  = (el?.offsetHeight) || CARD_H;
    return side === "out"
      ? { x: card.x + CARD_W, y: card.y + h / 2 }
      : { x: card.x,          y: card.y + h / 2 };
  }

  function bezier(sx, sy, tx, ty) {
    const dx = Math.max(80, Math.abs(tx - sx) * 0.5);
    const dy = (ty - sy) * 0.1;
    return `M${sx} ${sy} C${sx+dx} ${sy+dy},${tx-dx} ${ty-dy},${tx} ${ty}`;
  }

  // Connection validation rules — what each card type may output to
  // Central model: Phone → Agent (AI Brain) → outputs (WhatsApp/Gmail/Calendar/Slack)
  // Voice/Language/Info can configure Agent directly, or flow independently.
  const CONN_RULES = {
    phone:    ["agent", "voice", "language", "info"],
    agent:    ["whatsapp", "gmail", "gcal", "slack"],
    voice:    ["agent", "language", "info"],
    language: ["agent", "voice", "info"],
    info:     ["agent", "gcal", "whatsapp", "gmail", "slack"],
    gcal:     ["whatsapp", "gmail", "slack"],
    whatsapp: [],
    gmail:    [],
    slack:    [],
  };
  const CONN_DENY_REASONS = {
    phone:    "Phone is the starting point — nothing should connect into it from another card.",
    agent:    "Agent is a hub — connect into it from Phone/Voice/Language/Info, and out from it to WhatsApp/Gmail/Calendar.",
    whatsapp: "WhatsApp Notify is a terminal step. It sends a summary and the flow ends there.",
    gmail:    "Gmail is a terminal step. It sends a follow-up email and the flow ends there.",
    slack:    "Slack is a terminal step. It sends an alert and the flow ends there.",
  };
  function canConnect(fromType, toType) {
    if (fromType === toType) return { ok: false, reason: "A card cannot connect to itself." };
    if (toType === "phone") return { ok: false, reason: CONN_DENY_REASONS.phone };
    const allowed = CONN_RULES[fromType] || [];
    if (!allowed.includes(toType)) {
      const hint = allowed.length
        ? `"${fromType}" can connect to: ${allowed.join(", ")}.`
        : (CONN_DENY_REASONS[fromType] || `"${fromType}" has no valid outgoing connections.`);
      return { ok: false, reason: hint };
    }
    return { ok: true };
  }
  // Show a brief non-blocking banner
  function connErrBanner(msg) {
    document.querySelectorAll(".fb-conn-err").forEach(e => e.remove());
    const el = document.createElement("div");
    el.className = "fb-conn-err";
    el.textContent = "⚠️ " + msg;
    el.style.cssText = "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#fef2f2;border:1.5px solid #fca5a5;color:#b91c1c;padding:9px 18px;border-radius:11px;font-size:12.5px;z-index:9999;box-shadow:0 3px 12px rgba(239,68,68,.18);max-width:440px;text-align:center;pointer-events:none;transition:opacity .3s";
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 320); }, 3200);
  }

  function renderEdges() {
    svgEl.innerHTML = `<defs>
      <marker id="fbarr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0 .5 L7 4 L0 7.5z" fill="rgba(99,102,241,.85)"/>
      </marker>
      <marker id="fbarr-ghost" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0 .5 L7 4 L0 7.5z" fill="rgba(59,130,246,.75)"/>
      </marker>
      <filter id="fb-glow">
        <feGaussianBlur stdDeviation="2" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>`;
    state.edges.forEach((e, i) => {
      const fc = state.cards.find(c => c.id === e.from);
      const tc = state.cards.find(c => c.id === e.to);
      if (!fc || !tc) return;
      const s = portPos(fc, "out"), t = portPos(tc, "in");
      // Shadow/glow path
      const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      glow.setAttribute("d", bezier(s.x, s.y, t.x, t.y));
      glow.setAttribute("stroke", "rgba(99,102,241,0.18)");
      glow.setAttribute("stroke-width", "7");
      glow.setAttribute("fill", "none");
      glow.style.pointerEvents = "none";
      svgEl.appendChild(glow);
      // Main path
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", bezier(s.x, s.y, t.x, t.y));
      p.setAttribute("class", "fb-edge");
      p.setAttribute("marker-end", "url(#fbarr)");
      p.dataset.idx = i;
      p.style.pointerEvents = "stroke";
      p.addEventListener("click", ev => {
        ev.stopPropagation();
        if (confirm("Remove this connection?")) { state.edges.splice(i, 1); renderEdges(); }
      });
      // Hover tooltip hint
      p.addEventListener("mouseenter", () => { p.style.strokeWidth = "3"; p.style.opacity = "0.9"; });
      p.addEventListener("mouseleave", () => { p.style.strokeWidth = ""; p.style.opacity = ""; });
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = "Click to remove this connection";
      p.appendChild(title);
      svgEl.appendChild(p);
    });
    if (state.dragEdgeFrom) {
      const fc = state.cards.find(c => c.id === state.dragEdgeFrom);
      if (fc) {
        const s = portPos(fc, "out");
        const gp = document.createElementNS("http://www.w3.org/2000/svg", "path");
        gp.setAttribute("d", bezier(s.x, s.y, state.mouse.x, state.mouse.y));
        gp.setAttribute("class", "fb-edge fb-edge-ghost");
        gp.setAttribute("marker-end", "url(#fbarr-ghost)");
        svgEl.appendChild(gp);
      }
    }
  }

  function renderCanvas() {
    itemsEl.innerHTML = "";
    state.cards.forEach(card => {
      const meta = cardMeta(card.type);
      const el = h(`
        <div class="fb-card" data-cid="${card.id}" style="left:${card.x}px;top:${card.y}px;--cc:${meta.color}">
          <div class="fb-port fb-port-in" data-card="${card.id}" title="Connect here"></div>
          <div class="fb-card-head">
            <div class="fb-card-ico" style="background:${meta.color}22">${meta.brandKey ? brandSvg(meta.brandKey) : `<i data-lucide="${meta.icon}" class="icon" style="color:${meta.color};width:14px;height:14px"></i>`}</div>
            <span class="fb-card-name">${meta.label}</span>
            <button class="fb-card-x" data-del="${card.id}">×</button>
          </div>
          <div class="fb-card-body">${cardBodyHTML(card)}</div>
          <div class="fb-port fb-port-out" data-card="${card.id}" title="Drag to connect"></div>
        </div>`);
      renderIcons(el);
      itemsEl.appendChild(el);

      // Drag card by head
      let ds = null;
      const head = el.querySelector(".fb-card-head");
      head.addEventListener("mousedown", ev => {
        if (ev.target.closest(".fb-card-x")) return;
        ds = { mx: ev.clientX, my: ev.clientY, ox: card.x, oy: card.y };
        el.classList.add("fb-card-drag");
        ev.preventDefault(); ev.stopPropagation();
      });
      const onMove = ev => {
        if (!ds) return;
        card.x = Math.max(0, ds.ox + ev.clientX - ds.mx);
        card.y = Math.max(0, ds.oy + ev.clientY - ds.my);
        el.style.left = card.x + "px";
        el.style.top = card.y + "px";
        renderEdges();
      };
      const onUp = () => { if (ds) { ds = null; el.classList.remove("fb-card-drag"); } };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);

      // Delete
      el.querySelector(".fb-card-x").addEventListener("click", ev => {
        ev.stopPropagation();
        state.cards = state.cards.filter(c => c.id !== card.id);
        state.edges = state.edges.filter(e => e.from !== card.id && e.to !== card.id);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        renderCanvas();
      });

      // Language dropdown — primary + secondary selects update the hidden input
      const syncLangDropdowns = () => {
        const hidden = el.querySelector(".fb-ci-lang-hidden[data-field='language']");
        if (!hidden) return;
        const primSel = el.querySelector("[data-lang-primary]");
        const secSel  = el.querySelector("[data-lang-secondary]");
        const primary   = primSel?.value || "English (US)";
        const secondary = secSel?.value  || "";
        // Update secondary options to exclude current primary
        if (secSel) {
          const prev = secSel.value;
          secSel.innerHTML = `<option value="">None (single language)</option>` +
            PREVIEW_LANGS.filter(l => l !== primary).map(l =>
              `<option value="${escapeHtml(l)}"${l===prev&&l!==primary?" selected":""}>${escapeHtml(l)}</option>`
            ).join("");
        }
        const newVal = secondary ? `${primary}, ${secondary}` : primary;
        hidden.value = newVal;
        hidden.removeAttribute("readonly");
        hidden.dispatchEvent(new Event("input", { bubbles: true }));
        hidden.setAttribute("readonly", "");
      };
      el.querySelector("[data-lang-primary]")?.addEventListener("change",   syncLangDropdowns);
      el.querySelector("[data-lang-secondary]")?.addEventListener("change", syncLangDropdowns);

      // Field changes → sync preview
      el.querySelectorAll("[data-field]").forEach(inp => {
        const upd = async () => {
          card.config = card.config || {};
          card.config[inp.dataset.field] = inp.value;

          // Phone one-agent-only: warn if number already used by another agent
          if (card.type === "phone" && inp.dataset.field === "phone" && inp.value.trim().length >= 7) {
            try {
              const allAgents = await api("/agents/list");
              const agents = Array.isArray(allAgents) ? allAgents : (allAgents.agents || []);
              const conflict = agents.find(ag =>
                String(ag.id) !== String(id) &&
                (
                  String(ag.forwarding_number || "").trim() === inp.value.trim() ||
                  String(ag.config?.forwarding_number || "").trim() === inp.value.trim()
                )
              );
              const warn = inp.closest(".fb-card")?.querySelector(".fb-phone-warn");
              if (warn) warn.remove();
              if (conflict) {
                const w = document.createElement("div");
                w.className = "fb-phone-warn";
                w.style.cssText = "font-size:11px;color:#b91c1c;background:#fef2f2;border:1px solid #fca5a5;border-radius:7px;padding:6px 9px;margin-top:4px;line-height:1.4";
                w.textContent = `⚠️ Already used by "${conflict.name}". Assign to this agent to move it.`;
                inp.after(w);
              }
            } catch (_) {}
          }
          // Bridge canvas selections → dashboard preview (persisted across navigation)
          if ((card.type === "agent" || card.type === "voice")    && inp.dataset.field === "voice")    localStorage.setItem("oc_last_voice", inp.value);
          if ((card.type === "agent" || card.type === "language") && inp.dataset.field === "language") localStorage.setItem("oc_last_lang",  inp.value);
          // Sync canvas state to global preview state (agent card takes priority over standalone cards)
          syncCanvasState();
          updateActivationBar();
          checkAutoActivate();
        };
        inp.addEventListener("change", upd);
        inp.addEventListener("input", upd);
      });

      // Out port → start edge drag
      el.querySelector(".fb-port-out").addEventListener("mousedown", ev => {
        ev.stopPropagation(); ev.preventDefault();
        state.dragEdgeFrom = card.id;
      });

      // In port → complete edge (with connection validation)
      el.querySelector(".fb-port-in").addEventListener("mouseup", ev => {
        if (state.dragEdgeFrom && state.dragEdgeFrom !== card.id) {
          const fromCard = state.cards.find(c => c.id === state.dragEdgeFrom);
          if (fromCard) {
            const check = canConnect(fromCard.type, card.type);
            if (!check.ok) {
              connErrBanner(check.reason);
            } else if (!state.edges.find(e => e.from === state.dragEdgeFrom && e.to === card.id)) {
              state.edges.push({ from: state.dragEdgeFrom, to: card.id });
              renderEdges();
            }
          }
          state.dragEdgeFrom = null;
          ev.stopPropagation();
        }
      });
    });

    cntEl.textContent = state.cards.length;
    hintEl.style.display = state.cards.length ? "none" : "flex";
    renderEdges();
    updateActivationBar();
    syncCanvasState(); // ← always keep preview in sync after any re-render
  }

  // Sync canvas state to window.harklyCanvasState so the Preview page and
  // the dashboard voice preview always reflect the latest canvas content
  // even if the user hasn't typed anything yet (e.g. starter cards on load).
  function syncCanvasState() {
    const ac = state.cards.find(c => c.type === "agent");
    const vc = state.cards.find(c => c.type === "voice");
    const lc = state.cards.find(c => c.type === "language");
    const ic = state.cards.find(c => c.type === "info");
    const gc = state.cards.find(c => c.type === "gcal");
    const voiceId = ac?.config?.voice    || vc?.config?.voice    || "maya";
    // Language stored as display label — map to BCP-47 for the preview page
    const langKey  = ac?.config?.language || lc?.config?.language || "English (US)";
    const ic_cfg   = ic?.config || {};
    const ac_cfg   = ac?.config || {};
    window.harklyCanvasState = {
      voiceId,
      language:          PREVIEW_LANG_MAP[langKey] || "en-US",
      // agent identity — used by dashboard preview & setup page
      agent_name:        ac_cfg.name     || "",
      greeting_message:  ac_cfg.greeting || "",
      agent_type:        ac_cfg.biz_type || ac_cfg.text || "",
      // business context — flows directly into buildVapiOverrides agentConfig
      business_name:     ic_cfg.bizname   || ac_cfg.business_name || "",
      business_info:     ic_cfg.text      || "",
      business_hours:    ic_cfg.hours     || "",
      business_services: ic_cfg.services  || "",
      business_pricing:  ic_cfg.pricing   || "",
      business_address:  ic_cfg.address   || "",
      business_faq:      ic_cfg.faq       || "",
      calendly_url:      gc?.config?.calendly || "",
    };
    // Also persist voice + lang so dashboard preview survives page navigation
    if (voiceId) localStorage.setItem("oc_last_voice", voiceId);
    if (langKey)  localStorage.setItem("oc_last_lang",  langKey);
  }

  // Mouse tracking for ghost edge
  canvasEl.addEventListener("mousemove", ev => {
    const r = canvasEl.getBoundingClientRect();
    state.mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top };
    if (state.dragEdgeFrom) renderEdges();
  });
  canvasEl.addEventListener("mouseup", () => { if (state.dragEdgeFrom) { state.dragEdgeFrom = null; renderEdges(); } });
  window.addEventListener("mouseup", () => { if (state.dragEdgeFrom) { state.dragEdgeFrom = null; renderEdges(); } });

  // Drag from panel to canvas
  gpList.querySelectorAll(".fb-gpc").forEach(gpc => {
    gpc.addEventListener("dragstart", ev => ev.dataTransfer.setData("text/plain", gpc.dataset.type));
    gpc.addEventListener("click", () => {
      const x = 80 + (state.cards.length % 3) * 260;
      const y = 60 + Math.floor(state.cards.length / 3) * 180;
      state.cards.push({ id: genId(), type: gpc.dataset.type, x, y, config: {} });
      renderCanvas();
    });
  });
  canvasEl.addEventListener("dragover", ev => { ev.preventDefault(); canvasEl.classList.add("fb-canvas-over"); });
  canvasEl.addEventListener("dragleave", () => canvasEl.classList.remove("fb-canvas-over"));
  canvasEl.addEventListener("drop", ev => {
    ev.preventDefault(); canvasEl.classList.remove("fb-canvas-over");
    const type = ev.dataTransfer.getData("text/plain");
    if (!type) return;
    const r = canvasEl.getBoundingClientRect();
    state.cards.push({ id: genId(), type, x: Math.max(10, ev.clientX - r.left - CARD_W / 2), y: Math.max(10, ev.clientY - r.top - 40), config: {} });
    renderCanvas();
  });

  // Save + activate — validates cards, saves agent, then tries to activate
  $("#fb-save", shellEl).addEventListener("click", async () => {
    const issues = validateCards();
    if (issues.length > 0) {
      const msgs = issues.map(i => `${cardMeta(i.card.type).label}: ${i.req.label}`);
      toast(`Fill required fields first — ${msgs.join(" · ")}`, "error");
      updateActivationBar();
      return;
    }
    const btn = shellEl.querySelector("#fb-save");
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      const nc = { ...cfg, flow_v2: { cards: state.cards, edges: state.edges } };
      let canvasVoiceId = a.voice_id;
      let canvasLanguage = a.language;
      state.cards.forEach(card => {
        const c = card.config || {};
        if (card.type === "voice"    && c.voice)    { nc.voice_id = c.voice;         canvasVoiceId = c.voice; }
        if (card.type === "language" && c.language) { nc.language = c.language;      canvasLanguage = c.language; }
        if (card.type === "phone"    && c.phone)    nc.forwarding_number = c.phone;
        if (card.type === "gcal"     && c.calendly) nc.calendly_url = c.calendly;
        if (card.type === "whatsapp" && c.whatsapp) nc.owner_whatsapp = c.whatsapp;
        if (card.type === "agent") {
          if (c.name)     nc.agent_name           = c.name;
          if (c.greeting) nc.greeting_message     = c.greeting;
          if (c.biz_type) nc.agent_type           = c.biz_type;
          if (c.text)     nc.agent_persona        = c.text;
        }
        if (card.type === "info") {
          if (c.text)     nc.business_info    = c.text;
          if (c.url)      nc.business_url     = c.url;
          if (c.hours)    nc.business_hours   = c.hours;
          if (c.services) nc.business_services= c.services;
          if (c.pricing)  nc.business_pricing = c.pricing;
          if (c.address)  nc.business_address = c.address;
          if (c.faq)      nc.business_faq     = c.faq;
          if (c.bizname)  nc.business_name    = c.bizname;
        }
      });
      const fwdNum = state.cards.find(c => c.type === "phone")?.config?.phone || a.forwarding_number;
      const saved = await api(`/agents/${id}`, {
        method: "PUT",
        body: {
          name: a.name,
          twilio_number: a.twilio_number,
          forwarding_number: fwdNum,
          voice_id: canvasVoiceId,
          language: canvasLanguage,
          config: nc,
        },
      });
      // Merge fresh data from server back into local agent object
      if (saved?.agent) Object.assign(a, saved.agent);

      if (!a.is_active) {
        const missing = saved?.agent?.activation_missing || [];
        if (missing.length === 0) {
          // All requirements met — activate now
          try {
            await api(`/agents/${id}/activate`, { method: "POST" });
            a.is_active = true;
            toast("🎉 Agent saved and is now live!", "success");
          } catch (ae) {
            toast("Saved ✓ — activation failed: " + ae.message, "warn");
          }
        } else {
          const human = missing.map(k => ACTIVATION_LABELS[k] || k).join(", ");
          toast(`Saved ✓ — to go live, also provide: ${human}`, "warn");
        }
      } else {
        toast("Agent saved!", "success");
      }
      updateActivationBar();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHTML;
      renderIcons(btn);
    }
  });

  // Clear
  $("#fb-clear", shellEl).addEventListener("click", () => {
    if (state.cards.length && !confirm("Clear all cards and connections?")) return;
    state.cards = []; state.edges = []; renderCanvas();
  });

  renderCanvas();
  updateActivationBar();

  // ── Auto-activate when phone number is filled (on input, not on Save) ────────
  let _activating = false;
  async function checkAutoActivate() {
    if (_activating || a.is_active) return;
    const phoneCard = state.cards.find(c => c.type === "phone");
    const hasPhone  = !!(phoneCard?.config?.phone?.trim());
    if (!hasPhone) return;
    // Only auto-activate if all required cards are filled
    if (validateCards().length > 0) return;
    _activating = true;
    try {
      const nc2 = { ...cfg, flow_v2: { cards: state.cards, edges: state.edges } };
      state.cards.forEach(card => {
        const c2 = card.config || {};
        if (card.type === "voice"    && c2.voice)    nc2.voice_id         = c2.voice;
        if (card.type === "language" && c2.language) nc2.language          = c2.language;
        if (card.type === "phone"    && c2.phone)    nc2.forwarding_number = c2.phone;
        if (card.type === "gcal"     && c2.calendly) nc2.calendly_url      = c2.calendly;
        if (card.type === "whatsapp" && c2.whatsapp) nc2.owner_whatsapp    = c2.whatsapp;
        if (card.type === "info"     && c2.text)     nc2.business_info     = c2.text;
      });
      const saved2 = await api(`/agents/${id}`, { method: "PUT", body: {
        name: a.name, twilio_number: a.twilio_number || "",
        forwarding_number: nc2.forwarding_number || a.forwarding_number || "",
        config: nc2,
      }});
      if (saved2?.agent) Object.assign(a, saved2.agent);
      const missing2 = saved2?.agent?.activation_missing || [];
      if (missing2.length === 0) {
        await api(`/agents/${id}/activate`, { method: "POST" });
        a.is_active = true;
        toast("🎉 Your agent is now live and will answer calls!", "success");
        updateActivationBar();
      } else {
        const human = missing2.map(k => ACTIVATION_LABELS[k] || k).join(", ");
        toast(`Phone saved ✓ — to go live, also add: ${human}`, "warn");
      }
    } catch (ae) {
      // Non-silent: tell the user what's blocking activation
      const msg = ae?.message || "";
      if (msg && !msg.includes("Request failed")) {
        toast(`Couldn't auto-activate: ${msg}`, "warn");
      }
      updateActivationBar();
    }
    _activating = false;
  }

  // ── Blur-based step-by-step tutorial with arrow pointers ─────────────────────
  const FLOW_TUT_KEY = "oc_seen_flow_tutorial_v3";
  function showFlowTutorial() {
    if (localStorage.getItem(FLOW_TUT_KEY)) {
      const replayBtn = h(`<button class="btn btn-sm" id="fb-tut-replay" title="Replay tutorial" style="font-size:11px">📖 Tutorial</button>`);
      const bar = shellEl.querySelector(".fb-canvas-bar div");
      if (bar) bar.prepend(replayBtn);
      replayBtn.addEventListener("click", () => { localStorage.removeItem(FLOW_TUT_KEY); replayBtn.remove(); showFlowTutorial(); });
      return;
    }

    const phoneCard = () => state.cards.find(c => c.type === "phone");

    // Steps spotlight individual cards in the panel so users understand each one
    const STEPS = [
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><defs><radialGradient id="wocG" cx=".35" cy=".3" r=".9"><stop offset="0%" stop-color="#ffe39a"/><stop offset="55%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#9a3412"/></radialGradient></defs><circle cx="16" cy="16" r="14" fill="url(#wocG)"/><text x="16" y="21" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Poppins,Arial,sans-serif">OC</text></svg>`,
        title: "Welcome to the Agent Builder",
        body: "Build your AI receptionist by dragging integration cards from the right panel onto the canvas. Each card adds a capability — phone answering, voice, notifications, bookings, knowledge.",
        detail: "Use Back / Next to navigate · Esc to close.",
        target: null, arrow: null, check: null,
      },
      {
        icon: `<svg viewBox="0 0 36 36" style="width:28px;height:28px"><path fill="#0d6efd" d="M11.4 14.5c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V23c0 .6-.4 1-1 1C13.4 24 8 18.6 8 11.4c0-.6.4-1 1-1h2.9c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .7-.2 1l-1.9 2.3z"/></svg>`,
        title: "Step 1 — Connect your phone number",
        body: "Drag the Phone card onto the canvas and enter your business forwarding number. When a caller doesn't reach you, Harkly picks up in under 2 seconds. This is how the agent gets connected and starts receiving calls.",
        detail: "Required — your agent cannot activate without a phone number.",
        target: ".fb-gpc[data-type='phone']", arrow: "left", check: null,
      },
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><defs><radialGradient id="ocG2" cx=".35" cy=".3" r=".9"><stop offset="0%" stop-color="#ffe39a"/><stop offset="55%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#9a3412"/></radialGradient></defs><circle cx="16" cy="16" r="14" fill="url(#ocG2)"/><text x="16" y="21" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" font-family="Poppins,Arial,sans-serif">OC</text></svg>`,
        title: "Step 2 — Activate the Agent (AI core brain)",
        body: "The Agent card is your AI receptionist. Connect Phone into it and it becomes the brain that answers calls, understands intent, books appointments, and routes follow-ups. Connect it outward to WhatsApp, Gmail, and Calendar.",
        detail: "Recommended flow: Phone → Agent → WhatsApp / Gmail / Calendar.",
        target: ".fb-gpc[data-type='agent']", arrow: "left", check: null,
      },
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><circle cx="16" cy="16" r="16" fill="#25D366"/><path fill="#fff" d="M22.7 18.5c-.3-.2-2-1-2.3-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.3-.2-.3 0-.5.1-.6l.5-.6c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2 0 1.3 1 2.6 1.1 2.7.1.2 1.9 2.9 4.6 4.1 2.7 1.1 2.7.7 3.2.7.5 0 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/></svg>`,
        title: "Step 3 — Connect to apps agentically",
        body: "The agent can connect to WhatsApp (send call summaries), Gmail (follow-up emails), and Google Calendar (book appointments live during the call). These are agentic actions — the AI performs them automatically, without you lifting a finger.",
        detail: "Connect: Agent → WhatsApp, Agent → Gmail, Agent → Calendar.",
        target: ".fb-gpc[data-type='whatsapp']", arrow: "left", check: null,
      },
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><path fill="#4285F4" d="M5 26h4V14L3 9.5V24c0 1.1.9 2 2 2z"/><path fill="#34A853" d="M23 26h4c1.1 0 2-.9 2-2V9.5L23 14z"/><path fill="#FBBC04" d="M23 8v6l6-4.5V7c0-1.6-1.8-2.6-3.2-1.6L23 8z"/><path fill="#EA4335" d="M9 14V8l7 5 7-5v6l-7 5z"/><path fill="#C5221F" d="M3 7v2.5L9 14V8L6.2 5.4C4.8 4.4 3 5.4 3 7z"/></svg>`,
        title: "Business Info — teach the agent everything",
        body: "Drag the Business Info card and fill in your hours, services, pricing, location, FAQs, and upload documents. The richer this is, the more accurately your agent answers caller questions — it's the agent's entire knowledge base.",
        detail: "Pro tip: also paste your website URL so the AI can read your site.",
        target: ".fb-gpc[data-type='info']", arrow: "left", check: null,
      },
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><path d="M4 16h24M16 4l12 12-12 12" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
        title: "Connect cards with arrows",
        body: "Hover any card to see the arrow handle on its right edge. Drag from that handle to another card to connect them. A curved animated line shows the live connection. The recommended starting flow is: Phone → Agent → WhatsApp.",
        detail: "Click any arrow line to remove it.",
        target: null, arrow: null, check: null,
      },
      {
        icon: `<svg viewBox="0 0 32 32" style="width:28px;height:28px"><rect x="4" y="6" width="24" height="20" rx="3" fill="#1e293b" stroke="#6366f1" stroke-width="1.5"/><path d="M10 16l4 4 8-8" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
        title: "Save & go live",
        body: "When your flow is ready, click Save & activate. Your agent goes live instantly — every missed call gets answered by AI in under 2 seconds, books appointments, and sends you a WhatsApp summary.",
        detail: null,
        target: "#fb-save", arrow: "bottom",
        check: () => {
          const issues   = validateCards();
          const hasPhone = !!phoneCard();
          if (!hasPhone) return { type: "err", msg: "<strong>Phone card missing.</strong> Drag it from the right panel — it's the required entry point.", list: [] };
          if (issues.length > 0) return { type: "err", msg: `<strong>${issues.length} issue${issues.length > 1 ? "s" : ""} to fix:</strong>`, list: issues.map(iss => `${cardMeta(iss.card.type).label}: add <strong>${iss.req.label}</strong>`) };
          return { type: "ok", msg: "<strong>All set!</strong> Click Save & activate to go live right now." };
        },
      },
    ];

    let i = 0;
    const ov = h(`<div class="ftut2-overlay" id="ftut2-ov">
      <div class="ftut2-spotlight" id="ftut2-spot"></div>
      <svg class="ftut2-svg-arrow" id="ftut2-svgarr" viewBox="0 0 ${window.innerWidth} ${window.innerHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="ftut2-mh" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
            <path d="M0 1.5 L9 5 L0 8.5z" fill="#6366f1"/>
          </marker>
        </defs>
        <path class="ftut2-arr-path" id="ftut2-arrpath" d="" marker-end="url(#ftut2-mh)"/>
      </svg>
      <div class="ftut2-pointer" id="ftut2-ptr" style="opacity:0"></div>
      <div class="ftut2-card" id="ftut2-card">
        <div class="ftut2-progress" id="ftut2-prog"></div>
        <div class="ftut2-meta">
          <span class="ftut2-icon" id="ftut2-icon"></span>
          <span class="ftut2-step-badge" id="ftut2-step"></span>
        </div>
        <div class="ftut2-title" id="ftut2-title"></div>
        <div class="ftut2-body" id="ftut2-body"></div>
        <div class="ftut2-btns">
          <button class="ftut2-skip" id="ftut2-skip">Skip tour</button>
          <div style="display:flex;gap:8px">
            <button class="ftut2-nav" id="ftut2-back" disabled>← Back</button>
            <button class="ftut2-nav ftut2-primary" id="ftut2-next">Next →</button>
          </div>
        </div>
      </div>
    </div>`);
    document.body.appendChild(ov);
    void ov.offsetWidth;
    ov.classList.add("ftut2-in");

    function close() {
      localStorage.setItem(FLOW_TUT_KEY, "1");
      ov.classList.add("ftut2-out");
      setTimeout(() => { ov.remove(); showFlowTutorial(); }, 260);
    }

    function place() {
      const step  = STEPS[i];
      const spot  = $("#ftut2-spot", ov);
      const ptr   = $("#ftut2-ptr", ov);
      const path  = ov.querySelector("#ftut2-arrpath");
      const svgEl = ov.querySelector("#ftut2-svgarr");
      const card  = $("#ftut2-card", ov);

      spot.className = "ftut2-spotlight ftut2-spot-hidden";
      ptr.style.opacity = "0";
      if (path) path.setAttribute("d", "");
      ov.classList.remove("ftut2-centered");

      const CW = 360;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (step.target) {
        const tEl = document.querySelector(step.target);
        if (tEl) {
          const r   = tEl.getBoundingClientRect();
          const PAD = 12;
          spot.className = "ftut2-spotlight";
          spot.style.cssText = `left:${r.left-PAD}px;top:${r.top-PAD}px;width:${r.width+PAD*2}px;height:${r.height+PAD*2}px;`;

          const a   = step.arrow || "right";
          const CH  = card.offsetHeight || 290;
          const tCX = r.left + r.width  / 2;
          const tCY = r.top  + r.height / 2;
          let cx, cy, ax, ay, bx, by, ptrX, ptrY, ptrCls, ptrCh;

          if (a === "left") {
            cx = Math.max(12, r.left - CW - 48);
            cy = Math.max(12, Math.min(vh - CH - 12, tCY - CH / 2));
            ax = cx + CW;        ay = cy + CH / 2;
            bx = r.left - PAD - 8; by = tCY;
            ptrX = r.left - PAD - 38; ptrY = tCY;
            ptrCls = "arr-right"; ptrCh = "👉";
          } else if (a === "bottom") {
            cx = Math.max(12, Math.min(vw - CW - 12, tCX - CW / 2));
            cy = Math.max(12, r.top - CH - 48);
            ax = cx + CW / 2;  ay = cy + CH;
            bx = tCX;          by = r.top - PAD - 8;
            ptrX = tCX;        ptrY = r.top - PAD - 40;
            ptrCls = "arr-bot"; ptrCh = "👇";
          } else {
            cx = Math.min(vw - CW - 12, r.right + 48);
            cy = Math.max(12, Math.min(vh - CH - 12, tCY - CH / 2));
            ax = cx;             ay = cy + CH / 2;
            bx = r.right + PAD + 8; by = tCY;
            ptrX = r.right + PAD + 10; ptrY = tCY;
            ptrCls = "arr-left"; ptrCh = "👈";
          }

          card.style.cssText = `left:${cx}px;top:${cy}px;`;

          // Curved bezier path
          if (path && svgEl) {
            svgEl.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
            const mx = (ax + bx) / 2;
            const my = (ay + by) / 2;
            const dx = bx - ax; const dy = by - ay;
            const cpX = mx - dy * 0.28; const cpY = my + dx * 0.28;
            path.setAttribute("d", `M ${ax} ${ay} Q ${cpX} ${cpY} ${bx} ${by}`);
          }

          ptr.className = `ftut2-pointer ${ptrCls}`;
          ptr.textContent = ptrCh;
          ptr.style.cssText = ptrCls === "arr-bot"
            ? `left:${ptrX}px;top:${ptrY}px;transform:translateX(-50%);opacity:1;`
            : `left:${ptrX}px;top:${ptrY}px;transform:translateY(-50%);opacity:1;`;
          return;
        }
      }

      // No target / target missing — centered card with dark background
      ov.classList.add("ftut2-centered");
      card.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%);`;
    }

    function render() {
      const s    = STEPS[i];
      const prog = $("#ftut2-prog", ov);
      prog.innerHTML = STEPS.map((_, j) => `<span class="ftut2-pd${j===i?" on":j<i?" done":""}"></span>`).join("");

      // Re-trigger icon animation
      const iconEl = $("#ftut2-icon", ov);
      iconEl.style.animation = "none"; void iconEl.offsetWidth; iconEl.style.animation = "";
      iconEl.innerHTML = s.icon;

      $("#ftut2-step",  ov).textContent = `Step ${i+1} of ${STEPS.length}`;
      $("#ftut2-title", ov).textContent = s.title;

      const bodyEl = $("#ftut2-body", ov);
      bodyEl.innerHTML = "";
      s.body.split("\n").forEach(line => {
        const p = document.createElement("p"); p.textContent = line; bodyEl.appendChild(p);
      });

      if (s.detail) {
        const d = document.createElement("div");
        d.className = "ftut2-detail"; d.textContent = s.detail;
        bodyEl.appendChild(d);
      }

      if (typeof s.check === "function") {
        const result = s.check();
        if (result) {
          const fb = document.createElement("div");
          if (result.type === "err") {
            fb.className = "ftut2-err-blk";
            fb.innerHTML = result.msg;
            if (result.list && result.list.length)
              fb.innerHTML += `<ul>${result.list.map(l=>`<li>${l}</li>`).join("")}</ul>`;
          } else if (result.type === "ok") {
            fb.className = "ftut2-ok-blk";
            fb.innerHTML = result.msg;
          } else {
            fb.className = "ftut2-action-hint";
            fb.textContent = result.msg;
          }
          bodyEl.appendChild(fb);
        }
      }

      $("#ftut2-back", ov).disabled = i === 0;
      $("#ftut2-next", ov).textContent = i === STEPS.length-1 ? "🚀  Let's build!" : "Next →";
      place();
    }

    $("#ftut2-next", ov).addEventListener("click", () => { if (i >= STEPS.length-1) { close(); return; } i++; render(); });
    $("#ftut2-back", ov).addEventListener("click", () => { if (i > 0) { i--; render(); } });
    $("#ftut2-skip", ov).addEventListener("click", close);
    document.addEventListener("keydown", function onK(e) {
      if (!document.body.contains(ov)) { document.removeEventListener("keydown", onK); return; }
      if (e.key === "Escape") { close(); return; }
      if (e.key === "ArrowRight" || e.key === "Enter") { if (i < STEPS.length-1) { i++; render(); } else close(); }
      if (e.key === "ArrowLeft") { if (i > 0) { i--; render(); } }
    });
    window.addEventListener("resize", () => {
      if (!document.body.contains(ov)) return;
      const svg = ov.querySelector("#ftut2-svgarr");
      if (svg) svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
      place();
    });
    render();
  }
  requestAnimationFrame(showFlowTutorial);

  // ── Demo / How-to Guide ──────────────────────────────────────────────────
  function openDemoGuide() {
    // ── Card definitions ──────────────────────────────────────────────────
    const GUIDE_CARDS = [
      { type: "phone",    label: "Phone Number",    color: "#0D6EFD", brandKey: "phone",    lucide: "phone",       badge: "REQUIRED",
        desc: "The entry point of every call flow. When a caller doesn't reach you, Harkly AI picks up in under 2 seconds.",
        fields: ["Forwarding number: +1 (555) 010-0100"],
        why: "Required — your agent cannot activate without this card." },
      { type: "agent",    label: "Agent (AI Brain)", color: "#8B5CF6", brandKey: "agent",   lucide: "cpu",         badge: "REQUIRED",
        desc: "The core AI receptionist powered by Vapi. Connect Phone into it; it handles calls and routes results to WhatsApp, Gmail, and Calendar.",
        fields: ["Voice selector", "Agent persona / tone", "Business context"],
        why: "Central hub — Phone flows in, WhatsApp/Gmail/Calendar flow out." },
      { type: "info",     label: "Business Info",   color: "#6366F1", brandKey: null,       lucide: "file-text",   badge: "RECOMMENDED",
        desc: "The agent's knowledge base. Fill hours, services, pricing, FAQs, address. Upload PDFs or paste your website URL — AI reads it all.",
        fields: ["Business name, hours, services, pricing", "FAQs, address, policies", "Website URL + file uploads"],
        why: "The richer this card, the more accurately your agent answers caller questions." },
      { type: "whatsapp", label: "WhatsApp Notify", color: "#25D366", brandKey: "whatsapp", lucide: "message-circle", badge: "TERMINAL",
        desc: "Sends you a WhatsApp recap after every call: caller name, reason, booking made, urgency level.",
        fields: ["Owner WhatsApp: +44 7700 900000"],
        why: "Terminal — the agent sends the recap and the flow ends here." },
      { type: "gmail",    label: "Gmail Follow-up", color: "#EA4335", brandKey: "gmail",    lucide: "mail",        badge: "TERMINAL",
        desc: "Sends the caller a personalised follow-up email — confirmations, quotes, intake forms, or a simple thanks.",
        fields: ["From: hello@yourbusiness.com"],
        why: "Terminal — great for sending booking confirmations or intake forms automatically." },
      { type: "gcal",     label: "Google Calendar", color: "#1A73E8", brandKey: "gcal",     lucide: "calendar",    badge: "OPTIONAL",
        desc: "Live appointment booking. The agent captures caller details and drops the event into your calendar during the call.",
        fields: ["Calendly URL: calendly.com/your-name"],
        why: "Recommended for clinics, salons, consultancies, and hotels." },
      { type: "voice",    label: "Voice Type",      color: "#F59E0B", brandKey: null,       lucide: "mic",         badge: "RECOMMENDED",
        desc: "Standalone voice selector — choose from 5 Cartesia voices. Controls how your agent sounds on every call.",
        fields: ["Maya / Arjun / Sofia / Daniel / Linh"],
        why: "Use this for granular voice control independent of the Agent card." },
      { type: "language", label: "Language",        color: "#10B981", brandKey: null,       lucide: "globe",       badge: "RECOMMENDED",
        desc: "Multi-language selector — pick one or more from 30+ languages. The agent switches automatically.",
        fields: ["English (US), Hindi, Spanish, French, Arabic, and 25 more"],
        why: "For multilingual businesses — callers are served in their preferred language." },
      { type: "slack",    label: "Slack Alert",     color: "#4A154B", brandKey: "slack",    lucide: "layers",      badge: "OPTIONAL",
        desc: "Instant Slack notification to your team channel when an urgent call comes in.",
        fields: ["Webhook URL: hooks.slack.com/services/…"],
        why: "Great for teams — everyone is notified immediately when something critical happens." },
    ];

    // ── Connection rules ──────────────────────────────────────────────────
    const CONN_GUIDE_RULES = [
      { from: "Phone",    to: "Agent",              ok: true,  why: "The call routes from your forwarding number directly to the AI Agent." },
      { from: "Voice",    to: "Agent",              ok: true,  why: "Configures how the Agent speaks — warm, professional, calm, etc." },
      { from: "Language", to: "Agent",              ok: true,  why: "Tells the Agent which language to use for the conversation." },
      { from: "Business Info", to: "Agent",         ok: true,  why: "Gives the Agent its knowledge — hours, services, FAQs, prices." },
      { from: "Agent",    to: "WhatsApp",           ok: true,  why: "After the call, Agent sends you a full recap on WhatsApp." },
      { from: "Agent",    to: "Gmail",              ok: true,  why: "Agent sends the caller a personalised follow-up email." },
      { from: "Agent",    to: "Calendar",           ok: true,  why: "Agent books the appointment directly into your calendar." },
      { from: "Agent",    to: "Slack",              ok: true,  why: "Agent alerts your team channel when an urgent call arrives." },
      { from: "Phone",    to: "WhatsApp (direct)",  ok: false, why: "Phone must route through Agent first — WhatsApp needs call context." },
      { from: "WhatsApp", to: "Anything",           ok: false, why: "Terminal card — the flow ends here. No outgoing connections allowed." },
      { from: "Gmail",    to: "Anything",           ok: false, why: "Terminal card — the flow ends here. No outgoing connections allowed." },
    ];

    // ── Flow diagram data ─────────────────────────────────────────────────
    const FLOW_CONFIG = [
      { color:"#F59E0B", label:"Voice",    sub:"How it sounds" },
      { color:"#10B981", label:"Language",  sub:"What it speaks" },
      { color:"#6366F1", label:"Info",      sub:"What it knows" },
      { color:"#0D6EFD", label:"Phone",     sub:"Entry point" },
    ];
    const FLOW_HUB    = { color:"#8B5CF6", label:"Agent", sub:"AI brain" };
    const FLOW_OUT    = [
      { color:"#25D366", label:"WhatsApp", sub:"Call summary" },
      { color:"#EA4335", label:"Gmail",    sub:"Follow-up email" },
      { color:"#1A73E8", label:"Calendar", sub:"Booking" },
      { color:"#4A154B", label:"Slack",    sub:"Alert" },
    ];

    function mkNode(c) {
      const ICON_MAP = {
        "Voice":"mic","Language":"globe","Info":"file-text","Phone":"phone",
        "Agent":"cpu","WhatsApp":"message-circle","Gmail":"mail",
        "Calendar":"calendar","Slack":"layers"
      };
      const BRAND_MAP = { "WhatsApp":"whatsapp","Gmail":"gmail","Calendar":"gcal","Phone":"phone","Agent":"agent" };
      const bk = BRAND_MAP[c.label];
      const iconHtml = bk
        ? `<div style="width:17px;height:17px">${brandSvg(bk)}</div>`
        : `<i data-lucide="${ICON_MAP[c.label]||'cpu'}" style="width:14px;height:14px;color:${c.color}"></i>`;
      return `<div class="dg-conn-node" style="border-color:${c.color}50;background:${c.color}10">
        <div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px">${iconHtml}</div>
        <div><div class="dg-conn-node-lbl">${c.label}</div><div class="dg-conn-node-sub">${c.sub}</div></div>
      </div>`;
    }

    function buildCards() {
      return `<div class="dg-cards-grid">${GUIDE_CARDS.map(c => `
        <div class="dg-card-item" style="--dg-c:${c.color}">
          <div class="dg-card-stripe" style="background:${c.color}"></div>
          <div class="dg-card-head">
            <div class="dg-card-ico" style="background:${c.color}1f;border:1.5px solid ${c.color}44;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9px;flex-shrink:0">
              ${c.brandKey ? `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center">${brandSvg(c.brandKey)}</div>` : `<i data-lucide="${c.lucide||'cpu'}" style="width:17px;height:17px;color:${c.color}"></i>`}
            </div>
            <div class="dg-card-lbl" style="flex:1;min-width:0">${c.label}</div>
            <div class="dg-card-badge dg-badge-${c.badge.split(' ')[0].toLowerCase()}">${c.badge}</div>
          </div>
          <div class="dg-card-body">
            <div class="dg-card-desc">${c.desc}</div>
            ${c.fields.map(f => `<div class="dg-card-field">${escapeHtml(f)}</div>`).join("")}
            <div class="dg-card-why">${c.why}</div>
          </div>
        </div>`).join("")}</div>`;
    }

    function buildConnect() {
      const WORKFLOW_STEPS = [
        {
          num: "1",
          color: "#0D6EFD",
          brandKey: "phone",
          title: "Connect your phone number",
          desc: "Drag the Phone card onto the canvas and enter your business forwarding number. Callers who don't reach you are answered by Harkly in under 2 seconds.",
          why: "This is how the agent gets connected and starts receiving calls — it's the gateway.",
        },
        {
          num: "2",
          color: "#F59E0B",
          brandKey: "agent",
          title: "Activate the Agent — the core AI brain",
          desc: "The Agent card is your AI receptionist powered by Vapi. Connect Phone into it — it becomes the brain that understands caller intent, handles conversations, books appointments, and routes actions.",
          why: "Vapi provides sub-500ms response times. The agent is the hub — all inputs flow in, all outputs flow out.",
        },
        {
          num: "3",
          color: "#1A73E8",
          brandKey: "gcal",
          title: "Connect apps — the agent acts for you",
          desc: "Connect the Agent outward to WhatsApp (send call summaries to you), Gmail (follow-up emails to callers), and Google Calendar (book appointments live during the call). These are agentic actions — the AI modifies and writes on these platforms automatically.",
          why: "No human needed. The agent handles the full lifecycle: answer → book → notify → follow-up.",
        },
        {
          num: "4",
          color: "#6366F1",
          brandKey: null,
          lucide: "file-text",
          title: "Business Info — the AI's knowledge base",
          desc: "The Business Info card is the most important card after the Agent. Fill it with your hours, services, pricing, FAQs, and upload your menu or policy documents. Paste your website URL and the AI reads it automatically.",
          why: "The richer this card, the more accurately your agent answers any caller question.",
        },
      ];

      return `
        <div class="dg-workflow-steps">
          ${WORKFLOW_STEPS.map((s, idx) => `
            <div class="dg-wf-step">
              <div class="dg-wf-step-left">
                <div class="dg-wf-num" style="background:${s.color}22;border:2px solid ${s.color}55;color:${s.color}">${s.num}</div>
                ${idx < WORKFLOW_STEPS.length - 1 ? `<div class="dg-wf-line" style="background:linear-gradient(${s.color},${WORKFLOW_STEPS[idx+1].color})"></div>` : ''}
              </div>
              <div class="dg-wf-content">
                <div class="dg-wf-head">
                  <div class="dg-wf-logo" style="background:${s.color}18;border:1.5px solid ${s.color}44">
                    ${s.brandKey ? `<div style="width:22px;height:22px">${brandSvg(s.brandKey)}</div>` : `<i data-lucide="${s.lucide||'cpu'}" style="width:17px;height:17px;color:${s.color}"></i>`}
                  </div>
                  <div class="dg-wf-title" style="color:${s.color}">${s.title}</div>
                </div>
                <div class="dg-wf-desc">${s.desc}</div>
                <div class="dg-wf-why">${s.why}</div>
              </div>
            </div>`).join("")}
        </div>
        <div class="dg-conn-diagram" style="margin-top:22px">
          <div class="dg-conn-diagram-title">The central hub model — Phone in, apps out</div>
          <div class="dg-conn-flow">
            <div class="dg-conn-col">
              ${FLOW_CONFIG.map(c => `${mkNode(c)}<div class="dg-conn-arr">→</div>`).join("")}
            </div>
            <div class="dg-conn-hub">${mkNode(FLOW_HUB)}</div>
            <div class="dg-conn-col dg-conn-col-right">
              ${FLOW_OUT.map(c => `<div class="dg-conn-arr">→</div>${mkNode(c)}`).join("")}
            </div>
          </div>
        </div>
        <div class="dg-conn-rules-section">
          <div class="dg-conn-rules-title">Connection rules</div>
          <div class="dg-conn-rules-list">
            ${CONN_GUIDE_RULES.map(r => `
              <div class="dg-conn-rule ${r.ok ? "dg-rule-ok" : "dg-rule-no"}">
                <div class="dg-rule-dot" style="background:${r.ok?'#4ade80':'#f87171'}"></div>
                <div>
                  <div class="dg-rule-from"><strong>${r.from.replace(/[🎙️📞💬📧📅🌍📄🔔🤖]/g,'').trim()}</strong> → ${r.to.replace(/[🎙️📞💬📧📅🌍📄🔔🤖]/g,'').trim()}</div>
                  <div class="dg-rule-why">${r.why}</div>
                </div>
              </div>`).join("")}
          </div>
        </div>`;
    }

    const TAB_FNS = { cards: buildCards, connect: buildConnect };

    const modal = h(`<div class="demo-guide-ov" id="dg-ov">
      <div class="demo-guide-modal">
        <div class="demo-guide-header">
          <div>
            <div class="demo-guide-htitle">Builder Guide</div>
            <div class="demo-guide-hsub">Everything you need to build your AI receptionist</div>
          </div>
          <button class="demo-guide-close" id="dg-close" title="Close">×</button>
        </div>
        <div class="demo-guide-tabs" id="dg-tabs">
          <button class="dg-tab active" data-tab="cards">Card Types</button>
          <button class="dg-tab" data-tab="connect">How to Build</button>
        </div>
        <div class="demo-guide-body" id="dg-body"></div>
      </div>
    </div>`);
    document.body.appendChild(modal);

    function showTab(name) {
      modal.querySelectorAll(".dg-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
      const body = $("#dg-body", modal);
      body.innerHTML = (TAB_FNS[name] || buildCards)();
      renderIcons(body);
    }
    showTab("cards");
    modal.querySelectorAll(".dg-tab").forEach(t => t.addEventListener("click", () => showTab(t.dataset.tab)));

    const closeGuide = () => modal.remove();
    modal.addEventListener("click", e => { if (e.target === modal) closeGuide(); });
    $("#dg-close", modal).addEventListener("click", closeGuide);
    document.addEventListener("keydown", function onDgKey(e) {
      if (!document.body.contains(modal)) { document.removeEventListener("keydown", onDgKey); return; }
      if (e.key === "Escape") closeGuide();
    });
  }

  renderIcons(page);
  return wrap;

  /* eslint-disable no-unreachable */
  if (false) {
    const cfg2 = a.config || {};
    let flow = (cfg2.flow && (cfg2.flow.nodes || []).length) ? cfg2.flow : defaultFlow();

    const shellEl = h(`
      <div class="flow-shell">
        <aside class="flow-palette">
          <h3>Step types</h3>
          <div id="palette"></div>
          <h3 style="margin-top:18px">Tips</h3>
          <div class="text-xs text-muted" style="line-height:1.6">
            • Drag a step from here onto the canvas.<br>
            • Drag from a step's right dot to another's left dot to connect.<br>
            • Click a step to edit its words.<br>
            • Drag empty canvas to pan. Scroll to zoom.
          </div>
        </aside>
        <div class="flow-canvas-wrap" id="canvas-wrap">
          <div class="flow-toolbar">
            <button class="btn btn-sm" id="t-fit"><i data-lucide="maximize-2" class="icon"></i>Fit</button>
            <button class="btn btn-sm" id="t-reset"><i data-lucide="rotate-ccw" class="icon"></i>Reset</button>
            <button class="btn btn-primary btn-sm" id="t-save"><i data-lucide="save" class="icon"></i>Save flow</button>
          </div>
          <div class="flow-canvas" id="canvas">
            <div class="flow-canvas-inner" id="inner">
              <svg class="flow-svg" id="svg" width="4000" height="3000"></svg>
            </div>
          </div>
          <div class="flow-help">Click empty canvas to deselect · Delete key removes selected step</div>
          <div class="flow-zoom-display" id="zoom">100%</div>
        </div>
        <aside class="flow-inspector" id="inspector">
          <div class="ip-empty">Select a step to edit its label and what the AI says.</div>
        </aside>
      </div>
    `);
    page.appendChild(shellEl);

    // Build palette
    const palette = $("#palette", shellEl);
    palette.innerHTML = FLOW_NODE_TYPES.map(t => `
      <div class="palette-item" draggable="true" data-type="${t.type}">
        <div class="pi-icon"><i data-lucide="${t.icon}" class="icon"></i></div>
        <div>${t.label}</div>
      </div>`).join("");
    renderIcons(shellEl);

    // === Builder state ===
    const state = {
      pan: { x: 0, y: 0 },
      zoom: 1,
      selectedId: null,
      dragNode: null,
      dragNodeStart: null,
      dragEdge: null, // { fromId, ghostX, ghostY }
      panning: false,
      panStart: null,
    };

    const canvas = $("#canvas", shellEl);
    const inner = $("#inner", shellEl);
    const svg = $("#svg", shellEl);
    const inspector = $("#inspector", shellEl);
    const wrapEl = $("#canvas-wrap", shellEl);

    const applyTransform = () => {
      inner.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
      $("#zoom", shellEl).textContent = Math.round(state.zoom * 100) + "%";
    };

    const screenToCanvas = (clientX, clientY) => {
      const r = wrapEl.getBoundingClientRect();
      return {
        x: (clientX - r.left - state.pan.x) / state.zoom,
        y: (clientY - r.top - state.pan.y) / state.zoom,
      };
    };

    function genId() { return "n" + Math.random().toString(36).slice(2, 9); }

    function addNode(type, x, y) {
      const meta = nodeTypeMeta(type);
      const node = { id: genId(), type, label: meta.label, text: meta.text, x, y };
      flow.nodes.push(node);
      state.selectedId = node.id;
      redraw();
    }

    function deleteSelected() {
      if (!state.selectedId) return;
      flow.nodes = flow.nodes.filter(n => n.id !== state.selectedId);
      flow.edges = flow.edges.filter(e => e.from !== state.selectedId && e.to !== state.selectedId);
      state.selectedId = null;
      redraw();
    }

    function nodeById(id) { return flow.nodes.find(n => n.id === id); }

    function nodeRect(node) {
      // approximate; nodes auto-size to ~200x70
      return { x: node.x, y: node.y, w: 200, h: 70 };
    }

    function edgePath(from, to) {
      const a = nodeRect(from), b = nodeRect(to);
      const sx = a.x + a.w, sy = a.y + a.h / 2;
      const tx = b.x, ty = b.y + b.h / 2;
      const dx = Math.max(40, Math.abs(tx - sx) * 0.5);
      return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
    }

    function ghostPath(from, gx, gy) {
      const a = nodeRect(from);
      const sx = a.x + a.w, sy = a.y + a.h / 2;
      const dx = Math.max(40, Math.abs(gx - sx) * 0.5);
      return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${gx - dx} ${gy}, ${gx} ${gy}`;
    }

    function renderInspector() {
      const id = state.selectedId;
      const node = id && nodeById(id);
      if (!node) {
        inspector.innerHTML = `<div class="ip-empty">Select a step to edit it.</div>`;
        return;
      }
      const meta = nodeTypeMeta(node.type);
      // Outgoing edges (for branch labels)
      const outs = flow.edges.filter(e => e.from === node.id);
      inspector.innerHTML = `
        <div class="font-semibold mb-3" style="display:flex;align-items:center;gap:8px">
          <i data-lucide="${meta.icon}" class="icon"></i>${meta.label}
        </div>
        <div class="mb-3">
          <label class="label">Step name</label>
          <input class="field" id="ip-label" value="${escapeHtml(node.label || '')}" placeholder="e.g. Ask name"/>
        </div>
        <div class="mb-3">
          <label class="label">${node.type === 'branch' ? 'How to decide' : node.type === 'ask' ? 'Question to ask' : 'What the AI should say or do'}</label>
          <textarea class="field" id="ip-text" rows="4" placeholder="The AI uses this as guidance — it will adapt to the caller.">${escapeHtml(node.text || '')}</textarea>
        </div>
        ${outs.length ? `
          <div class="mb-3">
            <label class="label">Branch labels (optional)</label>
            <div class="text-xs text-muted mb-2">Label each connection to tell the AI when to take that path.</div>
            ${outs.map((e, i) => {
              const target = nodeById(e.to);
              return `<div class="flex gap-2 mb-2 items-center">
                <input class="field" data-edge-idx="${i}" placeholder="condition (e.g. wants to book)" value="${escapeHtml(e.label || '')}" style="flex:1"/>
                <span class="text-xs text-muted">→ ${escapeHtml(target?.label || '?')}</span>
              </div>`;
            }).join("")}
          </div>` : ""}
        <button class="btn btn-danger btn-sm" id="ip-del" style="width:100%"><i data-lucide="trash-2" class="icon"></i>Delete this step</button>
      `;
      renderIcons(inspector);
      $("#ip-label", inspector).addEventListener("input", e => { node.label = e.target.value; redrawNode(node.id); });
      $("#ip-text", inspector).addEventListener("input", e => { node.text = e.target.value; });
      $$("[data-edge-idx]", inspector).forEach(inp => inp.addEventListener("input", e => {
        const idx = +inp.dataset.edgeIdx;
        outs[idx].label = e.target.value;
        // Update label on canvas
        redraw();
      }));
      $("#ip-del", inspector).addEventListener("click", deleteSelected);
    }

    function redrawNode(id) {
      // re-render only the changed node label without rebuilding everything
      const el = inner.querySelector(`[data-node-id="${id}"]`);
      const node = nodeById(id);
      if (!el || !node) return;
      const meta = nodeTypeMeta(node.type);
      el.querySelector(".fn-label").textContent = node.label || meta.label;
    }

    function redraw() {
      // Render nodes
      // Remove old nodes (not the svg)
      Array.from(inner.querySelectorAll(".flow-node")).forEach(n => n.remove());
      flow.nodes.forEach(node => {
        const meta = nodeTypeMeta(node.type);
        const el = h(`
          <div class="flow-node t-${node.type} ${state.selectedId === node.id ? 'selected' : ''}" data-node-id="${node.id}" style="left:${node.x}px;top:${node.y}px">
            <div class="fn-handle in" data-handle="in"></div>
            <div class="fn-head"><i data-lucide="${meta.icon}" class="icon"></i><span class="fn-label">${escapeHtml(node.label || meta.label)}</span></div>
            <div class="fn-text">${escapeHtml((node.text || '').slice(0, 90))}</div>
            <div class="fn-handle out" data-handle="out"></div>
          </div>
        `);
        inner.appendChild(el);
      });
      renderIcons(inner);
      // Render edges
      svg.innerHTML = "";
      flow.edges.forEach((e, idx) => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("class", "edge");
        p.setAttribute("d", edgePath(a, b));
        p.setAttribute("data-edge-idx", idx);
        svg.appendChild(p);
        if (e.label) {
          const ar = nodeRect(a), br = nodeRect(b);
          const mx = (ar.x + ar.w + br.x) / 2;
          const my = (ar.y + ar.h / 2 + br.y + br.h / 2) / 2 - 6;
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("class", "edge-label");
          t.setAttribute("x", mx);
          t.setAttribute("y", my);
          t.setAttribute("text-anchor", "middle");
          t.textContent = e.label.length > 28 ? e.label.slice(0, 26) + "…" : e.label;
          svg.appendChild(t);
        }
      });
      // ghost edge while dragging
      if (state.dragEdge) {
        const a = nodeById(state.dragEdge.fromId);
        if (a) {
          const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
          p.setAttribute("class", "edge dragging");
          p.setAttribute("d", ghostPath(a, state.dragEdge.gx, state.dragEdge.gy));
          svg.appendChild(p);
        }
      }
      // Wire up node drag, click, handle drag
      Array.from(inner.querySelectorAll(".flow-node")).forEach(el => {
        const id = el.dataset.nodeId;
        el.addEventListener("mousedown", (ev) => {
          if (ev.target.classList.contains("fn-handle")) return;
          ev.stopPropagation();
          state.dragNode = id;
          state.dragNodeStart = { mx: ev.clientX, my: ev.clientY, nx: nodeById(id).x, ny: nodeById(id).y };
        });
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          state.selectedId = id;
          redraw();
          renderInspector();
        });
        // Out handle: start edge drag
        el.querySelector('[data-handle="out"]').addEventListener("mousedown", (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          const c = screenToCanvas(ev.clientX, ev.clientY);
          state.dragEdge = { fromId: id, gx: c.x, gy: c.y };
          redraw();
        });
        // In handle: receive drop (handled in mouseup on canvas with target detection)
      });
      // Edge click to delete
      Array.from(svg.querySelectorAll("path.edge:not(.dragging)")).forEach(p => {
        p.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const idx = +p.dataset.edgeIdx;
          if (confirm("Delete this connection?")) {
            flow.edges.splice(idx, 1);
            redraw();
            renderInspector();
          }
        });
      });
    }

    // Canvas pan + global mouse handlers
    canvas.addEventListener("mousedown", (ev) => {
      // clear selection on empty canvas click
      state.selectedId = null;
      renderInspector();
      state.panning = true;
      state.panStart = { mx: ev.clientX, my: ev.clientY, px: state.pan.x, py: state.pan.y };
      canvas.classList.add("panning");
      redraw();
    });
    window.addEventListener("mousemove", (ev) => {
      if (state.dragNode) {
        const node = nodeById(state.dragNode);
        if (node) {
          const dx = (ev.clientX - state.dragNodeStart.mx) / state.zoom;
          const dy = (ev.clientY - state.dragNodeStart.my) / state.zoom;
          node.x = Math.max(0, state.dragNodeStart.nx + dx);
          node.y = Math.max(0, state.dragNodeStart.ny + dy);
          redraw();
        }
      } else if (state.dragEdge) {
        const c = screenToCanvas(ev.clientX, ev.clientY);
        state.dragEdge.gx = c.x;
        state.dragEdge.gy = c.y;
        redraw();
      } else if (state.panning) {
        state.pan.x = state.panStart.px + (ev.clientX - state.panStart.mx);
        state.pan.y = state.panStart.py + (ev.clientY - state.panStart.my);
        applyTransform();
      }
    });
    window.addEventListener("mouseup", (ev) => {
      if (state.dragEdge) {
        // Find target node under cursor
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetNode = el && el.closest && el.closest(".flow-node");
        if (targetNode && targetNode.dataset.nodeId !== state.dragEdge.fromId) {
          const toId = targetNode.dataset.nodeId;
          // avoid duplicate
          if (!flow.edges.find(e => e.from === state.dragEdge.fromId && e.to === toId)) {
            flow.edges.push({ from: state.dragEdge.fromId, to: toId });
          }
        }
        state.dragEdge = null;
        redraw();
      }
      state.dragNode = null;
      state.panning = false;
      canvas.classList.remove("panning");
    });
    wrapEl.addEventListener("wheel", (ev) => {
      if (!ev.ctrlKey && !ev.metaKey && Math.abs(ev.deltaY) < 4) return;
      ev.preventDefault();
      const r = wrapEl.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const oldZoom = state.zoom;
      const factor = ev.deltaY > 0 ? 0.9 : 1.1;
      state.zoom = Math.max(0.4, Math.min(2, state.zoom * factor));
      // zoom around cursor
      state.pan.x = mx - (mx - state.pan.x) * (state.zoom / oldZoom);
      state.pan.y = my - (my - state.pan.y) * (state.zoom / oldZoom);
      applyTransform();
    }, { passive: false });

    // Drag from palette to canvas
    palette.querySelectorAll(".palette-item").forEach(item => {
      item.addEventListener("dragstart", (ev) => ev.dataTransfer.setData("text/plain", item.dataset.type));
    });
    wrapEl.addEventListener("dragover", (ev) => ev.preventDefault());
    wrapEl.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const type = ev.dataTransfer.getData("text/plain");
      if (!type) return;
      const c = screenToCanvas(ev.clientX, ev.clientY);
      addNode(type, c.x - 100, c.y - 30);
      renderInspector();
    });

    // Click on palette item adds at center
    palette.querySelectorAll(".palette-item").forEach(item => {
      item.addEventListener("click", () => {
        const r = wrapEl.getBoundingClientRect();
        const c = screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
        addNode(item.dataset.type, c.x - 100, c.y - 30);
        renderInspector();
      });
    });

    // Toolbar
    $("#t-fit", shellEl).addEventListener("click", () => {
      if (!flow.nodes.length) return;
      const xs = flow.nodes.map(n => n.x), ys = flow.nodes.map(n => n.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs) + 220;
      const minY = Math.min(...ys), maxY = Math.max(...ys) + 90;
      const r = wrapEl.getBoundingClientRect();
      const z = Math.min(1, Math.min(r.width / (maxX - minX + 80), r.height / (maxY - minY + 80)));
      state.zoom = z;
      state.pan.x = -minX * z + 40;
      state.pan.y = -minY * z + 40;
      applyTransform();
    });
    $("#t-reset", shellEl).addEventListener("click", () => {
      if (!confirm("Reset to the example flow? Your current flow will be replaced.")) return;
      flow = defaultFlow();
      state.selectedId = null;
      redraw();
      renderInspector();
    });
    $("#t-save", shellEl).addEventListener("click", async () => {
      try {
        const newCfg = { ...cfg, flow };
        // Reuse update endpoint — we need to send the full create-shape payload.
        await api(`/agents/${id}`, { method: "PUT", body: {
          name: a.name,
          twilio_number: a.twilio_number,
          forwarding_number: a.forwarding_number,
          voice_id: a.voice_id,
          language: a.language,
          config: newCfg,
        }});
        toast("Flow saved", "success");
      } catch (e) { toast(e.message, "error"); }
    });

    // Keyboard
    document.addEventListener("keydown", function flowKeys(ev) {
      if (!document.body.contains(canvas)) { document.removeEventListener("keydown", flowKeys); return; }
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (document.activeElement && /input|textarea/i.test(document.activeElement.tagName)) return;
        deleteSelected();
      }
    });

    // First paint
    setTimeout(() => {
      renderInspector();
    }, 30);
  }
  /* eslint-enable no-unreachable */
});

// --- Render dispatcher ---
async function render() {
  const root = $("#root");
  root.innerHTML = "";

  const r = parseRoute();

  // Public visitors always see the landing page first.
  if (!Store.token) {
    if (r.path === "/login" || r.path === "/signup") {
      location.hash = "#/";
    }
    root.appendChild(await routes.auth());
    renderIcons();
    return;
  }

  // Always re-fetch /auth/me on a fresh page load so we have authoritative state.
  if (!Store._refreshed) {
    try {
      const me = await api("/auth/me");
      Store.user = me;
      Store._refreshed = true;
    } catch { /* token invalid; api() already clears */ }
  }

  if (!Store.token) {
    root.appendChild(await routes.auth());
    renderIcons();
    return;
  }

  let view;
  if (r.path === "/login" || r.path === "/signup") { view = await routes.auth(); }
  else if (r.path === "/onboarding") { view = await routes.onboarding(); }
  else if (r.path === "/" || r.path === "" || r.path === "/dashboard") { view = await routes.dashboard(); }
  else if (r.path === "/calls") { view = await routes.calls(); }
  else if (r.path === "/agents") { view = await routes.agents(); }
  else if (r.path === "/agents/new") { view = await routes.agentNew(); }
  else if (r.parts[0] === "agents" && r.parts[2] === "edit") { view = await routes.agentEdit(r.parts[1]); }
  else if (r.parts[0] === "agents" && r.parts[2] === "setup") { view = await routes.agentSetup(r.parts[1]); }
  else if (r.parts[0] === "agents" && r.parts[2] === "flow") { view = await routes.agentFlow(r.parts[1]); }
  else if (r.path === "/preview") { view = await routes.preview(); }
  else if (r.path === "/settings") { view = await routes.settings(); }
  else if (r.path === "/billing") { view = await routes.billing(); }
  else if (r.path === "/billing-success") { view = await routes.billingSuccess(); }
  else { view = await routes.dashboard(); }

  root.appendChild(view);
  renderIcons();
}

render();
