import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHour, workWindows, analyzeForecast, normalizeHours, wmoInfo, windDir, DEFAULT_THRESHOLDS } from '../js/weather.js';

function hourList(n, day = '2026-10-06') {
  return Array.from({ length: n }, (_, i) => `${day}T${String(i).padStart(2, '0')}:00`);
}

function syntheticForecast() {
  const time = hourList(24);
  const zeros = time.map(() => 0);
  return {
    timezone: 'Europe/Madrid',
    current: { temperature_2m: 21, wind_speed_10m: 12, wind_gusts_10m: 20, weather_code: 1, precipitation: 0 },
    hourly: {
      time,
      temperature_2m: time.map(() => 20),
      precipitation_probability: time.map((_, h) => (h >= 14 && h <= 16 ? 85 : h === 10 ? 50 : 5)),
      precipitation: time.map((_, h) => (h >= 14 && h <= 16 ? 1.2 : 0)),
      weather_code: time.map((_, h) => (h >= 14 && h <= 16 ? 61 : 1)),
      wind_speed_10m: time.map(() => 10),
      wind_gusts_10m: time.map((_, h) => (h === 18 ? 60 : 20)),
      wind_direction_10m: zeros,
      uv_index: zeros,
      visibility: time.map(() => 20000),
      relative_humidity_2m: time.map(() => 50),
      is_day: time.map((_, h) => (h >= 7 && h <= 19 ? 1 : 0)),
    },
    daily: {
      time: ['2026-10-06'], weather_code: [61], temperature_2m_max: [24], temperature_2m_min: [14], precipitation_sum: [3.6],
      precipitation_probability_max: [85], precipitation_hours: [3], wind_speed_10m_max: [10], wind_gusts_10m_max: [60],
      sunrise: ['2026-10-06T08:05'], sunset: ['2026-10-06T19:40'], uv_index_max: [5],
    },
    minutely_15: { time: ['2026-10-06T08:00', '2026-10-06T08:15'], precipitation: [0, 0.3], rain: [0, 0.3], weather_code: [1, 51] },
  };
}

test('evaluateHour marca "ok" con condiciones tranquilas', () => {
  const r = evaluateHour({ precipProb: 10, precip: 0, wind: 10, gust: 15, code: 1, temp: 20 });
  assert.equal(r.level, 'ok');
  assert.deepEqual(r.reasons, []);
});

test('evaluateHour marca "caution" entre umbrales de lluvia', () => {
  const r = evaluateHour({ precipProb: 50, precip: 0, wind: 5, gust: 10, code: 2, temp: 20 });
  assert.equal(r.level, 'caution');
  assert.match(r.reasons[0], /Riesgo de lluvia/);
});

test('evaluateHour marca "stop" con rachas fuertes aunque no llueva', () => {
  const r = evaluateHour({ precipProb: 0, precip: 0, wind: 20, gust: 60, code: 0, temp: 20 });
  assert.equal(r.level, 'stop');
  assert.match(r.reasons[0], /Viento fuerte/);
});

test('evaluateHour marca "stop" con tormenta y respeta umbrales personalizados', () => {
  assert.equal(evaluateHour({ code: 95 }).level, 'stop');
  const strict = { ...DEFAULT_THRESHOLDS, rainStop: 30 };
  assert.equal(evaluateHour({ precipProb: 35, precip: 0 }, strict).level, 'stop');
});

test('evaluateHour avisa de frío, calor y niebla', () => {
  assert.match(evaluateHour({ temp: 0 }).reasons[0], /Frío/);
  assert.match(evaluateHour({ temp: 38 }).reasons[0], /Calor/);
  assert.equal(evaluateHour({ code: 45 }).level, 'caution');
});

test('workWindows agrupa horas aptas consecutivas dentro del horario laboral', () => {
  const hours = normalizeHours(syntheticForecast()).map((h) => ({ ...h, ...evaluateHour(h) }));
  const windows = workWindows(hours);
  // 07–10 apto, 10 precaución, 11–14 apto, 14–17 lluvia, 17–18 apto, 18 racha, 19–20 apto
  assert.deepEqual(windows.map((w) => [w.startHour, w.endHour]), [[7, 10], [11, 14], [17, 18], [19, 20]]);
  assert.equal(windows[0].hours, 3);
});

test('analyzeForecast produce decisión, días y minutely coherentes', () => {
  const now = new Date('2026-10-06T07:10:00'); // 07, 08 y 09 h son aptas; la racha de las 10 h queda fuera
  const a = analyzeForecast(syntheticForecast(), DEFAULT_THRESHOLDS, now);
  assert.equal(a.hours[0].time, '2026-10-06T07:00');
  assert.equal(a.decision.level, 'ok');
  assert.equal(a.days.length, 1);
  assert.equal(a.days[0].level, 'stop');
  assert.equal(a.days[0].precipProbMax, 85);
  assert.equal(a.minutely.length, 2);
  assert.equal(a.current.info.label, 'Mayormente despejado');
  const later = analyzeForecast(syntheticForecast(), DEFAULT_THRESHOLDS, new Date('2026-10-06T08:10:00'));
  assert.equal(later.decision.level, 'caution', 'la hora 10 (50 %) entra en la ventana de 3 horas');
});

test('analyzeForecast toma la peor de las próximas 3 horas para la decisión', () => {
  const now = new Date('2026-10-06T13:30:00'); // 13h ok, 14h lluvia
  const a = analyzeForecast(syntheticForecast(), DEFAULT_THRESHOLDS, now);
  assert.equal(a.decision.level, 'stop');
  assert.ok(a.decision.reasons.some((r) => /Lluvia probable/.test(r)));
});

test('analyzeForecast devuelve "unknown" cuando no hay pronóstico para las próximas horas', () => {
  const empty = analyzeForecast({}, DEFAULT_THRESHOLDS, new Date('2026-10-06T08:00:00'));
  assert.equal(empty.decision.level, 'unknown');
  assert.equal(empty.decision.label, 'SIN DATOS');
  const old = analyzeForecast(syntheticForecast(), DEFAULT_THRESHOLDS, new Date('2026-10-08T08:00:00')); // pronóstico de hace 2 días
  assert.equal(old.decision.level, 'unknown');
});

test('wmoInfo y windDir devuelven etiquetas en español', () => {
  assert.equal(wmoInfo(95).label, 'Tormenta');
  assert.equal(wmoInfo(9999).label, 'Variable');
  assert.equal(windDir(0), 'N');
  assert.equal(windDir(225), 'SO');
  assert.equal(windDir(null), '');
});
