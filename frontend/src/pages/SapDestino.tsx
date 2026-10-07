import { useEffect, useState } from 'react';

export type SapUbicacion = {
  id: number;
  codigo: string;
  descripcion: string | null;
  compania: string;
  compania_nombre: string;
  almacen: string;
  zona: string;
  nivel2: string | null;
};

const uniq = (xs: string[]) => [...new Set(xs)];

// Selección en cascada de la ubicación de patio de SAP: almacén → zona → ubicación (OBIN).
export function SapDestino({
  ubicaciones,
  cargado,
  onChange,
}: {
  ubicaciones: SapUbicacion[];
  cargado: boolean;
  onChange: (u: SapUbicacion | null) => void;
}) {
  const [almacen, setAlmacen] = useState('');
  const [zona, setZona] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const almacenes = uniq(ubicaciones.map((u) => `${u.compania}|${u.almacen}`));
  const zonas = uniq(
    ubicaciones.filter((u) => `${u.compania}|${u.almacen}` === almacen).map((u) => u.zona),
  );
  const bins = ubicaciones.filter(
    (u) => `${u.compania}|${u.almacen}` === almacen && u.zona === zona,
  );
  const elegida = ubicaciones.find((u) => String(u.id) === ubicacion) ?? null;
  const companias = uniq(ubicaciones.map((u) => u.compania)).length;
  useEffect(() => onChange(elegida), [elegida?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {cargado && ubicaciones.length === 0 && (
        <p className="process-warning">
          No hay ubicaciones de patio de SAP disponibles. Sincronízalas en Administración →
          Configuración → Conexión SAP.
        </p>
      )}
      <div className="form-grid reka-sap-destino">
        <label>
          Almacén SAP
          <select
            value={almacen}
            onChange={(e) => {
              setAlmacen(e.target.value);
              setZona('');
              setUbicacion('');
            }}
          >
            <option value="">Selecciona el almacén</option>
            {almacenes.map((a) => {
              const [comp, whs] = a.split('|');
              const nombre = ubicaciones.find((u) => u.compania === comp)?.compania_nombre;
              return (
                <option key={a} value={a}>
                  {whs}
                  {companias > 1 ? ` · ${nombre}` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Zona
          <select
            value={zona}
            disabled={!almacen}
            onChange={(e) => {
              setZona(e.target.value);
              setUbicacion('');
            }}
          >
            <option value="">Selecciona la zona</option>
            {zonas.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ubicación
          <select value={ubicacion} disabled={!zona} onChange={(e) => setUbicacion(e.target.value)}>
            <option value="">Selecciona la ubicación</option>
            {bins.map((u) => (
              <option key={u.id} value={u.id}>
                {u.codigo}
                {u.nivel2 ? ` · ${u.nivel2}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {elegida && (
        <p className="success">
          Destino: {elegida.compania_nombre} · almacén {elegida.almacen} · zona {elegida.zona} ·{' '}
          {elegida.codigo}
        </p>
      )}
    </>
  );
}
