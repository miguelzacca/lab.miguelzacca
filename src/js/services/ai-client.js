export class AiClient {
  constructor(baseUrl = "/api/ai") {
    this.baseUrl = baseUrl;
    this.controller = null;
  }
  cancel() {
    this.controller?.abort();
  }
  async request(action, input, formulationId) {
    this.cancel();
    this.controller = new AbortController();
    const response = await fetch(this.baseUrl + "/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ input, formulationId }),
      signal: this.controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new CustomEvent("lab:auth-required"));
      const error = new Error(payload.error || "Não foi possível concluir a solicitação.");
      error.status = response.status;
      throw error;
    }
    if (!Array.isArray(payload.suggestions)) throw new Error("A resposta recebida não tem o formato esperado.");
    return payload;
  }
}
