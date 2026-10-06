/* Inicio: resumen del día, clima, avisos y accesos rápidos. */
import { html, rerender, on, todayKey, fmtLongDate, fmtTime, sortBy, fmtDuration, sectionTitle } from '../ui.js';
import { icon, weatherIcon } from '../icons.js';
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
  let disposed = false;
  const me = store.profile;
  const today = todayKey();

  const draw = () => {
    if (disposed) return;
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
    const wx = state.wx?.analysis;
    rerender(ctx.el, html`<div class="page">
      <div class="mb"><h1 style="margin:0">${greet}, ${me.name.split(' ')[0]}</h1><div class="muted small" style="text-transform:capitalize">${fmtLongDate(new Date())}</div></div>

      <div class="quick">
        <a href="#/fotos?nueva=1">${icon('camera', { size: 22 })}Foto</a>
        <a href="#/notas?nueva=1">${icon('note', { size: 22 })}Nota</a>
        <a href="#/trabajos?nuevo=1">${icon('briefcase', { size: 22 })}Trabajo</a>
        <a href="#/partes">${icon(active ? 'stop' : 'play', { size: 22 })}${active ? 'Fichado' : 'Fichar'}</a>
      </div>

      ${active ? html`<div class="card tight timer-card"><div class="row between"><div><div class="small muted">Fichado desde ${fmtTime(active.start)}${active.jobId ? ` · ${store.get('jobs', active.jobId)?.title || ''}` : ''}</div><div class="timer" id="home-timer" style="font-size:1.6rem">${fmtDuration(Date.now() - new Date(active.start))}</div></div><button class="btn small ghost" id="home-stop">${icon('stop', { size: 16 })} Parar</button></div></div>` : ''}

      ${wx ? html`${semaforoCard(wx.decision, { link: true })}
        <div class="card tight">
          <div class="row between"><span class="row gap-s bold">${weatherIcon(wx.current.weather_code, { size: 20 })} ${loc.name} · ${Math.round(wx.current.temperature_2m ?? 0)}°</span><span class="tiny muted">rachas ${Math.round(wx.current.wind_gusts_10m ?? 0)} km/h</span></div>
          <div class="tiny muted mb">Probabilidad de lluvia, próximas 12 h · ${state.wx.fromCache ? html`<span class="${state.wx.stale ? 'chip danger tiny' : ''}">datos guardados a las ${fmtTime(state.wx.cachedAt)}</span>` : `actualizado ${fmtTime(wx.updatedAt)}`}</div>
          ${rainBars(wx.hours, { count: 12 })}
        </div>`
        : loc ? html`<div class="card tight muted small">${state.wxError ? `Clima no disponible: ${state.wxError}` : 'Cargando el tiempo…'}</div>`
        : html`<a class="alert-card info" href="#/clima">${icon('weather', { size: 22 })}<div><b>Configura el clima</b><span class="small muted">Elige tu ubicación para ver aquí la lluvia prevista y el semáforo de trabajo en altura.</span></div></a>`}

      ${!checklist ? html`<a class="alert-card warn" href="#/seguridad">${icon('shield', { size: 22 })}<div><b>Checklist pre-uso pendiente</b><span class="small muted">Firma la comprobación de seguridad antes de subir.</span></div></a>` : ''}
      ${epis.length ? html`<a class="alert-card danger" href="#/seguridad/epis">${icon('alert', { size: 22 })}<div class="grow" style="min-width:0"><b>${epis.length} EPI${epis.length > 1 ? 's' : ''} por revisar o caducar</b><span class="small muted ellipsis" style="display:block">${epis.map((e) => e.name).join(', ')}</span></div></a>` : ''}
      ${low.length ? html`<a class="alert-card warn" href="#/materiales">${icon('cart', { size: 22 })}<div class="grow" style="min-width:0"><b>${low.length} material${low.length > 1 ? 'es' : ''} bajo mínimo</b><span class="small muted ellipsis" style="display:block">${low.map((m) => m.name).join(', ')}</span></div></a>` : ''}

      ${sectionTitle('Hoy', '#/agenda', 'Agenda')}
      ${events.length || todayJobs.length ? html`<div class="list">${events.map(eventItem)}${todayJobs.map(jobCard)}</div>` : html`<p class="muted small">Nada planificado para hoy.</p>`}

      ${mine.length ? html`${sectionTitle(`Mis trabajos activos (${mine.length})`, '#/trabajos', 'Todos')}<div class="list">${mine.slice(0, 4).map(jobCard)}</div>` : ''}

      ${notes.length ? html`${sectionTitle('Notas', '#/notas', 'Todas')}${notes.map((n) => noteCard(n, { compact: true }))}` : ''}

      ${sectionTitle('Último en el muro', '#/muro', 'Ver muro')}
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
  on(ctx.el, 'click', '[data-event]', (ev) => { if (!ev.target.closest('a')) location.hash = `#/agenda?dia=${today}`; });
  bindPostActions(ctx.el);
  bindNoteCards(ctx.el);
  return () => { disposed = true; clearInterval(timer); };
}
