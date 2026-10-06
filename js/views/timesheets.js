/* Partes de trabajo y control horario: fichar entrada/salida por trabajo, resumen semanal y exportación CSV. */
import {
  html, raw, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, todayKey, dateKey, addDays, fmtTime, fmtDate, fmtDuration, hoursLabel, nowISO, emptyState, sortBy, download, avatar,
} from '../ui.js';
import { store, person, personName } from '../db.js';
import { activeJobs } from './jobs.js';

export function activeEntry(memberId = store.profile?.id) {
  return store.list('timesheets').find((t) => t.memberId === memberId && !t.end) || null;
}

export async function clockIn(jobId, notes = '') {
  const current = activeEntry();
  if (current) await clockOut(current);
  const start = nowISO();
  return store.put('timesheets', { memberId: store.profile.id, jobId: jobId || null, start, end: null, date: dateKey(new Date()), notes });
}

export async function clockOut(entry = activeEntry()) {
  if (!entry) return null;
  return store.put('timesheets', { ...entry, end: nowISO() });
}

function weekStart(day) {
  const d = new Date(day + 'T00:00:00');
  const off = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - off);
  return dateKey(d);
}

function duration(t) { return t.end ? new Date(t.end) - new Date(t.start) : Date.now() - new Date(t.start); }

function toCSV(rows) {
  const header = ['Fecha', 'Trabajador', 'Trabajo', 'Entrada', 'Salida', 'Horas', 'Notas'];
  const lines = rows.map((t) => [t.date, personName(t.memberId), store.get('jobs', t.jobId)?.title || '', fmtTime(t.start), t.end ? fmtTime(t.end) : '', (duration(t) / 3600000).toFixed(2).replace('.', ','), (t.notes || '').replace(/[\r\n;]+/g, ' ')]);
  // Las celdas que empiezan por = + - @ se prefijan con ' para que Excel no las ejecute como fórmulas.
  const cell = (v) => { let s = String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  return [header, ...lines].map((r) => r.map(cell).join(';')).join('\r\n');
}

function manualEntryDialog(entry = null) {
  const jobs = sortBy(activeJobs(), 'title');
  const members = sortBy(store.list('team'), 'name');
  const d = entry ? entry.date : todayKey();
  modal({
    title: entry ? 'Editar fichaje' : 'Fichaje manual',
    body: html`<form id="ts-form">
      ${members.length > 1 ? html`<div class="field"><label>Trabajador</label><select name="memberId">${selectOptions(members.map((m) => [m.id, m.name]), entry?.memberId || store.profile.id)}</select></div>` : ''}
      <div class="field"><label>Trabajo</label><select name="jobId">${selectOptions([['', '— Sin trabajo (taller, desplazamiento…) —'], ...jobs.map((j) => [j.id, j.title])], entry?.jobId || '')}</select></div>
      <div class="grid-3">
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${d}" required></div>
        <div class="field"><label>Entrada</label><input name="startT" type="time" value="${entry ? fmtTime(entry.start) : '08:00'}" required></div>
        <div class="field"><label>Salida</label><input name="endT" type="time" value="${entry?.end ? fmtTime(entry.end) : '14:00'}" required></div>
      </div>
      <div class="field"><label>Notas</label><input name="notes" value="${entry?.notes || ''}" placeholder="Desplazamiento, pausa, incidencia…"></div>
    </form>`,
    actions: [
      ...(entry ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Eliminar este fichaje?', { okLabel: 'Eliminar', danger: true }))) return false; await store.remove('timesheets', entry.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#ts-form');
        if (!form.reportValidity()) return false;
        const v = formValues(form);
        const start = new Date(`${v.date}T${v.startT}:00`).toISOString();
        const end = new Date(`${v.date}T${v.endT}:00`).toISOString();
        if (end <= start) { toast('La salida debe ser posterior a la entrada', 'error'); return false; }
        await store.put('timesheets', { ...(entry || {}), memberId: v.memberId || entry?.memberId || store.profile.id, jobId: v.jobId || null, date: v.date, start, end, notes: v.notes });
        toast('Fichaje guardado', 'ok');
        return true;
      } },
    ],
  });
}

export default function timesheetsView(ctx) {
  const me = store.profile;
  const canSeeAll = ['jefe', 'oficina', 'gerente'].includes(me?.role);
  const state = { week: weekStart(todayKey()), all: false, job: ctx.query.get('trabajo') || '' };
  let timer = null;

  const draw = () => {
    const active = activeEntry();
    const jobs = sortBy(activeJobs(), 'title');
    const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
    let entries = store.list('timesheets').filter((t) => t.date >= days[0] && t.date <= days[6]);
    if (!state.all) entries = entries.filter((t) => t.memberId === me.id);
    entries = sortBy(entries, 'start', -1);
    const weekMs = entries.filter((t) => t.end).reduce((s, t) => s + duration(t), 0);
    const todayMs = entries.filter((t) => t.date === todayKey() && t.memberId === me.id).reduce((s, t) => s + duration(t), 0);
    const byDay = {};
    for (const t of entries) (byDay[t.date] = byDay[t.date] || []).push(t);
    rerender(ctx.el, html`<div class="page">
      <div class="card" style="background:${active ? 'linear-gradient(135deg,#1f9d55,#116a9a)' : 'var(--surface)'};color:${active ? '#fff' : 'inherit'}">
        ${active ? html`
          <div class="small" style="opacity:.9">Fichado desde las ${fmtTime(active.start)}${active.jobId ? html` en <b>${store.get('jobs', active.jobId)?.title || 'trabajo'}</b>` : ''}</div>
          <div class="timer" id="ts-timer">${fmtDuration(duration(active))}</div>
          <button class="btn block" style="background:#fff;color:#1a1a1a" id="ts-stop">⏹ Parar y guardar</button>`
        : html`
          <h2>Fichar</h2>
          <div class="field"><label>¿En qué trabajo?</label><select class="input" id="ts-job">${selectOptions([['', '— Sin trabajo (taller, desplazamiento…) —'], ...jobs.map((j) => [j.id, j.title])], state.job)}</select></div>
          <button class="btn ok block" id="ts-start">▶ Empezar ahora</button>`}
      </div>
      <div class="kpis mb">
        <div class="kpi"><div class="v">${hoursLabel(todayMs)}</div><div class="k">Hoy (tú)</div></div>
        <div class="kpi"><div class="v">${hoursLabel(weekMs)}</div><div class="k">Semana ${state.all ? '(equipo)' : '(tú)'}</div></div>
        <div class="kpi"><div class="v">${entries.filter((t) => t.end).length}</div><div class="k">Fichajes</div></div>
      </div>
      <div class="row between mb wrap gap-s">
        <div class="row gap-s"><button class="icon-btn" id="ts-prev" aria-label="Semana anterior">‹</button><b>${fmtDate(days[0])} – ${fmtDate(days[6])}</b><button class="icon-btn" id="ts-next" aria-label="Semana siguiente">›</button></div>
        <div class="row gap-s">${canSeeAll ? html`<button class="btn small ghost" id="ts-all">${state.all ? '👤 Solo yo' : '👥 Todo el equipo'}</button>` : ''}<button class="btn small ghost" id="ts-manual">+ Manual</button><button class="btn small ghost" id="ts-csv">⬇ CSV</button></div>
      </div>
      ${entries.length ? Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => html`
        <div class="muted small bold" style="margin:.6rem 0 .3rem;text-transform:capitalize">${fmtDate(day + 'T00:00:00', { weekday: 'long', day: 'numeric', month: 'short' })} · ${hoursLabel(list.filter((t) => t.end).reduce((s, t) => s + duration(t), 0))}</div>
        <div class="list">${list.map((t) => html`<div class="item clickable" data-entry="${t.id}">
          ${state.all ? avatar(person(t.memberId), 'small') : ''}
          <div class="body"><div class="title ellipsis">${store.get('jobs', t.jobId)?.title || html`<span class="muted">Sin trabajo</span>`}</div><div class="sub">${fmtTime(t.start)} – ${t.end ? fmtTime(t.end) : html`<span class="chip ok tiny">en curso</span>`}${t.notes ? ` · ${t.notes}` : ''}${state.all ? ` · ${personName(t.memberId)}` : ''}</div></div>
          <div class="meta"><b>${t.end ? hoursLabel(duration(t)) : ''}</b></div></div>`)}</div>`)
        : emptyState('⏱️', 'Sin fichajes esta semana.')}
    </div>`);
    clearInterval(timer);
    if (active) timer = setInterval(() => { const el = ctx.el.querySelector('#ts-timer'); if (el) el.textContent = fmtDuration(duration(active)); }, 1000);
  };
  ctx.watch(['timesheets', 'jobs', 'team'], draw);
  draw();
  ctx.el.addEventListener('change', (ev) => { if (ev.target.id === 'ts-job') state.job = ev.target.value; });
  on(ctx.el, 'click', '#ts-start', async (ev, btn) => { btn.disabled = true; await clockIn(state.job); toast('Fichaje iniciado', 'ok'); });
  on(ctx.el, 'click', '#ts-stop', async () => { await clockOut(); toast('Fichaje guardado', 'ok'); });
  on(ctx.el, 'click', '#ts-prev', () => { state.week = addDays(state.week, -7); draw(); });
  on(ctx.el, 'click', '#ts-next', () => { state.week = addDays(state.week, 7); draw(); });
  on(ctx.el, 'click', '#ts-all', () => { state.all = !state.all; draw(); });
  on(ctx.el, 'click', '#ts-manual', () => manualEntryDialog());
  on(ctx.el, 'click', '[data-entry]', (ev, el) => { const t = store.get('timesheets', el.dataset.entry); if (t?.end) manualEntryDialog(t); });
  on(ctx.el, 'click', '#ts-csv', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(state.week, i));
    let rows = store.list('timesheets').filter((t) => t.end && t.date >= days[0] && t.date <= days[6]);
    if (!state.all) rows = rows.filter((t) => t.memberId === me.id);
    download(`partes_${days[0]}_${days[6]}.csv`, '﻿' + toCSV(sortBy(rows, 'start')), 'text/csv;charset=utf-8');
    toast('CSV descargado', 'ok');
  });
  return () => clearInterval(timer);
}
