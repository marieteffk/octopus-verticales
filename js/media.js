/* Gestión de imágenes: compresión, miniaturas, almacenamiento local y subida a la nube. */
import { idb, store } from './db.js';
import { uid, toast, download } from './ui.js';
import { cloud } from './cloud.js';

const MAX_SIZE = 1600;
const THUMB_SIZE = 360;
const QUALITY = 0.82;
const urlCache = new Map();

export const PHOTO_TAGS = [
  ['antes', 'Antes'], ['durante', 'Durante'], ['despues', 'Después'],
  ['incidencia', 'Incidencia'], ['material', 'Material'], ['otro', 'Otro'],
];

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = URL.createObjectURL(file);
    });
  }
}

function drawScaled(source, maxSize, quality) {
  const w = source.width, h = source.height;
  const scale = Math.min(1, maxSize / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, cw, ch);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve({ blob, width: cw, height: ch }), 'image/jpeg', quality));
}

/** Comprime una imagen a JPEG y genera una miniatura. */
export async function compressImage(file) {
  const bitmap = await loadBitmap(file);
  const full = await drawScaled(bitmap, MAX_SIZE, QUALITY);
  const thumb = await drawScaled(bitmap, THUMB_SIZE, 0.75);
  if (bitmap.close) bitmap.close();
  return { full, thumb };
}

async function saveBlob(blob) {
  const id = uid();
  await idb.put('blobs', { id, blob, type: blob.type });
  return id;
}

export async function getBlob(id) {
  const row = await idb.get('blobs', id);
  return row?.blob || null;
}

/**
 * Añade fotos: comprime, guarda localmente y crea documentos `photos`.
 * meta: { jobId, tag, caption, source, postId }
 */
export async function addPhotos(files, meta = {}) {
  const created = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const { full, thumb } = await compressImage(file);
      const blobId = await saveBlob(full.blob);
      const thumbId = await saveBlob(thumb.blob);
      const doc = await store.put('photos', {
        blobId, thumbId, url: null, thumbUrl: null,
        width: full.width, height: full.height, size: full.blob.size, mime: 'image/jpeg',
        caption: meta.caption || '', jobId: meta.jobId || null,
        tag: meta.tag || 'otro', source: meta.source || 'galeria', postId: meta.postId || null,
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
      });
      created.push(doc);
      uploadIfCloud(doc, full.blob, thumb.blob);
    } catch (err) {
      console.error(err);
      toast(`No se pudo procesar ${file.name}`, 'error');
    }
  }
  return created;
}

async function uploadIfCloud(doc, fullBlob, thumbBlob) {
  if (!cloud.isActive()) return;
  try {
    const url = await cloud.uploadBlob(`${doc.id}.jpg`, fullBlob);
    const thumbUrl = await cloud.uploadBlob(`${doc.id}_t.jpg`, thumbBlob);
    await attachUrls(doc.id, url, thumbUrl);
  } catch (err) {
    console.error('upload failed', err);
    toast('Foto guardada en el móvil; se subirá cuando haya conexión', 'warn');
  }
}

/** Guarda las URL remotas sobre la versión más reciente del documento (sin resucitar borrados). */
async function attachUrls(id, url, thumbUrl) {
  const latest = store.cache.get('photos')?.get(id);
  if (!latest || latest.deleted) return;
  await store.put('photos', { ...latest, url, thumbUrl });
}

/** Reintenta subir fotos locales sin URL remota (llamado por cloud al reconectar). */
export async function uploadPendingPhotos() {
  if (!cloud.isActive()) return 0;
  let n = 0;
  for (const photo of store.list('photos')) {
    if (photo.url || !photo.blobId) continue;
    const full = await getBlob(photo.blobId);
    const thumb = photo.thumbId ? await getBlob(photo.thumbId) : null;
    if (!full) continue;
    try {
      const url = await cloud.uploadBlob(`${photo.id}.jpg`, full);
      const thumbUrl = thumb ? await cloud.uploadBlob(`${photo.id}_t.jpg`, thumb) : url;
      await attachUrls(photo.id, url, thumbUrl);
      n += 1;
    } catch (err) {
      console.error('retry upload failed', err);
      break;
    }
  }
  return n;
}

/** Devuelve una URL mostrable (local si existe el blob, si no la remota). */
export async function photoUrl(photo, { thumb = false } = {}) {
  if (!photo) return '';
  const remote = thumb ? (photo.thumbUrl || photo.url) : photo.url;
  const blobId = thumb ? (photo.thumbId || photo.blobId) : photo.blobId;
  if (blobId) {
    if (urlCache.has(blobId)) return urlCache.get(blobId);
    const blob = await getBlob(blobId);
    if (blob) {
      const url = URL.createObjectURL(blob);
      urlCache.set(blobId, url);
      return url;
    }
  }
  return remote || '';
}

/** Rellena los <img data-photo="id"> de un contenedor. */
export async function hydratePhotos(root) {
  const imgs = Array.from(root.querySelectorAll('img[data-photo]'));
  await Promise.all(imgs.map(async (img) => {
    const photo = store.get('photos', img.dataset.photo);
    const url = await photoUrl(photo, { thumb: img.dataset.thumb === '1' });
    if (url) img.src = url;
    else img.alt = 'Imagen no disponible';
  }));
}

export async function photoFile(photo) {
  let blob = photo.blobId ? await getBlob(photo.blobId) : null;
  if (!blob && photo.url) blob = await fetch(photo.url).then((r) => r.blob());
  if (!blob) throw new Error('Imagen no disponible');
  const name = `${(photo.caption || 'foto').replace(/[^\w\-]+/g, '_').slice(0, 40)}_${photo.id.slice(0, 6)}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

/** Comparte fotos con la hoja nativa (WhatsApp, correo...) o descarga si no está disponible. */
export async function sharePhotos(photos, text = '') {
  const files = await Promise.all(photos.map(photoFile));
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
    try {
      await navigator.share({ files, text, title: 'Octopus Verticales' });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  files.forEach((f) => download(f.name, f, 'image/jpeg'));
  toast(files.length > 1 ? 'Fotos descargadas' : 'Foto descargada', 'ok');
  return true;
}

export async function deletePhoto(photo) {
  if (photo.blobId) await idb.delete('blobs', photo.blobId).catch(() => {});
  if (photo.thumbId) await idb.delete('blobs', photo.thumbId).catch(() => {});
  if (cloud.isActive() && photo.url) cloud.deleteBlob(`${photo.id}.jpg`).catch(() => {});
  if (cloud.isActive() && photo.thumbUrl) cloud.deleteBlob(`${photo.id}_t.jpg`).catch(() => {});
  await store.remove('photos', photo.id);
}

export function photosForJob(jobId) {
  return store.list('photos').filter((p) => p.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function tagLabel(tag) {
  return PHOTO_TAGS.find(([k]) => k === tag)?.[1] || 'Otro';
}
