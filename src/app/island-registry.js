function assertIslandId(islandId) {
  const value = String(islandId || "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(value)) throw new TypeError(`Identificador de isla inválido: ${value}`);
  return value;
}

function moduleFromEntry(entry) {
  if (typeof entry === "function") return entry();
  if (entry && typeof entry.then === "function") return entry;
  return Promise.resolve(entry);
}

export function createIslandRegistry(initialEntries = {}) {
  const entries = new Map();
  for (const [islandId, entry] of Object.entries(initialEntries)) register(islandId, entry);

  function register(islandId, entry) {
    const id = assertIslandId(islandId);
    if (!entry) throw new TypeError(`Falta el loader de la isla ${id}.`);
    entries.set(id, entry);
    return () => entries.delete(id);
  }

  function has(islandId) { return entries.has(assertIslandId(islandId)); }
  function list() { return [...entries.keys()]; }
  function load(islandId) {
    const id = assertIslandId(islandId);
    if (!entries.has(id)) throw new Error(`La isla no está registrada: ${id}`);
    return moduleFromEntry(entries.get(id)).then((module) => {
      if (!module || typeof module.mountIsland !== "function") throw new TypeError(`La isla ${id} no exporta mountIsland().`);
      return module;
    });
  }

  return Object.freeze({ register, has, list, load });
}

export const __test = { assertIslandId, moduleFromEntry };
