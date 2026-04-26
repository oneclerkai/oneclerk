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
        <div class="flex gap-2" style="flex-wrap:wrap">
          <button class="btn btn-sm" data-edit="${a.id}"><i data-lucide="pencil" class="icon"></i>Edit</button>
          <button class="btn btn-sm" data-flow="${a.id}"><i data-lucide="git-branch" class="icon"></i>Flow</button>
          <button class="btn btn-sm" data-setup="${a.id}"><i data-lucide="phone" class="icon"></i>Connect</button>
          <button class="btn btn-sm" data-toggle="${a.id}" data-active="${a.is_active}">${a.is_active ? "Pause" : "Activate"}</button>
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
    $$("[data-flow]", grid).forEach(b => b.addEventListener("click", () => navigate(`#/agents/${b.dataset.flow}/flow`)));
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
        <div class="text-xs text-muted mb-3">OneClerk only answers calls you miss — your phone always rings first.</div>
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
        <div class="card p-5" style="display:flex;flex-direction:column;height:fit-content;max-height:80vh">
          <div class="font-semibold mb-1">Try it in chat</div>
          <div class="text-xs text-muted mb-3">Test the AI with text — same brain that answers your calls.</div>
          ${testChatWidget(id)}
        </div>
      </div>
    `));
    renderIcons(page);

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
    { k: "edit", label: "Profile", icon: "user", hash: `#/agents/${id}/edit` },
    { k: "flow", label: "Flow", icon: "git-branch", hash: `#/agents/${id}/flow` },
    { k: "connect", label: "Connect", icon: "phone", hash: `#/agents/${id}/setup` },
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
  const wrap = shell("agents", "Flow builder", "Drag steps onto the canvas. Connect them by dragging from the right dot to the next step.");
  const page = $("#page", wrap);
  page.innerHTML = skeleton(2);
  try {
    const a = (await api(`/agents/${id}`)).agent;
    if (!a) throw new Error("Agent not found");
    const cfg = a.config || {};
    let flow = (cfg.flow && (cfg.flow.nodes || []).length) ? cfg.flow : defaultFlow();
    page.innerHTML = "";
    page.appendChild(agentSubtabs(id, "flow"));

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
      $("#t-fit", shellEl).click();
      redraw();
      renderInspector();
    }, 30);
  } catch (e) { page.innerHTML = `<div class="text-danger">${escapeHtml(e.message)}</div>`; }
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
  else if (r.parts[0] === "agents" && r.parts[2] === "flow") { view = await routes.agentFlow(r.parts[1]); }
  else if (r.path === "/settings") { view = await routes.settings(); }
  else if (r.path === "/billing") { view = await routes.billing(); }
  else if (r.path === "/billing-success") { view = await routes.billingSuccess(); }
  else { view = await routes.dashboard(); }

  root.appendChild(view);
  renderIcons();
}

render();
