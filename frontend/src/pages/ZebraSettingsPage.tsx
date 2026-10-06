import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useZebra } from '../printing/useZebra';
export function ZebraSettingsPage() {
  const { user } = useAuth();
  const zebra = useZebra(user?.id || '');
  if (!user?.roles.includes('ADMINISTRADOR')) return <Navigate to="/" replace />;
  return (
    <>
      <section className="module-hero">
        <p className="eyebrow">ADMINISTRACIÓN DEL EQUIPO</p>
        <h2>Configuración Zebra</h2>
        <p>
          Asigna la impresora de esta estación. Con el modo servidor no hace falta instalar nada en
          el equipo: la etiqueta la envía el servidor. Se aplica a todos los usuarios de este
          navegador.
        </p>
      </section>
      {zebra.configuration}
    </>
  );
}
