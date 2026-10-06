/* Clientes: comunidades, administradores de fincas, particulares. Contacto rápido e historial de trabajos. */
import {
  html, render, rerender, on, modal, toast, confirmDialog, formValues, emptyState, sortBy, setTopbar, mapsLink, telLink, waLink, navigate,
} from '../ui.js';
import { store } from '../db.js';
import { jobCard, openJobForm } from './jobs.js';

export function openClientForm(client = null, { onSaved } = {}) {
  modal({
    title: client ? 'Editar cliente' : 'Nuevo cliente',
    body: html`<form id="cl-form">
      <div class="field"><label>Nombre *</label><input name="name" required value="${client?.name || ''}" placeholder="Comunidad de Propietarios C/ Mayor 12"></div>
      <div class="grid-2">
        <div class="field"><label>Persona de contacto</label><input name="contact" value="${client?.contact || ''}" placeholder="Presidente, administrador…"></div>
        <div class="field"><label>Teléfono</label><input name="phone" type="tel" value="${client?.phone || ''}"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${client?.email || ''}"></div>
        <div class="field"><label>NIF / CIF</label><input name="nif" value="${client?.nif || ''}"></div>
      </div>
      <div class="field"><label>Dirección</label><input name="address" value="${client?.address || ''}" autocomplete="street-address"></div>
      <div class="field"><label>Notas</label><textarea name="notes" placeholder="Horarios, cómo acceder, preferencias de pago…">${client?.notes || ''}</textarea></div>
    </form>`,
    actions: [
      ...(client ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => {
        if (!(await confirmDialog('¿Eliminar este cliente? Sus trabajos se conservan.', { okLabel: 'Eliminar', danger: true }))) return false;
        await store.remove('clients', client.id); navigate('#/clientes'); return true;
      } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#cl-form');
        if (!form.reportValidity()) return false;
        const saved = await store.put('clients', { ...(client || {}), ...formValues(form) });
        toast('Cliente guardado', 'ok');
        if (onSaved) onSaved(saved);
        return true;
      } },
    ],
  });
}

export default function clientsView(ctx) {
  if (ctx.params.id) return detail(ctx, ctx.params.id);
  const state = { q: '' };
  const draw = () => {
    let clients = sortBy(store.list('clients'), 'name');
    if (state.q) { const q = state.q.toLowerCase(); clients = clients.filter((c) => [c.name, c.contact, c.address, c.phone].join(' ').toLowerCase().includes(q)); }
    rerender(ctx.el, html`<div class="page">
      <div class="search"><input id="cl-q" placeholder="Buscar cliente…" value="${state.q}"></div>
      ${clients.length ? html`<div class="list">${clients.map((c) => { const n = store.list('jobs').filter((j) => j.clientId === c.id).length;
        return html`<a class="item clickable" href="#/clientes/${c.id}"><div class="body"><div class="title">${c.name}</div><div class="sub ellipsis">${[c.contact, c.address].filter(Boolean).join(' · ')}</div></div><div class="meta">${n} trabajo${n !== 1 ? 's' : ''}</div></a>`; })}</div>`
        : emptyState('🏢', 'Sin clientes todavía. Añade comunidades, administradores o particulares.')}
    </div><button class="fab" id="fab-client" aria-label="Nuevo cliente">+</button>`);
  };
  ctx.watch(['clients', 'jobs'], draw);
  draw();
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'cl-q') { state.q = ev.target.value; draw(); } });
  on(ctx.el, 'click', '#fab-client', () => openClientForm(null, { onSaved: (c) => navigate(`#/clientes/${c.id}`) }));
}

function detail(ctx, id) {
  const draw = () => {
    const c = store.get('clients', id);
    if (!c) { render(ctx.el, emptyState('🏢', 'Cliente no encontrado', html`<a class="btn" href="#/clientes">Volver</a>`)); return; }
    setTopbar(c.name);
    const jobs = sortBy(store.list('jobs').filter((j) => j.clientId === id), 'updatedAt', -1);
    render(ctx.el, html`<div class="page">
      <div class="card">
        <h1>${c.name}</h1>
        ${c.contact ? html`<p style="margin:0">👤 ${c.contact}</p>` : ''}
        ${c.nif ? html`<p class="muted small" style="margin:0">${c.nif}</p>` : ''}
        ${c.address ? html`<p style="margin:.3rem 0 0">📍 <a href="${mapsLink(c.address)}" target="_blank" rel="noopener">${c.address}</a></p>` : ''}
        <div class="row wrap gap-s mt">
          ${c.phone ? html`<a class="btn small" href="${telLink(c.phone)}">📞 ${c.phone}</a><a class="btn small ok" href="${waLink(c.phone)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
          ${c.email ? html`<a class="btn small ghost" href="mailto:${c.email}">✉️ Email</a>` : ''}
          <button class="btn small ghost" id="cl-edit">✏️ Editar</button>
        </div>
        ${c.notes ? html`<p class="pre mt small">${c.notes}</p>` : ''}
      </div>
      <div class="row between mb"><h2 style="margin:0">Trabajos (${jobs.length})</h2><button class="btn small accent" id="cl-new-job">+ Trabajo</button></div>
      ${jobs.length ? html`<div class="list">${jobs.map(jobCard)}</div>` : emptyState('🧰', 'Sin trabajos para este cliente')}
    </div>`);
  };
  ctx.watch(['clients', 'jobs', 'team'], draw);
  draw();
  on(ctx.el, 'click', '#cl-edit', () => openClientForm(store.get('clients', id)));
  on(ctx.el, 'click', '#cl-new-job', () => {
    const c = store.get('clients', id);
    const m = openJobForm(null, { onSaved: (j) => navigate(`#/trabajos/${j.id}`) });
    const sel = m.el.querySelector('[name=clientId]'); if (sel) sel.value = id;
    const addr = m.el.querySelector('[name=address]'); if (addr && c.address) addr.value = c.address;
  });
}
