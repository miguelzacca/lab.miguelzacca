import { WorkspaceStore } from "../stores/workspace-store.js";
import { AiClient } from "../services/ai-client.js";
import { DOCUMENT_SECTIONS } from "../domain/models.js";
import { calculateComposition, normalizePercentages } from "../domain/calculations.js";
import { validateFormulation } from "../domain/validation.js";
import { renderDocument, printDocument } from "../pdf/document-renderer.js";
import { icon } from "../components/icons.js";
import { escapeHtml, formatDate, formatNumber, downloadJson, uid } from "../utils/core.js";

const app = document.querySelector("#app");
const overlayRoot = document.querySelector("#overlay-root");
const toastRoot = document.querySelector("#toast-root");
const fileInput = document.querySelector("#database-file");
const store = new WorkspaceStore();
const ai = new AiClient();
const ui = {
  search: "",
  ingredientSearch: "",
  status: "all",
  inspectorIndex: null,
  documentDrawer: false,
  paletteSelection: 0,
  pendingBackup: null,
  lastAiAction: "enhance"
};
let modalReturnFocus = null;
let previewFrame = null;

const aiFieldAllowed = (path) => [
  "title", "shortTitle", "technicalName", "subtitle", "description", "category", "formType",
  "presentation", "tags", "technicalNotes", "storageNotes"
].includes(path) || /^ingredients\.\d+\.(commonName|technicalName|pharmacopoeialDesignation|synonyms|cas|molecularFormula|role|physicalForm|grade|micronization|notes|source)$/.test(path);
const canEdit = () => Boolean(store.auth?.authenticated);
const safeImageSource = (source) => /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(String(source || "")) ? source : "";
const privateActions = new Set([
  "new-record", "toggle-favorite", "toggle-current-favorite", "add-ingredient", "remove-ingredient", "link-profile",
  "add-quality", "add-process", "add-label", "add-reference", "remove-list-item", "ask-normalize", "confirm-normalize",
  "remove-cover", "document-settings", "move-section", "open-ai", "run-ai", "run-custom-ai", "regenerate-ai",
  "accept-proposal", "accept-all-proposals", "new-profile", "edit-profile", "export-db", "import-db", "ask-clear-db",
  "confirm-clear-db", "set-theme", "set-density", "restore-revision", "ask-archive", "confirm-archive", "restore-record"
]);

const statusLabels = {
  DRAFT: "Rascunho",
  REVIEW: "Em revisão",
  APPROVED: "Aprovada",
  RETIRED: "Retirada"
};
const originLabels = {
  MANUAL: "M",
  CALCULATED: "C",
  AI_SUGGESTED: "AI",
  VERIFIED: "V"
};

function route() {
  const value = location.hash.replace(/^#\//, "") || "library";
  const parts = value.split("/");
  return { name: parts[0], id: parts[1] };
}

function toast(message, type = "") {
  const element = document.createElement("div");
  element.className = "toast " + type;
  element.textContent = message;
  toastRoot.append(element);
  setTimeout(() => element.remove(), 4200);
}

function openModal(content, wide = false) {
  if (!overlayRoot.firstElementChild) modalReturnFocus = document.activeElement;
  overlayRoot.innerHTML = '<div class="overlay"><section class="modal ' + (wide ? "wide" : "") + '" role="dialog" aria-modal="true" tabindex="-1">' + content + "</section></div>";
  const dialog = overlayRoot.querySelector(".modal");
  const heading = dialog?.querySelector("h1, h2");
  if (heading) {
    heading.id = heading.id || "modal-title-" + uid("dialog");
    dialog.setAttribute("aria-labelledby", heading.id);
  }
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => (overlayRoot.querySelector("[autofocus]") || overlayRoot.querySelector("input, textarea, button"))?.focus());
}

function closeModal() {
  ai.cancel();
  overlayRoot.innerHTML = "";
  document.body.classList.remove("modal-open");
  const focusTarget = modalReturnFocus;
  modalReturnFocus = null;
  requestAnimationFrame(() => focusTarget?.isConnected && focusTarget.focus());
}

function openLogin(message = "") {
  openModal(`<form id="login-form" autocomplete="on"><header class="modal-header"><div><p class="eyebrow">Private workspace</p><h2>Acesso do proprietário</h2></div><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">${icon("close")}</button></header><div class="modal-body login-body"><div class="login-monogram">MZ</div><p class="view-description">Entre para criar, editar e administrar o arquivo técnico. Não há cadastro público.</p>${message ? `<p class="inline-error" role="alert">${value(message)}</p>` : ""}<div class="field-grid"><div class="field span-12"><label for="login-username">Usuário</label><input id="login-username" name="username" autocomplete="username" required autofocus></div><div class="field span-12"><label for="login-password">Senha</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div></div></div><footer class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">Continuar em modo público</button><button type="submit" class="button primary">Entrar</button></footer></form>`);
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  store.auth = { authenticated: false, user: null };
  store.current = null;
  ui.inspectorIndex = null;
  ui.documentDrawer = false;
  location.hash = "#/library";
  await store.initialize();
  render();
  toast("Sessão privada encerrada.");
}

function value(input) {
  return escapeHtml(input == null ? "" : input);
}

function field(label, path, current, options = {}) {
  const span = options.span || 6;
  const type = options.type || "text";
  const hint = options.hint ? '<small class="field-hint">' + value(options.hint) + "</small>" : "";
  const transform = options.transform ? ' data-transform="' + options.transform + '"' : "";
  const locked = !canEdit() && path !== "noop";
  let control;
  if (options.options) {
    control = '<select data-field="' + path + '"' + (locked ? " disabled aria-disabled=\"true\"" : "") + '>' + options.options.map((entry) => '<option value="' + value(entry[0]) + '"' + (entry[0] === current ? " selected" : "") + ">" + value(entry[1]) + "</option>").join("") + "</select>";
  } else if (type === "textarea") {
    control = '<textarea data-field="' + path + '" placeholder="' + value(options.placeholder || "") + '"' + (locked ? " disabled aria-disabled=\"true\"" : "") + '>' + value(current) + "</textarea>";
  } else {
    control = '<input type="' + type + '" data-field="' + path + '" value="' + value(current) + '" placeholder="' + value(options.placeholder || "") + '"' + (options.step ? ' step="' + options.step + '"' : "") + transform + (locked ? " disabled aria-disabled=\"true\"" : "") + ">";
  }
  return '<div class="field span-' + span + '"><label>' + value(label) + "</label>" + control + hint + "</div>";
}

function section(number, title, content, action = "", note = "") {
  return '<section class="editor-section"><div class="section-heading"><span class="section-number">' + String(number).padStart(2, "0") + "</span><h2>" + value(title) + '</h2><div class="section-note">' + (canEdit() ? action || value(note) : value(note)) + "</div></div>" + content + "</section>";
}

function shell(content, active) {
  const nav = canEdit() ? [
    ["library", "library", "Library"],
    ["recent", "recent", "Recent"],
    ["favorites", "star", "Favorites"],
    ["ingredients", "flask", "Ingredients"],
    ["collections", "folder", "Collections"],
    ["archived", "archive", "Archived"]
  ] : [["library", "library", "Library"]];
  return `
    <div class="app-shell">
      <aside class="sidebar" aria-label="Navegação principal">
        <a class="brand" href="#/library">
          <span class="brand-mark">MZ</span>
          <span class="brand-name"><strong>Formulation Lab</strong>Private workspace</span>
        </a>
        <p class="nav-label">Workspace</p>
        <nav class="nav-list">
          ${nav.map((item) => `<a class="nav-link" href="#/${item[0]}" ${active === item[0] ? 'aria-current="page"' : ""}>${icon(item[1])}<span>${item[2]}</span></a>`).join("")}
        </nav>
        ${canEdit() ? `<div class="nav-separator"></div>
        <nav class="nav-list">
          <a class="nav-link" href="#/transfer">${icon("transfer")}<span>Import / Export</span></a>
          <a class="nav-link" href="#/settings" ${active === "settings" ? 'aria-current="page"' : ""}>${icon("settings")}<span>Settings</span></a>
        </nav>` : ""}
        <div class="sidebar-status">
          ${canEdit() ? `<div class="status-row"><i class="status-dot ${store.health?.database === "connected" ? "ok" : ""}"></i><span>PostgreSQL ${store.health?.database === "connected" ? "connected" : "offline"}</span></div><div class="status-row"><i class="status-dot ${store.health?.ai?.configured ? "ok" : ""}"></i><span>NVIDIA ${store.health?.ai?.configured ? "ready" : "not configured"}</span></div><button class="session-button" data-action="logout">Sair da sessão</button>` : `<div class="status-row"><i class="status-dot ok"></i><span>Arquivo público · leitura</span></div><button class="session-button" data-action="open-login">Entrar</button>`}
        </div>
      </aside>
      <main class="main" id="workspace" tabindex="-1">
        <div class="mobile-bar"><button class="icon-button" data-action="toggle-sidebar" aria-label="Abrir menu">${icon("menu")}</button><strong>FORMULATION LAB</strong><button class="icon-button" data-action="${canEdit() ? "open-palette" : "open-login"}" aria-label="${canEdit() ? "Abrir comandos" : "Entrar"}">${icon(canEdit() ? "search" : "settings")}</button></div>
        ${content}
      </main>
    </div>`;
}

function filteredRecords(kind, source = store.formulations) {
  const needle = ui.search.trim().toLowerCase();
  return source.filter((record) => {
    if (kind === "favorites" && !record.favorite) return false;
    if (kind === "recent" && Date.now() - new Date(record.updatedAt).getTime() > 30 * 86400000) return false;
    if (ui.status !== "all" && record.status !== ui.status) return false;
    if (!needle) return true;
    const haystack = [
      record.code, record.title, record.shortTitle, record.technicalName, record.description,
      ...(record.tags || []),
      ...(record.ingredients || []).flatMap((item) => [item.commonName, item.technicalName, item.cas, ...(item.synonyms || [])])
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

function compositionSummary(record) {
  const items = (record.ingredients || []).slice(0, 3).map((item) => {
    const percentage = item.percentageWW == null ? "" : " " + formatNumber(item.percentageWW) + "%";
    return (item.commonName || item.technicalName || "Ingrediente") + percentage;
  });
  if ((record.ingredients || []).length > 3) items.push("+" + (record.ingredients.length - 3) + " componentes");
  return items.join(" · ") || "Composição ainda não registrada";
}

function card(record) {
  const archived = Boolean(record.archivedAt);
  const cover = safeImageSource(record.coverImageData);
  const cardClass = `formulation-card ${cover ? "has-cover" : ""} ${archived ? "archived" : ""}`;
  const cardOpen = canEdit()
    ? `<article class="${cardClass}" data-action="open-record" data-id="${record.id}" tabindex="0" role="link" aria-label="Abrir ${value(record.title)}">`
    : `<a class="${cardClass}" href="#/formulation/${encodeURIComponent(record.id)}" aria-label="Abrir ${value(record.title)}">`;
  return `
    ${cardOpen}
      ${cover ? `<figure class="card-cover"><img src="${cover}" alt="${value(record.coverImageAlt)}"></figure>` : ""}
      <div class="card-top"><span>${value(record.code)}</span>${canEdit() ? `<span class="card-actions">${archived ? `<button class="favorite-button" data-action="restore-record" data-id="${record.id}" aria-label="Restaurar formulação" title="Restaurar">${icon("archive")}</button>` : `<button class="favorite-button ${record.favorite ? "active" : ""}" data-action="toggle-favorite" data-id="${record.id}" aria-label="${record.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}" aria-pressed="${record.favorite}">${icon("star")}</button>`}</span>` : '<span class="public-mark">READ ONLY</span>'}</div>
      <h2 class="card-title">${value(record.title)}</h2>
      <p class="card-subtitle">${value(record.technicalName || record.subtitle || record.formType || "Registro técnico")}</p>
      <p class="composition-line">${value(compositionSummary(record))}</p>
      <div class="tag-row">${(record.tags || []).slice(0, 3).map((tag) => '<span class="tag">' + value(tag) + "</span>").join("")}</div>
      <footer class="card-meta"><span>${value(record.formType || "Forma não definida")} · ${(record.ingredients || []).length} ingr.</span><span>${formatDate(record.updatedAt)}</span></footer>
    ${canEdit() ? "</article>" : "</a>"}`;
}

function libraryView(kind = "library") {
  const titles = {
    library: ["Formulation Library", "Arquivo técnico integral"],
    recent: ["Recent Activity", "Últimos 30 dias"],
    favorites: ["Favorites", "Índice selecionado"],
    collections: ["Collections", "Arquivo por coleção"],
    archived: ["Archived", "Registros preservados"]
  };
  const records = filteredRecords(kind, kind === "archived" ? store.archivedFormulations : store.formulations);
  const approved = store.formulations.filter((item) => item.status === "APPROVED").length;
  const viewMode = store.settings.libraryView || "grid";
  const empty = `
    <div class="empty-state"><div><span class="empty-state-index">${kind === "archived" ? "∅" : "00"}</span><h2>${ui.search ? "Nenhum registro encontrado" : kind === "archived" ? "Arquivo sem itens" : "O arquivo está pronto"}</h2>
    <p>${ui.search ? "Ajuste a busca ou os filtros para ampliar o resultado." : kind === "archived" ? "Formulações arquivadas permanecem preservadas e poderão ser restauradas aqui." : "Crie a primeira formulação para começar um registro técnico com composição, embalagem e documentação."}</p>
    ${ui.search || kind === "archived" ? "" : '<button class="button primary" data-action="new-record">' + icon("plus") + " Nova formulação</button>"}</div></div>`;
  const grid = '<div class="index-grid">' + records.map(card).join("") + "</div>";
  const table = `
    <div class="technical-table-wrap"><table class="technical-table">
      <thead><tr><th>Código</th><th>Formulação</th><th>Forma</th><th>Composição</th><th>Status</th><th class="numeric">Atualização</th></tr></thead>
      <tbody>${records.map((record) => `<tr data-action="open-record" data-id="${record.id}" tabindex="0"><td>${value(record.code)}</td><td><strong>${value(record.title)}</strong><br><span>${value(record.technicalName)}</span></td><td>${value(record.formType)}</td><td>${value(compositionSummary(record))}</td><td>${value(statusLabels[record.status])}</td><td class="numeric">${formatDate(record.updatedAt)}</td></tr>`).join("")}</tbody>
    </table></div>`;
  return `
    <section class="view library-view">
      <header class="view-heading">
        <div><p class="eyebrow">${value(titles[kind]?.[1] || "Arquivo técnico")}</p><h1 class="display-title">${value(titles[kind]?.[0] || "Formulation Library")}</h1><p class="view-description">${records.length} formulações no recorte atual. Pesquisa indexada por título, ingrediente, CAS, tag, nome técnico, código e descrição.</p></div>
        <div class="heading-aside"><div class="metric"><strong>${store.formulations.length}</strong><span>Total</span></div><div class="metric"><strong>${approved}</strong><span>Aprovadas</span></div></div>
      </header>
      <div class="toolbar">
        <label class="search-field">${icon("search")}<input id="library-search" value="${value(ui.search)}" placeholder="Pesquisar arquivo técnico" aria-label="Pesquisar formulações"><kbd>⌘ K</kbd></label>
        <select class="filter-select" id="status-filter" aria-label="Filtrar por status">
          <option value="all">Todos os status</option>
          ${Object.entries(statusLabels).map((entry) => '<option value="' + entry[0] + '"' + (ui.status === entry[0] ? " selected" : "") + ">" + entry[1] + "</option>").join("")}
        </select>
        <div class="segmented" aria-label="Modo de visualização">
          <button class="${viewMode === "grid" ? "active" : ""}" data-action="set-view" data-view="grid" aria-label="Grade editorial">${icon("grid")}</button>
          <button class="${viewMode === "table" ? "active" : ""}" data-action="set-view" data-view="table" aria-label="Tabela técnica">${icon("table")}</button>
        </div>
        ${canEdit() ? `<button class="button primary" data-action="new-record">${icon("plus")} Nova formulação</button>` : '<button class="button" data-action="open-login">Entrar no workspace</button>'}
      </div>
      ${records.length ? (viewMode === "grid" ? grid : table) : empty}
    </section>`;
}

function compositionTable(record) {
  return `
    <div class="composition-editor technical-table-wrap">
      <table class="technical-table">
        <thead><tr><th>Ingrediente</th><th>Nome técnico</th><th>CAS</th><th>Função</th><th class="numeric">% p/p</th><th class="numeric">Por lote</th><th class="numeric">Por unidade</th><th>Origem</th><th></th></tr></thead>
        <tbody>
          ${record.ingredients.map((item, index) => `
            <tr data-action="inspect-ingredient" data-index="${index}">
              <td><input class="cell-input name" data-field="ingredients.${index}.commonName" value="${value(item.commonName)}" aria-label="Ingrediente" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></td>
              <td><input class="cell-input" data-field="ingredients.${index}.technicalName" value="${value(item.technicalName)}" aria-label="Nome técnico" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></td>
              <td><input class="cell-input" data-field="ingredients.${index}.cas" value="${value(item.cas)}" aria-label="CAS" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></td>
              <td><input class="cell-input" data-field="ingredients.${index}.role" value="${value(item.role)}" aria-label="Função" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></td>
              <td><input class="cell-input" type="number" step="any" data-field="ingredients.${index}.percentageWW" value="${value(item.percentageWW)}" aria-label="Percentual" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></td>
              <td><div class="inline-unit"><input class="cell-input" type="number" step="any" data-field="ingredients.${index}.batchQuantity" value="${value(item.batchQuantity)}" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}><input class="cell-input unit" data-field="ingredients.${index}.batchUnit" value="${value(item.batchUnit)}" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></div></td>
              <td><div class="inline-unit"><input class="cell-input" type="number" step="any" data-field="ingredients.${index}.unitQuantity" value="${value(item.unitQuantity)}" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}><input class="cell-input unit" data-field="ingredients.${index}.unitQuantityUnit" value="${value(item.unitQuantityUnit)}" ${canEdit() ? "" : "disabled aria-disabled=\"true\""}></div></td>
              <td><span class="origin-mark" title="${value(item.metadataOrigin)}">${originLabels[item.metadataOrigin] || "M"}</span></td>
              <td><div class="row-actions"><button class="icon-button" data-action="inspect-ingredient" data-index="${index}" aria-label="Abrir detalhes do ingrediente">${icon("more")}</button>${canEdit() ? `<button class="icon-button" data-action="remove-ingredient" data-index="${index}" aria-label="Remover ingrediente">${icon("trash")}</button>` : ""}</div></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function validationBlock(record) {
  const validation = validateFormulation(record);
  if (!validation.findings.length) return '<div class="validation-list"><div class="validation-item"><i class="signal" style="background:var(--success)"></i><div><strong>Composição consistente</strong><span>As relações determinísticas verificadas estão coerentes.</span></div></div></div>';
  return '<div class="validation-list">' + validation.findings.slice(0, 6).map((finding) => `
    <div class="validation-item ${finding.level}"><i class="signal"></i><div><strong>${value(finding.title)}</strong><span>${value(finding.detail)}</span></div>
    ${finding.action === "normalize" && canEdit() ? '<button class="button small" data-action="ask-normalize">Normalizar matematicamente</button>' : ""}</div>`).join("") + "</div>";
}

function repeatRows(name, rows, kind) {
  if (!rows.length) return '<p class="section-note">Nenhum registro nesta seção.</p>';
  return '<div class="repeat-list">' + rows.map((item, index) => {
    if (kind === "quality") return `
      <div class="repeat-row quality">
        ${field("Métrica", name + "." + index + ".metric", item.metric, { span: 12 })}
        ${field("Operador", name + "." + index + ".operator", item.operator, { span: 12 })}
        ${field("Valor-alvo", name + "." + index + ".targetValue", item.targetValue, { span: 12 })}
        ${field("Unidade", name + "." + index + ".unit", item.unit, { span: 12 })}
        ${field("Plano de amostragem", name + "." + index + ".samplingPlan", item.samplingPlan, { span: 12 })}
        ${field("Status", name + "." + index + ".status", item.status, { span: 12 })}
        ${field("Notas", name + "." + index + ".notes", item.notes, { span: 12 })}
        ${canEdit() ? `<button class="icon-button" data-action="remove-list-item" data-list="${name}" data-index="${index}" aria-label="Remover">${icon("trash")}</button>` : ""}
      </div>`;
    if (kind === "process") return `
      <div class="repeat-row process">
        ${field("Etapa", name + "." + index + ".stageTitle", item.stageTitle, { span: 12 })}
        ${field("Equipamento", name + "." + index + ".equipment", item.equipment, { span: 12 })}
        ${field("Parâmetro", name + "." + index + ".parameterName", item.parameterName, { span: 12 })}
        ${field("Valor informado", name + "." + index + ".parameterValue", item.parameterValue, { span: 12 })}
        ${field("Unidade", name + "." + index + ".parameterUnit", item.parameterUnit, { span: 12 })}
        ${field("Notas", name + "." + index + ".notes", item.notes, { span: 12 })}
        ${canEdit() ? `<button class="icon-button" data-action="remove-list-item" data-list="${name}" data-index="${index}" aria-label="Remover">${icon("trash")}</button>` : ""}
      </div>`;
    return `
      <div class="repeat-row">
        ${field(kind === "label" ? "Campo" : "Título", name + "." + index + "." + (kind === "label" ? "label" : "title"), item[kind === "label" ? "label" : "title"], { span: 12 })}
        ${field(kind === "label" ? "Valor" : "Localizador", name + "." + index + "." + (kind === "label" ? "value" : "locator"), item[kind === "label" ? "value" : "locator"], { span: 12 })}
        ${kind === "reference" ? field("URL", name + "." + index + ".url", item.url, { span: 12 }) + field("Notas", name + "." + index + ".notes", item.notes, { span: 12 }) : '<label class="toggle-row"><span>Incluir</span><input type="checkbox" data-field="' + name + "." + index + '.include"' + (item.include !== false ? " checked" : "") + (canEdit() ? "" : " disabled") + "></label>"}
        <span></span>
        ${canEdit() ? `<button class="icon-button" data-action="remove-list-item" data-list="${name}" data-index="${index}" aria-label="Remover">${icon("trash")}</button>` : ""}
      </div>`;
  }).join("") + "</div>";
}

function editorView(record) {
  const totals = calculateComposition(record);
  const pack = record.packaging || {};
  const cover = safeImageSource(record.coverImageData);
  const previewPages = renderDocument(record);
  return `
    <section class="view editor-view ${canEdit() ? "" : "readonly"}">
      <header class="editor-header">
        <a href="#/library" class="icon-button back-link" aria-label="Voltar à biblioteca">${icon("arrowLeft")}</a>
        <div class="record-identity"><strong>${value(record.title)}</strong><span>${value(record.code)} · r${record.revisionNumber}</span></div>
        <span class="save-state ${store.saveState}" data-save-state aria-live="polite">${store.saveState === "saved" ? "Saved" : store.saveState === "saving" ? "Saving" : store.saveState === "error" ? "Error" : "Unsaved"}</span>
        ${canEdit() ? `<button class="button ghost" data-action="open-ai">${icon("spark")} <span>Enhance</span></button>` : '<span class="read-only-state">PUBLIC · READ ONLY</span>'}
        <button class="icon-button" data-action="toggle-preview" aria-label="Abrir prévia">${icon("eye")}</button>
        <button class="icon-button" data-action="print" aria-label="Imprimir ou exportar PDF">${icon("print")}</button>
        ${canEdit() && !record.id.startsWith("draft_") ? `<button class="icon-button" data-action="ask-archive" aria-label="${record.archivedAt ? "Restaurar formulação" : "Arquivar formulação"}">${icon("archive")}</button>` : ""}
        ${canEdit() ? `<button class="icon-button" data-action="document-settings" aria-label="Configurar documento">${icon("sliders")}</button>` : ""}
      </header>
      <div class="editor-layout">
        <div class="record-editor">
          <header class="editor-intro">
            <div><p class="eyebrow">${canEdit() ? "Registro técnico editável" : "Consulta técnica pública"}</p><h1>${value(record.title)}</h1><p>${value(record.description || (canEdit() ? "Estruture o registro, valide as relações quantitativas e componha a ficha técnica." : "Visualização integral do registro e de sua documentação técnica."))}</p></div>
            <div class="revision-block"><strong>${String(record.revisionNumber).padStart(2, "0")}</strong><span>Revisão</span></div>
          </header>
          ${section(1, "Overview", `
            <div class="field-grid">
              ${field("Código interno", "code", record.code, { span: 4 })}
              ${field("Status", "status", record.status, { span: 4, options: Object.entries(statusLabels) })}
              ${field("Data do documento", "documentDate", record.documentDate, { span: 4, type: "date" })}
              ${field("Título", "title", record.title, { span: 8 })}
              ${field("Título curto", "shortTitle", record.shortTitle, { span: 4 })}
              ${field("Nome técnico", "technicalName", record.technicalName, { span: 8 })}
              ${field("Subtítulo", "subtitle", record.subtitle, { span: 4 })}
              ${field("Descrição", "description", record.description, { span: 12, type: "textarea" })}
              ${field("Tags", "tags", (record.tags || []).join(", "), { span: 12, transform: "csv", hint: "Separe por vírgulas." })}
            </div>
            ${canEdit() || cover ? `<div class="cover-editor ${cover ? "has-image" : ""}">${cover ? `<figure class="cover-preview"><img src="${cover}" alt="${value(record.coverImageAlt)}">${canEdit() ? `<button data-action="remove-cover" aria-label="Remover capa">${icon("close")}</button>` : ""}</figure>` : '<div class="cover-preview"></div>'}${canEdit() ? `<div class="cover-drop"><label for="cover-file">${icon("image")}<br><strong>${record.coverImageData ? "Substituir foto de capa" : "Adicionar foto de capa"}</strong><br><span>PNG, JPEG ou WebP · até 2 MB após otimização</span></label><input id="cover-file" type="file" accept="image/png,image/jpeg,image/webp"></div>` : ""}</div>` : ""}
            <div class="field-grid" style="margin-top:16px">${field("Texto alternativo da capa", "coverImageAlt", record.coverImageAlt, { span: 12 })}</div>
          `)}
          ${section(2, "Composition", compositionTable(record), '<button class="button small" data-action="add-ingredient">' + icon("plus") + " Adicionar ingrediente</button>")}
          ${validationBlock(record)}
          ${section(3, "Quantitative Map", `
            <div class="quant-hero">
              <div class="quant-metric"><span>Total percentual</span><strong>${formatNumber(totals.percentageTotal)}%</strong></div>
              <div class="quant-metric"><span>Total calculado do lote</span><strong>${totals.batchTotal == null ? "—" : formatNumber(totals.batchTotal) + " " + value(record.batch.unit)}</strong></div>
              <div class="quant-metric"><span>Equivalência fracionada</span><strong>${totals.fractionTotal == null ? "—" : formatNumber(totals.fractionTotal) + " " + value(record.batch.containerUnit)}</strong></div>
            </div>
            <div class="field-grid" style="margin-top:24px">
              ${field("Total do lote", "batch.total", record.batch.total, { span: 3, type: "number", step: "any" })}
              ${field("Unidade", "batch.unit", record.batch.unit, { span: 3 })}
              ${field("Número de recipientes", "batch.containerCount", record.batch.containerCount, { span: 3, type: "number" })}
              ${field("Quantidade por recipiente", "batch.amountPerContainer", record.batch.amountPerContainer, { span: 3, type: "number", step: "any" })}
            </div>`)}
          ${section(4, "Presentation", `<div class="field-grid">
            ${field("Quantidade", "batch.containerCount", record.batch.containerCount, { span: 3, type: "number" })}
            ${field("Conteúdo", "batch.amountPerContainer", record.batch.amountPerContainer, { span: 3, type: "number", step: "any" })}
            ${field("Fracionamento / unidade", "batch.containerUnit", record.batch.containerUnit, { span: 3 })}
            ${field("Apresentação", "presentation", record.presentation, { span: 3 })}
            ${field("Forma", "formType", record.formType, { span: 4 })}
            ${field("Via", "route", record.route, { span: 4 })}
            ${field("Categoria", "category", record.category, { span: 4 })}
          </div>`)}
          ${section(5, "Packaging", `<div class="field-grid">
            ${field("Tipo de recipiente", "packaging.containerType", pack.containerType, { span: 4 })}
            ${field("Material", "packaging.containerMaterial", pack.containerMaterial, { span: 4 })}
            ${field("Quantidade", "packaging.containerCount", pack.containerCount, { span: 4, type: "number" })}
            ${field("Conteúdo líquido", "packaging.netContent", pack.netContent, { span: 4 })}
            ${field("Fechamento", "packaging.closureType", pack.closureType, { span: 4 })}
            ${field("Lacre", "packaging.sealType", pack.sealType, { span: 4 })}
            ${field("Controle de fluxo", "packaging.flowControl", pack.flowControl, { span: 4 })}
            ${field("Proteção à umidade", "packaging.moistureProtection", pack.moistureProtection, { span: 4 })}
            ${field("Proteção à luz", "packaging.lightProtection", pack.lightProtection, { span: 4 })}
            ${field("Observações", "packaging.packagingNotes", pack.packagingNotes, { span: 12, type: "textarea" })}
          </div>`)}
          ${section(6, "Quality", repeatRows("qualityRecords", record.qualityRecords, "quality"), '<button class="button small" data-action="add-quality">' + icon("plus") + " Métrica</button>", "Limites são sempre informados pelo usuário.")}
          ${section(7, "Process Metadata", repeatRows("processMetadata", record.processMetadata, "process"), '<button class="button small" data-action="add-process">' + icon("plus") + " Etapa</button>")}
          ${section(8, "Labeling", repeatRows("labelingFields", record.labelingFields, "label"), '<button class="button small" data-action="add-label">' + icon("plus") + " Campo</button>")}
          ${section(9, "Technical Notes", `<div class="field-grid">
            ${field("Notas técnicas", "technicalNotes", record.technicalNotes, { span: 12, type: "textarea" })}
            ${field("Conservação / armazenamento", "storageNotes", record.storageNotes, { span: 12, type: "textarea" })}
          </div>`)}
          ${section(10, "References", repeatRows("references", record.references, "reference"), '<button class="button small" data-action="add-reference">' + icon("plus") + " Referência</button>")}
          ${section(11, "History", historyView(record), "", (record.revisions || []).length + " eventos preservados")}
        </div>
        <aside class="preview-panel">
          <div class="preview-toolbar"><div><strong>Live document</strong><br><span>A4 · ${value(record.documentSettings?.density || "STANDARD")}</span></div><div class="preview-toolbar-actions"><button class="button small" data-action="print">${icon("print")} Export PDF</button><button class="icon-button preview-close" data-action="toggle-preview" aria-label="Fechar prévia">${icon("close")}</button></div></div>
          <div class="preview-canvas">${previewPages}</div>
        </aside>
      </div>
      ${ui.inspectorIndex != null || ui.documentDrawer ? '<button class="drawer-scrim" data-action="close-drawers" aria-label="Fechar painel contextual"></button>' : ""}
      ${ui.inspectorIndex != null ? ingredientInspector(record, ui.inspectorIndex) : ""}
      ${ui.documentDrawer ? documentSettingsDrawer(record) : ""}
    </section>`;
}

function historyView(record) {
  if (!record.revisions?.length) return '<p class="section-note">A primeira revisão será registrada ao salvar.</p>';
  return `<div class="technical-table-wrap"><table class="technical-table"><thead><tr><th>Data</th><th>Origem</th><th>Campos modificados</th><th></th></tr></thead><tbody>
    ${record.revisions.map((revision) => `<tr><td>${formatDate(revision.createdAt)}</td><td>${value(revision.source)}</td><td>${value((revision.modifiedFields || []).join(", "))}</td><td>${canEdit() ? `<button class="button small" data-action="view-revision" data-id="${revision.id}">Ver anterior</button>` : ""}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function ingredientInspector(record, index) {
  const item = record.ingredients[index];
  if (!item) return "";
  return `
    <aside class="ingredient-inspector" role="dialog" aria-modal="true" aria-label="Inspetor do ingrediente">
      <header class="drawer-header"><div><p class="eyebrow">Ingrediente ${String(index + 1).padStart(2, "0")}</p><h2>${value(item.commonName || "Sem nome")}</h2></div><button class="icon-button" data-action="close-inspector" aria-label="Fechar">${icon("close")}</button></header>
      <div class="drawer-group"><h3>Link de metadados</h3>${field("Perfil reutilizável", "noop", item.ingredientId || "", { span: 12, options: [["", "Selecionar perfil"], ...store.ingredients.map((profile) => [profile.id, profile.canonicalName])] }).replace('data-field="noop"', 'id="profile-link"')}<button class="button small" data-action="link-profile" data-index="${index}">Vincular perfil</button></div>
      <div class="drawer-group"><h3>General</h3><div class="field-grid">${field("Nome comum", "ingredients." + index + ".commonName", item.commonName, { span: 12 })}${field("Nome técnico", "ingredients." + index + ".technicalName", item.technicalName, { span: 12 })}${field("Designação farmacopeica", "ingredients." + index + ".pharmacopoeialDesignation", item.pharmacopoeialDesignation, { span: 12 })}</div></div>
      <div class="drawer-group"><h3>Identifiers</h3><div class="field-grid">${field("CAS", "ingredients." + index + ".cas", item.cas, { span: 6 })}${field("Fórmula molecular", "ingredients." + index + ".molecularFormula", item.molecularFormula, { span: 6 })}${field("Sinônimos", "ingredients." + index + ".synonyms", (item.synonyms || []).join(", "), { span: 12, transform: "csv" })}</div></div>
      <div class="drawer-group"><h3>Metadata</h3><div class="field-grid">${field("Forma física", "ingredients." + index + ".physicalForm", item.physicalForm, { span: 6 })}${field("Grau", "ingredients." + index + ".grade", item.grade, { span: 6 })}${field("Micronização", "ingredients." + index + ".micronization", item.micronization, { span: 6 })}${field("Verificação", "ingredients." + index + ".verificationStatus", item.verificationStatus, { span: 6, options: [["UNVERIFIED","Não verificado"],["REVIEWED","Revisado"],["VERIFIED","Verificado"]] })}</div></div>
      <div class="drawer-group"><h3>Notes & provenance</h3><div class="field-grid">${field("Fonte", "ingredients." + index + ".source", item.source, { span: 12 })}${field("Notas", "ingredients." + index + ".notes", item.notes, { span: 12, type: "textarea" })}</div></div>
    </aside>`;
}

function documentSettingsDrawer(record) {
  const settings = record.documentSettings;
  return `
    <aside class="document-drawer" role="dialog" aria-modal="true" aria-label="Configurações do documento">
      <header class="drawer-header"><div><p class="eyebrow">Composição editorial</p><h2>Documento</h2></div><button class="icon-button" data-action="close-document-settings" aria-label="Fechar">${icon("close")}</button></header>
      <div class="drawer-group"><h3>Formato</h3><div class="field-grid">
        ${field("Idioma", "documentSettings.language", settings.language, { span: 6, options: [["pt-BR","Português"],["en","English"]] })}
        ${field("Densidade", "documentSettings.density", settings.density, { span: 3, options: [["STANDARD","Standard"],["COMPACT","Compact"]] })}
        ${field("Página", "documentSettings.pageSize", settings.pageSize || "A4", { span: 3, options: [["A4","A4"],["LETTER","Letter"]] })}
      </div></div>
      <div class="drawer-group"><h3>Exibição</h3>
        ${[["showCoverImage","Foto de capa"],["showCas","Coluna CAS"],["showSynonyms","Sinônimos"],["showProvenance","Proveniência"],["showTechnicalNotes","Notas técnicas"],["showRevisionHistory","Histórico de revisão"]].map((entry) => `<label class="toggle-row"><span>${entry[1]}</span><input type="checkbox" data-field="documentSettings.${entry[0]}" ${settings[entry[0]] ? "checked" : ""}></label>`).join("")}
      </div>
      <div class="drawer-group"><h3>Ordem das seções</h3>
        ${settings.sectionOrder.map((key, index) => {
          const label = DOCUMENT_SECTIONS.find((entry) => entry[0] === key)?.[1] || key;
          return `<div class="section-order-row"><input type="checkbox" data-field="documentSettings.enabledSections.${key}" ${settings.enabledSections[key] !== false ? "checked" : ""}><span>${value(label)}</span><button data-action="move-section" data-index="${index}" data-direction="-1" aria-label="Mover para cima">${icon("chevronUp")}</button><button data-action="move-section" data-index="${index}" data-direction="1" aria-label="Mover para baixo">${icon("chevronDown")}</button></div>`;
        }).join("")}
      </div>
      <div class="drawer-group"><button class="button primary" data-action="print">${icon("print")} Exportar PDF</button></div>
    </aside>`;
}

function ingredientsView() {
  const needle = ui.ingredientSearch.trim().toLowerCase();
  const profiles = store.ingredients.filter((profile) => !needle || [profile.canonicalName, profile.technicalName, profile.cas, profile.molecularFormula, profile.classification, ...(profile.synonyms || [])].filter(Boolean).join(" ").toLowerCase().includes(needle));
  return `
    <section class="view ingredients-view">
      <header class="view-heading"><div><p class="eyebrow">Chemical metadata index</p><h1 class="display-title">Ingredients</h1><p class="view-description">Perfis reutilizáveis com identidade química, sinônimos, fonte e estado de verificação.</p></div><button class="button primary" data-action="new-profile">${icon("plus")} Novo ingrediente</button></header>
      <div class="toolbar"><label class="search-field">${icon("search")}<input id="ingredient-search" value="${value(ui.ingredientSearch)}" placeholder="Nome, CAS ou sinônimo" aria-label="Pesquisar ingredientes"><span class="search-count">${profiles.length}</span></label></div>
      ${profiles.length ? `<div class="ingredient-grid">${profiles.map((profile) => {
        const records = store.formulations.filter((record) => record.ingredients?.some((item) => item.ingredientId === profile.id));
        return `<article class="ingredient-index-item" data-action="edit-profile" data-id="${profile.id}" tabindex="0"><div class="card-top"><span>${value(profile.verificationStatus)}</span><span>${profile.usageCount || records.length} usos</span></div><h2>${value(profile.canonicalName)}</h2><p>${value(profile.technicalName || profile.classification || "Metadados técnicos")}</p><div class="ingredient-index-meta"><span>CAS · ${value(profile.cas)}</span><span>${value(profile.molecularFormula)}</span><span style="grid-column:1/-1">Em: ${value(records.map((item) => item.code).join(", ") || "nenhuma formulação")}</span></div></article>`;
      }).join("")}</div>` : '<div class="empty-state"><div><span class="empty-state-index">∅</span><h2>Nenhum perfil químico</h2><p>Crie perfis reutilizáveis para vincular metadados sem duplicação.</p></div></div>'}
    </section>`;
}

function settingsView() {
  const appearance = store.settings.appearance;
  return `
    <section class="view settings-view">
      <header class="view-heading"><div><p class="eyebrow">Workspace configuration</p><h1 class="display-title">Settings</h1><p class="view-description">Preferências do ambiente, documento, inteligência e dados.</p></div></header>
      <div class="settings-layout">
        <nav class="settings-index" aria-label="Seções de configurações"><button data-action="scroll-settings" data-target="appearance">Appearance</button><button data-action="scroll-settings" data-target="document">Document</button><button data-action="scroll-settings" data-target="ai">AI</button><button data-action="scroll-settings" data-target="data">Data</button><button data-action="scroll-settings" data-target="developer">Developer</button></nav>
        <div>
          <section class="settings-section" id="appearance"><p class="eyebrow">01</p><h2>Appearance</h2><p>O documento permanece em papel mesmo quando o workspace usa modo escuro.</p><div class="choice-row">
            ${[["light","Light","Ambiente claro"],["dark","Dark","Ambiente escuro"],["system","System","Seguir dispositivo"]].map((item) => `<button class="choice ${appearance === item[0] ? "active" : ""}" data-action="set-theme" data-value="${item[0]}" aria-pressed="${appearance === item[0]}"><strong>${item[1]}</strong><span>${item[2]}</span></button>`).join("")}
          </div></section>
          <section class="settings-section" id="document"><p class="eyebrow">02</p><h2>Document</h2><p>Padrões aplicados a novas formulações.</p><div class="choice-row">
            ${[["STANDARD","Standard"],["COMPACT","Compact"]].map((item) => `<button class="choice ${store.settings.documentDefaults.density === item[0] ? "active" : ""}" data-action="set-density" data-value="${item[0]}" aria-pressed="${store.settings.documentDefaults.density === item[0]}"><strong>${item[1]}</strong><span>A4 · Português</span></button>`).join("")}
          </div></section>
          <section class="settings-section" id="ai"><p class="eyebrow">03</p><h2>AI</h2><p>NVIDIA NIM executa apenas propostas contextuais. Nenhuma sugestão substitui dados sem aceite.</p><div class="ingredient-index-meta"><span>Provider</span><strong>NVIDIA NIM</strong><span>Modelo</span><strong>${value(store.health?.ai?.model)}</strong><span>Status</span><strong>${store.health?.ai?.configured ? "Configured" : "Awaiting API key"}</strong></div><br><button class="button" data-action="test-ai">Test connection</button></section>
          <section class="settings-section" id="data"><p class="eyebrow">04</p><h2>Data</h2><p>Backup completo do banco exclusivo do Lab. A substituição exige confirmação explícita.</p><div class="choice-row"><button class="button" data-action="export-db">${icon("transfer")} Export JSON</button><button class="button" data-action="import-db">Import JSON</button><button class="button danger" data-action="ask-clear-db">Clear Lab database</button></div></section>
          <section class="settings-section" id="developer"><p class="eyebrow">05</p><h2>Developer</h2><div class="ingredient-index-meta"><span>Schema</span><strong>1</strong><span>Database</span><strong>${value(store.health?.database)}</strong><span>Project</span><strong>lab.miguelzacca</strong><span>API</span><strong>${store.health?.ok ? "Healthy" : "Unavailable"}</strong></div></section>
        </div>
      </div>
    </section>`;
}

function transferView() {
  return `
    <section class="view settings-view">
      <header class="view-heading"><div><p class="eyebrow">Portable archive</p><h1 class="display-title">Import / Export</h1><p class="view-description">Transfira o arquivo técnico com validação, resumo e resolução explícita de conflitos.</p></div></header>
      <div class="settings-layout"><div></div><div><section class="settings-section"><h2>Export database</h2><p>Inclui formulações, ingredientes, coleções, configurações e versão do schema.</p><button class="button primary" data-action="export-db">Export JSON</button></section><section class="settings-section"><h2>Restore database</h2><p>O arquivo é validado antes de qualquer gravação. Em conflitos, você escolhe entre mesclar ou substituir.</p><button class="button" data-action="import-db">Select JSON file</button></section></div></div>
    </section>`;
}

function render() {
  const currentRoute = route();
  let content;
  const privateRoute = ["recent", "favorites", "collections", "archived", "ingredients", "settings", "transfer"].includes(currentRoute.name);
  if (privateRoute && !canEdit()) content = `<section class="view access-view"><div class="access-panel"><span class="boot-mark">MZ</span><p class="eyebrow">Private formulation workspace</p><h1 class="display-title">Área reservada.</h1><p class="view-description">A biblioteca pública permanece disponível para consulta. Entre como proprietário para acessar ferramentas de edição e administração.</p><div class="access-actions"><a class="button" href="#/library">Voltar à biblioteca</a><button class="button primary" data-action="open-login">Entrar</button></div></div></section>`;
  else if (["library", "recent", "favorites", "collections", "archived"].includes(currentRoute.name)) content = libraryView(currentRoute.name);
  else if (currentRoute.name === "ingredients") content = ingredientsView();
  else if (currentRoute.name === "settings") content = settingsView();
  else if (currentRoute.name === "transfer") content = transferView();
  else if (currentRoute.name === "formulation" && store.current) content = editorView(store.current);
  else content = libraryView("library");
  app.innerHTML = shell(content, currentRoute.name);
  app.setAttribute("aria-busy", "false");
  document.body.classList.toggle("drawer-open", ui.inspectorIndex != null || ui.documentDrawer);
}

function updatePreview() {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(updatePreviewNow);
}

function updatePreviewNow() {
  const canvas = document.querySelector(".preview-canvas");
  if (canvas && store.current) canvas.innerHTML = renderDocument(store.current);
  const save = document.querySelector("[data-save-state]");
  if (save) {
    save.className = "save-state " + store.saveState;
    save.textContent = store.saveState === "saved" ? "Saved" : store.saveState === "saving" ? "Saving" : store.saveState === "error" ? "Error" : "Unsaved";
  }
}

function openPalette() {
  const commands = [
    ["new-record", "New formulation", "N"],
    ["search", "Search formulation", "/"],
    ["open-ingredients", "Open ingredients", "I"],
    ["print", "Export current PDF", "P"],
    ["duplicate", "Duplicate formulation", "D"],
    ["toggle-current-favorite", "Toggle favorite", "F"],
    ["ai-enhance", "Run AI enhancement", "AI"],
    ["open-settings", "Open settings", "S"],
    ["import-db", "Import database", ""],
    ["export-db", "Export database", ""]
  ];
  ui.paletteSelection = 0;
  const needsRecord = new Set(["print", "duplicate", "toggle-current-favorite", "ai-enhance"]);
  openModal(`<section class="palette"><input class="palette-search" id="palette-search" placeholder="Digite um comando ou instrução…" aria-label="Paleta de comandos" autocomplete="off"><div class="palette-list" role="listbox">${commands.map((item, index) => `<button class="palette-item ${index === 0 ? "selected" : ""}" data-action="palette-command" data-command="${item[0]}" role="option" aria-selected="${index === 0}" ${needsRecord.has(item[0]) && !store.current ? "disabled" : ""}><span><strong>${item[1]}</strong><span>${item[0].startsWith("ai") ? "Contextual intelligence" : "Workspace command"}</span></span><kbd>${item[2]}</kbd></button>`).join("")}<button class="palette-item" data-action="custom-ai" role="option" ${!store.current ? "disabled" : ""}><span><strong>Ask Enhance…</strong><span>Use a instrução digitada para criar uma proposta</span></span><kbd>↵</kbd></button></div></section>`);
}

function openAiMenu() {
  const actions = [
    ["enhance", "Improve title and description"],
    ["names", "Suggest alternative technical names"],
    ["normalize", "Normalize ingredient terminology"],
    ["metadata", "Find likely chemical metadata"],
    ["enhance", "Suggest tags"],
    ["enhance", "Organize technical notes"]
  ];
  openModal(`<header class="modal-header"><div><p class="eyebrow">Contextual intelligence</p><h2>Enhance</h2></div><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><p class="view-description">A IA cria uma proposta comparável. Os dados atuais permanecem intactos até seu aceite.</p><div class="palette-list">${actions.map((item) => `<button class="palette-item" data-action="run-ai" data-ai-action="${item[0]}" data-instruction="${value(item[1])}"><span><strong>${value(item[1])}</strong><span>Proposal only</span></span>${icon("spark")}</button>`).join("")}</div><div class="field"><label>Instrução personalizada</label><textarea id="custom-ai-instruction" placeholder="Ex.: Reescreva a descrição com linguagem de ficha técnica"></textarea></div><br><button class="button" data-action="run-custom-ai">Generate proposal</button></div>`);
}

async function runAi(action, instruction) {
  ui.lastAiAction = action;
  openModal(`<header class="modal-header"><h2>Preparing proposal</h2><button class="button small" data-action="cancel-ai">Cancel</button></header><div class="loading-line"></div><div class="modal-body"><p class="view-description">Comparando terminologia, estrutura e contexto técnico.</p></div>`);
  try {
    const input = {
      instruction,
      title: store.current.title,
      shortTitle: store.current.shortTitle,
      technicalName: store.current.technicalName,
      subtitle: store.current.subtitle,
      description: store.current.description,
      category: store.current.category,
      formType: store.current.formType,
      presentation: store.current.presentation,
      tags: store.current.tags,
      technicalNotes: store.current.technicalNotes,
      storageNotes: store.current.storageNotes,
      ingredients: store.current.ingredients.map((item) => ({
        commonName: item.commonName,
        technicalName: item.technicalName,
        cas: item.cas,
        synonyms: item.synonyms,
        role: item.role
      }))
    };
    const result = await ai.request(action, input, store.current.id.startsWith("draft_") ? null : store.current.id);
    proposalModal(result, action, instruction);
  } catch (error) {
    if (error.name === "AbortError") {
      closeModal();
      toast("Solicitação cancelada.");
    } else {
      openModal(`<header class="modal-header"><h2>Enhance indisponível</h2><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><p>${value(error.message)}</p></div><footer class="modal-footer"><button class="button" data-action="close-modal">Close</button></footer>`);
    }
  }
}

function proposalModal(result, action, instruction) {
  const suggestions = result.suggestions.filter((suggestion) => aiFieldAllowed(suggestion.field));
  openModal(`<header class="modal-header"><div><p class="eyebrow">AI proposal · ${value(result.model || "")}</p><h2>Current / Suggested</h2></div><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body">
    ${suggestions.map((suggestion, index) => `<article class="proposal" data-proposal-index="${index}"><label class="toggle-row"><span>${value(suggestion.field)}</span><input type="checkbox" class="proposal-select" data-index="${index}" checked aria-label="Selecionar alteração em ${value(suggestion.field)}"></label><div class="proposal-grid"><div class="proposal-column"><span class="proposal-label">CURRENT</span><div class="proposal-text diff-current">${diffText(suggestion.current, suggestion.suggested, "current")}</div></div><div class="proposal-column suggested"><span class="proposal-label">SUGGESTED</span><div class="proposal-text diff-suggested">${diffText(suggestion.current, suggestion.suggested, "suggested")}</div></div></div><div class="proposal-meta"><span>${Math.round(Number(suggestion.confidence || 0) * 100)}% confidence</span><span>${value(suggestion.reason)}</span></div></article>`).join("") || "<p>Nenhuma alteração segura foi proposta.</p>"}
  </div><footer class="modal-footer"><button class="button ghost" data-action="close-modal">Reject</button><button class="button" data-action="copy-proposal" data-payload="${value(JSON.stringify(suggestions))}" ${suggestions.length ? "" : "disabled"}>Copy</button><button class="button" data-action="regenerate-ai" data-ai-action="${action}" data-instruction="${value(instruction)}">Regenerate</button><button class="button" data-action="accept-all-proposals" data-payload="${value(JSON.stringify(suggestions))}" ${suggestions.length ? "" : "disabled"}>Accept all</button><button class="button primary" data-action="accept-proposal" data-payload="${value(JSON.stringify(suggestions))}" ${suggestions.length ? "" : "disabled"}>Accept selected</button></footer>`, true);
}

function diffText(current, suggested, mode) {
  const before = Array.isArray(current) ? current.join(", ") : String(current ?? "");
  const after = Array.isArray(suggested) ? suggested.join(", ") : String(suggested ?? "");
  const comparison = new Set((mode === "current" ? after : before).toLowerCase().split(/\s+/).filter(Boolean));
  const source = mode === "current" ? before : after;
  return source.split(/(\s+)/).map((token) => {
    const escaped = value(token);
    if (!token.trim() || comparison.has(token.toLowerCase())) return escaped;
    return `<mark class="${mode === "current" ? "diff-remove" : "diff-add"}">${escaped}</mark>`;
  }).join("") || "—";
}

function profileModal(profile = {}) {
  openModal(`<form id="profile-form"><header class="modal-header"><div><p class="eyebrow">Reusable chemical metadata</p><h2>${profile.id ? "Edit ingredient" : "New ingredient"}</h2></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><input type="hidden" name="id" value="${value(profile.id)}"><div class="field-grid">${field("Nome canônico", "canonicalName", profile.canonicalName, { span: 6 }).replace("data-field=", "name=")}${field("Nome técnico", "technicalName", profile.technicalName, { span: 6 }).replace("data-field=", "name=")}${field("Designação farmacopeica", "pharmacopoeialDesignation", profile.pharmacopoeialDesignation, { span: 12 }).replace("data-field=", "name=")}${field("CAS", "cas", profile.cas, { span: 4 }).replace("data-field=", "name=")}${field("Fórmula molecular", "molecularFormula", profile.molecularFormula, { span: 4 }).replace("data-field=", "name=")}${field("Classificação", "classification", profile.classification, { span: 4 }).replace("data-field=", "name=")}${field("Forma física", "physicalForm", profile.physicalForm, { span: 4 }).replace("data-field=", "name=")}${field("Grau", "grade", profile.grade, { span: 4 }).replace("data-field=", "name=")}${field("Micronização", "micronization", profile.micronization, { span: 4 }).replace("data-field=", "name=")}${field("Sinônimos", "synonyms", (profile.synonyms || []).join(", "), { span: 12 }).replace("data-field=", "name=")}${field("Funções comuns", "commonRoles", (profile.commonRoles || []).join(", "), { span: 12 }).replace("data-field=", "name=")}${field("Verificação", "verificationStatus", profile.verificationStatus || "UNVERIFIED", { span: 6, options: [["UNVERIFIED","Não verificado"],["REVIEWED","Revisado"],["VERIFIED","Verificado"]] }).replace("data-field=", "name=")}${field("Fonte", "source", profile.source, { span: 12 }).replace("data-field=", "name=")}${field("Notas", "notes", profile.notes, { span: 12, type: "textarea" }).replace("data-field=", "name=")}</div></div><footer class="modal-footer"><button type="button" class="button ghost" data-action="close-modal">Cancel</button><button type="submit" class="button primary">Save ingredient</button></footer></form>`);
}

async function exportDatabase() {
  const response = await fetch("/api/backup");
  const backup = await response.json();
  if (!response.ok) throw new Error(backup.error);
  downloadJson(backup, "miguel-zakaleb-formulation-lab-" + new Date().toISOString().slice(0, 10) + ".json");
  toast("Backup JSON exportado.");
}

function askNormalize() {
  const total = calculateComposition(store.current).percentageTotal;
  openModal(`<header class="modal-header"><h2>Normalizar composição?</h2></header><div class="modal-body"><p>Os percentuais atuais somam <strong>${formatNumber(total)}%</strong>. A normalização redistribuirá proporcionalmente os valores para 100,0% e marcará a origem como calculada.</p></div><footer class="modal-footer"><button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" data-action="confirm-normalize">Normalize</button></footer>`);
}

function askClearDatabase() {
  openModal(`<header class="modal-header"><h2>Clear Lab database?</h2></header><div class="modal-body"><p>Esta operação remove somente formulações, ingredientes e coleções do banco associado ao projeto <strong>lab.miguelzacca</strong>. Exporte um backup antes se quiser preservar os dados.</p></div><footer class="modal-footer"><button class="button ghost" data-action="close-modal">Cancel</button><button class="button danger" data-action="confirm-clear-db">Clear database</button></footer>`);
}

async function processCover(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use uma imagem PNG, JPEG ou WebP.");
  if (file.size > 12000000) throw new Error("A imagem original excede 12 MB.");
  const source = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  const data = canvas.toDataURL("image/jpeg", .84);
  if (data.length > 2100000) throw new Error("A imagem continua maior que 2 MB após otimização.");
  store.update("coverImageData", data);
  store.update("coverImageMime", "image/jpeg");
  render();
}

async function handleAction(element, sourceTarget = element) {
  const action = element.dataset.action;
  if (!action || element.disabled) return;
  if (!canEdit() && privateActions.has(action)) {
    openLogin("Faça login para executar esta ação.");
    return;
  }
  if (action === "open-login") openLogin();
  if (action === "logout") await logout();
  if (action === "toggle-sidebar") document.body.classList.toggle("sidebar-open");
  if (action === "close-modal") closeModal();
  if (action === "new-record") {
    store.newRecord();
    location.hash = "#/formulation/new";
    render();
  }
  if (action === "open-record") {
    await store.open(element.dataset.id);
    location.hash = "#/formulation/" + element.dataset.id;
    render();
  }
  if (action === "toggle-favorite") {
    await store.toggleFavorite(element.dataset.id);
    render();
  }
  if (action === "toggle-current-favorite" && store.current) {
    await store.toggleFavorite(store.current.id);
    render();
  }
  if (action === "set-view") {
    await store.setSetting("libraryView", element.dataset.view);
    render();
  }
  if (action === "add-ingredient") {
    ui.inspectorIndex = store.addIngredient();
    render();
  }
  if (action === "remove-ingredient") {
    store.removeIngredient(Number(element.dataset.index));
    ui.inspectorIndex = null;
    render();
  }
  if (action === "inspect-ingredient" && (element.tagName === "BUTTON" || !sourceTarget.closest("input, select, textarea, button, a, label"))) {
    ui.inspectorIndex = Number(element.dataset.index);
    render();
  }
  if (action === "close-inspector") {
    ui.inspectorIndex = null;
    render();
  }
  if (action === "link-profile") {
    const profile = store.ingredients.find((item) => item.id === document.querySelector("#profile-link")?.value);
    if (profile) {
      const index = Number(element.dataset.index);
      const quantities = {
        percentageWW: store.current.ingredients[index].percentageWW,
        batchQuantity: store.current.ingredients[index].batchQuantity,
        batchUnit: store.current.ingredients[index].batchUnit,
        unitQuantity: store.current.ingredients[index].unitQuantity,
        unitQuantityUnit: store.current.ingredients[index].unitQuantityUnit,
        role: store.current.ingredients[index].role
      };
      Object.assign(store.current.ingredients[index], {
        ingredientId: profile.id,
        commonName: profile.canonicalName,
        technicalName: profile.technicalName || "",
        pharmacopoeialDesignation: profile.pharmacopoeialDesignation || "",
        synonyms: profile.synonyms || [],
        cas: profile.cas || "",
        molecularFormula: profile.molecularFormula || "",
        physicalForm: profile.physicalForm || "",
        grade: profile.grade || "",
        micronization: profile.micronization || "",
        source: profile.source || "",
        metadataOrigin: profile.metadataOrigin || "MANUAL",
        verificationStatus: profile.verificationStatus || "UNVERIFIED",
        ...quantities
      });
      store.update("ingredients", store.current.ingredients);
      render();
    }
  }
  if (action === "add-quality") {
    store.addListItem("qualityRecords", { id: uid("qc"), metric: "", operator: "", targetValue: "", unit: "", samplingPlan: "", notes: "", status: "" });
    render();
  }
  if (action === "add-process") {
    store.addListItem("processMetadata", { id: uid("process"), stageTitle: "", equipment: "", parameterName: "", parameterValue: "", parameterUnit: "", notes: "" });
    render();
  }
  if (action === "add-label") {
    store.addListItem("labelingFields", { id: uid("label"), label: "", value: "", include: true });
    render();
  }
  if (action === "add-reference") {
    store.addListItem("references", { id: uid("ref"), title: "", locator: "", url: "", notes: "" });
    render();
  }
  if (action === "remove-list-item") {
    store.removeListItem(element.dataset.list, Number(element.dataset.index));
    render();
  }
  if (action === "ask-normalize") askNormalize();
  if (action === "confirm-normalize") {
    store.current.ingredients = normalizePercentages(store.current.ingredients);
    store.update("ingredients", store.current.ingredients);
    closeModal();
    render();
  }
  if (action === "remove-cover") {
    store.update("coverImageData", "");
    store.update("coverImageMime", "");
    render();
  }
  if (action === "document-settings") {
    ui.documentDrawer = true;
    render();
  }
  if (action === "close-document-settings") {
    ui.documentDrawer = false;
    render();
  }
  if (action === "close-drawers") {
    ui.inspectorIndex = null;
    ui.documentDrawer = false;
    render();
  }
  if (action === "move-section") {
    const from = Number(element.dataset.index);
    const to = from + Number(element.dataset.direction);
    const order = store.current.documentSettings.sectionOrder;
    if (to >= 0 && to < order.length) {
      [order[from], order[to]] = [order[to], order[from]];
      store.update("documentSettings.sectionOrder", order);
      render();
    }
  }
  if (action === "print" && store.current) await printDocument(store.current);
  if (action === "toggle-preview") document.body.classList.toggle("preview-focus");
  if (action === "open-palette") openPalette();
  if (action === "open-ai") openAiMenu();
  if (action === "run-ai") await runAi(element.dataset.aiAction, element.dataset.instruction);
  if (action === "run-custom-ai") await runAi("ask", document.querySelector("#custom-ai-instruction")?.value || "Improve the technical wording.");
  if (action === "cancel-ai") {
    ai.cancel();
    closeModal();
  }
  if (action === "regenerate-ai") await runAi(element.dataset.aiAction, element.dataset.instruction);
  if (action === "accept-proposal") {
    const suggestions = JSON.parse(element.dataset.payload).filter((suggestion) => aiFieldAllowed(suggestion.field));
    const selected = [...document.querySelectorAll(".proposal-select:checked")].map((box) => Number(box.dataset.index));
    suggestions.forEach((suggestion, index) => {
      if (selected.includes(index)) store.update(suggestion.field, suggestion.suggested, "AI");
    });
    await store.saveCurrent("AI");
    closeModal();
    render();
    toast("Proposta aceita e registrada no histórico.");
  }
  if (action === "accept-all-proposals") {
    const suggestions = JSON.parse(element.dataset.payload).filter((suggestion) => aiFieldAllowed(suggestion.field));
    suggestions.forEach((suggestion) => store.update(suggestion.field, suggestion.suggested, "AI"));
    await store.saveCurrent("AI");
    closeModal();
    render();
    toast("Proposta integral aceita e registrada no histórico.");
  }
  if (action === "copy-proposal") {
    await navigator.clipboard.writeText(JSON.stringify(JSON.parse(element.dataset.payload), null, 2));
    toast("Proposta copiada.");
  }
  if (action === "new-profile") profileModal();
  if (action === "edit-profile") profileModal(store.ingredients.find((item) => item.id === element.dataset.id));
  if (action === "export-db") {
    try { await exportDatabase(); } catch (error) { toast(error.message, "error"); }
  }
  if (action === "import-db") fileInput.click();
  if (action === "ask-clear-db") askClearDatabase();
  if (action === "ask-archive" && store.current) {
    if (store.current.archivedAt) {
      await store.setArchived(store.current.id, false);
      render();
      toast("Formulação restaurada.");
    } else {
      openModal(`<header class="modal-header"><h2>Arquivar formulação?</h2><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><p>O registro sairá da biblioteca ativa, mas dados e histórico permanecerão preservados.</p></div><footer class="modal-footer"><button class="button ghost" data-action="close-modal">Cancel</button><button class="button primary" data-action="confirm-archive" data-id="${store.current.id}">Archive</button></footer>`);
    }
  }
  if (action === "confirm-archive") {
    await store.setArchived(element.dataset.id, true);
    closeModal();
    location.hash = "#/library";
    render();
    toast("Formulação arquivada.");
  }
  if (action === "restore-record") {
    await store.setArchived(element.dataset.id, false);
    render();
    toast("Formulação restaurada.");
  }
  if (action === "confirm-clear-db") {
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "replace", backup: { formulations: [], ingredients: [], collections: [], settings: {} } })
    });
    if (!response.ok) toast("Não foi possível limpar o banco.", "error");
    else {
      closeModal();
      await store.refresh();
      location.hash = "#/library";
      render();
      toast("Banco do Lab limpo.");
    }
  }
  if (action === "set-theme") {
    await store.setSetting("appearance", element.dataset.value);
    render();
  }
  if (action === "scroll-settings") {
    document.querySelector("#" + CSS.escape(element.dataset.target))?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  if (action === "set-density") {
    await store.setSetting("documentDefaults", { ...store.settings.documentDefaults, density: element.dataset.value });
    render();
  }
  if (action === "test-ai") {
    if (!store.health?.ai?.configured) toast("Defina NVIDIA_API_KEY no projeto do Lab.", "error");
    else toast("NVIDIA NIM configurado: " + store.health.ai.model);
  }
  if (action === "view-revision") {
    const revision = store.current.revisions.find((item) => item.id === element.dataset.id);
    openModal(`<header class="modal-header"><h2>Previous value</h2><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><p class="view-description">${value((revision.modifiedFields || []).join(", "))}</p><pre class="proposal-text">${value(JSON.stringify(revision.previousValues, null, 2))}</pre></div><footer class="modal-footer"><button class="button" data-action="restore-revision" data-id="${revision.id}">Restore revision</button></footer>`, true);
  }
  if (action === "restore-revision") {
    const revision = store.current.revisions.find((item) => item.id === element.dataset.id);
    if (revision?.previousValues) {
      const id = store.current.id;
      const revisions = store.current.revisions;
      store.current = { ...store.current, ...revision.previousValues, id, revisions };
      await store.saveCurrent("RESTORE");
      closeModal();
      render();
      toast("Revisão restaurada sem apagar o histórico.");
    }
  }
  if (action === "palette-command") {
    const command = element.dataset.command;
    closeModal();
    if (command === "new-record") {
      store.newRecord();
      location.hash = "#/formulation/new";
      render();
      return;
    }
    if (command === "open-ingredients") location.hash = "#/ingredients";
    if (command === "open-settings") location.hash = "#/settings";
    if (command === "print" && store.current) await printDocument(store.current);
    if (command === "duplicate" && store.current && !store.current.id.startsWith("draft_")) {
      const copy = await store.formulationRepository.duplicate(store.current.id);
      store.current = copy;
      await store.refresh();
      location.hash = "#/formulation/" + copy.id;
    }
    if (command === "toggle-current-favorite" && store.current) await store.toggleFavorite(store.current.id);
    if (command === "ai-enhance" && store.current) openAiMenu();
    if (command === "import-db") fileInput.click();
    if (command === "export-db") await exportDatabase();
    if (command === "search") {
      location.hash = "#/library";
      setTimeout(() => document.querySelector("#library-search")?.focus(), 30);
    }
  }
  if (action === "custom-ai" && store.current) {
    const instruction = document.querySelector("#palette-search")?.value;
    await runAi("ask", instruction || "Improve technical wording.");
  }
}

app.addEventListener("click", async (event) => {
  const element = event.target.closest("[data-action]");
  if (!element) return;
  if (element.dataset.action === "toggle-favorite") event.stopPropagation();
  try {
    await handleAction(element, event.target);
  } catch (error) {
    toast(error.message || "Não foi possível concluir a ação.", "error");
  }
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (input.id === "library-search") {
    ui.search = input.value;
    const position = input.selectionStart;
    render();
    const next = document.querySelector("#library-search");
    next?.focus();
    next?.setSelectionRange(position, position);
    return;
  }
  if (input.id === "ingredient-search") {
    ui.ingredientSearch = input.value;
    const position = input.selectionStart;
    render();
    const next = document.querySelector("#ingredient-search");
    next?.focus();
    next?.setSelectionRange(position, position);
    return;
  }
  if (input.dataset.field && store.current && canEdit()) {
    let next = input.type === "checkbox" ? input.checked : input.value;
    if (input.type === "number") next = input.value === "" ? null : Number(input.value);
    if (input.dataset.transform === "csv") next = input.value.split(",").map((item) => item.trim()).filter(Boolean);
    store.update(input.dataset.field, next);
    updatePreview();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "status-filter") {
    ui.status = event.target.value;
    render();
  }
  if (event.target.id === "cover-file") {
    if (canEdit()) processCover(event.target.files?.[0]).catch((error) => toast(error.message, "error"));
  }
  if (event.target.dataset.field) {
    updatePreview();
  }
});

overlayRoot.addEventListener("click", async (event) => {
  if (event.target.classList.contains("overlay")) {
    closeModal();
    return;
  }
  const element = event.target.closest("[data-action]");
  if (element) {
    try { await handleAction(element, event.target); } catch (error) { toast(error.message, "error"); }
  }
});

overlayRoot.addEventListener("input", (event) => {
  if (event.target.id === "palette-search") {
    const needle = event.target.value.toLowerCase();
    overlayRoot.querySelectorAll(".palette-item").forEach((item) => {
      item.hidden = !item.textContent.toLowerCase().includes(needle) && item.dataset.action !== "custom-ai";
    });
    const visible = [...overlayRoot.querySelectorAll(".palette-item:not([hidden]):not(:disabled)")];
    ui.paletteSelection = 0;
    overlayRoot.querySelectorAll(".palette-item").forEach((item) => {
      item.classList.toggle("selected", item === visible[0]);
      item.setAttribute("aria-selected", String(item === visible[0]));
    });
  }
});

overlayRoot.addEventListener("keydown", (event) => {
  if (!event.target.closest(".palette")) return;
  const items = [...overlayRoot.querySelectorAll(".palette-item:not([hidden]):not(:disabled)")];
  if (!items.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    ui.paletteSelection = (ui.paletteSelection + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((item, index) => {
      item.classList.toggle("selected", index === ui.paletteSelection);
      item.setAttribute("aria-selected", String(index === ui.paletteSelection));
    });
    items[ui.paletteSelection].scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter" && event.target.id === "palette-search") {
    event.preventDefault();
    items[ui.paletteSelection]?.click();
  }
});

overlayRoot.addEventListener("submit", async (event) => {
  if (event.target.id === "login-form") {
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Entrando…";
    const credentials = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: credentials.username, password: credentials.password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.authenticated) throw new Error(result.error || "Usuário ou senha inválidos.");
      store.auth = { authenticated: true, user: result.user || credentials.username };
      closeModal();
      await store.initialize();
      render();
      toast("Workspace privado desbloqueado.");
    } catch (error) {
      openLogin(error.message || "Não foi possível entrar.");
    }
    return;
  }
  if (event.target.id !== "profile-form") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.synonyms = String(data.synonyms || "").split(",").map((item) => item.trim()).filter(Boolean);
  data.commonRoles = String(data.commonRoles || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!data.id) delete data.id;
  try {
    await store.ingredientRepository.save(data);
    store.ingredients = await store.ingredientRepository.list();
    closeModal();
    render();
    toast("Ingrediente salvo.");
  } catch (error) {
    toast(error.message, "error");
  }
});

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  if (file.size > 12000000) {
    toast("O backup excede 12 MB.", "error");
    return;
  }
  try {
    const backup = JSON.parse(await file.text());
    const response = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "inspect", backup })
    });
    const result = await response.json();
    if (!response.ok || !result.valid) throw new Error((result.errors || [result.error]).join(" "));
    ui.pendingBackup = backup;
    openModal(`<header class="modal-header"><h2>Import summary</h2><button class="icon-button" data-action="close-modal">${icon("close")}</button></header><div class="modal-body"><div class="quant-hero"><div class="quant-metric"><span>Formulações</span><strong>${result.summary.formulations}</strong></div><div class="quant-metric"><span>Ingredientes</span><strong>${result.summary.ingredients}</strong></div><div class="quant-metric"><span>Conflitos</span><strong>${result.conflicts.length}</strong></div></div>${result.conflicts.length ? '<p class="view-description" style="margin-top:20px">Conflitos: ' + value(result.conflicts.map((item) => item.code).join(", ")) + "</p>" : ""}</div><footer class="modal-footer"><button class="button ghost" data-action="close-modal">Cancel</button><button class="button" data-action="apply-import" data-mode="merge">Merge</button><button class="button danger" data-action="apply-import" data-mode="replace">Replace</button></footer>`);
  } catch (error) {
    toast(error.message || "Arquivo JSON inválido.", "error");
  }
});

overlayRoot.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="apply-import"]');
  if (!button || !ui.pendingBackup) return;
  const response = await fetch("/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: button.dataset.mode, backup: ui.pendingBackup })
  });
  const result = await response.json();
  if (!response.ok) {
    toast(result.error || "Falha na importação.", "error");
    return;
  }
  ui.pendingBackup = null;
  closeModal();
  await store.refresh();
  location.hash = "#/library";
  render();
  toast(result.imported + " formulações importadas.");
});

window.addEventListener("hashchange", async () => {
  document.body.classList.remove("sidebar-open", "preview-focus");
  const currentRoute = route();
  if (currentRoute.name === "formulation" && currentRoute.id && currentRoute.id !== "new") {
    try { await store.open(currentRoute.id); } catch { location.hash = "#/library"; }
  }
  render();
});

window.addEventListener("keydown", async (event) => {
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "k" && canEdit()) {
    event.preventDefault();
    openPalette();
  }
  if (command && event.key.toLowerCase() === "s" && canEdit()) {
    event.preventDefault();
    await store.saveCurrent();
  }
  if (command && event.key.toLowerCase() === "p") {
    event.preventDefault();
    if (store.current) document.body.classList.add("preview-focus");
  }
  if (event.key === "Escape") {
    if (overlayRoot.innerHTML) closeModal();
    else if (ui.inspectorIndex != null || ui.documentDrawer) {
      ui.inspectorIndex = null;
      ui.documentDrawer = false;
      render();
    } else document.body.classList.remove("preview-focus", "sidebar-open");
  }
  if (overlayRoot.innerHTML && event.key === "Tab") {
    const focusable = [...overlayRoot.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
});

app.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key) || event.target.matches("input, textarea, select, button, a")) return;
  const actionable = event.target.closest('[data-action="open-record"], [data-action="edit-profile"], [data-action="inspect-ingredient"]');
  if (!actionable) return;
  event.preventDefault();
  actionable.click();
});

window.addEventListener("lab:auth-required", () => {
  store.auth = { authenticated: false, user: null };
  openLogin("Sua sessão expirou. Entre novamente para continuar.");
});

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (store.settings.appearance === "system") store.applyTheme();
});

store.addEventListener("document-change", updatePreview);
store.addEventListener("save-state", updatePreview);
store.addEventListener("save-error", (event) => toast(event.detail.error.message, "error"));

try {
  await store.initialize();
  const currentRoute = route();
  if (currentRoute.name === "formulation" && currentRoute.id && currentRoute.id !== "new") await store.open(currentRoute.id);
  render();
} catch (error) {
  app.innerHTML = `<div class="error-panel"><p class="eyebrow">Connection error</p><h1>O workspace não conseguiu abrir.</h1><p>${value(error.message)}</p><button class="button" onclick="location.reload()">Tentar novamente</button></div>`;
}
