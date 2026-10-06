/* Muro del equipo: publicaciones con texto e imágenes, me gusta y comentarios. */
import {
  html, raw, rerender, on, toast, confirmDialog, pickFiles, relTime, emptyState, sortBy, avatar, selectOptions,
} from '../ui.js';
import { icon } from '../icons.js';
import { store, person } from '../db.js';
import { addPhotos, hydratePhotos, sharePhotos } from '../media.js';
import { openLightbox } from './photos.js';

const compose = { text: '', files: [], previews: [], jobId: '' };
const openComments = new Set();

function linkify(text) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p) => (/^https?:\/\//.test(p) ? html`<a href="${p}" target="_blank" rel="noopener">${p}</a>` : p));
}

export function postCard(post, { compact = false } = {}) {
  const author = person(post.authorId);
  const me = store.profile?.id;
  const likes = post.likes || [];
  const comments = sortBy(store.list('comments').filter((c) => c.postId === post.id), 'createdAt');
  const photos = (post.photoIds || []).map((id) => store.get('photos', id)).filter(Boolean);
  const job = store.get('jobs', post.jobId);
  const showComments = openComments.has(post.id) && !compact;
  const liked = likes.includes(me);
  return html`<div class="card post" data-post="${post.id}">
    <div class="head">${avatar(author)}<div class="grow"><div class="bold">${author.name}</div><div class="tiny muted">${relTime(post.createdAt)}${job ? html` · <a href="#/trabajos/${job.id}">${job.title}</a>` : ''}</div></div>
      ${post.authorId === me && !compact ? html`<button class="icon-btn" data-post-del="${post.id}" aria-label="Eliminar">${icon('trash', { size: 18 })}</button>` : ''}</div>
    ${post.text ? html`<div class="text">${linkify(post.text)}</div>` : ''}
    ${photos.length ? html`<div class="media n${Math.min(photos.length, 4)}">${photos.slice(0, 4).map((p, i) => html`<img data-photo="${p.id}" data-thumb="1" data-post-photo="${post.id}:${i}" alt="${p.caption || ''}" loading="lazy">`)}</div>
      ${photos.length > 4 ? html`<div class="tiny muted">+${photos.length - 4} fotos más</div>` : ''}` : ''}
    ${compact ? '' : html`<div class="actions">
      <button data-like="${post.id}" class="${liked ? 'liked' : ''}">${icon('heart', { size: 18 })} ${likes.length || ''}</button>
      <button data-comments="${post.id}" class="${showComments ? 'active' : ''}">${icon('comment', { size: 18 })} ${comments.length || ''}</button>
      ${photos.length ? html`<button data-share-post="${post.id}" aria-label="Compartir">${icon('share', { size: 18 })}</button>` : ''}
    </div>
    ${showComments ? html`<div class="comments">
      ${comments.map((c) => html`<div class="comment">${avatar(person(c.authorId), 'small')}<div class="bubble"><span class="bold small">${person(c.authorId).name}</span> <span class="tiny muted">${relTime(c.createdAt)}</span><div class="pre">${c.text}</div></div>${c.authorId === me ? html`<button class="icon-btn" data-comment-del="${c.id}" aria-label="Eliminar">${icon('close', { size: 16 })}</button>` : ''}</div>`)}
      <form class="row" data-comment-form="${post.id}"><input class="input grow" name="text" placeholder="Escribe un comentario…" autocomplete="off" required><button class="btn small">Enviar</button></form>
    </div>` : ''}`}
  </div>`;
}

export default function feedView(ctx) {
  const draw = () => {
    const posts = sortBy(store.list('posts'), 'createdAt', -1);
    const me = store.profile;
    const jobs = sortBy(store.list('jobs').filter((j) => !['facturado'].includes(j.status)), 'title');
    rerender(ctx.el, html`
      <div class="page">
        <div class="card compose">
          <div class="row" style="align-items:flex-start">${avatar(me)}<textarea id="compose-text" class="input grow" placeholder="¿Qué está pasando en la obra, ${me?.name?.split(' ')[0] || 'equipo'}?">${compose.text}</textarea></div>
          ${compose.previews.length ? html`<div class="thumbs mb">${compose.previews.map((u, i) => html`<div class="thumb"><img src="${u}" alt=""><button type="button" data-rm-preview="${i}" aria-label="Quitar">${icon('close', { size: 14 })}</button></div>`)}</div>` : ''}
          <div class="row wrap gap-s tools">
            <button class="icon-btn" id="compose-camera" aria-label="Hacer foto">${icon('camera')}</button>
            <button class="icon-btn" id="compose-gallery" aria-label="Adjuntar imagen">${icon('image')}</button>
            <select class="input small grow" id="compose-job" style="min-height:34px;padding:.3rem .5rem">${selectOptions([['', 'Sin trabajo asociado'], ...jobs.map((j) => [j.id, j.title])], compose.jobId)}</select>
            <button class="btn small" id="compose-send" ${compose.text.trim() || compose.files.length ? '' : raw('disabled')}>Publicar</button>
          </div>
        </div>
        ${posts.length ? posts.map((p) => postCard(p)) : emptyState('feed', 'Todavía no hay publicaciones. Cuéntale algo al equipo.')}
      </div>`);
    hydratePhotos(ctx.el);
  };
  ctx.watch(['posts', 'comments', 'photos', 'team', 'jobs'], draw);
  draw();

  ctx.el.addEventListener('input', (ev) => {
    if (ev.target.id === 'compose-text') {
      compose.text = ev.target.value;
      const btn = ctx.el.querySelector('#compose-send');
      if (btn) btn.disabled = !(compose.text.trim() || compose.files.length);
    }
  });
  ctx.el.addEventListener('change', (ev) => { if (ev.target.id === 'compose-job') compose.jobId = ev.target.value; });
  const addFiles = (files) => {
    for (const f of files.slice(0, 8 - compose.files.length)) {
      compose.files.push(f);
      compose.previews.push(URL.createObjectURL(f));
    }
    draw();
  };
  on(ctx.el, 'click', '#compose-camera', async () => addFiles(await pickFiles({ multiple: false, capture: 'environment' })));
  on(ctx.el, 'click', '#compose-gallery', async () => addFiles(await pickFiles({ multiple: true })));
  on(ctx.el, 'click', '[data-rm-preview]', (ev, el) => {
    const i = Number(el.dataset.rmPreview);
    URL.revokeObjectURL(compose.previews[i]);
    compose.files.splice(i, 1); compose.previews.splice(i, 1);
    draw();
  });
  on(ctx.el, 'click', '#compose-send', async (ev, btn) => {
    btn.disabled = true;
    btn.textContent = 'Publicando…';
    const postId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    let photoIds = [];
    if (compose.files.length) {
      const photos = await addPhotos(compose.files, { source: 'muro', tag: 'otro', postId, jobId: compose.jobId || null, caption: compose.text.slice(0, 80) });
      photoIds = photos.map((p) => p.id);
    }
    await store.put('posts', { id: postId, text: compose.text.trim(), photoIds, jobId: compose.jobId || null, likes: [] });
    compose.previews.forEach((u) => URL.revokeObjectURL(u));
    compose.text = ''; compose.files = []; compose.previews = []; compose.jobId = '';
    toast('Publicado', 'ok');
    draw();
  });
  bindPostActions(ctx.el);
}

/** Acciones de publicaciones (me gusta, comentarios, compartir, borrar). Reutilizado por Inicio. */
export function bindPostActions(root) {
  const me = () => store.profile?.id;
  on(root, 'click', '[data-like]', async (ev, el) => {
    const p = store.get('posts', el.dataset.like);
    if (!p) return;
    const likes = (p.likes || []).includes(me()) ? p.likes.filter((x) => x !== me()) : [...(p.likes || []), me()];
    await store.put('posts', { ...p, likes });
  });
  on(root, 'click', '[data-comments]', (ev, el) => {
    const id = el.dataset.comments;
    if (openComments.has(id)) openComments.delete(id); else openComments.add(id);
    store.notify('posts');
  });
  root.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-comment-form]');
    if (!form) return;
    ev.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    await store.put('comments', { postId: form.dataset.commentForm, text });
  });
  on(root, 'click', '[data-comment-del]', async (ev, el) => {
    if (await confirmDialog('¿Eliminar comentario?', { okLabel: 'Eliminar', danger: true })) await store.remove('comments', el.dataset.commentDel);
  });
  on(root, 'click', '[data-post-del]', async (ev, el) => {
    if (await confirmDialog('¿Eliminar esta publicación?', { okLabel: 'Eliminar', danger: true })) { await store.remove('posts', el.dataset.postDel); toast('Publicación eliminada'); }
  });
  on(root, 'click', '[data-share-post]', (ev, el) => {
    const p = store.get('posts', el.dataset.sharePost);
    const photos = (p?.photoIds || []).map((id) => store.get('photos', id)).filter(Boolean);
    sharePhotos(photos, p?.text || '');
  });
  on(root, 'click', '[data-post-photo]', (ev, el) => {
    const [postId, idx] = el.dataset.postPhoto.split(':');
    const p = store.get('posts', postId);
    const photos = (p?.photoIds || []).map((id) => store.get('photos', id)).filter(Boolean);
    openLightbox(photos, Number(idx));
  });
}
