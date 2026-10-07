import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { parseLabelCode } from '../printing/labelCode';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';
import './reka.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const API = '/produccion/reka';
const ASIGNACIONES = [
  ['COUPLING', 'Coupling'],
  ['ACC', 'Accesorios'],
  ['COMPROMETIDO', 'Comprometido'],
  ['NO_COMPROMETIDO', 'No comprometido'],
  ['EN_ESPERA', 'En espera'],
] as const;
const MEDIDAS = [
  ['longitud_a', 'Longitud A'],
  ['ancho_talon_b1', 'Ancho talón B1'],
  ['ancho_talon_b2', 'Ancho talón B2'],
  ['ranura_empaque_1_c', 'Ranura empaque 1 C'],
  ['ranura_empaque_1_g', 'Ranura empaque 1 G'],
  ['ranura_empaque_2_c', 'Ranura empaque 2 C'],
  ['ranura_empaque_2_g', 'Ranura empaque 2 G'],
  ['ancho_d1', 'Ancho D1'],
  ['ancho_d2', 'Ancho D2'],
  ['ranura_tope_e', 'Ranura tope E'],
  ['ranura_tope_h', 'Ranura tope H'],
  ['espesor_presion_1_f', 'Espesor presión 1 F'],
  ['espesor_presion_1_g', 'Espesor presión 1 G'],
  ['espesor_presion_2_f', 'Espesor presión 2 F'],
  ['espesor_presion_2_g', 'Espesor presión 2 G'],
] as const;

type Meta = { meta: number; hechos: number };
type Avance = {
  meta_total: number;
  planeados: number;
  registrados: number;
  por_asignacion: Record<string, Meta>;
  en_espera: number;
};
type Cople = {
  id: string;
  serial: string;
  orden?: string;
  dn?: string;
  pn?: string;
  longitud: string;
  asignacion: string;
  estado: string;
  condicion: string;
  operador: string;
  turno: string;
  creado_en: string;
  ph_resultado: string | null;
  retencion_condicion: string | null;
  retencion_motivo: string | null;
};
type Canon = {
  id: string;
  serial: string;
  lote: string;
  longitud: string;
  numero_coples: number;
  estado: string;
  siguiente_serial: string | null;
  coples: Cople[];
};
type OrdenResumen = {
  id: string;
  folio: string;
  dn: string;
  pn: string;
  prioridad: string;
  fecha_estimada: string;
  avance: Avance;
};
type Calidad = {
  arranque: boolean;
  coples_turno: number;
  muestreos: number;
  muestreos_requeridos: number;
  puede_registrar: boolean;
  motivo: string | null;
};
type Orden = OrdenResumen & {
  estado: string;
  largo_cople: string | null;
  calidad: Calidad;
  canones: Canon[];
};
type Resumen = {
  pendientes: Record<string, number>;
  permisos: { calidad: boolean; ph: boolean; recepcion: boolean; supervisar: boolean };
};
type Tab = 'maquinado' | 'calidad' | 'ph' | 'liberacion' | 'recepcion' | 'retenidos';

const fixed = (v: unknown, d = 3) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));
const label = (k: string) => ASIGNACIONES.find(([v]) => v === k)?.[1] ?? k;

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

export function RekaPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('maquinado');
  const summary = useQuery<Resumen>({
    queryKey: ['reka-resumen'],
    queryFn: async () => (await api.get(`${API}/resumen`)).data,
    enabled: can('PRODUCCION.REKA.REGISTRAR'),
    refetchInterval: 30000,
  });
  const p = summary.data?.permisos;
  const n = summary.data?.pendientes ?? {};
  const tabs: [Tab, string, boolean, number?][] = [
    ['maquinado', 'Maquinado', true],
    ['calidad', 'Calidad', !!p?.calidad],
    ['ph', 'Prueba hidráulica', !!p?.ph, n.PH_PENDIENTE],
    ['liberacion', 'Liberación', !!p?.calidad, n.LIBERACION_PENDIENTE],
    ['recepcion', 'Recepción', !!p?.recepcion, n.RECEPCION_PENDIENTE],
    ['retenidos', 'Retenidos', true, n.RETENIDO],
  ];
  return (
    <section className="planning pipe-workstation dimensional reka">
      <div className="module-hero">
        <p className="eyebrow">MAQUINADO DE COPLES</p>
        <h2>Reka</h2>
        <p>
          Maquina los coples de los cañones de tubería base asignados en las órdenes de maquinado.
          Cada cople pasa por prueba hidráulica, liberación de Calidad y recepción en patio.
        </p>
      </div>
      <div className="reka-tabs" role="tablist" aria-label="Etapas de Reka">
        {tabs
          .filter(([, , show]) => show)
          .map(([key, text, , count]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? 'active' : ''}
              onClick={() => setTab(key)}
            >
              {text}
              {!!count && <span className="reka-count">{count}</span>}
            </button>
          ))}
      </div>
      {tab === 'maquinado' && <Machining />}
      {tab === 'calidad' && <Quality />}
      {tab === 'ph' && <Hydro />}
      {tab === 'liberacion' && <Release />}
      {tab === 'recepcion' && <Reception />}
      {tab === 'retenidos' && <Held canResolve={!!p?.supervisar} />}
    </section>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['reka-resumen'] });
    void qc.invalidateQueries({ queryKey: ['reka-orden'] });
    void qc.invalidateQueries({ queryKey: ['reka-ordenes'] });
    void qc.invalidateQueries({ queryKey: ['reka-lista'] });
  };
}

function useOrders() {
  return useQuery<OrdenResumen[]>({
    queryKey: ['reka-ordenes'],
    queryFn: async () => (await api.get(`${API}/ordenes`)).data,
  });
}

const emptyCople = {
  longitud: '',
  asignacion: '',
  ranura_central_pasa: 'Sí',
  ranura_empaque_1_pasa: 'Sí',
  ranura_empaque_2_pasa: 'Sí',
  espesor_presion_r1: '',
  espesor_presion_r2: '',
  inspeccion_visual_cumple: 'Sí',
  observaciones: '',
  retencion: '',
  motivo: '',
};

function Machining() {
  const { user } = useAuth();
  const refresh = useRefresh();
  const orders = useOrders();
  const [operator, setOperator] = useState(user?.nombre_completo || '');
  const [supervisor, setSupervisor] = useState('');
  const [shift, setShift] = useState('');
  const [orderId, setOrderId] = useState('');
  const [canonId, setCanonId] = useState('');
  const [scan, setScan] = useState('');
  const [form, setForm] = useState(emptyCople);
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [noApto, setNoApto] = useState({ condicion: '', motivo: '' });
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const supervisors = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['reka-supervisores'],
    queryFn: async () => (await api.get(`${API}/supervisores`)).data,
  });
  const order = useQuery<Orden>({
    queryKey: ['reka-orden', orderId],
    queryFn: async () => (await api.get(`${API}/ordenes/${orderId}`)).data,
    enabled: !!orderId,
  });
  const o = order.data;
  const canon = o?.canones.find((c) => c.id === canonId);
  useEffect(() => {
    setForm({ ...emptyCople, longitud: o?.largo_cople ? String(Number(o.largo_cople)) : '' });
    setConfirmed(false);
    setNoApto({ condicion: '', motivo: '' });
  }, [canonId, o?.largo_cople]);
  const set = (k: keyof typeof emptyCople, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setConfirmed(false);
  };
  const fails = [
    form.ranura_central_pasa,
    form.ranura_empaque_1_pasa,
    form.ranura_empaque_2_pasa,
    form.inspeccion_visual_cumple,
  ].includes('No');
  const ready = !!operator.trim() && !!supervisor && !!shift;

  function pickBySerial(e: FormEvent) {
    e.preventDefault();
    const serial = (parseLabelCode(scan)?.serial ?? scan).trim();
    const found = o?.canones.find((c) => c.serial === serial);
    setErr(found ? '' : `El cañón ${serial} no está en la orden ${o?.folio ?? ''}.`);
    if (found) setCanonId(found.id);
    setScan('');
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canon || busy) return;
    setBusy(true);
    setErr('');
    try {
      const yes = (v: string) => v === 'Sí';
      const { data } = await api.post(`${API}/coples`, {
        solicitud_id: requestId,
        canon_id: canon.id,
        operador: operator,
        supervisor_id: supervisor,
        turno: shift,
        longitud: form.longitud,
        asignacion: form.asignacion,
        ranura_central_pasa: yes(form.ranura_central_pasa),
        ranura_empaque_1_pasa: yes(form.ranura_empaque_1_pasa),
        ranura_empaque_2_pasa: yes(form.ranura_empaque_2_pasa),
        espesor_presion_r1: form.espesor_presion_r1,
        espesor_presion_r2: form.espesor_presion_r2,
        inspeccion_visual_cumple: yes(form.inspeccion_visual_cumple),
        observaciones: form.observaciones || null,
        retencion: form.retencion ? { condicion: form.retencion, motivo: form.motivo } : null,
      });
      setOk([`Cople ${data.cople.serial} registrado.`, ...data.avisos]);
      setRequestId(crypto.randomUUID());
      setForm({ ...emptyCople, longitud: form.longitud });
      setConfirmed(false);
      refresh();
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function markNoApto() {
    if (!canon || !o) return;
    setBusy(true);
    setErr('');
    try {
      await api.post(`${API}/ordenes/${o.id}/canones/${canon.id}/no-apto`, noApto);
      setOk([
        `Cañón ${canon.serial} declarado no apto; el cambio quedó para el supervisor de manufactura.`,
      ]);
      setCanonId('');
      refresh();
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  const remaining = useMemo(() => {
    if (!o) return {} as Record<string, number>;
    return Object.fromEntries(
      Object.entries(o.avance.por_asignacion).map(([k, m]) => [k, m.meta - m.hechos]),
    );
  }, [o]);

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
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              />
            </label>
            <label>
              Supervisor
              <select value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
                <option value="">Selecciona un supervisor</option>
                {supervisors.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Turno
              <select value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">Selecciona un turno</option>
                {TURNOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      </form>

      <section className="form-card">
        <h3>Órdenes de maquinado pendientes</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>DN · PN</th>
                <th>Prioridad</th>
                <th>Fecha estimada</th>
                <th>Coples hechos / planeados</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.data?.map((x) => (
                <tr key={x.id} className={x.id === orderId ? 'reka-selected' : ''}>
                  <td>{x.folio}</td>
                  <td>
                    {x.dn} · {x.pn}
                  </td>
                  <td className={x.prioridad === 'URGENTE' ? 'process-warning' : ''}>
                    {x.prioridad === 'URGENTE' ? 'Urgente' : 'Ordinario'}
                  </td>
                  <td>{x.fecha_estimada}</td>
                  <td>
                    {x.avance.registrados} / {x.avance.planeados}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderId(x.id);
                        setCanonId('');
                        setOk([]);
                      }}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {orders.data?.length === 0 && (
                <tr>
                  <td colSpan={6}>No hay órdenes de maquinado pendientes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Messages ok={ok} err={err} />

      {o && (
        <div className="pipe-workspace">
          <aside className="pipe-lot-panel">
            <p className="eyebrow">ORDEN</p>
            <h3>{o.folio}</h3>
            <dl>
              <div>
                <dt>DN · PN · largo de cople</dt>
                <dd>
                  {o.dn} · {o.pn} · {fixed(o.largo_cople, 2)} m
                </dd>
              </div>
              <div>
                <dt>Coples hechos / planeados</dt>
                <dd>
                  {o.avance.registrados} / {o.avance.planeados}
                </dd>
              </div>
              <div>
                <dt>Calidad del turno</dt>
                <dd>
                  Arranque {o.calidad.arranque ? 'OK' : 'pendiente'} · muestreos{' '}
                  {o.calidad.muestreos}/{o.calidad.muestreos_requeridos}
                </dd>
              </div>
            </dl>
            <table className="dimensional-summary">
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Hechos</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(o.avance.por_asignacion).map(([k, m]) => (
                  <tr key={k}>
                    <td>{label(k)}</td>
                    <td>{m.hechos}</td>
                    <td>{m.meta}</td>
                  </tr>
                ))}
                <tr>
                  <td>En espera</td>
                  <td>{o.avance.en_espera}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </aside>

          <div className="pipe-main">
            {!o.calidad.puede_registrar && (
              <p className="process-warning form-card" role="alert">
                {o.calidad.motivo} No se pueden registrar coples hasta que Calidad la capture.
              </p>
            )}
            <section className="form-card">
              <h3>Cañones de la orden</h3>
              <form className="dimensional-scan" onSubmit={pickBySerial}>
                <label>
                  Escanear cañón
                  <input
                    placeholder="Escanea el QR del cañón o escribe su serial"
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                  />
                </label>
                <button disabled={!scan.trim()}>Seleccionar</button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cañón</th>
                      <th>Lote</th>
                      <th>Longitud</th>
                      <th>Coples</th>
                      <th>Estado</th>
                      <th>Siguiente</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {o.canones.map((c) => (
                      <tr key={c.id} className={c.id === canonId ? 'reka-selected' : ''}>
                        <td>{c.serial}</td>
                        <td>{c.lote}</td>
                        <td>{fixed(c.longitud)} m</td>
                        <td>
                          {c.coples.length} / {c.numero_coples}
                        </td>
                        <td>{c.estado}</td>
                        <td>{c.siguiente_serial ?? '—'}</td>
                        <td>
                          {c.siguiente_serial && (
                            <button type="button" onClick={() => setCanonId(c.id)}>
                              Maquinar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {canon && canon.siguiente_serial && (
              <form className="form-card dimensional-form" onSubmit={save}>
                <h3>
                  Cople {canon.siguiente_serial}{' '}
                  <small>
                    (cañón {canon.serial}, {canon.coples.length + 1} de {canon.numero_coples})
                  </small>
                </h3>
                {!ready && (
                  <p className="process-warning">Selecciona operador, supervisor y turno.</p>
                )}
                <fieldset>
                  <legend>Maquinado</legend>
                  <div className="form-grid">
                    <label>
                      Longitud (m)
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        required
                        value={form.longitud}
                        onChange={(e) => set('longitud', e.target.value)}
                      />
                    </label>
                    <label>
                      Destino (asignación)
                      <select
                        required
                        value={form.asignacion}
                        onChange={(e) => set('asignacion', e.target.value)}
                      >
                        <option value="">Selecciona el destino</option>
                        {ASIGNACIONES.map(([v, t]) => (
                          <option
                            key={v}
                            value={v}
                            disabled={v !== 'EN_ESPERA' && (remaining[v] ?? 0) <= 0}
                          >
                            {t}
                            {v !== 'EN_ESPERA' && ` (faltan ${Math.max(remaining[v] ?? 0, 0)})`}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(
                      [
                        ['ranura_central_pasa', 'Ranura central (calibre)'],
                        ['ranura_empaque_1_pasa', 'Ranura de empaque 1'],
                        ['ranura_empaque_2_pasa', 'Ranura de empaque 2'],
                      ] as const
                    ).map(([k, t]) => (
                      <label
                        key={k}
                        className={`process-field process-${form[k] === 'Sí' ? 'valid' : 'invalid'}`}
                      >
                        {t}
                        <select value={form[k]} onChange={(e) => set(k, e.target.value)}>
                          <option value="Sí">Pasa (Go)</option>
                          <option value="No">No pasa (No Go)</option>
                        </select>
                      </label>
                    ))}
                    <label>
                      Espesor presión ranura 1 (mm)
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={form.espesor_presion_r1}
                        onChange={(e) => set('espesor_presion_r1', e.target.value)}
                      />
                    </label>
                    <label>
                      Espesor presión ranura 2 (mm)
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        value={form.espesor_presion_r2}
                        onChange={(e) => set('espesor_presion_r2', e.target.value)}
                      />
                    </label>
                    <label
                      className={`process-field process-${form.inspeccion_visual_cumple === 'Sí' ? 'valid' : 'invalid'}`}
                    >
                      Inspección visual
                      <select
                        value={form.inspeccion_visual_cumple}
                        onChange={(e) => set('inspeccion_visual_cumple', e.target.value)}
                      >
                        <option value="Sí">Cumple</option>
                        <option value="No">No cumple</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Observaciones
                    <textarea
                      maxLength={2000}
                      value={form.observaciones}
                      onChange={(e) => set('observaciones', e.target.value)}
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>No conformidad</legend>
                  {fails && (
                    <p className="process-warning">
                      El cople no pasa calibres o inspección visual: indica PNC o Scrap.
                    </p>
                  )}
                  <div className="form-grid">
                    <label>
                      Retener como
                      <select
                        required={fails}
                        value={form.retencion}
                        onChange={(e) => set('retencion', e.target.value)}
                      >
                        <option value="">
                          {fails ? 'Selecciona PNC o Scrap' : 'No (cople OK)'}
                        </option>
                        <option value="PNC">PNC</option>
                        <option value="SCRAP">Scrap</option>
                      </select>
                    </label>
                    {form.retencion && (
                      <label>
                        Motivo
                        <input
                          required
                          minLength={5}
                          maxLength={2000}
                          value={form.motivo}
                          onChange={(e) => set('motivo', e.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </fieldset>
                {err && <p className="error">{err}</p>}
                <label className="dimensional-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Confirmo que los datos capturados son correctos
                </label>
                <div className="dimensional-actions">
                  <button type="button" onClick={() => setCanonId('')} disabled={busy}>
                    Cancelar
                  </button>
                  <button
                    className="action"
                    disabled={!confirmed || busy || !ready || !o.calidad.puede_registrar}
                  >
                    {busy ? 'Guardando…' : 'Guardar cople'}
                  </button>
                </div>
              </form>
            )}

            {canon && canon.coples.length === 0 && canon.estado === 'PENDIENTE' && (
              <section className="form-card">
                <h3>¿El cañón {canon.serial} no es apto para maquinar?</h3>
                <div className="form-grid">
                  <label>
                    Condición
                    <select
                      value={noApto.condicion}
                      onChange={(e) => setNoApto({ ...noApto, condicion: e.target.value })}
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
                      value={noApto.motivo}
                      onChange={(e) => setNoApto({ ...noApto, motivo: e.target.value })}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy || !noApto.condicion || noApto.motivo.trim().length < 5}
                  onClick={() => void markNoApto()}
                >
                  Declarar no apto
                </button>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Quality() {
  const refresh = useRefresh();
  const orders = useOrders();
  const [orderId, setOrderId] = useState('');
  const [tipo, setTipo] = useState('ARRANQUE');
  const [serial, setSerial] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [visual, setVisual] = useState('Sí');
  const [ph, setPh] = useState('Sí');
  const [notes, setNotes] = useState('');
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const order = useQuery<Orden>({
    queryKey: ['reka-orden', orderId],
    queryFn: async () => (await api.get(`${API}/ordenes/${orderId}`)).data,
    enabled: !!orderId,
  });
  const q = order.data?.calidad;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post(`${API}/inspecciones`, {
        orden_id: orderId,
        tipo,
        cople_serial:
          tipo === 'MUESTREO' ? (parseLabelCode(serial)?.serial ?? serial.trim()) : null,
        medidas: Object.fromEntries(MEDIDAS.map(([k]) => [k, values[k]])),
        inspeccion_visual_cumple: visual === 'Sí',
        prueba_hidraulica: ph === 'Sí',
        observaciones: notes || null,
      });
      setOk([
        data.aprobada
          ? 'Inspección aprobada.'
          : 'Inspección registrada como NO aprobada: la línea sigue detenida.',
      ]);
      setValues({});
      setSerial('');
      setNotes('');
      refresh();
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-card dimensional-form" onSubmit={save}>
      <h3>Inspección dimensional de Calidad</h3>
      <p>
        Al inicio de cada turno (07:00 y 19:00) se necesita una inspección de arranque aprobada por
        orden, y después una de muestreo por cada 20 coples.
      </p>
      <div className="form-grid">
        <label>
          Orden
          <select required value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Selecciona la orden</option>
            {orders.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.folio} · DN {o.dn} · PN {o.pn}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="ARRANQUE">Arranque de turno</option>
            <option value="MUESTREO">Muestreo (1 cada 20)</option>
          </select>
        </label>
        {tipo === 'MUESTREO' && (
          <label>
            Serial del cople
            <input required value={serial} onChange={(e) => setSerial(e.target.value)} />
          </label>
        )}
      </div>
      {q && (
        <p className={q.puede_registrar ? 'success' : 'process-warning'}>
          Turno actual: arranque {q.arranque ? 'aprobado' : 'pendiente'} · {q.coples_turno} coples ·
          muestreos {q.muestreos}/{q.muestreos_requeridos}
        </p>
      )}
      <fieldset>
        <legend>Medidas (mm)</legend>
        <div className="form-grid dimensional-four">
          {MEDIDAS.map(([k, t]) => (
            <label key={k}>
              {t}
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={values[k] ?? ''}
                onChange={(e) => setValues({ ...values, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        <label>
          Inspección visual
          <select value={visual} onChange={(e) => setVisual(e.target.value)}>
            <option value="Sí">Cumple</option>
            <option value="No">No cumple</option>
          </select>
        </label>
        <label>
          Prueba hidráulica
          <select value={ph} onChange={(e) => setPh(e.target.value)}>
            <option value="Sí">Sí</option>
            <option value="No">No</option>
          </select>
        </label>
      </div>
      <label>
        Observaciones
        <textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <Messages ok={ok} err={err} />
      <div className="dimensional-actions">
        <button className="action" disabled={busy || !orderId}>
          Guardar inspección
        </button>
      </div>
    </form>
  );
}

function useList(path: string) {
  return useQuery<Cople[]>({
    queryKey: ['reka-lista', path],
    queryFn: async () => (await api.get(`${API}/${path}`)).data,
  });
}

function CopleTable({
  rows,
  action,
  empty,
}: {
  rows: Cople[] | undefined;
  action: (c: Cople) => React.ReactNode;
  empty: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cople</th>
            <th>Orden</th>
            <th>DN · PN</th>
            <th>Destino</th>
            <th>Fecha</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows?.map((c) => (
            <tr key={c.id}>
              <td>{c.serial}</td>
              <td>{c.orden}</td>
              <td>
                {c.dn} · {c.pn}
              </td>
              <td>{label(c.asignacion)}</td>
              <td>{new Date(c.creado_en).toLocaleString('es-MX')}</td>
              <td>{action(c)}</td>
            </tr>
          ))}
          {rows?.length === 0 && (
            <tr>
              <td colSpan={6}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Hydro() {
  const refresh = useRefresh();
  const list = useList('ph');
  const [current, setCurrent] = useState<Cople | null>(null);
  const [form, setForm] = useState({ presion: '', resultado: 'OK', defecto: '', condicion: '' });
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const notOk = form.resultado !== 'OK';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post(`${API}/coples/${current.id}/ph`, {
        presion: form.presion,
        resultado: form.resultado,
        defecto: form.defecto || null,
        condicion: notOk ? form.condicion : null,
      });
      setOk([`Prueba hidráulica de ${current.serial}: ${form.resultado}.`, ...data.avisos]);
      setCurrent(null);
      setForm({ presion: form.presion, resultado: 'OK', defecto: '', condicion: '' });
      refresh();
    } catch (error) {
      setErr(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-card">
      <h3>Prueba hidráulica de coples</h3>
      <Messages ok={ok} err={err} />
      <CopleTable
        rows={list.data}
        empty="No hay coples pendientes de prueba hidráulica."
        action={(c) => (
          <button type="button" onClick={() => setCurrent(c)}>
            Probar
          </button>
        )}
      />
      {current && (
        <form className="dimensional-form reka-inline" onSubmit={save}>
          <h4>Cople {current.serial}</h4>
          <div className="form-grid">
            <label>
              Presión
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={form.presion}
                onChange={(e) => setForm({ ...form, presion: e.target.value })}
              />
            </label>
            <label className={`process-field process-${notOk ? 'invalid' : 'valid'}`}>
              Resultado
              <select
                value={form.resultado}
                onChange={(e) => setForm({ ...form, resultado: e.target.value })}
              >
                <option value="OK">OK</option>
                <option value="LAGRIMEO">Lagrimeo</option>
                <option value="MORETON">Moretón</option>
                <option value="POROSIDAD">Porosidad</option>
              </select>
            </label>
            {notOk && (
              <label>
                Retener como
                <select
                  required
                  value={form.condicion}
                  onChange={(e) => setForm({ ...form, condicion: e.target.value })}
                >
                  <option value="">Selecciona PNC o Scrap</option>
                  <option value="PNC">PNC</option>
                  <option value="SCRAP">Scrap</option>
                </select>
              </label>
            )}
          </div>
          <label>
            Defecto{notOk ? ' (obligatorio)' : ''}
            <textarea
              required={notOk}
              minLength={notOk ? 5 : undefined}
              maxLength={2000}
              value={form.defecto}
              onChange={(e) => setForm({ ...form, defecto: e.target.value })}
            />
          </label>
          {notOk && (
            <p className="process-warning">
              No pasa a liberación: queda retenido para el supervisor de manufactura.
            </p>
          )}
          <div className="dimensional-actions">
            <button type="button" onClick={() => setCurrent(null)}>
              Cancelar
            </button>
            <button className="action" disabled={busy}>
              Guardar prueba
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Release() {
  const refresh = useRefresh();
  const list = useList('liberacion');
  const [hold, setHold] = useState<Cople | null>(null);
  const [reason, setReason] = useState({ condicion: '', motivo: '' });
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function act(path: string, body: object | undefined, text: string) {
    setErr('');
    try {
      const { data } = await api.post(path, body);
      setOk([text, ...(data.avisos ?? [])]);
      setHold(null);
      setReason({ condicion: '', motivo: '' });
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <section className="form-card">
      <h3>Liberación de Calidad</h3>
      <Messages ok={ok} err={err} />
      <CopleTable
        rows={list.data}
        empty="No hay coples pendientes de liberación."
        action={(c) => (
          <>
            <button
              type="button"
              onClick={() =>
                void act(`${API}/coples/${c.id}/liberar`, undefined, `Cople ${c.serial} liberado.`)
              }
            >
              Liberar
            </button>{' '}
            <button type="button" onClick={() => setHold(c)}>
              Retener
            </button>
          </>
        )}
      />
      {hold && (
        <div className="reka-inline">
          <h4>Retener {hold.serial}</h4>
          <div className="form-grid">
            <label>
              Condición
              <select
                value={reason.condicion}
                onChange={(e) => setReason({ ...reason, condicion: e.target.value })}
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
                value={reason.motivo}
                onChange={(e) => setReason({ ...reason, motivo: e.target.value })}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!reason.condicion || reason.motivo.trim().length < 5}
            onClick={() =>
              void act(`${API}/coples/${hold.id}/retener`, reason, `Cople ${hold.serial} retenido.`)
            }
          >
            Confirmar retención
          </button>
        </div>
      )}
    </section>
  );
}

function Reception() {
  const refresh = useRefresh();
  const data = useQuery<{
    coples: Cople[];
    ubicaciones: { id: number; codigo: string; descripcion: string | null }[];
  }>({
    queryKey: ['reka-lista', 'recepcion'],
    queryFn: async () => (await api.get(`${API}/recepcion`)).data,
  });
  const [place, setPlace] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function receive(c: Cople) {
    setErr('');
    try {
      const { data: r } = await api.post(`${API}/coples/${c.id}/recibir`, {
        ubicacion_id: Number(place[c.id]),
      });
      setOk([`Cople ${c.serial} recibido en ${r.ubicacion}.`]);
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <section className="form-card">
      <h3>Recepción en patio</h3>
      <p>El cople entra al inventario de Administración en la ubicación elegida.</p>
      <Messages ok={ok} err={err} />
      {data.data?.ubicaciones.length === 0 && (
        <p className="process-warning">
          No hay ubicaciones de patio activas. Dalas de alta en Administración → Inventario.
        </p>
      )}
      <CopleTable
        rows={data.data?.coples}
        empty="No hay coples pendientes de recepción."
        action={(c) => (
          <>
            <select
              aria-label={`Ubicación de ${c.serial}`}
              value={place[c.id] ?? ''}
              onChange={(e) => setPlace({ ...place, [c.id]: e.target.value })}
            >
              <option value="">Ubicación</option>
              {data.data?.ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo}
                  {u.descripcion ? ` · ${u.descripcion}` : ''}
                </option>
              ))}
            </select>{' '}
            <button type="button" disabled={!place[c.id]} onClick={() => void receive(c)}>
              Recibir
            </button>
          </>
        )}
      />
    </section>
  );
}

function Held({ canResolve }: { canResolve: boolean }) {
  const refresh = useRefresh();
  const list = useList('retenidos');
  const [ok, setOk] = useState<string[]>([]);
  const [err, setErr] = useState('');

  async function resolve(c: Cople, confirmar: boolean) {
    setErr('');
    try {
      const { data } = await api.post(`${API}/coples/${c.id}/resolver`, { confirmar });
      setOk([
        confirmar
          ? `Cople ${c.serial} confirmado como ${data.cople.condicion}.`
          : `Cople ${c.serial} devuelto al flujo.`,
      ]);
      refresh();
    } catch (error) {
      setErr(errorText(error));
    }
  }

  return (
    <section className="form-card">
      <h3>Coples retenidos (PNC / Scrap)</h3>
      {!canResolve && <p>Solo el supervisor de manufactura o un administrador los resuelve.</p>}
      <Messages ok={ok} err={err} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cople</th>
              <th>Orden</th>
              <th>Solicitado</th>
              <th>Motivo</th>
              <th>PH</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.serial}</td>
                <td>{c.orden}</td>
                <td className="process-warning">{c.retencion_condicion}</td>
                <td>{c.retencion_motivo}</td>
                <td>{c.ph_resultado ?? '—'}</td>
                <td>
                  {canResolve && (
                    <>
                      <button type="button" onClick={() => void resolve(c, true)}>
                        Confirmar {c.retencion_condicion}
                      </button>{' '}
                      {(!c.ph_resultado || c.ph_resultado === 'OK') && (
                        <button type="button" onClick={() => void resolve(c, false)}>
                          Devolver al flujo
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {list.data?.length === 0 && (
              <tr>
                <td colSpan={6}>No hay coples retenidos.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
