import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { serialFromScan } from '../printing/labelCode';
import { useZebra } from '../printing/useZebra';
import { SapDestino, type SapUbicacion } from './SapDestino';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';
import './reka.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const API = '/produccion/odd';
const ESTADOS: Record<string, string> = {
  CALIBRADO_PENDIENTE: 'Pendiente de Calibrado y chaflanado',
  LIBERACION_PENDIENTE: 'Pendiente de liberación de Calidad',
  RECEPCION_PENDIENTE: 'Pendiente de recepción en patio',
  RECIBIDO: 'Recibido en patio',
  NO_CONFORME: 'No conforme',
};

type Resumen = {
  permisos: { registrar: boolean; calidad: boolean; recepcion: boolean };
  pendientes: { ordenes: number; calibrado: number; liberacion: number; recepcion: number };
};
type Programado = {
  id: number;
  numero: number;
  longitud: string;
  asignacion: string;
  requiere_cople: boolean;
  observaciones: string | null;
  realizado: string | null;
};
type Tramo = {
  id: string;
  tubo_id: string;
  serial: string;
  longitud: string;
  resultado: string;
  estado: string;
  comentarios: string | null;
  operador: string;
  turno: string;
  creado_en: string;
  orden?: string;
  origen?: string;
  dn?: string;
  pn?: string;
  sn?: string | null;
};
type Orden = {
  id: string;
  folio: string;
  serial: string;
  motivo: string;
  prioridad: string;
  fecha_estimada: string;
  actividad: string;
  razon: string;
  longitud_original: string;
  estado: string;
  cortado: string;
  tramos_planeados: number;
  tubo?: { dn: string; pn: string; sn: string | null; lote: string };
  programados?: Programado[];
  realizados?: Tramo[];
  completa?: boolean;
};
type Tab = 'registro' | 'liberacion' | 'recepcion' | 'historial';

const m3 = (v: unknown) => Number(v ?? 0).toFixed(3);

function Messages({ ok, err }: { ok: string[]; err: string }) {
  return (
    <>
      {ok.length > 0 && (
        <div className="success" role="status">
          {ok.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['odd-resumen', 'odd-lista', 'odd-orden', 'odd-ordenes'])
      void qc.invalidateQueries({ queryKey: [k] });
  };
}

export function OddPage() {
  const summary = useQuery<Resumen>({
    queryKey: ['odd-resumen'],
    queryFn: async () => (await api.get(`${API}/resumen`)).data,
    refetchInterval: 30000,
  });
  const p = summary.data?.permisos;
  const n = summary.data?.pendientes;
  const [tab, setTab] = useState<Tab | null>(null);
  const tabs: [Tab, string, boolean, number?][] = [
    ['registro', 'Registro de cortes', !!p?.registrar, n?.ordenes],
    ['liberacion', 'Liberación Calidad', !!p?.calidad, n?.liberacion],
    ['recepcion', 'Recepción en patio', !!p?.recepcion, n?.recepcion],
    ['historial', 'Tramos', !!p?.registrar],
  ];
  const visibles = tabs.filter(([, , show]) => show);
  const actual = tab && visibles.some(([k]) => k === tab) ? tab : visibles[0]?.[0];
  return (
    <section className="planning pipe-workstation dimensional reka">
      <div className="module-hero">
        <p className="eyebrow">ORDEN DE CORTE</p>
        <h2>Registro ODD</h2>
        <p>
          Registra cada corte de las órdenes aprobadas. Cada tramo recibe un serial nuevo; los
          tramos OK sin ajuste dimensional vuelven a Calibrado y chaflanado y luego pasan por
          Calidad y recepción en patio.
        </p>
      </div>
      {summary.isError && <p className="error">{errorText(summary.error)}</p>}
      <div className="reka-tabs" role="tablist" aria-label="Registro ODD">
        {visibles.map(([key, text, , count]) => (
          <button
            key={key}
            type="button"
            className={actual === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {text}
            {!!count && <span className="reka-count">{count}</span>}
          </button>
        ))}
      </div>
      {actual === 'registro' && <Registro />}
      {actual === 'liberacion' && <Liberacion />}
      {actual === 'recepcion' && <Recepcion />}
      {actual === 'historial' && <Historial />}
    </section>
  );
}

const vacio = { programado: '', longitud: '', resultado: 'OK', comentarios: '' };

function Registro() {
  const { user, can } = useAuth();
  const refresh = useRefresh();
  const zebra = useZebra(user?.id || '');
  const [operador, setOperador] = useState(user?.nombre_completo || '');
  const [supervisor, setSupervisor] = useState('');
  const [turno, setTurno] = useState('');
  const [scan, setScan] = useState('');
  const [serial, setSerial] = useState('');
  const [form, setForm] = useState(vacio);
  const [solicitud, setSolicitud] = useState(() => crypto.randomUUID());
  const [confirmado, setConfirmado] = useState(false);
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const supervisores = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['odd-supervisores'],
    queryFn: async () => (await api.get(`${API}/supervisores`)).data,
  });
  const ordenes = useQuery<Orden[]>({
    queryKey: ['odd-ordenes'],
    queryFn: async () => (await api.get(`${API}/ordenes`)).data,
  });
  const orden = useQuery<Orden>({
    queryKey: ['odd-orden', serial],
    queryFn: async () => (await api.get(`${API}/tubos/${encodeURIComponent(serial)}`)).data,
    enabled: !!serial,
    retry: false,
  });
  const o = orden.data;
  const listo = !!operador.trim() && !!supervisor && !!turno;
  const pendientes = o?.programados?.filter((p) => !p.realizado) ?? [];
  const faltan = o
    ? Math.round((Number(o.longitud_original) - Number(o.cortado)) * 1000) / 1000
    : 0;
  const set = (k: keyof typeof vacio, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setConfirmado(false);
  };

  function abrir(s: string) {
    setSerial(s);
    setForm(vacio);
    setOk([]);
    setErr('');
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!o || busy) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post(`${API}/cortes`, {
        solicitud_id: solicitud,
        orden_id: o.id,
        programado_id: form.programado ? Number(form.programado) : null,
        longitud: form.longitud,
        resultado: form.resultado,
        comentarios: form.comentarios || null,
        operador,
        supervisor_id: supervisor,
        turno,
      });
      setOk([
        `Tramo ${data.tramo.serial} registrado (${m3(data.tramo.longitud)} m).`,
        ...data.avisos,
      ]);
      setSolicitud(crypto.randomUUID());
      setForm(vacio);
      setConfirmado(false);
      refresh();
      await zebra.afterRegister(data.tramo.tubo_id, !!data.duplicado);
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function finalizar() {
    if (!o) return;
    setErr('');
    try {
      const { data } = await api.post(`${API}/ordenes/${o.id}/finalizar`);
      setOk([`Orden ${o.folio} completada.`, ...data.avisos]);
      setSerial('');
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <>
      <form className="form-card" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Responsables y turno</legend>
          <div className="form-grid">
            <label>
              Operador
              <input
                required
                maxLength={160}
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
              />
            </label>
            <label>
              Supervisor
              <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
                <option value="">Selecciona un supervisor</option>
                {supervisores.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Turno
              <select value={turno} onChange={(e) => setTurno(e.target.value)}>
                <option value="">Selecciona un turno</option>
                {TURNOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      </form>
      {can('PRODUCCION.TUBERIA.REGISTRAR') && zebra.panel}
      {zebra.dialog}

      <section className="form-card">
        <h3>Órdenes de corte aprobadas</h3>
        <form
          className="odd-scan"
          onSubmit={(e) => {
            e.preventDefault();
            abrir(serialFromScan(scan));
            setScan('');
          }}
        >
          <label>
            Serial del tubo
            <input
              value={scan}
              placeholder="Escanea la etiqueta del tubo a cortar"
              onChange={(e) => setScan(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!scan.trim()}>
            Abrir
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Tubo</th>
                <th>Prioridad</th>
                <th>Fecha estimada</th>
                <th>Cortado</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordenes.data?.map((x) => (
                <tr key={x.id} className={x.serial === serial ? 'reka-selected' : ''}>
                  <td>{x.folio}</td>
                  <td>{x.serial}</td>
                  <td className={x.prioridad === 'URGENTE' ? 'process-warning' : ''}>
                    {x.prioridad === 'URGENTE' ? 'Urgente' : 'Ordinario'}
                  </td>
                  <td>{x.fecha_estimada}</td>
                  <td>
                    {m3(x.cortado)} / {m3(x.longitud_original)} m
                  </td>
                  <td>{x.estado === 'EN_PROCESO' ? 'En corte' : 'Aprobada'}</td>
                  <td>
                    <button type="button" onClick={() => abrir(x.serial)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {ordenes.isSuccess && !ordenes.data.length && (
                <tr>
                  <td colSpan={7}>No hay órdenes de corte aprobadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Messages ok={ok} err={err || (orden.isError ? errorText(orden.error) : '')} />

      {o && (
        <section className="form-card">
          <h3>
            {o.folio} · tubo {o.serial}
          </h3>
          <p>
            {o.tubo
              ? `DN ${o.tubo.dn} · PN ${o.tubo.pn} · SN ${o.tubo.sn ?? '—'} · lote ${o.tubo.lote} · `
              : ''}
            Actividad: {o.actividad}. Razón: {o.razon}
          </p>
          <div className="odd-progreso" aria-label="Avance del corte">
            <div
              style={{
                width: `${Math.min(100, (Number(o.cortado) / Number(o.longitud_original)) * 100)}%`,
              }}
            />
          </div>
          <p>
            Cortado {m3(o.cortado)} de {m3(o.longitud_original)} m
            {faltan > 0 ? ` · faltan ${m3(faltan)} m` : ''}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Longitud planeada (m)</th>
                  <th>Asignación</th>
                  <th>Cople</th>
                  <th>Observaciones</th>
                  <th>Tramo cortado</th>
                </tr>
              </thead>
              <tbody>
                {o.programados?.map((p) => (
                  <tr key={p.id}>
                    <td>{p.numero}</td>
                    <td>{m3(p.longitud)}</td>
                    <td>{p.asignacion}</td>
                    <td>{p.requiere_cople ? 'Sí' : 'No'}</td>
                    <td>{p.observaciones ?? '—'}</td>
                    <td>{p.realizado ?? 'Pendiente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!o.realizados?.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Serial</th>
                    <th>Longitud (m)</th>
                    <th>Resultado</th>
                    <th>Estado</th>
                    <th>Operador</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {o.realizados.map((t) => (
                    <tr key={t.id}>
                      <td>{t.serial}</td>
                      <td>{m3(t.longitud)}</td>
                      <td>{t.resultado}</td>
                      <td>{ESTADOS[t.estado] ?? t.estado}</td>
                      <td>{t.operador}</td>
                      <td>
                        <button
                          type="button"
                          disabled={zebra.working}
                          onClick={() => void zebra.print(t.tubo_id)}
                        >
                          Etiqueta
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {faltan > 0.05 && (
            <form onSubmit={guardar}>
              <fieldset>
                <legend>Registrar corte</legend>
                <div className="form-grid">
                  <label>
                    Tramo planeado
                    <select
                      value={form.programado}
                      onChange={(e) => {
                        const p = pendientes.find((x) => String(x.id) === e.target.value);
                        setForm((f) => ({
                          ...f,
                          programado: e.target.value,
                          longitud: p ? String(Number(p.longitud)) : f.longitud,
                        }));
                        setConfirmado(false);
                      }}
                    >
                      <option value="">Corte adicional (no planeado)</option>
                      {pendientes.map((p) => (
                        <option key={p.id} value={p.id}>
                          #{p.numero} · {m3(p.longitud)} m · {p.asignacion}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Longitud real (m)
                    <input
                      required
                      inputMode="decimal"
                      value={form.longitud}
                      onChange={(e) => set('longitud', e.target.value.replace(/[^0-9.]/g, ''))}
                    />
                  </label>
                  <label>
                    Resultado
                    <select
                      value={form.resultado}
                      onChange={(e) => set('resultado', e.target.value)}
                    >
                      <option value="OK">OK</option>
                      <option value="PNC">PNC</option>
                      <option value="SCRAP">Scrap</option>
                      <option value="SOBRANTE">Sobrante</option>
                    </select>
                  </label>
                  <label>
                    Comentarios{form.resultado !== 'OK' ? ' (obligatorio)' : ''}
                    <input
                      maxLength={2000}
                      value={form.comentarios}
                      onChange={(e) => set('comentarios', e.target.value)}
                    />
                  </label>
                </div>
              </fieldset>
              {!listo && (
                <p className="process-warning">
                  Captura operador, supervisor y turno antes de registrar.
                </p>
              )}
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />{' '}
                Confirmo los datos del corte
              </label>
              <button
                type="submit"
                disabled={
                  !listo ||
                  !confirmado ||
                  busy ||
                  !form.longitud ||
                  (form.resultado !== 'OK' && form.comentarios.trim().length < 5)
                }
              >
                {busy ? 'Guardando…' : 'Registrar corte e imprimir etiqueta'}
              </button>
            </form>
          )}
          {o.estado === 'EN_PROCESO' && faltan <= 0.05 && (
            <button type="button" className="primary" onClick={() => void finalizar()}>
              Finalizar orden de corte
            </button>
          )}
        </section>
      )}
    </>
  );
}

function useLista<T>(path: string) {
  return useQuery<T>({
    queryKey: ['odd-lista', path],
    queryFn: async () => (await api.get(`${API}/${path}`)).data,
  });
}

function TablaTramos({
  rows,
  empty,
  action,
  conEstado = false,
}: {
  rows: Tramo[] | undefined;
  empty: string;
  action?: (t: Tramo) => ReactNode;
  conEstado?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tramo</th>
            <th>Origen · Orden</th>
            <th>DN · PN · SN</th>
            <th>Longitud (m)</th>
            <th>Resultado</th>
            <th>Operador · Turno</th>
            <th>Fecha</th>
            {conEstado && <th>Estado</th>}
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows?.map((t) => (
            <tr key={t.id}>
              <td>{t.serial}</td>
              <td>
                {t.origen} · {t.orden}
              </td>
              <td>
                {t.dn} · {t.pn} · {t.sn ?? '—'}
              </td>
              <td>{m3(t.longitud)}</td>
              <td title={t.comentarios ?? ''}>{t.resultado}</td>
              <td>
                {t.operador} · {t.turno}
              </td>
              <td>{new Date(t.creado_en).toLocaleString('es-MX')}</td>
              {conEstado && <td>{ESTADOS[t.estado] ?? t.estado}</td>}
              {action && <td>{action(t)}</td>}
            </tr>
          ))}
          {rows?.length === 0 && (
            <tr>
              <td colSpan={9}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Liberacion() {
  const refresh = useRefresh();
  const list = useLista<Tramo[]>('liberacion');
  const [rechazo, setRechazo] = useState<Tramo | null>(null);
  const [motivo, setMotivo] = useState({ condicion: '', motivo: '' });
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function act(path: string, body: object | undefined, text: string) {
    setErr('');
    try {
      const { data } = await api.post(path, body);
      setOk([text, ...(data.avisos ?? [])]);
      setRechazo(null);
      setMotivo({ condicion: '', motivo: '' });
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <section className="form-card">
      <h3>Liberación de Calidad de tramos cortados</h3>
      <Messages ok={ok} err={err} />
      <TablaTramos
        rows={list.data}
        empty="No hay tramos pendientes de liberación."
        action={(t) => (
          <>
            <button
              type="button"
              onClick={() =>
                void act(`${API}/tramos/${t.id}/liberar`, undefined, `Tramo ${t.serial} liberado.`)
              }
            >
              Liberar
            </button>{' '}
            <button type="button" onClick={() => setRechazo(t)}>
              Rechazar
            </button>
          </>
        )}
      />
      {rechazo && (
        <div className="reka-inline">
          <h4>Rechazar {rechazo.serial}</h4>
          <div className="form-grid">
            <label>
              Condición
              <select
                value={motivo.condicion}
                onChange={(e) => setMotivo({ ...motivo, condicion: e.target.value })}
              >
                <option value="">Selecciona</option>
                <option value="PNC">PNC</option>
                <option value="SCRAP">Scrap</option>
              </select>
            </label>
            <label>
              Motivo
              <input
                maxLength={2000}
                value={motivo.motivo}
                onChange={(e) => setMotivo({ ...motivo, motivo: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!motivo.condicion || motivo.motivo.trim().length < 5}
            onClick={() =>
              void act(
                `${API}/tramos/${rechazo.id}/rechazar`,
                motivo,
                `Tramo ${rechazo.serial} rechazado.`,
              )
            }
          >
            Confirmar rechazo
          </button>
        </div>
      )}
    </section>
  );
}

function Recepcion() {
  const refresh = useRefresh();
  const data = useLista<{ tramos: Tramo[]; ubicaciones: SapUbicacion[] }>('recepcion');
  const [destino, setDestino] = useState<SapUbicacion | null>(null);
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function recibir(t: Tramo) {
    if (!destino) return;
    setErr('');
    try {
      await api.post(`${API}/tramos/${t.id}/recibir`, { ubicacion_id: destino.id });
      setOk([
        `Tramo ${t.serial} recibido en SAP ${destino.almacen} · zona ${destino.zona} · ${destino.codigo}.`,
      ]);
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <section className="form-card">
      <h3>Recepción en patio</h3>
      <p>
        Elige la ubicación de patio de SAP y recibe los tramos liberados. Entran al inventario de
        Administración.
      </p>
      <Messages ok={ok} err={err} />
      <SapDestino
        ubicaciones={data.data?.ubicaciones ?? []}
        cargado={data.isSuccess}
        onChange={setDestino}
      />
      <TablaTramos
        rows={data.data?.tramos}
        empty="No hay tramos pendientes de recepción."
        action={(t) => (
          <button
            type="button"
            disabled={!destino}
            title={destino ? '' : 'Elige primero almacén, zona y ubicación de SAP'}
            onClick={() => void recibir(t)}
          >
            Recibir aquí
          </button>
        )}
      />
    </section>
  );
}

function Historial() {
  const list = useLista<Tramo[]>('tramos');
  return (
    <section className="form-card">
      <h3>Tramos cortados</h3>
      <TablaTramos rows={list.data} empty="Aún no hay cortes registrados." conEstado />
    </section>
  );
}
