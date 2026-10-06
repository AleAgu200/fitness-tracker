import type { Metadata } from "next";

import { LegalShell, Section } from "../legal/legal-shell";

export const metadata: Metadata = {
  title: "Borrar tu cuenta",
  alternates: { canonical: "/eliminar-cuenta" },
  description: "Cómo pedir el borrado de tu cuenta de PULSO y de tus datos.",
};

const list = "list-disc space-y-2 pl-5";
const steps = "list-decimal space-y-2 pl-5";

/** Account deletion page required by Google Play (reachable without the app). */
export default function DeleteAccountPage() {
  return (
    <LegalShell title="Borrar tu cuenta de PULSO" updated="5 DE OCTUBRE DE 2026">
      <Section title="Desde la app (lo más rápido)">
        <ol className={steps}>
          <li>Abrí PULSO e iniciá sesión.</li>
          <li>Andá a <strong className="text-fg">Perfil → Configuración</strong>.</li>
          <li>Tocá <strong className="text-fg">Borrar mi cuenta</strong> y confirmá.</li>
        </ol>
        <p>Antes de confirmar podés exportar tus datos desde la misma pantalla.</p>
      </Section>

      <Section title="Sin la app">
        <p>
          Escribinos desde el correo de tu cuenta a{" "}
          <a className="text-neon" href="mailto:pulso@pulsofitness.tech?subject=Borrar%20mi%20cuenta">pulso@pulsofitness.tech</a>{" "}
          con el asunto <strong className="text-fg">“Borrar mi cuenta”</strong>. Confirmamos que el pedido viene del dueño de la
          cuenta y lo procesamos en un máximo de 7 días; después rige el mismo plazo de abajo.
        </p>
      </Section>

      <Section title="Qué pasa al pedir el borrado">
        <ul className={list}>
          <li>Se cierran todas tus sesiones y tu equipo (entrenador, nutricionista) deja de verte en el momento.</li>
          <li>El historial guardado en el teléfono donde lo pedís se borra enseguida.</li>
          <li>Tenés <strong className="text-fg">30 días</strong> para arrepentirte: si volvés a iniciar sesión podés cancelar el borrado.</li>
          <li>
            Pasados los 30 días borramos del servidor tu cuenta y todo lo asociado: perfil, medidas, entrenamientos y
            comidas sincronizados, check-ins, mensajes, planes asignados, respaldos personales, datos sincronizados entre
            dispositivos y suscripción.
          </li>
        </ul>
      </Section>

      <Section title="Qué se conserva">
        <ul className={list}>
          <li>Recibos de compra de la tienda, sin vínculo a tu cuenta, cuando la ley o la tienda lo exigen.</li>
          <li>Un registro mínimo para cada equipo que te acompañó, con un seudónimo y sin datos personales ni de salud.</li>
          <li>Lo que esté en otros teléfonos donde hayas usado PULSO sin conexión: borralo desinstalando la app de ese teléfono.</li>
        </ul>
        <p>
          Borrar la cuenta <strong className="text-fg">no cancela</strong> una suscripción de PULSO Plus comprada en Google Play o App
          Store: cancelala desde la tienda.
        </p>
      </Section>
    </LegalShell>
  );
}
