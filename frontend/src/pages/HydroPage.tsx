import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { num } from './dimensionalRules';
import { parseLabelCode } from '../printing/labelCode';
import './planning.css';
import './pipe-workstation.css';
import './dimensional.css';

const TURNOS = ['A 1ro', 'A 2do', 'B 1ro', 'B 2do', 'C 1ro', 'C 2do'];
const API = '/produccion/prueba-hidraulica';

type Prueba = {
  id: string;
  serial?: string;
  creado_en: string;
  operador: string;
  turno: string;
  presion: string;
  presion_requerida: string | null;
  unidad_presion: string;
  presion_baja: boolean;
  resultado: 'APROBADA' | 'RECHAZADA';
  comentarios: string | null;
  calibrado_previo: boolean;
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
  presion_requerida: string | null;
  unidad_presion: string;
  calibrado: boolean;
  prueba: Prueba | null;
  puede_editar: boolean;
  resumen: { condicion: string; piezas: number; metros: string }[];
};
type Form = Record<string, string>;
const emptyForm = (): Form => ({
  presion: '',
  resultado: '',
  comentarios: '',
  condicion_nueva: '',
  motivo_condicion: '',
  motivo_edicion: '',
});
const fixed = (v: unknown, d = 2) => (num(v) === null ? '—' : Number(v).toFixed(d));

export function HydroPage() {
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
    queryKey: ['hydro-supervisors'],
    queryFn: async () => (await api.get(`${API}/supervisores`)).data,
    enabled: can('PRODUCCION.PRUEBA_HIDRAULICA.REGISTRAR'),
  });
  const info = useQuery<TubeInfo>({
    queryKey: ['hydro-tube', serial],
    queryFn: async () => (await api.get(`${API}/tubos/${encodeURIComponent(serial)}`)).data,
    enabled: !!serial,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const t = info.data;
  const history = useQuery<(Prueba & { longitud_real: string; condicion: string })[]>({
    queryKey: ['hydro-history', t?.lote.id],
    queryFn: async () =>
      (await api.get(`${API}/pruebas`, { params: { lote_id: t?.lote.id } })).data,
    enabled: !!t?.lote.id,
  });

  // Presión sugerida: 2 × PN (como la aplicación anterior); el operador puede ajustarla.
  useEffect(() => {
    if (!t) return;
    const f = emptyForm();
    if (editing && t.prueba) {
      f.presion = String(Number(t.prueba.presion));
      f.resultado = t.prueba.resultado;
      f.comentarios = t.prueba.comentarios || '';
    } else if (t.presion_requerida !== null) {
      f.presion = String(Number(t.presion_requerida));
    }
    setForm(f);
    setConfirmed(false);
  }, [t, editing]);

  const set = (k: string, v: string) => {
    setForm((old) => ({ ...old, [k]: v }));
    setConfirmed(false);
  };
  const required = num(t?.presion_requerida);
  const pressure = num(form.presion);
  const pressureState =
    required === null || pressure === null ? 'neutral' : pressure >= required ? 'valid' : 'invalid';

  function lookup(e: FormEvent) {
    e.preventDefault();
    setMessage([]);
    setError('');
    setEditing(false);
    const next = parseLabelCode(serialInput)?.serial ?? serialInput.trim();
    setSerialInput(next);
    setSerial(next);
    void qc.invalidateQueries({ queryKey: ['hydro-tube', next] });
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
      presion: n('presion'),
      resultado: form.resultado,
      comentarios: n('comentarios'),
    };
    try {
      if (editing && t.prueba) {
        const { data } = await api.put(`${API}/pruebas/${t.prueba.id}`, {
          ...common,
          motivo_edicion: form.motivo_edicion,
        });
        reset([`Prueba del tubo ${t.tubo.serial} actualizada.`, ...data.avisos]);
      } else {
        const { data } = await api.post(`${API}/pruebas`, {
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
          `Prueba hidráulica del tubo ${t.tubo.serial} registrada: ${data.prueba.resultado}.`,
          ...data.avisos,
        ]);
      }
      void qc.invalidateQueries({ queryKey: ['hydro-history'] });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const ready = !!operator.trim() && !!supervisor && !!shift;
  const unit = t?.unidad_presion ?? 'bar';
  const showForm = !!t && (!t.prueba || editing);
  const rejected = form.resultado === 'RECHAZADA';

  return (
    <section className="planning pipe-workstation dimensional">
      <div className="module-hero">
        <p className="eyebrow">PRUEBA HIDRÁULICA</p>
        <h2>Prueba hidráulica</h2>
        <p>
          Escanea el tubo, aplica la presión de prueba (2 × PN) y registra el resultado. Una prueba
          rechazada o con presión menor a la requerida se guarda y se notifica al supervisor de
          manufactura.
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
                <dd>{fixed(t.tubo.longitud_real, 3)} m</dd>
              </div>
              <div>
                <dt>Presión requerida (2 × PN)</dt>
                <dd>
                  {t.presion_requerida === null
                    ? 'PN no numérico'
                    : `${fixed(t.presion_requerida)} ${unit}`}
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
                {t.resumen.map((r) => (
                  <tr key={r.condicion}>
                    <td>{r.condicion}</td>
                    <td>{r.piezas}</td>
                    <td>{fixed(r.metros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>

          <div className="pipe-main">
            {!t.calibrado && !t.prueba && (
              <p className="process-warning form-card">
                Este tubo no tiene registro de Calibrado y chaflanado. Puedes registrar la prueba,
                pero revisa que haya pasado por ese proceso.
              </p>
            )}
            {t.prueba && !editing && (
              <section className="form-card">
                <h3>Este tubo ya tiene prueba hidráulica</h3>
                <p>
                  {new Date(t.prueba.creado_en).toLocaleString('es-MX')} · {t.prueba.operador} ·{' '}
                  {t.prueba.turno} · Resultado: <b>{t.prueba.resultado}</b>
                </p>
                <p className={t.prueba.presion_baja ? 'process-warning' : ''}>
                  Presión {fixed(t.prueba.presion)} {t.prueba.unidad_presion}
                  {t.prueba.presion_requerida !== null &&
                    ` (requerida ${fixed(t.prueba.presion_requerida)})`}
                </p>
                {t.prueba.comentarios && <p>Comentarios: {t.prueba.comentarios}</p>}
                {t.puede_editar ? (
                  <button type="button" className="action" onClick={() => setEditing(true)}>
                    Editar prueba
                  </button>
                ) : (
                  <p>Solo el supervisor de manufactura o un administrador puede corregirla.</p>
                )}
              </section>
            )}

            {showForm && (
              <form className="form-card dimensional-form" onSubmit={save}>
                {editing && <p className="process-warning">Editando la prueba existente.</p>}
                <fieldset>
                  <legend>Registro de presión</legend>
                  <div className="form-grid">
                    <label className={`process-field process-${pressureState}`}>
                      Presión de prueba ({unit})
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        required
                        value={form.presion}
                        aria-invalid={pressureState === 'invalid'}
                        onChange={(e) => set('presion', e.target.value)}
                      />
                      <small>
                        {required === null
                          ? 'Sin presión requerida'
                          : pressureState === 'invalid'
                            ? `Menor a la requerida (${required} ${unit})`
                            : `Requerida ${required} ${unit}`}
                      </small>
                    </label>
                    <label>
                      Resultado
                      <select
                        required
                        value={form.resultado}
                        onChange={(e) => set('resultado', e.target.value)}
                      >
                        <option value="">Selecciona el resultado</option>
                        <option value="APROBADA">Aprobada (sin fugas ni defectos)</option>
                        <option value="RECHAZADA">Rechazada</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Defectos / comentarios{rejected ? ' (obligatorio si se rechaza)' : ''}
                    <textarea
                      required={rejected}
                      minLength={rejected ? 5 : undefined}
                      maxLength={2000}
                      value={form.comentarios}
                      onChange={(e) => set('comentarios', e.target.value)}
                    />
                  </label>
                </fieldset>

                {!editing && (
                  <fieldset>
                    <legend>No conformidad</legend>
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
                  </fieldset>
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

                {(rejected || pressureState === 'invalid') && (
                  <p className="process-warning">
                    Se guardará y se notificará al supervisor de manufactura.
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
                    {busy ? 'Guardando…' : editing ? 'Guardar corrección' : 'Guardar prueba'}
                  </button>
                </div>
              </form>
            )}

            <section className="form-card">
              <h3>Pruebas hidráulicas del lote {t.lote.folio}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Fecha</th>
                      <th>Longitud</th>
                      <th>Presión</th>
                      <th>Resultado</th>
                      <th>Comentarios</th>
                      <th>Operador / turno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data?.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setSerialInput(p.serial || '');
                              setSerial(p.serial || '');
                              setEditing(false);
                              setMessage([]);
                            }}
                          >
                            {p.serial}
                          </button>
                        </td>
                        <td>{new Date(p.creado_en).toLocaleString('es-MX')}</td>
                        <td>{fixed(p.longitud_real, 3)} m</td>
                        <td className={p.presion_baja ? 'process-warning' : ''}>
                          {fixed(p.presion)} {p.unidad_presion}
                        </td>
                        <td className={p.resultado === 'RECHAZADA' ? 'process-warning' : ''}>
                          {p.resultado}
                        </td>
                        <td>{p.comentarios || '—'}</td>
                        <td>
                          {p.operador} / {p.turno}
                        </td>
                      </tr>
                    ))}
                    {history.data?.length === 0 && (
                      <tr>
                        <td colSpan={7}>Sin pruebas en este lote.</td>
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
