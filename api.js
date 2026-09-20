const API_BASE = "http://51.75.118.170:20041";
const PROXY = "https://api.allorigins.win/raw?url=";

async function api(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
  });

  const proxyUrl = PROXY + encodeURIComponent(url.toString());

  let res;
  try {
    res = await fetch(proxyUrl);
  } catch (e) {
    const err = new Error("Source indisponible. Réessaie dans un instant.");
    err.code = "source_unavailable";
    throw err;
  }

  const json = await res.json();

  if (!json.success) {
    const err = new Error(json.error.message);
    err.code = json.error.code;
    throw err;
  }
  return json;
}

const getSlug = (key = "slug") => new URLSearchParams(location.search).get(key);
const getParam = (key) => new URLSearchParams(location.search).get(key);

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
