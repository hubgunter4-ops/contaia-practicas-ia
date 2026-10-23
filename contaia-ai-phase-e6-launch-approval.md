# ContaIA — Fase IA E6: UX Premium, canary sintético y aprobación de lanzamiento

**Estado:** terminada y validada localmente; pendiente de commit, push y despliegue.

**Alcance:** hacer visibles los límites Free/Premium sin convertir el navegador en autoridad de entitlements, añadir un canary determinista con fixtures sintéticos y congelar la aprobación de lanzamiento detrás de un gate fail-closed.

## Entregables

- `src/tools/premium-ux.js` implementa `premium-ux-v1`, normaliza snapshots y cae a Free cuando la respuesta no es server-side, verificada y explícita.
- El centro de ContaIA Herramientas muestra un panel informativo con medidores de referencia, estado de plan, autoridad server-side y alternativas claras. No ofrece checkout, cobro ni activación de Premium.
- `src/cfdi/ai/synthetic-canary.js` implementa `ai-synthetic-canary-v1` con cuatro casos ficticios, validación anti-PII/anti-XML, resultados agregados, buckets de duración y códigos de error enumerados. No devuelve mensajes ni respuestas del proveedor.
- `src/cfdi/ai/launch-approval.js` implementa `ai-launch-approval-v1`; requiere matriz aprobada, canary válido, revisión de privacidad, configuración de producción, métricas redacted limpias y referencia de evidencia. Cualquier ausencia mantiene la decisión en `hold`.
- La UI conserva la paleta Confianza fiscal, foco visible, layout responsive y `prefers-reduced-motion`.

## Contrato de autoridad

`data-premium-plan`, el DOM, `localStorage`, query strings y cualquier estado enviado por el navegador son informativos y no habilitan capacidades. La respuesta efectiva de plan debe provenir de servidor autenticado y verificado. Ante incertidumbre, la interfaz muestra Free y mantiene disponibles las herramientas locales.

La UX no añade pagos, Stripe, checkout, webhooks, tablas, persistencia de entitlements, secretos ni un endpoint comercial. El contrato [Free/Premium](/home/ubuntu/contaia-practicas-ia/contaia-free-premium-upgrade-contract.md) continúa pendiente como definición comercial y de producción.

## Canary sintético

Los fixtures solo contienen preguntas generales ficticias; se rechazan RFC, CURP, UUID, XML, correo, teléfono, claves, Bearer y secuencias numéricas identificables. El reporte conserva únicamente conteos, tasa de aprobación, bucket de duración, identificadores sintéticos y códigos enumerados. El runner es inyectable y no se ejecuta automáticamente en producción ni envía datos reales.

## Gate de lanzamiento

La salida por defecto es `hold`. El gate no sustituye la revisión humana, la configuración privada de E5, la activación Redis de E3, la observabilidad operativa de E4 ni la revisión contractual del proveedor. Aun con un canary aprobado, la ausencia de una de esas evidencias impide declarar el lanzamiento aprobado.

## Evidencia

- **320/320 pruebas unitarias** aprobadas.
- Build estático `npm run build:vercel` aprobado después de restaurar íntegramente `tools.css` y anexar solo el bloque E6.
- **2/2 E2E focalizadas de E6** aprobadas: Chromium y mobile Chromium.
- La regresión completa cubrió 112 casos: **111/112** aprobaron en la corrida completa; el único CTA público intermitente se reejecutó de forma aislada y aprobó en **2/2** proyectos. E6 aprobó en ambas apariciones de la regresión.
- No se usaron datos fiscales reales, no se activaron proveedores, no se configuró Premium comercial y no se publicó esta fase.

## Pendientes

- Mantener pendiente el contrato comercial Free/Premium, precios, cobro y entitlements de producción.
- Configurar secretos privados E3/E5 solo después de revisión y autorización separadas.
- Definir el sink/retención operativa de E4 sin introducir datos sensibles.
- Ejecutar una revisión de lanzamiento independiente antes de cambiar el gate de `hold` a `approved`.
