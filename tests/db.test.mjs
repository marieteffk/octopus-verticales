import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Shim mínimo de localStorage para Node
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { getSettings, saveSettings, DEFAULT_SETTINGS, dataURLToBlob, personName, store } = await import('../js/db.js');
const { esc, html, raw, fmtDuration, hoursLabel, initials, colorFor, addDays, dateKey, sortBy, groupBy, waLink } = await import('../js/ui.js');

beforeEach(() => mem.clear());

test('getSettings devuelve los valores por defecto sin mutar DEFAULT_SETTINGS', () => {
  const s = getSettings();
  assert.equal(s.weather.windStop, 45);
  assert.equal(s.company.vat, 21);
  s.weather.windStop = 1;
  assert.equal(DEFAULT_SETTINGS.weather.windStop, 45);
});

test('saveSettings fusiona en profundidad y persiste', () => {
  saveSettings({ weather: { windStop: 50 } });
  const s = getSettings();
  assert.equal(s.weather.windStop, 50);
  assert.equal(s.weather.rainStop, 70, 'los demás umbrales se conservan');
  assert.ok(mem.has('ov.settings.v1'));
});

test('saveSettings reemplaza arrays en vez de fusionarlos', () => {
  saveSettings({ weather: { locations: [{ name: 'A', lat: 1, lon: 1 }] } });
  saveSettings({ weather: { locations: [] } });
  assert.deepEqual(getSettings().weather.locations, []);
});

test('getSettings sobrevive a JSON corrupto', () => {
  mem.set('ov.settings.v1', '{no es json');
  assert.equal(getSettings().theme, 'auto');
});

test('dataURLToBlob reconstruye el tipo y el tamaño', async () => {
  const blob = dataURLToBlob('data:text/plain;base64,aG9sYQ==');
  assert.equal(blob.type, 'text/plain');
  assert.equal(await blob.text(), 'hola');
});

test('personName usa el perfil propio y un nombre genérico para desconocidos', () => {
  saveSettings({ profile: { id: 'u1', name: 'Marta' } });
  assert.equal(personName('u1'), 'Marta');
  assert.equal(personName('otro'), 'Compañero/a');
  assert.equal(personName(null), '—');
  assert.deepEqual(store.list('jobs'), []);
});

test('html escapa valores y respeta raw()', () => {
  const out = String(html`<b>${'<img onerror=x>'}</b>${raw('<i>ok</i>')}`);
  assert.equal(out, '<b>&lt;img onerror=x&gt;</b><i>ok</i>');
  assert.equal(esc('a"b'), 'a&quot;b');
  assert.equal(String(html`${[1, 2]}${null}${false}`), '12');
});

test('formateadores de tiempo y personas', () => {
  assert.equal(fmtDuration(3661000), '01:01:01');
  assert.equal(hoursLabel(5400000), '1.5 h');
  assert.equal(hoursLabel(36000000), '10 h');
  assert.equal(initials('Marta García López'), 'MG');
  assert.equal(initials(''), '?');
  assert.equal(colorFor('x'), colorFor('x'));
});

test('utilidades de fechas y colecciones', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.deepEqual(sortBy([{ a: 2 }, { a: 1 }, { a: null }], 'a').map((x) => x.a), [1, 2, null]);
  assert.deepEqual(groupBy([1, 2, 3], (n) => (n % 2 ? 'impar' : 'par')), { impar: [1, 3], par: [2] });
  assert.equal(waLink('600 11 22 33'), 'https://wa.me/34600112233');
});
