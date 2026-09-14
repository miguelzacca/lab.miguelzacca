import { toDocumentModel, paginateDocument } from "../domain/document-model.js";
import { escapeHtml, formatNumber, slugify } from "../utils/core.js";

const text = (value) => escapeHtml(value == null || value === "" ? "—" : value);
const origin = { MANUAL: "M", CALCULATED: "C", AI_SUGGESTED: "AI", VERIFIED: "V" };

const translations = {
  "pt-BR": {
    code: "Código", revision: "Revisão", date: "Data", internal: "Documento técnico interno",
    sheet: "Ficha técnica de formulação", sheetAlt: "Formulation Technical Sheet", category: "Categoria",
    form: "Forma", presentation: "Apresentação", status: "Status", internalStatus: "Documento interno",
    composition: "Composição", component: "Componente", role: "Função", batch: "Por lote", unit: "Por unidade",
    provenance: "Origem", total: "TOTAL", quantitative: "Mapa quantitativo", batchTotal: "Total do lote",
    fraction: "Fracionamento", packaging: "Acondicionamento", quality: "Qualidade", process: "Metadados de processo",
    labeling: "Rotulagem", notes: "Informações técnicas", storage: "Conservação", references: "Referências",
    history: "Histórico de revisão", continuation: "continuação", route: "Via"
  },
  en: {
    code: "Code", revision: "Revision", date: "Date", internal: "Internal technical document",
    sheet: "Formulation Technical Sheet", sheetAlt: "Ficha Técnica de Formulação", category: "Category",
    form: "Form", presentation: "Presentation", status: "Status", internalStatus: "Internal document",
    composition: "Composition", component: "Component", role: "Role", batch: "Per batch", unit: "Per unit",
    provenance: "Origin", total: "TOTAL", quantitative: "Quantitative map", batchTotal: "Batch total",
    fraction: "Fractioning", packaging: "Packaging", quality: "Quality", process: "Process metadata",
    labeling: "Labeling", notes: "Technical information", storage: "Storage", references: "References",
    history: "Revision history", continuation: "continued", route: "Route"
  }
};

const labels = (model) => translations[model.settings.language] || translations["pt-BR"];
const safeCover = (source) => /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\r\n]+$/i.test(String(source || "")) ? source : "";

function header(model) {
  const t = labels(model);
  return `
    <header class="doc-header">
      <div class="doc-mark">MZ</div>
      <div class="doc-brand"><strong>Miguel Zakaleb</strong>Formulation Lab</div>
      <div class="doc-control">
        <span>${t.code}</span><strong>${text(model.code)}</strong>
        <span>${t.revision}</span><strong>${String(model.revision).padStart(2, "0")}</strong>
        <span>${t.date}</span><strong>${text(String(model.date).split("-").reverse().join("."))}</strong>
      </div>
    </header>`;
}

function footer(model, page, total) {
  return `<footer class="doc-footer"><span>${labels(model).internal} · ${text(model.code)}</span><span class="page-number">${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></footer>`;
}

function sectionHeading(number, title, continuation = false, model) {
  return `<div class="doc-section-heading"><span>${String(number).padStart(2, "0")}</span><h2>${text(title)}${continuation ? " · " + labels(model).continuation : ""}</h2></div>`;
}

function composition(model, ingredients, continuation = false) {
  const t = labels(model);
  const casHead = model.settings.showCas ? "<th>CAS</th>" : "";
  const rows = ingredients.map((item) => `
    <tr>
      <td><strong>${text(item.commonName)}</strong>${item.technicalName ? "<br><span>" + text(item.technicalName) + "</span>" : ""}${model.settings.showSynonyms && item.synonyms?.length ? '<br><small class="doc-synonyms">' + text(item.synonyms.join(" · ")) + "</small>" : ""}</td>
      ${model.settings.showCas ? "<td>" + text(item.cas) + "</td>" : ""}
      <td>${text(item.role)}</td>
      <td class="number">${formatNumber(item.percentageWW)}%</td>
      <td class="number">${formatNumber(item.batchQuantity)} ${text(item.batchUnit)}</td>
      <td class="number">${formatNumber(item.unitQuantity, 3)} ${text(item.unitQuantityUnit)}</td>
      ${model.settings.showProvenance ? '<td class="number">' + text(origin[item.metadataOrigin] || "M") + "</td>" : ""}
    </tr>`).join("");
  return `
    <section class="doc-section">
      ${sectionHeading(1, t.composition, continuation, model)}
      <table class="doc-table">
        <thead><tr><th>${t.component}</th>${casHead}<th>${t.role}</th><th class="number">% p/p</th><th class="number">${t.batch}</th><th class="number">${t.unit}</th>${model.settings.showProvenance ? '<th class="number">' + t.provenance + '</th>' : ""}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${5 + Number(model.settings.showCas) + Number(model.settings.showProvenance)}">—</td></tr>`}</tbody>
        ${continuation ? "" : `<tfoot><tr><td ${model.settings.showCas ? 'colspan="3"' : 'colspan="2"'}>${t.total}</td><td class="number">${formatNumber(model.totals.percentageTotal)}%</td><td class="number">${model.totals.batchTotal == null ? "—" : formatNumber(model.totals.batchTotal) + " " + text(model.batch.unit)}</td><td></td>${model.settings.showProvenance ? "<td></td>" : ""}</tr></tfoot>`}
      </table>
    </section>`;
}

function quantitative(model) {
  const t = labels(model);
  const count = model.batch.containerCount === "" || model.batch.containerCount == null ? NaN : Number(model.batch.containerCount);
  const per = model.batch.amountPerContainer === "" || model.batch.amountPerContainer == null ? NaN : Number(model.batch.amountPerContainer);
  return `
    <section class="doc-section">
      ${sectionHeading(2, t.quantitative, false, model)}
      <div class="doc-quant">
        <div class="doc-quant-item"><span>${t.batchTotal}</span><strong>${formatNumber(model.batch.total)} ${text(model.batch.unit)}</strong></div>
        <div class="doc-quant-item"><span>${t.fraction}</span><strong>${Number.isFinite(count) ? count : "—"} × ${formatNumber(per)} ${text(model.batch.containerUnit)}</strong></div>
        <div class="doc-quant-item"><span>${t.composition}</span><strong>${formatNumber(model.totals.percentageTotal)}%</strong></div>
      </div>
    </section>`;
}

function presentation(model) {
  const t = labels(model);
  return `
    <section class="doc-section">
      ${sectionHeading(3, t.presentation, false, model)}
      <div class="doc-definition-grid">
        <div class="doc-definition"><span>${t.presentation}</span><strong>${text(model.presentation)}</strong></div>
        <div class="doc-definition"><span>${t.form}</span><strong>${text(model.formType)}</strong></div>
        <div class="doc-definition"><span>${t.route}</span><strong>${text(model.route)}</strong></div>
        <div class="doc-definition"><span>${t.category}</span><strong>${text(model.category)}</strong></div>
      </div>
    </section>`;
}

function definitions(number, title, entries, model, continuation = false) {
  return `
    <section class="doc-section">
      ${sectionHeading(number, title, continuation, model)}
      <div class="doc-definition-grid">
        ${entries.filter((entry) => entry[1]).map((entry) => `<div class="doc-definition"><span>${text(entry[0])}</span><p>${text(entry[1])}</p></div>`).join("")}
      </div>
    </section>`;
}

function secondary(model, descriptor) {
  const key = typeof descriptor === "string" ? descriptor : descriptor.key;
  const items = descriptor.items;
  const continuation = Boolean(descriptor.continuation);
  const t = labels(model);
  if (key === "packaging") return definitions(4, t.packaging, [
    ["Recipiente", model.packaging.containerType],
    ["Material", model.packaging.containerMaterial],
    ["Quantidade", model.packaging.containerCount],
    ["Conteúdo líquido", model.packaging.netContent],
    ["Fechamento", model.packaging.closureType],
    ["Lacre", model.packaging.sealType],
    ["Controle de fluxo", model.packaging.flowControl],
    ["Proteção à umidade", model.packaging.moistureProtection],
    ["Proteção à luz", model.packaging.lightProtection],
    ["Observações", model.packaging.packagingNotes]
  ], model, continuation);
  if (key === "quality") return `
    <section class="doc-section">${sectionHeading(5, t.quality, continuation, model)}
      <table class="doc-table"><thead><tr><th>Métrica</th><th>Operador</th><th>Alvo</th><th>Plano de amostragem</th><th>Status</th></tr></thead>
      <tbody>${(items || model.qualityRecords).map((item) => `<tr><td>${text(item.metric)}</td><td>${text(item.operator)}</td><td>${text(item.targetValue)} ${text(item.unit)}</td><td>${text(item.samplingPlan)}</td><td>${text(item.status)}</td></tr>`).join("")}</tbody></table>
    </section>`;
  if (key === "process") return `
    <section class="doc-section">${sectionHeading(6, t.process, continuation, model)}
      <table class="doc-table"><thead><tr><th>Etapa</th><th>Equipamento</th><th>Parâmetro registrado</th><th>Notas</th></tr></thead>
      <tbody>${(items || model.processMetadata).map((item, index) => `<tr><td>${String(index + 1).padStart(2, "0")} · ${text(item.stageTitle)}</td><td>${text(item.equipment)}</td><td>${text(item.parameterName)}: ${text(item.parameterValue)} ${text(item.parameterUnit)}</td><td>${text(item.notes)}</td></tr>`).join("")}</tbody></table>
    </section>`;
  if (key === "labeling") return definitions(7, t.labeling, (items || model.labelingFields).map((item) => [item.label, item.value]), model, continuation);
  if (key === "notes") return `
    <section class="doc-section">${sectionHeading(8, t.notes, continuation, model)}
      ${(descriptor.technicalNotes ?? model.technicalNotes) ? '<div class="doc-prose">' + text(descriptor.technicalNotes ?? model.technicalNotes) + "</div>" : ""}
      ${(descriptor.storageNotes ?? model.storageNotes) ? '<div class="doc-definition-grid"><div class="doc-definition"><span>' + t.storage + '</span><p>' + text(descriptor.storageNotes ?? model.storageNotes) + '</p></div></div>' : ""}
    </section>`;
  if (key === "references") return `
    <section class="doc-section">${sectionHeading(9, t.references, continuation, model)}
      <table class="doc-table"><tbody>${(items || model.references).map((item, index) => `<tr><td class="number">${String(index + 1).padStart(2, "0")}</td><td><strong>${text(item.title)}</strong><br>${text(item.locator || item.url)}</td></tr>`).join("")}</tbody></table>
    </section>`;
  if (key === "history") return `
    <section class="doc-section">${sectionHeading(10, t.history, continuation, model)}
      <table class="doc-table"><thead><tr><th>Revisão</th><th>Data</th><th>Origem</th><th>Campos</th></tr></thead><tbody>
      ${(items || model.revisions).map((item) => `<tr><td>${text(item.revisionNumber)}</td><td>${text(new Date(item.createdAt).toLocaleDateString(model.settings.language))}</td><td>${text(item.source)}</td><td>${text(item.modifiedFields?.join(", "))}</td></tr>`).join("")}</tbody></table>
    </section>`;
  return "";
}

export function renderDocument(record) {
  const model = toDocumentModel(record);
  model.coverImageData = safeCover(model.coverImageData);
  const pages = paginateDocument(model);
  return pages.map((page, index) => {
    let content = "";
    if (page.type === "primary") {
      const t = labels(model);
      const primary = {
        composition: () => composition(model, page.ingredients),
        quantitative: () => quantitative(model),
        presentation: () => presentation(model)
      };
      const primaryOrder = [...new Set([...(model.settings.sectionOrder || []), "composition", "quantitative", "presentation"])]
        .filter((key) => primary[key] && model.settings.enabledSections[key] !== false);
      content = `
        <div class="doc-hero ${model.coverImageData ? "" : "no-cover"}">
          <div>
            <div class="doc-kicker">${t.sheet}<span>${t.sheetAlt}</span></div>
            <h1 class="doc-title">${text(model.title)}</h1>
            <p class="doc-subtitle">${text(model.technicalName || model.description)}</p>
          </div>
          ${model.coverImageData ? `<figure class="doc-cover"><img src="${model.coverImageData}" alt="${text(model.coverImageAlt)}"></figure>` : ""}
        </div>
        <div class="doc-overview">
          <div class="doc-meta"><span>${t.category}</span><strong>${text(model.category)}</strong></div>
          <div class="doc-meta"><span>${t.form}</span><strong>${text(model.formType)}</strong></div>
          <div class="doc-meta"><span>${t.presentation}</span><strong>${text(model.presentation)}</strong></div>
          <div class="doc-meta"><span>${t.status}</span><strong>${t.internalStatus}</strong></div>
        </div>
        ${primaryOrder.map((key) => primary[key]()).join("")}`;
    } else if (page.type === "composition-continuation") {
      content = composition(model, page.ingredients, true);
    } else {
      content = page.sections.map((key) => secondary(model, key)).join("");
    }
    return `<article class="document-page ${model.settings.density === "COMPACT" ? "compact" : ""} ${model.settings.pageSize === "LETTER" ? "page-letter" : "page-a4"}" data-page="${index + 1}">${header(model)}${content}${footer(model, index + 1, pages.length)}</article>`;
  }).join("");
}

export async function printDocument(record) {
  const root = document.querySelector("#print-root");
  const pageSize = record.documentSettings?.pageSize === "LETTER" ? "letter" : "A4";
  root.innerHTML = `<style>@page{size:${pageSize};margin:0}</style>` + renderDocument(record);
  root.setAttribute("aria-hidden", "false");
  const original = document.title;
  document.title = [record.code || "MZ-FRM", slugify(record.title), "r" + (record.revisionNumber || 1)].join("-");
  await document.fonts?.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const cleanup = () => {
    document.title = original;
    root.setAttribute("aria-hidden", "true");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
