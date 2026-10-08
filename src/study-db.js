export const STUDY_DB_NAME = "contaia-study-db";
export const STUDY_DB_VERSION = 1;
export const STUDY_DB_SCHEMA = {
  items: "id, kind, title, tags",
  notes: "id, itemId, updatedAt",
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeText = (value) => String(value ?? "").trim();

export function createStudyItems({ modules = [], exercises = [], glossary = [] } = {}) {
  const moduleItems = modules.map((module) => ({
    id: `module:${module.id}`,
    kind: "module",
    label: "Módulo",
    title: module.title,
    summary: module.focus,
    body: `${module.outcome} ${module.guide?.opening ?? ""}`.trim(),
    tags: ["curso", `semana-${module.week}`, ...(module.title?.toLowerCase().split(/\s+/).slice(0, 4) ?? [])],
    destination: { section: "course", moduleId: module.id },
  }));
  const exerciseItems = exercises.map((exercise) => ({
    id: `practice:${exercise.id}`,
    kind: "practice",
    label: "Práctica",
    title: exercise.title,
    summary: exercise.intro,
    body: exercise.scenario ?? exercise.hint ?? "Práctica guiada con datos ficticios.",
    tags: ["laboratorio", exercise.category, exercise.kind].filter(Boolean),
    destination: { section: "lab", exerciseId: exercise.id },
  }));
  const glossaryItems = glossary.map((entry) => ({
    id: `concept:${entry.term}`,
    kind: "concept",
    label: "Concepto",
    title: entry.term,
    summary: entry.definition,
    body: `Ejemplo: ${entry.example} Comprueba: ${entry.check}`,
    tags: ["glosario", "concepto"],
    destination: { section: "course", glossaryTerm: entry.term },
  }));
  return [...moduleItems, ...exerciseItems, ...glossaryItems];
}

export function searchStudyItems(items, query = "", kind = "all") {
  const normalizedQuery = normalizeText(query).toLocaleLowerCase("es-MX");
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return items
    .filter((item) => kind === "all" || item.kind === kind)
    .map((item) => {
      const haystack = [item.title, item.summary, item.body, ...(item.tags ?? [])].join(" ").toLocaleLowerCase("es-MX");
      const title = normalizeText(item.title).toLocaleLowerCase("es-MX");
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 4 : haystack.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => !terms.length || score > 0)
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, "es-MX"))
    .map(({ item }) => item);
}

export function sanitizeStudyNote(note, validItemIds = null) {
  if (!note || typeof note !== "object") return null;
  const itemId = normalizeText(note.itemId);
  const content = normalizeText(note.content).slice(0, 2000);
  if (!itemId || !content || (validItemIds && !validItemIds.has(itemId))) return null;
  return {
    id: normalizeText(note.id) || `note:${itemId}`,
    itemId,
    content,
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : Date.now(),
  };
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("No se pudo acceder a IndexedDB.")));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("La transacción de estudio fue cancelada.")));
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("La transacción de estudio falló.")));
  });
}

function memoryAdapter(items) {
  const itemMap = new Map(items.map((item) => [item.id, clone(item)]));
  const noteMap = new Map();
  return {
    persistent: false,
    async listItems() { return [...itemMap.values()].map(clone); },
    async listNotes() { return [...noteMap.values()].map(clone); },
    async saveNote(note) {
      const valid = sanitizeStudyNote(note, new Set(itemMap.keys()));
      if (!valid) throw new Error("La nota está vacía o no corresponde a un elemento válido.");
      noteMap.set(valid.id, valid);
      return clone(valid);
    },
    async deleteNote(id) { noteMap.delete(id); },
    async exportData() { return { version: STUDY_DB_VERSION, exportedAt: new Date().toISOString(), items: await this.listItems(), notes: await this.listNotes() }; },
  };
}

export async function openStudyDatabase(catalog) {
  const items = createStudyItems(catalog);
  if (!globalThis.indexedDB) return memoryAdapter(items);

  const db = await new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(STUDY_DB_NAME, STUDY_DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("items")) {
        const store = database.createObjectStore("items", { keyPath: "id" });
        store.createIndex("kind", "kind", { unique: false });
        store.createIndex("title", "title", { unique: false });
      }
      if (!database.objectStoreNames.contains("notes")) {
        const store = database.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("itemId", "itemId", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("No se pudo abrir la base de estudio.")));
    request.addEventListener("blocked", () => reject(new Error("La base de estudio está bloqueada por otra pestaña.")));
  });

  const itemTransaction = db.transaction("items", "readwrite");
  const itemStore = itemTransaction.objectStore("items");
  items.forEach((item) => itemStore.put(item));
  await transactionPromise(itemTransaction);

  return {
    persistent: true,
    async listItems() {
      const transaction = db.transaction("items", "readonly");
      return requestPromise(transaction.objectStore("items").getAll());
    },
    async listNotes() {
      const transaction = db.transaction("notes", "readonly");
      return requestPromise(transaction.objectStore("notes").getAll());
    },
    async saveNote(note) {
      const valid = sanitizeStudyNote(note, new Set(items.map((item) => item.id)));
      if (!valid) throw new Error("La nota está vacía o no corresponde a un elemento válido.");
      const transaction = db.transaction("notes", "readwrite");
      transaction.objectStore("notes").put(valid);
      await transactionPromise(transaction);
      return valid;
    },
    async deleteNote(id) {
      const transaction = db.transaction("notes", "readwrite");
      transaction.objectStore("notes").delete(id);
      await transactionPromise(transaction);
    },
    async exportData() {
      return {
        version: STUDY_DB_VERSION,
        exportedAt: new Date().toISOString(),
        items: await this.listItems(),
        notes: await this.listNotes(),
      };
    },
  };
}
