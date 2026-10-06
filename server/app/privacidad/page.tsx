import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "../legal/legal-shell";

export const metadata: Metadata = {
  title: "Política de privacidad",
  alternates: { canonical: "/privacidad" },
  description: "Qué datos usa PULSO, dónde se guardan, con quién se comparten y cómo controlarlos.",
};

const list = "list-disc space-y-2 pl-5";

/** Public privacy policy (Google Play, App Store and Health Connect link here). */
export default function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad" updated="5 DE OCTUBRE DE 2026">
      <p>
        PULSO es una app de entrenamiento y nutrición con un portal para entrenadores y nutricionistas.
        Fue diseñada para que tus datos vivan en tu teléfono: el servidor guarda solo lo necesario para
        tu cuenta, lo que vos decidís compartir con profesionales y las copias que activás. Esta política
        explica qué datos usamos, para qué, dónde se guardan y cómo controlarlos. Si tenés preguntas,
        escribinos a <a className="text-neon" href="mailto:pulso@pulsofitness.tech">pulso@pulsofitness.tech</a>.
      </p>

      <Section title="1. Datos que se quedan en tu teléfono">
        <p>
          El detalle de tus entrenamientos (series, cargas, esfuerzo), comidas y bebidas, planes,
          medidas, sueño registrado a mano, fotos de progreso y logros se guarda en una base de datos
          local de la app. Funciona sin conexión. Las fotos de progreso nunca salen del teléfono.
        </p>
      </Section>

      <Section title="2. Datos que guardamos en el servidor">
        <ul className={list}>
          <li><strong className="text-fg">Cuenta:</strong> nombre, correo, contraseña cifrada (hash) o el identificador de Google o Apple si entrás con ellos.</li>
          <li><strong className="text-fg">Perfil:</strong> sexo, fecha de nacimiento, altura, peso objetivo y tu último peso, para recuperarlos en otro dispositivo.</li>
          <li><strong className="text-fg">Lo que compartís con profesionales</strong> (sección 4), solo si lo autorizás.</li>
          <li><strong className="text-fg">Respaldo personal y sincronización entre dispositivos</strong> (sección 5), solo si los activás.</li>
          <li><strong className="text-fg">Suscripción:</strong> el estado de PULSO Plus (activa, vencida) y los avisos de la tienda.</li>
          <li><strong className="text-fg">Productos escaneados:</strong> la información nutricional de productos que agregás al catálogo comunitario por código de barras.</li>
        </ul>
        <p>El servidor y su base de datos funcionan en Amazon Web Services (Estados Unidos); el tráfico pasa por Cloudflare y viaja cifrado (HTTPS).</p>
      </Section>

      <Section title="3. Datos de salud (Health Connect y Salud de Apple)">
        <p>
          Si los conectás, PULSO puede <strong className="text-fg">leer</strong> pasos, peso, sueño y frecuencia cardíaca, y{" "}
          <strong className="text-fg">escribir</strong> los entrenamientos que completás. Cada permiso es opcional y lo podés quitar
          en cualquier momento desde PULSO o desde Health Connect / Salud.
        </p>
        <ul className={list}>
          <li>Se usan solo para mostrarte esos datos junto a tu entrenamiento (por ejemplo, el sueño de anoche en Hoy o tu peso en Progreso).</li>
          <li>Se guardan únicamente en tu teléfono: no se envían a nuestro servidor, no se comparten con profesionales, no se incluyen en el respaldo ni en la sincronización.</li>
          <li>Nunca se usan para publicidad, nunca se venden y nunca se incluyen en los reportes de errores.</li>
          <li>Al desconectar podés conservar lo importado o borrarlo de PULSO; nada se borra de Health Connect o Salud.</li>
        </ul>
        <p>El uso de datos recibidos de Health Connect cumple la Política de permisos de Health Connect, incluidos sus requisitos de uso limitado.</p>
      </Section>

      <Section title="4. Compartir con entrenadores y nutricionistas">
        <p>
          Si te unís al equipo de un profesional, elegís por categoría qué ve (entrenamiento, nutrición,
          medidas, check-ins, fotos). Solo esas categorías se envían, y podés revocar cada una cuando
          quieras: el profesional deja de verlas en ese momento. El profesional no ve tus otros planes ni
          tus datos de salud importados.
        </p>
        <p>
          Desde Equipo podés <strong className="text-fg">salir del equipo</strong> de un profesional: deja de ver tus datos y
          ya no pueden escribirse. También podés <strong className="text-fg">reportarlo</strong>: el reporte llega al equipo de
          PULSO junto con los últimos mensajes de esa conversación, que usamos solo para revisarlo. La otra persona no
          se entera de que la reportaste.
        </p>
      </Section>

      <Section title="5. Respaldo personal y sincronización (PULSO Plus)">
        <p>
          Con tu consentimiento, PULSO puede guardar una copia de tus datos (respaldo) o mantener tus
          dispositivos sincronizados. Son funciones separadas, cada una con su propio permiso, y ninguna
          comparte nada con profesionales. Guardamos hasta 7 copias mientras tengas Plus; si Plus vence,
          conservamos la última completa para que la restaures o exportes gratis. Desactivar la
          sincronización borra su copia del servidor. Podés borrar tus copias cuando quieras.
        </p>
      </Section>

      <Section title="6. Inteligencia artificial">
        <ul className={list}>
          <li>
            <strong className="text-fg">Planes con IA:</strong> si lo pedís y lo autorizás, enviamos tus respuestas del cuestionario
            (objetivo, experiencia, equipamiento, preferencias de comida, limitaciones) y datos del perfil a un modelo de IA
            ejecutado en Amazon Bedrock para generar tu plan. Las respuestas del cuestionario se borran al aceptar el plan.
          </li>
          <li>
            <strong className="text-fg">Lectura de etiquetas nutricionales:</strong> la foto de una tabla nutricional se envía una vez
            al modelo para leerla y se borra; no la guardamos.
          </li>
        </ul>
        <p>Los planes son orientativos y no reemplazan el consejo de un profesional de la salud.</p>
      </Section>

      <Section title="7. Publicidad">
        <p>
          Las cuentas sin PULSO Plus ven anuncios de Google AdMob, que puede usar el identificador de
          publicidad de tu teléfono para mostrar y medir anuncios. Podés restablecerlo o limitarlo en los
          ajustes de tu teléfono. Tus datos de entrenamiento, nutrición y salud nunca se usan para
          publicidad. Con PULSO Plus no ves anuncios.
        </p>
      </Section>

      <Section title="8. Otros proveedores">
        <ul className={list}>
          <li><strong className="text-fg">Sentry:</strong> reportes de errores y cierres de la app y del servidor, filtrados para no incluir tu nombre, correo, datos de salud, comidas, planes ni fotos.</li>
          <li><strong className="text-fg">Amazon SES:</strong> envío de correos de cuenta (verificación, recuperación de contraseña, enlaces de acceso).</li>
          <li><strong className="text-fg">RevenueCat, Google Play y App Store:</strong> gestión de la suscripción PULSO Plus cuando esté disponible en la tienda.</li>
          <li><strong className="text-fg">Open Food Facts:</strong> búsqueda de productos por código de barras (solo se envía el código).</li>
        </ul>
        <p>No vendemos tus datos personales.</p>
      </Section>

      <Section title="9. Tus derechos y controles">
        <ul className={list}>
          <li><strong className="text-fg">Exportar:</strong> Configuración → Exportar mis datos genera un archivo JSON con todo lo del teléfono y del servidor.</li>
          <li><strong className="text-fg">Borrar tu cuenta:</strong> desde la app o como explica <Link className="text-neon" href="/eliminar-cuenta">esta página</Link>.</li>
          <li><strong className="text-fg">Revocar permisos:</strong> compartir con profesionales, respaldo, sincronización, datos de salud y notificaciones se apagan por separado.</li>
          <li><strong className="text-fg">Corregir:</strong> podés editar tu perfil y tus registros en la app.</li>
        </ul>
      </Section>

      <Section title="10. Conservación">
        <p>
          Mientras tengas cuenta conservamos lo descrito arriba. Al pedir el borrado, tu equipo deja de
          verte en el momento y tenés 30 días para cancelarlo; después borramos tu cuenta y sus datos del
          servidor, incluidas las copias. Solo conservamos registros mínimos sin datos de salud (por
          ejemplo, el recibo de una compra sin vínculo a tu cuenta) cuando la ley o la tienda lo exigen.
        </p>
      </Section>

      <Section title="11. Edad">
        <p>PULSO está pensada para personas mayores de 18 años y no está dirigida a menores.</p>
      </Section>

      <Section title="12. Cambios">
        <p>Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante, te avisamos en la app.</p>
      </Section>
    </LegalShell>
  );
}
