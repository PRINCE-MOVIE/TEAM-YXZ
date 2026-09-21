const API_BASE = "http://51.75.118.170:20041/api/v1";

// Plusieurs proxys CORS de secours : les proxys publics gratuits tombent
// souvent en rate-limit ou en timeout. Si le premier échoue, on tente
// automatiquement le suivant avant d'abandonner.
const PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?url=",
  "https://api.codetabs.com/v1/proxy?quest=",
];

async function api(path, params = {}, retries = PROXIES.length - 1) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
  });

  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const proxy = PROXIES[attempt % PROXIES.length];
    const proxyUrl = proxy + encodeURIComponent(url.toString());

    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) });
      const json = await res.json();

      if (!json.success) {
        const err = new Error(json.error?.message || "Erreur inconnue.");
        err.code = json.error?.code;
        throw err;
      }
      return json;
    } catch (e) {
      lastErr = e;
      // Petite pause avant de retenter avec le proxy suivant
      if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }

  const err = new Error(lastErr?.message || "Source indisponible. Réessaie dans un instant.");
  err.code = lastErr?.code || "source_unavailable";
  throw err;
}

/* =========================================================
   COMPTE (mock front-end uniquement)
   ⚠️ Pas de backend : tout est stocké en clair dans le
   localStorage du navigateur. C'est purement visuel/démo,
   ce n'est PAS un système d'authentification sécurisé.
   ========================================================= */
const AUTH_KEY = "pm_user";
const SESSION_KEY = "pm_session";

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
        <a href="parametres.html">⚙️ Paramètres</a>
        <button type="button" id="logoutBtn">🚪 Déconnexion</button>
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

renderAccountMenu();

const getSlug = (key = "slug") => new URLSearchParams(location.search).get(key);
const getParam = (key) => new URLSearchParams(location.search).get(key);

// Affiche un bandeau d'erreur discret SANS effacer le contenu déjà affiché
// (contrairement à showError qui remplace tout #app). Utile quand une
// requête échoue après qu'on ait déjà affiché des résultats.
function showRetryBanner(message, onRetry) {
  const old = document.getElementById("retry-banner");
  if (old) old.remove();

  const banner = document.createElement("div");
  banner.id = "retry-banner";
  banner.className = "retry-banner";
  banner.innerHTML = `
    <span>⚠️ ${message || "Erreur de connexion à la source."}</span>
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
  app.innerHTML = `
    <div class="error-box">
      <h2> erreur</h2>
      <p>${message}</p>
      <a href="index.html" class="btn">Retour à l'accueil</a>
    </div>
  `;
}

function doSearchFrom(inputId = "searchInput") {
  const q = document.getElementById(inputId).value.trim();
  if (q.length < 2) return alert("Minimum 2 caractères");
  location.href = `recherche.html?q=${encodeURIComponent(q)}`;
}
