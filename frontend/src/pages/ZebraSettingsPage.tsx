import {Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {useZebra} from '../printing/useZebra';
export function ZebraSettingsPage(){const {user}=useAuth();const zebra=useZebra(user?.id||'');if(!user?.roles.includes('ADMINISTRADOR'))return <Navigate to="/" replace/>;return <><section className="module-hero"><p className="eyebrow">ADMINISTRACIÓN DEL EQUIPO</p><h2>Configuración Zebra</h2><p>Configuración exclusiva para administradores. Se utiliza para todos los usuarios que imprimen desde este navegador y equipo.</p></section>{zebra.configuration}</>;}
