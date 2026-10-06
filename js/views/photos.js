/* Galería de fotos compartida: subir (cámara/galería), filtrar, ver, compartir y seleccionar varias. */
import {
  html, raw, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, pickFiles,
  fmtDateTime, emptyState, sortBy,
} from '../ui.js';
import { store, personName } from '../db.js';
import { addPhotos, hydratePhotos, photoUrl, sharePhotos, deletePhoto, PHOTO_TAGS, tagLabel } from '../media.js';

function jobOptions(selected) {
  const jobs = sortBy(store.list('jobs'), 'title');
  return selectOptions([['', '— Sin trabajo —'], ...jobs.map((j) => [j.id, j.title])], selected || '');
}

/** Diálogo de subida: elige archivos y metadatos (trabajo, etiqueta, pie). */
export async function openUploadDialog({ jobId = null, source = 'galeria', capture = null, files = null } = {}) {
  const picked = files || await pickFiles({ accept: 'image/*', multiple: !capture, capture });
  if (!picked.length) return [];
  let result = [];
  const previews = picked.slice(0, 12).map((f) => URL.createObjectURL(f));
  await new Promise((resolve) => {
    modal({
      title: `${picked.length} foto${picked.length > 1 ? 's' : ''} para subir`,
      body: html`<form id="up-form">
        <div class="thumbs mb">${previews.map((u) => html`<div class="thumb"><img src="${u}" alt=""></div>`)}${picked.length > 12 ? html`<span class="muted small">+${picked.length - 12}</span>` : ''}</div>
        <div class="field"><label>Trabajo</label><select name="jobId">${jobOptions(jobId)}</select></div>
        <div class="field"><label>Etiqueta</label><select name="tag">${selectOptions(PHOTO_TAGS, jobId ? 'durante' : 'otro')}</select></div>
        <div class="field"><label>Pie de foto (opcional)</label><input name="caption" placeholder="Ej. Grieta en cornisa lado norte"></div>
      </form>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: () => resolve() },
        { label: 'Guardar fotos', cls: 'accent', onClick: async (api) => {
          const v = formValues(api.el.querySelector('#up-form'));
          toast('Procesando fotos…');
          result = await addPhotos(picked, { jobId: v.jobId || null, tag: v.tag, caption: v.caption, source });
          toast(`${result.length} foto${result.length !== 1 ? 's' : ''} guardada${result.length !== 1 ? 's' : ''}`, 'ok');
          resolve();
          return true;
        } },
      ],
    });
  });
  previews.forEach((u) => URL.revokeObjectURL(u));
  return result;
}

/** Visor a pantalla completa con navegación, compartir, editar y borrar. */
export function openLightbox(photos, index = 0) {
  if (!photos.length) return;
  let i = Math.max(0, index);
  const box = document.createElement('div');
  box.className = 'lightbox';
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  const close = () => { box.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); if (ev.key === 'ArrowRight') go(1); if (ev.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', onKey);
  const go = (d) => { i = (i + d + photos.length) % photos.length; draw(); };
  const draw = async () => {
    const p = store.get('photos', photos[i].id) || photos[i];
    const job = store.get('jobs', p.jobId);
    box.innerHTML = String(html`
      <div class="bar"><button class="icon-btn" data-lb="close" aria-label="Cerrar">✕</button><span class="grow small">${i + 1} / ${photos.length}</span>
        <button class="icon-btn" data-lb="share" aria-label="Compartir">📤</button><button class="icon-btn" data-lb="edit" aria-label="Editar">✏️</button><button class="icon-btn" data-lb="del" aria-label="Eliminar">🗑️</button></div>
      <img alt="${p.caption || ''}" data-lb-img>
      <div class="caption">
        <div class="row between"><span>${p.caption || html`<span class="muted">Sin descripción</span>`}</span><span class="chip">${tagLabel(p.tag)}</span></div>
        <div class="tiny muted">${personName(p.authorId)} · ${fmtDateTime(p.createdAt)}${job ? html` · <a href="#/trabajos/${job.id}" style="color:#9cd" data-lb="close">${job.title}</a>` : ''}</div>
      </div>`);
    box.querySelector('[data-lb-img]').src = await photoUrl(p);
  };
  let startX = null;
  box.addEventListener('touchstart', (ev) => { startX = ev.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (ev) => {
    if (startX === null) return;
    const dx = ev.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    startX = null;
  });
  box.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-lb]');
    const p = store.get('photos', photos[i].id) || photos[i];
    if (!btn) { if (ev.target.tagName === 'IMG') go(ev.clientX > window.innerWidth / 2 ? 1 : -1); return; }
    const act = btn.dataset.lb;
    if (act === 'close') close();
    if (act === 'share') sharePhotos([p], p.caption || '');
    if (act === 'edit') editPhotoDialog(p).then(draw);
    if (act === 'del') {
      if (await confirmDialog('¿Eliminar esta foto para todo el equipo?', { okLabel: 'Eliminar', danger: true })) {
        await deletePhoto(p);
        photos.splice(i, 1);
        if (!photos.length) close(); else { i = Math.min(i, photos.length - 1); draw(); }
      }
    }
  });
  draw();
}

function editPhotoDialog(photo) {
  return new Promise((resolve) => {
    modal({
      title: 'Editar foto',
      body: html`<form id="ph-form">
        <div class="field"><label>Pie de foto</label><input name="caption" value="${photo.caption || ''}"></div>
        <div class="field"><label>Trabajo</label><select name="jobId">${jobOptions(photo.jobId)}</select></div>
        <div class="field"><label>Etiqueta</label><select name="tag">${selectOptions(PHOTO_TAGS, photo.tag)}</select></div>
      </form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost', onClick: () => resolve() }, { label: 'Guardar', onClick: async (api) => {
        const v = formValues(api.el.querySelector('#ph-form'));
        await store.put('photos', { ...photo, caption: v.caption, jobId: v.jobId || null, tag: v.tag });
        resolve();
        return true;
      } }],
    });
  });
}

/* ---------- Vista ---------- */
export default function photosView(ctx) {
  const state = { job: ctx.query.get('trabajo') || '', tag: '', select: false, selected: new Set(), q: '' };
  const filtered = () => {
    let list = store.list('photos');
    if (state.job) list = list.filter((p) => p.jobId === state.job);
    if (state.tag) list = list.filter((p) => p.tag === state.tag);
    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((p) => [p.caption, store.get('jobs', p.jobId)?.title, personName(p.authorId)].join(' ').toLowerCase().includes(q));
    }
    return sortBy(list, 'createdAt', -1);
  };
  const draw = () => {
    const list = filtered();
    const groups = {};
    for (const p of list) (groups[p.createdAt.slice(0, 10)] = groups[p.createdAt.slice(0, 10)] || []).push(p);
    rerender(ctx.el, html`
      <div class="page">
        <div class="row gap-s mb">
          <button class="btn accent grow" id="ph-camera">📷 Cámara</button>
          <button class="btn grow" id="ph-gallery">🖼️ Galería</button>
          <button class="btn ghost ${state.select ? 'accent' : ''}" id="ph-select">${state.select ? `✓ ${state.selected.size}` : 'Seleccionar'}</button>
        </div>
        ${state.select ? html`<div class="row gap-s mb wrap"><button class="btn small ok" id="ph-share-sel" ${state.selected.size ? '' : raw('disabled')}>📤 Compartir seleccionadas</button><button class="btn small danger" id="ph-del-sel" ${state.selected.size ? '' : raw('disabled')}>🗑️ Eliminar</button><button class="btn small ghost" id="ph-sel-all">Todas</button></div>` : ''}
        <div class="search"><input id="ph-q" placeholder="Buscar por pie, trabajo o autor…" value="${state.q}"></div>
        <div class="row gap-s mb">
          <select class="input grow" id="ph-job">${jobOptions(state.job)}</select>
          <select class="input" id="ph-tag" style="max-width:45%">${selectOptions([['', 'Todas las etiquetas'], ...PHOTO_TAGS], state.tag)}</select>
        </div>
        ${list.length ? Object.entries(groups).map(([day, ps]) => html`
          <div class="muted small bold" style="margin:.75rem 0 .35rem">${new Date(day + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · ${ps.length}</div>
          <div class="photo-grid">${ps.map((p) => html`<div class="photo-tile" data-id="${p.id}" style="${state.selected.has(p.id) ? 'outline:3px solid var(--accent)' : ''}">
            <img data-photo="${p.id}" data-thumb="1" alt="${p.caption || ''}" loading="lazy">
            ${p.jobId ? html`<span class="tag">${tagLabel(p.tag)}</span>` : ''}
            ${state.select ? html`<span class="tag" style="left:auto;right:4px;top:4px;bottom:auto">${state.selected.has(p.id) ? '☑' : '☐'}</span>` : ''}
          </div>`)}</div>`)
          : emptyState('📷', 'No hay fotos con estos filtros. Haz una con la cámara o sube desde la galería.')}
      </div>`);
    hydratePhotos(ctx.el);
  };
  ctx.watch(['photos', 'jobs', 'team'], draw);
  draw();
  if (ctx.query.get('nueva')) openUploadDialog({ capture: 'environment' });

  on(ctx.el, 'click', '#ph-camera', () => openUploadDialog({ capture: 'environment' }));
  on(ctx.el, 'click', '#ph-gallery', () => openUploadDialog({}));
  on(ctx.el, 'click', '#ph-select', () => { state.select = !state.select; state.selected.clear(); draw(); });
  on(ctx.el, 'click', '#ph-sel-all', () => { filtered().forEach((p) => state.selected.add(p.id)); draw(); });
  on(ctx.el, 'click', '#ph-share-sel', () => sharePhotos(filtered().filter((p) => state.selected.has(p.id))));
  on(ctx.el, 'click', '#ph-del-sel', async () => {
    if (!(await confirmDialog(`¿Eliminar ${state.selected.size} fotos?`, { okLabel: 'Eliminar', danger: true }))) return;
    for (const p of filtered().filter((x) => state.selected.has(x.id))) await deletePhoto(p);
    state.selected.clear(); state.select = false; draw();
    toast('Fotos eliminadas');
  });
  ctx.el.addEventListener('input', (ev) => { if (ev.target.id === 'ph-q') { state.q = ev.target.value; draw(); } });
  ctx.el.addEventListener('change', (ev) => {
    if (ev.target.id === 'ph-job') { state.job = ev.target.value; draw(); }
    if (ev.target.id === 'ph-tag') { state.tag = ev.target.value; draw(); }
  });
  on(ctx.el, 'click', '.photo-tile', (ev, el) => {
    const list = filtered();
    if (state.select) {
      if (state.selected.has(el.dataset.id)) state.selected.delete(el.dataset.id); else state.selected.add(el.dataset.id);
      draw();
      return;
    }
    openLightbox(list, list.findIndex((p) => p.id === el.dataset.id));
  });
}
