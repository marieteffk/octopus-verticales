/* Clima en directo con probabilidad de lluvia detallada y semáforo de aptitud para trabajo en altura. */
import { html, raw, render, on, modal, toast, promptDialog, fmtTime, emptyState, debounce } from '../ui.js';
import { getSettings, saveSettings, store } from '../db.js';
import { fetchForecast, geocode, analyzeForecast, wmoInfo, windDir, LEVEL_LABEL } from '../weather.js';

const CACHE_PREFIX = 'ov.wx.';
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function cacheKey(loc) { return `${CACHE_PREFIX}${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`; }
function readCache(loc) { try { return JSON.parse(localStorage.getItem(cacheKey(loc)) || 'null'); } catch { return null; } }
function writeCache(loc, forecast) { try { localStorage.setItem(cacheKey(loc), JSON.stringify({ forecast, at: Date.now() })); } catch { /* sin espacio */ } }

export function currentLocation() {
  const w = getSettings().weather;
  return w.defaultLocation || w.locations[0] || null;
}

export async function locateByGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Este dispositivo no tiene GPS disponible')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ name: 'Mi ubicación', lat: pos.coords.latitude, lon: pos.coords.longitude, gps: true }),
      (err) => reject(new Error(err.code === 1 ? 'Permiso de ubicación denegado' : 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

/** Carga (con caché) y analiza el pronóstico de una ubicación. */
export async function loadAnalysis(loc, { force = false } = {}) {
  const cached = readCache(loc);
  const fresh = cached && Date.now() - cached.at < 15 * 60 * 1000;
  let forecast = cached?.forecast;
  let fromCache = true;
  if (!forecast || force || !fresh) {
    try {
      forecast = await fetchForecast(loc.lat, loc.lon);
      writeCache(loc, forecast);
      fromCache = false;
    } catch (err) {
      if (!forecast) throw err;
    }
  }
  return { analysis: analyzeForecast(forecast, getSettings().weather), fromCache, cachedAt: cached?.at };
}

export function semaforoCard(decision, { link = false } = {}) {
  return html`<div class="semaforo ${decision.level}">
    <div class="light"></div>
    <div class="grow"><div class="lbl">Trabajo en altura: ${decision.label}</div>
      ${decision.reasons.length ? html`<ul>${decision.reasons.map((r) => html`<li>${r}</li>`)}</ul>` : html`<div class="small">Condiciones favorables en las próximas 3 horas.</div>`}
      ${link ? html`<a href="#/clima" class="small" style="color:#fff">Ver pronóstico completo →</a>` : ''}
    </div></div>`;
}

export function rainBars(hours, { count = 24 } = {}) {
  return html`<div class="bars">${hours.slice(0, count).map((h) => html`<div class="bar lvl-${h.level}" title="${h.time.slice(11)} · ${h.precipProb}% · ${h.precip} mm">
    <span class="val">${h.precipProb}%</span><div class="fill" style="height:${Math.max(2, h.precipProb)}%"></div><span class="lbl">${h.hour}h</span></div>`)}</div>`;
}

export default function weatherView(ctx) {
  const state = { loc: currentLocation(), data: null, error: null, loading: false, showAll: false, openDay: null };
  const el = ctx.el;

  const load = async (force = false) => {
    if (!state.loc) { draw(); return; }
    state.loading = true; state.error = null; draw();
    try {
      state.data = await loadAnalysis(state.loc, { force });
    } catch (err) {
      state.error = err.message;
    }
    state.loading = false;
    draw();
  };

  const draw = () => {
    const s = getSettings().weather;
    const locs = s.locations;
    const head = html`
      <div class="row wrap gap-s mb">
        <button class="btn small ghost" id="wx-gps">📍 Mi ubicación</button>
        <button class="btn small ghost" id="wx-search">🔎 Buscar localidad</button>
        <button class="btn small ghost" id="wx-from-jobs">🧰 Desde un trabajo</button>
        <button class="btn small ghost" id="wx-refresh" ${state.loading ? raw('disabled') : ''}>↻</button>
      </div>
      ${locs.length ? html`<div class="chips scroll mb">${locs.map((l, i) => html`<span class="chip pick ${state.loc && l.lat === state.loc.lat && l.lon === state.loc.lon ? 'active' : ''}" data-loc="${i}">${s.defaultLocation && s.defaultLocation.lat === l.lat && s.defaultLocation.lon === l.lon ? '★ ' : ''}${l.name}</span>`)}</div>` : ''}`;

    if (!state.loc) {
      render(el, html`<div class="page">${head}${emptyState('🌦️', 'Elige una ubicación para ver el tiempo y la probabilidad de lluvia hora a hora.')}</div>`);
      return;
    }
    if (!state.data) {
      render(el, html`<div class="page">${head}<div class="card"><h2>${state.loc.name}</h2>${state.error ? html`<p class="muted">⚠️ ${state.error}</p><button class="btn" id="wx-refresh2">Reintentar</button>` : html`<p class="muted">Cargando pronóstico…</p>`}</div></div>`);
      return;
    }
    const { analysis: a, fromCache, cachedAt } = state.data;
    const c = a.current;
    const hours = state.showAll ? a.hours : a.hours.slice(0, 24);
    render(el, html`<div class="page">
      ${head}
      <div class="row between mb"><h1 style="margin:0">${state.loc.name}</h1>
        <div class="row gap-s"><button class="btn small ghost" id="wx-default" title="Ubicación por defecto">${s.defaultLocation?.lat === state.loc.lat && s.defaultLocation?.lon === state.loc.lon ? '★' : '☆'}</button>
        ${locs.some((l) => l.lat === state.loc.lat && l.lon === state.loc.lon) ? html`<button class="btn small ghost" id="wx-forget">🗑️</button>` : html`<button class="btn small ghost" id="wx-save">💾 Guardar</button>`}</div></div>
      ${semaforoCard(a.decision)}
      <div class="card wx-hero">
        <div class="row between">
          <div><div class="temp">${Math.round(c.temperature_2m ?? 0)}°</div><div class="cond">${c.info.icon} ${c.info.label}</div><div class="small" style="opacity:.85">Sensación ${Math.round(c.apparent_temperature ?? c.temperature_2m ?? 0)}°</div></div>
          <div class="right small" style="opacity:.9">${fromCache ? html`<div>⚠️ Datos guardados ${cachedAt ? fmtTime(cachedAt) : ''}</div>` : html`<div>Actualizado ${fmtTime(a.updatedAt)}</div>`}<div>Fuente: Open-Meteo</div></div>
        </div>
        <div class="wx-stats">
          <div class="wx-stat"><div class="k">Lluvia ahora</div><div class="v">${(c.precipitation ?? 0).toFixed(1)} mm</div></div>
          <div class="wx-stat"><div class="k">Prob. próxima hora</div><div class="v">${a.hours[0]?.precipProb ?? 0} %</div></div>
          <div class="wx-stat"><div class="k">Viento</div><div class="v">${Math.round(c.wind_speed_10m ?? 0)} km/h ${windDir(c.wind_direction_10m)}</div></div>
          <div class="wx-stat"><div class="k">Rachas</div><div class="v">${Math.round(c.wind_gusts_10m ?? 0)} km/h</div></div>
          <div class="wx-stat"><div class="k">Humedad</div><div class="v">${c.relative_humidity_2m ?? '—'} %</div></div>
          <div class="wx-stat"><div class="k">Sol</div><div class="v">${a.days[0]?.sunrise ? a.days[0].sunrise.slice(11) : '—'} · ${a.days[0]?.sunset ? a.days[0].sunset.slice(11) : '—'}</div></div>
        </div>
      </div>

      ${a.minutely.length ? html`<div class="card"><div class="card-title"><h2>Próximas 3 horas (cada 15 min)</h2><span class="muted small">mm de lluvia</span></div>
        <div class="bars" style="height:90px">${a.minutely.map((m) => html`<div class="bar" title="${m.time.slice(11)} · ${m.precip} mm"><span class="val">${m.precip > 0 ? m.precip.toFixed(1) : ''}</span><div class="fill" style="height:${Math.min(100, m.precip * 40 + 2)}%"></div><span class="lbl">${m.time.slice(11, 16)}</span></div>`)}</div>
        <p class="tiny muted" style="margin:0">${a.minutely.every((m) => m.precip === 0) ? 'Sin precipitación prevista en las próximas 3 horas.' : `Total previsto: ${a.minutely.reduce((s, m) => s + m.precip, 0).toFixed(1)} mm`}</p></div>` : ''}

      <div class="card"><div class="card-title"><h2>Probabilidad de lluvia</h2><button class="btn small ghost" id="wx-toggle-hours">${state.showAll ? '24 h' : '48 h'}</button></div>
        ${rainBars(hours, { count: hours.length })}
        <div class="row gap-s tiny muted" style="margin-top:.4rem"><span class="dot ok"></span> apto <span class="dot caution"></span> precaución <span class="dot stop"></span> no apto</div></div>

      <div class="card"><div class="card-title"><h2>Viento y rachas</h2><span class="muted small">km/h</span></div>
        <div class="bars">${hours.map((h) => html`<div class="bar wind lvl-${h.gust >= a.thresholds.gustStop || h.wind >= a.thresholds.windStop ? 'stop' : h.gust >= a.thresholds.gustCaution || h.wind >= a.thresholds.windCaution ? 'caution' : 'ok'}" title="${h.time.slice(11)} · viento ${Math.round(h.wind)} · rachas ${Math.round(h.gust)}">
          <span class="val">${Math.round(h.gust)}</span><div class="fill" style="height:${Math.min(100, h.gust / 80 * 100)}%"></div><span class="lbl">${h.hour}h</span></div>`)}</div></div>

      <div class="card"><div class="card-title"><h2>Detalle hora a hora</h2></div>
        <div style="overflow-x:auto"><table class="hour-table"><thead><tr><th>Hora</th><th></th><th>Lluvia</th><th>mm</th><th>Viento</th><th>Rachas</th><th>Temp</th><th>UV</th><th></th></tr></thead><tbody>
          ${hours.map((h) => html`<tr><td>${h.day !== a.hours[0].day && h.hour === 0 ? html`<b>${DAYS[new Date(h.day + 'T00:00:00').getDay()]} </b>` : ''}${String(h.hour).padStart(2, '0')}:00</td><td>${wmoInfo(h.code).icon}</td><td><b>${h.precipProb}%</b></td><td>${h.precip ? h.precip.toFixed(1) : '–'}</td><td>${Math.round(h.wind)}</td><td>${Math.round(h.gust)}</td><td>${Math.round(h.temp)}°</td><td>${h.uv != null ? Math.round(h.uv) : '–'}</td><td><span class="dot ${h.level}"></span></td></tr>`)}
        </tbody></table></div></div>

      <div class="card"><div class="card-title"><h2>Próximos 7 días</h2><span class="muted small">toca un día para ver ventanas de trabajo</span></div>
        ${a.days.map((d, i) => html`<div class="day-row" data-day="${i}" style="cursor:pointer">
          <div><b>${i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DAYS[new Date(d.day + 'T00:00:00').getDay()]}</b> <span class="muted small">${d.day.slice(8, 10)}/${d.day.slice(5, 7)}</span><div class="small">${wmoInfo(d.code).icon} ${wmoInfo(d.code).label}</div></div>
          <div class="center"><div class="small muted">lluvia</div><b>${d.precipProbMax}%</b><div class="tiny muted">${d.precipSum.toFixed(1)} mm · ${d.precipHours} h</div></div>
          <div class="center"><div class="small muted">rachas</div><b>${Math.round(d.gustMax)}</b><div class="tiny muted">km/h</div></div>
          <div class="right"><b>${Math.round(d.tMax)}°</b> <span class="muted">${Math.round(d.tMin)}°</span><div><span class="dot ${d.level}"></span> <span class="tiny">${LEVEL_LABEL[d.level]}</span></div></div>
          ${state.openDay === i ? html`<div style="grid-column:1/-1">${d.windows.length ? html`<div class="small muted">Ventanas aptas (07–20 h):</div>${d.windows.map((w) => html`<span class="window">${String(w.startHour).padStart(2, '0')}:00–${String(w.endHour).padStart(2, '0')}:00 (${w.hours} h)</span>`)}` : html`<div class="small muted">Sin ventanas aptas en horario laboral.</div>`}
            ${d.sunrise ? html`<div class="tiny muted mt">Amanece ${d.sunrise.slice(11)} · anochece ${d.sunset.slice(11)} · UV máx ${d.uvMax != null ? Math.round(d.uvMax) : '–'}</div>` : ''}</div>` : ''}
        </div>`)}
      </div>
      <p class="tiny muted">Umbrales: lluvia ≥${a.thresholds.rainCaution}% precaución / ≥${a.thresholds.rainStop}% no apto · rachas ≥${a.thresholds.gustCaution} / ≥${a.thresholds.gustStop} km/h · viento ≥${a.thresholds.windCaution} / ≥${a.thresholds.windStop} km/h. <a href="#/ajustes">Cambiar umbrales</a>. El semáforo es orientativo: la decisión final es del responsable en obra.</p>
    </div>`);
  };

  ctx.watch(['settings'], () => { if (state.data) { state.data = { ...state.data, analysis: analyzeForecast(readCache(state.loc)?.forecast || {}, getSettings().weather) }; } draw(); });
  draw();
  load();

  on(el, 'click', '#wx-refresh, #wx-refresh2', () => load(true));
  on(el, 'click', '#wx-toggle-hours', () => { state.showAll = !state.showAll; draw(); });
  on(el, 'click', '[data-day]', (ev, d) => { const i = Number(d.dataset.day); state.openDay = state.openDay === i ? null : i; draw(); });
  on(el, 'click', '[data-loc]', (ev, chip) => { state.loc = getSettings().weather.locations[Number(chip.dataset.loc)]; state.data = null; load(); });
  on(el, 'click', '#wx-gps', async () => {
    try { state.loc = await locateByGPS(); state.data = null; load(); } catch (err) { toast(err.message, 'error'); }
  });
  on(el, 'click', '#wx-save', async () => {
    const name = await promptDialog('Guardar ubicación', { label: 'Nombre (ej. Obra C/ Mayor)', value: state.loc.name === 'Mi ubicación' ? '' : state.loc.name });
    if (!name) return;
    const loc = { name, lat: state.loc.lat, lon: state.loc.lon };
    const w = getSettings().weather;
    saveSettings({ weather: { locations: [...w.locations, loc], defaultLocation: w.defaultLocation || loc } });
    state.loc = loc; draw();
  });
  on(el, 'click', '#wx-forget', () => {
    const w = getSettings().weather;
    const locations = w.locations.filter((l) => !(l.lat === state.loc.lat && l.lon === state.loc.lon));
    const defaultLocation = w.defaultLocation?.lat === state.loc.lat ? (locations[0] || null) : w.defaultLocation;
    saveSettings({ weather: { locations, defaultLocation } });
    draw();
  });
  on(el, 'click', '#wx-default', () => { saveSettings({ weather: { defaultLocation: { name: state.loc.name, lat: state.loc.lat, lon: state.loc.lon } } }); toast('Ubicación por defecto guardada', 'ok'); draw(); });
  on(el, 'click', '#wx-search', () => searchDialog((loc) => { state.loc = loc; state.data = null; load(); }));
  on(el, 'click', '#wx-from-jobs', () => jobsDialog((loc) => { state.loc = loc; state.data = null; load(); }));
}

function searchDialog(onPick) {
  const m = modal({
    title: 'Buscar localidad',
    body: html`<div class="field"><input id="geo-q" placeholder="Ej. Alicante, Elche, Madrid…" autocomplete="off"></div><div id="geo-results" class="list"></div>`,
  });
  const results = m.el.querySelector('#geo-results');
  const run = debounce(async (q) => {
    if (q.length < 2) { results.innerHTML = ''; return; }
    results.innerHTML = '<p class="muted small">Buscando…</p>';
    try {
      const list = await geocode(q);
      render(results, list.length ? list.map((r, i) => html`<div class="item clickable" data-geo="${i}"><div class="body"><div class="title">${r.name}</div><div class="sub">${r.region}</div></div></div>`) : html`<p class="muted small">Sin resultados</p>`);
      on(results, 'click', '[data-geo]', (ev, el) => { const r = list[Number(el.dataset.geo)]; onPick({ name: r.name, lat: r.lat, lon: r.lon }); m.close(); });
    } catch (err) { results.innerHTML = String(html`<p class="muted small">${err.message}</p>`); }
  }, 350);
  m.el.querySelector('#geo-q').addEventListener('input', (ev) => run(ev.target.value.trim()));
}

function jobsDialog(onPick) {
  const jobs = store.list('jobs').filter((j) => j.address);
  const m = modal({
    title: 'Clima en la obra',
    body: jobs.length ? html`<div class="list">${jobs.map((j, i) => html`<div class="item clickable" data-job="${i}"><div class="body"><div class="title">${j.title}</div><div class="sub">${j.address}</div></div></div>`)}</div>` : html`<p class="muted">No hay trabajos con dirección.</p>`,
  });
  on(m.el, 'click', '[data-job]', async (ev, el) => {
    const j = jobs[Number(el.dataset.job)];
    toast('Localizando dirección…');
    try {
      const simplified = j.address.split(',').slice(-2).join(',').trim() || j.address;
      const res = (await geocode(j.address))[0] || (await geocode(simplified))[0];
      if (!res) { toast('No se encontró la dirección; prueba a buscar la localidad', 'warn'); return; }
      onPick({ name: j.title, lat: res.lat, lon: res.lon });
      m.close();
    } catch (err) { toast(err.message, 'error'); }
  });
}
