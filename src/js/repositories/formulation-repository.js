async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.error || "Falha de comunicação com o banco.");
    error.status = response.status;
    if (response.status === 401) window.dispatchEvent(new CustomEvent("lab:auth-required"));
    throw error;
  }
  return payload;
}

export class FormulationRepository {
  async list(filters = {}) {
    const query = new URLSearchParams();
    if (filters.archived) query.set("archived", "true");
    if (filters.favorite) query.set("favorite", "true");
    return request("/api/formulations?" + query);
  }
  async get(id) { return request("/api/formulations?id=" + encodeURIComponent(id)); }
  async save(record, source = "MANUAL") {
    return request("/api/formulations", { method: "POST", body: JSON.stringify({ record, source }) });
  }
  async archive(id, archived = true) {
    return request("/api/formulations", { method: "PUT", body: JSON.stringify({ action: "archive", id, archived }) });
  }
  async duplicate(id) {
    return request("/api/formulations", { method: "PUT", body: JSON.stringify({ action: "duplicate", id }) });
  }
  async remove(id) {
    return request("/api/formulations", { method: "DELETE", body: JSON.stringify({ id }) });
  }
}
