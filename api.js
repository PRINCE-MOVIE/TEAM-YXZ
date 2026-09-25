const API_BASE = "http://51.75.118.170:20041/api/v1";

// Plusieurs proxys CORS de secours : les proxys publics gratuits tombent
// souvent en rate-limit ou en timeout. Si le premier échoue, on tente
// automatiquement le suivant avant d'abandonner.
const PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?url=",
  "https://api.codetabs.com/v1/proxy?quest=",
];

// Petit cache mémoire + sessionStorage pour éviter de retaper les proxys
// CORS quand on revisite la même page (accueil <-> catalogue, retour
// arrière, etc.). C'est la principale source de lenteur ressentie car
// chaque appel traverse un proxy public en plus de l'API elle-même.
const CACHE_TTL_MS = 2 * 60 * 1000;
const memCache = new Map();

function cacheRead(key) {
  const now = Date.now();
  const mem = memCache.get(key);
  if (mem && now - mem.t < CACHE_TTL_MS) return mem.v;
  try {
    const raw = sessionStorage.getItem("pm_cache:" + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (now - t >= CACHE_TTL_MS) return null;
    memCache.set(key, { t, v });
    return v;
  } catch (e) {
    return null;
  }
}

function cacheWrite(key, v) {
  const entry = { t: Date.now(), v };
  memCache.set(key, entry);
  try { sessionStorage.setItem("pm_cache:" + key, JSON.stringify(entry)); } catch (e) {}
}

async function api(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
  });
  const urlStr = url.toString();

  const cacheKey = urlStr;
  const cached = cacheRead(cacheKey);
  if (cached) return cached;

  // On interroge les 3 proxys CORS EN MÊME TEMPS, et on prend le premier
  // qui répond correctement — au lieu d'attendre le délai complet d'un
  // proxy en rate-limit (jusqu'à 10s) avant même d'essayer le suivant.
  // C'est ce qui rendait le site lent et faisait parfois échouer le
  // lecteur vidéo (la liste des serveurs mettait trop de temps à arriver
  // ou expirait avant que le 2e/3e proxy soit tenté).
  const controllers = PROXIES.map(() => new AbortController());

  const attempts = PROXIES.map((proxy, i) => {
    const timer = setTimeout(() => controllers[i].abort(), 9000);
    return fetch(proxy + encodeURIComponent(urlStr), { signal: controllers[i].signal })
      .then(async (res) => {
        let json;
        try {
          json = await res.json();
        } catch (e) {
          throw new Error("Réponse invalide du proxy.");
        }
        if (!json.success) {
          const err = new Error(json.error?.message || "Erreur inconnue.");
          err.code = json.error?.code;
          throw err;
        }
        return json;
      })
      .finally(() => clearTimeout(timer));
  });

  try {
    const json = await Promise.any(attempts);
    // On n'a plus besoin des autres proxys encore en vol : on les annule.
    controllers.forEach(c => c.abort());
    cacheWrite(cacheKey, json);
    return json;
  } catch (aggregateErr) {
    const errors = (aggregateErr && aggregateErr.errors) || [aggregateErr];
    const lastErr = errors[errors.length - 1];
    const err = new Error(lastErr?.message || "Source indisponible. Réessaie dans un instant.");
    err.code = lastErr?.code || "source_unavailable";
    throw err;
  }
}

/* =========================================================
   COMPTE (mock front-end uniquement)
   ⚠️ Pas de backend : tout est stocké en clair dans le
   localStorage du navigateur. C'est purement visuel/démo,
   ce n'est PAS un système d'authentification sécurisé.
   ========================================================= */
const AUTH_KEY = "pm_user";
const SESSION_KEY = "pm_session";
const MYLIST_KEY = "pm_mylist";

// Pages accessibles sans être connecté. Toutes les autres redirigent
// vers la page de bienvenue si personne n'est connecté.
const PUBLIC_PAGES = ["index.html", "inscription.html", "connexion.html", ""];

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "1" || localStorage.getItem(SESSION_KEY) === "1";
}

function registerUser({ nom, prenom, email, telephone, password }) {
  const user = { nom, prenom, email, telephone, password };
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  localStorage.setItem(SESSION_KEY, "1");
}

function loginUser(email, password) {
  const user = getCurrentUser();
  if (!user) return { ok: false, message: "Aucun compte trouvé. Inscris-toi d'abord." };
  if (user.email.toLowerCase() !== email.toLowerCase() || user.password !== password) {
    return { ok: false, message: "Email ou mot de passe incorrect." };
  }
  localStorage.setItem(SESSION_KEY, "1");
  return { ok: true };
}

function logoutUser() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  location.href = "accueil.html";
}

function updateUser(patch) {
  const user = getCurrentUser() || {};
  const updated = { ...user, ...patch };
  localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  return updated;
}

// Redirige vers la page de bienvenue si la page courante est protégée
// et que personne n'est connecté.
function guardAuth() {
  const page = location.pathname.split("/").pop();
  if (PUBLIC_PAGES.includes(page)) return;
  if (!isLoggedIn() || !getCurrentUser()) {
    location.href = "index.html";
  }
}
guardAuth();

/* ---------- Ma Liste ---------- */
function getMyList() {
  try { return JSON.parse(localStorage.getItem(MYLIST_KEY) || "[]"); }
  catch (e) { return []; }
}

function isInMyList(slug) {
  return getMyList().some(i => i.slug === slug);
}

function toggleMyList(item) {
  const list = getMyList();
  const idx = list.findIndex(i => i.slug === item.slug);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ slug: item.slug, title: item.title, image: item.image, type: item.type, version: item.version });
  }
  localStorage.setItem(MYLIST_KEY, JSON.stringify(list));
  return idx < 0; // true si on vient d'ajouter, false si on vient de retirer
}

function renderAccountMenu() {
  const header = document.querySelector("header");
  if (!header) return;
  if (document.getElementById("accountMenu")) return;

  const user = getCurrentUser();
  const loggedIn = user && isLoggedIn();

  const wrap = document.createElement("div");
  wrap.id = "accountMenu";
  wrap.className = "account-menu";

  if (loggedIn) {
    const initiale = (user.prenom || "?").charAt(0).toUpperCase();
    wrap.innerHTML = `
      <button type="button" class="account-avatar" id="accountToggle">${initiale}</button>
      <div class="account-dropdown" id="accountDropdown">
        <div class="account-dropdown-name">${user.prenom || ""} ${user.nom || ""}</div>
        <div class="account-dropdown-sub">${user.email || ""}</div>
        <div class="account-dropdown-sub">${user.telephone || ""}</div>
        <button type="button" id="logoutBtn">Déconnexion</button>
      </div>
    `;
  } else {
    wrap.innerHTML = `
      <a href="connexion.html" class="account-link">Connexion</a>
      <a href="inscription.html" class="btn account-btn-signup">S'inscrire</a>
    `;
  }

  header.appendChild(wrap);

  if (loggedIn) {
    const toggle = document.getElementById("accountToggle");
    const dropdown = document.getElementById("accountDropdown");
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("open");
    });
    document.addEventListener("click", () => dropdown.classList.remove("open"));
    document.getElementById("logoutBtn").addEventListener("click", logoutUser);
  }
}

/* =========================================================
   NAVIGATION DU BAS (façon appli Netflix mobile)
   ========================================================= */
const NAV_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.6.5 5.2 4.1 3.6 7.7C21 16.4 12 21 12 21Z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>`,
};

function renderBottomNav() {
  const page = location.pathname.split("/").pop();
  if (PUBLIC_PAGES.includes(page)) return; // pas de barre sur bienvenue/inscription/connexion
  if (document.getElementById("bottomNav")) return;

  const items = [
    { href: "accueil.html", label: "Accueil", match: ["accueil.html"], icon: NAV_ICONS.home },
    { href: "catalogue.html", label: "Parcourir", match: ["catalogue.html", "film.html", "serie.html", "anime.html", "drama.html", "webtoon.html", "lecteur.html"], icon: NAV_ICONS.grid },
    { href: "recherche.html", label: "Recherche", match: ["recherche.html"], icon: NAV_ICONS.search },
    { href: "maliste.html", label: "Ma Liste", match: ["maliste.html"], icon: NAV_ICONS.heart },
    { href: "parametres.html", label: "Compte", match: ["parametres.html"], icon: NAV_ICONS.gear },
  ];

  const nav = document.createElement("nav");
  nav.id = "bottomNav";
  nav.className = "bottom-nav";
  nav.innerHTML = items.map(it =>
    `<a href="${it.href}" class="${it.match.includes(page) ? "active" : ""}">${it.icon}<span>${it.label}</span></a>`
  ).join("");
  document.body.appendChild(nav);
  document.body.classList.add("has-bottom-nav");
}

renderAccountMenu();
renderBottomNav();

const getSlug = (key = "slug") => new URLSearchParams(location.search).get(key);
const getParam = (key) => new URLSearchParams(location.search).get(key);

// Affiche un bandeau d'erreur discret SANS effacer le contenu déjà affiché
// (contrairement à showError qui remplace tout #app). Utile quand une
// requête échoue après qu'on ait déjà affiché des résultats.
const WARN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.6 1.8 18a1.6 1.6 0 0 0 1.4 2.4h17.6a1.6 1.6 0 0 0 1.4-2.4L13.7 3.6a1.6 1.6 0 0 0-2.8 0Z"/><path d="M12 16.2h.01"/></svg>`;

function showRetryBanner(message, onRetry) {
  const old = document.getElementById("retry-banner");
  if (old) old.remove();

  const banner = document.createElement("div");
  banner.id = "retry-banner";
  banner.className = "retry-banner";
  banner.innerHTML = `
    <span class="retry-banner-msg">${WARN_ICON}${message || "Erreur de connexion à la source."}</span>
    <button type="button">Réessayer</button>
  `;
  banner.querySelector("button").onclick = () => {
    banner.remove();
    if (onRetry) onRetry();
  };
  document.body.prepend(banner);
}

function showError(message) {
  const app = document.getElementById("app");
  if (!app) return;
  const homeLink = PUBLIC_PAGES.includes(location.pathname.split("/").pop()) ? "index.html" : "accueil.html";
  app.innerHTML = `
    <div class="error-box">
      <div class="error-icon">${WARN_ICON}</div>
      <h2>Une erreur est survenue</h2>
      <p>${message}</p>
      <a href="${homeLink}" class="btn">Retour à l'accueil</a>
    </div>
  `;
}

function doSearchFrom(inputId = "searchInput") {
  const q = document.getElementById(inputId).value.trim();
  if (q.length < 2) return alert("Minimum 2 caractères");
  location.href = `recherche.html?q=${encodeURIComponent(q)}`;
}
