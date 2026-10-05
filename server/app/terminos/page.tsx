import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "../legal/legal-shell";

export const metadata: Metadata = {
  title: "Términos de uso · PULSO",
  description: "Condiciones para usar la app y el portal de PULSO.",
};

const list = "list-disc space-y-2 pl-5";

/** Public terms of use, linked from sign-up, Configuración and the store listings. */
export default function TermsPage() {
  return (
    <LegalShell title="Términos de uso" updated="5 DE OCTUBRE DE 2026">
      <p>
        Al crear una cuenta o usar PULSO (la app y el portal para profesionales) aceptás estos términos y
        la <Link className="text-neon" href="/privacidad">política de privacidad</Link>. Si no estás de acuerdo, no uses el servicio.
      </p>

      <Section title="1. El servicio">
        <p>
          PULSO te ayuda a registrar entrenamientos, comidas, bebidas y medidas, a seguir planes propios,
          de un profesional o generados con inteligencia artificial, y a compartir tu progreso con tu
          equipo si lo autorizás. Podemos mejorar, cambiar o dejar de ofrecer funciones; si una función
          paga deja de existir, te avisamos.
        </p>
      </Section>

      <Section title="2. No es consejo médico">
        <p>
          PULSO no es un servicio médico ni reemplaza a un médico, nutricionista o entrenador
          certificado. Los planes, estimaciones (por ejemplo, el 1RM estimado) y recomendaciones son
          orientativos. Consultá a un profesional de la salud antes de empezar o cambiar un programa de
          ejercicio o alimentación, sobre todo si tenés una condición médica, estás embarazada o tomás
          medicación. Detené la actividad si sentís dolor, mareo o malestar.
        </p>
      </Section>

      <Section title="3. Tu cuenta">
        <ul className={list}>
          <li>Tenés que ser mayor de 18 años.</li>
          <li>Sos responsable de la información que cargás y de mantener segura tu contraseña.</li>
          <li>Los profesionales que usan el portal son responsables de sus recomendaciones y de tratar los datos que sus atletas comparten con ellos según la ley aplicable.</li>
        </ul>
      </Section>

      <Section title="4. PULSO Plus">
        <p>
          PULSO Plus es una suscripción opcional que agrega planes con IA sin límite, respaldo personal,
          sincronización entre dispositivos y la app sin anuncios. Cuando se compra en Google Play o App
          Store, el cobro, la renovación automática, la cancelación y los reembolsos se rigen por las
          reglas de esa tienda: cancelás desde la tienda, y borrar tu cuenta no cancela la suscripción.
          Registrar entrenamientos y comidas, y seguir el plan de tu profesional, siguen siendo gratis.
        </p>
      </Section>

      <Section title="5. Uso aceptable">
        <ul className={list}>
          <li>No uses PULSO para algo ilegal, para dañar a otras personas o para acceder a datos ajenos.</li>
          <li>No intentes vulnerar, sobrecargar ni copiar el servicio.</li>
          <li>Lo que agregás al catálogo comunitario de productos debe ser información real del producto.</li>
        </ul>
        <p>
          Si alguien te molesta o te da indicaciones peligrosas, reportalo desde la app (Equipo o la
          conversación) o salí de su equipo. Revisamos cada reporte y podemos suspender cuentas que
          incumplan estos términos.
        </p>
      </Section>

      <Section title="6. Tus datos">
        <p>
          Tus datos son tuyos. Podés exportarlos y borrar tu cuenta cuando quieras; cómo los tratamos está
          en la <Link className="text-neon" href="/privacidad">política de privacidad</Link>.
        </p>
      </Section>

      <Section title="7. Responsabilidad">
        <p>
          Ofrecemos PULSO tal como está, con cuidado pero sin garantizar que esté siempre disponible o libre
          de errores. En la medida que permita la ley, no somos responsables por lesiones derivadas de
          seguir un plan sin la supervisión adecuada, ni por daños indirectos. Nada de esto limita
          derechos que la ley te garantiza como consumidor.
        </p>
      </Section>

      <Section title="8. Cambios y contacto">
        <p>
          Si cambiamos estos términos actualizamos la fecha de arriba y te avisamos en la app cuando el
          cambio sea importante. Estos términos se rigen por las leyes de Honduras. Escribinos a{" "}
          <a className="text-neon" href="mailto:pulso@pulsofitness.tech">pulso@pulsofitness.tech</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
