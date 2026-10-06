# Octopus Verticales · App del equipo

Aplicación interna para la empresa de trabajos verticales **Octopus Verticales**: organiza trabajos, fotos, notas, agenda, horas, seguridad y materiales, con un muro para hablar con todo el equipo y un parte meteorológico pensado para decidir si se puede trabajar en altura.

Es una **PWA** (Progressive Web App): la misma aplicación funciona como **app de Android** (instalable, pantalla completa, funciona sin conexión) y como **página web** en cualquier navegador. Se aloja gratis en **GitHub Pages**.

## Funciones

| Sección | Qué hace |
|---|---|
| 🏠 Inicio | Resumen del día: semáforo del clima, fichaje activo, avisos (checklist pendiente, EPIs por revisar, material bajo mínimo), agenda de hoy, tus trabajos, notas y último del muro. |
| 🧰 Trabajos | Órdenes de trabajo con cliente, dirección (abre Google Maps), tipo, prioridad, estado (presupuesto → pendiente → en curso → terminado → facturado), equipo asignado, tareas, fotos antes/durante/después, materiales consumidos, horas fichadas, presupuesto imprimible (PDF) e historial. |
| 📷 Fotos | Galería compartida: cámara o galería, compresión automática, etiqueta (antes/después/incidencia…), vínculo al trabajo, visor a pantalla completa, **selección múltiple y compartir por WhatsApp**, descarga. |
| 💬 Muro | Tipo Twitter interno: publicaciones con texto e imágenes, me gusta, comentarios, enlace al trabajo. |
| 🌦️ Clima | Tiempo en directo (Open-Meteo, sin clave): **probabilidad de lluvia hora a hora (48 h)**, lluvia cada 15 minutos (3 h), viento y rachas, 7 días, ventanas de trabajo aptas y **semáforo APTO / PRECAUCIÓN / NO APTO** con umbrales configurables. Ubicación por GPS, búsqueda o dirección de la obra. |
| 📅 Agenda | Calendario mensual: planificación de obras, visitas, ausencias; quién va a cada sitio. |
| 📝 Notas | Notas y listas de comprobación, privadas o compartidas, con colores, etiquetas y fijado. |
| ⏱️ Partes y horas | Fichar entrada/salida por trabajo con cronómetro, fichajes manuales, resumen semanal, vista de todo el equipo (jefes/oficina) y exportación CSV. |
| 🦺 Seguridad y EPIs | Checklist diario pre-uso (anclajes, cuerdas, arnés, rescate…) firmado por técnico, registro de EPIs con caducidades y revisiones anuales, e incidencias con fotos. |
| 📦 Materiales | Inventario por ubicación (almacén / furgonetas), stock con +/−, mínimos y lista de compra automática compartible. |
| 🏢 Clientes | Fichas con llamada, WhatsApp, email, mapa e historial de trabajos. |
| 👷 Equipo | Compañeros, puesto, disponibilidad, contacto rápido, horas de la semana y carga de trabajo. |
| ⚙️ Ajustes | Perfil, tema claro/oscuro, umbrales meteorológicos, datos de empresa e IVA, instalación, nube y copias de seguridad. |

## Modos de uso

1. **Modo local (sin configurar nada)**: cada móvil guarda sus datos en el propio dispositivo (IndexedDB). Ideal para probar. Las fotos se pueden compartir igualmente con “Compartir”.
2. **Nube compartida (recomendado para el equipo)**: con una cuenta gratuita de Supabase, todos los empleados ven lo mismo en tiempo real (fotos, muro, trabajos, notas, horas…). La app sigue funcionando sin cobertura y sincroniza al volver la conexión.

## Instalar en Android

1. Abre la web de la app en Chrome (la URL de GitHub Pages).
2. Menú ⋮ → **Instalar aplicación** (o “Añadir a pantalla de inicio”).
3. Ya aparece como app con su icono; abre a pantalla completa y funciona sin conexión.

También puedes generar un **APK/AAB para Google Play** desde la URL publicada con [PWABuilder](https://www.pwabuilder.com/) (Android → Generate). No hace falta tocar el código.

## Publicar gratis en GitHub Pages

```bash
git init
git add .
git commit -m "feat: app Octopus Verticales"
gh repo create octopus-verticales --public --source=. --push
gh api -X POST repos/{owner}/octopus-verticales/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
```

En uno o dos minutos la app queda en `https://<tu-usuario>.github.io/octopus-verticales/`. Cada `git push` a `main` la actualiza.

## Nube compartida (Supabase)

1. Crea una cuenta gratuita en [supabase.com](https://supabase.com) y un proyecto nuevo (región Europa).
2. En **SQL Editor** pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. En **Authentication → Providers → Email** comprueba que está activado. Opcional: desactiva “Confirm email” para que los compañeros entren al momento.
4. En **Project Settings → API** copia la **Project URL** y la **anon public key**.
5. En la app: **Ajustes → Nube del equipo** → pega URL y clave → **Guardar y conectar** → cada empleado crea su cuenta con su email y contraseña.

Las fotos se guardan en el bucket `media` (1 GB gratis, suficiente para miles de fotos comprimidas). Los datos en la tabla `docs` solo son accesibles por usuarios autenticados.

## Desarrollo

```bash
npm install          # solo para regenerar iconos
npm start            # http://localhost:8080
npm test             # pruebas unitarias (análisis meteorológico, datos)
npm run icons        # regenera icons/*.png desde icons/icon.svg
```

Sin build ni frameworks: HTML + CSS + JavaScript (módulos ES) para que cualquiera pueda mantenerla.

```
index.html            página única
manifest.webmanifest  metadatos PWA (nombre, iconos, accesos directos)
sw.js                 service worker: caché offline
css/app.css           estilos (tema claro/oscuro)
js/app.js             arranque, rutas, menú, onboarding
js/ui.js              plantillas seguras, modales, fechas
js/db.js              datos locales (IndexedDB) y ajustes
js/cloud.js           sincronización Supabase (opcional)
js/media.js           fotos: compresión, miniaturas, compartir
js/weather.js         Open-Meteo + semáforo de aptitud
js/views/*.js         una vista por sección
supabase/schema.sql   esquema de la nube
tests/                pruebas con node:test
```

## Privacidad y seguridad

- Sin cuentas de terceros ni anuncios. El clima se consulta a Open-Meteo solo con coordenadas.
- En modo nube, solo usuarios autenticados pueden leer/escribir (políticas RLS en `schema.sql`).
- Las claves que se guardan en el móvil son las públicas (“anon”) de Supabase; nunca la clave de servicio.
