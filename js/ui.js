/* Utilidades de interfaz: plantillas seguras, modales, toasts, fechas y helpers DOM. */
import { icon } from './icons.js';

export class Raw {
  constructor(html) { this.html = html; }
  toString() { return this.html; }
}

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function raw(html) { return new Raw(html); }

function stringify(value) {
  if (value instanceof Raw) return value.html;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (value === false || value === null || value === undefined) return '';
  return esc(value);
}

/** Plantilla HTML con escape automático de valores interpolados. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += stringify(values[i]);
  });
  return new Raw(out);
}

/** Convierte Raw, string o array (anidado) en HTML final. */
export function toHTML(content) { return Array.isArray(content) ? content.map(toHTML).join('') : String(content ?? ''); }

export function render(container, content) {
  container.innerHTML = toHTML(content);
  return container;
}

/** Re-renderiza conservando el foco y el valor del campo activo (útil con datos en tiempo real). */
export function rerender(container, content) {
  const active = document.activeElement;
  const keep = active && container.contains(active) && active.id && 'value' in active
    ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;
  container.innerHTML = toHTML(content);
  if (keep) {
    const el = container.querySelector(`#${CSS.escape(keep.id)}`);
    if (el) {
      el.value = keep.value;
      try { el.setSelectionRange(keep.start, keep.end); } catch { /* select/checkbox */ }
      el.focus({ preventScroll: true });
    }
  }
  return container;
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/** Delegación de eventos: on(root, 'click', '.btn', (ev, el) => ...) */
export function on(root, event, selector, handler) {
  const listener = (ev) => {
    const target = ev.target.closest(selector);
    if (target && root.contains(target)) handler(ev, target);
  };
  root.addEventListener(event, listener);
  return () => root.removeEventListener(event, listener);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/* ---------- Fechas ---------- */
const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function todayKey() { return dateKey(new Date()); }
export function nowISO() { return new Date().toISOString(); }

export function fmtDate(value, opts = { day: 'numeric', month: 'short' }) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', opts);
}
export function fmtLongDate(value) {
  return fmtDate(value, { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fmtTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
export function fmtDateTime(value) {
  if (!value) return '';
  return `${fmtDate(value)} ${fmtTime(value)}`;
}
export function relTime(value) {
  if (!value) return '';
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`;
  return fmtDate(value);
}
export function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
export function hoursLabel(ms) {
  const h = ms / 3600000;
  return `${h.toFixed(h >= 10 ? 0 : 1)} h`;
}
export function money(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/* ---------- Personas ---------- */
const PALETTE = ['#116a9a', '#ff7a1a', '#1f9d55', '#7b4bd1', '#d9342b', '#0a8f8f', '#c2185b', '#5d6d7e'];
export function colorFor(seed = '') {
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
export function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0] || '').join('').toUpperCase() || '?';
}
export function avatar(person, cls = '') {
  const name = person?.name || '?';
  const color = person?.color || colorFor(person?.id || name);
  return html`<span class="avatar ${cls}" style="background:${color}" title="${name}">${initials(name)}</span>`;
}

/* ---------- Toasts ---------- */
export function toast(message, type = '') {
  const root = document.getElementById('toasts');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Modales ---------- */
const modalStack = [];

export function modal({ title, body, actions = [], onOpen, wide = false, closable = true }) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  const actionsHtml = actions.map((a, i) => html`<button class="btn ${a.cls || ''}" data-action="${i}" type="button">${a.label}</button>`);
  back.innerHTML = String(html`
    <div class="modal" role="dialog" aria-modal="true" ${wide ? raw('style="max-width:860px"') : ''}>
      <div class="modal-head">
        <h2>${title}</h2>
        ${closable ? html`<button class="icon-btn" data-close aria-label="Cerrar">${icon('close')}</button>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? html`<div class="modal-actions">${actionsHtml}</div>` : ''}
    </div>`);
  root.appendChild(back);
  const dialog = back.querySelector('.modal');
  const api = {
    el: dialog,
    close() {
      back.remove();
      const idx = modalStack.indexOf(api);
      if (idx >= 0) modalStack.splice(idx, 1);
      if (!modalStack.length) document.body.style.overflow = '';
    },
  };
  modalStack.push(api);
  document.body.style.overflow = 'hidden';
  back.addEventListener('click', (ev) => {
    if (ev.target === back && closable) api.close();
    const closeBtn = ev.target.closest('[data-close]');
    if (closeBtn) api.close();
    const actBtn = ev.target.closest('[data-action]');
    if (actBtn) {
      const act = actions[Number(actBtn.dataset.action)];
      if (!act?.onClick) { api.close(); return; }
      actBtn.disabled = true;
      Promise.resolve().then(() => act.onClick(api))
        .then((result) => { if (result !== false && !act.keepOpen) api.close(); })
        .catch((err) => { console.error(err); toast(err.message || 'Se produjo un error', 'error'); })
        .finally(() => { actBtn.disabled = false; });
    }
  });
  // Un formulario del diálogo sin botón de envío (Enter en el móvil) no debe recargar la página.
  back.addEventListener('submit', (ev) => { if (!ev.defaultPrevented) ev.preventDefault(); });
  if (onOpen) onOpen(api);
  const first = dialog.querySelector('input, textarea, select');
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 50);
  return api;
}

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top) { top.close(); return true; }
  return false;
}

export function confirmDialog(message, { okLabel = 'Aceptar', danger = false, title = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    modal({
      title,
      body: html`<p>${message}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: () => resolve(false) },
        { label: okLabel, cls: danger ? 'danger' : '', onClick: () => resolve(true) },
      ],
    });
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', multiline = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: html`<form id="prompt-form" class="field">
        ${label ? html`<label for="prompt-input">${label}</label>` : ''}
        ${multiline
          ? html`<textarea id="prompt-input" placeholder="${placeholder}">${value}</textarea>`
          : html`<input id="prompt-input" value="${value}" placeholder="${placeholder}">`}
      </form>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', onClick: () => resolve(null) },
        { label: 'Guardar', onClick: (api) => resolve(api.el.querySelector('#prompt-input').value.trim()) },
      ],
    });
    m.el.querySelector('#prompt-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      resolve(m.el.querySelector('#prompt-input').value.trim());
      m.close();
    });
  });
}

/* ---------- Formularios ---------- */
export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function pickFiles({ accept = 'image/*', multiple = true, capture = null } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.capture = capture;
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (files) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files || [])));
    input.addEventListener('cancel', () => finish([]));
    input.click();
  });
}

export function selectOptions(options, selected) {
  return options.map((o) => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    return html`<option value="${value}" ${String(value) === String(selected) ? raw('selected') : ''}>${label}</option>`;
  });
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function mapsLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
}
export function telLink(phone) { return `tel:${String(phone || '').replace(/\s+/g, '')}`; }
export function waLink(phone, text = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  const intl = digits.length === 9 ? `34${digits}` : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function emptyState(iconName, text, action = '') {
  return html`<div class="empty"><div class="ico">${icon(iconName, { size: 44 })}</div><div>${text}</div>${action ? html`<div class="mt">${action}</div>` : ''}</div>`;
}

export function searchBox(id, placeholder, value = '') {
  return html`<div class="search">${icon('search', { size: 18 })}<input id="${id}" type="search" placeholder="${placeholder}" value="${value}" autocomplete="off"></div>`;
}

/** Botón con icono y texto: iconBtn('edit', 'Editar', 'small ghost', 'id="x"') */
export function iconBtn(name, label, cls = '', attrs = '') {
  return html`<button class="btn ${cls}" type="button" ${raw(attrs)}>${icon(name, { size: 16 })}${label ? html`<span>${label}</span>` : ''}</button>`;
}

export function sectionTitle(title, linkHref = '', linkLabel = 'Ver todo') {
  return html`<div class="section-title"><h2>${title}</h2>${linkHref ? html`<a href="${linkHref}">${linkLabel}</a>` : ''}</div>`;
}

export function navigate(hash) { location.hash = hash; }

export function setTopbar(title, actionsHtml = '') {
  const t = document.getElementById('topbar-title');
  const a = document.getElementById('topbar-actions');
  if (t) t.textContent = title;
  if (a) a.innerHTML = String(actionsHtml);
  document.title = title === 'Octopus Verticales' ? title : `${title} · Octopus Verticales`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function sortBy(arr, key, dir = 1) {
  return [...arr].sort((a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    if (va === vb) return 0;
    if (va === undefined || va === null) return 1;
    if (vb === undefined || vb === null) return -1;
    return (va > vb ? 1 : -1) * dir;
  });
}

export function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}
