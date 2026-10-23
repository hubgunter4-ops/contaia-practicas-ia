# ContaIA — Fase IA E1: `AiDataLossPreventionGate`

**Versión:** `ai-dlp-v1`
**Estado:** implementada localmente y validada; sin commit, push ni despliegue
**Dependencia:** contrato E0 `ai-governance-v1`

## 1. Objetivo

E1 sustituye el filtro inicial de cuatro patrones del planner por un gate DLP local, determinista y auditable. El gate clasifica la petición textual antes de construir el request remoto y bloquea la salida si detecta contenido estructurado, identificadores fiscales, datos personales o referencias bancarias.

La implementación no usa un modelo para clasificar el texto. Tampoco envía el texto a un servicio de DLP. La detección ocurre en memoria y la misma frontera se reutiliza en cliente y servidor mediante `src/cfdi/ai/planner.js`.

## 2. Contrato del gate

El módulo `src/cfdi/ai/ai-dlp-gate.js` expone:

- `assessAiText(raw)`: devuelve una evaluación pura sin lanzar red.
- `assertPlannerSafeText(raw)`: devuelve texto normalizado solo si es seguro; de lo contrario lanza `AiDlpError`.
- `AiDlpError`: conserva código, decisión, categorías, razones, preview redacted y versión de política sin incluir el texto original en el mensaje.

La evaluación tiene esta forma conceptual:

```js
{
  policyVersion: "ai-dlp-v1",
  decision: "allow" | "confirm" | "block",
  categories: ["email"],
  reasonCodes: ["email_identifier"],
  normalizedLength: 34,
  normalizedMessage: "", // solo se llena en allow
  redactedPreview: "Escribe a [DATO_REDACTADO:email]"
}
```

### Decisiones

- `allow`: la petición se normaliza, se compactan espacios y puede continuar.
- `confirm`: se detecta una señal de confianza media. El planner actual opera en modo estricto, por lo que detiene la llamada y solicita reformulación; no se envía automáticamente.
- `block`: se detecta contenido de alta confianza o entrada inválida; la llamada se detiene.

### Códigos del planner

- `planner_input_invalid`: texto vacío, no textual o mayor a 2,000 caracteres.
- `planner_input_sensitive`: dato de alta confianza o contenido estructurado sensible.
- `planner_input_confirmation_required`: dato personal/estructurado de confianza media que requiere una futura UI explícita si se decide admitirlo.

## 3. Categorías detectadas

### Alta confianza — `block`

- XML, `<?xml`, etiquetas `cfdi`, `tfd` o `Comprobante`.
- UUID de CFDI.
- RFC mexicano.
- CURP.
- NSS cuando aparece con contexto IMSS/seguro social.
- CLABE o cuenta bancaria con contexto financiero.
- Tarjeta con contexto de crédito/débito.
- Bloques codificados o Base64 con contexto de adjunto/payload.
- Caracteres de control.
- Texto vacío o sobre el límite.

### Confianza media — `confirm`

- Correos electrónicos.
- Teléfonos con contexto de contacto.
- Campos etiquetados como cliente, proveedor, beneficiario, titular, empresa o razón social.
- Campos de domicilio, dirección, calle, colonia o código postal.
- URLs con query string o posible token.
- Tablas CSV/TSV o texto tabular de múltiples líneas.
- JSON estructurado.
- Caracteres invisibles zero-width.

La severidad se conserva en la evaluación local, pero el planner actual no permite que `confirm` se convierta en envío implícito. Cualquier futura admisión de señales medias deberá añadir una confirmación visible y una decisión de privacidad separada.

## 4. Normalización y redacción

Antes de clasificar se aplica:

- normalización Unicode NFKC;
- eliminación de caracteres zero-width;
- detección y eliminación controlada de caracteres de control;
- normalización de saltos de línea;
- compactación de espacios;
- límite de 2,000 caracteres.

El gate nunca devuelve el texto sensible como `normalizedMessage` cuando la decisión no es `allow`. `redactedPreview` sustituye rangos detectados por marcadores de categoría. Si una condición de alta severidad no tiene un rango puntual, como texto sobredimensionado o controles, el preview completo se sustituye por un marcador global.

El preview es una ayuda local de diagnóstico. No se envía al Gateway y no debe entrar a telemetría.

## 5. Integración en el flujo

```text
Texto de la persona
  │
  ▼
assertPlannerSafeText()
  ├── allow ──► buildCfdiPlannerRequest() ──► planner-api ──► Gateway
  ├── confirm ─► error local; no fetch
  └── block ──► error local; no fetch
```

El servidor usa `validateCfdiPlannerInput()`, que vuelve a ejecutar `buildCfdiPlannerRequest()` y por tanto repite el gate antes de `callCfdiPlanner()`. La defensa no depende únicamente de que el cliente haya ejecutado correctamente su módulo.

La ruta local determinista de CFDI no usa el gate para calcular alertas, pagos o resumen. E1 protege solamente la frontera de salida del texto hacia el planner. Nora continúa protegida por el schema y sanitización de `cfdi-summary-v1`; una ampliación de DLP para otros modos debe tratarse en una fase específica.

## 6. Pruebas

La cobertura E1 incluye:

- pregunta general permitida;
- espacios y Unicode normalizados;
- XML, UUID y RFC bloqueados;
- CURP, NSS, CLABE y tarjetas bloqueados;
- correo, teléfono, nombres etiquetados, domicilios y URLs clasificados como confirmación;
- tablas, JSON, Base64 y caracteres de control;
- zero-width y límite de 2,000 caracteres;
- códigos distintos de bloqueo, confirmación e input inválido;
- preview sin el dato original;
- servidor que rechaza señales DLP antes de llamar al Gateway;
- garantía de que `fetchImpl` no se invoca en esos casos.

Validación de cierre:

- **265/265 pruebas unitarias** aprobadas.
- **21/21 pruebas focalizadas** de DLP y servidor aprobadas.
- **4/4 E2E focalizadas** del panel CFDI aprobadas en escritorio y Pixel 5.
- Build estático de Vercel aprobado.
- Compilación focalizada del gate, planner y endpoint aprobada.
- Sintaxis y `git diff --check` aprobados.

## 7. Límites conocidos

- El gate es determinista y basado en patrones; no es una clasificación semántica completa ni un DLP forense.
- No detecta con certeza todos los nombres, direcciones o datos contenidos en imágenes, audio o archivos porque E1 solo cubre texto del planner.
- Las señales medias se bloquean en el planner actual; no existe todavía una UI de confirmación/redacción interactiva.
- Las herramientas locales y el cliente siguen siendo manipulables por quien controla el navegador; E2 deberá convertir cuotas y Premium en decisiones server-side.
- El borrado de memoria sigue siendo best effort del lifecycle del navegador.

## 8. Siguiente fase

E1 queda terminada localmente. La siguiente propuesta es **Fase IA E2 — admisión, identidad, entitlements y cuotas server-side**, utilizando las capacidades y límites definidos en E0 sin enviar datos fiscales para resolver el plan.
