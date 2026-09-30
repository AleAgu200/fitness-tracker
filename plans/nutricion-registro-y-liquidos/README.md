# Revisar el plan de nutrición

El diseño se revisa en tres planes locales. Visual Plan admite como máximo 16 pantallas por prototipo; los 42 estados se reparten así:

| Plan | Contenido | Pantallas del prototipo |
| --- | --- | --- |
| `nutricion-registro-y-liquidos` (este) | Documento de decisiones, canvas y prototipo 1: escanear y registrar | 16 |
| `nutricion-comparar-y-planificar` | Prototipo 2: comparar, simular, fechas y Mis alimentos | 16 |
| `nutricion-liquidos-y-ajustes` | Prototipo 3: recipientes, bebidas y ajustes de comida | 13 |

Los botones punteados con **↗ N** llevan a una pantalla que se revisa en el prototipo N.

En esta carpeta:

- `plan.mdx`: decisiones, alcance, datos y aceptación.
- `canvas.mdx`: 12 pantallas de revisión (actual, propuesta, flujos y errores).
- `prototype.mdx`: prototipo 1, con 16 estados navegables. No utiliza datos reales.
- `.plan-url`: enlace local generado al servir (no versionar).

## Abrir

Requiere Node 22.22 o superior. Sin cambiar el Node global, ejecutar desde la raíz (una terminal por plan):

```powershell
npx --yes --package=node@22.22.0 --package=@agent-native/core@0.194.0 agent-native plan local serve --dir plans/nutricion-registro-y-liquidos --kind plan --open
npx --yes --package=node@22.22.0 --package=@agent-native/core@0.194.0 agent-native plan local serve --dir plans/nutricion-comparar-y-planificar --kind plan --open
npx --yes --package=node@22.22.0 --package=@agent-native/core@0.194.0 agent-native plan local serve --dir plans/nutricion-liquidos-y-ajustes --kind plan --open
```

Dejar las terminales abiertas mientras se revisa. Cada enlace abre el visor de Visual Plan y lee los archivos mediante un puente local. No sirve desde otra computadora.

`plan local check` solo hace un lint rápido: no valida límites del esquema como el máximo de 16 pantallas. Si el visor muestra "Invalid … block" en todos los bloques, revisar primero el prototipo y el canvas, porque un error ahí invalida cada bloque del documento.

## Alcance del prototipo

Es una demostración de navegación con fixtures: botones cambian de pantalla, los formularios no persisten datos y volver a Hoy reinicia el ejemplo. No hay cámara, OCR, servicios externos ni modificaciones de la app. Algunas pantallas ofrecen alternativas para explorar fallos. El canvas no es una captura de la app.

Enviar observaciones por chat con el nombre de la pantalla. No implementar funcionalidades hasta revisar el diseño.
