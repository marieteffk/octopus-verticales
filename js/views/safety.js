/* Seguridad: checklist diario pre-uso, registro de EPIs con revisiones/caducidades e incidencias. */
import {
  html, raw, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, todayKey, addDays, fmtDate, fmtDateTime, nowISO, emptyState, sortBy, avatar,
} from '../ui.js';
import { store, person, personName } from '../db.js';
import { activeJobs } from './jobs.js';
import { openUploadDialog, openLightbox } from './photos.js';
import { hydratePhotos } from '../media.js';

export const CHECK_ITEMS = [
  ['meteo', 'Meteorología revisada (viento, lluvia, tormenta)'],
  ['anclajes', 'Anclajes verificados y redundantes (2 líneas independientes)'],
  ['cuerdas', 'Cuerdas sin daños, protegidas en aristas y con nudo final'],
  ['arnes', 'Arnés y conectores revisados (costuras, cierres, hebillas)'],
  ['casco', 'Casco con barboquejo'],
  ['descensor', 'Descensor y bloqueador funcionan correctamente'],
  ['anticaidas', 'Anticaídas en línea de seguridad'],
  ['zona', 'Zona inferior acotada y señalizada'],
  ['herramienta', 'Herramientas aseguradas (cordinos antiatrapamiento)'],
  ['rescate', 'Plan de rescate conocido y material disponible'],
  ['comunicacion', 'Comunicación entre técnicos (radio/móvil) operativa'],
  ['botiquin', 'Botiquín y teléfono de emergencias 112 accesibles'],
];

export const EPI_TYPES = ['Arnés', 'Casco', 'Cuerda', 'Descensor', 'Bloqueador', 'Anticaídas', 'Conector', 'Cabo de anclaje', 'Asiento', 'Otro'];
const SEVERITIES = [['casi', 'Casi accidente'], ['leve', 'Leve'], ['grave', 'Grave'], ['muy_grave', 'Muy grave']];

export function todayChecklist(memberId = store.profile?.id) {
  return store.list('checklists').find((c) => c.date === todayKey() && c.memberId === memberId) || null;
}

export function epiAlerts(days = 30) {
  const limit = addDays(todayKey(), days);
  return store.list('equipment').filter((e) => e.status !== 'retirado' && ((e.nextCheck && e.nextCheck <= limit) || (e.expires && e.expires <= limit)));
}

function epiState(e) {
  const today = todayKey();
  if (e.status === 'retirado') return ['outline', 'Retirado'];
  if (e.expires && e.expires <= today) return ['danger', 'Caducado'];
  if (e.nextCheck && e.nextCheck <= today) return ['danger', 'Revisión vencida'];
  if (e.nextCheck && e.nextCheck <= addDays(today, 30)) return ['warn', 'Revisar pronto'];
  return ['ok', 'OK'];
}

function openEpiForm(e = null) {
  const members = sortBy(store.list('team'), 'name');
  modal({
    title: e ? 'Editar EPI' : 'Nuevo EPI',
    body: html`<form id="epi-form">
      <div class="grid-2">
        <div class="field"><label>Tipo</label><select name="type">${selectOptions(EPI_TYPES, e?.type || 'Arnés')}</select></div>
        <div class="field"><label>Nombre / modelo *</label><input name="name" required value="${e?.name || ''}" placeholder="Petzl Avao Bod"></div>
        <div class="field"><label>Nº de serie</label><input name="serial" value="${e?.serial || ''}"></div>
        <div class="field"><label>Asignado a</label><select name="memberId">${selectOptions([['', '— Común —'], ...members.map((m) => [m.id, m.name])], e?.memberId || '')}</select></div>
        <div class="field"><label>Fecha de compra</label><input name="purchased" type="date" value="${e?.purchased || ''}"></div>
        <div class="field"><label>Caducidad fabricante</label><input name="expires" type="date" value="${e?.expires || ''}"></div>
        <div class="field"><label>Última revisión</label><input name="lastCheck" type="date" value="${e?.lastCheck || todayKey()}"></div>
        <div class="field"><label>Próxima revisión</label><input name="nextCheck" type="date" value="${e?.nextCheck || addDays(todayKey(), 365)}"></div>
      </div>
      <div class="field"><label>Estado</label><select name="status">${selectOptions([['ok', 'En uso'], ['revisar', 'Pendiente de revisar'], ['retirado', 'Retirado / fuera de servicio']], e?.status || 'ok')}</select></div>
      <div class="field"><label>Notas</label><input name="notes" value="${e?.notes || ''}"></div>
    </form>`,
    actions: [
      ...(e ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Eliminar este EPI del registro?', { okLabel: 'Eliminar', danger: true }))) return false; await store.remove('equipment', e.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#epi-form');
        if (!form.reportValidity()) return false;
        await store.put('equipment', { ...(e || {}), ...formValues(form), memberId: formValues(form).memberId || null });
        toast('EPI guardado', 'ok');
        return true;
      } },
    ],
  });
}

async function registerInspection(e) {
  const ok = await confirmDialog(`¿Registrar revisión de "${e.name}" hoy como correcta? La próxima se fijará en 12 meses.`, { okLabel: 'Registrar', title: 'Revisión de EPI' });
  if (!ok) return;
  await store.put('equipment', { ...e, lastCheck: todayKey(), nextCheck: addDays(todayKey(), 365), status: 'ok', inspections: [...(e.inspections || []), { at: nowISO(), by: store.profile?.id, result: 'ok' }] });
  toast('Revisión registrada', 'ok');
}

function openIncidentForm(inc = null) {
  const jobs = sortBy(store.list('jobs'), 'title');
  modal({
    title: inc ? 'Editar incidencia' : 'Nueva incidencia',
    body: html`<form id="inc-form">
      <div class="grid-2">
        <div class="field"><label>Fecha</label><input name="date" type="date" value="${inc?.date || todayKey()}" required></div>
        <div class="field"><label>Gravedad</label><select name="severity">${selectOptions(SEVERITIES, inc?.severity || 'leve')}</select></div>
      </div>
      <div class="field"><label>Trabajo</label><select name="jobId">${selectOptions([['', '— Sin trabajo —'], ...jobs.map((j) => [j.id, j.title])], inc?.jobId || '')}</select></div>
      <div class="field"><label>Qué ha pasado *</label><textarea name="description" required placeholder="Describe la incidencia, personas implicadas, causas…">${inc?.description || ''}</textarea></div>
      <div class="field"><label>Medidas tomadas / propuestas</label><textarea name="actions" placeholder="Qué se hizo y qué se cambia para que no se repita">${inc?.actions || ''}</textarea></div>
    </form>`,
    actions: [
      ...(inc ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Eliminar esta incidencia?', { okLabel: 'Eliminar', danger: true }))) return false; await store.remove('incidents', inc.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#inc-form');
        if (!form.reportValidity()) return false;
        const v = formValues(form);
        await store.put('incidents', { ...(inc || {}), ...v, jobId: v.jobId || null, photoIds: inc?.photoIds || [] });
        toast('Incidencia guardada', 'ok');
        return true;
      } },
    ],
  });
}

export default function safetyView(ctx) {
  const state = { tab: ctx.params.id || 'checklist', jobId: '', notes: '', checks: {} };
  const existing = todayChecklist();
  if (existing) { state.checks = { ...existing.items }; state.jobId = existing.jobId || ''; state.notes = existing.notes || ''; }

  const draw = () => {
    rerender(ctx.el, html`<div class="page">
      <div class="tabs">${[['checklist', '✅ Checklist diario'], ['epis', `🦺 EPIs${epiAlerts().length ? ` (${epiAlerts().length}⚠️)` : ''}`], ['incidencias', '⚠️ Incidencias']].map(([k, l]) => html`<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${l}</button>`)}</div>
      ${state.tab === 'checklist' ? checklistTab() : state.tab === 'epis' ? episTab() : incidentsTab()}
    </div>`);
    hydratePhotos(ctx.el);
  };

  const checklistTab = () => {
    const saved = todayChecklist();
    const jobs = sortBy(activeJobs(), 'title');
    const done = CHECK_ITEMS.filter(([k]) => state.checks[k]).length;
    const history = sortBy(store.list('checklists'), 'createdAt', -1).slice(0, 30);
    return html`
      <div class="card">
        <div class="card-title"><h2>Pre-uso de hoy · ${fmtDate(todayKey(), { weekday: 'long', day: 'numeric', month: 'long' })}</h2>${saved ? html`<span class="chip ${saved.allOk ? 'ok' : 'warn'}">${saved.allOk ? 'Firmado OK' : 'Firmado con observaciones'}</span>` : html`<span class="chip outline">${done}/${CHECK_ITEMS.length}</span>`}</div>
        <div class="field"><label>Trabajo</label><select class="input" id="ck-job">${selectOptions([['', '— Sin trabajo —'], ...jobs.map((j) => [j.id, j.title])], state.jobId)}</select></div>
        ${CHECK_ITEMS.map(([k, l]) => html`<label class="check ${state.checks[k] ? 'done' : ''}"><input type="checkbox" data-check="${k}" ${state.checks[k] ? raw('checked') : ''}><span>${l}</span></label>`)}
        <div class="field mt"><label>Observaciones</label><textarea id="ck-notes" placeholder="Anota cualquier punto no conforme y cómo se ha resuelto">${state.notes}</textarea></div>
        <div class="row gap-s"><button class="btn small ghost" id="ck-all">Marcar todo</button><button class="btn ok grow" id="ck-sign">✍️ Firmar como ${store.profile?.name}</button></div>
        <p class="tiny muted mt">Si algún punto no está conforme, NO se inicia el trabajo en altura hasta resolverlo.</p>
      </div>
      <h2>Historial</h2>
      ${history.length ? html`<div class="list">${history.map((c) => html`<div class="item">${avatar(person(c.memberId), 'small')}<div class="body"><div class="title">${fmtDate(c.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${personName(c.memberId)}</div><div class="sub ellipsis">${store.get('jobs', c.jobId)?.title || 'Sin trabajo'}${c.notes ? ` · ${c.notes}` : ''}</div></div><span class="chip ${c.allOk ? 'ok' : 'warn'}">${Object.values(c.items || {}).filter(Boolean).length}/${CHECK_ITEMS.length}</span></div>`)}</div>` : emptyState('✅', 'Aún no hay checklists firmados.')}`;
  };

  const episTab = () => {
    const list = sortBy(store.list('equipment'), (e) => `${epiState(e)[0] === 'danger' ? 0 : epiState(e)[0] === 'warn' ? 1 : 2}-${e.nextCheck || '9999'}`);
    return html`
      <div class="row between mb"><span class="muted small">Registro de equipos de protección individual y revisiones</span><button class="btn small accent" id="epi-add">+ EPI</button></div>
      ${list.length ? html`<div class="list">${list.map((e) => { const [cls, label] = epiState(e);
        return html`<div class="item"><div class="body clickable" data-epi="${e.id}"><div class="title">${e.type} · ${e.name}</div><div class="sub">${[e.serial ? `Nº ${e.serial}` : '', e.memberId ? personName(e.memberId) : 'Común', e.nextCheck ? `próx. rev. ${fmtDate(e.nextCheck)}` : '', e.expires ? `caduca ${fmtDate(e.expires)}` : ''].filter(Boolean).join(' · ')}</div></div>
          <div class="stack gap-s" style="align-items:flex-end"><span class="chip ${cls}">${label}</span>${e.status !== 'retirado' ? html`<button class="btn small ghost" data-epi-check="${e.id}">Revisado hoy</button>` : ''}</div></div>`; })}</div>`
        : emptyState('🦺', 'Registra arneses, cuerdas, cascos… para no olvidar ninguna revisión.')}`;
  };

  const incidentsTab = () => {
    const list = sortBy(store.list('incidents'), 'date', -1);
    return html`
      <div class="row between mb"><span class="muted small">Accidentes, casi accidentes y situaciones de riesgo</span><button class="btn small accent" id="inc-add">+ Incidencia</button></div>
      ${list.length ? list.map((i) => { const sev = SEVERITIES.find(([k]) => k === i.severity)?.[1] || i.severity; const photos = (i.photoIds || []).map((id) => store.get('photos', id)).filter(Boolean);
        return html`<div class="card tight">
          <div class="row between"><b>${fmtDate(i.date)} · ${store.get('jobs', i.jobId)?.title || 'Sin trabajo'}</b><span class="chip ${i.severity === 'casi' ? 'info' : i.severity === 'leve' ? 'warn' : 'danger'}">${sev}</span></div>
          <p class="pre small" style="margin:.4rem 0">${i.description}</p>
          ${i.actions ? html`<p class="pre small muted" style="margin:0 0 .4rem">Medidas: ${i.actions}</p>` : ''}
          ${photos.length ? html`<div class="photo-grid mb">${photos.map((p, idx) => html`<div class="photo-tile" data-inc-photo="${i.id}:${idx}"><img data-photo="${p.id}" data-thumb="1" alt=""></div>`)}</div>` : ''}
          <div class="row gap-s"><button class="btn small ghost" data-inc-edit="${i.id}">✏️ Editar</button><button class="btn small ghost" data-inc-photo-add="${i.id}">📷 Foto</button><span class="tiny muted grow right">${personName(i.authorId)} · ${fmtDateTime(i.createdAt)}</span></div>
        </div>`; }) : emptyState('⚠️', 'Sin incidencias registradas. ¡Que siga así!')}`;
  };

  ctx.watch(['checklists', 'equipment', 'incidents', 'jobs', 'team', 'photos'], draw);
  draw();

  on(ctx.el, 'click', '[data-tab]', (ev, el) => { state.tab = el.dataset.tab; history.replaceState(null, '', `#/seguridad/${state.tab}`); draw(); });
  ctx.el.addEventListener('change', (ev) => {
    const cb = ev.target.closest('[data-check]');
    if (cb) { state.checks = { ...state.checks, [cb.dataset.check]: cb.checked }; cb.closest('label').classList.toggle('done', cb.checked); }
    if (ev.target.id === 'ck-job') state.jobId = ev.target.value;
  });
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'ck-notes') state.notes = ev.target.value; });
  on(ctx.el, 'click', '#ck-all', () => { state.checks = Object.fromEntries(CHECK_ITEMS.map(([k]) => [k, true])); draw(); });
  on(ctx.el, 'click', '#ck-sign', async () => {
    const allOk = CHECK_ITEMS.every(([k]) => state.checks[k]);
    if (!allOk && !state.notes.trim()) { toast('Hay puntos sin marcar: añade una observación o márcalos', 'warn'); return; }
    const saved = todayChecklist();
    await store.put('checklists', { ...(saved || {}), date: todayKey(), memberId: store.profile.id, jobId: state.jobId || null, items: state.checks, notes: state.notes, allOk, signedAt: nowISO() });
    toast(allOk ? 'Checklist firmado: todo OK' : 'Checklist firmado con observaciones', allOk ? 'ok' : 'warn');
  });
  on(ctx.el, 'click', '#epi-add', () => openEpiForm());
  on(ctx.el, 'click', '[data-epi]', (ev, el) => openEpiForm(store.get('equipment', el.dataset.epi)));
  on(ctx.el, 'click', '[data-epi-check]', (ev, el) => registerInspection(store.get('equipment', el.dataset.epiCheck)));
  on(ctx.el, 'click', '#inc-add', () => openIncidentForm());
  on(ctx.el, 'click', '[data-inc-edit]', (ev, el) => openIncidentForm(store.get('incidents', el.dataset.incEdit)));
  on(ctx.el, 'click', '[data-inc-photo-add]', async (ev, el) => {
    const inc = store.get('incidents', el.dataset.incPhotoAdd);
    const photos = await openUploadDialog({ jobId: inc.jobId, source: 'incidencia' });
    if (photos.length) await store.put('incidents', { ...inc, photoIds: [...(inc.photoIds || []), ...photos.map((p) => p.id)] });
  });
  on(ctx.el, 'click', '[data-inc-photo]', (ev, el) => {
    const [id, idx] = el.dataset.incPhoto.split(':');
    const inc = store.get('incidents', id);
    openLightbox((inc?.photoIds || []).map((p) => store.get('photos', p)).filter(Boolean), Number(idx));
  });
}
