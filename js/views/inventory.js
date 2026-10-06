/* Materiales e inventario: stock por ubicación (almacén / furgonetas), mínimos y lista de compra. */
import { html, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, emptyState, sortBy, waLink } from '../ui.js';
import { store } from '../db.js';

const DEFAULT_LOCATIONS = ['Almacén', 'Furgoneta 1', 'Furgoneta 2'];
const UNITS = ['ud', 'm', 'm²', 'kg', 'l', 'caja', 'bote', 'rollo', 'saco'];

export function lowStock() { return store.list('materials').filter((m) => m.min != null && (m.qty || 0) < m.min); }

function locations() {
  const set = new Set(DEFAULT_LOCATIONS);
  store.list('materials').forEach((m) => m.location && set.add(m.location));
  return [...set];
}

export function openMaterialForm(mat = null) {
  modal({
    title: mat ? 'Editar material' : 'Nuevo material',
    body: html`<form id="mat-form">
      <div class="field"><label>Nombre *</label><input name="name" required value="${mat?.name || ''}" placeholder="Ej. Sellador poliuretano gris 600 ml"></div>
      <div class="grid-3">
        <div class="field"><label>Stock</label><input name="qty" type="number" step="0.01" min="0" value="${mat?.qty ?? 0}"></div>
        <div class="field"><label>Unidad</label><input name="unit" list="units" value="${mat?.unit || 'ud'}"><datalist id="units">${UNITS.map((u) => html`<option value="${u}">`)}</datalist></div>
        <div class="field"><label>Mínimo</label><input name="min" type="number" step="0.01" min="0" value="${mat?.min ?? ''}" placeholder="aviso"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Ubicación</label><input name="location" list="locs" value="${mat?.location || 'Almacén'}"><datalist id="locs">${locations().map((l) => html`<option value="${l}">`)}</datalist></div>
        <div class="field"><label>Precio unitario (€)</label><input name="price" type="number" step="0.01" min="0" value="${mat?.price ?? ''}"></div>
      </div>
      <div class="field"><label>Proveedor</label><input name="supplier" value="${mat?.supplier || ''}" placeholder="Nombre / teléfono / web"></div>
      <div class="field"><label>Notas</label><input name="notes" value="${mat?.notes || ''}"></div>
    </form>`,
    actions: [
      ...(mat ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Eliminar este material?', { okLabel: 'Eliminar', danger: true }))) return false; await store.remove('materials', mat.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#mat-form');
        if (!form.reportValidity()) return false;
        await store.put('materials', { ...(mat || {}), ...formValues(form) });
        toast('Material guardado', 'ok');
        return true;
      } },
    ],
  });
}

export default function inventoryView(ctx) {
  const state = { q: '', loc: '', onlyLow: false };
  const draw = () => {
    let list = sortBy(store.list('materials'), 'name');
    if (state.loc) list = list.filter((m) => m.location === state.loc);
    if (state.onlyLow) list = list.filter((m) => m.min != null && (m.qty || 0) < m.min);
    if (state.q) { const q = state.q.toLowerCase(); list = list.filter((m) => [m.name, m.supplier, m.location, m.notes].join(' ').toLowerCase().includes(q)); }
    const low = lowStock();
    rerender(ctx.el, html`<div class="page">
      ${low.length ? html`<div class="card" style="border-left:5px solid var(--warn)">
        <div class="card-title"><h2>🛒 Lista de compra (${low.length})</h2><button class="btn small ghost" id="inv-share-list">📤 Enviar</button></div>
        ${low.map((m) => html`<div class="row between small" style="padding:.2rem 0"><span>${m.name}</span><b>faltan ${(m.min - (m.qty || 0)).toLocaleString('es-ES')} ${m.unit || ''}</b></div>`)}
      </div>` : ''}
      <div class="search"><input id="inv-q" placeholder="Buscar material…" value="${state.q}"></div>
      <div class="chips scroll mb">
        <span class="chip pick ${!state.loc && !state.onlyLow ? 'active' : ''}" data-loc="">Todo</span>
        <span class="chip pick ${state.onlyLow ? 'active' : ''}" id="inv-low">⚠️ Bajo mínimo</span>
        ${locations().map((l) => html`<span class="chip pick ${state.loc === l ? 'active' : ''}" data-loc="${l}">${l}</span>`)}
      </div>
      ${list.length ? html`<div class="list">${list.map((m) => { const isLow = m.min != null && (m.qty || 0) < m.min;
        return html`<div class="item" data-mat="${m.id}">
          <div class="body clickable" data-open="${m.id}"><div class="title">${m.name} ${isLow ? html`<span class="chip danger tiny">bajo</span>` : ''}</div><div class="sub">${[m.location, m.min != null ? `mín. ${m.min}` : '', m.supplier].filter(Boolean).join(' · ')}</div></div>
          <div class="stepper"><button data-dec="${m.id}" aria-label="Restar">−</button><span>${Number(m.qty || 0).toLocaleString('es-ES')}<span class="tiny muted"> ${m.unit || ''}</span></span><button data-inc="${m.id}" aria-label="Sumar">+</button></div>
        </div>`; })}</div>` : emptyState('📦', 'Sin materiales. Añade lo que lleváis en las furgonetas y el almacén.')}
    </div><button class="fab" id="fab-mat" aria-label="Nuevo material">+</button>`);
  };
  ctx.watch(['materials'], draw);
  draw();
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'inv-q') { state.q = ev.target.value; draw(); } });
  on(ctx.el, 'click', '[data-loc]', (ev, el) => { state.loc = el.dataset.loc; state.onlyLow = false; draw(); });
  on(ctx.el, 'click', '#inv-low', () => { state.onlyLow = !state.onlyLow; state.loc = ''; draw(); });
  on(ctx.el, 'click', '#fab-mat', () => openMaterialForm());
  on(ctx.el, 'click', '[data-open]', (ev, el) => openMaterialForm(store.get('materials', el.dataset.open)));
  const adjust = async (id, d) => { const m = store.get('materials', id); if (m) await store.put('materials', { ...m, qty: Math.max(0, Math.round(((m.qty || 0) + d) * 100) / 100) }); };
  on(ctx.el, 'click', '[data-inc]', (ev, el) => adjust(el.dataset.inc, 1));
  on(ctx.el, 'click', '[data-dec]', (ev, el) => adjust(el.dataset.dec, -1));
  on(ctx.el, 'click', '#inv-share-list', async () => {
    const text = `🛒 Lista de compra Octopus Verticales\n${lowStock().map((m) => `• ${m.name}: ${(m.min - (m.qty || 0)).toLocaleString('es-ES')} ${m.unit || ''}${m.supplier ? ` (${m.supplier})` : ''}`).join('\n')}`;
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelado */ } }
    window.open(waLink('', text), '_blank');
  });
}
