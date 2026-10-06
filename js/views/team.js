/* Equipo: quién es quién, disponibilidad, contacto y carga de trabajo. */
import { html, rerender, on, modal, toast, confirmDialog, formValues, selectOptions, emptyState, sortBy, avatar, telLink, waLink, hoursLabel, todayKey, addDays, colorFor } from '../ui.js';
import { icon } from '../icons.js';
import { store, getSettings, saveSettings, ROLES } from '../db.js';
import { activeEntry } from './timesheets.js';
import { cloud } from '../cloud.js';

export const STATUSES = [['disponible', 'Disponible', 'ok'], ['obra', 'En obra', 'info'], ['vacaciones', 'Vacaciones', 'warn'], ['baja', 'Baja', 'danger']];

function openMemberForm(m = null) {
  modal({
    title: m ? 'Editar compañero/a' : 'Añadir compañero/a',
    body: html`<form id="tm-form">
      <div class="field"><label>Nombre *</label><input name="name" required value="${m?.name || ''}"></div>
      <div class="grid-2">
        <div class="field"><label>Puesto</label><select name="role">${selectOptions(ROLES, m?.role || 'tecnico')}</select></div>
        <div class="field"><label>Teléfono</label><input name="phone" type="tel" value="${m?.phone || ''}"></div>
      </div>
      <div class="field"><label>Estado</label><select name="status">${selectOptions(STATUSES.map(([k, l]) => [k, l]), m?.status || 'disponible')}</select></div>
      <div class="field"><label>Notas (certificados, carnet, especialidad…)</label><input name="notes" value="${m?.notes || ''}"></div>
    </form>`,
    actions: [
      ...(m && m.id !== store.profile?.id ? [{ label: 'Eliminar', cls: 'danger', onClick: async () => { if (!(await confirmDialog('¿Quitar del equipo?', { okLabel: 'Quitar', danger: true }))) return false; await store.remove('team', m.id); return true; } }] : []),
      { label: 'Cancelar', cls: 'ghost' },
      { label: 'Guardar', onClick: async (api) => {
        const form = api.el.querySelector('#tm-form');
        if (!form.reportValidity()) return false;
        const v = formValues(form);
        const saved = await store.put('team', { ...(m || {}), ...v, color: m?.color || colorFor(v.name) });
        if (saved.id === store.profile?.id) saveSettings({ profile: { ...getSettings().profile, name: v.name, role: v.role, phone: v.phone } });
        toast('Guardado', 'ok');
        return true;
      } },
    ],
  });
}

export default function teamView(ctx) {
  const draw = () => {
    const members = sortBy(store.list('team'), 'name');
    const weekAgo = addDays(todayKey(), -6);
    rerender(ctx.el, html`<div class="page">
      <p class="muted small">${cloud.isActive() ? 'Los compañeros aparecen automáticamente al iniciar sesión en la nube.' : 'Modo local: añade a tus compañeros para poder asignarles trabajos. Con la nube activada (Ajustes) aparecerán solos.'}</p>
      ${members.length ? html`<div class="list">${members.map((m) => {
        const active = activeEntry(m.id);
        const job = active ? store.get('jobs', active.jobId) : null;
        const weekMs = store.list('timesheets').filter((t) => t.memberId === m.id && t.end && t.date >= weekAgo).reduce((s, t) => s + (new Date(t.end) - new Date(t.start)), 0);
        const assigned = store.list('jobs').filter((j) => (j.assignedIds || []).includes(m.id) && !['terminado', 'facturado'].includes(j.status)).length;
        const st = STATUSES.find(([k]) => k === (m.status || 'disponible')) || STATUSES[0];
        return html`<div class="item">${avatar(m)}
          <div class="body clickable" data-member="${m.id}"><div class="title">${m.name}${m.id === store.profile?.id ? html` <span class="tiny muted">(tú)</span>` : ''}</div>
            <div class="sub">${ROLES.find(([k]) => k === m.role)?.[1] || m.role}${m.notes ? ` · ${m.notes}` : ''}</div>
            <div class="row wrap gap-s" style="margin-top:.35rem">
              <span class="chip outline tiny">${active ? html`${icon('clock', { size: 12 })} fichado${job ? ` en ${job.title}` : ''}` : html`<span class="status-dot ${st[2]}"></span>${st[1]}`}</span>
              <span class="chip outline tiny">${assigned} trabajos activos</span><span class="chip outline tiny">${hoursLabel(weekMs)} / 7 días</span></div></div>
          ${m.phone ? html`<div class="stack gap-s"><a class="btn small ghost icon" href="${telLink(m.phone)}" aria-label="Llamar">${icon('phone', { size: 16 })}</a><a class="btn small ghost icon" href="${waLink(m.phone)}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon('comment', { size: 16 })}</a></div>` : ''}
        </div>`; })}</div>` : emptyState('users', 'Todavía no hay nadie en el equipo.')}
    </div><button class="fab" id="fab-member" aria-label="Añadir compañero">${icon('plus', { size: 26 })}</button>`);
  };
  ctx.watch(['team', 'timesheets', 'jobs'], draw);
  draw();
  on(ctx.el, 'click', '#fab-member', () => openMemberForm());
  on(ctx.el, 'click', '[data-member]', (ev, el) => openMemberForm(store.get('team', el.dataset.member)));
}
