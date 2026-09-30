# Plan maestro

Abrir [plan.mdx](plan.mdx) para leer el documento completo. [canvas.mdx](canvas.mdx) añade tres vistas esquemáticas de producto. Las decisiones del propietario están recogidas; los pendientes operativos y comerciales están al final del documento.

## Visor local

Con Node compatible con la versión instalada del visor:

```powershell
npx @agent-native/core@latest plan local check --dir plans/plan-maestro
npx @agent-native/core@latest plan local serve --dir plans/plan-maestro --kind plan --open
```

Ejecutar desde la raíz del repositorio. La URL generada usa un puente local: funciona en esta máquina mientras el proceso siga activo. `.plan-url` contiene un token local y queda excluido de Git. El plan no se envía a una base hospedada; comentarios y decisiones se recogen por chat y se incorporan a los archivos.

El CLI latest tuvo un conflicto de dependencias durante la preparación. Para validar se puede usar la instalación ya disponible de `@agent-native/core` 0.194.0 con su Node compatible, sin actualizar las dependencias de PULSO.
