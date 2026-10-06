import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { average, check, num, type Range } from './dimensionalRules';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const B = ['espesor_b1', 'espesor_b2', 'espesor_b3', 'espesor_b4'] as const;
const A = ['espesor_a1', 'espesor_a2', 'espesor_a3', 'espesor_a4'] as const;

type Fuera = { campo: string; etiqueta: string; valor: string; min: string; max: string };
type Medicion = Record<string, unknown> & {
  id: string;
  serial?: string;
  creado_en: string;
  operador: string;
  turno: string;
  ajuste: boolean;
  fuera_tolerancia: Fuera[];
  origen_extremo_a: string;
  promedio_a: string;
  promedio_b: string;
  dn_ext_a: string;
  dn_ext_b: string;
  dn_centro: string | null;
  inspeccion_externa: boolean;
  nota_externa: string | null;
  inspeccion_interna: boolean;
  nota_interna: string | null;
  unidad: string;
};
type TubeInfo = {
  tubo: {
    id: string;
    serial: string;
    numero_pipe: number;
    longitud_real: string;
    condicion: string;
    etapa: string;
    cambio_pendiente: boolean;
  };
  lote: { id: string; folio: string; orden: string; dn: string; pn: string; sn: string };
  producto: string;
  es_tuberia: boolean;
  unidad: string;
  limites: { diametro: Range; espesor: Range };
  anterior: {
    serial: string;
    medido: boolean;
    espesores: string[] | null;
    promedio: string | null;
  } | null;
  medicion: Medicion | null;
  puede_editar: boolean;
  resumen: {
    por_condicion: { condicion: string; piezas: number; metros: string }[];
    ajuste_si: { piezas: number; metros: string };
    ajuste_no: { piezas: number; metros: string };
    tubos: number;
  };
};
type Form = Record<string, string>;
const emptyForm = (): Form => ({
  longitud_medida: '',
  motivo_longitud: '',
  dn_ext_a: '',
  dn_ext_b: '',
  dn_centro: '',
  ...Object.fromEntries([...A, ...B].map((k) => [k, ''])),
  inspeccion_externa: 'No',
  nota_externa: '',
  inspeccion_interna: 'No',
  nota_interna: '',
  observaciones: '',
  motivo_edicion: '',
});
const fixed = (v: unknown, d = 3) => (num(v) === null ? '—' : Number(v).toFixed(d));

export function DimensionalPage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const serialRef = useRef<HTMLInputElement>(null);
  const [operator, setOperator] = useState(user?.nombre_completo || '');
  const [supervisor, setSupervisor] = useState('');
  const [shift, setShift] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [serial, setSerial] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [manualA, setManualA] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string[]>([]);
  const [error, setError] = useState('');

  const supervisors = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['dimensional-supervisors'],
    queryFn: async () => (await api.get('/produccion/dimensional/supervisores')).data,
    enabled: can('PRODUCCION.DIMENSIONAL.REGISTRAR'),
  });
  const info = useQuery<TubeInfo>({
    queryKey: ['dimensional-tube', serial],
    queryFn: async () =>
      (await api.get(`/produccion/dimensional/tubos/${encodeURIComponent(serial)}`)).data,
    enabled: !!serial,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const t = info.data;
  const history = useQuery<(Medicion & { longitud_real: string; condicion: string })[]>({
    queryKey: ['dimensional-history', t?.lote.id],
    queryFn: async () =>
      (await api.get('/produccion/dimensional/mediciones', { params: { lote_id: t?.lote.id } }))
        .data,
    enabled: !!t?.lote.id,
  });

  // Cargar formulario al cambiar de tubo (o al editar una medición existente).
  useEffect(() => {
    if (!t) return;
    const f = emptyForm();
    f.longitud_medida = String(Number(t.tubo.longitud_real));
    if (t.medicion && editing) {
      for (const k of ['dn_ext_a', 'dn_ext_b', 'dn_centro', ...A, ...B])
        f[k] = t.medicion[k] === null ? '' : String(Number(t.medicion[k]));
      f.inspeccion_externa = t.medicion.inspeccion_externa ? 'Sí' : 'No';
      f.inspeccion_interna = t.medicion.inspeccion_interna ? 'Sí' : 'No';
      f.nota_externa = t.medicion.nota_externa || '';
      f.nota_interna = t.medicion.nota_interna || '';
      f.observaciones = String(t.medicion.observaciones ?? '');
    }
    setForm(f);
    setManualA(!t.anterior?.medido);
    setConfirmed(false);
  }, [t, editing]);

  const set = (k: string, v: string) => {
    setForm((old) => ({ ...old, [k]: v }));
    setConfirmed(false);
  };
  const aFromPrevious = !editing && !manualA && !!t?.anterior?.medido;
  const aValues = aFromPrevious
    ? (t?.anterior?.espesores ?? []).map(String)
    : A.map((k) => form[k]);
  const diameters = t?.es_tuberia
    ? (['dn_ext_a', 'dn_ext_b', 'dn_centro'] as const)
    : (['dn_ext_a', 'dn_ext_b'] as const);
  const outside = useMemo(() => {
    if (!t) return [];
    const list: string[] = [];
    diameters.forEach((k) => {
      if (check(form[k], t.limites.diametro).state === 'invalid') list.push(k);
    });
    [...aValues, ...B.map((k) => form[k])].forEach((v, i) => {
      if (check(v, t.limites.espesor).state === 'invalid') list.push(i < 4 ? A[i] : B[i - 4]);
    });
    return list;
  }, [t, form, aValues, diameters]);
  const fit =
    !!t?.limites.diametro.definido &&
    diameters.every(
      (k) =>
        (k === 'dn_centro' && !form[k]) || check(form[k], t.limites.diametro).state === 'valid',
    );
  const lengthChanged =
    !!t &&
    num(form.longitud_medida) !== null &&
    num(form.longitud_medida) !== num(t.tubo.longitud_real);

  function lookup(e: FormEvent) {
    e.preventDefault();
    setMessage([]);
    setError('');
    setEditing(false);
    setSerial(serialInput.trim());
    void qc.invalidateQueries({ queryKey: ['dimensional-tube', serialInput.trim()] });
  }

  function reset(next: string[]) {
    setMessage(next);
    setSerial('');
    setSerialInput('');
    setEditing(false);
    setRequestId(crypto.randomUUID());
    setTimeout(() => serialRef.current?.focus(), 0);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!t || busy) return;
    setBusy(true);
    setError('');
    const n = (k: string) => (form[k].trim() === '' ? null : form[k].trim());
    const common = {
      dn_ext_a: n('dn_ext_a'),
      dn_ext_b: n('dn_ext_b'),
      dn_centro: t.es_tuberia ? n('dn_centro') : null,
      ...Object.fromEntries(B.map((k) => [k, n(k)])),
      inspeccion_externa: form.inspeccion_externa === 'Sí',
      nota_externa: n('nota_externa'),
      inspeccion_interna: form.inspeccion_interna === 'Sí',
      nota_interna: n('nota_interna'),
      observaciones: n('observaciones'),
    };
    try {
      if (editing && t.medicion) {
        const { data } = await api.put(`/produccion/dimensional/mediciones/${t.medicion.id}`, {
          ...common,
          ...Object.fromEntries(A.map((k) => [k, n(k)])),
          motivo_edicion: form.motivo_edicion,
        });
        reset([`Medición del tubo ${t.tubo.serial} actualizada.`, ...data.avisos]);
      } else {
        const { data } = await api.post('/produccion/dimensional/mediciones', {
          ...common,
          solicitud_id: requestId,
          tubo_id: t.tubo.id,
          operador: operator,
          supervisor_id: supervisor,
          turno: shift,
          longitud_medida: n('longitud_medida'),
          motivo_longitud: lengthChanged ? n('motivo_longitud') : null,
          extremo_a_manual: !aFromPrevious,
          ...(aFromPrevious ? {} : Object.fromEntries(A.map((k) => [k, n(k)]))),
        });
        reset([
          `Tubo ${t.tubo.serial} medido. Ajuste: ${data.medicion.ajuste ? 'Sí' : 'No'}.`,
          ...data.avisos,
        ]);
      }
      void qc.invalidateQueries({ queryKey: ['dimensional-history'] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: string, label: string, range: Range | undefined, readOnly = false) => {
    const value = readOnly ? (aValues[A.indexOf(k as (typeof A)[number])] ?? '') : form[k];
    const c = check(value, range);
    return (
      <label key={k} className={`process-field process-${c.state}`}>
        {label}
        <input
          type="number"
          inputMode="decimal"
          step="0.001"
          min="0"
          required={!readOnly && k !== 'dn_centro'}
          readOnly={readOnly}
          value={value}
          aria-invalid={c.state === 'invalid'}
          onChange={(e) => set(k, e.target.value)}
        />
        <small>{c.message}</small>
      </label>
    );
  };

  const ready = !!operator.trim() && !!supervisor && !!shift;
  const unit = t?.unidad ?? 'mm';
  const showForm = !!t && (!t.medicion || editing);

  return (
    <section className="planning pipe-workstation dimensional">
      <div className="module-hero">
        <p className="eyebrow">CONTROL DIMENSIONAL</p>
        <h2>Dimensional</h2>
        <p>
          Escanea el serial de un tubo registrado en Winder y captura diámetros, espesores e
          inspección visual. Los valores fuera de tolerancia se guardan y se notifican al supervisor
          de manufactura.
        </p>
      </div>

      <form className="form-card" onSubmit={lookup}>
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
              <select required value={supervisor} onChange={(e) => setSupervisor(e.target.value)}>
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
              <select required value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">Selecciona un turno</option>
                {TURNOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
        <div className="dimensional-scan">
          <label>
            Serial del tubo
            <input
              ref={serialRef}
              autoFocus
              required
              maxLength={40}
              placeholder="Escanea o escribe el serial y presiona Enter"
              value={serialInput}
              disabled={!ready}
              onChange={(e) => setSerialInput(e.target.value)}
            />
          </label>
          <button disabled={!ready || !serialInput.trim()}>Buscar tubo</button>
          {!ready && <small>Selecciona operador, supervisor y turno para comenzar.</small>}
        </div>
      </form>

      {message.length > 0 && (
        <div className="success" role="status">
          {message.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
      {info.isError && <p className="error">{errorText(info.error)}</p>}

      {t && (
        <div className="pipe-workspace">
          <aside className="pipe-lot-panel">
            <p className="eyebrow">TUBO</p>
            <h3>{t.tubo.serial}</h3>
            <dl>
              <div>
                <dt>Lote · Orden</dt>
                <dd>
                  {t.lote.folio} · {t.lote.orden}
                </dd>
              </div>
              <div>
                <dt>DN · PN · SN</dt>
                <dd>
                  {t.lote.dn} · {t.lote.pn} · {t.lote.sn}
                </dd>
              </div>
              <div>
                <dt>Producto · # Pipe · Condición</dt>
                <dd>
                  {t.producto} · {t.tubo.numero_pipe} · {t.tubo.condicion}
                </dd>
              </div>
              <div>
                <dt>Longitud Winder</dt>
                <dd>{fixed(t.tubo.longitud_real)} m</dd>
              </div>
              <div>
                <dt>Diámetro exterior ({unit})</dt>
                <dd>
                  {t.limites.diametro.definido
                    ? `${fixed(t.limites.diametro.min, 2)} – ${fixed(t.limites.diametro.max, 2)}`
                    : 'Sin límites en SetUp'}
                </dd>
              </div>
              <div>
                <dt>Espesor ({unit}) diseño – nominal</dt>
                <dd>
                  {t.limites.espesor.definido
                    ? `${fixed(t.limites.espesor.min, 2)} – ${fixed(t.limites.espesor.max, 2)}`
                    : 'Sin límites en SetUp'}
                </dd>
              </div>
            </dl>
            <table className="dimensional-summary">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Pzs</th>
                  <th>Mts</th>
                </tr>
              </thead>
              <tbody>
                {t.resumen.por_condicion.map((r) => (
                  <tr key={r.condicion}>
                    <td>{r.condicion}</td>
                    <td>{r.piezas}</td>
                    <td>{fixed(r.metros, 2)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Ajuste: Sí</td>
                  <td>{t.resumen.ajuste_si.piezas}</td>
                  <td>{fixed(t.resumen.ajuste_si.metros, 2)}</td>
                </tr>
                <tr>
                  <td>Ajuste: No</td>
                  <td>{t.resumen.ajuste_no.piezas}</td>
                  <td>{fixed(t.resumen.ajuste_no.metros, 2)}</td>
                </tr>
              </tbody>
            </table>
          </aside>

          <div className="pipe-main">
            {t.medicion && !editing && (
              <section className="form-card">
                <h3>Este tubo ya tiene medición dimensional</h3>
                <p>
                  {new Date(t.medicion.creado_en).toLocaleString('es-MX')} · {t.medicion.operador} ·{' '}
                  {t.medicion.turno} · Ajuste: <b>{t.medicion.ajuste ? 'Sí' : 'No'}</b>
                </p>
                <p>
                  Ext A {fixed(t.medicion.dn_ext_a)} · Ext B {fixed(t.medicion.dn_ext_b)}
                  {t.medicion.dn_centro !== null && <> · Central {fixed(t.medicion.dn_centro)}</>} ·
                  Promedio espesor A {fixed(t.medicion.promedio_a)} · B{' '}
                  {fixed(t.medicion.promedio_b)} {t.medicion.unidad}
                </p>
                {t.medicion.fuera_tolerancia.length > 0 && (
                  <p className="process-warning">
                    Fuera de tolerancia:{' '}
                    {t.medicion.fuera_tolerancia.map((f) => `${f.etiqueta} ${f.valor}`).join(', ')}
                  </p>
                )}
                {t.puede_editar ? (
                  <button type="button" className="action" onClick={() => setEditing(true)}>
                    Editar medición
                  </button>
                ) : (
                  <p>Solo el supervisor de manufactura o un administrador puede corregirla.</p>
                )}
              </section>
            )}

            {showForm && (
              <form className="form-card dimensional-form" onSubmit={save}>
                {editing && <p className="process-warning">Editando la medición existente.</p>}
                {!editing && (
                  <fieldset>
                    <legend>Longitud</legend>
                    <div className="form-grid">
                      <label>
                        Longitud medida (m)
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          required
                          value={form.longitud_medida}
                          onChange={(e) => set('longitud_medida', e.target.value)}
                        />
                        {lengthChanged && (
                          <small className="process-warning">
                            Difiere de Winder: se enviará como solicitud de cambio al supervisor de
                            manufactura.
                          </small>
                        )}
                      </label>
                      {lengthChanged && (
                        <label>
                          Motivo del cambio de longitud
                          <input
                            required
                            minLength={5}
                            maxLength={2000}
                            value={form.motivo_longitud}
                            onChange={(e) => set('motivo_longitud', e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                    {t.tubo.cambio_pendiente && (
                      <p className="process-warning">
                        Este tubo ya tiene una solicitud de cambio pendiente.
                      </p>
                    )}
                  </fieldset>
                )}

                <fieldset>
                  <legend>Diámetro exterior ({unit})</legend>
                  <div className="form-grid">
                    {field('dn_ext_a', 'Extremo A', t.limites.diametro)}
                    {t.es_tuberia && field('dn_centro', 'Central (1/2)', t.limites.diametro)}
                    {field('dn_ext_b', 'Extremo B', t.limites.diametro)}
                  </div>
                  <p className={`dimensional-fit ${fit ? 'ok' : 'no'}`}>
                    Ajuste: <b>{fit ? 'Sí' : 'No'}</b>
                  </p>
                </fieldset>

                <fieldset>
                  <legend>Espesor extremo B ({unit}) · se mide en este tubo</legend>
                  <div className="form-grid dimensional-four">
                    {B.map((k, i) => field(k, `#${i + 1}`, t.limites.espesor))}
                  </div>
                  <p>Promedio B: {average(B.map((k) => form[k])) || '—'}</p>
                </fieldset>

                <fieldset>
                  <legend>Espesor extremo A ({unit})</legend>
                  {!editing &&
                    (t.anterior?.medido ? (
                      <label className="dimensional-check">
                        <input
                          type="checkbox"
                          checked={manualA}
                          onChange={(e) => {
                            setManualA(e.target.checked);
                            setConfirmed(false);
                          }}
                        />
                        Medir manualmente (si no, se toma del extremo B del tubo anterior{' '}
                        {t.anterior.serial})
                      </label>
                    ) : (
                      <p className="process-warning">
                        {t.anterior
                          ? `El tubo anterior ${t.anterior.serial} aún no tiene medición: mide este extremo manualmente.`
                          : 'Primer tubo del lote: mide este extremo manualmente.'}
                      </p>
                    ))}
                  <div className="form-grid dimensional-four">
                    {A.map((k, i) => field(k, `#${i + 1}`, t.limites.espesor, aFromPrevious))}
                  </div>
                  <p>Promedio A: {average(aValues) || '—'}</p>
                </fieldset>

                <fieldset>
                  <legend>Inspección visual</legend>
                  <div className="form-grid">
                    {(
                      [
                        ['inspeccion_externa', 'nota_externa', 'Inspección visual externa'],
                        ['inspeccion_interna', 'nota_interna', 'Inspección visual interna'],
                      ] as const
                    ).map(([k, note, label]) => (
                      <div key={k} className="dimensional-visual">
                        <label>
                          {label}
                          <select value={form[k]} onChange={(e) => set(k, e.target.value)}>
                            <option>No</option>
                            <option>Sí</option>
                          </select>
                        </label>
                        {form[k] === 'Sí' && (
                          <label>
                            Nota
                            <textarea
                              required
                              maxLength={2000}
                              value={form[note]}
                              onChange={(e) => set(note, e.target.value)}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  <label>
                    Observaciones
                    <textarea
                      maxLength={2000}
                      value={form.observaciones}
                      onChange={(e) => set('observaciones', e.target.value)}
                    />
                  </label>
                  {editing && (
                    <label>
                      Motivo de la corrección
                      <input
                        required
                        minLength={5}
                        maxLength={2000}
                        value={form.motivo_edicion}
                        onChange={(e) => set('motivo_edicion', e.target.value)}
                      />
                    </label>
                  )}
                </fieldset>

                {outside.length > 0 && (
                  <p className="process-warning">
                    {outside.length} valor(es) fuera de tolerancia. Se guardará y se notificará al
                    supervisor de manufactura.
                  </p>
                )}
                {error && <p className="error">{error}</p>}
                <label className="dimensional-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Confirmo que los datos capturados son correctos
                </label>
                <div className="dimensional-actions">
                  <button
                    type="button"
                    onClick={() => (editing ? setEditing(false) : reset([]))}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button className="action" disabled={!confirmed || busy}>
                    {busy ? 'Guardando…' : editing ? 'Guardar corrección' : 'Guardar medición'}
                  </button>
                </div>
              </form>
            )}

            <section className="form-card">
              <h3>Mediciones del lote {t.lote.folio}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Fecha</th>
                      <th>Ext A</th>
                      <th>Central</th>
                      <th>Ext B</th>
                      <th>Prom. A</th>
                      <th>Prom. B</th>
                      <th>Ajuste</th>
                      <th>Fuera</th>
                      <th>Operador / turno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data?.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setSerialInput(m.serial || '');
                              setSerial(m.serial || '');
                              setEditing(false);
                              setMessage([]);
                            }}
                          >
                            {m.serial}
                          </button>
                        </td>
                        <td>{new Date(m.creado_en).toLocaleString('es-MX')}</td>
                        <td>{fixed(m.dn_ext_a)}</td>
                        <td>{m.dn_centro === null ? '—' : fixed(m.dn_centro)}</td>
                        <td>{fixed(m.dn_ext_b)}</td>
                        <td>{fixed(m.promedio_a)}</td>
                        <td>{fixed(m.promedio_b)}</td>
                        <td>{m.ajuste ? 'Sí' : 'No'}</td>
                        <td className={m.fuera_tolerancia.length ? 'process-warning' : ''}>
                          {m.fuera_tolerancia.length}
                        </td>
                        <td>
                          {m.operador} / {m.turno}
                        </td>
                      </tr>
                    ))}
                    {history.data?.length === 0 && (
                      <tr>
                        <td colSpan={10}>Sin mediciones en este lote.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
