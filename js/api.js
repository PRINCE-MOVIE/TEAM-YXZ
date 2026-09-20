const API = "http://51.75.118.170:20041/api/v1";

async function api(path, params = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") url.searchParams.set(k, v);
  });

  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    const err = new Error("Source indisponible");
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

// Helpers
const getSlug = (key = "slug") => new URLSearchParams(location.search).get(key);
const getParam = (key) => new URLSearchParams(location.search).get(key);

function showError(message) {
  document.getElementById("app").innerHTML = `
    <div class="error-box">
      <h2> Oups</h2>
      <p>${message}</p>
      <a href="index.html" class="btn">Retour à l'accueil</a>
    </div>
  `;
}
