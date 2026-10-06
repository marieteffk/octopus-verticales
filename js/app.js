/* Arranque: router por hash, navegación, onboarding, tema, service worker. */
import { html, render, qs, on, toast, closeTopModal, setTopbar, formValues, uid, colorFor } from './ui.js';
import { icon } from './icons.js';
import { store, getSettings, saveSettings, ROLES } from './db.js';
import { cloud } from './cloud.js';

import homeView from './views/home.js';
import jobsView from './views/jobs.js';
import photosView from './views/photos.js';
import notesView from './views/notes.js';
import weatherView from './views/weather.js';
import feedView from './views/feed.js';
import calendarView from './views/calendar.js';
import clientsView from './views/clients.js';
import inventoryView from './views/inventory.js';
import timesheetsView from './views/timesheets.js';
import safetyView from './views/safety.js';
import teamView from './views/team.js';
import settingsView from './views/settings.js';

export const ROUTES = [
  { path: 'inicio', title: 'Inicio', icon: 'home', view: homeView, tab: true },
  { path: 'trabajos', title: 'Trabajos', icon: 'briefcase', view: jobsView, tab: true },
  { path: 'fotos', title: 'Fotos', icon: 'camera', view: photosView, tab: true },
  { path: 'muro', title: 'Muro', icon: 'feed', view: feedView, tab: true },
  { path: 'clima', title: 'Clima', icon: 'weather', view: weatherView, tab: true },
  { sep: true },
  { path: 'agenda', title: 'Agenda', icon: 'calendar', view: calendarView },
  { path: 'notas', title: 'Notas', icon: 'note', view: notesView },
  { path: 'partes', title: 'Partes y horas', icon: 'clock', view: timesheetsView },
  { path: 'seguridad', title: 'Seguridad y EPIs', icon: 'shield', view: safetyView },
  { path: 'materiales', title: 'Materiales', icon: 'box', view: inventoryView },
  { path: 'clientes', title: 'Clientes', icon: 'building', view: clientsView },
  { path: 'equipo', title: 'Equipo', icon: 'users', view: teamView },
  { sep: true },
  { path: 'ajustes', title: 'Ajustes', icon: 'settings', view: settingsView },
];

let viewEl = qs('#view');
let cleanup = null;
let watchers = [];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return { path: segments[0] || 'inicio', id: segments[1] || null, sub: segments[2] || null, query: new URLSearchParams(queryPart) };
}

function applyTheme() {
  const { theme } = getSettings();
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function buildNav() {
  const { path } = parseHash();
  const links = ROUTES.map((r) => r.sep
    ? html`<div class="sep"></div>`
    : html`<a href="#/${r.path}" class="${r.path === path ? 'active' : ''}">${icon(r.icon, { size: 20 })}${r.title}</a>`);
  render(qs('#drawer-links'), links);
  const tabs = ROUTES.filter((r) => r.tab).map((r) => html`<a href="#/${r.path}" class="${r.path === path ? 'active' : ''}">${icon(r.icon, { size: 22 })}${r.title}</a>`);
  render(qs('#tabbar'), tabs);
  const p = getSettings().profile;
  qs('#drawer-user').textContent = p ? `${p.name} · ${ROLES.find(([k]) => k === p.role)?.[1] || p.role}` : '';
}

function closeDrawer() {
  qs('#drawer').classList.remove('open');
  qs('#scrim').classList.remove('open');
}

function teardown() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch (err) { console.error(err); } }
  cleanup = null;
  watchers.forEach((un) => un());
  watchers = [];
}

async function route() {
  teardown();
  closeDrawer();
  buildNav();
  // Elemento nuevo por ruta: los manejadores de la vista anterior desaparecen con él.
  const fresh = viewEl.cloneNode(false);
  viewEl.replaceWith(fresh);
  viewEl = fresh;
  if (!getSettings().profile) { renderOnboarding(); return; }
  const { path, id, sub, query } = parseHash();
  const match = ROUTES.find((r) => r.path === path) || ROUTES[0];
  setTopbar(match.title);
  window.scrollTo(0, 0);
  const ctx = {
    el: viewEl,
    params: { id, sub },
    query,
    watch(colls, fn) {
      for (const c of [].concat(colls)) watchers.push(store.subscribe(c, fn));
    },
  };
  try {
    cleanup = await match.view(ctx);
  } catch (err) {
    console.error(err);
    render(viewEl, html`<div class="card"><h2>Algo ha fallado</h2><p class="muted">${err.message}</p><a class="btn" href="#/inicio">Volver al inicio</a></div>`);
  }
}

function renderOnboarding() {
  setTopbar('Bienvenido/a');
  render(viewEl, html`
    <div class="onboard">
      <img class="logo" src="icons/icon.svg" alt="Octopus Verticales">
      <h1 class="center">Octopus Verticales</h1>
      <p class="center muted">Dinos quién eres para empezar. Podrás cambiarlo en Ajustes.</p>
      <form id="onboard-form" class="card">
        <div class="field"><label for="ob-name">Tu nombre</label><input id="ob-name" name="name" required placeholder="Ej. Marta García" autocomplete="name"></div>
        <div class="field"><label for="ob-role">Puesto</label>
          <select id="ob-role" name="role">${ROLES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></div>
        <div class="field"><label for="ob-phone">Teléfono (opcional)</label><input id="ob-phone" name="phone" type="tel" placeholder="600 000 000" autocomplete="tel"></div>
        <button class="btn block" type="submit">Empezar</button>
      </form>
      <p class="center tiny muted">Los datos se guardan en este dispositivo. Para compartirlos con el equipo, activa la nube en Ajustes.</p>
    </div>`);
  qs('#onboard-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = formValues(ev.target);
    if (!v.name) return;
    const id = uid();
    const profile = { id, name: v.name, role: v.role, phone: v.phone, color: colorFor(v.name) };
    saveSettings({ profile });
    await store.put('team', { id, name: v.name, role: v.role, phone: v.phone, color: profile.color, status: 'disponible' });
    toast(`Hola, ${v.name}`, 'ok');
    route();
  });
}

function bindShell() {
  render(qs('#btn-menu'), icon('menu', { size: 22 }));
  qs('#btn-menu').addEventListener('click', () => {
    qs('#drawer').classList.toggle('open');
    qs('#scrim').classList.toggle('open');
  });
  qs('#scrim').addEventListener('click', closeDrawer);
  on(qs('#drawer-links'), 'click', 'a', closeDrawer);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeTopModal(); });
  window.addEventListener('hashchange', route);
  store.subscribe('settings', () => { applyTheme(); buildNav(); });
  cloud.onStatus((status, detail) => {
    const el = qs('#sync-status');
    el.className = `sync-status ${status}`;
    el.textContent = { local: 'Modo local', online: 'Nube conectada', pending: detail || 'Sincronizando…', offline: 'Nube: sin sesión', error: detail || 'Error de nube' }[status] || status;
    el.title = detail || '';
  });
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    window.__installPrompt = ev;
    store.notify('install');
  });
  window.addEventListener('appinstalled', () => { window.__installPrompt = null; toast('App instalada', 'ok'); });
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  // En desarrollo (localhost) no se registra salvo ?sw=1, para no servir ficheros antiguos desde la caché.
  if (isLocal && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    return;
  }
  if (location.protocol !== 'https:' && !isLocal) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión disponible: recarga la app', 'warn');
      });
    });
  }).catch((err) => console.warn('SW no registrado', err));
}

async function main() {
  applyTheme();
  bindShell();
  await store.init();
  if (!location.hash) location.replace('#/inicio'); // dispara hashchange → route()
  else await route();
  cloud.init().catch((err) => console.error(err));
  registerSW();
}

main();
