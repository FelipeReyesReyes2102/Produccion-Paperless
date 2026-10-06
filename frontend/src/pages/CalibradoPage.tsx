import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { check, num, type Range } from './dimensionalRules';
import { parseLabelCode } from '../printing/labelCode';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const API = '/produccion/calibrado';

type Fuera = { campo: string; etiqueta: string; valor: string };
type Registro = {
  id: string;
  serial?: string;
  creado_en: string;
  operador: string;
  turno: string;
  bl_ext_a: string;
  bl_ext_b: string;
  dn_esp_a: string;
  dn_esp_b: string;
  dn_medio: string | null;
  rectificado: boolean;
  observaciones: string | null;
  fuera_tolerancia: Fuera[];
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
  limites: { bl: Range; diametro: Range };
  dimensional: {
    ajuste: boolean;
    dn_ext_a: string;
    dn_ext_b: string;
    dn_centro: string | null;
    fecha: string;
  } | null;
  registro: Registro | null;
  puede_editar: boolean;
};
type Form = Record<string, string>;
const emptyForm = (): Form => ({
  bl_ext_a: '',
  bl_ext_b: '',
  dn_esp_a: '',
  dn_esp_b: '',
  dn_medio: '',
  observaciones: '',
  condicion_nueva: '',
  motivo_condicion: '',
  motivo_edicion: '',
});
const fixed = (v: unknown, d = 3) => (num(v) === null ? '—' : Number(v).toFixed(d));
const plain = (v: unknown) => (v === null || v === undefined ? '' : String(Number(v)));

export function CalibradoPage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const serialRef = useRef<HTMLInputElement>(null);
  const [operator, setOperator] = useState(user?.nombre_completo || '');
  const [supervisor, setSupervisor] = useState('');
  const [shift, setShift] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [serial, setSerial] = useState('');
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<string[]>([]);
  const [error, setError] = useState('');

  const supervisors = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['calibrado-supervisors'],
    queryFn: async () => (await api.get(`${API}/supervisores`)).data,
    enabled: can('PRODUCCION.CALIBRADO.REGISTRAR'),
  });
  const info = useQuery<TubeInfo>({
    queryKey: ['calibrado-tube', serial],
    queryFn: async () => (await api.get(`${API}/tubos/${encodeURIComponent(serial)}`)).data,
    enabled: !!serial,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const t = info.data;
  const history = useQuery<(Registro & { longitud_real: string; condicion: string })[]>({
    queryKey: ['calibrado-history', t?.lote.id],
    queryFn: async () =>
      (await api.get(`${API}/registros`, { params: { lote_id: t?.lote.id } })).data,
    enabled: !!t?.lote.id,
  });

  // Ajuste en Dimensional: diámetros tomados de esa medición (no se rectifica).
  // Sin ajuste: el tubo se rectifica y se capturan los diámetros después del calibrado.
  const fromDimensional = !editing && !!t?.dimensional?.ajuste;
  useEffect(() => {
    if (!t) return;
    const f = emptyForm();
    if (editing && t.registro) {
      for (const k of ['bl_ext_a', 'bl_ext_b', 'dn_esp_a', 'dn_esp_b', 'dn_medio'] as const)
        f[k] = plain(t.registro[k]);
      f.observaciones = t.registro.observaciones || '';
    } else if (t.dimensional) {
      f.dn_esp_a = plain(t.dimensional.dn_ext_a);
      f.dn_esp_b = plain(t.dimensional.dn_ext_b);
      f.dn_medio = plain(t.dimensional.dn_centro);
    }
    setForm(f);
    setConfirmed(false);
  }, [t, editing]);

  const set = (k: string, v: string) => {
    setForm((old) => ({ ...old, [k]: v }));
    setConfirmed(false);
  };
  const outside = useMemo(() => {
    if (!t) return 0;
    const diam = t.es_tuberia ? ['dn_esp_a', 'dn_esp_b', 'dn_medio'] : ['dn_esp_a', 'dn_esp_b'];
    return (
      ['bl_ext_a', 'bl_ext_b'].filter((k) => check(form[k], t.limites.bl).state === 'invalid')
        .length + diam.filter((k) => check(form[k], t.limites.diametro).state === 'invalid').length
    );
  }, [t, form]);

  function lookup(e: FormEvent) {
    e.preventDefault();
    setMessage([]);
    setError('');
    setEditing(false);
    // Acepta el QR de la etiqueta (OTEK1) o el serial escrito a mano.
    const next = parseLabelCode(serialInput)?.serial ?? serialInput.trim();
    setSerialInput(next);
    setSerial(next);
    void qc.invalidateQueries({ queryKey: ['calibrado-tube', next] });
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
    const diam = fromDimensional
      ? {}
      : {
          dn_esp_a: n('dn_esp_a'),
          dn_esp_b: n('dn_esp_b'),
          dn_medio: t.es_tuberia ? n('dn_medio') : null,
        };
    const common = {
      bl_ext_a: n('bl_ext_a'),
      bl_ext_b: n('bl_ext_b'),
      ...diam,
      observaciones: n('observaciones'),
    };
    try {
      if (editing && t.registro) {
        const { data } = await api.put(`${API}/registros/${t.registro.id}`, {
          ...common,
          motivo_edicion: form.motivo_edicion,
        });
        reset([`Calibrado del tubo ${t.tubo.serial} actualizado.`, ...data.avisos]);
      } else {
        const { data } = await api.post(`${API}/registros`, {
          ...common,
          solicitud_id: requestId,
          tubo_id: t.tubo.id,
          operador: operator,
          supervisor_id: supervisor,
          turno: shift,
          condicion_nueva: n('condicion_nueva'),
          motivo_condicion: form.condicion_nueva ? n('motivo_condicion') : null,
        });
        reset([
          `Tubo ${t.tubo.serial} registrado en calibrado y chaflanado. Rectificado: ${
            data.registro.rectificado ? 'Sí' : 'No'
          }.`,
          ...data.avisos,
        ]);
      }
      void qc.invalidateQueries({ queryKey: ['calibrado-history'] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: string, label: string, range: Range | undefined, readOnly = false) => {
    const c = check(form[k], range);
    return (
      <label key={k} className={`process-field process-${c.state}`}>
        {label}
        <input
          type="number"
          inputMode="decimal"
          step="0.001"
          min="0"
          required={!readOnly}
          readOnly={readOnly}
          value={form[k]}
          aria-invalid={c.state === 'invalid'}
          onChange={(e) => set(k, e.target.value)}
        />
        <small>{c.message}</small>
      </label>
    );
  };

  const ready = !!operator.trim() && !!supervisor && !!shift;
  const unit = t?.unidad ?? 'mm';
  const showForm = !!t && !!t.dimensional && (!t.registro || editing);
  const range = (r: Range) =>
    r.definido ? `${fixed(r.min, 2)} – ${fixed(r.max, 2)}` : 'Sin límites en SetUp';

  return (
    <section className="planning pipe-workstation dimensional">
      <div className="module-hero">
        <p className="eyebrow">CALIBRADO Y CHAFLANADO</p>
        <h2>Calibrado y chaflanado</h2>
        <p>
          Escanea un tubo ya medido en Dimensional y captura el largo del chaflán (BL) de cada
          extremo. Si Dimensional no dio ajuste, el tubo se rectifica y se capturan los diámetros
          calibrados. Lo fuera de tolerancia se guarda y se notifica al supervisor de manufactura.
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
              maxLength={300}
              placeholder="Escanea el QR de la etiqueta o escribe el serial y presiona Enter"
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
                <dt>Longitud</dt>
                <dd>{fixed(t.tubo.longitud_real)} m</dd>
              </div>
              <div>
                <dt>BL ({unit})</dt>
                <dd>{range(t.limites.bl)}</dd>
              </div>
              <div>
                <dt>Diámetro ({unit})</dt>
                <dd>{range(t.limites.diametro)}</dd>
              </div>
              <div>
                <dt>Ajuste en Dimensional</dt>
                <dd>{t.dimensional ? (t.dimensional.ajuste ? 'Sí' : 'No') : 'Sin medición'}</dd>
              </div>
            </dl>
          </aside>

          <div className="pipe-main">
            {!t.dimensional && (
              <p className="process-warning form-card" role="alert">
                Este tubo aún no tiene medición dimensional. Regístrala en Dimensional antes de
                calibrar y chaflanar.
              </p>
            )}
            {t.registro && !editing && (
              <section className="form-card">
                <h3>Este tubo ya tiene calibrado y chaflanado</h3>
                <p>
                  {new Date(t.registro.creado_en).toLocaleString('es-MX')} · {t.registro.operador} ·{' '}
                  {t.registro.turno} · Rectificado: <b>{t.registro.rectificado ? 'Sí' : 'No'}</b>
                </p>
                <p>
                  BL A {fixed(t.registro.bl_ext_a)} · BL B {fixed(t.registro.bl_ext_b)} · Espiga A{' '}
                  {fixed(t.registro.dn_esp_a)} · Espiga B {fixed(t.registro.dn_esp_b)}
                  {t.registro.dn_medio !== null && <> · Medio {fixed(t.registro.dn_medio)}</>}{' '}
                  {t.registro.unidad}
                </p>
                {t.registro.fuera_tolerancia.length > 0 && (
                  <p className="process-warning">
                    Fuera de tolerancia:{' '}
                    {t.registro.fuera_tolerancia.map((f) => `${f.etiqueta} ${f.valor}`).join(', ')}
                  </p>
                )}
                {t.puede_editar ? (
                  <button type="button" className="action" onClick={() => setEditing(true)}>
                    Editar registro
                  </button>
                ) : (
                  <p>Solo el supervisor de manufactura o un administrador puede corregirlo.</p>
                )}
              </section>
            )}

            {showForm && (
              <form className="form-card dimensional-form" onSubmit={save}>
                {editing && <p className="process-warning">Editando el registro existente.</p>}
                <fieldset>
                  <legend>Chaflán · BL ({unit})</legend>
                  <div className="form-grid">
                    {field('bl_ext_a', 'Extremo A', t.limites.bl)}
                    {field('bl_ext_b', 'Extremo B', t.limites.bl)}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Diámetro de espigas ({unit})</legend>
                  {!editing && (
                    <p className={`dimensional-fit ${fromDimensional ? 'ok' : 'no'}`}>
                      {fromDimensional
                        ? 'Ajuste en Dimensional: se toman sus diámetros, sin rectificar.'
                        : 'Sin ajuste en Dimensional: el tubo se rectifica. Captura los diámetros calibrados.'}
                    </p>
                  )}
                  <div className="form-grid">
                    {field('dn_esp_a', 'Espiga A', t.limites.diametro, fromDimensional)}
                    {t.es_tuberia &&
                      field('dn_medio', 'Medio (1/2)', t.limites.diametro, fromDimensional)}
                    {field('dn_esp_b', 'Espiga B', t.limites.diametro, fromDimensional)}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Observaciones</legend>
                  <label>
                    Observaciones
                    <textarea
                      maxLength={2000}
                      value={form.observaciones}
                      onChange={(e) => set('observaciones', e.target.value)}
                    />
                  </label>
                  {!editing && (
                    <div className="form-grid">
                      <label>
                        Notificar no conformidad
                        <select
                          value={form.condicion_nueva}
                          disabled={t.tubo.cambio_pendiente}
                          onChange={(e) => set('condicion_nueva', e.target.value)}
                        >
                          <option value="">No</option>
                          {t.tubo.condicion !== 'PNC' && <option value="PNC">PNC</option>}
                          {t.tubo.condicion !== 'SCRAP' && <option value="SCRAP">Scrap</option>}
                        </select>
                        {t.tubo.cambio_pendiente && (
                          <small className="process-warning">
                            El tubo ya tiene una solicitud de cambio pendiente.
                          </small>
                        )}
                      </label>
                      {form.condicion_nueva && (
                        <label>
                          Motivo
                          <input
                            required
                            minLength={5}
                            maxLength={2000}
                            value={form.motivo_condicion}
                            onChange={(e) => set('motivo_condicion', e.target.value)}
                          />
                          <small>
                            Se enviará al supervisor de manufactura para validar el cambio de
                            condición.
                          </small>
                        </label>
                      )}
                    </div>
                  )}
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

                {outside > 0 && (
                  <p className="process-warning">
                    {outside} valor(es) fuera de tolerancia. Se guardará y se notificará al
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
                    {busy ? 'Guardando…' : editing ? 'Guardar corrección' : 'Guardar registro'}
                  </button>
                </div>
              </form>
            )}

            <section className="form-card">
              <h3>Calibrado y chaflanado del lote {t.lote.folio}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Fecha</th>
                      <th>BL A</th>
                      <th>BL B</th>
                      <th>Espiga A</th>
                      <th>Medio</th>
                      <th>Espiga B</th>
                      <th>Rectificado</th>
                      <th>Fuera</th>
                      <th>Operador / turno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data?.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setSerialInput(r.serial || '');
                              setSerial(r.serial || '');
                              setEditing(false);
                              setMessage([]);
                            }}
                          >
                            {r.serial}
                          </button>
                        </td>
                        <td>{new Date(r.creado_en).toLocaleString('es-MX')}</td>
                        <td>{fixed(r.bl_ext_a)}</td>
                        <td>{fixed(r.bl_ext_b)}</td>
                        <td>{fixed(r.dn_esp_a)}</td>
                        <td>{r.dn_medio === null ? '—' : fixed(r.dn_medio)}</td>
                        <td>{fixed(r.dn_esp_b)}</td>
                        <td>{r.rectificado ? 'Sí' : 'No'}</td>
                        <td className={r.fuera_tolerancia.length ? 'process-warning' : ''}>
                          {r.fuera_tolerancia.length}
                        </td>
                        <td>
                          {r.operador} / {r.turno}
                        </td>
                      </tr>
                    ))}
                    {history.data?.length === 0 && (
                      <tr>
                        <td colSpan={10}>Sin registros en este lote.</td>
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
