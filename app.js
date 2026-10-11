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
const st = { tab: "home", cat: "Tous", q: "", sort: "pop", favs: new Set(), theme: "auto", apps: [], mode: "loading", steps: 0, scroll: {}, detailKey: "" };
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

const bannerHtml = () =>
  st.mode === "demo" ? `<div class="banner"><b>Mode démo.</b> Le catalogue réel est injoignable pour le moment : ces applications sont des exemples.</div>`
  : st.mode === "cache" ? `<div class="banner"><b>Hors connexion.</b> Dernier catalogue enregistré sur cet appareil.</div>` : "";

function renderHome() {
  const el = $("#v-home");
  if (st.mode === "loading") { el.innerHTML = `<div class="skeleton" style="height:190px"></div><div class="skeleton"></div><div class="skeleton"></div>`; return; }
  if (!st.apps.length) {
    el.innerHTML = `<div class="empty"><b>Le catalogue est vide.</b><span>Envoyez un fichier .apk au bot Telegram pour publier la première application.</span></div>`;
    return;
  }
  const byDl = st.apps.slice().sort((a, b) => b.dl - a.dl || String(b.date).localeCompare(String(a.date)));
  const fresh = st.apps.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const feat = [...new Map([byDl[0], fresh[0], byDl[1], fresh[1]].filter(Boolean).map((a) => [a.id, a])).values()].slice(0, 4);
  const cats = [...new Set(st.apps.map((a) => a.cat))];
  el.innerHTML = `${bannerHtml()}
    <div class="feat">${feat.map(hero).join("")}</div>
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
    openDetail(id);
    return;
  }
  st.steps = 0;
  closeDetail();
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
  lsSet("bee:favs", JSON.stringify([...st.favs]));
  const on = st.favs.has(id);
  $$("[data-fav]").forEach((b) => { if (b.dataset.fav === id) b.setAttribute("aria-pressed", String(on)); });
  if (st.tab === "favs") renderFavs();
  buzz(8);
  toast(on ? "Ajouté aux favoris" : "Retiré des favoris");
}
function copyText(t) {
  const done = () => toast("Empreinte copiée");
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
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#lb").hidden) closeLb(); else if ($("#detail").classList.contains("open")) goBack();
});
$("#q").addEventListener("input", (e) => { st.q = e.target.value; renderCatalog(); });
$("#sort").addEventListener("change", (e) => { st.sort = e.target.value; renderCatalog(); });
$("#goSearch").addEventListener("click", () => { goTab("catalog"); setTimeout(() => $("#q").focus(), 60); });
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
