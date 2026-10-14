/* Bee Store : interface du store, en écrans séparés façon application. Le catalogue vient de l'API (bot Telegram + Supabase). */
const APP_NAME = "Bee Store";
const API = "https://cetbspgxsqbaousqrara.supabase.co/functions/v1/bee-store-api";

/* Catalogue de démonstration, affiché seulement si l'API est injoignable et qu'aucune copie locale n'existe. */
const DEMO = [
  ["Pixel Runner", "Jeux", "2.4.1", 48, 128400, "2026-09-30", "Course à pied en pixel art : esquivez les obstacles, ramassez des pièces, battez votre record."],
  ["Chrono Notes", "Productivité", "1.9.0", 12, 96200, "2026-10-03", "Notes rapides avec rappels horodatés, étiquettes et recherche instantanée."],
  ["Fusion Photo", "Photo", "1.2.2", 22, 41300, "2026-09-25", "Assemblez deux images en une seule et exportez en haute qualité."],
  ["Radio Sable", "Musique", "5.0.3", 27, 55800, "2026-07-14", "Webradios par pays et par genre, minuteur de sommeil, lecture en arrière-plan."],
  ["Apprendre GDScript", "Éducation", "1.0.4", 6, 12700, "2026-10-01", "Quinze leçons illustrées pour apprendre le langage de Godot."],
  ["Arène Néon", "Jeux", "0.9.7", 112, 22600, "2026-10-05", "Combat 3D en arène avec combos et commandes tactiles."]
].map((d, i) => ({ id: "demo" + i, name: d[0], dev: "", cat: d[1], ver: d[2], size: d[3] * 1048576, dl: d[4], date: d[5], created: d[5], desc: d[6], url: "", direct: false, pkg: "exemple." + i, sha: "", icon: "", shots: [] }));

const TABS = ["home", "catalog", "favs", "settings"];
const TITLES = { home: APP_NAME, catalog: "Catalogue", favs: "Favoris", settings: "Réglages" };
const st = { tab: "home", cat: "Tous", q: "", sort: "pop", favs: new Set(), theme: "auto", apps: [], anns: [], mode: "loading", steps: 0, scroll: {}, detailKey: "" };
/* Dans l'application Android (WebView), l'application native télécharge et lance l'installation. */
const NATIVE = (() => { try { return !!(window.BeeNative && window.BeeNative.isNative()); } catch (e) { return false; } })();
const fileName = (a) => (a.name + "-" + (a.ver || "apk")).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "") + ".apk";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (n) => (n >= 1000 ? (n / 1000).toLocaleString("fr", { maximumFractionDigits: 1 }) + " k" : String(n));
const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const sizeTxt = (b) => (b >= 1048576 ? (b / 1048576).toLocaleString("fr", { maximumFractionDigits: 1 }) + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko");
const dateTxt = (d) => { const x = new Date(d); return isNaN(x) ? "n.c." : x.toLocaleDateString("fr", { day: "numeric", month: "short", year: "numeric" }); };
const HUES = [262, 215, 175, 145, 330, 8, 195, 285];
const hue = (s) => HUES[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
const isNew = (a) => Date.now() - new Date(a.created).getTime() < 14 * 864e5;
const ico = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

try { JSON.parse(lsGet("bee:favs") || "[]").forEach((i) => st.favs.add(i)); } catch (e) {}
st.theme = lsGet("bee:theme") || "auto";
function applyTheme() {
  const r = document.documentElement;
  if (st.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", st.theme);
  $$("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === st.theme)));
}

/* ---------- données ---------- */
const norm = (a) => ({
  id: a.id, name: a.name, dev: a.developer || "", cat: a.category || "Outils", ver: a.version_name || "", size: a.size_bytes || 0,
  dl: a.downloads || 0, date: a.updated_at || a.created_at || "", created: a.created_at || "", desc: a.description || "", url: a.download_url, direct: !!a.direct,
  tg: a.telegram_url, pkg: a.package, sha: a.sha256 || "", icon: a.icon_url || "", shots: Array.isArray(a.screenshots) ? a.screenshots : []
});
const normAnn = (a) => ({ id: a.id, title: a.title || "", body: a.body || "", link: /^https:\/\//i.test(a.link || "") ? a.link : "", app: a.app_id || "", img: a.image_url || "" });
/* icône : image si l'application en a une, sinon initiales (l'image masquée si elle ne charge pas) */
const tileInner = (a) => a.icon
  ? `<img src="${esc(a.icon)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"><span class="ini">${esc(initials(a.name))}</span>`
  : esc(initials(a.name));
async function load() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(API + "/apps", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    st.apps = (j.apps || []).map(norm);
    st.anns = (j.announcements || []).map(normAnn);
    st.mode = "live";
    lsSet("bee:catalog", JSON.stringify(j.apps || []));
    lsSet("bee:anns", JSON.stringify(j.announcements || []));
  } catch (e) {
    let cached = null;
    try { cached = JSON.parse(lsGet("bee:catalog") || "null"); } catch (_) {}
    if (cached && cached.length) {
      st.apps = cached.map(norm); st.mode = "cache";
      try { st.anns = (JSON.parse(lsGet("bee:anns") || "[]") || []).map(normAnn); } catch (_) { st.anns = []; }
    } else { st.apps = DEMO; st.mode = "demo"; st.anns = []; }
  }
}

/* ---------- compte : connexion, favoris synchronisés, espace développeur ---------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const acct = { sess: null, me: null };
try { acct.sess = JSON.parse(lsGet("bee:sess") || "null"); if (acct.sess && !acct.sess.refresh_token) acct.sess = null; } catch (e) {}
if (acct.sess) { try { acct.me = JSON.parse(lsGet("bee:me") || "null"); } catch (e) {} }
st.page = ""; st.authMode = "login"; st.linkInfo = null; st.meState = "idle";
const ERR = {
  invalid_email: "Cette adresse e-mail n'est pas valide.", weak_password: "Le mot de passe doit avoir au moins 8 caractères.", invalid_name: "Le nom doit avoir au moins 2 caractères.",
  email_taken: "Un compte existe déjà avec cette adresse. Connecte-toi.", signup_failed: "Création impossible pour le moment. Réessaie.", bad_credentials: "E-mail ou mot de passe incorrect.",
  session_expired: "Session expirée. Reconnecte-toi.", unauthorized: "Reconnecte-toi pour continuer.", already_developer: "Ce compte est déjà un compte développeur.",
  invalid_method: "Choisis un moyen de paiement.", invalid_reference: "Saisis la référence de la transaction (4 caractères minimum).", already_pending: "Une demande est déjà en attente de validation.",
  not_developer: "Réservé aux comptes développeur.", network: "Pas de connexion au serveur. Vérifie ta connexion et réessaie.", db_error: "Erreur du serveur. Réessaie dans un instant."
};
const errTxt = (c) => ERR[c] || "Une erreur est survenue. Réessaie.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const money = (n, c) => Number(n || 0).toLocaleString("fr") + " " + (c || "FCFA");
const saveFavs = () => lsSet("bee:favs", JSON.stringify([...st.favs]));
function refreshFavUi() { $$("[data-fav]").forEach((b) => b.setAttribute("aria-pressed", String(st.favs.has(b.dataset.fav)))); renderFavs(); }

function saveSess(s) { acct.sess = s; if (s) lsSet("bee:sess", JSON.stringify(s)); else lsDel("bee:sess"); }
async function raw(path, method, body, token) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(API + path, { method, signal: ctl.signal, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let d = {}; try { d = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data: d };
  } catch (e) { return { ok: false, status: 0, data: { error: "network" } }; } finally { clearTimeout(t); }
}
let refreshing = null;
function refreshSess() {
  if (!acct.sess) return Promise.resolve(false);
  if (refreshing) return refreshing;
  refreshing = raw("/auth/refresh", "POST", { refresh_token: acct.sess.refresh_token }).then((r) => {
    if (r.ok && r.data.session) { saveSess(r.data.session); return true; }
    if (r.status === 401) logout(true);
    return false;
  }).finally(() => { refreshing = null; });
  return refreshing;
}
async function api(path, method = "GET", body) {
  const none = { ok: false, status: 401, data: { error: "unauthorized" } };
  if (!acct.sess) return none;
  if (acct.sess.expires_at && acct.sess.expires_at * 1000 - Date.now() < 60000) await refreshSess();
  if (!acct.sess) return none;
  let r = await raw(path, method, body, acct.sess.access_token);
  if (r.status === 401 && acct.sess && (await refreshSess())) r = await raw(path, method, body, acct.sess.access_token);
  return r;
}
function logout(expired) {
  saveSess(null); acct.me = null; st.linkInfo = null;
  lsDel("bee:me"); lsDel("bee:favq");
  st.favs = new Set(); saveFavs(); refreshFavUi(); renderSettings();
  if (st.page) goTab("settings");
  toast(expired ? "Session expirée. Reconnecte-toi." : "Déconnecté");
}

/* favoris : file d'attente envoyée au serveur dès que possible */
const fq = () => { try { const q = JSON.parse(lsGet("bee:favq") || "{}"); return { add: q.add || [], remove: q.remove || [] }; } catch (e) { return { add: [], remove: [] }; } };
function queueFav(id, on) {
  if (!acct.sess) return;
  const q = fq();
  q.add = q.add.filter((x) => x !== id); q.remove = q.remove.filter((x) => x !== id);
  (on ? q.add : q.remove).push(id);
  lsSet("bee:favq", JSON.stringify(q));
  flushFavs();
}
async function flushFavs() {
  if (!acct.sess) return;
  const q = fq();
  if (!q.add.length && !q.remove.length) return;
  const r = await api("/favs", "POST", q);
  if (!r.ok) return;
  const cur = fq();
  lsSet("bee:favq", JSON.stringify({ add: cur.add.filter((x) => !q.add.includes(x)), remove: cur.remove.filter((x) => !q.remove.includes(x)) }));
}
async function loadMe() {
  st.meState = "loading";
  const r = await api("/me");
  if (r.ok) { acct.me = r.data; lsSet("bee:me", JSON.stringify(r.data)); st.meState = "ok"; }
  else st.meState = r.status === 401 ? "out" : "error";
  return r;
}
async function syncAccount(merge) {
  if (!acct.sess) return;
  await flushFavs();
  const r = await loadMe();
  if (r.ok) {
    let set = new Set(r.data.favs);
    if (merge) {
      const add = [...st.favs].filter((i) => !set.has(i) && UUID.test(i));
      if (add.length) { const x = await api("/favs", "POST", { add }); if (x.ok) set = new Set(x.data.favs); }
      st.favs.forEach((i) => set.add(i));
    }
    const q = fq(); q.add.forEach((i) => set.add(i)); q.remove.forEach((i) => set.delete(i));
    st.favs = set; saveFavs(); refreshFavUi();
  }
  renderSettings();
  if (st.page === "dev") renderPage();
}

/* ---------- Réglages : bloc compte ---------- */
function renderAccount() {
  const el = $("#acct"); if (!el) return;
  if (!acct.sess) {
    el.innerHTML = `<div class="row"><div class="row-text"><b>Compte</b><span class="note">Retrouve tes favoris sur tous tes appareils, ou deviens développeur pour publier tes applications.</span></div></div>
      <div class="row duo"><button class="btn sm" data-page="login" data-mode="login">Se connecter</button><button class="btn soft sm" data-page="login" data-mode="signup">Créer un compte</button></div>`;
    return;
  }
  const me = acct.me, name = me?.user?.name || "Mon compte", dev = me?.role === "developer";
  el.innerHTML = `<div class="row"><div class="who"><div class="tile sm" style="--h:${hue(name)}">${esc(initials(name))}</div>
      <div class="row-text"><b>${esc(name)}</b><span class="note">${esc(me?.user?.email || "Connecté")}</span></div></div>
      ${me ? `<span class="pill ${dev ? "ok" : ""}">${dev ? "Développeur" : "Membre"}</span>` : ""}</div>
    <button class="row link-row" data-page="dev"><div class="row-text"><b>${dev ? "Espace développeur" : "Devenir développeur"}</b><span class="note">${dev ? "Tes applications, Telegram et envois" : "Paiement unique de " + money(me?.price || 5000, me?.currency) + " pour publier"}</span></div>${ico("back").replace('class="ic"', 'class="ic fwd"')}</button>
    <div class="row"><div class="row-text"><b>Déconnexion</b><span class="note">Tes favoris restent sur ton compte.</span></div><button class="btn soft sm" data-logout>Se déconnecter</button></div>`;
}

/* ---------- pages : connexion et espace développeur ---------- */
const pageTop = (t) => `<div class="p-top"><button class="iconbtn" data-back aria-label="Retour">${ico("back")}</button><h1>${esc(t)}</h1></div>`;
const PILL = { pending: ["wait", "En attente"], approved: ["ok", "Approuvé"], rejected: ["no", "Refusée"] };

function loginHtml() {
  const su = st.authMode === "signup";
  return `${pageTop(su ? "Créer un compte" : "Connexion")}
  <div class="p-body">
    <p class="lead">${su ? "Un compte garde tes favoris sur tous tes appareils et te permet de devenir développeur." : "Connecte-toi pour retrouver tes favoris."}</p>
    <div class="seg two"><button data-auth-tab="login" aria-pressed="${!su}">Connexion</button><button data-auth-tab="signup" aria-pressed="${su}">Créer un compte</button></div>
    <form class="form" data-form="auth" data-mode="${su ? "signup" : "login"}" novalidate>
      ${su ? `<label class="field"><span>Nom affiché</span><input name="name" autocomplete="name" maxlength="40" required></label>` : ""}
      <label class="field"><span>Adresse e-mail</span><input name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>
      <label class="field"><span>Mot de passe</span><span class="pw"><input name="password" type="password" autocomplete="${su ? "new-password" : "current-password"}" minlength="8" required><button type="button" data-pw>Afficher</button></span></label>
      <p class="err" id="formErr" role="alert" hidden></p>
      <button class="btn wide" type="submit">${su ? "Créer mon compte" : "Se connecter"}</button>
    </form>
    ${su ? `<p class="note">8 caractères minimum. Garde bien ton mot de passe : la récupération par e-mail n'existe pas encore.</p>` : ""}
  </div>`;
}

function payForm(me) {
  const ms = me.methods || [], rej = me.payment && me.payment.status === "rejected";
  return `${rej ? `<div class="alert no"><span><b>Paiement refusé.</b> La transaction n'a pas été retrouvée. Vérifie la référence et envoie une nouvelle demande.</span></div>` : ""}
    <div class="price"><b>${esc(money(me.price, me.currency))}</b><span>Paiement unique, sans abonnement. Il te permet de publier tes applications dans Bee Store.</span></div>
    <ol class="steps"><li>Envoie ${esc(money(me.price, me.currency))} à l'un des numéros ci-dessous.</li><li>Note la référence de la transaction, reçue par SMS.</li><li>Saisis-la ici. L'équipe valide ensuite dans Telegram.</li></ol>
    ${ms.length ? `<form class="form" data-form="pay" novalidate>
      <div class="pays" role="radiogroup" aria-label="Moyen de paiement">${ms.map((m) => `<label class="pay"><input type="radio" name="method" value="${esc(m.id)}"><span class="pm"><b>${esc(m.label)}</b><code>${esc(m.number)}</code></span><button type="button" class="copy" data-copy-num="${esc(m.number)}">${ico("copy")}Copier</button></label>`).join("")}</div>
      <label class="field"><span>Référence de la transaction</span><input name="reference" id="payRef" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
      <p class="err" id="formErr" role="alert" hidden></p>
      <button class="btn wide" type="submit">Envoyer ma demande</button></form>`
    : `<div class="alert"><span>Les moyens de paiement ne sont pas encore disponibles. Reviens un peu plus tard.</span></div>`}`;
}

function devHtml() {
  const me = acct.me;
  if (!me) {
    return `${pageTop("Espace développeur")}<div class="p-body">${st.meState === "error" || st.meState === "out"
      ? `<div class="empty"><b>Chargement impossible</b><span>${st.meState === "out" ? "Reconnecte-toi pour continuer." : "Vérifie ta connexion."}</span><button class="btn soft" data-refresh-me>Réessayer</button></div>`
      : `<div class="skeleton"></div><div class="skeleton"></div>`}</div>`;
  }
  const dev = me.role === "developer", pay = me.payment;
  let body;
  if (!dev) {
    body = pay && pay.status === "pending"
      ? `<div class="alert wait"><span><b>Demande en attente de validation.</b> ${esc(me.methods?.find((m) => m.id === pay.method)?.label || pay.method)}, référence ${esc(pay.reference)}. L'équipe vérifie ta transaction dans Telegram. Reviens ici ensuite.</span></div>
         <button class="btn soft wide" data-refresh-me>Vérifier la validation</button>`
      : payForm(me);
  } else {
    const li = st.linkInfo, botUrl = me.bot ? "https://t.me/" + me.bot : "";
    const tg = me.linked
      ? `<div class="alert ok">${ico("check")}<span><b>Telegram lié.</b> Envoie ton fichier .apk au bot${me.bot ? " @" + esc(me.bot) : ""}.</span></div>${botUrl ? `<a class="btn wide" data-ext href="${esc(botUrl)}" target="_blank" rel="noopener">Ouvrir le bot Telegram</a>` : ""}`
      : `<p class="note">Pour envoyer tes applications, lie ton compte à Telegram. Le lien se fait en un geste.</p>
         ${li ? `<div class="code"><span>Code (valable 15 minutes)</span><b>${esc(li.code)}</b></div>
           ${li.link ? `<a class="btn wide" data-ext href="${esc(li.link)}" target="_blank" rel="noopener">Ouvrir Telegram et lier</a>` : ""}
           <p class="note">Si Telegram ne s'ouvre pas, écris <code>/lier ${esc(li.code)}</code> au bot${li.bot ? " @" + esc(li.bot) : ""}.</p>
           <button class="btn soft wide" data-refresh-me>J'ai lié, vérifier</button>`
         : `<button class="btn wide" data-link-tg>Lier Telegram</button>`}`;
    const subs = me.submissions || [], apps = me.apps || [];
    body = `<div class="alert ok">${ico("check")}<span><b>Compte développeur actif.</b> Paiement unique effectué.</span></div>
      <div><h2>Telegram</h2><div class="stack">${tg}</div></div>
      <div><h2>Publier une application</h2><ol class="steps"><li>Envoie le fichier .apk au bot.</li><li>Le bot lit le nom, la version et l'icône.</li><li>L'équipe vérifie ton envoi, puis l'application apparaît dans le catalogue.</li></ol></div>
      <div><h2>Mes envois</h2>${subs.length ? `<div class="list">${subs.map((s) => { const p = PILL[s.status] || ["", s.status]; return `<div class="li"><div class="row-text"><b>${esc(s.name || s.package)}</b><span class="note">${s.version_name ? "v" + esc(s.version_name) + " · " : ""}${esc(dateTxt(s.created_at))}</span></div><span class="pill ${p[0]}">${p[1]}</span></div>`; }).join("")}</div>` : `<p class="note">Aucun envoi pour le moment.</p>`}</div>
      <div><h2>Mes applications</h2>${apps.length ? `<div class="list">${apps.map((a) => `<div class="li"><div class="row-text"><b>${esc(a.name)}</b><span class="note">${a.version_name ? "v" + esc(a.version_name) + " · " : ""}${nf(a.downloads || 0)} téléchargement${a.downloads > 1 ? "s" : ""}</span></div><span class="pill ${a.published ? "ok" : "wait"}">${a.published ? "En ligne" : "Masquée"}</span></div>`).join("")}</div>` : `<p class="note">Tes applications publiées apparaîtront ici.</p>`}</div>`;
  }
  return `${pageTop("Espace développeur")}<div class="p-body">${body}</div>`;
}

function renderPage() {
  const el = $("#page"); if (!el || !st.page) return;
  // on garde ce qui est en cours de saisie quand la page se redessine
  const keep = { ref: el.querySelector("#payRef")?.value, method: el.querySelector("input[name=method]:checked")?.value };
  el.innerHTML = st.page === "login" ? loginHtml() : devHtml();
  if (keep.ref) { const r = el.querySelector("#payRef"); if (r) r.value = keep.ref; }
  if (keep.method) { const m = el.querySelector(`input[name=method][value="${CSS.escape(keep.method)}"]`); if (m) m.checked = true; }
}
function openPage(name) {
  const d = $("#page");
  if (!d.classList.contains("open")) st.scroll[st.tab] = window.scrollY;
  if (st.page !== name) { st.page = name; d.scrollTop = 0; renderPage(); }
  d.classList.add("open"); d.setAttribute("aria-hidden", "false");
  document.body.classList.add("lock"); setInert(true);
  if (name === "dev") loadMe().then(() => { if (st.page === "dev") { renderPage(); renderSettings(); } });
  const f = d.querySelector("input, [data-back]"); if (f && name === "login") f.focus({ preventScroll: true });
}
function closePage() {
  const d = $("#page");
  if (!d.classList.contains("open")) return;
  d.classList.remove("open"); d.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lock"); setInert(false);
  window.scrollTo(0, st.scroll[st.tab] || 0);
  clearTimeout(closePage.t);
  closePage.t = setTimeout(() => { if (!d.classList.contains("open")) { d.innerHTML = ""; st.page = ""; } }, 400);
}
function goPage(name, mode) {
  if (name === "login" && mode) st.authMode = mode;
  st.steps++; location.hash = "#/" + name;
}
function formErr(msg) { const e = $("#formErr"); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }
function busy(btn, on, txt) { if (!btn) return; if (on) { btn.dataset.t = btn.textContent; btn.textContent = txt; btn.disabled = true; } else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; } }

async function submitAuth(f) {
  const su = f.dataset.mode === "signup", fd = new FormData(f);
  const email = String(fd.get("email") || "").trim(), password = String(fd.get("password") || ""), name = String(fd.get("name") || "").trim();
  if (su && name.length < 2) return formErr(ERR.invalid_name);
  if (!EMAIL_RE.test(email)) return formErr(ERR.invalid_email);
  if (su && password.length < 8) return formErr(ERR.weak_password);
  if (!password) return formErr(ERR.bad_credentials);
  formErr(""); const btn = f.querySelector("[type=submit]"); busy(btn, true, su ? "Création…" : "Connexion…");
  const r = await raw("/auth/" + f.dataset.mode, "POST", su ? { email, password, name } : { email, password });
  if (!r.ok || !r.data.session) { busy(btn, false); return formErr(errTxt(r.data.error)); }
  saveSess(r.data.session);
  toast(su ? "Compte créé" : "Connecté");
  await syncAccount(true);
  renderAll();
  goBack();
}
async function submitPay(f) {
  const fd = new FormData(f), method = String(fd.get("method") || ""), reference = String(fd.get("reference") || "").trim();
  if (!method) return formErr(ERR.invalid_method);
  if (reference.length < 4) return formErr(ERR.invalid_reference);
  formErr(""); const btn = f.querySelector("[type=submit]"); busy(btn, true, "Envoi…");
  const r = await api("/dev/request", "POST", { method, reference });
  if (!r.ok && r.data.error !== "already_pending") { busy(btn, false); return formErr(errTxt(r.data.error)); }
  toast(r.ok && r.data.notified === false ? "Demande enregistrée. L'équipe sera prévenue plus tard." : "Demande envoyée. Elle sera validée dans Telegram.");
  await loadMe(); renderPage(); renderSettings();
}
async function linkTelegram(btn) {
  busy(btn, true, "Création du code…");
  const r = await api("/dev/link-code", "POST", {});
  if (!r.ok) { busy(btn, false); return toast(errTxt(r.data.error)); }
  st.linkInfo = r.data; renderPage();
}
async function recheckMe(btn) {
  busy(btn, true, "Vérification…");
  const was = acct.me ? { role: acct.me.role, linked: acct.me.linked } : {};
  const r = await loadMe();
  renderPage(); renderSettings();
  if (!r.ok) return toast(errTxt(r.data.error));
  if (acct.me.role === "developer" && was.role !== "developer") toast("Compte développeur activé");
  else if (acct.me.linked && !was.linked) { st.linkInfo = null; renderPage(); toast("Telegram lié"); }
  else toast("Pas encore de changement");
}

/* ---------- composants ---------- */
const favBtn = (id) => `<button class="fav" data-fav="${esc(id)}" aria-pressed="${st.favs.has(id)}" aria-label="Favori">${ico("heart")}</button>`;
const hrefOf = (id) => "#/app/" + encodeURIComponent(id);

const card = (a) => `<article class="card" style="--h:${hue(a.name)}">
  <a class="hit" href="${hrefOf(a.id)}">
    <div class="tile">${tileInner(a)}</div>
    <div class="name">${esc(a.name)}</div>
    <div class="meta">${esc(a.cat)} · ${sizeTxt(a.size)}</div>
    ${isNew(a) ? '<span class="badge">Nouveau</span>' : a.ver ? `<div class="meta">v${esc(a.ver)}</div>` : ""}
  </a>
  <div class="foot"><button class="get" data-get="${esc(a.id)}">Obtenir</button>${favBtn(a.id)}</div></article>`;

const mini = (a) => `<a class="mini" href="${hrefOf(a.id)}" style="--h:${hue(a.name)}">
  <div class="tile">${tileInner(a)}</div>
  <div class="name">${esc(a.name)}</div>
  <div class="meta">${esc(a.cat)} · ${sizeTxt(a.size)}</div>
  ${isNew(a) ? '<span class="badge">Nouveau</span>' : ""}</a>`;

const hero = (a) => `<article class="hero" data-open="${esc(a.id)}" style="--h:${hue(a.name)}">
  <div class="tile">${tileInner(a)}</div>
  <h2>${esc(a.name)}</h2>
  <p>${esc(a.desc || a.cat + " · " + sizeTxt(a.size))}</p>
  <div class="row"><button class="btn" data-get="${esc(a.id)}">Télécharger</button><span class="size">${sizeTxt(a.size)}</span></div></article>`;

/* annonce : gros bloc de l'accueil, avec image de fond si l'annonce en a une */
const annHero = (a) => {
  const target = a.app && st.apps.some((x) => x.id === a.app) ? a.app : "";
  const bg = a.img ? ` style="--h:${hue(a.title)};background-image:linear-gradient(180deg,rgb(8 6 24/.1),rgb(8 6 24/.78)),url('${esc(a.img)}'),linear-gradient(150deg,hsl(${hue(a.title)} 85% 56%),hsl(${hue(a.title) - 30} 80% 34%))"` : ` style="--h:${hue(a.title)}"`;
  return `<article class="hero ann${a.img ? " has-img" : ""}"${target ? ` data-open="${esc(target)}"` : ""}${bg}>
    <span class="tag">Annonce</span>
    <h2>${esc(a.title)}</h2>
    ${a.body ? `<p>${esc(a.body)}</p>` : ""}
    ${target ? `<div class="row"><button class="btn" data-open="${esc(target)}">Voir l'application</button></div>`
      : a.link ? `<div class="row"><a class="btn" data-ext href="${esc(a.link)}" target="_blank" rel="noopener">En savoir plus</a></div>` : ""}</article>`;
};

const bannerHtml = () =>
  st.mode === "demo" ? `<div class="banner"><b>Mode démo.</b> Le catalogue réel est injoignable pour le moment : ces applications sont des exemples.</div>`
  : st.mode === "cache" ? `<div class="banner"><b>Hors connexion.</b> Dernier catalogue enregistré sur cet appareil.</div>` : "";

function renderHome() {
  const el = $("#v-home");
  if (st.mode === "loading") { el.innerHTML = `<div class="skeleton" style="height:190px"></div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
  if (!st.apps.length) {
    el.innerHTML = (st.anns.length ? `<div class="feat">${st.anns.map(annHero).join("")}</div>` : "") + `<div class="empty"><b>Le catalogue est vide.</b><span>Envoyez un fichier .apk au bot Telegram pour publier la première application.</span></div>`;
    return;
  }
  const byDl = st.apps.slice().sort((a, b) => b.dl - a.dl || String(b.date).localeCompare(String(a.date)));
  const fresh = st.apps.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const feat = [...new Map([byDl[0], fresh[0], byDl[1], fresh[1]].filter(Boolean).map((a) => [a.id, a])).values()].slice(0, st.anns.length ? 3 : 4);
  const cats = [...new Set(st.apps.map((a) => a.cat))];
  el.innerHTML = `${bannerHtml()}
    <div class="feat">${st.anns.map(annHero).join("")}${feat.map(hero).join("")}</div>
    ${byDl.length > 1 ? `<div><div class="sec-head"><h2>Populaires</h2><button class="link" data-tab="catalog">Tout voir</button></div><div class="rail">${byDl.slice(0, 8).map(mini).join("")}</div></div>` : ""}
    <div><div class="sec-head"><h2>Nouveautés</h2></div><div class="rail">${fresh.slice(0, 8).map(mini).join("")}</div></div>
    <div><div class="sec-head"><h2>Catégories</h2></div>
      <div class="cats">${cats.map((c) => { const n = st.apps.filter((a) => a.cat === c).length; return `<button class="cat" data-cat="${esc(c)}" style="--h:${hue(c)}"><b>${esc(c)}</b><span>${n} app${n > 1 ? "s" : ""}</span></button>`; }).join("")}</div></div>`;
}

function filtered() {
  const q = st.q.trim().toLowerCase();
  const l = st.apps.filter((a) => (st.cat === "Tous" || a.cat === st.cat) && (!q || (a.name + " " + a.dev + " " + a.cat + " " + a.desc + " " + a.pkg).toLowerCase().includes(q)));
  const s = { pop: (a, b) => b.dl - a.dl, new: (a, b) => String(b.date).localeCompare(String(a.date)), az: (a, b) => a.name.localeCompare(b.name, "fr"), size: (a, b) => a.size - b.size }[st.sort];
  return l.sort(s);
}
function renderChips() {
  const cats = [...new Set(st.apps.map((a) => a.cat))];
  if (st.cat !== "Tous" && !cats.includes(st.cat)) st.cat = "Tous";
  $("#chips").innerHTML = ["Tous", ...cats].map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === st.cat}">${esc(c)}</button>`).join("");
}
function renderCatalog() {
  const l = filtered();
  $("#count").textContent = l.length + (l.length > 1 ? " résultats" : " résultat");
  $("#results").innerHTML = l.length ? l.map(card).join("") : `<div class="empty"><b>Aucun résultat</b><span>Essayez un autre mot ou une autre catégorie.</span></div>`;
}
function renderFavs() {
  const l = st.apps.filter((a) => st.favs.has(a.id));
  $("#favList").innerHTML = l.length ? l.map(card).join("")
    : `<div class="empty"><b>Aucun favori</b><span>Touchez le cœur d'une application pour la retrouver ici.</span><button class="btn soft" data-tab="catalog">Parcourir le catalogue</button></div>`;
}
function renderSettings() {
  $("#env").textContent = NATIVE ? "Application Bee Store : le téléchargement et l'installation se font ici." : "Navigateur : Android peut demander d'autoriser l'installation depuis ce navigateur.";
  const s = $("#status");
  renderAccount();
  s.textContent = st.mode === "live" ? `Connecté · ${st.apps.length} application${st.apps.length > 1 ? "s" : ""}` : st.mode === "cache" ? "Hors connexion · copie locale" : st.mode === "demo" ? "Mode démo" : "Chargement…";
}
function renderAll() { renderHome(); renderChips(); renderCatalog(); renderFavs(); renderSettings(); }

/* ---------- écrans et navigation ---------- */
function showTab(tab) {
  if (tab !== st.tab) st.scroll[st.tab] = window.scrollY;
  const changed = tab !== st.tab || $("#v-" + tab).hidden;
  st.tab = tab;
  TABS.forEach((t) => ($("#v-" + t).hidden = t !== tab));
  $$(".nav-in button").forEach((b) => { if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  $("#ind").style.transform = `translateX(${TABS.indexOf(tab) * 100}%)`;
  $("#barTitle").textContent = TITLES[tab];
  if (tab === "favs") renderFavs();
  if (changed) window.scrollTo(0, st.scroll[tab] || 0);
}

function setInert(on) { ["main", "bar"].forEach((id) => { const e = document.getElementById(id); if (e) e.inert = on; }); const n = $(".nav"); if (n) n.inert = on; }

const detailHtml = (a) => {
  const fav = st.favs.has(a.id);
  const rows = [
    ["Version", a.ver ? esc(a.ver) : "n.c."], ["Taille", sizeTxt(a.size)], ["Téléchargements", nf(a.dl)], ["Mis à jour", dateTxt(a.date)], ["Paquet", esc(a.pkg || "n.c.")]
  ];
  return `<div class="d-top" id="dTop">
      <button class="iconbtn" data-back aria-label="Retour">${ico("back")}</button>
      <span class="sp d-title">${esc(a.name)}</span>
      <button class="fav" data-fav="${esc(a.id)}" aria-pressed="${fav}" aria-label="Favori">${ico("heart")}</button>
    </div>
    <div class="d-hero" style="--h:${hue(a.name)}">
      <div class="tile lg">${tileInner(a)}</div>
      <h1>${esc(a.name)}</h1>
      <div class="by">${esc(a.dev || a.cat)}</div>
      <div class="tags"><span class="tag">${esc(a.cat)}</span>${isNew(a) ? '<span class="tag">Nouveau</span>' : ""}</div>
    </div>
    <div class="d-body">
      <div class="facts">
        <div><b>${a.ver ? esc(a.ver) : "n.c."}</b><span>Version</span></div>
        <div><b>${sizeTxt(a.size)}</b><span>Taille</span></div>
        <div><b>${nf(a.dl)}</b><span>Téléchargements</span></div>
      </div>
      ${a.shots.length ? `<div><h2>Captures d'écran</h2><div class="shots">${a.shots.map((u, i) => `<img src="${esc(u)}" data-shot="${i}" alt="Capture ${i + 1} de ${esc(a.name)}" loading="lazy" decoding="async" onerror="this.remove()">`).join("")}</div></div>` : ""}
      ${a.desc ? `<div><h2>À propos</h2><p>${esc(a.desc)}</p></div>` : ""}
      <div><h2>Informations</h2><div class="info">
        ${rows.map((r) => `<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join("")}
        ${a.sha ? `<div><span>SHA-256</span><span><code>${esc(a.sha)}</code><br><button class="copy" data-copy="${esc(a.sha)}">${ico("copy")}Copier</button></span></div>` : ""}
      </div></div>
      <p class="d-note">${NATIVE ? "L'installation se lance toute seule après le téléchargement. Android peut demander d'autoriser Bee Store à installer des applications : c'est à faire une seule fois." : "Android peut demander d'autoriser l'installation d'applications depuis ce navigateur. Acceptez uniquement pour cette installation."}</p>
    </div>
    <div class="d-actions"><button class="btn" data-get="${esc(a.id)}">${ico("down")}${a.direct ? "Télécharger" : "Obtenir sur Telegram"} · ${sizeTxt(a.size)}</button></div>`;
};

function openDetail(id) {
  const d = $("#detail");
  const a = st.apps.find((x) => x.id === id);
  if (!a) {
    if (st.mode === "loading") return; // le catalogue arrive : la fiche s'ouvrira ensuite
    return goTab(st.tab); // fiche inconnue (lien ancien) : retour à l'écran de fond
  }
  const key = id + ":" + st.mode;
  if (!d.classList.contains("open")) st.scroll[st.tab] = window.scrollY;
  if (st.detailKey !== key) {
    d.innerHTML = detailHtml(a);
    d.scrollTop = 0;
    st.detailKey = key;
  }
  d.classList.add("open");
  d.setAttribute("aria-hidden", "false");
  document.body.classList.add("lock");
  setInert(true);
  const b = d.querySelector("[data-back]"); if (b) b.focus({ preventScroll: true });
}
function closeDetail() {
  const d = $("#detail");
  if (!d.classList.contains("open")) return;
  d.classList.remove("open");
  d.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lock");
  setInert(false);
  window.scrollTo(0, st.scroll[st.tab] || 0);
  clearTimeout(closeDetail.t);
  closeDetail.t = setTimeout(() => { if (!d.classList.contains("open")) { d.innerHTML = ""; st.detailKey = ""; } }, 400);
}

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  closeLb();
  if (parts[0] === "app" && parts[1]) {
    let id = parts[1]; try { id = decodeURIComponent(id); } catch (e) {}
    closePage();
    openDetail(id);
    return;
  }
  if (parts[0] === "login" || parts[0] === "dev") {
    if (parts[0] === "dev" && !acct.sess) { st.authMode = "login"; try { history.replaceState(null, "", "#/login"); } catch (e) { location.hash = "#/login"; return; } return route(); }
    if (parts[0] === "login" && acct.sess) return goTab("settings");
    closeDetail();
    openPage(parts[0]);
    return;
  }
  st.steps = 0;
  closeDetail();
  closePage();
  showTab(TABS.includes(parts[0]) ? parts[0] : "home");
}
function goTab(tab) {
  const h = tab === "home" ? "#/" : "#/" + tab;
  try { history.replaceState(null, "", h); route(); } catch (e) { location.hash = h; }
}
function openApp(id) { st.steps++; location.hash = hrefOf(id); }
function goBack() {
  if (st.steps > 0) { st.steps--; history.back(); } else goTab(st.tab);
}
window.addEventListener("hashchange", route);

/* ---------- actions ---------- */
function toast(t) {
  const box = $("#toastBox"); box.innerHTML = `<div class="toast">${esc(t)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => (box.innerHTML = ""), 2600);
}
function getApp(id) {
  const a = st.apps.find((x) => x.id === id); if (!a) return;
  if (st.mode === "demo" || !a.url) return toast("Exemple : pas de fichier réel pour " + a.name);
  buzz(12);
  if (a.direct && NATIVE) { toast("Téléchargement de " + a.name + "…"); window.BeeNative.download(a.url, fileName(a), a.sha || ""); }
  else if (a.direct) { toast("Téléchargement de " + a.name + "…"); location.href = a.url; }
  else if (NATIVE) { toast("Ouverture de Telegram…"); location.href = a.url; }
  else { toast("Ouverture de Telegram…"); window.open(a.url, "_blank", "noopener"); }
}
function toggleFav(id) {
  if (st.favs.has(id)) st.favs.delete(id); else st.favs.add(id);
  saveFavs();
  const on = st.favs.has(id);
  queueFav(id, on);
  $$("[data-fav]").forEach((b) => { if (b.dataset.fav === id) b.setAttribute("aria-pressed", String(on)); });
  if (st.tab === "favs") renderFavs();
  buzz(8);
  toast(on ? "Ajouté aux favoris" : "Retiré des favoris");
}
function copyText(t, msg) {
  const done = () => toast(msg || "Empreinte copiée");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => toast("Copie impossible"));
  else {
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Copie impossible"); }
    ta.remove();
  }
}

/* visionneuse de captures */
function openLb(id, i) {
  const a = st.apps.find((x) => x.id === id); if (!a || !a.shots.length) return;
  const lb = $("#lb");
  lb.innerHTML = a.shots.map((u, k) => `<img src="${esc(u)}" alt="Capture ${k + 1} de ${esc(a.name)}">`).join("");
  lb.hidden = false;
  lb.scrollLeft = i * lb.clientWidth;
}
function closeLb() { const lb = $("#lb"); if (!lb.hidden) { lb.hidden = true; lb.innerHTML = ""; } }

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("#lb")) return closeLb();
  let el;
  if ((el = t.closest("[data-get]"))) return getApp(el.dataset.get);
  if ((el = t.closest("[data-fav]"))) return toggleFav(el.dataset.fav);
  if ((el = t.closest("[data-copy]"))) return copyText(el.dataset.copy);
  if ((el = t.closest("[data-copy-num]"))) { e.preventDefault(); return copyText(el.dataset.copyNum, "Numéro copié"); }
  if ((el = t.closest("[data-page]"))) return goPage(el.dataset.page, el.dataset.mode);
  if ((el = t.closest("[data-auth-tab]"))) { const em = $("#page input[name=email]")?.value; st.authMode = el.dataset.authTab; renderPage(); const i = $("#page input[name=email]"); if (i && em) i.value = em; return; }
  if ((el = t.closest("[data-pw]"))) { const i = el.parentElement.querySelector("input"); const show = i.type === "password"; i.type = show ? "text" : "password"; el.textContent = show ? "Masquer" : "Afficher"; return; }
  if (t.closest("[data-logout]")) return logout(false);
  if ((el = t.closest("[data-link-tg]"))) return linkTelegram(el);
  if ((el = t.closest("[data-refresh-me]"))) return recheckMe(el);
  if ((el = t.closest("a[data-ext]"))) { if (NATIVE) { e.preventDefault(); location.href = el.href; } return; }
  if ((el = t.closest("[data-shot]"))) return openLb($("#detail").querySelector("[data-fav]").dataset.fav, Number(el.dataset.shot));
  if (t.closest("[data-back]")) return goBack();
  if ((el = t.closest("a[href^='#/app/']"))) { st.steps++; return; } // le lien change le hash tout seul
  if ((el = t.closest("[data-open]"))) return openApp(el.dataset.open);
  if ((el = t.closest("[data-cat]"))) { st.cat = el.dataset.cat; renderChips(); renderCatalog(); return goTab("catalog"); }
  if ((el = t.closest("[data-tab]"))) {
    if (el.dataset.tab === st.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    return goTab(el.dataset.tab);
  }
  if ((el = t.closest("[data-theme-set]"))) { st.theme = el.dataset.themeSet; lsSet("bee:theme", st.theme); return applyTheme(); }
  if (t.closest("[data-refresh]")) { toast("Actualisation…"); return boot(true); }
  if (t.closest("[data-clear]")) { lsDel("bee:catalog"); return toast("Copie locale vidée"); }
});
document.addEventListener("submit", (e) => {
  const f = e.target.closest("form[data-form]"); if (!f) return;
  e.preventDefault();
  if (f.dataset.form === "auth") submitAuth(f); else if (f.dataset.form === "pay") submitPay(f);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#lb").hidden) closeLb(); else if ($("#detail").classList.contains("open") || $("#page").classList.contains("open")) goBack();
});
$("#q").addEventListener("input", (e) => { st.q = e.target.value; renderCatalog(); });
$("#sort").addEventListener("change", (e) => { st.sort = e.target.value; renderCatalog(); });
$("#goSearch").addEventListener("click", () => { goTab("catalog"); setTimeout(() => $("#q").focus(), 60); });
$("#page").addEventListener("scroll", (e) => { const top = $(".p-top"); if (top) top.classList.toggle("solid", e.target.scrollTop > 4); }, { passive: true });
$("#detail").addEventListener("scroll", (e) => { const top = $("#dTop"); if (top) top.classList.toggle("solid", e.target.scrollTop > 150); }, { passive: true });

/* tirer pour actualiser */
(() => {
  const ptr = $("#ptr");
  let y0 = 0, x0 = 0, dy = 0, on = false;
  const free = () => !document.body.classList.contains("lock") && $("#lb").hidden && !document.activeElement?.matches?.("input, select");
  addEventListener("touchstart", (e) => {
    on = window.scrollY <= 0 && free() && e.touches.length === 1;
    if (on) { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; ptr.style.transition = "none"; }
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (!on) return;
    dy = e.touches[0].clientY - y0;
    if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy) || dy <= 0) { ptr.style.opacity = 0; return; }
    const p = Math.min(dy / 110, 1);
    ptr.style.opacity = String(p);
    ptr.style.transform = `translateY(${Math.min(dy / 2.2, 52)}px) rotate(${dy * 2.4}deg)`;
  }, { passive: true });
  addEventListener("touchend", async () => {
    if (!on) return;
    on = false;
    ptr.style.transition = "transform 0.25s, opacity 0.25s";
    if (dy > 100) {
      ptr.style.transform = "translateY(44px)"; ptr.style.opacity = "1"; ptr.classList.add("spin");
      await boot(true);
      ptr.classList.remove("spin");
    }
    ptr.style.opacity = "0"; ptr.style.transform = "";
  }, { passive: true });
})();

async function boot(refresh) {
  if (refresh) { st.mode = "loading"; renderHome(); }
  await load();
  renderAll();
  // une fiche ouverte pendant le chargement (lien direct) s'affiche maintenant
  if (location.hash.startsWith("#/app/")) route();
  if (acct.sess) syncAccount(false);
}

document.title = APP_NAME;
applyTheme();
if (!location.hash) {
  const w = new URLSearchParams(location.search).get("view");
  if (TABS.includes(w) && w !== "home") { try { history.replaceState(null, "", "#/" + w); } catch (e) {} }
}
renderAll();
route();
boot(false);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
