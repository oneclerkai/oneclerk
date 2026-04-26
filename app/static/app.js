// OneClerk dashboard — single-page app, vanilla JS, no build step.
// Uses Lucide for icons (loaded from CDN in index.html).

const API = "";
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

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && Store.token) headers["Authorization"] = `Bearer ${Store.token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { Store.token = null; Store.user = null; location.hash = "#/login"; throw new Error("Please sign in again"); }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
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

// --- Auth view ---
route("auth", async () => {
  const root = h(`
    <div class="auth-split">
      <div class="auth-side">
        <div class="brand" style="z-index:1">
          <div class="brand-mark">O</div>
          <div>
            <div style="font-weight:700;font-size:18px">OneClerk</div>
            <div style="font-size:12px;color:var(--muted)">Voice AI Receptionist</div>
          </div>
        </div>
        <div style="z-index:1">
          <h1 style="font-size:38px;line-height:1.1;margin:0 0 14px;font-weight:700">Never miss a call.<br>Never lose a patient.</h1>
          <p style="color:var(--muted);max-width:440px;font-size:14.5px;line-height:1.6">OneClerk answers your missed calls in your business's voice — books appointments, flags emergencies, and texts you a summary on WhatsApp.</p>
        </div>
        <div id="quotes" style="z-index:1"></div>
      </div>
      <div class="auth-form-wrap">
        <div class="auth-card">
          <div class="tabs mb-6" id="auth-tabs">
            <button class="tab active" data-mode="login">Log in</button>
            <button class="tab" data-mode="signup">Create account</button>
          </div>
          <form id="auth-form" class="grid" style="gap:12px">
            <div id="name-row" class="hidden">
              <label class="label">Your name</label>
              <input id="name" class="field" placeholder="Jane Cooper" autocomplete="name"/>
            </div>
            <div>
              <label class="label">Work email</label>
              <input id="email" type="email" class="field" placeholder="you@business.com" autocomplete="email" required/>
            </div>
            <div>
              <label class="label">Password</label>
              <input id="password" type="password" class="field" placeholder="At least 6 characters" minlength="6" autocomplete="current-password" required/>
            </div>
            <button class="btn btn-primary btn-lg mt-2" id="auth-submit">
              <i data-lucide="arrow-right" class="icon"></i><span>Continue</span>
            </button>
            <div id="auth-err" class="text-xs text-danger hidden"></div>
          </form>
          <p class="text-xs text-muted mt-6 text-center">By continuing you agree to OneClerk's terms of service.</p>
        </div>
      </div>
    </div>`);

  const quotes = [
    { q: "We were missing 30% of our calls. Now I get a WhatsApp summary for every single one.", a: "— Dr. Sarah, City Dental" },
    { q: "Setup took 12 minutes. Booked 3 appointments in the first day.", a: "— Priya, Lotus Spa" },
    { q: "Sounds exactly like a real receptionist. Patients have no idea.", a: "— Raj, Skyline Clinic" },
  ];
  let qi = 0;
  const qroot = $("#quotes", root);
  const renderQ = () => {
    const q = quotes[qi];
    qroot.innerHTML = `<div class="card p-5" style="background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.08);max-width:440px"><div style="font-size:14px;line-height:1.5">"${q.q}"</div><div class="text-xs text-muted mt-3">${q.a}</div></div>`;
  };
  renderQ();
  setInterval(() => { qi = (qi + 1) % quotes.length; renderQ(); }, 4500);

  let mode = "login";
  $$("#auth-tabs .tab", root).forEach(b => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    $$("#auth-tabs .tab", root).forEach(x => x.classList.toggle("active", x === b));
    $("#name-row", root).classList.toggle("hidden", mode !== "signup");
    $("#name", root).required = mode === "signup";
    $("#auth-submit span", root).textContent = mode === "signup" ? "Create account" : "Continue";
  }));

  $("#auth-form", root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#auth-err", root); err.classList.add("hidden");
    const body = mode === "signup"
      ? { name: $("#name", root).value, email: $("#email", root).value, password: $("#password", root).value }
      : { email: $("#email", root).value, password: $("#password", root).value };
    try {
      const r = await api(`/auth/${mode}`, { method: "POST", body, auth: false });
      Store.token = r.access_token;
      const me = await api("/auth/me");
      Store.user = me;
      toast(`Welcome${me.name ? ", " + me.name.split(" ")[0] : ""}!`, "success");
      navigate("#/");
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove("hidden");
    }
  });
  return root;
});

// --- Layout shell ---
function shell(activeKey, title, subtitle, action) {
  const items = [
    { k: "dashboard", label: "Dashboard", icon: "layout-dashboard", hash: "#/" },
    { k: "calls", label: "Calls", icon: "phone", hash: "#/calls" },
    { k: "agents", label: "Agents", icon: "bot", hash: "#/agents" },
    { k: "settings", label: "Settings", icon: "settings", hash: "#/settings" },
    { k: "billing", label: "Billing", icon: "credit-card", hash: "#/billing" },
  ];
  const u = Store.user || { name: "—", email: "" };
  const initials = (u.name || u.email || "?").split(/\s+/).map(s => s[0]).slice(0, 2).join("").toUpperCase();
  const wrap = h(`
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">O</div>
          <div><div style="font-weight:700">OneClerk</div><div style="font-size:11px;color:var(--muted)">Voice AI</div></div>
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
        ${items.slice(0,4).map(i => `<button data-hash="${i.hash}" class="${activeKey===i.k?'active':''}"><div><i data-lucide="${i.icon}" class="icon"></i></div><div>${i.label}</div></button>`).join("")}
      </div>
    </div>`);
  $$(".nav-item[data-hash]", wrap).forEach(b => b.addEventListener("click", () => navigate(b.dataset.hash)));
  $$(".mobile-tabs button", wrap).forEach(b => b.addEventListener("click", () => navigate(b.dataset.hash)));
  $("#logout", wrap).addEventListener("click", () => { Store.token = null; Store.user = null; navigate("#/login"); });
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
    </div>`;
  renderIcons(page);
  $("#see-all", page).addEventListener("click", () => navigate("#/calls"));
  $("#new-agent2", page).addEventListener("click", () => navigate("#/agents/new"));

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

route("calls", async () => {
  const wrap = shell("calls", "Calls", "Every conversation, fully transcribed.");
  const page = $("#page", wrap);
  page.innerHTML = `
    <div class="card p-5">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2" style="flex:1;max-width:340px">
          <i data-lucide="search" class="icon" style="color:var(--muted)"></i>
          <input id="q" class="field" placeholder="Search by number…" style="max-width:280px"/>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn btn-sm" data-f="all">All</button>
          <button class="btn btn-sm" data-f="urgent">Urgent</button>
          <button class="btn btn-sm" data-f="booking">Booked</button>
        </div>
      </div>
      <div id="list">${skeleton(6)}</div>
    </div>`;
  renderIcons(page);
  let all = [];
  let filter = "all", q = "";
  const apply = () => {
    let v = all;
    if (filter === "urgent") v = v.filter(c => c.is_urgent);
    if (filter === "booking") v = v.filter(c => c.booking_made);
    if (q) v = v.filter(c => (c.caller_number || "").toLowerCase().includes(q));
    renderRecentCalls($("#list", page), v);
  };
  $$("[data-f]", page).forEach(b => b.addEventListener("click", () => { filter = b.dataset.f; apply(); }));
  $("#q", page).addEventListener("input", e => { q = e.target.value.toLowerCase(); apply(); });
  try { all = (await api("/calls/recent")).calls || []; apply(); }
  catch (e) { $("#list", page).innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
  return wrap;
});

route("agents", async () => {
  const action = h(`<button class="btn btn-primary"><i data-lucide="plus" class="icon"></i>New agent</button>`);
  action.addEventListener("click", () => navigate("#/agents/new"));
  const wrap = shell("agents", "Agents", "Configure once. Your AI receptionist follows it on every call.", action);
  const page = $("#page", wrap);
  page.innerHTML = `<div id="grid" class="grid grid-cols-2">${skeleton(4)}</div>`;
  try {
    const r = await api("/agents/list");
    const grid = $("#grid", page);
    if (!(r.agents || []).length) {
      grid.innerHTML = `<div class="card p-6 text-center" style="grid-column:1/-1"><i data-lucide="bot" class="icon" style="width:36px;height:36px;color:var(--muted-2)"></i><div class="text-lg font-semibold mt-3">No agents yet</div><div class="text-sm text-muted mb-4">Create your first agent and connect a phone number.</div><button class="btn btn-primary" id="c1">Create agent</button></div>`;
      renderIcons(grid);
      $("#c1", grid).addEventListener("click", () => navigate("#/agents/new"));
      return;
    }
    grid.innerHTML = r.agents.map(a => `
      <div class="card p-5 card-hover">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <div class="dot ${a.is_active ? 'dot-success' : 'dot-muted'}"></div>
            <div class="font-semibold">${escapeHtml(a.name)}</div>
          </div>
          <span class="badge ${a.is_active ? 'badge-success' : 'badge-muted'}">${a.is_active ? "Live" : "Paused"}</span>
        </div>
        <div class="text-xs text-muted mb-2">${escapeHtml(a.config?.business_name || "—")} · ${escapeHtml(a.config?.business_type || "")}</div>
        <div class="text-xs text-muted mb-4">📞 ${escapeHtml(a.twilio_number || "no Twilio number")}</div>
        <div class="text-xs text-muted mb-4">Language: ${escapeHtml(a.config?.language || "English")} · ${a.calls_this_month || 0} calls this month</div>
        <div class="flex gap-2">
          <button class="btn btn-sm" data-edit="${a.id}"><i data-lucide="pencil" class="icon"></i>Edit</button>
          <button class="btn btn-sm" data-toggle="${a.id}" data-active="${a.is_active}">${a.is_active ? "Pause" : "Activate"}</button>
          <button class="btn btn-sm" data-setup="${a.id}"><i data-lucide="phone" class="icon"></i>Setup</button>
          <button class="btn btn-sm btn-danger" data-del="${a.id}"><i data-lucide="trash-2" class="icon"></i></button>
        </div>
      </div>`).join("") + `
      <button class="card p-6 text-center card-hover" id="add-card" style="border-style:dashed;background:transparent;color:var(--muted)">
        <i data-lucide="plus" class="icon" style="width:24px;height:24px"></i>
        <div class="mt-2">Add agent</div>
      </button>`;
    renderIcons(grid);
    $("#add-card", grid).addEventListener("click", () => navigate("#/agents/new"));
    $$("[data-edit]", grid).forEach(b => b.addEventListener("click", () => navigate(`#/agents/${b.dataset.edit}/edit`)));
    $$("[data-setup]", grid).forEach(b => b.addEventListener("click", () => navigate(`#/agents/${b.dataset.setup}/setup`)));
    $$("[data-toggle]", grid).forEach(b => b.addEventListener("click", async () => {
      const active = b.dataset.active === "true";
      try {
        await api(`/agents/${b.dataset.toggle}/${active ? "deactivate" : "activate"}`, { method: "POST" });
        toast(active ? "Agent paused" : "Agent is live", "success");
        navigate("#/agents");
      } catch (e) { toast(e.message, "error"); }
    }));
    $$("[data-del]", grid).forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Delete this agent? This cannot be undone.")) return;
      try {
        await api(`/agents/${b.dataset.del}`, { method: "DELETE" });
        toast("Agent deleted", "success");
        render();
      } catch (e) { toast(e.message, "error"); }
    }));
  } catch (e) { toast(e.message, "error"); }
  return wrap;
});

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

route("agentNew", async () => {
  const wrap = shell("agents", "Create agent", "Tell us about the business — your AI follows these rules on every call.");
  const page = $("#page", wrap);
  const form = agentForm();
  page.appendChild(form);
  $("#cancel", form).addEventListener("click", () => navigate("#/agents"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/agents/create", { method: "POST", body: readAgentForm(form) });
      toast("Agent created", "success");
      navigate("#/agents");
    } catch (ex) { $("#err", form).textContent = ex.message; $("#err", form).classList.remove("hidden"); }
  });
  return wrap;
});

route("agentEdit", async (id) => {
  const wrap = shell("agents", "Edit agent", "");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(4);
  try {
    const list = (await api("/agents/list")).agents || [];
    const a = list.find(x => x.id === id);
    if (!a) throw new Error("Agent not found");
    page.innerHTML = "";
    const form = agentForm(a);
    page.appendChild(form);
    $("#cancel", form).addEventListener("click", () => navigate("#/agents"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api(`/agents/${id}`, { method: "PUT", body: readAgentForm(form) });
        toast("Saved", "success");
        navigate("#/agents");
      } catch (ex) { $("#err", form).textContent = ex.message; $("#err", form).classList.remove("hidden"); }
    });
  } catch (e) { page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
  return wrap;
});

route("agentSetup", async (id) => {
  const wrap = shell("agents", "Connect your phone", "OneClerk only answers calls you miss. Your phone always rings first.");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(2);
  try {
    const list = (await api("/agents/list")).agents || [];
    const a = list.find(x => x.id === id);
    if (!a) throw new Error("Agent not found");
    if (!a.twilio_number) {
      page.innerHTML = `<div class="card p-6 text-center"><div class="text-lg font-semibold mb-2">No Twilio number set</div><div class="text-sm text-muted mb-4">Edit your agent and add a Twilio number first.</div><button class="btn btn-primary" id="ed">Edit agent</button></div>`;
      $("#ed", page).addEventListener("click", () => navigate(`#/agents/${id}/edit`));
      renderIcons(page);
      return;
    }
    const carriers = [
      { v: "iphone", l: "iPhone" },
      { v: "android", l: "Android" },
      { v: "airtel", l: "Airtel (India)" },
      { v: "jio", l: "Jio (India)" },
      { v: "bsnl", l: "BSNL (India)" },
      { v: "vi", l: "Vi (India)" },
      { v: "generic", l: "Other carrier" },
    ];
    const fetchInst = async (carrier) => api(`/agents/${id}/setup-instructions?carrier=${carrier}`);
    const inst = await fetchInst("iphone");
    page.innerHTML = `
      <div class="card p-5 mb-4">
        <div class="font-semibold mb-2">${escapeHtml(inst.headline)}</div>
        <div class="text-sm text-muted">${escapeHtml(inst.test_instruction)}</div>
      </div>
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap:16px">
        <div class="card p-5">
          <div class="stat-label mb-2">Activate code</div>
          <div class="flex items-center gap-2">
            <div class="text-xl font-semibold" id="code">${escapeHtml(inst.activate_code)}</div>
            <button class="btn btn-sm" id="copy"><i data-lucide="copy" class="icon"></i>Copy</button>
          </div>
          <div class="stat-label mt-4 mb-2">Deactivate</div>
          <div class="text-md font-medium">${escapeHtml(inst.deactivate_code)}</div>
        </div>
        <div class="card p-5">
          <div class="flex items-center justify-between mb-2">
            <div class="stat-label">Your carrier</div>
            <select id="carrier" class="field" style="max-width:200px">
              ${carriers.map(c => `<option value="${c.v}">${c.l}</option>`).join("")}
            </select>
          </div>
          <div id="note" class="text-sm mt-3">${escapeHtml(inst.carrier_notes.iphone)}</div>
        </div>
      </div>
      <div class="card p-5 mt-4">
        <div class="font-semibold mb-2">Your OneClerk number</div>
        <div class="text-xl font-bold">${escapeHtml(inst.twilio_number)}</div>
        <div class="text-xs text-muted mt-2">In the Twilio console, set Voice → A Call Comes In → Webhook → POST <code>${escapeHtml(window.location.origin + "/calls/incoming")}</code></div>
      </div>
    `;
    renderIcons(page);
    $("#copy", page).addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(inst.activate_code); toast("Copied", "success"); } catch { toast("Copy failed", "error"); }
    });
    $("#carrier", page).addEventListener("change", async (e) => {
      const r = await fetchInst(e.target.value);
      $("#code", page).textContent = r.activate_code;
      $("#note", page).textContent = r.carrier_notes[e.target.value] || r.carrier_notes.generic;
    });
  } catch (e) { page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
  return wrap;
});

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
  $("#page", wrap).innerHTML = `<div class="card p-6 text-center"><i data-lucide="check-circle-2" class="icon" style="width:48px;height:48px;color:var(--success)"></i><div class="text-lg font-semibold mt-3">You're all set</div><div class="text-sm text-muted mt-2 mb-4">Your OneClerk subscription is now active.</div><button class="btn btn-primary" id="go">Go to dashboard</button></div>`;
  renderIcons($("#page", wrap));
  $("#go", $("#page", wrap)).addEventListener("click", () => navigate("#/"));
  return wrap;
});

// --- Render dispatcher ---
async function render() {
  const root = $("#root");
  root.innerHTML = "";

  if (!Store.token) { root.appendChild(await routes.auth()); renderIcons(); return; }

  const r = parseRoute();
  let view;
  if (r.path === "/login" || r.path === "/signup") { view = await routes.auth(); }
  else if (r.path === "/" || r.path === "") { view = await routes.dashboard(); }
  else if (r.path === "/calls") { view = await routes.calls(); }
  else if (r.path === "/agents") { view = await routes.agents(); }
  else if (r.path === "/agents/new") { view = await routes.agentNew(); }
  else if (r.parts[0] === "agents" && r.parts[2] === "edit") { view = await routes.agentEdit(r.parts[1]); }
  else if (r.parts[0] === "agents" && r.parts[2] === "setup") { view = await routes.agentSetup(r.parts[1]); }
  else if (r.path === "/settings") { view = await routes.settings(); }
  else if (r.path === "/billing") { view = await routes.billing(); }
  else if (r.path === "/billing-success") { view = await routes.billingSuccess(); }
  else { view = await routes.dashboard(); }

  root.appendChild(view);
  renderIcons();
}

render();
