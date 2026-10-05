# Lanzamiento en Google Play — checklist

App: `com.pulsofitness.pulsofitness` (variante production). Los builds se hacen con
`npx eas-cli build -p android --profile production` desde `pulso/` y generan un AAB.

## 1. Antes de subir nada

- [ ] Mergear el PR de preparativos y desplegar el servidor, para que estas URLs respondan:
      https://pulsofitness.tech/privacidad, /terminos, /eliminar-cuenta y /app-ads.txt
- [ ] Crear la app en Play Console: nombre "PULSO: Entreno y Nutrición", idioma
      predeterminado español (Latinoamérica), App, Gratis.

## 2. Primera subida (manual)

La primera versión se sube a mano en Play Console; después se puede usar `eas submit`.

- [ ] Descargar el AAB del build de EAS.
- [ ] Prueba → Prueba cerrada → crear pista → subir el AAB.
- [ ] Aceptar **Play App Signing** (Google firma la app; la clave de EAS queda como clave de subida).
- [ ] Notas de la versión: "Primera versión de PULSO."

### Requisito de cuenta personal

Las cuentas personales nuevas necesitan una **prueba cerrada con al menos 12 testers durante
14 días seguidos** antes de pedir acceso a producción.

- [ ] Crear una lista de testers (correos de Google) con 12 personas o más.
- [ ] Compartir el enlace de inscripción; cada tester tiene que aceptar e instalar.
- [ ] Mantenerlos inscritos 14 días. Subir alguna actualización en ese período ayuda en la revisión.
- [ ] Después: Panel → "Solicitar acceso a producción" y contestar el cuestionario sobre la prueba.

## 3. Contenido de la app (Política → Contenido de la app)

- [ ] **Política de privacidad:** https://pulsofitness.tech/privacidad
- [ ] **Anuncios:** Sí, la app contiene anuncios.
- [ ] **Acceso a la app:** "Todas o algunas funciones están restringidas". Crear una cuenta
      de prueba solo para la revisión (correo + contraseña) y explicar: "Crear cuenta o
      iniciar sesión con este usuario. No hace falta verificación adicional."
      No usar las cuentas personales ni la de admin.
- [ ] **Clasificación de contenido:** cuestionario IARC, categoría "Utilidad, productividad,
      comunicación u otra". Sin violencia, sexo, drogas ni apuestas. Los usuarios interactúan
      (mensajes con su entrenador): Sí. Comparte ubicación: No. Compras digitales: Sí
      (cuando se active Plus).
      Uso compartido de contenido del usuario: **Sí** (chat con el profesional y fotos compartidas).
      Bloquear usuarios: **Sí** (Equipo → Salir del equipo corta el contacto). Informar de
      usuarios: **Sí** (Reportar, en Equipo y en el chat). Moderación de chat: **No**
      (los reportes se revisan a mano en el panel de admin, no hay moderación automática).
      Interacciones limitadas a invitados: **Sí** (solo con un código de invitación).
      Contenido en línea: **Sí** (planes generados con IA, planes del profesional, catálogo de
      productos y anuncios).
- [ ] **Público objetivo:** 18 años o más únicamente. No atrae a niños.
- [ ] **Público objetivo:** 18 años o más únicamente. No atrae a niños.
- [ ] **App de noticias:** No.
- [ ] **Apps de salud:** marcar "Actividad física y fitness" y "Nutrición y control de peso".
      No es un dispositivo médico.
- [ ] **ID de publicidad:** Sí, se usa (AdMob), para publicidad y analítica.
- [ ] **Apps gubernamentales / préstamos / COVID:** No.
- [ ] **Eliminación de cuenta:** URL https://pulsofitness.tech/eliminar-cuenta. También
      se puede borrar desde la app (Perfil → Configuración → Borrar mi cuenta).

### Seguridad de los datos

Respuestas generales:

- ¿Recopila o comparte datos? **Sí**
- ¿Los datos se cifran en tránsito? **Sí**
- ¿Los usuarios pueden pedir que se borren? **Sí**, desde la app o en /eliminar-cuenta.

Tipos de datos. "Compartido" = enviado a un tercero que no actúa en nombre de PULSO. AWS,
Sentry, SES y RevenueCat son proveedores de servicio, así que no cuentan como compartir.
Lo que el usuario manda a su entrenador por iniciativa propia tampoco cuenta.

| Categoría → tipo | Recopilado | Compartido | Opcional | Fines |
|---|---|---|---|---|
| Info personal → Nombre | Sí | No | No | Funcionalidad, gestión de cuenta |
| Info personal → Correo | Sí | No | No | Funcionalidad, gestión de cuenta, comunicaciones |
| Info personal → IDs de usuario | Sí | No | No | Funcionalidad, gestión de cuenta |
| Info personal → Otra info (sexo, fecha de nacimiento) | Sí | No | Sí | Funcionalidad, personalización |
| Salud y fitness → Info de fitness (entrenos, medidas, peso) | Sí | No | Sí | Funcionalidad, personalización |
| Salud y fitness → Info de salud (comidas, limitaciones físicas del cuestionario de IA) | Sí | No | Sí | Funcionalidad, personalización |
| Fotos y videos → Fotos (tabla nutricional; fotos de progreso solo si se comparten con el equipo) | Sí, **procesado efímero** para las etiquetas | No | Sí | Funcionalidad |
| Info financiera → Historial de compras (Plus) | Sí | No | Sí | Funcionalidad, gestión de cuenta |
| Mensajes → Otros mensajes en la app (chat con el entrenador) | Sí | No | Sí | Funcionalidad |
| Info y rendimiento de la app → Registros de fallos, Diagnóstico | Sí | No | No | Analítica (Sentry) |
| Dispositivo u otros IDs → ID de publicidad | Sí | **Sí** (Google AdMob) | No | Publicidad, analítica, prevención de fraude |
| Actividad en la app → Interacciones con la app (SDK de AdMob) | Sí | **Sí** (Google AdMob) | No | Publicidad, analítica, prevención de fraude |
| Ubicación → Aproximada (AdMob la infiere de la IP) | Sí | **Sí** (Google AdMob) | No | Publicidad, prevención de fraude |

Los datos de Health Connect (pasos, peso, sueño, frecuencia cardíaca) **no salen del
teléfono**, así que no se declaran como recopilados. Si algún día entran en el respaldo o
la sincronización, hay que actualizar esta tabla y la política.

Revisá la tabla contra la guía de AdMob ("Divulgación de datos del SDK de Google Mobile Ads"),
porque Google puede ajustarla.

## 4. Declaración de permisos de Health Connect

Play Console → Contenido de la app → **Permisos de Health Connect**. Una justificación por permiso:

| Permiso | Justificación |
|---|---|
| READ_STEPS | Mostrar los pasos del día en la pantalla Salud, junto al entrenamiento y la nutrición registrados en PULSO. |
| READ_WEIGHT | Importar el peso a Progreso para graficar la evolución corporal sin cargarlo dos veces. |
| READ_SLEEP | Mostrar las horas de sueño de la noche anterior en Hoy, para ajustar la intensidad del entrenamiento. |
| READ_HEART_RATE | Mostrar la última frecuencia cardíaca registrada en la pantalla Salud, junto a los otros datos del día. PULSO no la interpreta. |
| WRITE_EXERCISE | Guardar en Health Connect las sesiones de fuerza completadas en PULSO para que otras apps las vean. |

- Política de privacidad con la sección de Health Connect y la declaración de uso limitado:
  https://pulsofitness.tech/privacidad (sección 3).
- La app ya responde al enlace de privacidad del diálogo de permisos (acción
  `ACTION_SHOW_PERMISSIONS_RATIONALE` y alias `VIEW_PERMISSION_USAGE`): abre /privacidad.
- Google puede pedir un video que muestre el flujo: Configuración → Salud → Conectar →
  diálogo de permisos → datos visibles en Salud, Hoy (sueño) y Progreso (peso).

## 5. Ficha de Play Store

Textos en `ficha-es.md`. Gráficos en esta carpeta:

- [ ] Ícono 512×512 → `icon-512.png`
- [ ] Gráfico de funciones 1024×500 → `feature-graphic-1024x500.png`
- [ ] 2 a 8 capturas de teléfono → `screenshots/`
- [ ] Categoría: Salud y bienestar. Correo de contacto: pulso@pulsofitness.tech

## 6. Inicio de sesión con Google en producción

El client de Android que existe es solo el de desarrollo (`com.lalomaster.pulso`).

- [ ] Google Cloud Console → Credenciales → crear un **ID de cliente de Android** para
      `com.pulsofitness.pulsofitness` con el SHA-1 de **firma de apps de Play**
      (Play Console → Configuración → Integridad de la app → Firma de apps).
- [ ] Crear otro client de Android con el SHA-1 de la **clave de subida** (EAS), para que
      funcione también al instalar el AAB fuera de Play. Se ve con
      `npx eas-cli credentials -p android` → production.
- [ ] La pantalla de consentimiento de OAuth tiene que estar **publicada** (en producción, no
      en prueba), con el dominio pulsofitness.tech y la URL de privacidad.

Sin esto el botón de Google falla en el build de Play. Correo y contraseña funcionan igual.

## 7. AdMob

- [ ] AdMob → Apps → PULSO → **vincular con la ficha de Google Play** (cuando la app esté publicada,
      aunque sea en prueba cerrada no siempre aparece; si no, después de producción).
- [ ] Verificar `app-ads.txt` en AdMob (tarda hasta 24 h en detectarse; tiene que estar en
      https://pulsofitness.tech/app-ads.txt **y** el sitio web de la ficha tiene que ser https://pulsofitness.tech).
- [ ] **Privacidad y mensajes** → crear y publicar un mensaje de **GDPR** (EEE, Reino Unido,
      Suiza). La app ya lo muestra a quien corresponda (UMP). Sin mensaje publicado, en esos
      países solo se sirven anuncios limitados.
- [ ] Agregar los teléfonos de prueba como **dispositivos de prueba** en AdMob. Los builds
      preview y production muestran anuncios reales, y tocarlos uno mismo es tráfico inválido.

## 8. Pagos — PULSO Plus

El build de producción sale con el cobro **apagado** (`EXPO_PUBLIC_BILLING_ENABLED` vacío).
Para activarlo:

1. [ ] Play Console → Configuración → **Perfil de pagos** (cuenta de comerciante) completo.
2. [ ] Con un AAB ya subido (incluye el permiso BILLING): Monetizar → Productos →
       **Suscripciones** → crear `pulso_plus` con su plan base (mensual/anual) y precios.
3. [ ] Google Cloud: cuenta de servicio con acceso a la API de Google Play Developer;
       invitarla en Play Console → Usuarios y permisos (ver datos financieros, gestionar
       pedidos y suscripciones). Descargar su JSON.
4. [ ] RevenueCat → Project → **Google Play app** con el paquete `com.pulsofitness.pulsofitness`
       y el JSON de la cuenta de servicio. Configurar las notificaciones en tiempo real (RTDN, Pub/Sub).
5. [ ] RevenueCat: importar el producto, asociarlo al entitlement `pulso_plus` y a la offering actual.
6. [ ] Reemplazar en `pulso/.env` la clave `test_…` por la clave pública de Android de
       producción (`goog_…`) y poner `EXPO_PUBLIC_BILLING_ENABLED=true`.
7. [ ] Probar la compra con un **tester con licencia** (Play Console → Configuración → Pruebas
       de licencias) en la pista de prueba cerrada.
8. [ ] Nuevo build de producción y subirlo.

El webhook de RevenueCat al servidor ya está configurado.

## 9. Pendientes del dueño

- [ ] Agregar tu nombre legal o razón social en la política de privacidad si Play lo pide
      (la ficha muestra el nombre del desarrollador y la dirección de la cuenta).
- [ ] Reemplazar el token de Doppler del servidor por uno de **solo lectura**.
- [ ] Decidir si los datos importados de Health Connect entran en el respaldo (hoy no).
