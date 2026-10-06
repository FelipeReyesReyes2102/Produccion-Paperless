import { useAuth } from '../auth/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { discoverPrinters, sendLabel, type PrinterDevice } from './browserPrint';
import { labelZpl, logoGraphic, validateConfig, type LabelConfig, type LabelData } from './label';
import './zebra-dialog.css';
type PrintDialog = {
  phase: 'printing' | 'confirm' | 'error';
  id: string;
  serial?: string;
  printer?: string;
  message?: string;
};
const key = 'winder-zebra-config-v1';
const profile = 'ZT411-104x54-203';
function readConfig() {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}
export function useZebra(userId: string) {
  const { user } = useAuth();
  const isAdmin = !!user?.roles.includes('ADMINISTRADOR');
  const initial = readConfig();
  const [config, setConfig] = useState<LabelConfig>({
    width: initial.profile === profile ? Number(initial.width) || 104 : 104,
    height: initial.profile === profile ? Number(initial.height) || 54 : 54,
    dpi: initial.profile === profile ? Number(initial.dpi) || 203 : 203,
  });
  const [uid, setUid] = useState<string>(initial.uid || ''),
    [automatic, setAutomatic] = useState(initial.automatic !== false),
    [devices, setDevices] = useState<PrinterDevice[]>([]),
    [status, setStatus] = useState(''),
    [working, setWorking] = useState(false),
    [dialog, setDialog] = useState<PrintDialog | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (dialog?.phase !== 'printing') confirmRef.current?.focus();
  }, [dialog?.phase]);
  const lock = useRef(false);
  const pendingKey = `winder-labels-${userId}`;
  const [pending, setPending] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(pendingKey) || '[]');
    } catch {
      return [];
    }
  });
  const updatePending = (id: string, remove = false) =>
    setPending((old) => {
      const next = remove ? old.filter((x) => x !== id) : Array.from(new Set([...old, id]));
      try {
        localStorage.setItem(pendingKey, JSON.stringify(next));
      } catch {
        /* History still permits reprinting if browser storage is full. */
      }
      return next;
    });
  const save = () => {
    if (!isAdmin) return;
    try {
      validateConfig(config);
      localStorage.setItem(key, JSON.stringify({ ...config, uid, automatic, profile }));
      setStatus('Configuración guardada para este equipo.');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };
  const discover = async () => {
    if (!isAdmin) return;
    setWorking(true);
    try {
      const list = await discoverPrinters();
      setDevices(list);
      setStatus(
        list.length ? 'Selecciona la impresora Zebra.' : 'Browser Print no encontró impresoras.',
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  const print = async (id: string) => {
    updatePending(id);
    if (lock.current) {
      setStatus('Hay un envío en curso. La etiqueta quedó pendiente.');
      return;
    }
    lock.current = true;
    setWorking(true);
    setDialog({ phase: 'printing', id });
    try {
      validateConfig(config);
      if (!uid)
        throw new Error(
          'Solicita al administrador configurar la impresora desde el menú Configuración Zebra.',
        );
      const list = devices.length ? devices : await discoverPrinters();
      const device = list.find((x) => x.uid === uid);
      if (!device)
        throw new Error(
          'La impresora seleccionada no está disponible. Solicita al administrador verificar la configuración Zebra.',
        );
      const { data } = await api.get<LabelData>(`/produccion/tuberia/registros/${id}/etiqueta`);
      setDialog({ phase: 'printing', id, serial: data.serial, printer: device.name });
      const zpl = labelZpl(data, config, await logoGraphic(config));
      await sendLabel(device, zpl);
      // Queda pendiente hasta que el operador confirme la salida física.
      setStatus(`Etiqueta ${data.serial} enviada a ${device.name}. Confirma la salida física.`);
      setDialog({ phase: 'confirm', id, serial: data.serial, printer: device.name });
    } catch (e) {
      setStatus(`Tubo guardado. Etiqueta pendiente: ${(e as Error).message}`);
      setDialog({ phase: 'error', id, message: (e as Error).message });
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };
  const confirmPrinted = () => {
    if (!dialog) return;
    updatePending(dialog.id, true);
    setStatus(`Etiqueta ${dialog.serial ?? ''} confirmada.`);
    setDialog(null);
  };
  const leavePending = () => {
    setStatus('La etiqueta quedó en pendientes por verificar. Puedes reimprimirla desde ahí.');
    setDialog(null);
  };
  const afterRegister = async (id: string, duplicate: boolean) => {
    if (duplicate) {
      updatePending(id);
      setStatus('El tubo ya estaba guardado. Revisa si la etiqueta salió antes de reimprimir.');
      return;
    }
    if (automatic) await print(id);
    else {
      updatePending(id);
      setStatus('Tubo guardado. Impresión automática desactivada; etiqueta pendiente.');
    }
  };
  const configuration = isAdmin ? (
    <section className="form-card zebra-panel">
      <h3>Impresión de etiquetas · Zebra Browser Print</h3>
      <p>
        Zebra ZT411 · Etiqueta de 104 × 54 mm · 203 dpi. Una etiqueta por tubo guardado. Selecciona
        tu impresora y guarda la configuración.
      </p>
      <div className="form-grid">
        <label>
          Impresora
          <select value={uid} onChange={(e) => setUid(e.target.value)}>
            <option value="">Selecciona una impresora</option>
            {uid && !devices.some((x) => x.uid === uid) && (
              <option value={uid}>Impresora guardada · buscar para verificar</option>
            )}
            {devices.map((d) => (
              <option key={d.uid} value={d.uid}>
                {d.name} ({d.connection})
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={working} onClick={() => void discover()}>
          Buscar impresoras
        </button>
        <label>
          Ancho de etiqueta (mm)
          <input
            type="number"
            min={70}
            max={104}
            value={config.width || ''}
            onChange={(e) => setConfig({ ...config, width: Number(e.target.value) })}
          />
        </label>
        <label>
          Alto de etiqueta (mm)
          <input
            type="number"
            min={40}
            max={150}
            value={config.height || ''}
            onChange={(e) => setConfig({ ...config, height: Number(e.target.value) })}
          />
        </label>
        <label>
          Resolución
          <select
            value={config.dpi}
            onChange={(e) => setConfig({ ...config, dpi: Number(e.target.value) })}
          >
            {[203, 300, 600].map((v) => (
              <option key={v} value={v}>
                {v} dpi
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={automatic}
            onChange={(e) => setAutomatic(e.target.checked)}
          />{' '}
          Imprimir al registrar cada tubo
        </label>
      </div>
      <button type="button" onClick={save}>
        Guardar configuración
      </button>
      <p>
        Instala Browser Print en este equipo, agrega la impresora y permite el sitio de Winder en
        Accepted Hosts.{' '}
        <a
          href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
          target="_blank"
          rel="noreferrer"
        >
          Descarga oficial
        </a>
      </p>
      {status && <p role="status">{status}</p>}
    </section>
  ) : null;
  const panel =
    status || pending.length > 0 ? (
      <section className="form-card zebra-panel">
        <h3>Estado de impresión</h3>
        {status && <p role="status">{status}</p>}
        {pending.length > 0 && (
          <details>
            <summary>Etiquetas pendientes / por verificar ({pending.length})</summary>
            <p>Si un envío no respondió, comprueba la salida física antes de reintentar.</p>
            {pending.map((id, i) => (
              <div key={id}>
                <span>
                  Etiqueta pendiente {i + 1} · {id.slice(0, 8)}{' '}
                </span>
                <button disabled={working} onClick={() => void print(id)}>
                  Imprimir / reintentar
                </button>
                <button disabled={working} onClick={() => updatePending(id, true)}>
                  Ya verifiqué la etiqueta
                </button>
              </div>
            ))}
          </details>
        )}
      </section>
    ) : null;
  const dialogView = dialog ? (
    <div className="zebra-overlay">
      <div
        className={`zebra-dialog zebra-${dialog.phase}`}
        role={dialog.phase === 'printing' ? 'status' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="zebra-dialog-title"
      >
        {dialog.phase === 'printing' && (
          <>
            <div className="zebra-spinner" aria-hidden="true" />
            <h3 id="zebra-dialog-title">Imprimiendo etiqueta…</h3>
            <p>
              {dialog.serial
                ? `Enviando ${dialog.serial} a ${dialog.printer}.`
                : 'Preparando la etiqueta y buscando la impresora.'}
            </p>
            <p className="zebra-hint">No cierres esta ventana.</p>
          </>
        )}
        {dialog.phase === 'confirm' && (
          <>
            <h3 id="zebra-dialog-title">¿Salió bien la etiqueta?</h3>
            <p className="zebra-serial">{dialog.serial}</p>
            <p>
              Revisa en la impresora que la etiqueta salió completa, legible y con el serial
              correcto.
            </p>
            <div className="zebra-actions">
              <button type="button" onClick={leavePending}>
                Revisar después
              </button>
              <button type="button" onClick={() => void print(dialog.id)}>
                No salió · Reimprimir
              </button>
              <button
                type="button"
                className="zebra-primary"
                ref={confirmRef}
                onClick={confirmPrinted}
              >
                Sí, salió bien
              </button>
            </div>
          </>
        )}
        {dialog.phase === 'error' && (
          <>
            <h3 id="zebra-dialog-title">No se pudo imprimir</h3>
            <p className="zebra-error">{dialog.message}</p>
            <p>El tubo ya está guardado; la etiqueta queda pendiente.</p>
            <div className="zebra-actions">
              <button type="button" onClick={leavePending}>
                Cerrar
              </button>
              <button
                type="button"
                className="zebra-primary"
                ref={confirmRef}
                onClick={() => void print(dialog.id)}
              >
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;
  return { configuration, panel, dialog: dialogView, afterRegister, print, working };
}
