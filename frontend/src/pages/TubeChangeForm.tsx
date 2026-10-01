import { useState } from 'react';
import { api } from '../api/client';
import { errorText } from '../api/errors';
export function TubeChangeForm({
  tube,
}: {
  tube: { id: string; longitud_real: string; condicion: string };
}) {
  const [open, setOpen] = useState(false),
    [length, setLength] = useState(String(tube.longitud_real)),
    [condition, setCondition] = useState(tube.condicion),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="detail-note">
      <h4>Solicitar modificación</h4>
      <p>
        La longitud y la condición actuales se conservarán hasta la aprobación del supervisor de
        manufactura.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)}>Modificar longitud / condición</button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage('');
            try {
              await api.post(`/cambios-tubo/${tube.id}`, {
                longitud: Number(length),
                condicion: condition,
                motivo: reason,
              });
              setMessage(
                'Solicitud enviada al supervisor de manufactura. Pendiente de aprobación.',
              );
              setOpen(false);
            } catch (e) {
              setMessage(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                Nueva longitud (m)
                <input
                  required
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                />
              </label>
              <label>
                Nueva condición
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {['OK', 'DESPUNTE', 'ANILLO_QA', 'SCRAP', 'DECLASADO', 'PNC'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label>
                Motivo de la modificación
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="action" disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar a validación'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
