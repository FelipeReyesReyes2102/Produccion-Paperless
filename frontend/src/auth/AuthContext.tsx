import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
export type User = {
  id: string;
  nombre_usuario: string;
  nombre_completo: string;
  correo?: string;
  foto_perfil?: string;
  roles: string[];
  permisos: Record<string, string>;
};
type Auth = {
  user: User | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (p: string) => boolean;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      if (sessionStorage.getItem('access_token')) setUser((await api.get('/auth/me')).data);
    } catch {
      sessionStorage.clear();
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const login = async (u: string, p: string) => {
    const { data } = await api.post('/auth/login', { nombre_usuario: u, password: p });
    sessionStorage.setItem('access_token', data.access_token);
    sessionStorage.setItem('refresh_token', data.refresh_token);
    setUser((await api.get('/auth/me')).data);
  };
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      sessionStorage.clear();
      setUser(null);
    }
  };
  return (
    <Context.Provider value={{ user, loading, login, logout, can: (p) => !!user?.permisos[p] }}>
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => {
  const x = useContext(Context);
  if (!x) throw new Error('AuthProvider requerido');
  return x;
};
