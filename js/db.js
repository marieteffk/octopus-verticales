/* Capa de datos local-first: IndexedDB + caché en memoria + suscripciones.
   Cada documento vive en una "colección" (jobs, clients, notes, posts, ...).
   La nube (cloud.js) se engancha mediante store.onLocalChange / store.applyRemote. */
import { uid, nowISO } from './ui.js';

const DB_NAME = 'octopus-verticales';
const DB_VERSION = 1;
const SETTINGS_KEY = 'ov.settings.v1';

export const ROLES = [
  ['tecnico', 'Técnico/a vertical'], ['jefe', 'Jefe/a de equipo'], ['oficina', 'Oficina / administración'], ['gerente', 'Gerencia'],
];

export const COLLECTIONS = [
  'jobs', 'clients', 'notes', 'posts', 'comments', 'photos', 'events',
  'materials', 'timesheets', 'checklists', 'equipment', 'incidents', 'team',
];

/* ---------- IndexedDB mínimo ---------- */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) {
        const docs = db.createObjectStore('docs', { keyPath: 'id' });
        docs.createIndex('coll', 'coll', { unique: false });
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('pending')) db.createObjectStore('pending', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    let request;
    try { request = fn(s); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(request && 'result' in request ? request.result : request);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  getAll: (store) => tx(store, 'readonly', (s) => s.getAll()),
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  delete: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};

/* ---------- Ajustes (localStorage) ---------- */
export const DEFAULT_SETTINGS = Object.freeze({
  profile: null,
  theme: 'auto',
  weather: {
    windCaution: 30, windStop: 45,
    gustCaution: 40, gustStop: 55,
    rainCaution: 40, rainStop: 70,
    precipStop: 0.5,
    tempMin: 2, tempMax: 35,
    locations: [],
    defaultLocation: null,
  },
  cloud: { url: '', anonKey: '' },
  company: { name: 'Octopus Verticales', vat: 21 },
});

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v !== null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

/** Fusión profunda inmutable: nunca devuelve referencias a `base` ni a `patch`. Los arrays se reemplazan. */
function deepMerge(base, patch) {
  if (patch === undefined) return clone(base);
  if (!isPlainObject(patch)) return clone(patch);
  const out = {};
  const keys = new Set([...Object.keys(isPlainObject(base) ? base : {}), ...Object.keys(patch)]);
  for (const k of keys) out[k] = k in patch ? deepMerge(base?.[k], patch[k]) : clone(base[k]);
  return out;
}

export function getSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return deepMerge(DEFAULT_SETTINGS, stored || {});
  } catch {
    return deepMerge(DEFAULT_SETTINGS, {});
  }
}

export function saveSettings(patch) {
  const next = deepMerge(getSettings(), patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  store.notify('settings');
  return next;
}

/* ---------- Store ---------- */
class Store {
  constructor() {
    this.cache = new Map();
    this.listeners = new Map();
    this.onLocalChange = null;
    this.ready = false;
  }

  async init() {
    const all = await idb.getAll('docs');
    this.cache = new Map();
    for (const doc of all) this._cacheSet(doc);
    this.ready = true;
    return this;
  }

  get profile() { return getSettings().profile; }

  _cacheSet(doc) {
    if (!this.cache.has(doc.coll)) this.cache.set(doc.coll, new Map());
    this.cache.get(doc.coll).set(doc.id, doc);
  }

  list(coll, { includeDeleted = false } = {}) {
    const m = this.cache.get(coll);
    if (!m) return [];
    const docs = Array.from(m.values());
    return includeDeleted ? docs : docs.filter((d) => !d.deleted);
  }

  get(coll, id) {
    const doc = this.cache.get(coll)?.get(id);
    return doc && !doc.deleted ? doc : null;
  }

  count(coll) { return this.list(coll).length; }

  /** Crea o actualiza un documento. Devuelve una copia nueva (sin mutar la entrada). */
  async put(coll, data) {
    const existing = data.id ? this.cache.get(coll)?.get(data.id) : null;
    const now = nowISO();
    const doc = {
      ...(existing || {}),
      ...data,
      id: data.id || uid(),
      coll,
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: now,
      authorId: existing?.authorId || data.authorId || this.profile?.id || 'local',
      deleted: false,
    };
    await idb.put('docs', doc);
    this._cacheSet(doc);
    this.notify(coll);
    if (this.onLocalChange) this.onLocalChange(doc);
    return doc;
  }

  /** Borrado lógico (tombstone) para que la nube pueda propagarlo. */
  async remove(coll, id) {
    const existing = this.cache.get(coll)?.get(id);
    if (!existing) return null;
    const doc = { ...existing, deleted: true, updatedAt: nowISO() };
    await idb.put('docs', doc);
    this._cacheSet(doc);
    this.notify(coll);
    if (this.onLocalChange) this.onLocalChange(doc);
    return doc;
  }

  /** Aplica un documento llegado de la nube si es más reciente que el local. */
  async applyRemote(doc) {
    if (!doc || !doc.id || !doc.coll) return false;
    const local = this.cache.get(doc.coll)?.get(doc.id);
    if (local && local.updatedAt >= doc.updatedAt) return false;
    await idb.put('docs', doc);
    this._cacheSet(doc);
    this.notify(doc.coll);
    return true;
  }

  subscribe(coll, fn) {
    if (!this.listeners.has(coll)) this.listeners.set(coll, new Set());
    this.listeners.get(coll).add(fn);
    return () => this.listeners.get(coll)?.delete(fn);
  }

  notify(coll) {
    for (const fn of this.listeners.get(coll) || []) {
      try { fn(coll); } catch (err) { console.error('listener error', err); }
    }
    for (const fn of this.listeners.get('*') || []) {
      try { fn(coll); } catch (err) { console.error('listener error', err); }
    }
  }

  async exportAll({ withMedia = false } = {}) {
    const docs = await idb.getAll('docs');
    const payload = { app: 'octopus-verticales', version: 1, exportedAt: nowISO(), docs };
    if (withMedia) {
      const blobs = await idb.getAll('blobs');
      payload.blobs = await Promise.all(blobs.map(async (b) => ({ id: b.id, type: b.type, data: await blobToDataURL(b.blob) })));
    }
    return payload;
  }

  async importAll(payload) {
    if (!payload || payload.app !== 'octopus-verticales' || !Array.isArray(payload.docs)) {
      throw new Error('El archivo no es una copia de seguridad válida de Octopus Verticales.');
    }
    let applied = 0;
    for (const doc of payload.docs) {
      if (await this.applyRemote(doc)) applied += 1;
    }
    for (const b of payload.blobs || []) {
      const existing = await idb.get('blobs', b.id);
      if (!existing) await idb.put('blobs', { id: b.id, type: b.type, blob: dataURLToBlob(b.data) });
    }
    for (const coll of COLLECTIONS) this.notify(coll);
    return applied;
  }

  async clearAll() {
    await idb.clear('docs');
    await idb.clear('blobs');
    await idb.clear('pending');
    await idb.clear('meta');
    this.cache = new Map();
    for (const coll of COLLECTIONS) this.notify(coll);
  }
}

export const store = new Store();

/* ---------- Meta / pendientes (usado por cloud.js) ---------- */
export const meta = {
  async get(key, fallback = null) {
    const row = await idb.get('meta', key);
    return row ? row.value : fallback;
  },
  set(key, value) { return idb.put('meta', { key, value }); },
};

export const pending = {
  add: (doc) => idb.put('pending', { id: doc.id, doc }),
  all: () => idb.getAll('pending'),
  remove: (id) => idb.delete('pending', id),
};

/* ---------- Helpers de blobs ---------- */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataURL) {
  const [head, body] = String(dataURL).split(',');
  const mime = /data:(.*?);/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------- Utilidades de dominio compartidas ---------- */
export function personName(id) {
  if (!id) return '—';
  const me = store.profile;
  if (me && me.id === id) return me.name;
  const member = store.get('team', id);
  return member?.name || 'Compañero/a';
}

export function person(id) {
  const me = store.profile;
  if (me && me.id === id) return me;
  return store.get('team', id) || { id, name: 'Compañero/a' };
}
