// Harkly AI dashboard — single-page app, vanilla JS, no build step.
// Uses Lucide for icons (loaded from CDN in index.html).

const API = "";
const API_PREFIX = "/api";
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
  if (res.status === 401) {
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
  playBtn.addEventListener("click", () => {
    if (!window.speechSynthesis) { toast("Speech not supported in this browser","error"); return; }
    if (speaking) {
      window.speechSynthesis.cancel(); speaking = false;
      lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); return;
    }
    const langCode = PREVIEW_LANG_MAP[selectedLang] || "en-US";
    const text = GREETINGS[langCode] || `Hi, this is ${Store.user?.name || "your AI receptionist"} from Harkly AI. How can I help you today?`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = langCode; u.rate = selectedVoice.rate; u.pitch = selectedVoice.pitch;
    currentPitch = selectedVoice.pitch;
    speaking = true; lbl.textContent = "Stop"; playBtn.classList.add("playing");
    u.onend = u.onerror = () => { speaking = false; lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); };
    try { window.speechSynthesis.speak(u); } catch { speaking = false; lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); }
  });

  return {
    setVoice(v) { selectedVoice = v; currentPitch = v.pitch; },
    setLang(l) { selectedLang = l; },
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
            <span class="lp-title-line">Your Phone Rings. <em>Harkly AI</em> Answers.</span>
            <span class="lp-title-line">Human-Like Voice. <em>Every Call. 24/7.</em></span>
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
          <p>Every plan starts with a 7-day free trial. No credit card required. Cancel any time.</p>
        </div>
        <div class="lp-plan-grid">
          ${LANDING_PLANS.map(p => `
            <div class="lp-plan ${p.badge ? 'has-badge' : ''} ${p.key === 'growth' ? 'featured' : ''}">
              ${p.badge ? `<span class="lp-plan-badge">${p.badge}</span>` : ""}
              <div class="lp-plan-name">${p.name}</div>
              <div class="lp-plan-sub">${p.sub}</div>
              <div class="lp-plan-price">
                ${p.price !== null
                  ? `<span class="amt">$${p.price}</span><span class="per">/month</span>`
                  : `<span class="amt amt-talk">Custom</span>`}
              </div>
              <ul class="lp-plan-feats">
                ${p.features.map(f => `<li><span class="tick">✓</span>${f}</li>`).join("")}
              </ul>
              <button class="lp-plan-cta" data-open-auth="signup">
                ${p.price !== null ? "Start free trial" : "Talk to us"}
              </button>
            </div>`).join("")}
        </div>
      </section>

      <!-- GRADIENT TRANSITION: cream → black footer -->
      <div class="lp-grad-tofoot" aria-hidden="true"></div>

      <!-- FOOTER (parabola → fully horizontal, with triangular light glow toward name) -->
      <footer class="lp-footer">
        <div class="lp-footer-light"></div>
        <div class="lp-footer-links">
          <div class="lp-footer-col">
            <h4>Harkly AI</h4>
            <p>The autonomous voice receptionist that picks up so you never miss the call that matters.</p>
          </div>
          <div class="lp-footer-col">
            <h4>Product</h4>
            <a data-scroll="lp-cases">Features</a><a data-scroll="lp-billing">Pricing</a><a data-scroll="lp-try">Try it live</a>
          </div>
          <div class="lp-footer-col">
            <h4>Company</h4>
            <a>About</a><a>Customers</a><a>Careers</a><a>Contact</a>
          </div>
          <div class="lp-footer-col">
            <h4>Legal</h4>
            <a>Privacy</a><a>Terms</a><a>Security</a><a>DPA</a>
          </div>
        </div>

        <div class="lp-bigword" id="lp-bigword">
          ${"HARKLY AI".split("").map(c => c === " " ? `<span class="ltr ltr-space">&nbsp;</span>` : `<span class="ltr">${c}</span>`).join("")}
        </div>

        <div class="lp-footer-bottom">
          <span>© 2026 Harkly AI, Inc.</span>
          <span>Made for the calls that matter.</span>
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

  const vapi = window.Vapi ? new window.Vapi("bace6e2b-19b8-403f-84aa-7c9b8ae0dea8") : null;

  const ctx = canvas.getContext("2d");
  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = r.width  * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
  }
  resize();
  window.addEventListener("resize", resize);

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

  if (vapi) {
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
      lbl.textContent = "🛑 Stop Speaking";
      btn.disabled = false;
      btn.classList.add("live");
      vapiCallActive = true;
    }

    vapi.on("call-start", () => {
      setButtonActive();
      status.innerHTML = `<strong>Connected.</strong> Speak — the agent is listening.`;
      listening = true;
    });

    vapi.on("call-end", () => {
      setButtonIdle();
      status.innerHTML = `Call ended. Tap the mic to start a new conversation.`;
      listening = false;
      agentSpeaking = false;
    });

    vapi.on("speech-start", () => {
      agentSpeaking = true;
      status.innerHTML = `<strong>Agent speaking…</strong>`;
    });

    vapi.on("speech-end", () => {
      agentSpeaking = false;
      status.innerHTML = `<strong>Listening…</strong> Go ahead and speak.`;
    });

    vapi.on("error", () => {
      setButtonIdle();
      status.innerHTML = `Something went wrong — tap the mic to try again.`;
      listening = false;
      agentSpeaking = false;
    });

    btn.addEventListener("click", () => {
      if (vapiCallActive) {
        vapi.stop();
      } else {
        setButtonConnecting();
        status.innerHTML = `<strong>Connecting…</strong>`;
        vapi.start("d5f28a96-25da-4905-bac8-5dee52a15f4e");
      }
    });
  } else {
    btn.addEventListener("click", startConversation);
  }
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
    const rect = wrap.getBoundingClientRect();
    const vh   = window.innerHeight;
    // progress: 0 when element bottom just enters viewport, 1 when centred
    const raw  = 1 - (rect.top + rect.height * 0.5) / vh;
    const t    = Math.max(0, Math.min(1, raw * 1.5));
    // Ease-out⁶ — snaps clean to flat at the end
    const ease = 1 - Math.pow(1 - t, 6);
    const remaining = 1 - ease;
    const flat = remaining < 0.08 ? 0 : remaining;

    // Upside-down U parabola: peak at centre (x=0), zero at edges (x=±1)
    const curve  = flat * 520;   // px at peak
    const maxRot = flat * 14;    // deg tilt at edges
    allSpans.forEach((el, i) => {
      const x    = positions[i];
      const lift = -curve * (1 - x * x); // arch formula
      const rot  = maxRot * x;
      el.style.transform = `translateY(${lift.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scaleY(1.28)`;
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
  // remove any existing modal
  document.querySelectorAll(".auth-modal-backdrop").forEach(n => n.remove());
  let mode = initialMode === "signup" ? "signup" : "login";
  const modal = h(`
    <div class="auth-modal-backdrop auth-modal-backdrop-light">
      <div class="auth-mesh" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-a" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-b" aria-hidden="true"></div>
      <div class="auth-bg-blob auth-bg-blob-c" aria-hidden="true"></div>
      <div class="auth-modal auth-modal-pop" role="dialog" aria-modal="true">
        <button class="x-close" aria-label="Close">×</button>
        <h2 id="m-title">Welcome back</h2>
        <div class="modal-sub" id="m-sub">Sign in to manage your agents and calls.</div>

        <div class="auth-tabs" id="m-tabs">
          <button class="${mode==='login'?'active':''}" data-mode="login">Sign in</button>
          <button class="${mode==='signup'?'active':''}" data-mode="signup">Create account</button>
        </div>
        <form id="m-form" class="grid" style="gap:12px">
          <div id="m-name-row" class="${mode==='signup'?'':'hidden'}">
            <label class="label">Your name</label>
            <input id="m-name" class="field" placeholder="Jane Cooper" autocomplete="name"/>
          </div>
          <div id="m-company-row" class="${mode==='signup'?'':'hidden'}">
            <label class="label">Company name</label>
            <input id="m-company" class="field" placeholder="City Dental" autocomplete="organization"/>
          </div>
          <div id="m-biztype-row" class="${mode==='signup'?'':'hidden'}">
            <label class="label">What type of business?</label>
            <select id="m-biztype" class="field">
              <option value="">Select your industry…</option>
              ${BUSINESS_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
            </select>
          </div>
          <div id="m-role-row" class="${mode==='signup'?'':'hidden'}">
            <label class="label">Your role</label>
            <select id="m-role" class="field">
              <option value="">Select your role…</option>
              <option value="Founder">Founder</option>
              <option value="Owner">Owner</option>
              <option value="CEO">CEO / MD</option>
              <option value="Manager">Manager</option>
              <option value="Sales">Sales</option>
              <option value="Marketing">Marketing</option>
              <option value="Operations">Operations</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="label">Gmail</label>
            <input id="m-email" type="email" class="field" placeholder="you@gmail.com" autocomplete="email" required/>
          </div>
          <div>
            <label class="label">Password</label>
            <input id="m-password" type="password" class="field" placeholder="At least 8 characters" minlength="6" autocomplete="current-password" required/>
            <div id="m-pw-meter" class="${mode==='signup'?'':'hidden'}" style="margin-top:6px">
              <div class="pw-meter-bars">
                <div class="pw-bar" id="pw-b0"></div>
                <div class="pw-bar" id="pw-b1"></div>
                <div class="pw-bar" id="pw-b2"></div>
                <div class="pw-bar" id="pw-b3"></div>
              </div>
              <div class="pw-meter-label" id="pw-label">Enter a password</div>
            </div>
          </div>
          <button class="btn btn-primary btn-lg mt-2" id="m-submit" type="submit">
            <i data-lucide="arrow-right" class="icon"></i><span>${mode==='signup'?'Create account':'Continue'}</span>
          </button>
          <div id="m-err" class="text-xs text-danger hidden"></div>
        </form>
        <p class="text-xs text-muted mt-6 text-center" style="color:rgba(231,234,243,0.45)">
          By continuing you agree to Harkly AI's terms of service.
        </p>
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

  const setMode = (m) => {
    mode = m;
    $$("#m-tabs button", modal).forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    const isSignup = m === "signup";
    ["#m-name-row","#m-company-row","#m-biztype-row","#m-role-row"].forEach(sel => {
      $(sel, modal).classList.toggle("hidden", !isSignup);
    });
    $("#m-name", modal).required = isSignup;
    $("#m-submit span", modal).textContent = isSignup ? "Create account" : "Continue";
    $("#m-title", modal).textContent = isSignup ? "Create your account" : "Welcome back";
    $("#m-sub", modal).textContent = isSignup
      ? "Set up your AI receptionist in under twelve minutes."
      : "Sign in to manage your agents and calls.";
    // Toggle password strength meter visibility
    const pwMeter = $("#m-pw-meter", modal);
    if (pwMeter) pwMeter.classList.toggle("hidden", !isSignup);
  };
  $$("#m-tabs button", modal).forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  $("#m-form", modal).addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#m-err", modal); err.classList.add("hidden");

    // Clear previous inline errors
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

    if (mode === "signup") {
      const nameEl  = $("#m-name", modal);
      const emailEl = $("#m-email", modal);
      const pwEl    = $("#m-password", modal);
      if (!nameEl.value.trim())                                   fieldErr(nameEl,  "Please enter your name.");
      if (!emailEl.value.trim())                                  fieldErr(emailEl, "Please enter your email address.");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value.trim())) fieldErr(emailEl, "Please enter a valid email address.");
      if (!pwEl.value)                                            fieldErr(pwEl,    "Please enter a password.");
      else if (pwEl.value.length < 6)                            fieldErr(pwEl,    "Password must be at least 6 characters.");
    } else {
      const emailEl = $("#m-email", modal);
      const pwEl    = $("#m-password", modal);
      if (!emailEl.value.trim()) fieldErr(emailEl, "Please enter your email address.");
      if (!pwEl.value)           fieldErr(pwEl,    "Please enter your password.");
    }

    if (hasError) return;

    const body = mode === "signup"
      ? {
          name: $("#m-name", modal).value,
          company_name: $("#m-company", modal).value,
          business_type: $("#m-biztype", modal).value,
          role: $("#m-role", modal).value,
          email: $("#m-email", modal).value,
          password: $("#m-password", modal).value,
        }
      : { email: $("#m-email", modal).value, password: $("#m-password", modal).value };
    try {
      const r = await api(`/auth/${mode}`, { method: "POST", body, auth: false });
      Store.token = r.access_token;
      const me = await api("/auth/me");
      Store.user = me;
      toast(`Welcome${me.name ? ", " + me.name.split(" ")[0] : ""}!`, "success");
      close();
      navigate("#/agents");
    } catch (ex) {
      const msg = (ex.message || "").toLowerCase();
      if (msg.includes("invalid") || msg.includes("credentials") || msg.includes("password") || msg.includes("incorrect")) {
        err.textContent = mode === "login"
          ? "Wrong email or password. Please try again."
          : ex.message;
      } else if (msg.includes("not found") || msg.includes("no account") || msg.includes("does not exist")) {
        err.innerHTML = `No account found with this email. <a href="#" id="m-switch-signup" style="color:#f97316;text-decoration:underline;">Create your account now →</a>`;
        const sw = $("#m-switch-signup", modal);
        if (sw) sw.addEventListener("click", (ev) => { ev.preventDefault(); setMode("signup"); err.classList.add("hidden"); });
      } else if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) {
        err.innerHTML = `An account with this email already exists. <a href="#" id="m-switch-login" style="color:#f97316;text-decoration:underline;">Sign in instead →</a>`;
        const sw = $("#m-switch-login", modal);
        if (sw) sw.addEventListener("click", (ev) => { ev.preventDefault(); setMode("login"); err.classList.add("hidden"); });
      } else {
        err.textContent = ex.message || "Something went wrong. Please try again.";
      }
      err.classList.remove("hidden");
    }
  });

  // Password strength meter
  (function initPwMeter() {
    const pwInput  = $("#m-password", modal);
    const meterWrap = $("#m-pw-meter", modal);
    if (!pwInput || !meterWrap) return;
    const bars  = [0,1,2,3].map(i => $(`#pw-b${i}`, modal));
    const label = $("#pw-label", modal);
    const WEAK_COLORS   = ["#ef4444","#ef4444","#d1d5db","#d1d5db"];
    const MED_COLORS    = ["#f97316","#f97316","#f97316","#d1d5db"];
    const STRONG_COLORS = ["#22c55e","#22c55e","#22c55e","#22c55e"];
    function score(v) {
      let s = 0;
      if (v.length >= 8)              s++;
      if (/[A-Z]/.test(v))            s++;
      if (/[0-9]/.test(v))            s++;
      if (/[^A-Za-z0-9]/.test(v))    s++;
      return s;
    }
    function updateMeter(v) {
      if (!v) { bars.forEach(b => b.style.background="#d1d5db"); label.textContent="Enter a password"; label.style.color=""; return; }
      const s = score(v);
      let colors, text, color;
      if (s <= 1)      { colors=WEAK_COLORS;   text="Weak — add uppercase, numbers & symbols"; color="#ef4444"; }
      else if (s === 2){ colors=MED_COLORS;    text="Fair — getting better!"; color="#f97316"; }
      else if (s === 3){ colors=STRONG_COLORS; text="Good password"; color="#22c55e"; }
      else             { colors=STRONG_COLORS; text="Strong password ✓"; color="#22c55e"; }
      bars.forEach((b,i) => b.style.background = colors[i]);
      label.textContent = text; label.style.color = color;
    }
    pwInput.addEventListener("input", () => {
      if (mode === "signup") updateMeter(pwInput.value);
    });
    // Store score check for submit
    modal._pwScore = () => (mode === "signup" ? score(pwInput.value) : 99);
  })();

  // Validate all visible fields before submit — show red border on empty ones
  $("#m-form", modal).addEventListener("submit", (e) => {
    e.preventDefault();
    let blocked = false;
    const fields = modal.querySelectorAll(".field");
    fields.forEach(f => {
      const row = f.closest('[id$="-row"]');
      const isHidden = row && row.classList.contains("hidden");
      if (!isHidden && f.offsetParent !== null && !f.value.trim()) {
        f.classList.add("field-error");
        blocked = true;
      } else {
        f.classList.remove("field-error");
      }
      f.addEventListener("input", () => f.classList.remove("field-error"), { once: true });
    });
    // Block weak passwords on signup
    if (mode === "signup" && modal._pwScore && modal._pwScore() <= 1) {
      const pwField = $("#m-password", modal);
      if (pwField) pwField.classList.add("field-error");
      const label = $("#pw-label", modal);
      if (label) { label.textContent = "Password is too weak — please strengthen it"; label.style.color = "#ef4444"; }
      blocked = true;
    }
    if (blocked) e.stopImmediatePropagation();
  }, true);

  // Also toggle meter visibility when switching modes
  const _origSetMode = window.__authSetMode;
  const meterEl = $("#m-pw-meter", modal);
  if (meterEl) {
    const origSetMode = typeof setMode === "function" ? setMode : null;
    modal._toggleMeter = (m) => {
      if (meterEl) meterEl.classList.toggle("hidden", m !== "signup");
    };
  }

  setTimeout(() => $("#m-email", modal).focus(), 50);
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
  const u = Store.user || { name: "—", email: "" };
  const initials = (u.name || u.email || "?").split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
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
              <div class="text-sm font-medium truncate">${escapeHtml(u.name || "—")}</div>
              <div class="text-xs text-muted truncate">${escapeHtml(u.email)}</div>
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
          <button class="btn btn-ghost btn-sm" id="new-agent2"><i data-lucide="plus" class="icon"></i></button>
        </div>
        <div id="agents-mini">${skeleton(3)}</div>
      </div>
    </div>

    <div class="card mt-4" id="dash-preview">
      <div class="dash-prev-head">
        <div>
          <div class="font-semibold" style="font-size:14px">Agent Voice Preview</div>
          <div class="text-xs text-muted mt-1">Pick a voice and language — hear exactly how your agent will sound on a live call.</div>
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
  $("#new-agent2", page).addEventListener("click", () => navigate("#/agents/new"));

  // --- Dashboard Preview section: waveform + voices + languages ---
  (function initDashPreview() {
    const canvas = page.querySelector("#dash-prev-wave");
    const playBtn = page.querySelector("#dash-prev-play");
    const lbl = page.querySelector("#dash-prev-lbl");
    if (!canvas || !playBtn) return;
    const ctx = canvas.getContext("2d");
    let speaking = false, t = 0, level = 0.1, raf = null, currentPitch = 1.15;
    let selectedVoice = PREVIEW_VOICES[0];
    let selectedLang = PREVIEW_LANGS[0];

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

    page.querySelectorAll(".dash-prev-voice").forEach(b => b.addEventListener("click", () => {
      page.querySelectorAll(".dash-prev-voice").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      selectedVoice = PREVIEW_VOICES.find(v => v.id === b.dataset.vid) || PREVIEW_VOICES[0];
      currentPitch = selectedVoice.pitch;
    }));
    page.querySelectorAll(".dash-prev-lang").forEach(b => b.addEventListener("click", () => {
      page.querySelectorAll(".dash-prev-lang").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      selectedLang = b.dataset.lang;
    }));

    playBtn.addEventListener("click", () => {
      if (!window.speechSynthesis) { toast("Speech not supported in this browser", "error"); return; }
      if (speaking) {
        window.speechSynthesis.cancel();
        speaking = false;
        lbl.textContent = "Play sample";
        playBtn.classList.remove("playing");
        return;
      }
      const langCode = PREVIEW_LANG_MAP[selectedLang] || "en-US";
      const greetings = {
        "hi-IN": "नमस्ते, यहाँ Harkly AI है। मैं आपकी कैसे मदद कर सकता हूँ?",
        "es-ES": "Hola, le habla Harkly AI. ¿En qué le puedo ayudar?",
        "fr-FR": "Bonjour, ici Harkly AI. Comment puis-je vous aider?",
        "zh-CN": "您好，这里是Harkly AI。我可以如何帮助您？",
        "vi-VN": "Xin chào, đây là Harkly AI. Tôi có thể giúp gì cho bạn?",
        "ar-SA": "مرحبا، هذا Harkly AI. كيف يمكنني مساعدتك؟",
      };
      const text = greetings[langCode] || `Hi, this is ${Store.user?.name || "your AI assistant"} from Harkly AI. How can I help you today?`;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = langCode;
      u.rate = selectedVoice.rate;
      u.pitch = selectedVoice.pitch;
      currentPitch = selectedVoice.pitch;
      speaking = true;
      lbl.textContent = "Stop";
      playBtn.classList.add("playing");
      u.onend = u.onerror = () => { speaking = false; lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); };
      try { window.speechSynthesis.speak(u); } catch (e) { speaking = false; lbl.textContent = "Play sample"; playBtn.classList.remove("playing"); }
    });
  })();

  try {
    const [stats, agents, recent] = await Promise.all([api("/dashboard/stats"), api("/agents/list"), api("/calls/recent")]);
    const active = (agents.agents || []).filter(a => a.is_active).length;
    const total = (agents.agents || []).length;
    $("#stats", page).innerHTML = [
      statCard({ label: "Calls today", value: stats.calls_today ?? 0, sub: `${stats.calls_total ?? 0} all-time`, icon: "phone" }),
      statCard({ label: "Bookings", value: stats.bookings ?? 0, sub: "from AI conversations", icon: "calendar-check", accent: true }),
      statCard({ label: "Urgent", value: stats.urgent_calls ?? 0, sub: "flagged for follow-up", icon: "alert-triangle" }),
      statCard({ label: "Active agents", value: active, sub: `${total} total`, icon: "bot" }),
    ].join("");
    renderIcons($("#stats", page));
    renderRecentCalls($("#recent", page), (recent.calls || []).slice(0, 6));
    const am = $("#agents-mini", page);
    if (!total) {
      am.innerHTML = `<button class="btn btn-primary" style="width:100%" id="ca">Create your first agent</button>`;
      $("#ca", am).addEventListener("click", () => navigate("#/agents/new"));
    } else {
      am.innerHTML = (agents.agents || []).slice(0, 5).map(a => `
        <div class="flex items-center gap-3" style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div class="dot ${a.is_active ? 'dot-success' : 'dot-muted'}"></div>
          <div style="flex:1;min-width:0">
            <div class="text-sm font-medium truncate">${escapeHtml(a.name)}</div>
            <div class="text-xs text-muted truncate">${escapeHtml(a.config?.business_name || "")}</div>
          </div>
          <span class="text-xs text-muted">${a.is_active ? "Live" : "Paused"}</span>
        </div>`).join("");
    }
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
  // Minimal: just the agentinfo box centered. User adds the rest with the "+" orb.
  return {
    boxes: [
      { id: "ag", kind: "agentinfo", x: 360, y: 200,
        data: { name: agent.config?.agent_name || agent.name || "Agent", role: "Voice AI Receptionist", voice: agent.voice_id || "maya", languages: ["English (US)"] } },
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
          <div class="ag-meta-row"><i data-lucide="globe" class="icon"></i><span>${escapeHtml(lang)}</span></div>
          <div class="ag-meta-row"><i data-lucide="mic" class="icon"></i><span>${escapeHtml(voice)}</span></div>
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
          <button class="ag-btn ag-btn-primary" data-act="flow" data-id="${a.id}">
            <i data-lucide="git-branch" class="icon"></i>Flow builder
          </button>
          <button class="ag-btn ag-btn-ghost" data-act="edit" data-id="${a.id}">
            <i data-lucide="settings-2" class="icon"></i>Settings
          </button>
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
      const selLangs = Array.isArray(box.data.languages) ? box.data.languages : ["English (US)"];
      body = `
        <label class="agb-flabel">Agent name</label>
        <input class="agb-inline" data-field="name" placeholder="e.g. Maya" value="${escapeHtml(box.data.name || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Role / what it does</label>
        <input class="agb-inline" data-field="role" placeholder="e.g. Dental receptionist" value="${escapeHtml(box.data.role || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Voice</label>
        <select class="agb-inline" data-field="voice">
          ${PREVIEW_VOICES.map(v =>
            `<option value="${v.id}" ${box.data.voice === v.id ? 'selected' : ''}>${v.label} — ${v.sub}</option>`).join("")}
        </select>
        <label class="agb-flabel" style="margin-top:8px">Languages spoken</label>
        <div class="agb-lang-grid" data-box-id="${box.id}">
          ${PREVIEW_LANGS.map(l => `
            <button class="agb-lang-chip ${selLangs.includes(l) ? 'sel' : ''}" data-lang="${escapeHtml(l)}">${escapeHtml(l.split(" ")[0])}</button>
          `).join("")}
        </div>`;
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
        <label class="agb-flabel">Paste text or URL</label>
        <input class="agb-inline" data-field="url" placeholder="https://yourbiz.com/menu" value="${escapeHtml(box.data.url || '')}"/>
        <label class="agb-flabel" style="margin-top:6px">Or type knowledge directly</label>
        <textarea class="agb-inline agb-textarea" data-field="text" placeholder="Paste menu, FAQ, intake form text…">${escapeHtml(box.data.text || '')}</textarea>
        <label class="agb-upload-label" style="margin-top:6px">
          <input type="file" class="agb-upload-input" data-field="files" multiple accept=".pdf,.doc,.docx,.txt"/>
          <span class="agb-upload-ic">${brandSvg("upload")}</span>
          <span>${files.length ? `${files.length} file(s) attached` : 'Upload PDF / DOC / TXT'}</span>
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
    page.appendChild(agentSubtabs(id, "edit"));
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
    page.appendChild(agentSubtabs(id, "connect"));

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
      page.querySelectorAll("[data-svid]").forEach(b => b.addEventListener("click", () => {
        page.querySelectorAll("[data-svid]").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        sVoice2 = PREVIEW_VOICES.find(v => v.id === b.dataset.svid) || PREVIEW_VOICES[0];
        cPitch2 = sVoice2.pitch;
      }));
      const LANG_SIMPLE = { Hindi:"hi-IN", Spanish:"es-ES", French:"fr-FR", Mandarin:"zh-CN", Vietnamese:"vi-VN", Arabic:"ar-SA", German:"de-DE", Japanese:"ja-JP", Portuguese:"pt-PT", Korean:"ko-KR" };
      const langCode = LANG_SIMPLE[cfg.language] || "en-US";
      const GRTS2 = { "hi-IN":"नमस्ते, यहाँ Harkly AI है। मैं आपकी कैसे मदद कर सकता हूँ?", "es-ES":"Hola, le habla Harkly AI. ¿En qué le puedo ayudar?", "fr-FR":"Bonjour, ici Harkly AI. Comment puis-je vous aider?", "zh-CN":"您好，这里是Harkly AI。我可以如何帮助您？" };
      const agentName = cfg.agent_name || "your AI receptionist";
      const bizName   = cfg.business_name || "Harkly AI";
      const greeting  = GRTS2[langCode] || `Hi, this is ${agentName} from ${bizName}. How can I help you today?`;
      svpPlay.addEventListener("click", () => {
        if (!window.speechSynthesis) { toast("Speech not supported in this browser","error"); return; }
        if (spk2) { window.speechSynthesis.cancel(); spk2=false; svpLbl.textContent="Play"; svpPlay.classList.remove("playing"); return; }
        const u = new SpeechSynthesisUtterance(greeting);
        u.lang=langCode; u.rate=sVoice2.rate; u.pitch=sVoice2.pitch; cPitch2=sVoice2.pitch;
        spk2=true; svpLbl.textContent="Stop"; svpPlay.classList.add("playing");
        u.onend=u.onerror=()=>{ spk2=false; svpLbl.textContent="Play"; svpPlay.classList.remove("playing"); };
        try { window.speechSynthesis.speak(u); } catch { spk2=false; svpLbl.textContent="Play"; svpPlay.classList.remove("playing"); }
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
  const wrap = shell("settings", "Settings", "Account preferences and integration keys.");
  const page = $("#page", wrap);
  const u = Store.user || {};
  page.innerHTML = `
    <div class="card p-5 mb-4">
      <div class="font-semibold mb-3">Account</div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label">Name</label><input class="field" value="${escapeHtml(u.name||'')}" disabled/></div>
        <div><label class="label">Email</label><input class="field" value="${escapeHtml(u.email||'')}" disabled/></div>
      </div>
      <div class="text-xs text-muted mt-3">Account editing is read-only in this build.</div>
    </div>
    <div class="card p-5">
      <div class="font-semibold mb-3">Integration status</div>
      <div id="health" class="grid grid-cols-2 gap-3">${skeleton(2)}</div>
    </div>`;
  try {
    const h = await api("/health", { auth: false });
    const row = (label, ok) => `<div class="flex items-center justify-between p-3" style="border:1px solid var(--border);border-radius:10px"><div class="text-sm">${label}</div><span class="badge ${ok?'badge-success':'badge-muted'}">${ok?'Connected':'Not configured'}</span></div>`;
    $("#health", page).innerHTML = [
      row("Database (Postgres)", h.database_configured),
      row("OpenAI", h.openai_configured),
      row("Twilio", h.twilio_configured),
      row("ElevenLabs", !!h.elevenlabs_configured),
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

  // Helper: match agent config to PREVIEW_VOICES/PREVIEW_LANGS indexes
  function agentVoiceIdx(agent) {
    const v = agent?.config?.voice;
    if (!v) return 0;
    const idx = PREVIEW_VOICES.findIndex(x => x.id === v || x.label.toLowerCase() === v.toLowerCase());
    return idx >= 0 ? idx : 0;
  }
  function agentLangIdx(agent) {
    const l = agent?.config?.language;
    if (!l) return 0;
    const idx = PREVIEW_LANGS.findIndex(x => x.toLowerCase().startsWith(l.toLowerCase()) || l.toLowerCase().startsWith(x.split(" ")[0].toLowerCase()));
    return idx >= 0 ? idx : 0;
  }

  let initVoiceIdx = agentVoiceIdx(firstAgent);
  let initLangIdx  = agentLangIdx(firstAgent);

  page.innerHTML = `
    <div class="pv2-shell">

      <!-- LEFT: Slim controls -->
      <div class="pv2-controls">
        <div class="pv2-ctrl-section">
          <div class="pv2-ctrl-label">Agent</div>
          <select class="pv2-select" id="pv2-agent-sel">
            ${agents.map((a, i) => `<option value="${i}">${escapeHtml(a.name)}${a.is_active ? " ●" : ""}</option>`).join("")}
          </select>
        </div>

        <div class="pv2-ctrl-section">
          <div class="pv2-ctrl-label">Voice</div>
          <select class="pv2-select" id="pv2-voice-sel">
            ${PREVIEW_VOICES.map((v, i) => `<option value="${i}" ${i===initVoiceIdx?'selected':''}>${escapeHtml(v.label)} — ${escapeHtml(v.sub)}</option>`).join("")}
          </select>
        </div>

        <div class="pv2-ctrl-section">
          <div class="pv2-ctrl-label">Language <span class="pv2-lang-count">${PREVIEW_LANGS.length} available</span></div>
          <select class="pv2-select pv2-select-lang" id="pv2-lang-sel">
            ${PREVIEW_LANGS.map((l, i) => `<option value="${i}" ${i===initLangIdx?'selected':''}>${escapeHtml(l)}</option>`).join("")}
          </select>
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
  if (agentSel) agentSel.addEventListener("change", () => {
    const i = +agentSel.value;
    selAgent = agents[i] || null;
    updateAgentName();
    // Update voice/lang dropdowns to match the selected agent's config
    const vi = agentVoiceIdx(selAgent);
    const li = agentLangIdx(selAgent);
    const vs = $("#pv2-voice-sel", page);
    const ls = $("#pv2-lang-sel", page);
    if (vs) vs.value = vi;
    if (ls) ls.value = li;
    selVoice = PREVIEW_VOICES[vi];
    selLang  = PREVIEW_LANGS[li];
    if (pvCtrl) { pvCtrl.setVoice(selVoice); pvCtrl.setLang(selLang); }
  });

  const stageEl = $("#pv-stage", page);
  const pvCtrl = mountVoicePreview(stageEl, selLang);
  if (pvCtrl) pvCtrl.setVoice(selVoice);

  const voiceSel = $("#pv2-voice-sel", page);
  if (voiceSel && pvCtrl) voiceSel.addEventListener("change", () => {
    selVoice = PREVIEW_VOICES[+voiceSel.value] || PREVIEW_VOICES[0];
    pvCtrl.setVoice(selVoice);
  });

  const langSel = $("#pv2-lang-sel", page);
  if (langSel && pvCtrl) langSel.addEventListener("change", () => {
    selLang = PREVIEW_LANGS[+langSel.value] || PREVIEW_LANGS[0];
    pvCtrl.setLang(selLang);
    const statusEl = $("#pv-status-txt", page);
    if (statusEl) statusEl.textContent = `Language: ${selLang}`;
  });

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
    { type: "whatsapp",  label: "WhatsApp Live",    color: "#25D366", brandKey: "whatsapp", icon: "message-circle" },
    { type: "gmail",     label: "Gmail",             color: "#EA4335", brandKey: "gmail",    icon: "mail"           },
    { type: "gcal",      label: "Google Calendar",   color: "#1A73E8", brandKey: "gcal",     icon: "calendar"       },
    { type: "info",      label: "Business Info",     color: "#6366F1", brandKey: null,       icon: "file-text"      },
    { type: "phone",     label: "Phone Number",      color: "#0D6EFD", brandKey: "phone",    icon: "phone"          },
    { type: "voice",     label: "Voice Type",        color: "#F59E0B", brandKey: null,       icon: "mic"            },
    { type: "language",  label: "Languages",         color: "#10B981", brandKey: null,       icon: "globe"          },
    { type: "slack",     label: "Slack Alerts",      color: "#4A154B", brandKey: "slack",    icon: "layers"         },
  ];

  const saved = (cfg.flow_v2 && cfg.flow_v2.cards) ? cfg.flow_v2 : { cards: [], edges: [] };
  const state = { cards: saved.cards, edges: saved.edges, dragEdgeFrom: null, mouse: { x: 0, y: 0 } };
  const CARD_W = 236, CARD_H = 136;

  function genId() { return "c" + Math.random().toString(36).slice(2, 9); }
  function cardMeta(type) { return INT_CARDS.find(c => c.type === type) || INT_CARDS[3]; }

  const shellEl = h(`
    <div class="fb-shell">
      <div class="fb-canvas-area">
        <div class="fb-canvas-bar">
          <span class="fb-canvas-bar-title">Canvas · <span id="fb-cnt">0</span> cards</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" id="fb-clear">Clear</button>
            <button class="btn btn-primary btn-sm" id="fb-save"><i data-lucide="save" class="icon"></i>Save agent</button>
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
        </div>
      </aside>
    </div>
  `);

  const previewEl = h(`
    <div class="fb-preview">
      <canvas class="fb-wave" id="fb-wave"></canvas>
      <div class="fb-preview-glow"></div>
      <div class="fb-preview-content">
        <div class="fb-preview-tag">Voice Preview</div>
        <div class="fb-vpills" id="fb-vpills">
          ${PREVIEW_VOICES.slice(0, 5).map(v => `
            <button class="fb-vpill${v.id === "maya" ? " active" : ""}" data-voice="${v.id}">
              <span class="fb-vpill-name">${v.label}</span>
              <span class="fb-vpill-sub">${v.sub}</span>
            </button>`).join("")}
        </div>
        <div class="fb-preview-controls">
          <select class="fb-lang-sel" id="fb-lang-sel">
            ${PREVIEW_LANGS.slice(0, 14).map(l => `<option>${escapeHtml(l)}</option>`).join("")}
          </select>
          <button class="fb-play" id="fb-play"><span id="fb-play-lbl">▶ Play sample</span></button>
        </div>
      </div>
    </div>
  `);

  page.appendChild(shellEl);
  page.appendChild(previewEl);
  renderIcons(shellEl);

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

  function cardBodyHTML(card) {
    const c = card.config || {};
    const ci = (ph, field, val) => `<input class="fb-ci" placeholder="${ph}" data-field="${field}" value="${escapeHtml(val || '')}" />`;
    if (card.type === "voice") return `<select class="fb-ci" data-field="voice">${PREVIEW_VOICES.map(v => `<option value="${v.id}"${c.voice===v.id?" selected":""}>${v.label} — ${v.sub}</option>`).join("")}</select>`;
    if (card.type === "language") return `<select class="fb-ci" data-field="language">${PREVIEW_LANGS.slice(0,15).map(l => `<option${c.language===l?" selected":""}>${l}</option>`).join("")}</select>`;
    if (card.type === "phone") return ci("Forwarding number e.g. +1 555 0100", "phone", c.phone);
    if (card.type === "whatsapp") return ci("WhatsApp number for summaries", "whatsapp", c.whatsapp);
    if (card.type === "gmail") return ci("Gmail address", "email", c.email);
    if (card.type === "gcal") return ci("Calendly or Google Calendar URL", "calendly", c.calendly);
    if (card.type === "slack") return ci("Slack webhook URL", "webhook", c.webhook);
    if (card.type === "info") return `
      <textarea class="fb-ci" style="resize:vertical;min-height:54px" data-field="text" placeholder="Business hours, services, FAQs…">${escapeHtml(c.text||'')}</textarea>
      ${ci("Website URL", "url", c.url)}
      <label class="fb-file-btn"><input type="file" accept=".pdf,.txt,.docx" data-field="file" style="display:none"><span>📎 Upload file (PDF / TXT / DOCX)</span></label>`;
    return "";
  }

  function portPos(card, side) {
    return side === "out"
      ? { x: card.x + CARD_W, y: card.y + CARD_H / 2 }
      : { x: card.x,          y: card.y + CARD_H / 2 };
  }

  function bezier(sx, sy, tx, ty) {
    const dx = Math.max(55, Math.abs(tx - sx) * 0.52);
    return `M${sx} ${sy} C${sx+dx} ${sy},${tx-dx} ${ty},${tx} ${ty}`;
  }

  function renderEdges() {
    svgEl.innerHTML = `<defs><marker id="fbarr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 .5 L6 3.5 L0 6.5z" fill="rgba(99,102,241,.75)"/></marker></defs>`;
    state.edges.forEach((e, i) => {
      const fc = state.cards.find(c => c.id === e.from);
      const tc = state.cards.find(c => c.id === e.to);
      if (!fc || !tc) return;
      const s = portPos(fc, "out"), t = portPos(tc, "in");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", bezier(s.x, s.y, t.x, t.y));
      p.setAttribute("class", "fb-edge");
      p.setAttribute("marker-end", "url(#fbarr)");
      p.dataset.idx = i;
      p.style.pointerEvents = "stroke";
      p.addEventListener("click", ev => { ev.stopPropagation(); if (confirm("Remove connection?")) { state.edges.splice(i,1); renderEdges(); } });
      svgEl.appendChild(p);
    });
    if (state.dragEdgeFrom) {
      const fc = state.cards.find(c => c.id === state.dragEdgeFrom);
      if (fc) {
        const s = portPos(fc, "out");
        const gp = document.createElementNS("http://www.w3.org/2000/svg", "path");
        gp.setAttribute("d", bezier(s.x, s.y, state.mouse.x, state.mouse.y));
        gp.setAttribute("class", "fb-edge fb-edge-ghost");
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

      // Field changes → sync preview
      el.querySelectorAll("[data-field]").forEach(inp => {
        const upd = () => { card.config = card.config || {}; card.config[inp.dataset.field] = inp.value; syncPreview(); };
        inp.addEventListener("change", upd);
        inp.addEventListener("input", upd);
      });

      // Out port → start edge drag
      el.querySelector(".fb-port-out").addEventListener("mousedown", ev => {
        ev.stopPropagation(); ev.preventDefault();
        state.dragEdgeFrom = card.id;
      });

      // In port → complete edge
      el.querySelector(".fb-port-in").addEventListener("mouseup", ev => {
        if (state.dragEdgeFrom && state.dragEdgeFrom !== card.id) {
          if (!state.edges.find(e => e.from === state.dragEdgeFrom && e.to === card.id))
            state.edges.push({ from: state.dragEdgeFrom, to: card.id });
          state.dragEdgeFrom = null;
          renderEdges();
          ev.stopPropagation();
        }
      });
    });

    cntEl.textContent = state.cards.length;
    hintEl.style.display = state.cards.length ? "none" : "flex";
    renderEdges();
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

  // Save
  $("#fb-save", shellEl).addEventListener("click", async () => {
    try {
      const nc = { ...cfg, flow_v2: { cards: state.cards, edges: state.edges } };
      state.cards.forEach(card => {
        const c = card.config || {};
        if (card.type === "voice" && c.voice) nc.voice_id = c.voice;
        if (card.type === "language" && c.language) nc.language = c.language;
        if (card.type === "phone" && c.phone) nc.forwarding_number = c.phone;
        if (card.type === "gcal" && c.calendly) nc.calendly_url = c.calendly;
        if (card.type === "whatsapp" && c.whatsapp) nc.owner_whatsapp = c.whatsapp;
        if (card.type === "info") { if (c.text) nc.business_info = c.text; if (c.url) nc.business_url = c.url; }
      });
      await api(`/agents/${id}`, { method: "PUT", body: { name: a.name, twilio_number: a.twilio_number, forwarding_number: a.forwarding_number, voice_id: a.voice_id, language: a.language, config: nc } });
      toast("Agent saved!", "success");
    } catch (e) { toast(e.message, "error"); }
  });

  // Clear
  $("#fb-clear", shellEl).addEventListener("click", () => {
    if (state.cards.length && !confirm("Clear all cards and connections?")) return;
    state.cards = []; state.edges = []; renderCanvas();
  });

  renderCanvas();

  // Preview wave
  setTimeout(() => {
    const wc = document.getElementById("fb-wave");
    if (!wc) return;
    const ctx = wc.getContext("2d"), dpr = window.devicePixelRatio || 1;
    let t = 0;
    const resize = () => { const r = wc.getBoundingClientRect(); wc.width = r.width * dpr; wc.height = r.height * dpr; };
    resize(); window.addEventListener("resize", resize);
    (function draw() {
      t += 0.022;
      const w = wc.width, hh = wc.height;
      ctx.clearRect(0, 0, w, hh);
      const bars = 60;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const ph = i * 0.3 + t;
        const amp = Math.sin(ph)*0.38 + Math.sin(ph*2.1)*0.31 + Math.sin(ph*0.6)*0.31;
        const bh = Math.max(3*dpr, Math.abs(amp) * hh * 0.74);
        const ratio = i / bars;
        ctx.fillStyle = `rgba(${Math.round(140+ratio*115)},${Math.round(100+ratio*120)},255,0.62)`;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(i*bw+bw*0.2, (hh-bh)/2, bw*0.6, bh, 2);
        else ctx.rect(i*bw+bw*0.2, (hh-bh)/2, bw*0.6, bh);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    })();
  }, 80);

  // Voice pills
  previewEl.querySelectorAll(".fb-vpill").forEach(btn =>
    btn.addEventListener("click", () => {
      previewEl.querySelectorAll(".fb-vpill").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
    })
  );

  // Play
  const playBtn = document.getElementById("fb-play");
  const playLbl = document.getElementById("fb-play-lbl");
  if (playBtn) playBtn.addEventListener("click", () => {
    if (window.speechSynthesis?.speaking) { window.speechSynthesis.cancel(); playLbl.textContent = "▶ Play sample"; return; }
    const vid = previewEl.querySelector(".fb-vpill.active")?.dataset.voice || "maya";
    const ls = document.getElementById("fb-lang-sel");
    const lc = PREVIEW_LANG_MAP[ls?.value] || "en-US";
    const vm = PREVIEW_VOICES.find(v => v.id === vid) || PREVIEW_VOICES[0];
    const GREET = { "hi-IN": "नमस्ते, यहाँ Harkly AI है। कैसे मदद करूँ?", "es-ES": "Hola, le habla Harkly AI. ¿En qué le ayudo?", "ar-SA": "مرحبا، هذا Harkly AI. كيف أساعدك؟", "zh-CN": "您好，这里是Harkly AI。我能帮您什么？" };
    const text = GREET[lc] || "Hi, this is your AI receptionist. How can I help you today?";
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lc; u.rate = vm.rate; u.pitch = vm.pitch;
    playLbl.textContent = "⏹ Stop";
    u.onend = u.onerror = () => { playLbl.textContent = "▶ Play sample"; };
    try { window.speechSynthesis.speak(u); } catch { playLbl.textContent = "▶ Play sample"; }
  });

  function syncPreview() {
    const vc = state.cards.find(c => c.type === "voice");
    const lc = state.cards.find(c => c.type === "language");
    if (vc?.config?.voice) { previewEl.querySelectorAll(".fb-vpill").forEach(x => x.classList.remove("active")); const p = previewEl.querySelector(`[data-voice="${vc.config.voice}"]`); if (p) p.classList.add("active"); }
    if (lc?.config?.language) { const s = document.getElementById("fb-lang-sel"); if (s) s.value = lc.config.language; }
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

  // Force onboarding for users who signed up but never finished it.
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

  // Onboarding removed — new users go directly to dashboard

  let view;
  if (r.path === "/login" || r.path === "/signup") { view = await routes.auth(); }
  else if (r.path === "/onboarding") { view = await routes.onboarding(); }
  else if (r.path === "/" || r.path === "") { view = await routes.agents(); }
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
  else { view = await routes.agents(); }

  root.appendChild(view);
  renderIcons();
}

render();
