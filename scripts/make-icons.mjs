// Genera los PNG del manifiesto a partir de icons/icon.svg (requiere `npm install`, usa @resvg/resvg-js).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');

function renderPng(source, size) {
  const r = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  return r.render().asPng();
}

// Versión "maskable": fondo a sangre y dibujo reducido al 80 % (zona segura).
const maskable = svg
  .replace('<rect width="512" height="512" rx="110" fill="#0b3b5c"/>', '<rect width="512" height="512" fill="#0b3b5c"/><g transform="translate(51.2 51.2) scale(0.8)">')
  .replace('</svg>', '</g></svg>');

writeFileSync(join(root, 'icons', 'icon-192.png'), renderPng(svg, 192));
writeFileSync(join(root, 'icons', 'icon-512.png'), renderPng(svg, 512));
writeFileSync(join(root, 'icons', 'maskable-512.png'), renderPng(maskable, 512));
console.log('Iconos generados en icons/');
