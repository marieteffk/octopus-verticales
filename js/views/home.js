/* Inicio: resumen del día, clima, avisos y accesos rápidos. */
import { html, rerender, on, todayKey, fmtLongDate, fmtTime, sortBy, fmtDuration } from '../ui.js';
import { store } from '../db.js';
import { hydratePhotos } from '../media.js';
import { jobCard, activeJobs } from './jobs.js';
import { eventsOn, jobsOn, eventItem } from './calendar.js';
import { postCard, bindPostActions } from './feed.js';
import { noteCard, bindNoteCards, visibleNotes } from './notes.js';
import { lowStock } from './inventory.js';
import { activeEntry, clockOut } from './timesheets.js';
import { epiAlerts, todayChecklist } from './safety.js';
import { currentLocation, loadAnalysis, semaforoCard, rainBars } from './weather.js';

export default function homeView(ctx) {
  const state = { wx: null, wxError: null };
  let timer = null;
  const me = store.profile;
  const today = todayKey();

  const draw = () => {
    const hour = new Date().getHours();
    const greet = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
    const events = eventsOn(today);
    const todayJobs = jobsOn(today).filter((j) => !events.some((e) => e.jobId === j.id));
    const mine = activeJobs().filter((j) => (j.assignedIds || []).includes(me.id));
    const posts = sortBy(store.list('posts'), 'createdAt', -1).slice(0, 3);
    const notes = visibleNotes().filter((n) => n.pinned || (n.items || []).some((i) => !i.done)).slice(0, 3);
    const low = lowStock();
    const epis = epiAlerts();
    const active = activeEntry();
    const checklist = todayChecklist();
    const loc = currentLocation();
    rerender(ctx.el, html`<div class="page">
      <div class="row between mb"><div><h1 style="margin:0">${greet}, ${me.name.split(' ')[0]} 👋</h1><div class="muted" style="text-transform:capitalize">${fmtLongDate(new Date())}</div></div></div>

      <div class="quick">
        <a href="#/fotos?nueva=1"><span class="ico">📷</span>Foto</a>
        <a href="#/notas?nueva=1"><span class="ico">📝</span>Nota</a>
        <a href="#/trabajos?nuevo=1"><span class="ico">🧰</span>Trabajo</a>
        <a href="#/partes"><span class="ico">⏱️</span>${active ? 'Fichado' : 'Fichar'}</a>
      </div>

      ${active ? html`<div class="card tight" style="background:linear-gradient(135deg,#1f9d55,#116a9a);color:#fff"><div class="row between"><div><div class="small">⏱️ Fichado desde ${fmtTime(active.start)}${active.jobId ? ` · ${store.get('jobs', active.jobId)?.title || ''}` : ''}</div><div class="timer" id="home-timer" style="font-size:1.6rem">${fmtDuration(Date.now() - new Date(active.start))}</div></div><button class="btn small" style="background:#fff;color:#1a1a1a" id="home-stop">⏹ Parar</button></div></div>` : ''}

      ${state.wx ? html`${semaforoCard(state.wx.analysis.decision, { link: true })}
        <div class="card tight"><div class="row between"><span class="bold">🌦️ ${loc.name} · ${Math.round(state.wx.analysis.current.temperature_2m ?? 0)}° ${state.wx.analysis.current.info.icon}</span><span class="tiny muted">rachas ${Math.round(state.wx.analysis.current.wind_gusts_10m ?? 0)} km/h</span></div>
          <div class="tiny muted mb">Probabilidad de lluvia próximas 12 h</div>${rainBars(state.wx.analysis.hours, { count: 12 })}</div>`
        : loc ? html`<div class="card tight muted small">${state.wxError ? `⚠️ Clima: ${state.wxError}` : 'Cargando el tiempo…'}</div>`
        : html`<a class="card tight clickable" href="#/clima" style="display:block;text-decoration:none;color:inherit"><b>🌦️ Configura el clima</b><div class="muted small">Elige tu ubicación para ver aquí la probabilidad de lluvia y el semáforo de trabajo en altura.</div></a>`}

      ${!checklist ? html`<a class="card tight clickable" href="#/seguridad" style="display:block;text-decoration:none;color:inherit;border-left:5px solid var(--warn)"><b>🦺 Checklist pre-uso pendiente</b><div class="muted small">Firma la comprobación de seguridad antes de subir.</div></a>` : ''}
      ${epis.length ? html`<a class="card tight clickable" href="#/seguridad/epis" style="display:block;text-decoration:none;color:inherit;border-left:5px solid var(--danger)"><b>⚠️ ${epis.length} EPI${epis.length > 1 ? 's' : ''} por revisar o caducar</b><div class="muted small ellipsis">${epis.map((e) => e.name).join(', ')}</div></a>` : ''}
      ${low.length ? html`<a class="card tight clickable" href="#/materiales" style="display:block;text-decoration:none;color:inherit;border-left:5px solid var(--warn)"><b>🛒 ${low.length} material${low.length > 1 ? 'es' : ''} bajo mínimo</b><div class="muted small ellipsis">${low.map((m) => m.name).join(', ')}</div></a>` : ''}

      <div class="card-title mt"><h2>📅 Hoy</h2><a class="small" href="#/agenda">Agenda →</a></div>
      ${events.length || todayJobs.length ? html`<div class="list mb">${events.map(eventItem)}${todayJobs.map(jobCard)}</div>` : html`<p class="muted small">Nada planificado para hoy.</p>`}

      ${mine.length ? html`<div class="card-title"><h2>🧰 Mis trabajos activos (${mine.length})</h2><a class="small" href="#/trabajos">Todos →</a></div><div class="list mb">${mine.slice(0, 4).map(jobCard)}</div>` : ''}

      ${notes.length ? html`<div class="card-title"><h2>📝 Notas</h2><a class="small" href="#/notas">Todas →</a></div>${notes.map((n) => noteCard(n, { compact: true }))}` : ''}

      <div class="card-title mt"><h2>💬 Último en el muro</h2><a class="small" href="#/muro">Ver muro →</a></div>
      ${posts.length ? posts.map((p) => postCard(p, { compact: true })) : html`<p class="muted small">Sin publicaciones todavía.</p>`}
    </div>`);
    hydratePhotos(ctx.el);
    clearInterval(timer);
    if (active) timer = setInterval(() => { const el = ctx.el.querySelector('#home-timer'); if (el) el.textContent = fmtDuration(Date.now() - new Date(active.start)); }, 1000);
  };

  ctx.watch(['jobs', 'events', 'posts', 'notes', 'materials', 'timesheets', 'equipment', 'checklists', 'photos', 'team', 'settings'], draw);
  draw();
  const loc = currentLocation();
  if (loc) loadAnalysis(loc).then((wx) => { state.wx = wx; draw(); }).catch((err) => { state.wxError = err.message; draw(); });

  on(ctx.el, 'click', '#home-stop', async () => { await clockOut(); });
  on(ctx.el, 'click', '[data-event]', (ev, el) => { if (!ev.target.closest('a')) location.hash = `#/agenda?dia=${today}`; });
  bindPostActions(ctx.el);
  bindNoteCards(ctx.el);
  return () => clearInterval(timer);
}
