/* Trabajos (órdenes de trabajo): listado, ficha, tareas, materiales, horas, presupuesto e historial. */
import {
  html, raw, render, rerender, on, modal, toast, confirmDialog, promptDialog, formValues, selectOptions, searchBox, iconBtn,
  fmtDate, fmtDateTime, nowISO, todayKey, money, mapsLink, telLink, waLink, avatar, emptyState, setTopbar, hoursLabel, sortBy, navigate, uid,
} from '../ui.js';
import { icon } from '../icons.js';
import { store, person, personName, getSettings } from '../db.js';
import { hydratePhotos, photosForJob, tagLabel } from '../media.js';
import { openLightbox, openUploadDialog } from './photos.js';

export const JOB_STATUS = [
  ['presupuesto', 'Presupuesto'], ['pendiente', 'Pendiente'], ['en_curso', 'En curso'], ['terminado', 'Terminado'], ['facturado', 'Facturado'],
];
export const JOB_TYPES = [
  'Reparación de fachada', 'Sellado de juntas', 'Impermeabilización', 'Limpieza de canalones', 'Pintura en altura',
  'Reparación de cornisas', 'Instalación / anclajes', 'Inspección técnica', 'Limpieza de cristales', 'Otro',
];
export const PRIORITIES = [['normal', 'Normal'], ['alta', 'Alta'], ['urgente', 'Urgente']];

export function statusLabel(s) { return JOB_STATUS.find(([k]) => k === s)?.[1] || s; }
export function statusChip(s) {
  const cls = { presupuesto: 'outline', pendiente: 'warn', en_curso: 'info', terminado: 'ok', facturado: 'accent' }[s] || '';
  return html`<span class="chip ${cls}">${statusLabel(s)}</span>`;
}
export function priorityChip(p) {
  if (p === 'urgente') return html`<span class="chip danger">${icon('flame')} Urgente</span>`;
  if (p === 'alta') return html`<span class="chip warn">Prioridad alta</span>`;
  return '';
}
export function clientName(job) { return store.get('clients', job?.clientId)?.name || job?.clientName || ''; }
export function activeJobs() { return store.list('jobs').filter((j) => !['terminado', 'facturado'].includes(j.status)); }

function teamMembers() { return sortBy(store.list('team'), 'name'); }

/* ---------- Formulario ---------- */
export function openJobForm(job = null, { onSaved } = {}) {
  const clients = sortBy(store.list('clients'), 'name');
  const members = teamMembers();
  const me = store.profile;
  const assigned = new Set(job?.assignedIds || (me ? [me.id] : []));
  const m = modal({
    title: job ? 'Editar trabajo' : 'Nuevo trabajo',
    body: html`
      <form id="job-form">
        <div class="field"><label>Título *</label><input name="title" required value="${job?.title || ''}" placeholder="Ej. Sellado de juntas · C/ Mayor 12"></div>
        <div class="field"><label>Cliente</label>
          <div class="row"><select name="clientId" class="grow">${selectOptions([['', 'Sin cliente'], ...clients.map((c) => [c.id, c.name])], job?.clientId || '')}</select>
          ${iconBtn('plus', 'Nuevo', 'ghost small', 'id="job-new-client"')}</div></div>
        <div class="field"><label>Dirección de la obra</label><input name="address" value="${job?.address || ''}" placeholder="Calle, número, ciudad" autocomplete="street-address"></div>
        <div class="grid-2">
          <div class="field"><label>Tipo</label><select name="type">${selectOptions(JOB_TYPES, job?.type || JOB_TYPES[0])}</select></div>
          <div class="field"><label>Prioridad</label><select name="priority">${selectOptions(PRIORITIES, job?.priority || 'normal')}</select></div>
          <div class="field"><label>Estado</label><select name="status">${selectOptions(JOB_STATUS, job?.status || 'pendiente')}</select></div>
          <div class="field"><label>Altura / plantas</label><input name="height" value="${job?.height || ''}" placeholder="Ej. 6 plantas"></div>
          <div class="field"><label>Inicio previsto</label><input name="startDate" type="date" value="${job?.startDate || ''}"></div>
          <div class="field"><label>Fin previsto</label><input name="endDate" type="date" value="${job?.endDate || ''}"></div>
        </div>
        <div class="field"><label>Equipo asignado</label>
          <div class="chips" id="job-assign">${members.map((p) => html`<span class="chip pick ${assigned.has(p.id) ? 'active' : ''}" data-id="${p.id}">${p.name}</span>`)}
          ${members.length ? '' : html`<span class="muted small">Añade compañeros en Equipo</span>`}</div></div>
        <div class="field"><label>Descripción / instrucciones</label><textarea name="description" placeholder="Qué hay que hacer, accesos, contacto en obra, anclajes…">${job?.description || ''}</textarea></div>
        <div class="field"><label>Precio acordado (opcional)</label><input name="price" type="number" step="0.01" min="0" value="${job?.price ?? ''}" placeholder="€"></div>
      </form>`,
    actions: [
      { label: 'Cancelar', cls: 'ghost' },
      { label: job ? 'Guardar' : 'Crear trabajo', onClick: (api) => save(api) },
    ],
  });
  on(m.el, 'click', '#job-assign .chip', (ev, el) => {
    el.classList.toggle('active');
    if (el.classList.contains('active')) assigned.add(el.dataset.id); else assigned.delete(el.dataset.id);
  });
  m.el.querySelector('#job-new-client').addEventListener('click', async () => {
    const name = await promptDialog('Nuevo cliente', { label: 'Nombre del cliente', placeholder: 'Comunidad de propietarios…' });
    if (!name) return;
    const c = await store.put('clients', { name });
    const sel = m.el.querySelector('[name=clientId]');
    sel.insertAdjacentHTML('beforeend', String(html`<option value="${c.id}" selected>${c.name}</option>`));
    sel.value = c.id;
  });
  async function save(api) {
    const form = api.el.querySelector('#job-form');
    if (!form.reportValidity()) return false;
    const v = formValues(form);
    const history = [...(job?.history || [])];
    if (!job) history.push({ at: nowISO(), by: me?.id, text: 'Trabajo creado' });
    else if (job.status !== v.status) history.push({ at: nowISO(), by: me?.id, text: `Estado: ${statusLabel(job.status)} → ${statusLabel(v.status)}` });
    const saved = await store.put('jobs', { ...(job || {}), ...v, assignedIds: [...assigned], history });
    toast(job ? 'Trabajo actualizado' : 'Trabajo creado', 'ok');
    if (onSaved) onSaved(saved);
    return true;
  }
  return m;
}

export async function setJobStatus(job, status) {
  if (job.status === status) return job;
  const history = [...(job.history || []), { at: nowISO(), by: store.profile?.id, text: `Estado: ${statusLabel(job.status)} → ${statusLabel(status)}` }];
  const saved = await store.put('jobs', { ...job, status, history });
  toast(`Estado: ${statusLabel(status)}`, 'ok');
  return saved;
}

/* ---------- Vista ---------- */
export default function jobsView(ctx) {
  if (ctx.params.id) return detailView(ctx, ctx.params.id);
  return listView(ctx);
}

function listView(ctx) {
  const state = { q: '', status: ctx.query.get('estado') || 'activos' };
  const draw = () => {
    let jobs = store.list('jobs');
    if (state.status === 'activos') jobs = jobs.filter((j) => !['terminado', 'facturado'].includes(j.status));
    else if (state.status !== 'todos') jobs = jobs.filter((j) => j.status === state.status);
    if (state.q) {
      const q = state.q.toLowerCase();
      jobs = jobs.filter((j) => [j.title, j.address, clientName(j), j.type].join(' ').toLowerCase().includes(q));
    }
    const order = { urgente: 0, alta: 1, normal: 2 };
    jobs = sortBy(jobs, (j) => `${order[j.priority] ?? 2}-${j.startDate || '9999'}-${j.updatedAt}`);
    rerender(ctx.el, html`
      <div class="page">
        ${searchBox('job-q', 'Buscar por título, dirección, cliente…', state.q)}
        <div class="chips scroll mb">
          ${[['activos', 'Activos'], ['todos', 'Todos'], ...JOB_STATUS].map(([k, l]) => html`<span class="chip pick ${state.status === k ? 'active' : ''}" data-status="${k}">${l}</span>`)}
        </div>
        ${jobs.length ? html`<div class="list">${jobs.map(jobCard)}</div>` : emptyState('briefcase', state.q ? 'Sin resultados' : 'Aún no hay trabajos. Crea el primero con el botón +.')}
      </div>
      <button class="fab" id="fab-job" aria-label="Nuevo trabajo">${icon('plus', { size: 26 })}</button>`);
  };
  ctx.watch(['jobs', 'clients', 'team'], draw);
  draw();
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'job-q') { state.q = ev.target.value; draw(); } });
  on(ctx.el, 'click', '[data-status]', (ev, el) => { state.status = el.dataset.status; draw(); });
  on(ctx.el, 'click', '#fab-job', () => openJobForm(null, { onSaved: (j) => navigate(`#/trabajos/${j.id}`) }));
  if (ctx.query.get('nuevo')) openJobForm(null, { onSaved: (j) => navigate(`#/trabajos/${j.id}`) });
}

export function jobCard(job) {
  const assigned = (job.assignedIds || []).map((id) => person(id));
  return html`
    <a class="item clickable" href="#/trabajos/${job.id}">
      <div class="body">
        <div class="row between gap-s"><span class="title ellipsis">${job.title}</span>${priorityChip(job.priority)}</div>
        <div class="sub ellipsis">${[clientName(job), job.address].filter(Boolean).join(' · ') || job.type}</div>
        <div class="row wrap gap-s" style="margin-top:.4rem">${statusChip(job.status)}
          ${job.startDate ? html`<span class="chip outline">${icon('calendar')} ${fmtDate(job.startDate)}</span>` : ''}
          <span class="row gap-s">${assigned.slice(0, 4).map((p) => avatar(p, 'small'))}</span></div>
      </div>
      ${icon('chevron-right', { cls: 'muted' })}
    </a>`;
}

/* ---------- Ficha ---------- */
function detailView(ctx, id) {
  const state = { tab: ctx.params.sub || 'fotos' };
  const draw = async () => {
    const job = store.get('jobs', id);
    if (!job) { render(ctx.el, emptyState('briefcase', 'Este trabajo ya no existe', html`<a class="btn" href="#/trabajos">Volver</a>`)); return; }
    setTopbar(job.title);
    const client = store.get('clients', job.clientId);
    const assigned = (job.assignedIds || []).map((p) => person(p));
    const idx = JOB_STATUS.findIndex(([k]) => k === job.status);
    rerender(ctx.el, html`
      <div class="page">
        <div class="card">
          <div class="row between" style="align-items:flex-start"><h1 class="grow">${job.title}</h1>${priorityChip(job.priority)}</div>
          <div class="muted small">${job.type}${job.height ? ` · ${job.height}` : ''}</div>
          ${client ? html`<p class="mt row gap-s" style="margin-bottom:.3rem">${icon('building', { cls: 'muted' })}<a href="#/clientes/${client.id}">${client.name}</a>${client.contact ? html`<span class="muted">· ${client.contact}</span>` : ''}</p>` : ''}
          ${job.address ? html`<p class="row gap-s" style="margin-bottom:.3rem">${icon('pin', { cls: 'muted' })}<a href="${mapsLink(job.address)}" target="_blank" rel="noopener">${job.address}</a></p>` : ''}
          ${client?.phone ? html`<div class="row gap-s mt"><a class="btn small ghost" href="${telLink(client.phone)}">${icon('phone', { size: 16 })} Llamar</a><a class="btn small ghost" href="${waLink(client.phone)}" target="_blank" rel="noopener">${icon('comment', { size: 16 })} WhatsApp</a></div>` : ''}
          <div class="status-steps">${JOB_STATUS.map(([k, l], i) => html`<button data-set-status="${k}" class="${i < idx ? 'done' : i === idx ? 'current' : ''}">${l}</button>`)}</div>
          <div class="row wrap gap-s">
            ${job.startDate ? html`<span class="chip outline">Inicio ${fmtDate(job.startDate)}</span>` : ''}
            ${job.endDate ? html`<span class="chip outline">Fin ${fmtDate(job.endDate)}</span>` : ''}
            ${job.price ? html`<span class="chip accent">${money(job.price)}</span>` : ''}
          </div>
          ${assigned.length ? html`<div class="row wrap gap-s mt">${assigned.map((p) => html`<span class="chip">${avatar(p, 'small')} ${p.name}</span>`)}</div>` : ''}
          ${job.description ? html`<p class="pre mt">${job.description}</p>` : ''}
          <div class="row wrap gap-s mt">
            ${iconBtn('edit', 'Editar', 'small ghost', 'id="job-edit"')}
            ${iconBtn('calendar', 'Planificar', 'small ghost', 'id="job-plan"')}
            ${iconBtn('clock', 'Fichar aquí', 'small ghost', 'id="job-clock"')}
            ${iconBtn('share', 'Compartir', 'small ghost', 'id="job-share"')}
            ${iconBtn('trash', '', 'small danger icon', 'id="job-delete" aria-label="Eliminar trabajo"')}
          </div>
        </div>
        <div class="tabs">
          ${[['fotos', 'camera', `Fotos (${photosForJob(id).length})`], ['tareas', 'check-square', `Tareas (${(job.tasks || []).filter((t) => !t.done).length})`], ['materiales', 'box', 'Materiales'], ['horas', 'clock', 'Horas'], ['presupuesto', 'euro', 'Presupuesto'], ['historial', 'history', 'Historial']]
            .map(([k, ic, l]) => html`<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${icon(ic, { size: 16 })}${l}</button>`)}
        </div>
        <div id="job-tab">${renderTab(job, state.tab)}</div>
      </div>`);
    hydratePhotos(ctx.el);
  };
  ctx.watch(['jobs', 'photos', 'clients', 'team', 'timesheets', 'materials'], draw);
  draw();

  on(ctx.el, 'click', '[data-tab]', (ev, el) => { state.tab = el.dataset.tab; history.replaceState(null, '', `#/trabajos/${id}/${state.tab}`); draw(); });
  on(ctx.el, 'click', '[data-set-status]', (ev, el) => setJobStatus(store.get('jobs', id), el.dataset.setStatus));
  on(ctx.el, 'click', '#job-edit', () => openJobForm(store.get('jobs', id)));
  on(ctx.el, 'click', '#job-plan', () => navigate(`#/agenda?trabajo=${id}&nuevo=1`));
  on(ctx.el, 'click', '#job-clock', () => navigate(`#/partes?trabajo=${id}`));
  on(ctx.el, 'click', '#job-share', () => shareSummary(store.get('jobs', id)));
  on(ctx.el, 'click', '#job-delete', async () => {
    if (!(await confirmDialog('¿Eliminar este trabajo? Las fotos se conservarán en la galería.', { okLabel: 'Eliminar', danger: true }))) return;
    await store.remove('jobs', id);
    toast('Trabajo eliminado');
    navigate('#/trabajos');
  });
  on(ctx.el, 'click', '#job-add-photo', () => openUploadDialog({ jobId: id, source: 'trabajo' }));
  on(ctx.el, 'click', '#job-tab .photo-tile', (ev, el) => {
    const list = photosForJob(id);
    openLightbox(list, list.findIndex((p) => p.id === el.dataset.id));
  });
  on(ctx.el, 'click', '#task-add', async () => {
    const text = await promptDialog('Nueva tarea', { placeholder: 'Ej. Revisar anclajes de cubierta' });
    if (!text) return;
    const job = store.get('jobs', id);
    await store.put('jobs', { ...job, tasks: [...(job.tasks || []), { id: uid(), text, done: false }] });
  });
  ctx.el.addEventListener('change', async (ev) => {
    const cb = ev.target.closest('[data-task]');
    if (!cb) return;
    const job = store.get('jobs', id);
    const tasks = (job.tasks || []).map((t) => (t.id === cb.dataset.task ? { ...t, done: cb.checked, doneBy: cb.checked ? store.profile?.id : null } : t));
    await store.put('jobs', { ...job, tasks });
  });
  on(ctx.el, 'click', '[data-task-del]', async (ev, el) => {
    ev.preventDefault();
    const job = store.get('jobs', id);
    await store.put('jobs', { ...job, tasks: (job.tasks || []).filter((t) => t.id !== el.dataset.taskDel) });
  });
  on(ctx.el, 'click', '#mat-add', () => addMaterialDialog(id));
  on(ctx.el, 'click', '[data-mat-del]', async (ev, el) => {
    const job = store.get('jobs', id);
    await store.put('jobs', { ...job, materialsUsed: (job.materialsUsed || []).filter((m) => m.id !== el.dataset.matDel) });
  });
  on(ctx.el, 'click', '#line-add', () => addLineDialog(id));
  on(ctx.el, 'click', '[data-line-del]', async (ev, el) => {
    const job = store.get('jobs', id);
    await store.put('jobs', { ...job, budgetLines: (job.budgetLines || []).filter((l) => l.id !== el.dataset.lineDel) });
  });
  on(ctx.el, 'click', '#budget-print', () => printBudget(store.get('jobs', id)));
  on(ctx.el, 'click', '#hist-add', async () => {
    const text = await promptDialog('Anotación en el historial', { multiline: true, placeholder: 'Ej. Cliente avisado de retraso por lluvia' });
    if (!text) return;
    const job = store.get('jobs', id);
    await store.put('jobs', { ...job, history: [...(job.history || []), { at: nowISO(), by: store.profile?.id, text }] });
  });
}

function renderTab(job, tab) {
  if (tab === 'fotos') {
    const photos = photosForJob(job.id);
    return html`
      <div class="row between mb"><span class="muted small">Antes, durante y después de la intervención</span>${iconBtn('camera', 'Añadir', 'small', 'id="job-add-photo"')}</div>
      ${photos.length ? html`<div class="photo-grid">${photos.map((p) => html`<div class="photo-tile" data-id="${p.id}"><img data-photo="${p.id}" data-thumb="1" alt="${p.caption || ''}" loading="lazy"><span class="tag">${tagLabel(p.tag)}</span></div>`)}</div>`
        : emptyState('camera', 'Sin fotos todavía')}`;
  }
  if (tab === 'tareas') {
    const tasks = job.tasks || [];
    return html`
      <div class="row between mb"><span class="muted small">${tasks.filter((t) => t.done).length} de ${tasks.length} completadas</span>${iconBtn('plus', 'Tarea', 'small', 'id="task-add"')}</div>
      <div class="card tight">${tasks.length ? tasks.map((t) => html`
        <label class="check ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${t.id}" ${t.done ? raw('checked') : ''}><span class="grow">${t.text}</span>
        ${t.done && t.doneBy ? html`<span class="tiny muted">${personName(t.doneBy)}</span>` : ''}<button type="button" class="icon-btn" data-task-del="${t.id}" aria-label="Eliminar">${icon('trash', { size: 16 })}</button></label>`)
        : html`<p class="muted center small">Añade tareas para repartir el trabajo</p>`}</div>`;
  }
  if (tab === 'materiales') {
    const used = job.materialsUsed || [];
    return html`
      <div class="row between mb"><span class="muted small">Material consumido en esta obra</span>${iconBtn('plus', 'Material', 'small', 'id="mat-add"')}</div>
      <div class="card tight">${used.length ? html`<table class="table"><thead><tr><th>Material</th><th class="num">Cantidad</th><th></th></tr></thead><tbody>
        ${used.map((m) => html`<tr><td>${m.name}</td><td class="num">${m.qty} ${m.unit || ''}</td><td class="right"><button class="icon-btn" data-mat-del="${m.id}" aria-label="Quitar">${icon('trash', { size: 16 })}</button></td></tr>`)}</tbody></table>`
        : html`<p class="muted center small">Sin materiales registrados</p>`}</div>`;
  }
  if (tab === 'horas') {
    const sheets = store.list('timesheets').filter((t) => t.jobId === job.id && t.end);
    const byMember = {};
    for (const t of sheets) byMember[t.memberId] = (byMember[t.memberId] || 0) + (new Date(t.end) - new Date(t.start));
    const total = Object.values(byMember).reduce((a, b) => a + b, 0);
    return html`
      <div class="kpis mb"><div class="kpi"><div class="v">${hoursLabel(total)}</div><div class="k">Total horas</div></div><div class="kpi"><div class="v">${sheets.length}</div><div class="k">Fichajes</div></div></div>
      <div class="card tight">${Object.keys(byMember).length ? Object.entries(byMember).map(([mid, ms]) => html`<div class="row between" style="padding:.4rem 0">${avatar(person(mid), 'small')}<span class="grow">${personName(mid)}</span><b>${hoursLabel(ms)}</b></div>`)
        : html`<p class="muted center small">Nadie ha fichado en este trabajo aún. Usa “Fichar aquí”.</p>`}</div>`;
  }
  if (tab === 'presupuesto') {
    const lines = job.budgetLines || [];
    const vat = getSettings().company.vat;
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    return html`
      <div class="row between mb wrap gap-s"><span class="muted small">Líneas del presupuesto</span><div class="row gap-s">${iconBtn('printer', 'Imprimir / PDF', 'small ghost', 'id="budget-print"')}${iconBtn('plus', 'Línea', 'small', 'id="line-add"')}</div></div>
      <div class="card tight">
        ${lines.length ? html`<table class="table"><thead><tr><th>Concepto</th><th class="num">Ud.</th><th class="num">Precio</th><th class="num">Total</th><th></th></tr></thead><tbody>
          ${lines.map((l) => html`<tr><td>${l.desc}</td><td class="num">${l.qty}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.qty * l.price)}</td><td><button class="icon-btn" data-line-del="${l.id}" aria-label="Quitar">${icon('trash', { size: 16 })}</button></td></tr>`)}
          </tbody></table>
          <div class="right mt"><div class="small">Base imponible: <b>${money(subtotal)}</b></div><div class="small">IVA ${vat} %: <b>${money(subtotal * vat / 100)}</b></div><div style="font-size:1.15rem">Total: <b>${money(subtotal * (1 + vat / 100))}</b></div></div>`
          : html`<p class="muted center small">Añade líneas (mano de obra, materiales, medios auxiliares…)</p>`}
      </div>`;
  }
  const hist = [...(job.history || [])].reverse();
  return html`
    <div class="row between mb"><span class="muted small">Cambios y anotaciones</span>${iconBtn('plus', 'Anotación', 'small', 'id="hist-add"')}</div>
    <div class="card tight">${hist.length ? hist.map((h) => html`<div style="padding:.45rem 0;border-bottom:1px solid var(--border)"><div class="pre">${h.text}</div><div class="tiny muted">${fmtDateTime(h.at)} · ${personName(h.by)}</div></div>`) : html`<p class="muted center small">Sin historial</p>`}</div>`;
}

function addMaterialDialog(jobId) {
  const materials = sortBy(store.list('materials'), 'name');
  modal({
    title: 'Añadir material usado',
    body: html`<form id="mat-form">
      <div class="field"><label>Del inventario</label><select name="materialId">${selectOptions([['', 'Escribir a mano'], ...materials.map((x) => [x.id, `${x.name} (stock ${x.qty} ${x.unit || ''})`])], '')}</select></div>
      <div class="field"><label>Nombre (si no está en inventario)</label><input name="name" placeholder="Ej. Sellador PU gris"></div>
      <div class="grid-2"><div class="field"><label>Cantidad</label><input name="qty" type="number" step="0.01" min="0" value="1" required></div><div class="field"><label>Unidad</label><input name="unit" placeholder="ud, m, kg…"></div></div>
      <label class="toggle"><input type="checkbox" name="deduct" checked> Descontar del stock</label>
    </form>`,
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Añadir', onClick: async (api) => {
      const v = formValues(api.el.querySelector('#mat-form'));
      const inv = store.get('materials', v.materialId);
      const name = inv?.name || v.name;
      if (!name) { toast('Indica el material', 'error'); return false; }
      const job = store.get('jobs', jobId);
      await store.put('jobs', { ...job, materialsUsed: [...(job.materialsUsed || []), { id: uid(), materialId: inv?.id || null, name, qty: v.qty || 0, unit: inv?.unit || v.unit, at: nowISO(), by: store.profile?.id }] });
      if (inv && v.deduct) await store.put('materials', { ...inv, qty: Math.max(0, (inv.qty || 0) - (v.qty || 0)) });
      toast('Material añadido', 'ok');
      return true;
    } }],
  });
}

function addLineDialog(jobId) {
  modal({
    title: 'Nueva línea de presupuesto',
    body: html`<form id="line-form">
      <div class="field"><label>Concepto</label><input name="desc" required placeholder="Ej. Mano de obra técnico vertical (hora)"></div>
      <div class="grid-2"><div class="field"><label>Cantidad</label><input name="qty" type="number" step="0.01" min="0" value="1" required></div><div class="field"><label>Precio unitario (€)</label><input name="price" type="number" step="0.01" min="0" required></div></div>
    </form>`,
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Añadir', onClick: async (api) => {
      const form = api.el.querySelector('#line-form');
      if (!form.reportValidity()) return false;
      const v = formValues(form);
      const job = store.get('jobs', jobId);
      await store.put('jobs', { ...job, budgetLines: [...(job.budgetLines || []), { id: uid(), desc: v.desc, qty: v.qty || 0, price: v.price || 0 }] });
      return true;
    } }],
  });
}

function printBudget(job) {
  const s = getSettings();
  const client = store.get('clients', job.clientId);
  const lines = job.budgetLines || [];
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const vat = s.company.vat;
  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes para imprimir', 'warn'); return; }
  w.document.write(String(html`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto · ${job.title}</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:800px;margin:auto}h1{color:#0f2a44;letter-spacing:-.01em}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right}.tot{text-align:right;margin-top:16px;font-size:1.1em}.muted{color:#666}</style></head><body>
    <h1>${s.company.name}</h1><p class="muted">Presupuesto · ${fmtDate(todayKey(), { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <h2>${job.title}</h2>
    ${client ? html`<p><b>Cliente:</b> ${client.name}${client.nif ? ` · ${client.nif}` : ''}<br>${client.address || ''}</p>` : ''}
    ${job.address ? html`<p><b>Obra:</b> ${job.address}</p>` : ''}
    ${job.description ? html`<p>${job.description}</p>` : ''}
    <table><thead><tr><th>Concepto</th><th class="n">Ud.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead><tbody>
    ${lines.map((l) => html`<tr><td>${l.desc}</td><td class="n">${l.qty}</td><td class="n">${money(l.price)}</td><td class="n">${money(l.qty * l.price)}</td></tr>`)}</tbody></table>
    <div class="tot">Base imponible: <b>${money(subtotal)}</b><br>IVA ${vat} %: <b>${money(subtotal * vat / 100)}</b><br><span style="font-size:1.3em">Total: <b>${money(subtotal * (1 + vat / 100))}</b></span></div>
    <p class="muted" style="margin-top:40px">Validez del presupuesto: 30 días. Trabajos verticales realizados por técnicos cualificados con equipos certificados.</p>
    <script>window.onload=()=>window.print()</script></body></html>`));
  w.document.close();
}

async function shareSummary(job) {
  const client = store.get('clients', job.clientId);
  const text = [
    job.title, client ? `Cliente: ${client.name}` : '', job.address ? `Obra: ${job.address}` : '',
    `Estado: ${statusLabel(job.status)}`, job.startDate ? `Inicio: ${fmtDate(job.startDate)}` : '',
    job.description ? `\n${job.description}` : '',
  ].filter(Boolean).join('\n');
  if (navigator.share) { try { await navigator.share({ title: job.title, text }); return; } catch { /* cancelado */ } }
  await navigator.clipboard?.writeText(text);
  toast('Resumen copiado al portapapeles', 'ok');
}
