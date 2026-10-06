/* Agenda: planificación mensual de trabajos, visitas y ausencias del equipo. */
import {
  html, raw, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, todayKey, dateKey, fmtLongDate, emptyState, sortBy, avatar,
} from '../ui.js';
import { store, person } from '../db.js';
import { statusChip } from './jobs.js';

export const EVENT_TYPES = [['trabajo', '🧰 Trabajo en obra'], ['visita', '👀 Visita / medición'], ['presupuesto', '💶 Entrega de presupuesto'], ['ausencia', '🏖️ Ausencia / vacaciones'], ['formacion', '🎓 Formación / revisión EPI'], ['otro', '📌 Otro']];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function eventsOn(day) {
  return sortBy(store.list('events').filter((e) => e.date === day), (e) => e.start || '');
}
export function jobsOn(day) {
  return store.list('jobs').filter((j) => j.startDate && j.startDate <= day && (j.endDate || j.startDate) >= day && !['facturado', 'presupuesto'].includes(j.status));
}

export function openEventForm(event = null, { date = todayKey(), jobId = null } = {}) {
  const jobs = sortBy(store.list('jobs').filter((j) => !['facturado'].includes(j.status)), 'title');
  const members = sortBy(store.list('team'), 'name');
  const selected = new Set(event?.memberIds || (store.profile ? [store.profile.id] : []));
  const job = store.get('jobs', event?.jobId || jobId);
  const m = modal({
    title: event ? 'Editar evento' : 'Nuevo evento',
    body: html`<form id="ev-form">
      <div class="field"><label>Tipo</label><select name="type">${selectOptions(EVENT_TYPES, event?.type || (job ? 'trabajo' : 'trabajo'))}</select></div>
      <div class="field"><label>Trabajo</label><select name="jobId">${selectOptions([['', '— Sin trabajo —'], ...jobs.map((j) => [j.id, j.title])], event?.jobId || jobId || '')}</select></div>
      <div class="field"><label>Título</label><input name="title" value="${event?.title || (job ? job.title : '')}" placeholder="Ej. Sellado fachada norte"></div>
      <div class="grid-3">
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${event?.date || date}" required></div>
        <div class="field"><label>Inicio</label><input name="start" type="time" value="${event?.start || '08:00'}"></div>
        <div class="field"><label>Fin</label><input name="end" type="time" value="${event?.end || '14:00'}"></div>
      </div>
      <div class="field"><label>Quién va</label><div class="chips" id="ev-members">${members.map((p) => html`<span class="chip pick ${selected.has(p.id) ? 'active' : ''}" data-id="${p.id}">${p.name}</span>`)}</div></div>
      <div class="field"><label>Notas</label><textarea name="notes" placeholder="Hora de llegada, llaves, contacto en obra…">${event?.notes || ''}</textarea></div>
    </form>`,
    actions: [
      ...(event ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Eliminar este evento?', { okLabel: 'Eliminar', danger: true }))) return false; await store.remove('events', event.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#ev-form');
        if (!form.reportValidity()) return false;
        const v = formValues(form);
        const title = v.title || store.get('jobs', v.jobId)?.title || EVENT_TYPES.find(([k]) => k === v.type)?.[1].slice(2) || 'Evento';
        await store.put('events', { ...(event || {}), ...v, title, jobId: v.jobId || null, memberIds: [...selected] });
        toast('Evento guardado', 'ok');
        return true;
      } },
    ],
  });
  on(m.el, 'click', '#ev-members .chip', (ev, el) => { el.classList.toggle('active'); if (el.classList.contains('active')) selected.add(el.dataset.id); else selected.delete(el.dataset.id); });
  m.el.querySelector('[name=jobId]').addEventListener('change', (ev) => {
    const j = store.get('jobs', ev.target.value);
    const t = m.el.querySelector('[name=title]');
    if (j && !t.value) t.value = j.title;
  });
}

export function eventItem(e) {
  const job = store.get('jobs', e.jobId);
  const type = EVENT_TYPES.find(([k]) => k === e.type);
  return html`<div class="item clickable" data-event="${e.id}">
    <div class="meta" style="text-align:left;min-width:3.2rem"><b>${e.start || '—'}</b><br><span class="tiny">${e.end || ''}</span></div>
    <div class="body"><div class="title ellipsis">${type ? type[1].slice(0, 2) : '📌'} ${e.title}</div>
      <div class="sub ellipsis">${job ? html`<a href="#/trabajos/${job.id}">${job.title}</a>${job.address ? ` · ${job.address}` : ''}` : (e.notes || '')}</div></div>
    <div class="row gap-s">${(e.memberIds || []).slice(0, 3).map((id) => avatar(person(id), 'small'))}</div>
  </div>`;
}

export default function calendarView(ctx) {
  const today = todayKey();
  const state = { month: today.slice(0, 7), selected: ctx.query.get('dia') || today };
  const draw = () => {
    const [y, mo] = state.month.split('-').map(Number);
    const first = new Date(y, mo - 1, 1);
    const offset = (first.getDay() + 6) % 7; // lunes primero
    const start = new Date(y, mo - 1, 1 - offset);
    const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const evs = eventsOn(state.selected);
    const jobs = jobsOn(state.selected).filter((j) => !evs.some((e) => e.jobId === j.id));
    const me = store.profile?.id;
    rerender(ctx.el, html`<div class="page">
      <div class="card tight">
        <div class="cal-head"><button class="icon-btn" id="cal-prev" aria-label="Mes anterior">‹</button><h2 style="margin:0;text-transform:capitalize">${MONTHS[mo - 1]} ${y}</h2><button class="icon-btn" id="cal-next" aria-label="Mes siguiente">›</button></div>
        <div class="cal-grid">
          ${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => html`<div class="dow">${d}</div>`)}
          ${cells.map((d) => { const k = dateKey(d); const n = eventsOn(k).length + jobsOn(k).length; const mine = eventsOn(k).some((e) => (e.memberIds || []).includes(me));
            return html`<div class="cal-cell ${d.getMonth() !== mo - 1 ? 'other' : ''} ${k === today ? 'today' : ''} ${k === state.selected ? 'selected' : ''}" data-date="${k}">${d.getDate()}${n ? html`<div class="dots">${Array.from({ length: Math.min(n, 3) }, () => html`<i style="${mine ? '' : 'opacity:.6'}"></i>`)}</div>` : ''}</div>`; })}
        </div>
        <div class="row between mt"><button class="btn small ghost" id="cal-today">Hoy</button><span class="tiny muted">● eventos del día</span></div>
      </div>
      <h2 style="text-transform:capitalize">${fmtLongDate(state.selected + 'T00:00:00')}</h2>
      <div class="list">
        ${evs.map(eventItem)}
        ${jobs.map((j) => html`<a class="item clickable" href="#/trabajos/${j.id}"><div class="meta" style="text-align:left;min-width:3.2rem">🧰</div><div class="body"><div class="title ellipsis">${j.title}</div><div class="sub">Trabajo planificado ${j.startDate}${j.endDate && j.endDate !== j.startDate ? ` → ${j.endDate}` : ''}</div></div>${statusChip(j.status)}</a>`)}
        ${!evs.length && !jobs.length ? emptyState('📅', 'Nada planificado este día.') : ''}
      </div>
    </div>
    <button class="fab" id="fab-event" aria-label="Nuevo evento">+</button>`);
  };
  ctx.watch(['events', 'jobs', 'team'], draw);
  draw();
  if (ctx.query.get('nuevo')) {
    const job = store.get('jobs', ctx.query.get('trabajo'));
    openEventForm(null, { date: job?.startDate || state.selected, jobId: job?.id || null });
  }
  on(ctx.el, 'click', '#cal-prev', () => { const [y, m] = state.month.split('-').map(Number); state.month = dateKey(new Date(y, m - 2, 1)).slice(0, 7); draw(); });
  on(ctx.el, 'click', '#cal-next', () => { const [y, m] = state.month.split('-').map(Number); state.month = dateKey(new Date(y, m, 1)).slice(0, 7); draw(); });
  on(ctx.el, 'click', '#cal-today', () => { state.month = today.slice(0, 7); state.selected = today; draw(); });
  on(ctx.el, 'click', '[data-date]', (ev, el) => { state.selected = el.dataset.date; state.month = el.dataset.date.slice(0, 7); draw(); });
  on(ctx.el, 'click', '#fab-event', () => openEventForm(null, { date: state.selected }));
  on(ctx.el, 'click', '[data-event]', (ev, el) => { if (ev.target.closest('a')) return; openEventForm(store.get('events', el.dataset.event)); });
}
