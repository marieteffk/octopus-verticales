/* Notas rápidas y listas de comprobación, personales o compartidas con el equipo. */
import {
  html, raw, render, rerender, on, modal, toast, confirmDialog, formValues, relTime, emptyState, sortBy, uid, avatar, searchBox,
} from '../ui.js';
import { icon } from '../icons.js';
import { store, person } from '../db.js';

const COLORS = [['orange', 'Naranja'], ['blue', 'Azul'], ['green', 'Verde'], ['yellow', 'Amarillo'], ['red', 'Rojo'], ['grey', 'Gris']];

export function openNoteForm(note = null) {
  const items = [...(note?.items || [])];
  const me = store.profile;
  const m = modal({
    title: note ? 'Editar nota' : 'Nueva nota',
    body: html`<form id="note-form">
      <div class="field"><label>Título</label><input name="title" value="${note?.title || ''}" placeholder="Ej. Material para el lunes"></div>
      <div class="field"><label>Texto</label><textarea name="body" placeholder="Escribe lo que no se puede olvidar…">${note?.body || ''}</textarea></div>
      <div class="field"><label>Lista de comprobación</label>
        <div id="note-items">${items.map((it, i) => itemRow(it, i))}</div>
        <div class="row"><input id="note-new-item" class="input grow" placeholder="Añadir elemento y pulsar Enter"><button type="button" class="btn small icon" id="note-add-item" aria-label="Añadir">${icon('plus', { size: 16 })}</button></div></div>
      <div class="grid-2">
        <div class="field"><label>Color</label><select name="color">${COLORS.map(([v, l]) => html`<option value="${v}" ${(note?.color || 'orange') === v ? raw('selected') : ''}>${l}</option>`)}</select></div>
        <div class="field"><label>Etiquetas</label><input name="tags" value="${(note?.tags || []).join(', ')}" placeholder="obra, compras, aviso"></div>
      </div>
      <div class="row wrap" style="gap:1rem">
        <label class="toggle"><input type="checkbox" name="shared" ${note ? (note.shared ? raw('checked') : '') : raw('checked')}> Compartida con el equipo</label>
        <label class="toggle"><input type="checkbox" name="pinned" ${note?.pinned ? raw('checked') : ''}> Fijar arriba</label>
      </div>
    </form>`,
    actions: [
      ...(note ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => {
        if (!(await confirmDialog('¿Eliminar esta nota?', { okLabel: 'Eliminar', danger: true }))) return false;
        await store.remove('notes', note.id); toast('Nota eliminada'); return true;
      } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const v = formValues(api.el.querySelector('#note-form'));
        if (!v.title && !v.body && !items.length) { toast('La nota está vacía', 'warn'); return false; }
        const tags = v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
        await store.put('notes', { ...(note || {}), title: v.title, body: v.body, items, color: v.color, tags, shared: v.shared, pinned: v.pinned, ownerId: note?.ownerId || me?.id });
        toast('Nota guardada', 'ok');
        return true;
      } },
    ],
  });
  const redrawItems = () => { render(m.el.querySelector('#note-items'), items.map((it, i) => itemRow(it, i))); };
  const addItem = () => {
    const input = m.el.querySelector('#note-new-item');
    const text = input.value.trim();
    if (!text) return;
    items.push({ id: uid(), text, done: false });
    input.value = '';
    redrawItems();
    input.focus();
  };
  m.el.querySelector('#note-add-item').addEventListener('click', addItem);
  m.el.querySelector('#note-new-item').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addItem(); } });
  on(m.el, 'click', '[data-item-del]', (ev, el) => { items.splice(Number(el.dataset.itemDel), 1); redrawItems(); });
  m.el.addEventListener('change', (ev) => {
    const cb = ev.target.closest('[data-item-toggle]');
    if (cb) items[Number(cb.dataset.itemToggle)] = { ...items[Number(cb.dataset.itemToggle)], done: cb.checked };
  });
  return m;
}

function itemRow(it, i) {
  return html`<label class="check ${it.done ? 'done' : ''}"><input type="checkbox" data-item-toggle="${i}" ${it.done ? raw('checked') : ''}><span class="grow">${it.text}</span><button type="button" class="icon-btn" data-item-del="${i}" aria-label="Quitar">${icon('close', { size: 16 })}</button></label>`;
}

export function noteCard(n, { compact = false } = {}) {
  const items = n.items || [];
  const done = items.filter((i) => i.done).length;
  const owner = person(n.ownerId || n.authorId);
  return html`<div class="card tight clickable note-card c-${n.color || 'orange'}" data-note="${n.id}">
    <div class="row between gap-s">
      <div class="bold ellipsis grow row gap-s">${n.pinned ? icon('pushpin', { size: 14, cls: 'muted' }) : ''}${n.title || html`<span class="muted">Sin título</span>`}</div>
      ${n.shared ? html`<span class="chip info tiny">Equipo</span>` : html`<span class="chip outline tiny">Privada</span>`}
    </div>
    ${n.body ? html`<div class="pre small" style="margin-top:.3rem;${compact ? 'max-height:3.9em;overflow:hidden' : ''}">${n.body}</div>` : ''}
    ${items.length ? html`<div style="margin-top:.35rem">${(compact ? items.slice(0, 4) : items).map((it) => html`<label class="check ${it.done ? 'done' : ''}" style="padding:.15rem 0"><input type="checkbox" data-note-item="${n.id}:${it.id}" ${it.done ? raw('checked') : ''}><span class="small">${it.text}</span></label>`)}
      ${compact && items.length > 4 ? html`<div class="tiny muted">+${items.length - 4} más</div>` : ''}
      <div class="tiny muted">${done} de ${items.length} hechas</div></div>` : ''}
    <div class="row between" style="margin-top:.45rem">
      <span class="row gap-s">${avatar(owner, 'small')}<span class="tiny muted">${owner.name} · ${relTime(n.updatedAt)}</span></span>
      <span class="chips">${(n.tags || []).map((t) => html`<span class="chip outline tiny">#${t}</span>`)}</span>
    </div>
  </div>`;
}

export function visibleNotes() {
  const me = store.profile?.id;
  return store.list('notes').filter((n) => n.shared || n.ownerId === me || n.authorId === me);
}

export default function notesView(ctx) {
  const state = { q: '', filter: 'todas' };
  const draw = () => {
    const me = store.profile?.id;
    let notes = visibleNotes();
    if (state.filter === 'mias') notes = notes.filter((n) => (n.ownerId || n.authorId) === me);
    if (state.filter === 'equipo') notes = notes.filter((n) => n.shared);
    if (state.filter === 'pendientes') notes = notes.filter((n) => (n.items || []).some((i) => !i.done));
    if (state.q) {
      const q = state.q.toLowerCase();
      notes = notes.filter((n) => [n.title, n.body, (n.tags || []).join(' '), ...(n.items || []).map((i) => i.text)].join(' ').toLowerCase().includes(q));
    }
    notes = [...sortBy(notes.filter((n) => n.pinned), 'updatedAt', -1), ...sortBy(notes.filter((n) => !n.pinned), 'updatedAt', -1)];
    rerender(ctx.el, html`
      <div class="page">
        ${searchBox('note-q', 'Buscar en notas…', state.q)}
        <div class="chips scroll mb">${[['todas', 'Todas'], ['mias', 'Mías'], ['equipo', 'Equipo'], ['pendientes', 'Con tareas pendientes']].map(([k, l]) => html`<span class="chip pick ${state.filter === k ? 'active' : ''}" data-filter="${k}">${l}</span>`)}</div>
        ${notes.length ? notes.map((n) => noteCard(n)) : emptyState('note', 'No hay notas. Apunta lo que no se puede olvidar con el botón +.')}
      </div>
      <button class="fab" id="fab-note" aria-label="Nueva nota">${icon('plus', { size: 26 })}</button>`);
  };
  ctx.watch(['notes', 'team'], draw);
  draw();
  if (ctx.query.get('nueva')) openNoteForm();
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'note-q') { state.q = ev.target.value; draw(); } });
  on(ctx.el, 'click', '[data-filter]', (ev, el) => { state.filter = el.dataset.filter; draw(); });
  on(ctx.el, 'click', '#fab-note', () => openNoteForm());
  bindNoteCards(ctx.el);
}

/** Enlaza clics en tarjetas de nota (abrir) y cambios en sus checkboxes (marcar). Reutilizado por Inicio. */
export function bindNoteCards(root) {
  on(root, 'click', '[data-note]', (ev, el) => {
    if (ev.target.closest('input, label.check')) return;
    const n = store.get('notes', el.dataset.note);
    if (n) openNoteForm(n);
  });
  root.addEventListener('change', async (ev) => {
    const cb = ev.target.closest('[data-note-item]');
    if (!cb) return;
    const [noteId, itemId] = cb.dataset.noteItem.split(':');
    const n = store.get('notes', noteId);
    if (!n) return;
    await store.put('notes', { ...n, items: (n.items || []).map((i) => (i.id === itemId ? { ...i, done: cb.checked, doneBy: cb.checked ? store.profile?.id : null } : i)) });
  });
}
