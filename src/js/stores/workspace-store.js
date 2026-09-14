import { FormulationRepository } from "../repositories/formulation-repository.js";
import { IngredientRepository } from "../repositories/ingredient-repository.js";
import { createFormulation, createIngredient } from "../domain/models.js";
import { debounce, setPath } from "../utils/core.js";

const settingsDefaults = {
  appearance: "system",
  libraryView: "grid",
  previewAppearance: "paper",
  documentDefaults: {
    density: "STANDARD",
    language: "pt-BR",
    pageSize: "A4"
  }
};

export class WorkspaceStore extends EventTarget {
  constructor() {
    super();
    this.formulationRepository = new FormulationRepository();
    this.ingredientRepository = new IngredientRepository();
    this.formulations = [];
    this.archivedFormulations = [];
    this.ingredients = [];
    this.current = null;
    this.settings = structuredClone(settingsDefaults);
    this.health = null;
    this.auth = { authenticated: false, user: null };
    this.saveState = "saved";
    this.changeVersion = 0;
    this.saveInFlight = null;
    this.saveQueued = false;
    this.queuedSource = "MANUAL";
    this.autosave = debounce(() => this.saveCurrent(), 750);
  }

  emit(name = "change", detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async initialize() {
    const auth = await fetch("/api/auth/status", { credentials: "include" })
      .then((response) => response.ok ? response.json() : ({ authenticated: false, user: null }))
      .catch(() => ({ authenticated: false, user: null }));
    const authenticated = Boolean(auth.authenticated);
    const [formulations, archivedFormulations, ingredients, settings, health, resolvedAuth] = await Promise.all([
      this.formulationRepository.list().catch(() => []),
      authenticated ? this.formulationRepository.list({ archived: true }).catch(() => []) : Promise.resolve([]),
      authenticated ? this.ingredientRepository.list().catch(() => []) : Promise.resolve([]),
      authenticated ? fetch("/api/settings", { credentials: "include" }).then((response) => response.ok ? response.json() : {}).catch(() => ({})) : Promise.resolve({}),
      fetch("/api/health", { credentials: "include" }).then((response) => response.json()).catch(() => ({ ok: false, database: "unavailable", ai: { configured: false } })),
      Promise.resolve(auth)
    ]);
    this.formulations = formulations;
    this.archivedFormulations = archivedFormulations;
    this.ingredients = ingredients;
    this.settings = { ...settingsDefaults, ...settings, documentDefaults: { ...settingsDefaults.documentDefaults, ...(settings.documentDefaults || {}) } };
    this.health = health;
    this.auth = { authenticated: Boolean(resolvedAuth.authenticated), user: resolvedAuth.user || null };
    this.applyTheme();
  }

  applyTheme() {
    const value = this.settings.appearance;
    const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }

  async refresh() {
    [this.formulations, this.archivedFormulations] = await Promise.all([
      this.formulationRepository.list(),
      this.formulationRepository.list({ archived: true })
    ]);
    this.emit();
  }

  async open(id) {
    if (this.current && this.saveState === "unsaved") await this.saveCurrent();
    this.autosave.cancel();
    this.current = await this.formulationRepository.get(id);
    this.changeVersion = 0;
    this.saveState = "saved";
    this.emit("current");
    return this.current;
  }

  newRecord() {
    this.autosave.cancel();
    const next = String(Date.now()).slice(-5);
    this.current = createFormulation({
      code: "MZ-FRM-" + next,
      documentSettings: {
        ...createFormulation().documentSettings,
        language: this.settings.documentDefaults.language,
        density: this.settings.documentDefaults.density,
        pageSize: this.settings.documentDefaults.pageSize
      }
    });
    this.saveState = "unsaved";
    this.changeVersion = 1;
    return this.current;
  }

  update(path, value, source = "MANUAL") {
    if (!this.current) return;
    setPath(this.current, path, value);
    this.changeVersion += 1;
    this.saveState = "unsaved";
    this.emit("document-change", { path, source });
    this.emit("save-state");
    this.autosave();
  }

  addIngredient(profile = null) {
    const line = createIngredient(profile ? {
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
      verificationStatus: profile.verificationStatus || "UNVERIFIED"
    } : {});
    this.current.ingredients.push(line);
    this.update("ingredients", this.current.ingredients);
    return this.current.ingredients.length - 1;
  }

  removeIngredient(index) {
    this.current.ingredients.splice(index, 1);
    this.update("ingredients", this.current.ingredients);
  }

  addListItem(name, value) {
    this.current[name].push(value);
    this.update(name, this.current[name]);
  }

  removeListItem(name, index) {
    this.current[name].splice(index, 1);
    this.update(name, this.current[name]);
  }

  async saveCurrent(source = "MANUAL") {
    if (!this.current) return;
    if (this.saveInFlight) {
      this.saveQueued = true;
      this.queuedSource = source;
      return this.saveInFlight;
    }
    const recordAtStart = this.current;
    const snapshot = structuredClone(recordAtStart);
    const versionAtStart = this.changeVersion;
    this.saveState = "saving";
    this.emit("save-state");
    this.saveInFlight = this.formulationRepository.save(snapshot, source);
    try {
      const saved = await this.saveInFlight;
      const stillCurrent = this.current === recordAtStart || this.current?.id === snapshot.id;
      const editedDuringSave = stillCurrent && this.changeVersion !== versionAtStart;
      if (stillCurrent && editedDuringSave) {
        this.current.id = saved.id;
        this.current.createdAt = saved.createdAt;
        this.current.updatedAt = saved.updatedAt;
        this.current.revisionNumber = saved.revisionNumber;
        this.current.revisions = saved.revisions;
        this.saveQueued = true;
      } else if (stillCurrent) {
        this.current = saved;
      }
      const visible = stillCurrent ? this.current : saved;
      const index = this.formulations.findIndex((item) => item.id === snapshot.id || item.id === saved.id);
      if (index >= 0) this.formulations[index] = visible;
      else this.formulations.unshift(visible);
      this.saveState = editedDuringSave ? "unsaved" : "saved";
      this.emit("saved");
    } catch (error) {
      this.saveState = "error";
      this.emit("save-error", { error });
    } finally {
      this.saveInFlight = null;
      if (this.saveQueued && this.current) {
        const nextSource = this.queuedSource;
        this.saveQueued = false;
        this.queuedSource = "MANUAL";
        await this.saveCurrent(nextSource);
      }
    }
    this.emit("save-state");
    return this.current;
  }

  async setSetting(key, value) {
    this.settings[key] = value;
    this.applyTheme();
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value })
    });
    this.emit();
  }

  async toggleFavorite(id) {
    const record = id === this.current?.id ? this.current : await this.formulationRepository.get(id);
    record.favorite = !record.favorite;
    const saved = await this.formulationRepository.save(record);
    if (this.current?.id === id) this.current = saved;
    await this.refresh();
  }

  async setArchived(id, archived) {
    await this.formulationRepository.archive(id, archived);
    if (this.current?.id === id) this.current.archivedAt = archived ? new Date().toISOString() : null;
    await this.refresh();
  }
}
