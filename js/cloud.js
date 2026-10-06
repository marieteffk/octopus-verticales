/* Sincronización opcional con Supabase (gratis). Si no está configurado, la app funciona
   100% en local. Tabla `docs` genérica + bucket `media` (ver supabase/schema.sql). */
import { store, getSettings, saveSettings, meta, pending } from './db.js';
import { uploadPendingPhotos } from './media.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const PAGE = 1000;

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

  async init() {
    if (!this.isConfigured()) { this.setStatus('local'); return; }
    try {
      const { url, anonKey } = getSettings().cloud;
      const createClient = await this.loadLib();
      this.client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await this.client.auth.getSession();
      this.session = data.session || null;
      this.client.auth.onAuthStateChange((_event, session) => {
        this.session = session;
        if (session && !this.started) this.start();
        if (!session) this.stop();
      });
      if (this.session) await this.start();
      else this.setStatus('offline', 'Sin sesión. Inicia sesión en Ajustes.');
    } catch (err) {
      console.error('cloud init', err);
      this.setStatus('error', 'No se pudo conectar con la nube');
    }
    window.addEventListener('online', () => this.isActive() && this.resync());
  }

  async signIn(email, password) {
    if (!this.client) await this.init();
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session = data.session;
    if (!this.started) await this.start();
  }

  async signUp(email, password) {
    if (!this.client) await this.init();
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
    store.onLocalChange = (doc) => this.push(doc);
    await this.linkProfile();
    await this.flushPending();
    await this.pull();
    this.subscribe();
    uploadPendingPhotos().catch((err) => console.error(err));
    this.setStatus('online', 'Conectado');
  }

  stop() {
    this.started = false;
    store.onLocalChange = null;
    if (this.channel && this.client) this.client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus(this.isConfigured() ? 'offline' : 'local', this.isConfigured() ? 'Sin sesión' : '');
  }

  /** Alinea el id del perfil local con el usuario autenticado y publica la ficha en `team`. */
  async linkProfile() {
    const s = getSettings();
    const userId = this.session.user.id;
    const profile = { ...(s.profile || { name: this.session.user.email.split('@')[0], role: 'tecnico' }), id: userId, email: this.session.user.email };
    if (!s.profile || s.profile.id !== userId) saveSettings({ profile });
    const existing = store.get('team', userId) || {};
    await store.put('team', { ...existing, id: userId, name: profile.name, role: profile.role, phone: profile.phone || existing.phone || '', color: profile.color || existing.color || null, email: profile.email, status: existing.status || 'disponible' });
  }

  async resync() {
    if (!this.isActive()) return;
    this.setStatus('pending', 'Sincronizando…');
    await this.flushPending();
    await this.pull();
    await uploadPendingPhotos().catch(() => 0);
    this.setStatus('online', 'Conectado');
  }

  async pull() {
    if (!this.isActive()) return 0;
    let since = await meta.get('lastSync', '1970-01-01T00:00:00Z');
    let total = 0;
    for (;;) {
      const { data, error } = await this.client
        .from('docs').select('*').gt('updated_at', since).order('updated_at', { ascending: true }).limit(PAGE);
      if (error) { console.error('pull', error); this.setStatus('error', error.message); return total; }
      if (!data?.length) break;
      for (const row of data) {
        const doc = toDoc(row);
        if (doc) await store.applyRemote(doc);
        since = row.updated_at;
      }
      total += data.length;
      await meta.set('lastSync', since);
      if (data.length < PAGE) break;
    }
    return total;
  }

  subscribe() {
    if (this.channel || !this.client) return;
    this.channel = this.client
      .channel('docs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, async (payload) => {
        const doc = toDoc(payload.new);
        if (doc) {
          await store.applyRemote(doc);
          if (payload.new?.updated_at) await meta.set('lastSync', payload.new.updated_at);
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this.setStatus('pending', 'Reconectando…');
      });
  }

  async push(doc) {
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
        const { error } = await this.client.from('docs').upsert(toRow(current));
        if (error) { console.warn('flush failed', error.message); break; }
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
    await this.client.storage.from('media').remove([path]);
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
