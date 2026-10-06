/* Sincronización opcional con Supabase (gratis). Si no está configurado, la app funciona
   100% en local. Tabla `docs` genérica + bucket `media` (ver supabase/schema.sql).
   El cursor de sincronización usa `synced_at`, asignado por el servidor, para no depender
   del reloj de cada móvil. Los cambios locales siempre se encolan si la nube no está activa. */
import { store, getSettings, saveSettings, meta, pending } from './db.js';
import { uploadPendingPhotos } from './media.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const PAGE = 1000;

function isPrivate(doc) {
  return doc.coll === 'notes' && doc.shared === false;
}

function toRow(doc) {
  return {
    id: doc.id,
    coll: doc.coll,
    data: doc,
    updated_at: doc.updatedAt,
    deleted: !!doc.deleted,
    author: doc.authorId || null,
  };
}

function toDoc(row) {
  if (!row?.data) return null;
  return { ...row.data, id: row.id, coll: row.coll, deleted: !!row.deleted, updatedAt: row.data.updatedAt || row.updated_at };
}

class Cloud {
  constructor() {
    this.client = null;
    this.session = null;
    this.status = 'local';
    this.detail = '';
    this.listeners = new Set();
    this.channel = null;
    this.started = false;
    this.flushing = false;
    this.pulling = null;
    this.authSub = null;
  }

  isConfigured() {
    const c = getSettings().cloud;
    return Boolean(c?.url && c?.anonKey);
  }

  isActive() { return Boolean(this.client && this.session); }

  onStatus(fn) { this.listeners.add(fn); fn(this.status, this.detail); return () => this.listeners.delete(fn); }

  setStatus(status, detail = '') {
    this.status = status;
    this.detail = detail;
    for (const fn of this.listeners) fn(status, detail);
  }

  async loadLib() {
    const mod = await import(/* @vite-ignore */ SUPABASE_ESM);
    return mod.createClient;
  }

  /** Crea (o recrea) el cliente según los ajustes actuales. Seguro de llamar varias veces. */
  async init() {
    if (this.client) { this.stop(); this.authSub?.unsubscribe?.(); this.authSub = null; this.client = null; this.session = null; }
    if (!this.isConfigured()) { this.setStatus('local'); return; }
    try {
      const { url, anonKey } = getSettings().cloud;
      const createClient = await this.loadLib();
      this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await this.client.auth.getSession();
      this.session = data.session || null;
      this.authSub = this.client.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        if (session && !this.started) this.start();
        if (!session) this.stop();
      }).data?.subscription;
      if (this.session) await this.start();
      else this.setStatus('offline', 'Sin sesión. Inicia sesión en Ajustes.');
    } catch (err) {
      console.error('cloud init', err);
      this.setStatus('error', navigator.onLine ? 'No se pudo conectar con la nube' : 'Sin conexión: los cambios se guardan y se subirán después');
    }
  }

  async signIn(email, password) {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('No hay conexión con la nube');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session = data.session;
    if (!this.started) await this.start();
  }

  async signUp(email, password) {
    if (!this.client) await this.init();
    if (!this.client) throw new Error('No hay conexión con la nube');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    this.session = data.session;
    if (this.session && !this.started) await this.start();
    return Boolean(this.session);
  }

  async signOut() {
    if (this.client) await this.client.auth.signOut();
    this.session = null;
    this.stop();
  }

  async start() {
    if (this.started || !this.isActive()) return;
    this.started = true;
    this.setStatus('pending', 'Sincronizando…');
    try {
      await this.enqueueBacklog();
      await this.pull();            // primero lo remoto (gana el más reciente)…
      await this.linkProfile();     // …luego la ficha propia, sin pisar cambios ajenos
      await this.flushPending();    // …y por último los cambios locales pendientes
      this.subscribe();
      uploadPendingPhotos().catch((err) => console.error(err));
      this.setStatus(this.status === 'error' ? 'error' : 'online', this.status === 'error' ? this.detail : 'Conectado');
    } catch (err) {
      console.error('cloud start', err);
      this.started = false;
      this.setStatus('error', err.message || 'Error al sincronizar');
    }
  }

  stop() {
    this.started = false;
    if (this.channel && this.client) this.client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus(this.isConfigured() ? 'offline' : 'local', this.isConfigured() ? 'Sin sesión' : '');
  }

  /** La primera vez que se conecta, encola todo lo creado en modo local para subirlo. */
  async enqueueBacklog() {
    if (await meta.get('backlogDone')) return;
    for (const coll of store.cache.keys()) {
      for (const doc of store.cache.get(coll).values()) if (!isPrivate(doc)) await pending.add(doc);
    }
    await meta.set('backlogDone', true);
  }

  /** Alinea el id del perfil local con el usuario autenticado y publica la ficha en `team`. */
  async linkProfile() {
    const s = getSettings();
    const userId = this.session.user.id;
    const oldId = s.profile?.id;
    const profile = { ...(s.profile || { name: this.session.user.email.split('@')[0], role: 'tecnico' }), id: userId, email: this.session.user.email };
    if (oldId && oldId !== userId) {
      await store.migrateIdentity(oldId, userId);
      saveSettings({ profile });
    } else if (!s.profile) {
      saveSettings({ profile });
    }
    const existing = store.get('team', userId);
    const next = { ...(existing || {}), id: userId, name: existing?.name || profile.name, role: existing?.role || profile.role, phone: existing?.phone || profile.phone || '', color: existing?.color || profile.color || null, email: profile.email, status: existing?.status || 'disponible' };
    const changed = !existing || ['name', 'role', 'phone', 'email'].some((k) => (existing[k] || '') !== (next[k] || ''));
    if (changed) await store.put('team', next);
    if (existing && (existing.name !== s.profile?.name || existing.role !== s.profile?.role)) saveSettings({ profile: { ...profile, name: existing.name, role: existing.role } });
  }

  async resync() {
    if (!this.isActive()) { if (this.isConfigured() && !this.client) await this.init(); return; }
    this.setStatus('pending', 'Sincronizando…');
    await this.pull();
    await this.flushPending();
    await uploadPendingPhotos().catch(() => 0);
    if (this.status !== 'error') this.setStatus('online', 'Conectado');
  }

  async pull() {
    if (!this.isActive()) return 0;
    if (this.pulling) return this.pulling;
    this.pulling = (async () => {
      let since = await meta.get('lastSync', '1970-01-01T00:00:00Z');
      let total = 0;
      for (;;) {
        const { data, error } = await this.client
          .from('docs').select('*').gt('synced_at', since).order('synced_at', { ascending: true }).limit(PAGE);
        if (error) { console.error('pull', error); this.setStatus('error', error.message); break; }
        if (!data?.length) break;
        for (const row of data) {
          const doc = toDoc(row);
          if (doc) await store.applyRemote(doc);
          since = row.synced_at;
        }
        total += data.length;
        await meta.set('lastSync', since);
        if (data.length < PAGE) break;
      }
      return total;
    })();
    try { return await this.pulling; } finally { this.pulling = null; }
  }

  subscribe() {
    if (this.channel || !this.client) return;
    this.channel = this.client
      .channel('docs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, async (payload) => {
        const doc = toDoc(payload.new);
        if (doc) await store.applyRemote(doc);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') this.pull().then(() => this.flushPending());
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.setStatus('pending', 'Reconectando…');
      });
  }

  /** Llamado por el store en cada cambio local. Si la nube no está activa, se encola. */
  async push(doc) {
    if (!this.isConfigured() || isPrivate(doc)) return;
    if (!this.isActive()) { await pending.add(doc); return; }
    const { error } = await this.client.from('docs').upsert(toRow(doc));
    if (error) {
      console.warn('push failed, queued', error.message);
      await pending.add(doc);
      this.setStatus('pending', 'Cambios pendientes de subir');
    }
  }

  async flushPending() {
    if (this.flushing || !this.isActive()) return;
    this.flushing = true;
    try {
      const rows = await pending.all();
      for (const row of rows) {
        const current = store.cache.get(row.doc.coll)?.get(row.id) || row.doc;
        if (isPrivate(current)) { await pending.remove(row.id); continue; }
        const { error } = await this.client.from('docs').upsert(toRow(current));
        if (error) { console.warn('flush failed', error.message); this.setStatus('pending', 'Cambios pendientes de subir'); return; }
        await pending.remove(row.id);
      }
    } finally {
      this.flushing = false;
    }
  }

  async uploadBlob(path, blob) {
    if (!this.isActive()) throw new Error('Sin conexión con la nube');
    const { error } = await this.client.storage.from('media').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw error;
    const { data } = this.client.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }

  async deleteBlob(path) {
    if (!this.isActive()) return;
    const { error } = await this.client.storage.from('media').remove([path]);
    if (error) console.warn('deleteBlob', error.message);
  }

  async testConnection(url, anonKey) {
    const createClient = await this.loadLib();
    const client = createClient(url, anonKey);
    const { error } = await client.from('docs').select('id', { count: 'exact', head: true });
    if (error && !/JWT|permission|row-level|RLS/i.test(error.message)) throw error;
    return true;
  }
}

export const cloud = new Cloud();

// Todo cambio local pasa por la nube (o por la cola si no está activa).
store.onLocalChange = (doc) => cloud.push(doc).catch((err) => console.error('push', err));

window.addEventListener('online', () => cloud.resync().catch((err) => console.error(err)));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cloud.isActive()) cloud.resync().catch((err) => console.error(err));
});
