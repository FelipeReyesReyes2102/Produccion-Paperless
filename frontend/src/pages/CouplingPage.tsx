import { useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { parseLabelCode } from '../printing/labelCode';
import { SapDestino, type SapUbicacion } from './SapDestino';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';
import './reka.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const API = '/produccion/coupling';
const CONTROLES = [
  ['inspeccion_visual', 'Inspección visual del tubo'],
  ['control_goma', 'Control goma enchufada (con galga)'],
  ['espiga_a', 'Espiga A'],
  ['espiga_b', 'Espiga B'],
  ['corte_perpendicular', 'Corte perpendicular'],
] as const;
const ESTADOS: Record<string, string> = {
  LIBERACION_PENDIENTE: 'Pendiente de liberación',
  RECEPCION_PENDIENTE: 'Pendiente de recepción',
  RECIBIDO: 'Recibido en patio',
  NO_CONFORME: 'No conforme',
  ANULADO: 'Anulado por Calidad',
};

type Control = {
  id: string;
  operador: string;
  supervisor: string;
  turno: string;
  creado_en: string;
};
type Resumen = {
  permisos: { registrar: boolean; calidad: boolean; recepcion: boolean };
  control: Control | null;
  pendientes: { liberacion: number; recepcion: number };
};
type TuboInfo = {
  id: string;
  serial: string;
  longitud_real: string;
  condicion: string;
  lote: string;
  dn: string;
  pn: string;
  sn: string | null;
  tipo_tope: string | null;
  long_tope: string | null;
  puede: boolean;
  motivo: string | null;
};
type CopleInfo = {
  id: string;
  serial: string;
  longitud: string;
  orden: string;
  estado: string;
  dn: string;
  pn: string;
  long_tope: string | null;
  puede: boolean;
  motivo: string | null;
};
type Registro = {
  id: string;
  modo: 'TUBERIA' | 'SOLO_COPLES';
  enchufado: boolean;
  serial_tubo: string | null;
  serial_cople: string | null;
  dn: string;
  pn: string;
  sn: string | null;
  longitud: string;
  inspeccion_visual: string;
  control_goma: string;
  espiga_a: string;
  espiga_b: string;
  corte_perpendicular: string;
  long_tope: string | null;
  tipo_tope: string | null;
  empaque_piezas: number;
  resultado: string;
  motivo: string | null;
  estado: string;
  operador: string;
  supervisor: string;
  turno: string;
  creado_en: string;
  anulacion_condicion: string | null;
  anulacion_motivo: string | null;
};
type Tab = 'registro' | 'liberacion' | 'recepcion' | 'historial';

const serialDe = (raw: string) => (parseLabelCode(raw)?.serial ?? raw).trim();
const num = (v: unknown, d = 2) =>
  v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(d);
const control = (v: string) => (v === 'NA' ? 'N/A' : v);
const tipoRegistro = (r: Registro) =>
  r.modo === 'SOLO_COPLES' ? 'Cople solo' : r.enchufado ? 'Tubo enchufado' : 'Tubo no enchufado';

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
    void qc.invalidateQueries({ queryKey: ['coupling-resumen'] });
    void qc.invalidateQueries({ queryKey: ['coupling-lista'] });
  };
}

export function CouplingPage() {
  const summary = useQuery<Resumen>({
    queryKey: ['coupling-resumen'],
    queryFn: async () => (await api.get(`${API}/resumen`)).data,
    refetchInterval: 30000,
  });
  const p = summary.data?.permisos;
  const n = summary.data?.pendientes;
  const [tab, setTab] = useState<Tab | null>(null);
  const tabs: [Tab, string, boolean, number?][] = [
    ['registro', 'Enchufado', !!p?.registrar],
    ['liberacion', 'Liberación Calidad', !!p?.calidad, n?.liberacion],
    ['recepcion', 'Recepción en patio', !!p?.recepcion, n?.recepcion],
    ['historial', 'Historial', !!p?.registrar],
  ];
  const visibles = tabs.filter(([, , show]) => show);
  const actual = tab && visibles.some(([k]) => k === tab) ? tab : visibles[0]?.[0];
  return (
    <section className="planning pipe-workstation dimensional reka">
      <div className="module-hero">
        <p className="eyebrow">CONTROL DE ENCHUFADO</p>
        <h2>Coupling</h2>
        <p>
          Libera tubería enchufada, tubería sin enchufar o coples solos. Cada registro pasa por la
          liberación de Calidad y la recepción en patio de SAP.
        </p>
      </div>
      {summary.isError && <p className="error">{errorText(summary.error)}</p>}
      <div className="reka-tabs" role="tablist" aria-label="Etapas de Coupling">
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
      {actual === 'registro' && <Registrar control={summary.data?.control ?? null} />}
      {actual === 'liberacion' && <Liberacion />}
      {actual === 'recepcion' && <Recepcion />}
      {actual === 'historial' && <Historial />}
    </section>
  );
}

function IniciarControl() {
  const { user } = useAuth();
  const refresh = useRefresh();
  const [operador, setOperador] = useState(user?.nombre_completo || '');
  const [supervisor, setSupervisor] = useState('');
  const [turno, setTurno] = useState('');
  const [err, setErr] = useState('');
  const supervisores = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['coupling-supervisores'],
    queryFn: async () => (await api.get(`${API}/supervisores`)).data,
  });

  async function iniciar(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.post(`${API}/controles`, { operador, supervisor_id: supervisor, turno });
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <form className="form-card" onSubmit={iniciar}>
      <fieldset>
        <legend>Iniciar control de enchufado</legend>
        <p>Indica el supervisor y el turno. Todos los registros quedan en este control.</p>
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
            <select required value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
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
            <select required value={turno} onChange={(e) => setTurno(e.target.value)}>
              <option value="">Selecciona un turno</option>
              {TURNOS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>
      {err && <p className="error">{err}</p>}
      <button type="submit" disabled={!operador.trim() || !supervisor || !turno}>
        Iniciar control
      </button>
    </form>
  );
}

const vacio = {
  inspeccion_visual: '',
  control_goma: '',
  espiga_a: '',
  espiga_b: '',
  corte_perpendicular: '',
  long_tope: '',
  tipo_tope: '',
  empaque_piezas: '',
  resultado: 'OK',
  afecta: '',
  motivo: '',
};

function Registrar({ control: ctl }: { control: Control | null }) {
  const refresh = useRefresh();
  const [modo, setModo] = useState<'TUBERIA' | 'SOLO_COPLES'>('TUBERIA');
  const [enchufado, setEnchufado] = useState<boolean | null>(null);
  const [scanTubo, setScanTubo] = useState('');
  const [scanCople, setScanCople] = useState('');
  const [tubo, setTubo] = useState<TuboInfo | null>(null);
  const [cople, setCople] = useState<CopleInfo | null>(null);
  const [form, setForm] = useState(vacio);
  const [confirmado, setConfirmado] = useState(false);
  const [solicitud, setSolicitud] = useState(() => crypto.randomUUID());
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ctl) return <IniciarControl />;

  const set = (k: keyof typeof vacio, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setConfirmado(false);
  };

  function reiniciar(nuevoModo = modo) {
    setModo(nuevoModo);
    setEnchufado(null);
    setTubo(null);
    setCople(null);
    setScanTubo('');
    setScanCople('');
    setForm(vacio);
    setConfirmado(false);
    setErr('');
  }

  async function buscarTubo(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk([]);
    try {
      const { data } = await api.get<TuboInfo>(
        `${API}/tubos/${encodeURIComponent(serialDe(scanTubo))}`,
      );
      setTubo(data);
      setCople(null);
      setEnchufado(null);
      setForm({
        ...vacio,
        long_tope: data.long_tope ? Number(data.long_tope).toFixed(2) : '',
        tipo_tope: data.tipo_tope ?? '',
      });
    } catch (error) {
      setTubo(null);
      setErr(errorText(error));
    }
    setScanTubo('');
  }

  async function buscarCople(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk([]);
    try {
      const { data } = await api.get<CopleInfo>(
        `${API}/coples/${encodeURIComponent(serialDe(scanCople))}`,
        {
          params: { modo, tubo_id: tubo?.id },
        },
      );
      setCople(data);
      if (modo === 'SOLO_COPLES') {
        setForm({ ...vacio, long_tope: data.long_tope ? Number(data.long_tope).toFixed(2) : '' });
      }
    } catch (error) {
      setCople(null);
      setErr(errorText(error));
    }
    setScanCople('');
  }

  const piezasListas =
    modo === 'TUBERIA'
      ? !!tubo?.puede && enchufado !== null && (!enchufado || !!cople?.puede)
      : !!cople?.puede;
  const nc = form.resultado !== 'OK';
  const opcionesAfecta: [string, string][] =
    modo === 'SOLO_COPLES'
      ? [['COPLE', 'Cople']]
      : enchufado
        ? [
            ['TUBO', 'Tubo'],
            ['COPLE', 'Cople'],
            ['AMBOS', 'Tubo y cople'],
          ]
        : [['TUBO', 'Tubo']];
  const datosCompletos =
    CONTROLES.every(([k]) => form[k]) &&
    form.empaque_piezas !== '' &&
    (!nc || (!!form.afecta && form.motivo.trim().length >= 5));

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (busy || !ctl) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post(`${API}/registros`, {
        solicitud_id: solicitud,
        control_id: ctl.id,
        modo,
        tubo_id: modo === 'TUBERIA' ? tubo?.id : null,
        cople_id: modo === 'SOLO_COPLES' || enchufado ? cople?.id : null,
        inspeccion_visual: form.inspeccion_visual,
        control_goma: form.control_goma,
        espiga_a: form.espiga_a,
        espiga_b: form.espiga_b,
        corte_perpendicular: form.corte_perpendicular,
        long_tope: form.long_tope || null,
        tipo_tope: form.tipo_tope || null,
        empaque_piezas: Number(form.empaque_piezas),
        no_conformidad: nc
          ? { condicion: form.resultado, afecta: form.afecta, motivo: form.motivo }
          : null,
      });
      const r = data.registro as Registro;
      const quien = [tubo && modo === 'TUBERIA' ? tubo.serial : null, cople?.serial]
        .filter(Boolean)
        .join(' + ');
      setOk([
        nc
          ? `${quien}: registrado como ${form.resultado}.`
          : `${quien}: registrado, pendiente de liberación de Calidad.`,
        ...data.avisos,
      ]);
      if (r) setSolicitud(crypto.randomUUID());
      reiniciar();
      refresh();
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function cerrarControl() {
    if (!ctl) return;
    try {
      await api.post(`${API}/controles/${ctl.id}/cerrar`);
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <>
      <div className="form-card coupling-control">
        <p>
          <b>Control de enchufado:</b> {ctl.operador} · supervisor {ctl.supervisor} · turno{' '}
          {ctl.turno}
        </p>
        <button type="button" onClick={() => void cerrarControl()}>
          Cerrar control
        </button>
      </div>

      <div className="form-card">
        <fieldset>
          <legend>Modo de liberación</legend>
          <div className="coupling-modos">
            {(
              [
                ['TUBERIA', 'Tubería'],
                ['SOLO_COPLES', 'Solo coples'],
              ] as const
            ).map(([k, t]) => (
              <label key={k}>
                <input
                  type="radio"
                  name="modo"
                  checked={modo === k}
                  onChange={() => reiniciar(k)}
                />{' '}
                {t}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <Messages ok={ok} err={err} />

      {modo === 'TUBERIA' && (
        <form className="form-card" onSubmit={buscarTubo}>
          <label>
            Serial del tubo
            <input
              autoFocus
              value={scanTubo}
              placeholder="Escanea la etiqueta del tubo"
              onChange={(e) => setScanTubo(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!scanTubo.trim()}>
            Buscar tubo
          </button>
          {tubo && (
            <div className="coupling-pieza">
              <h4>Tubo {tubo.serial}</h4>
              <p>
                Lote {tubo.lote} · DN {tubo.dn} · PN {tubo.pn} · SN {tubo.sn ?? '—'} · Longitud{' '}
                {num(tubo.longitud_real, 3)} m · Condición {tubo.condicion}
              </p>
              {!tubo.puede && <p className="error">{tubo.motivo}</p>}
              {tubo.puede && (
                <div className="coupling-modos">
                  <label>
                    <input
                      type="radio"
                      name="enchufado"
                      checked={enchufado === true}
                      onChange={() => {
                        setEnchufado(true);
                        setConfirmado(false);
                      }}
                    />{' '}
                    Enchufado (con cople)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="enchufado"
                      checked={enchufado === false}
                      onChange={() => {
                        setEnchufado(false);
                        setCople(null);
                        setConfirmado(false);
                      }}
                    />{' '}
                    No enchufado
                  </label>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {(modo === 'SOLO_COPLES' || (tubo?.puede && enchufado)) && (
        <form className="form-card" onSubmit={buscarCople}>
          <label>
            Serial del cople
            <input
              value={scanCople}
              placeholder="Escanea el serial del cople de Reka"
              onChange={(e) => setScanCople(e.target.value)}
            />
          </label>
          <button type="submit" disabled={!scanCople.trim()}>
            Buscar cople
          </button>
          {cople && (
            <div className="coupling-pieza">
              <h4>Cople {cople.serial}</h4>
              <p>
                Orden {cople.orden} · DN {cople.dn} · PN {cople.pn} · Longitud{' '}
                {num(cople.longitud, 3)} m
              </p>
              {!cople.puede && <p className="error">{cople.motivo}</p>}
            </div>
          )}
        </form>
      )}

      {piezasListas && (
        <form className="form-card" onSubmit={guardar}>
          <fieldset>
            <legend>Datos de control de enchufado</legend>
            <div className="form-grid">
              {CONTROLES.map(([k, t]) => (
                <label key={k}>
                  {t}
                  <select required value={form[k]} onChange={(e) => set(k, e.target.value)}>
                    <option value="">Selecciona</option>
                    <option value="OK">OK</option>
                    <option value="NA">N/A</option>
                  </select>
                </label>
              ))}
              <label>
                Longitud de tope (m)
                <input
                  inputMode="decimal"
                  value={form.long_tope}
                  onChange={(e) => set('long_tope', e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </label>
              <label>
                Tipo de tope
                <input
                  maxLength={60}
                  value={form.tipo_tope}
                  onChange={(e) => set('tipo_tope', e.target.value)}
                />
              </label>
              <label>
                Empaque (piezas)
                <input
                  required
                  inputMode="numeric"
                  value={form.empaque_piezas}
                  onChange={(e) => set('empaque_piezas', e.target.value.replace(/\D/g, ''))}
                />
              </label>
              <label>
                Estatus
                <select
                  value={form.resultado}
                  onChange={(e) => {
                    set('resultado', e.target.value);
                    set('afecta', opcionesAfecta.length === 1 ? opcionesAfecta[0][0] : '');
                  }}
                >
                  <option value="OK">OK</option>
                  <option value="PNC">PNC</option>
                  <option value="SCRAP">Scrap</option>
                </select>
              </label>
              {nc && (
                <>
                  <label>
                    Pieza no conforme
                    <select value={form.afecta} onChange={(e) => set('afecta', e.target.value)}>
                      <option value="">Selecciona</option>
                      {opcionesAfecta.map(([k, t]) => (
                        <option key={k} value={k}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Motivo
                    <input
                      maxLength={2000}
                      value={form.motivo}
                      onChange={(e) => set('motivo', e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </fieldset>
          {nc && (
            <p className="process-warning">
              El registro queda como {form.resultado} y no avanza. El supervisor de manufactura
              valida el cambio de condición de la pieza.
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmado}
              disabled={!datosCompletos}
              onChange={(e) => setConfirmado(e.target.checked)}
            />{' '}
            Confirmo los datos
          </label>
          <button type="submit" disabled={!confirmado || !datosCompletos || busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </>
  );
}

function useLista<T>(path: string) {
  return useQuery<T>({
    queryKey: ['coupling-lista', path],
    queryFn: async () => (await api.get(`${API}/${path}`)).data,
  });
}

function TablaRegistros({
  rows,
  empty,
  action,
  conEstado = false,
}: {
  rows: Registro[] | undefined;
  empty: string;
  action?: (r: Registro) => ReactNode;
  conEstado?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Tubo</th>
            <th>Cople</th>
            <th>DN · PN · SN</th>
            <th>Insp. visual · Goma · Esp. A · Esp. B · Corte</th>
            <th>Tope (m) · Tipo</th>
            <th>Empaque</th>
            <th>Operador · Turno</th>
            <th>Fecha</th>
            {conEstado && <th>Estado</th>}
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows?.map((r) => (
            <tr key={r.id}>
              <td>{tipoRegistro(r)}</td>
              <td>{r.serial_tubo ?? '—'}</td>
              <td>{r.serial_cople ?? '—'}</td>
              <td>
                {r.dn} · {r.pn} · {r.sn ?? '—'}
              </td>
              <td>
                {[
                  r.inspeccion_visual,
                  r.control_goma,
                  r.espiga_a,
                  r.espiga_b,
                  r.corte_perpendicular,
                ]
                  .map(control)
                  .join(' · ')}
              </td>
              <td>
                {num(r.long_tope)} · {r.tipo_tope ?? '—'}
              </td>
              <td>{r.empaque_piezas}</td>
              <td>
                {r.operador} · {r.turno}
              </td>
              <td>{new Date(r.creado_en).toLocaleString('es-MX')}</td>
              {conEstado && (
                <td title={r.anulacion_motivo ?? r.motivo ?? ''}>
                  {ESTADOS[r.estado] ?? r.estado}
                  {r.estado === 'NO_CONFORME' && ` (${r.resultado})`}
                  {r.estado === 'ANULADO' && r.anulacion_condicion && ` (${r.anulacion_condicion})`}
                </td>
              )}
              {action && <td>{action(r)}</td>}
            </tr>
          ))}
          {rows?.length === 0 && (
            <tr>
              <td colSpan={11}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const nombre = (r: Registro) => [r.serial_tubo, r.serial_cople].filter(Boolean).join(' + ');

function Liberacion() {
  const refresh = useRefresh();
  const list = useLista<Registro[]>('liberacion');
  const [anular, setAnular] = useState<Registro | null>(null);
  const [nc, setNc] = useState({ condicion: '', afecta: '', motivo: '' });
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function act(path: string, body: object | undefined, text: string) {
    setErr('');
    try {
      const { data } = await api.post(path, body);
      setOk([text, ...(data.avisos ?? [])]);
      setAnular(null);
      setNc({ condicion: '', afecta: '', motivo: '' });
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  const opciones: [string, string][] = !anular
    ? []
    : anular.modo === 'SOLO_COPLES'
      ? [['COPLE', 'Cople']]
      : anular.enchufado
        ? [
            ['TUBO', 'Tubo'],
            ['COPLE', 'Cople'],
            ['AMBOS', 'Tubo y cople'],
          ]
        : [['TUBO', 'Tubo']];

  return (
    <section className="form-card">
      <h3>Liberación de Calidad</h3>
      <Messages ok={ok} err={err} />
      <TablaRegistros
        rows={list.data}
        empty="No hay registros pendientes de liberación."
        action={(r) => (
          <>
            <button
              type="button"
              onClick={() =>
                void act(`${API}/registros/${r.id}/liberar`, undefined, `${nombre(r)} liberado.`)
              }
            >
              Liberar
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                setAnular(r);
                setNc({
                  condicion: '',
                  afecta: r.modo === 'SOLO_COPLES' ? 'COPLE' : r.enchufado ? '' : 'TUBO',
                  motivo: '',
                });
              }}
            >
              Anular
            </button>
          </>
        )}
      />
      {anular && (
        <div className="reka-inline">
          <h4>Anular {nombre(anular)}</h4>
          <div className="form-grid">
            <label>
              Condición
              <select
                value={nc.condicion}
                onChange={(e) => setNc({ ...nc, condicion: e.target.value })}
              >
                <option value="">Selecciona</option>
                <option value="PNC">PNC</option>
                <option value="SCRAP">Scrap</option>
              </select>
            </label>
            <label>
              Pieza no conforme
              <select value={nc.afecta} onChange={(e) => setNc({ ...nc, afecta: e.target.value })}>
                <option value="">Selecciona</option>
                {opciones.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Motivo
              <input
                maxLength={2000}
                value={nc.motivo}
                onChange={(e) => setNc({ ...nc, motivo: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!nc.condicion || !nc.afecta || nc.motivo.trim().length < 5}
            onClick={() =>
              void act(`${API}/registros/${anular.id}/anular`, nc, `${nombre(anular)} anulado.`)
            }
          >
            Confirmar anulación
          </button>{' '}
          <button type="button" onClick={() => setAnular(null)}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}

function Recepcion() {
  const refresh = useRefresh();
  const data = useLista<{ registros: Registro[]; ubicaciones: SapUbicacion[] }>('recepcion');
  const [destino, setDestino] = useState<SapUbicacion | null>(null);
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function recibir(r: Registro) {
    if (!destino) return;
    setErr('');
    try {
      await api.post(`${API}/registros/${r.id}/recibir`, { ubicacion_id: destino.id });
      setOk([
        `${nombre(r)} recibido en SAP ${destino.almacen} · zona ${destino.zona} · ${destino.codigo}.`,
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
        Elige la ubicación de patio de SAP (almacén, zona y ubicación) y recibe la tubería o los
        coples liberados. Entran al inventario de Administración en esa ubicación.
      </p>
      <Messages ok={ok} err={err} />
      <SapDestino
        ubicaciones={data.data?.ubicaciones ?? []}
        cargado={data.isSuccess}
        onChange={setDestino}
      />
      <TablaRegistros
        rows={data.data?.registros}
        empty="No hay registros pendientes de recepción."
        action={(r) => (
          <button
            type="button"
            disabled={!destino}
            title={destino ? '' : 'Elige primero almacén, zona y ubicación de SAP'}
            onClick={() => void recibir(r)}
          >
            Recibir aquí
          </button>
        )}
      />
    </section>
  );
}

function Historial() {
  const list = useLista<Registro[]>('registros');
  return (
    <section className="form-card">
      <h3>Últimos registros</h3>
      <TablaRegistros rows={list.data} empty="Aún no hay registros de Coupling." conEstado />
    </section>
  );
}
