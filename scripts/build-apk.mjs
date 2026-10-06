// Genera un APK/AAB firmado de la PWA publicada usando el servicio de empaquetado de PWABuilder (CloudAPK).
// Uso: node scripts/build-apk.mjs [versionName] [versionCode]
// Las claves de firma se guardan en android/signing.local.json (NO se sube a git). Guárdalo: hace falta para actualizar la app.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'android');
mkdirSync(out, { recursive: true });
const SERVICE = 'https://pwabuilder-cloudapk.azurewebsites.net';
const HOST = 'https://marieteffk.github.io';
const BASE = '/octopus-verticales';
const versionName = process.argv[2] || '1.2.0';
const versionCode = Number(process.argv[3] || 3);

const signingPath = join(out, 'signing.local.json');
let signing;
if (existsSync(signingPath)) {
  signing = JSON.parse(readFileSync(signingPath, 'utf8'));
} else {
  signing = {
    alias: 'octopus-verticales', fullName: 'Octopus Verticales', organization: 'Octopus Verticales', organizationalUnit: 'App', countryCode: 'ES',
    keyPassword: randomBytes(12).toString('base64url'), storePassword: randomBytes(12).toString('base64url'),
  };
  writeFileSync(signingPath, JSON.stringify(signing, null, 2));
  console.log('Claves de firma nuevas guardadas en android/signing.local.json');
}
const keystorePath = join(out, 'signing.keystore');
const existingKey = existsSync(keystorePath) ? `data:application/octet-stream;base64,${readFileSync(keystorePath).toString('base64')}` : null;

const options = {
  additionalTrustedOrigins: [],
  appVersion: versionName,
  appVersionCode: versionCode,
  backgroundColor: '#FFFFFF',
  display: 'standalone',
  enableSiteSettingsShortcut: true,
  enableNotifications: false,
  includeSourceCode: false,
  fallbackType: 'customtabs',
  features: { locationDelegation: { enabled: true }, playBilling: { enabled: false } },
  host: HOST,
  iconUrl: `${HOST}${BASE}/icons/icon-512.png`,
  maskableIconUrl: `${HOST}${BASE}/icons/maskable-512.png`,
  launcherName: 'Octopus',
  name: 'Octopus Verticales',
  navigationColor: '#FFFFFF',
  navigationColorDark: '#141414',
  navigationDividerColor: '#E2E2E2',
  navigationDividerColorDark: '#262626',
  orientation: 'portrait',
  packageId: 'io.github.marieteffk.octopusverticales',
  pwaUrl: `${HOST}${BASE}/`,
  shortcuts: [
    { name: 'Nueva foto', short_name: 'Foto', url: `${BASE}/index.html#/fotos?nueva=1`, icons: [{ sizes: '192x192', src: `${BASE}/icons/icon-192.png` }] },
    { name: 'Muro', short_name: 'Muro', url: `${BASE}/index.html#/muro`, icons: [{ sizes: '192x192', src: `${BASE}/icons/icon-192.png` }] },
    { name: 'Clima', short_name: 'Clima', url: `${BASE}/index.html#/clima`, icons: [{ sizes: '192x192', src: `${BASE}/icons/icon-192.png` }] },
    { name: 'Fichar', short_name: 'Fichar', url: `${BASE}/index.html#/partes`, icons: [{ sizes: '192x192', src: `${BASE}/icons/icon-192.png` }] },
  ],
  signingMode: existingKey ? 'mine' : 'new',
  signing: { file: existingKey, ...signing },
  splashScreenFadeOutDuration: 300,
  startUrl: `${BASE}/index.html`,
  themeColor: '#FFFFFF',
  themeColorDark: '#141414',
  webManifestUrl: `${HOST}${BASE}/manifest.webmanifest`,
};

const headers = { 'content-type': 'application/json', 'platform-identifier': 'OctopusVerticalesCLI', 'platform-identifier-version': '1.0.0' };
const enq = await fetch(`${SERVICE}/enqueuePackageJob`, { method: 'POST', body: JSON.stringify(options), headers });
if (!enq.ok) throw new Error(`No se pudo encolar el trabajo: ${enq.status} ${await enq.text()}`);
const jobId = await enq.text();
console.log('Trabajo encolado:', jobId);
const seen = new Set();
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${SERVICE}/getPackageJob?id=${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(`Error consultando el trabajo: ${res.status}`);
  const job = await res.json();
  for (const l of job.logs || []) if (!seen.has(l)) { seen.add(l); console.log('  ', String(l).slice(0, 160)); }
  if (job.status === 'Completed') break;
  if (job.status === 'Failed') throw new Error('El empaquetado ha fallado. Revisa los mensajes anteriores.');
}
const zip = await fetch(`${SERVICE}/downloadPackageZip?id=${encodeURIComponent(jobId)}`);
if (!zip.ok) throw new Error(`No se pudo descargar el paquete: ${zip.status}`);
const buf = Buffer.from(await zip.arrayBuffer());
const zipPath = join(out, 'octopus-verticales-android.zip');
writeFileSync(zipPath, buf);
console.log(`Paquete descargado: android/octopus-verticales-android.zip (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
