import { ZebraSettingsPage } from './pages/ZebraSettingsPage';
import { ProfileAvatar } from './ProfileAvatar';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink, Outlet, Link, Navigate } from 'react-router-dom';
import { Home, Factory, LogOut, Printer } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { PipeRegistrationPage } from './pages/PipeRegistrationPage';
import './styles.css';
import './production-layout.css';
import './brand-theme.css';
function Production() {
  const { user, logout } = useAuth();
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
  const { user } = useAuth();
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
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
