/* Bee Store : interface du store. Le catalogue vient de l'API (bot Telegram + Supabase). */
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
].map((d, i) => ({ id: "demo" + i, name: d[0], dev: "", cat: d[1], ver: d[2], size: d[3] * 1048576, dl: d[4], date: d[5], created: d[5], desc: d[6], url: "", direct: false, pkg: "exemple." + i, sha: "" }));

const st = { view: "home", cat: "Tous", q: "", sort: "pop", favs: new Set(), theme: "auto", apps: [], mode: "loading" };
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (n) => (n >= 1000 ? (n / 1000).toLocaleString("fr", { maximumFractionDigits: 1 }) + " k" : String(n));
const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const sizeTxt = (b) => (b >= 1048576 ? (b / 1048576).toLocaleString("fr", { maximumFractionDigits: 1 }) + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko");
const dateTxt = (d) => new Date(d).toLocaleDateString("fr", { day: "numeric", month: "short", year: "numeric" });
const HUES = [262, 215, 175, 145, 330, 8, 195, 285];
const hue = (s) => HUES[[...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
const isNew = (a) => Date.now() - new Date(a.created).getTime() < 14 * 864e5;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

try { JSON.parse(lsGet("bee:favs") || "[]").forEach((i) => st.favs.add(i)); } catch (e) {}
st.theme = lsGet("bee:theme") || "auto";
function applyTheme() {
  const r = document.documentElement;
  if (st.theme === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", st.theme);
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === st.theme)));
}

/* données */
const norm = (a) => ({
  id: a.id, name: a.name, dev: a.developer || "", cat: a.category || "Outils", ver: a.version_name || "", size: a.size_bytes || 0,
  dl: a.downloads || 0, date: a.updated_at, created: a.created_at, desc: a.description || "", url: a.download_url, direct: !!a.direct,
  tg: a.telegram_url, pkg: a.package, sha: a.sha256 || "", icon: a.icon_url || "", shots: Array.isArray(a.screenshots) ? a.screenshots : []
});
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
    st.mode = "live";
    lsSet("bee:catalog", JSON.stringify(j.apps || []));
  } catch (e) {
    let cached = null;
    try { cached = JSON.parse(lsGet("bee:catalog") || "null"); } catch (_) {}
    if (cached && cached.length) { st.apps = cached.map(norm); st.mode = "cache"; }
    else { st.apps = DEMO; st.mode = "demo"; }
  }
}

/* composants */
const card = (a) => `<button class="card" data-open="${esc(a.id)}" style="--h:${hue(a.name)}">
  <div class="tile">${tileInner(a)}</div>
  <div class="name">${esc(a.name)}</div>
  <div class="meta">${esc(a.cat)} · ${sizeTxt(a.size)}</div>
  ${isNew(a) ? '<div class="rate">Nouveau</div>' : a.ver ? `<div class="meta">v${esc(a.ver)}</div>` : ""}</button>`;

const row = (a) => `<div class="item" style="--h:${hue(a.name)}">
  <div class="tile">${tileInner(a)}</div>
  <button class="body" data-open="${esc(a.id)}">
    <span class="name">${esc(a.name)}</span>
    <span class="meta">${esc(a.cat)} · ${sizeTxt(a.size)}${a.ver ? " · v" + esc(a.ver) : ""}</span>
  </button>
  <button class="btn soft" data-get="${esc(a.id)}">Obtenir</button></div>`;

const bannerHtml = () =>
  st.mode === "demo" ? `<div class="banner"><b>Mode démo.</b> Le catalogue réel est injoignable pour le moment : ces applications sont des exemples.</div>`
  : st.mode === "cache" ? `<div class="banner"><b>Hors connexion.</b> Dernier catalogue enregistré sur cet appareil.</div>` : "";

function renderHome() {
  const el = $("#v-home");
  if (st.mode === "loading") { el.innerHTML = `<div class="skeleton" style="height:180px"></div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
  if (!st.apps.length) {
    el.innerHTML = `<div class="empty"><b>Le catalogue est vide.</b><br>Envoyez un fichier .apk au bot Telegram pour publier la première application.</div>`;
    return;
  }
  const byDl = st.apps.slice().sort((a, b) => b.dl - a.dl || b.date.localeCompare(a.date));
  const feat = byDl[0];
  const fresh = st.apps.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const cats = [...new Set(st.apps.map((a) => a.cat))];
  el.innerHTML = `${bannerHtml()}
    <div class="hero" style="--h:${hue(feat.name)}">
      <div class="big-initials" aria-hidden="true">${esc(initials(feat.name))}</div>
      <span class="eyebrow">À la une</span>
      <h1>${esc(feat.name)}</h1>
      <p>${esc(feat.desc || feat.cat + " · " + sizeTxt(feat.size))}</p>
      <div class="row"><button class="btn" data-get="${esc(feat.id)}">Télécharger</button><button class="btn ghost" data-open="${esc(feat.id)}">Détails</button></div>
    </div>
    ${byDl.length > 1 ? `<div><div class="sec-head"><h2>Populaires</h2><button class="link" data-go="catalog">Tout voir</button></div><div class="rail">${byDl.slice(0, 8).map(card).join("")}</div></div>` : ""}
    <div><div class="sec-head"><h2>Nouveautés</h2></div><div class="rail">${fresh.map(card).join("")}</div></div>
    <div><div class="sec-head"><h2>Catégories</h2></div>
      <div class="cats">${cats.map((c) => `<button class="cat" data-cat="${esc(c)}" style="--h:${hue(c)}"><b>${esc(c)}</b><span class="meta">${st.apps.filter((a) => a.cat === c).length} app${st.apps.filter((a) => a.cat === c).length > 1 ? "s" : ""}</span></button>`).join("")}</div></div>`;
}

function filtered() {
  const q = st.q.trim().toLowerCase();
  const l = st.apps.filter((a) => (st.cat === "Tous" || a.cat === st.cat) && (!q || (a.name + " " + a.dev + " " + a.cat + " " + a.desc + " " + a.pkg).toLowerCase().includes(q)));
  const s = { pop: (a, b) => b.dl - a.dl, new: (a, b) => b.date.localeCompare(a.date), az: (a, b) => a.name.localeCompare(b.name, "fr"), size: (a, b) => a.size - b.size }[st.sort];
  return l.sort(s);
}
function renderChips() {
  const cats = [...new Set(st.apps.map((a) => a.cat))];
  $("#chips").innerHTML = ["Tous", ...cats].map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === st.cat}">${esc(c)}</button>`).join("");
}
function renderCatalog() {
  const l = filtered();
  $("#count").textContent = l.length + (l.length > 1 ? " résultats" : " résultat");
  $("#results").innerHTML = l.length ? l.map(row).join("") : `<div class="empty">Aucun résultat pour cette recherche.</div>`;
}
function renderFavs() {
  const l = st.apps.filter((a) => st.favs.has(a.id));
  $("#favList").innerHTML = l.length ? l.map(row).join("") : `<div class="empty">Aucun favori pour l'instant. Ouvrez une fiche et touchez « Favori ».</div>`;
}

function show(v) {
  st.view = v;
  document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== "v-" + v));
  document.querySelectorAll(".nav button").forEach((b) => {
    if (b.dataset.go === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  if (v === "catalog") { renderChips(); renderCatalog(); }
  if (v === "favs") renderFavs();
  window.scrollTo(0, 0);
}

/* fiche détail */
function openSheet(id) {
  const a = st.apps.find((x) => x.id === id); if (!a) return;
  const fav = st.favs.has(id);
  $("#layer").innerHTML = `<div class="scrim" data-close="1"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(a.name)}">
    <div class="sheet-head colored" style="--h:${hue(a.name)}"><div class="tile lg">${tileInner(a)}</div>
      <div style="min-width:0"><h2>${esc(a.name)}</h2><div class="meta">${esc(a.dev || a.cat)}</div></div></div>
    <div class="facts">
      <div><b>${a.ver ? esc(a.ver) : "n.c."}</b><span class="meta">Version</span></div>
      <div><b>${sizeTxt(a.size)}</b><span class="meta">Taille</span></div>
      <div><b>${nf(a.dl)}</b><span class="meta">Téléchargements</span></div>
    </div>
    <div class="tags"><span class="tag">${esc(a.cat)}</span><span class="tag">Mis à jour le ${dateTxt(a.date)}</span>${isNew(a) ? '<span class="tag ok">Nouveau</span>' : ""}</div>
    ${a.shots.length ? `<div class="shots" aria-label="Captures d'écran">${a.shots.map((u, i) => `<img src="${esc(u)}" alt="Capture ${i + 1} de ${esc(a.name)}" loading="lazy" decoding="async" onerror="this.remove()">`).join("")}</div>` : ""}
    ${a.desc ? `<p>${esc(a.desc)}</p>` : ""}
    ${a.sha ? `<p class="meta" style="overflow-wrap:anywhere">SHA-256 : <code>${esc(a.sha)}</code></p>` : ""}
    <p class="meta">Android peut demander d'autoriser l'installation d'applications depuis ce navigateur. Acceptez uniquement pour cette installation.</p>
    <div class="actions"><button class="btn" data-get="${esc(a.id)}">Télécharger</button>
      <button class="btn soft" data-fav="${esc(a.id)}" id="favBtn">${fav ? "Retirer" : "Favori"}</button>
      <button class="btn soft" data-close="1" id="closeBtn">Fermer</button></div>
  </div></div>`;
  $("#closeBtn").focus();
}
function closeSheet() { $("#layer").innerHTML = ""; }

function toast(t) {
  const box = $("#toastBox"); box.innerHTML = `<div class="toast">${esc(t)}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => (box.innerHTML = ""), 2600);
}
function getApp(id) {
  const a = st.apps.find((x) => x.id === id); if (!a) return;
  if (st.mode === "demo" || !a.url) return toast("Exemple : pas de fichier réel pour " + a.name);
  if (a.direct) { toast("Téléchargement de " + a.name + "…"); location.href = a.url; }
  else { toast("Ouverture de Telegram…"); window.open(a.url, "_blank", "noopener"); }
}
function toggleFav(id) {
  if (st.favs.has(id)) st.favs.delete(id); else st.favs.add(id);
  lsSet("bee:favs", JSON.stringify([...st.favs]));
  const b = $("#favBtn"); if (b) b.textContent = st.favs.has(id) ? "Retirer" : "Favori";
  if (st.view === "favs") renderFavs();
  toast(st.favs.has(id) ? "Ajouté aux favoris" : "Retiré des favoris");
}

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest(".scrim") && !t.closest(".sheet")) return closeSheet();
  const el = t.closest("[data-open],[data-get],[data-fav],[data-go],[data-cat],[data-close],[data-theme-set],[data-refresh]");
  if (!el) return;
  if (el.dataset.close) return closeSheet();
  if (el.dataset.open) return openSheet(el.dataset.open);
  if (el.dataset.get) return getApp(el.dataset.get);
  if (el.dataset.fav) return toggleFav(el.dataset.fav);
  if (el.dataset.refresh !== undefined) return boot(true);
  if (el.dataset.themeSet) { st.theme = el.dataset.themeSet; lsSet("bee:theme", st.theme); return applyTheme(); }
  if (el.dataset.cat !== undefined) { st.cat = el.dataset.cat; return show("catalog"); }
  if (el.dataset.go) return show(el.dataset.go);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
$("#q").addEventListener("input", (e) => { st.q = e.target.value; renderCatalog(); });
$("#sort").addEventListener("change", (e) => { st.sort = e.target.value; renderCatalog(); });
$("#goSearch").addEventListener("click", () => { show("catalog"); $("#q").focus(); });

async function boot(refresh) {
  if (refresh) { st.mode = "loading"; renderHome(); }
  await load();
  renderHome();
  if (st.view === "catalog") { renderChips(); renderCatalog(); }
  if (st.view === "favs") renderFavs();
  const s = $("#status");
  if (s) s.textContent = st.mode === "live" ? `Connecté · ${st.apps.length} application${st.apps.length > 1 ? "s" : ""}` : st.mode === "cache" ? "Hors connexion · copie locale" : "Mode démo";
}

document.title = APP_NAME;
applyTheme();
renderHome();
const wanted = new URLSearchParams(location.search).get("view");
show(["catalog", "favs", "settings"].includes(wanted) ? wanted : "home");
boot(false);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
