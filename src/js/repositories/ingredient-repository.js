async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "Falha ao acessar ingredientes.");
    error.status = response.status;
    if (response.status === 401) window.dispatchEvent(new CustomEvent("lab:auth-required"));
    throw error;
  }
  return body;
}

export class IngredientRepository {
  list() { return request("/api/ingredients"); }
  save(profile) {
    return request("/api/ingredients", {
      method: profile.id ? "PUT" : "POST",
      body: JSON.stringify(profile)
    });
  }
}
