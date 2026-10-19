# Componente de video reutilizable

El componente `contaia-video` reproduce la animación de Analizador CFDI en silencio, conserva la proporción 16:9, muestra un control accesible para pausar/reanudar y respeta `prefers-reduced-motion`. La descarga del MP4 se difiere hasta que el componente entra en el área cercana a la vista; el póster se muestra antes de que el video esté listo.

## Variantes optimizadas

| Ancho de pantalla | Archivo seleccionado | Resolución | Tamaño de archivo |
| --- | --- | ---: | ---: |
| Hasta 600 px o modo de ahorro de datos | `contaia-analizador-cfdi-loop-480p.mp4` | 854×480 | 572 KB |
| 601–1100 px | `contaia-analizador-cfdi-loop-720p.mp4` | 1280×720 | 1,4 MB |
| Más de 1100 px | `contaia-analizador-cfdi-loop.mp4` | 1920×1080 | 4,4 MB |

Los tamaños son aproximados y corresponden a los archivos actuales del repositorio. No se descarga una variante por cada ancho: el componente elige una sola fuente al acercarse a la vista y cambia solo si el usuario cruza un umbral de pantalla.

## Inserción automática en una página HTML

El script `scripts/insert-video-component.mjs` busca un contenedor HTML por su `id`, inserta el componente al inicio o al final, y agrega el módulo solo si todavía no está cargado. La operación es idempotente para un mismo `--video-id`.

```bash
node scripts/insert-video-component.mjs \
  --page public/otra-pagina.html \
  --target-id seccion-hero \
  --video-id contaia-hero \
  --position end
```

Opciones: `--page` y `--target-id` son obligatorias; `--position` acepta `start` o `end`. `--src`, `--src-720`, `--src-480`, `--poster` y `--label` reemplazan las rutas/texto predeterminados. `--dry-run` imprime el HTML resultante sin escribirlo. Ejecuta `node scripts/insert-video-component.mjs --help` para ver la ayuda.

El script acepta archivos `.html` dentro del proyecto. Para rutas que se renderizan desde JavaScript (por ejemplo, vistas internas de una SPA), importa `/assets/contaia-video.js` una vez y crea el elemento `<contaia-video>` desde el módulo que construye esa vista.

## Inserción manual

```html
<contaia-video
  src="/videos/contaia-analizador-cfdi-loop.mp4"
  src-720="/videos/contaia-analizador-cfdi-loop-720p.mp4"
  src-480="/videos/contaia-analizador-cfdi-loop-480p.mp4"
  poster="/videos/contaia-analizador-cfdi-poster.webp"
  label="Animación financiera de ContaIA, sin sonido"
  autoplay loop muted playsinline decorative>
</contaia-video>
```

Incluye este módulo una sola vez en la página:

```html
<script type="module" src="/assets/contaia-video.js"></script>
```

El componente es fluido (`width: 100%` y relación 16:9), sin ancho fijo; puede limitarse con `style="--contaia-video-max-width: 960px"`. El contenido del formulario y demás controles de página debe seguir siendo HTML real, fuera del video.

## Validación registrada

- Chromium/Playwright: 6 comprobaciones de navegador aprobadas (proyectos escritorio y móvil) en anchos de 320, 390, 768, 1024, 1280 y 1920 px. El componente mantuvo el 16:9, no excedió el ancho del viewport y seleccionó la variante esperada (480p, 720p o 1080p).
- `prefers-reduced-motion`: la animación inicia pausada; el control accesible permite reproducirla y pausarla a petición.
- HTTP: una petición de 1.024 bytes devolvió `206 Partial Content`, `video/mp4`, `Accept-Ranges: bytes` y caché de un día.
- `ffprobe`: las tres variantes duran 15 s, 30 fps, H.264 y no contienen pista de audio. El build estático copia las variantes y el póster.
- Pruebas unitarias del repositorio: 108 aprobadas; pruebas de inserción CLI: 3 aprobadas.
