/* Ajustes: perfil, apariencia, umbrales meteorológicos, empresa, instalación, nube y copias de seguridad. */
import { html, render, on, toast, confirmDialog, formValues, selectOptions, pickFiles, download, todayKey, colorFor, iconBtn } from '../ui.js';
import { icon } from '../icons.js';
import { store, getSettings, saveSettings, DEFAULT_SETTINGS, ROLES } from '../db.js';
import { cloud } from '../cloud.js';

const REPO_URL = 'https://github.com/marieteffk/octopus-verticales';

function cardTitle(ic, text) { return html`<h2 class="row gap-s">${icon(ic, { cls: 'muted' })}${text}</h2>`; }

export default function settingsView(ctx) {
  const draw = () => {
    const s = getSettings();
    const p = s.profile || {};
    const w = s.weather;
    const installable = Boolean(window.__installPrompt);
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    render(ctx.el, html`<div class="page">
      <form class="card" id="f-profile">
        ${cardTitle('user', 'Mi perfil')}
        <div class="field"><label>Nombre</label><input name="name" value="${p.name || ''}" required></div>
        <div class="grid-2">
          <div class="field"><label>Puesto</label><select name="role">${selectOptions(ROLES, p.role || 'tecnico')}</select></div>
          <div class="field"><label>Teléfono</label><input name="phone" type="tel" value="${p.phone || ''}"></div>
        </div>
        <button class="btn">Guardar perfil</button>
      </form>

      <form class="card" id="f-look">
        ${cardTitle('sun', 'Apariencia')}
        <div class="field"><label>Tema</label><select name="theme">${selectOptions([['auto', 'Automático (según el móvil)'], ['light', 'Claro'], ['dark', 'Oscuro']], s.theme)}</select></div>
        <button class="btn ghost">Aplicar</button>
      </form>

      <form class="card" id="f-weather">
        ${cardTitle('weather', 'Umbrales de seguridad meteorológica')}
        <p class="muted small">El semáforo del clima usa estos límites. Ajústalos al criterio de la empresa.</p>
        <div class="grid-2">
          <div class="field"><label>Prob. lluvia: precaución (%)</label><input name="rainCaution" type="number" min="0" max="100" value="${w.rainCaution}"></div>
          <div class="field"><label>Prob. lluvia: no apto (%)</label><input name="rainStop" type="number" min="0" max="100" value="${w.rainStop}"></div>
          <div class="field"><label>Viento medio: precaución (km/h)</label><input name="windCaution" type="number" min="0" value="${w.windCaution}"></div>
          <div class="field"><label>Viento medio: no apto (km/h)</label><input name="windStop" type="number" min="0" value="${w.windStop}"></div>
          <div class="field"><label>Rachas: precaución (km/h)</label><input name="gustCaution" type="number" min="0" value="${w.gustCaution}"></div>
          <div class="field"><label>Rachas: no apto (km/h)</label><input name="gustStop" type="number" min="0" value="${w.gustStop}"></div>
          <div class="field"><label>Lluvia acumulada/hora: no apto (mm)</label><input name="precipStop" type="number" min="0" step="0.1" value="${w.precipStop}"></div>
          <div class="field"><label>Temperatura mínima (°C)</label><input name="tempMin" type="number" value="${w.tempMin}"></div>
          <div class="field"><label>Temperatura máxima (°C)</label><input name="tempMax" type="number" value="${w.tempMax}"></div>
        </div>
        <div class="row gap-s"><button class="btn">Guardar umbrales</button><button class="btn ghost" type="button" id="wx-reset">Valores por defecto</button></div>
      </form>

      <form class="card" id="f-company">
        ${cardTitle('building', 'Empresa')}
        <div class="grid-2">
          <div class="field"><label>Nombre (presupuestos)</label><input name="name" value="${s.company.name}"></div>
          <div class="field"><label>IVA (%)</label><input name="vat" type="number" min="0" max="100" value="${s.company.vat}"></div>
        </div>
        <button class="btn">Guardar</button>
      </form>

      <div class="card">
        ${cardTitle('device', 'Instalar en el móvil')}
        ${standalone ? html`<p class="muted small">La app ya está instalada en este dispositivo.</p>`
          : installable ? html`<p class="muted small">Instala Octopus Verticales como app: icono en la pantalla de inicio, pantalla completa y funcionamiento sin conexión.</p><button class="btn" id="btn-install">Instalar ahora</button>`
          : html`<p class="muted small"><b>Android (Chrome):</b> menú de tres puntos → “Instalar aplicación” o “Añadir a pantalla de inicio”.<br><b>iPhone (Safari):</b> botón Compartir → “Añadir a pantalla de inicio”.<br><b>Ordenador (Chrome/Edge):</b> icono de instalar en la barra de direcciones.</p>`}
      </div>

      <div class="card" id="cloud-card">
        ${cardTitle('cloud', 'Nube del equipo (Supabase, gratis)')}
        <p class="muted small">Sin nube, los datos viven solo en este dispositivo. Con la nube, todo el equipo comparte fotos, muro, trabajos y notas en tiempo real. <a href="${REPO_URL}#nube-compartida-supabase" target="_blank" rel="noopener">Guía de configuración (5 min)</a>.</p>
        <form id="f-cloud">
          <div class="field"><label>URL del proyecto</label><input name="url" value="${s.cloud.url}" placeholder="https://xxxxx.supabase.co" autocomplete="off"></div>
          <div class="field"><label>Clave pública (anon key)</label><input name="anonKey" value="${s.cloud.anonKey}" placeholder="eyJhbGciOi…" autocomplete="off"></div>
          <div class="row gap-s"><button class="btn">Guardar y conectar</button>${cloud.isConfigured() ? html`<button class="btn ghost" type="button" id="cloud-clear">Desactivar nube</button>` : ''}</div>
        </form>
        ${cloud.isConfigured() ? html`<div class="mt" id="cloud-auth">
          <div class="row between"><span class="chip ${cloud.status === 'online' ? 'ok' : cloud.status === 'error' ? 'danger' : 'warn'}">${cloud.status === 'online' ? 'Conectado' : cloud.status === 'error' ? 'Error' : cloud.status === 'pending' ? 'Sincronizando…' : 'Sin sesión'}</span>${cloud.detail ? html`<span class="tiny muted">${cloud.detail}</span>` : ''}</div>
          ${cloud.isActive() ? html`<p class="small mt">Sesión: <b>${cloud.session?.user?.email}</b></p><div class="row gap-s">${iconBtn('refresh', 'Sincronizar ahora', 'ghost', 'id="cloud-resync"')}<button class="btn danger" id="cloud-logout">Cerrar sesión</button></div>`
            : html`<form id="f-login" class="mt">
              <div class="grid-2"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="username"></div><div class="field"><label>Contraseña</label><input name="password" type="password" required minlength="6" autocomplete="current-password"></div></div>
              <div class="row gap-s"><button class="btn grow">Entrar</button><button class="btn ghost grow" type="button" id="cloud-signup">Crear cuenta</button></div>
              <p class="tiny muted mt">Cada empleado crea su cuenta con su email. El administrador puede restringir registros desde el panel de Supabase.</p></form>`}
        </div>` : ''}
      </div>

      <div class="card">
        ${cardTitle('database', 'Copia de seguridad')}
        <p class="muted small">Exporta todos los datos a un archivo JSON (opcionalmente con las fotos) e impórtalo en otro dispositivo o guárdalo como respaldo.</p>
        <div class="row wrap gap-s">
          ${iconBtn('download', 'Exportar datos', 'ghost', 'id="exp-json"')}
          ${iconBtn('download', 'Exportar con fotos', 'ghost', 'id="exp-json-media"')}
          ${iconBtn('upload', 'Importar', 'ghost', 'id="imp-json"')}
        </div>
        <div class="mt"><button class="btn danger small" id="wipe">Borrar todos los datos de este dispositivo</button></div>
      </div>

      <div class="card">
        ${cardTitle('info', 'Acerca de')}
        <p class="small muted" style="margin:0">Octopus Verticales · app interna v1.1.0 · PWA para Android, iOS y web.<br>Meteorología: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (datos abiertos, sin clave).<br>Código: <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>.</p>
      </div>
    </div>`);
  };
  ctx.watch(['settings', 'install'], draw);
  const unsub = cloud.onStatus(() => { if (ctx.el.querySelector('#cloud-card')) draw(); });
  draw();

  ctx.el.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const v = formValues(f);
    if (f.id === 'f-profile') {
      const prev = getSettings().profile;
      const profile = { ...prev, name: v.name, role: v.role, phone: v.phone, color: prev.color || colorFor(v.name) };
      saveSettings({ profile });
      const existing = store.get('team', profile.id) || {};
      await store.put('team', { ...existing, id: profile.id, name: v.name, role: v.role, phone: v.phone, color: profile.color, status: existing.status || 'disponible' });
      toast('Perfil guardado', 'ok');
    }
    if (f.id === 'f-look') { saveSettings({ theme: v.theme }); toast('Tema aplicado', 'ok'); }
    if (f.id === 'f-weather') {
      const nums = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]));
      if (nums.rainCaution > nums.rainStop || nums.windCaution > nums.windStop || nums.gustCaution > nums.gustStop) { toast('Los valores de precaución deben ser menores que los de “no apto”', 'error'); return; }
      saveSettings({ weather: nums }); toast('Umbrales guardados', 'ok');
    }
    if (f.id === 'f-company') { saveSettings({ company: { name: v.name || 'Octopus Verticales', vat: Number(v.vat) || 0 } }); toast('Guardado', 'ok'); }
    if (f.id === 'f-cloud') {
      const url = v.url.replace(/\/+$/, '');
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || v.anonKey.length < 20) { toast('Revisa la URL (https://xxxx.supabase.co) y la clave anon', 'error'); return; }
      toast('Comprobando conexión…');
      try {
        await cloud.testConnection(url, v.anonKey);
        saveSettings({ cloud: { url, anonKey: v.anonKey } });
        await cloud.init();
        toast('Nube configurada. Inicia sesión para sincronizar.', 'ok');
      } catch (err) { toast(`No se pudo conectar: ${err.message}`, 'error'); }
    }
    if (f.id === 'f-login') {
      const btn = f.querySelector('button');
      btn.disabled = true;
      try { await cloud.signIn(v.email, v.password); toast('Sesión iniciada', 'ok'); } catch (err) { toast(err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : err.message, 'error'); }
      btn.disabled = false;
    }
  });
  on(ctx.el, 'click', '#cloud-signup', async () => {
    const f = ctx.el.querySelector('#f-login');
    if (!f.reportValidity()) return;
    const v = formValues(f);
    try {
      const active = await cloud.signUp(v.email, v.password);
      toast(active ? 'Cuenta creada y sesión iniciada' : 'Cuenta creada: confirma tu email y vuelve a entrar', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
  on(ctx.el, 'click', '#cloud-logout', async () => { await cloud.signOut(); toast('Sesión cerrada'); });
  on(ctx.el, 'click', '#cloud-resync', async () => { await cloud.resync(); toast('Sincronizado', 'ok'); });
  on(ctx.el, 'click', '#cloud-clear', async () => {
    if (!(await confirmDialog('¿Desactivar la nube en este dispositivo? Los datos locales se conservan.', { okLabel: 'Desactivar' }))) return;
    await cloud.signOut().catch(() => {});
    saveSettings({ cloud: { url: '', anonKey: '' } });
    cloud.setStatus('local');
    toast('Nube desactivada');
  });
  on(ctx.el, 'click', '#wx-reset', () => { saveSettings({ weather: { ...DEFAULT_SETTINGS.weather, locations: getSettings().weather.locations, defaultLocation: getSettings().weather.defaultLocation } }); toast('Umbrales restablecidos', 'ok'); });
  on(ctx.el, 'click', '#btn-install', async () => {
    const ev = window.__installPrompt;
    if (!ev) return;
    ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') window.__installPrompt = null;
    draw();
  });
  const exportJson = async (withMedia) => {
    toast('Preparando copia…');
    const payload = await store.exportAll({ withMedia });
    download(`octopus-verticales_${todayKey()}${withMedia ? '_con-fotos' : ''}.json`, JSON.stringify(payload));
    toast('Copia exportada', 'ok');
  };
  on(ctx.el, 'click', '#exp-json', () => exportJson(false));
  on(ctx.el, 'click', '#exp-json-media', () => exportJson(true));
  on(ctx.el, 'click', '#imp-json', async () => {
    const [file] = await pickFiles({ accept: 'application/json,.json', multiple: false });
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const n = await store.importAll(payload);
      toast(`Importados ${n} registros`, 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });
  on(ctx.el, 'click', '#wipe', async () => {
    if (!(await confirmDialog('Se borrarán TODOS los datos y fotos guardados en este dispositivo (la nube no se toca). ¿Continuar?', { okLabel: 'Borrar todo', danger: true }))) return;
    await store.clearAll();
    localStorage.removeItem('ov.settings.v1');
    location.hash = '#/inicio';
    location.reload();
  });
  return unsub;
}
