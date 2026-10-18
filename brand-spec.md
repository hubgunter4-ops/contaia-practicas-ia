# ContaIA — referencia de marca y paletas por área

## Dirección visual

ContaIA conserva su identidad editorial y humanista, con paletas diferenciadas según el contexto de uso. **Aula en vivo** utiliza el tema oscuro lavanda/menta mostrado en la referencia visual. El Asistente abierto y las áreas editoriales que aún usan el tema cálido conservan su paleta propia; el Analizador CFDI conserva su tema AuditPro. La paleta nueva no debe aplicarse como regla global.

## Paleta del Aula en vivo

| Rol | Color | Uso recomendado |
|---|---|---|
| Tinta de fondo | `#191B28` | Fondo principal del aula. |
| Superficie principal | `#202333` | Navegación, paneles y tarjetas. |
| Superficie elevada | `#252838` | Escenas, tarjetas de contenido y superficies secundarias. |
| Lavanda | `#AA91FF` | Selección activa, barra de progreso y acentos de marca. |
| Lavanda clara | `#C0ADFF` | Títulos, enlaces y acciones destacadas. |
| Menta | `#9CE8C7` | Líneas de acento, estados positivos y foco visible. |
| Texto principal | `#F0EFF7` | Texto sobre fondos oscuros. |
| Texto secundario | `#B4B6C7` | Descripciones, etiquetas y estados auxiliares. |
| Bordes | `#383C50` | Separación de tarjetas y controles. |

Usar la lavanda y la menta como acentos, no como grandes superficies de texto. Mantener contraste suficiente y no comunicar estados únicamente mediante color. Respetar navegación por teclado, foco visible y `prefers-reduced-motion`.

## Alcance y convivencia entre temas

- La paleta lavanda/menta se limita a **Aula en vivo** y sus componentes internos.
- Las vistas que no tienen el tema oscuro conservan su paleta editorial cálida: vino `#7A2E3A`, vino oscuro `#59202A`, dorado `#D8B26E`, papel `#F6F1E8`, papel claro `#FFFCF6`, tinta `#272A2B` y línea `#E1D9CB`.
- El Analizador CFDI mantiene su tema AuditPro independiente.
- La implementación CSS del tema del Aula debe permanecer condicionada a esa vista; no cambiar `:root` ni sobrescribir globalmente los colores de otras áreas.

## Activos locales

| Uso | Archivo o fuente | Tratamiento |
|---|---|---|
| Marca/favicon | `public/favicon.svg` | Reutilizado como marca del producto. |
| Ilustración heredada de Nora | `public/assets/nora/nora-idle.webp` y variantes | Disponible para las vistas que la utilizan; no equivale a un avatar con lip-sync. |
| Avatar conversacional de Nora | Sesión de Anam en el elemento de video WebRTC | Avatar predeterminado donde está integrada la conversación en vivo; conectar solo tras acción explícita de la persona. |
| Capturas anteriores | `aula-nora-preview.png`, `aula-nora-mobile-preview.png` | Capturas del diseño previo de paleta cálida; no representan el tema actual lavanda/menta ni deben presentarse como previews actualizados. |

## Tipografía y forma

- Alegreya Sans para interfaz y lectura; DM Mono para etiquetas y datos compactos.
- Espaciado basado en múltiplos de 4 px; radios discretos y sombras moderadas.
- Movimiento limitado a señales funcionales breves; respetar la preferencia de movimiento reducido.

## Privacidad y comportamiento

El video de Anam no debe conectarse automáticamente: la sesión y el micrófono requieren una acción explícita. El elemento de video debe conservarse durante los rerenderizados para evitar desmontar la conexión. En el Asistente abierto, el texto de documentos solo se envía cuando la persona formula y envía una pregunta; el XML bruto no se almacena ni se envía al chat. El progreso y las notas locales no se incorporan al contexto del asistente.
