import { ZebraSettingsPage } from './pages/ZebraSettingsPage';
import { ProfileAvatar } from './ProfileAvatar';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink, Outlet, Link, Navigate } from 'react-router-dom';
import { Home, Factory, Gauge, LogOut, Printer, Ruler, Wrench } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { PipeRegistrationPage } from './pages/PipeRegistrationPage';
import { DimensionalPage } from './pages/DimensionalPage';
import { CalibradoPage } from './pages/CalibradoPage';
import { HydroPage } from './pages/HydroPage';
import './styles.css';
import './production-layout.css';
import './brand-theme.css';
function Production() {
  const { user, logout, can } = useAuth();
  const allowed = user?.roles.some((role) =>
    ['OPERARIO', 'ADMINISTRADOR', 'SUPERVISOR', 'SUPERVISOR_MANUFACTURA'].includes(role),
  );
  return (
    <div className="shell production-shell">
      <aside>
        <div className="brand">
          <img src="/otek-logo.png" alt="O-tek" />
          <small>Producción Paperless</small>
        </div>
        <nav aria-label="Menú de producción">
          <NavLink to="/" end>
            <Home size={19} />
            <span>Inicio</span>
          </NavLink>
          {allowed && (
            <NavLink to="/tuberia">
              <Factory size={19} />
              <span>Winder</span>
            </NavLink>
          )}
          {allowed && can('PRODUCCION.DIMENSIONAL.REGISTRAR') && (
            <NavLink to="/dimensional">
              <Ruler size={19} />
              <span>Dimensional</span>
            </NavLink>
          )}
          {allowed && can('PRODUCCION.CALIBRADO.REGISTRAR') && (
            <NavLink to="/calibrado">
              <Wrench size={19} />
              <span>Calibrado y chaflanado</span>
            </NavLink>
          )}
          {allowed && can('PRODUCCION.PRUEBA_HIDRAULICA.REGISTRAR') && (
            <NavLink to="/prueba-hidraulica">
              <Gauge size={19} />
              <span>Prueba hidráulica</span>
            </NavLink>
          )}
          {user?.roles.includes('ADMINISTRADOR') && (
            <NavLink to="/configuracion-zebra">
              <Printer size={19} />
              <span>Configuración Zebra</span>
            </NavLink>
          )}
        </nav>
        <div className="profile">
          <ProfileAvatar name={user?.nombre_completo} photo={user?.foto_perfil} />
          <div>
            <strong>{user?.nombre_completo}</strong>
            <small>{user?.roles.join(', ')}</small>
          </div>
          <button aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => void logout()}>
            <LogOut size={20} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <h1>Producción Paperless</h1>
          <span>Registro y seguimiento de producción</span>
        </header>
        <section className="content">
          {allowed ? (
            <Outlet />
          ) : (
            <div className="form-card">
              <h2>Acceso a Producción</h2>
              <p>
                Se requiere un rol de operario, administrador o supervisor. Solicita su asignación
                en Administración.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
function HomePage() {
  const { user, can } = useAuth();
  return (
    <>
      <section className="module-hero">
        <p className="eyebrow">OPERACIÓN DE PLANTA</p>
        <h2>Hola, {user?.nombre_completo}</h2>
        <p>Selecciona el proceso que vas a registrar.</p>
      </section>
      <section className="production-home">
        <Link className="production-module" to="/tuberia">
          <Factory size={30} />
          <h3>Winder</h3>
          <p>
            Consulta las órdenes autorizadas, captura los datos del proceso y registra cada tubo.
          </p>
          <span>Abrir registro →</span>
        </Link>
        {can('PRODUCCION.DIMENSIONAL.REGISTRAR') && (
          <Link className="production-module" to="/dimensional">
            <Ruler size={30} />
            <h3>Dimensional</h3>
            <p>
              Escanea el serial de un tubo de Winder y registra diámetros, espesores e inspección
              visual.
            </p>
            <span>Abrir medición →</span>
          </Link>
        )}
        {can('PRODUCCION.CALIBRADO.REGISTRAR') && (
          <Link className="production-module" to="/calibrado">
            <Wrench size={30} />
            <h3>Calibrado y chaflanado</h3>
            <p>
              Registra el chaflán (BL) de cada extremo y los diámetros de los tubos que se
              rectifican.
            </p>
            <span>Abrir registro →</span>
          </Link>
        )}
        {can('PRODUCCION.PRUEBA_HIDRAULICA.REGISTRAR') && (
          <Link className="production-module" to="/prueba-hidraulica">
            <Gauge size={30} />
            <h3>Prueba hidráulica</h3>
            <p>Registra la presión de prueba y el resultado de cada tubo.</p>
            <span>Abrir prueba →</span>
          </Link>
        )}
      </section>
    </>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Production />}>
                <Route index element={<HomePage />} />
                <Route path="configuracion-zebra" element={<ZebraSettingsPage />} />
                <Route path="tuberia" element={<PipeRegistrationPage />} />
                <Route path="dimensional" element={<DimensionalPage />} />
                <Route path="calibrado" element={<CalibradoPage />} />
                <Route path="prueba-hidraulica" element={<HydroPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
