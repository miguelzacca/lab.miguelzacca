export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

export const uid = (prefix = "id") => prefix + "_" + (globalThis.crypto?.randomUUID?.() || Date.now() + "_" + Math.random().toString(36).slice(2));
export const nowIso = () => new Date().toISOString();
export const debounce = (fn, delay = 500) => {
  let timer;
  let pendingArgs;
  const debounced = (...args) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...pendingArgs);
      pendingArgs = null;
    }, delay);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  debounced.flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    fn(...pendingArgs);
    pendingArgs = null;
  };
  return debounced;
};
export const formatNumber = (value, digits = 1) => value !== "" && value != null && Number.isFinite(Number(value))
  ? Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : "—";
export const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
export const slugify = (value) => String(value || "formulacao")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);

export function setPath(target, path, value) {
  const parts = path.split(".");
  const forbidden = new Set(["__proto__", "prototype", "constructor"]);
  if (!parts.length || parts.some((part) => forbidden.has(part))) throw new Error("Caminho de dados inválido.");
  let cursor = target;
  parts.slice(0, -1).forEach((part, index) => {
    const key = /^\d+$/.test(part) ? Number(part) : part;
    if (cursor[key] == null) cursor[key] = /^\d+$/.test(parts[index + 1]) ? [] : {};
    cursor = cursor[key];
  });
  const last = parts.at(-1);
  cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  return target;
}

export function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
