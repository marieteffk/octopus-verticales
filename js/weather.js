/* Cliente de Open-Meteo (gratuito, sin clave) + análisis de aptitud para trabajos verticales.
   Las funciones de análisis son puras para poder probarlas en Node. */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export const DEFAULT_THRESHOLDS = Object.freeze({
  windCaution: 30, windStop: 45,
  gustCaution: 40, gustStop: 55,
  rainCaution: 40, rainStop: 70,
  precipStop: 0.5,
  tempMin: 2, tempMax: 35,
});

export const LEVELS = { ok: 0, caution: 1, stop: 2, unknown: 3 };
export const LEVEL_LABEL = { ok: 'APTO', caution: 'PRECAUCIÓN', stop: 'NO APTO', unknown: 'SIN DATOS' };

const WMO = {
  0: ['Despejado', '☀️'], 1: ['Mayormente despejado', '🌤️'], 2: ['Parcialmente nublado', '⛅'], 3: ['Nublado', '☁️'],
  45: ['Niebla', '🌫️'], 48: ['Niebla con escarcha', '🌫️'],
  51: ['Llovizna ligera', '🌦️'], 53: ['Llovizna', '🌦️'], 55: ['Llovizna intensa', '🌧️'],
  56: ['Llovizna helada', '🌧️'], 57: ['Llovizna helada intensa', '🌧️'],
  61: ['Lluvia ligera', '🌧️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia intensa', '🌧️'],
  66: ['Lluvia helada', '🌧️'], 67: ['Lluvia helada intensa', '🌧️'],
  71: ['Nieve ligera', '🌨️'], 73: ['Nieve', '🌨️'], 75: ['Nieve intensa', '❄️'], 77: ['Granos de nieve', '🌨️'],
  80: ['Chubascos ligeros', '🌦️'], 81: ['Chubascos', '🌧️'], 82: ['Chubascos fuertes', '⛈️'],
  85: ['Chubascos de nieve', '🌨️'], 86: ['Chubascos de nieve fuertes', '❄️'],
  95: ['Tormenta', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo fuerte', '⛈️'],
};

export function wmoInfo(code) {
  const [label, icon] = WMO[code] || ['Variable', '🌡️'];
  return { label, icon, code };
}

export function windDir(deg) {
  if (deg === null || deg === undefined) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export async function geocode(query) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(query)}&count=6&language=es&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo buscar la localidad');
  const json = await res.json();
  return (json.results || []).map((r) => ({
    name: r.name,
    region: [r.admin2, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    minutely_15: 'precipitation,rain,weather_code',
    hourly: 'temperature_2m,precipitation_probability,precipitation,rain,showers,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,relative_humidity_2m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
    forecast_minutely_15: '12',
  });
  const res = await fetch(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error('El servicio meteorológico no responde');
  const json = await res.json();
  if (json.error) throw new Error(json.reason || 'Error del servicio meteorológico');
  return json;
}

/* ---------- Análisis ---------- */

function maxLevel(a, b) { return LEVELS[a] >= LEVELS[b] ? a : b; }

/** Evalúa una hora concreta. Devuelve { level, reasons[] }. */
export function evaluateHour(h, t = DEFAULT_THRESHOLDS) {
  let level = 'ok';
  const reasons = [];
  const prob = h.precipProb ?? 0;
  const precip = h.precip ?? 0;
  const wind = h.wind ?? 0;
  const gust = h.gust ?? 0;
  const code = h.code ?? 0;
  const temp = h.temp;

  if (code >= 95) { level = 'stop'; reasons.push('Tormenta eléctrica prevista'); }
  if (prob >= t.rainStop || precip >= t.precipStop) { level = 'stop'; reasons.push(`Lluvia probable (${Math.round(prob)} %, ${precip.toFixed(1)} mm)`); }
  else if (prob >= t.rainCaution) { level = maxLevel(level, 'caution'); reasons.push(`Riesgo de lluvia (${Math.round(prob)} %)`); }
  if (gust >= t.gustStop || wind >= t.windStop) { level = 'stop'; reasons.push(`Viento fuerte (${Math.round(wind)} km/h, rachas ${Math.round(gust)} km/h)`); }
  else if (gust >= t.gustCaution || wind >= t.windCaution) { level = maxLevel(level, 'caution'); reasons.push(`Viento moderado (rachas ${Math.round(gust)} km/h)`); }
  if (typeof temp === 'number') {
    if (temp <= t.tempMin) { level = maxLevel(level, 'caution'); reasons.push(`Frío (${Math.round(temp)} °C): riesgo de hielo`); }
    if (temp >= t.tempMax) { level = maxLevel(level, 'caution'); reasons.push(`Calor extremo (${Math.round(temp)} °C): hidratación y pausas`); }
  }
  if ((code === 45 || code === 48) && level === 'ok') { level = 'caution'; reasons.push('Niebla: visibilidad reducida'); }
  if (h.visibility !== undefined && h.visibility !== null && h.visibility < 1000) { level = maxLevel(level, 'caution'); if (!reasons.some((r) => r.startsWith('Niebla'))) reasons.push('Visibilidad inferior a 1 km'); }
  return { level, reasons };
}

/** Normaliza la respuesta horaria en una lista de objetos por hora. */
export function normalizeHours(forecast) {
  const h = forecast.hourly || {};
  const times = h.time || [];
  return times.map((time, i) => ({
    time,
    hour: Number(time.slice(11, 13)),
    day: time.slice(0, 10),
    temp: h.temperature_2m?.[i] ?? null,
    precipProb: h.precipitation_probability?.[i] ?? 0,
    precip: h.precipitation?.[i] ?? 0,
    rain: h.rain?.[i] ?? 0,
    showers: h.showers?.[i] ?? 0,
    code: h.weather_code?.[i] ?? 0,
    wind: h.wind_speed_10m?.[i] ?? 0,
    gust: h.wind_gusts_10m?.[i] ?? 0,
    windDir: h.wind_direction_10m?.[i] ?? null,
    uv: h.uv_index?.[i] ?? null,
    visibility: h.visibility?.[i] ?? null,
    humidity: h.relative_humidity_2m?.[i] ?? null,
    isDay: h.is_day ? h.is_day[i] === 1 : (Number(time.slice(11, 13)) >= 7 && Number(time.slice(11, 13)) <= 20),
  }));
}

/** Agrupa horas consecutivas "ok" en ventanas de trabajo dentro del horario laboral. */
export function workWindows(hours, { startHour = 7, endHour = 20 } = {}) {
  const windows = [];
  let current = null;
  for (const h of hours) {
    const workable = h.level === 'ok' && h.hour >= startHour && h.hour < endHour;
    if (workable) {
      if (current && current.day === h.day && current.endHour === h.hour) {
        current = { ...current, endHour: h.hour + 1, hours: current.hours + 1 };
        windows[windows.length - 1] = current;
      } else {
        current = { day: h.day, startHour: h.hour, endHour: h.hour + 1, hours: 1 };
        windows.push(current);
      }
    } else {
      current = null;
    }
  }
  return windows;
}

/** Análisis completo del pronóstico. Devuelve estructura lista para pintar. */
export function analyzeForecast(forecast, thresholds = DEFAULT_THRESHOLDS, now = new Date()) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const hoursAll = normalizeHours(forecast).map((h) => ({ ...h, ...evaluateHour(h, t) }));
  const nowKey = localKey(now);
  const startIdx = Math.max(0, hoursAll.findIndex((h) => h.time >= nowKey));
  const upcoming = hoursAll.slice(startIdx, startIdx + 48);

  const current = forecast.current || {};
  const currentEval = evaluateHour({
    precipProb: upcoming[0]?.precipProb ?? 0,
    precip: current.precipitation ?? 0,
    wind: current.wind_speed_10m ?? 0,
    gust: current.wind_gusts_10m ?? 0,
    code: current.weather_code ?? 0,
    temp: current.temperature_2m,
  }, t);

  // Próximas 3 horas: peor nivel para la decisión "¿subimos ahora?"
  const next3 = upcoming.slice(0, 3);
  const hasData = upcoming.length > 0 && hoursAll[hoursAll.length - 1].time >= nowKey;
  const next3Level = hasData ? next3.reduce((acc, h) => maxLevel(acc, h.level), currentEval.level) : 'unknown';
  const next3Reasons = hasData
    ? [...new Set([...currentEval.reasons, ...next3.flatMap((h) => h.reasons)])].slice(0, 4)
    : ['No hay pronóstico disponible para las próximas horas. Comprueba la conexión antes de decidir.'];

  const days = (forecast.daily?.time || []).map((day, i) => {
    const d = forecast.daily;
    const dayHours = hoursAll.filter((h) => h.day === day);
    const level = dayHours.filter((h) => h.hour >= 7 && h.hour < 20).reduce((acc, h) => maxLevel(acc, h.level), 'ok');
    return {
      day,
      code: d.weather_code?.[i],
      tMax: d.temperature_2m_max?.[i],
      tMin: d.temperature_2m_min?.[i],
      precipSum: d.precipitation_sum?.[i] ?? 0,
      precipProbMax: d.precipitation_probability_max?.[i] ?? 0,
      precipHours: d.precipitation_hours?.[i] ?? 0,
      windMax: d.wind_speed_10m_max?.[i] ?? 0,
      gustMax: d.wind_gusts_10m_max?.[i] ?? 0,
      sunrise: d.sunrise?.[i],
      sunset: d.sunset?.[i],
      uvMax: d.uv_index_max?.[i],
      level,
      windows: workWindows(dayHours),
      hours: dayHours,
    };
  });

  const minutely = (forecast.minutely_15?.time || []).map((time, i) => ({
    time,
    precip: forecast.minutely_15.precipitation?.[i] ?? 0,
    rain: forecast.minutely_15.rain?.[i] ?? 0,
    code: forecast.minutely_15.weather_code?.[i] ?? 0,
  })).filter((m) => m.time >= localKeyMinutes(now)).slice(0, 12);

  return {
    current: { ...current, ...currentEval, info: wmoInfo(current.weather_code) },
    decision: { level: next3Level, label: LEVEL_LABEL[next3Level], reasons: next3Reasons },
    hours: upcoming,
    days,
    minutely,
    thresholds: t,
    updatedAt: now.toISOString(),
    timezone: forecast.timezone,
  };
}

function localKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

function localKeyMinutes(d) {
  const p = (n) => String(n).padStart(2, '0');
  const q = Math.floor(d.getMinutes() / 15) * 15;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(q)}`;
}
