/* Set de iconos propio: trazo fino, 24x24, color heredado (currentColor). Sin emojis. */
import { raw } from './ui.js';

const P = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="M21 16l-5-5-9 9"/>',
  feed: '<path d="M4 5h16v11H9l-5 4z"/>',
  comment: '<path d="M21 12a8.5 8.5 0 0 1-12.5 7.5L4 21l1.5-4.5A8.5 8.5 0 1 1 21 12z"/>',
  weather: '<path d="M7 16a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 8.5 3.5 3.5 0 0 1 17 16H7z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  note: '<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  building: '<rect x="4" y="3" width="16" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c0-2.5-1.5-4.5-4-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s-7-6.5-7-11.5a7 7 0 0 1 14 0C19 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  'check-square': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12l3 3 5-6"/>',
  square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  star: '<path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>',
  locate: '<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  printer: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>',
  pushpin: '<path d="M9 3h6l-1 6 3 3v2h-5v6l-1 1-1-1v-6H5v-2l3-3z"/>',
  euro: '<path d="M18 6a7 7 0 1 0 0 12M4 10h9M4 14h9"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 7H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  device: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  database: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5.5 1 1.2 1.5 2 1.5 0-3 .5-5 1-7z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8a2.5 2.5 0 1 1-2.5 2.5"/>',
  drop: '<path d="M12 3s6 7 6 11.5a6 6 0 0 1-12 0C6 10 12 3 12 3z"/>',
  thermometer: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/><path d="M12 8v4l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  signature: '<path d="M3 17c3-4 5-6 6-6s1 4 2 4 3-6 4-6 1 5 2 5 2-1 4-3M3 21h18"/>',
  hardhat: '<path d="M4 16a8 8 0 0 1 16 0"/><path d="M10 8V5h4v3M2 16h20v3H2z"/>',
  // Tiempo
  'wx-sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'wx-cloud-sun': '<path d="M9 5V3M4.5 6.5l1.4 1.4M3 12h2"/><path d="M8.5 9.5a3.5 3.5 0 0 1 6.3 1"/><path d="M9 20a3.5 3.5 0 0 1-.5-6.96A5 5 0 0 1 18 13.5 3.25 3.25 0 0 1 17.5 20z"/>',
  'wx-cloud': '<path d="M7 18a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>',
  'wx-fog': '<path d="M7 13a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 5.5 3.5 3.5 0 0 1 17 13H7z"/><path d="M5 17h14M7 21h10"/>',
  'wx-drizzle': '<path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 7.5 3.5 3.5 0 0 1 17 15H7z"/><path d="M9 19h.01M13 19h.01M17 19h.01M11 22h.01M15 22h.01"/>',
  'wx-rain': '<path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 7.5 3.5 3.5 0 0 1 17 15H7z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  'wx-snow': '<path d="M7 14a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 6.5 3.5 3.5 0 0 1 17 14H7z"/><path d="M8 18v3M6.5 19.5h3M12 18v3M10.5 19.5h3M16 18v3M14.5 19.5h3"/>',
  'wx-storm': '<path d="M7 14a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 6.5 3.5 3.5 0 0 1 17 14H7z"/><path d="M13 14l-3 5h4l-2 4"/>',
};

/** Devuelve un icono SVG en línea. `size` en px; `cls` clases extra. */
export function icon(name, { size = 20, cls = '' } = {}) {
  const paths = P[name] || P.info;
  return raw(`<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`);
}

/** Nombre del icono meteorológico a partir del código WMO. */
export function weatherIconName(code) {
  if (code === 0) return 'wx-sun';
  if (code === 1 || code === 2) return 'wx-cloud-sun';
  if (code === 3) return 'wx-cloud';
  if (code === 45 || code === 48) return 'wx-fog';
  if (code >= 51 && code <= 57) return 'wx-drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'wx-rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'wx-snow';
  if (code >= 95) return 'wx-storm';
  return 'thermometer';
}

export function weatherIcon(code, opts = {}) { return icon(weatherIconName(code), opts); }

/** Marca decorativa: pulpo en línea fina (para fondos y cabeceras). */
export function octopusMark({ size = 160, cls = '' } = {}) {
  return raw(`<svg class="mark ${cls}" width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M256 56v72"/><ellipse cx="256" cy="228" rx="104" ry="96"/>
    <path d="M176 300c-30 36-70 44-84 92M214 318c-14 50-40 70-30 126M256 326c2 54 14 82 0 126M298 318c14 50 40 70 30 126M336 300c30 36 70 44 84 92"/>
    <circle cx="222" cy="222" r="10" fill="currentColor" stroke="none"/><circle cx="290" cy="222" r="10" fill="currentColor" stroke="none"/>
  </svg>`);
}

export const ICON_NAMES = Object.keys(P);
