import { useAuth } from '../auth/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { errorText } from '../api/errors';
import { discoverPrinters, sendLabel, type PrinterDevice } from './browserPrint';
import { validateConfig, type LabelConfig } from './label';
import './zebra-dialog.css';

// Modo "servidor": la API arma la etiqueta y la envía a la Zebra de la estación (sin instalar nada).
// Modo "local": respaldo con Zebra Browser Print instalado en este equipo (misma etiqueta del servidor).
type Mode = 'servidor' | 'local';
type Station = { mode: Mode; printerId: string; automatic: boolean; uid: string } & LabelConfig;
type ServerPrinter = {
  id: string;
  nombre: string;
  ubicacion: string | null;
  host: string;
  puerto: number;
};
type Pending = {
  tubo_id: string;
  trabajo_id: string;
  estado: 'ENVIADO' | 'NO_SALIO' | 'FALLIDO';
  error: string | null;
  serial: string;
  impresora: string;
};
type PrintDialog = {
  phase: 'printing' | 'confirm' | 'error';
  id: string;
  jobId?: string;
  serial?: string;
  printer?: string;
  message?: string;
};
const stationKey = 'paperless-estacion-impresion-v2';
const legacyKey = 'winder-zebra-config-v1';

function readStation(): Station {
  const base: Station = {
    mode: 'servidor',
    printerId: '',
    automatic: true,
    uid: '',
    width: 104,
    height: 54,
    dpi: 203,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(stationKey) || 'null');
    if (saved) return { ...base, ...saved };
    // Equipos ya configurados con Browser Print conservan ese modo hasta que se cambie.
    const legacy = JSON.parse(localStorage.getItem(legacyKey) || '{}');
    if (legacy.uid)
      return { ...base, mode: 'local', uid: legacy.uid, automatic: legacy.automatic !== false };
  } catch {
    /* configuración ilegible: se usan valores por defecto */
  }
  return base;
}

export function useZebra(userId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = !!user?.roles.includes('ADMINISTRADOR');
  const [station, setStation] = useState<Station>(readStation);
  const [devices, setDevices] = useState<PrinterDevice[]>([]),
    [status, setStatus] = useState(''),
    [working, setWorking] = useState(false),
    [dialog, setDialog] = useState<PrintDialog | null>(null),
    [check, setCheck] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (dialog?.phase !== 'printing') confirmRef.current?.focus();
  }, [dialog?.phase]);

  const printers = useQuery<ServerPrinter[]>({
    queryKey: ['impresoras'],
    queryFn: async () => (await api.get('/impresion/impresoras')).data,
  });
  const serverPending = useQuery<Pending[]>({
    queryKey: ['impresion-pendientes'],
    queryFn: async () => (await api.get('/impresion/pendientes')).data,
    enabled: station.mode === 'servidor',
    refetchInterval: 30000,
  });
  const printer = printers.data?.find((p) => p.id === station.printerId);

  // Pendientes del modo local (en este navegador).
  const pendingKey = `winder-labels-${userId}`;
  const [localPending, setLocalPending] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(pendingKey) || '[]');
    } catch {
      return [];
    }
  });
  const updateLocalPending = (id: string, remove = false) =>
    setLocalPending((old) => {
      const next = remove ? old.filter((x) => x !== id) : Array.from(new Set([...old, id]));
      try {
        localStorage.setItem(pendingKey, JSON.stringify(next));
      } catch {
        /* el historial permite reimprimir aunque el almacenamiento esté lleno */
      }
      return next;
    });

  const save = () => {
    if (!isAdmin) return;
    try {
      if (station.mode === 'servidor' && !station.printerId)
        throw new Error('Selecciona la impresora de esta estación.');
      if (station.mode === 'local') validateConfig(station);
      localStorage.setItem(stationKey, JSON.stringify(station));
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
  const testServerPrinter = async () => {
    if (!station.printerId) return;
    setCheck('Consultando…');
    try {
      const { data } = await api.get(`/impresion/impresoras/${station.printerId}/estado`);
      setCheck(
        data.lista
          ? 'Conectada y lista para imprimir.'
          : `${data.conectada ? 'Conectada, pero' : 'Sin conexión:'} ${data.problemas.join('; ')}`,
      );
    } catch (e) {
      setCheck(errorText(e));
    }
  };

  const printServer = async (id: string) => {
    if (!station.printerId)
      throw new Error(
        'Solicita al administrador asignar la impresora de esta estación (Configuración Zebra).',
      );
    const { data } = await api.post('/impresion/etiquetas', {
      tubo_id: id,
      impresora_id: station.printerId,
    });
    setStatus(`Etiqueta ${data.serial} enviada a ${data.impresora}. Confirma la salida física.`);
    setDialog({
      phase: 'confirm',
      id,
      jobId: data.trabajo_id,
      serial: data.serial,
      printer: data.impresora,
    });
  };
  const printLocal = async (id: string) => {
    updateLocalPending(id);
    validateConfig(station);
    if (!station.uid)
      throw new Error(
        'Solicita al administrador configurar la impresora desde Configuración Zebra.',
      );
    const list = devices.length ? devices : await discoverPrinters();
    const device = list.find((x) => x.uid === station.uid);
    if (!device)
      throw new Error(
        'La impresora seleccionada no está disponible en Browser Print. Revisa la configuración.',
      );
    const { data } = await api.get<{ serial: string; zpl: string }>(
      `/impresion/etiquetas/${id}/zpl`,
      {
        params: { ancho_mm: station.width, alto_mm: station.height, dpi: station.dpi },
      },
    );
    setDialog({ phase: 'printing', id, serial: data.serial, printer: device.name });
    await sendLabel(device, data.zpl);
    setStatus(`Etiqueta ${data.serial} enviada a ${device.name}. Confirma la salida física.`);
    setDialog({ phase: 'confirm', id, serial: data.serial, printer: device.name });
  };

  const print = async (id: string) => {
    if (lock.current) {
      setStatus('Hay un envío en curso. Espera a que termine.');
      return;
    }
    lock.current = true;
    setWorking(true);
    setDialog({
      phase: 'printing',
      id,
      printer: station.mode === 'servidor' ? printer?.nombre : undefined,
    });
    try {
      await (station.mode === 'servidor' ? printServer(id) : printLocal(id));
    } catch (e) {
      const message = e instanceof Error && !('isAxiosError' in e) ? e.message : errorText(e);
      setStatus(`Tubo guardado. Etiqueta pendiente: ${message}`);
      setDialog({ phase: 'error', id, message });
    } finally {
      lock.current = false;
      setWorking(false);
      void qc.invalidateQueries({ queryKey: ['impresion-pendientes'] });
    }
  };
  const confirmJob = async (jobId: string | undefined, salio: boolean) => {
    if (!jobId) return;
    try {
      await api.post(`/impresion/trabajos/${jobId}/confirmar`, { salio });
    } catch {
      /* ya confirmado desde otro equipo: no impide continuar */
    }
    void qc.invalidateQueries({ queryKey: ['impresion-pendientes'] });
  };
  const confirmPrinted = async () => {
    if (!dialog) return;
    if (station.mode === 'servidor') await confirmJob(dialog.jobId, true);
    else updateLocalPending(dialog.id, true);
    setStatus(`Etiqueta ${dialog.serial ?? ''} confirmada.`);
    setDialog(null);
  };
  const reprint = async () => {
    if (!dialog) return;
    if (station.mode === 'servidor') await confirmJob(dialog.jobId, false);
    await print(dialog.id);
  };
  const leavePending = () => {
    setStatus('La etiqueta quedó en pendientes por verificar. Puedes reimprimirla desde ahí.');
    setDialog(null);
  };
  const afterRegister = async (id: string, duplicate: boolean) => {
    if (duplicate) {
      if (station.mode === 'local') updateLocalPending(id);
      setStatus('El tubo ya estaba guardado. Revisa si la etiqueta salió antes de reimprimir.');
      return;
    }
    if (station.automatic) await print(id);
    else {
      if (station.mode === 'local') updateLocalPending(id);
      setStatus(
        'Tubo guardado. Impresión automática desactivada: imprime la etiqueta desde el detalle.',
      );
    }
  };

  const set = (patch: Partial<Station>) => setStation((s) => ({ ...s, ...patch }));
  const configuration = isAdmin ? (
    <section className="form-card zebra-panel">
      <h3>Impresión de etiquetas de esta estación</h3>
      <div className="form-grid">
        <label>
          Modo de impresión
          <select value={station.mode} onChange={(e) => set({ mode: e.target.value as Mode })}>
            <option value="servidor">Desde el servidor (recomendado, sin instalar nada)</option>
            <option value="local">Browser Print en este equipo (respaldo)</option>
          </select>
        </label>
        {station.mode === 'servidor' ? (
          <label>
            Impresora de la estación
            <select
              value={station.printerId}
              onChange={(e) => {
                set({ printerId: e.target.value });
                setCheck('');
              }}
            >
              <option value="">Selecciona una impresora</option>
              {printers.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.ubicacion ? ` · ${p.ubicacion}` : ''} ({p.host})
                </option>
              ))}
            </select>
            {printers.isSuccess && !printers.data.length && (
              <small>No hay impresoras. Dalas de alta en Administración → Impresoras.</small>
            )}
          </label>
        ) : (
          <>
            <label>
              Impresora (Browser Print)
              <select value={station.uid} onChange={(e) => set({ uid: e.target.value })}>
                <option value="">Selecciona una impresora</option>
                {station.uid && !devices.some((x) => x.uid === station.uid) && (
                  <option value={station.uid}>Impresora guardada · buscar para verificar</option>
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
                value={station.width || ''}
                onChange={(e) => set({ width: Number(e.target.value) })}
              />
            </label>
            <label>
              Alto de etiqueta (mm)
              <input
                type="number"
                min={40}
                max={150}
                value={station.height || ''}
                onChange={(e) => set({ height: Number(e.target.value) })}
              />
            </label>
            <label>
              Resolución
              <select value={station.dpi} onChange={(e) => set({ dpi: Number(e.target.value) })}>
                {[203, 300, 600].map((v) => (
                  <option key={v} value={v}>
                    {v} dpi
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          <input
            type="checkbox"
            checked={station.automatic}
            onChange={(e) => set({ automatic: e.target.checked })}
          />{' '}
          Imprimir al registrar cada tubo
        </label>
      </div>
      <div className="zebra-config-actions">
        {station.mode === 'servidor' && (
          <button
            type="button"
            disabled={!station.printerId}
            onClick={() => void testServerPrinter()}
          >
            Probar conexión
          </button>
        )}
        <button type="button" onClick={save}>
          Guardar configuración
        </button>
      </div>
      {check && <p role="status">{check}</p>}
      {station.mode === 'local' && (
        <p>
          Requiere Zebra Browser Print instalado y este sitio autorizado en Accepted Hosts.{' '}
          <a
            href="https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
            target="_blank"
            rel="noreferrer"
          >
            Descarga oficial
          </a>
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  ) : null;

  const pendingList =
    station.mode === 'servidor'
      ? (serverPending.data ?? []).map((p) => ({
          id: p.tubo_id,
          label: `${p.serial} · ${p.impresora} · ${
            p.estado === 'FALLIDO'
              ? `falló: ${p.error}`
              : p.estado === 'NO_SALIO'
                ? 'no salió'
                : 'sin confirmar'
          }`,
          jobId: p.estado === 'ENVIADO' ? p.trabajo_id : undefined,
        }))
      : localPending.map((id, i) => ({
          id,
          label: `Etiqueta pendiente ${i + 1} · ${id.slice(0, 8)}`,
          jobId: 'local',
        }));
  const panel =
    status || pendingList.length > 0 ? (
      <section className="form-card zebra-panel">
        <h3>Estado de impresión</h3>
        <p className="zebra-hint">
          {station.mode === 'servidor'
            ? `Impresora de la estación: ${printer?.nombre ?? 'sin asignar'}`
            : 'Impresión local con Browser Print'}
        </p>
        {status && <p role="status">{status}</p>}
        {pendingList.length > 0 && (
          <details>
            <summary>Etiquetas pendientes / por verificar ({pendingList.length})</summary>
            <p>Si un envío no respondió, comprueba la salida física antes de reintentar.</p>
            {pendingList.map((p) => (
              <div key={p.id}>
                <span>{p.label} </span>
                <button disabled={working} onClick={() => void print(p.id)}>
                  Imprimir / reintentar
                </button>
                {p.jobId && (
                  <button
                    disabled={working}
                    onClick={() =>
                      p.jobId === 'local'
                        ? updateLocalPending(p.id, true)
                        : void confirmJob(p.jobId, true)
                    }
                  >
                    Ya verifiqué la etiqueta
                  </button>
                )}
              </div>
            ))}
          </details>
        )}
      </section>
    ) : null;

  const dialogView = dialog ? (
    <div className="zebra-overlay">
      <div
        className={`zebra-dialog zebra-phase-${dialog.phase}`}
        role={dialog.phase === 'printing' ? 'status' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="zebra-dialog-title"
      >
        {dialog.phase === 'printing' && (
          <>
            <div className="zebra-spinner" aria-hidden="true" />
            <h3 id="zebra-dialog-title">Imprimiendo etiqueta…</h3>
            <p>
              {dialog.printer
                ? `Enviando ${dialog.serial ?? 'la etiqueta'} a ${dialog.printer}.`
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
              Revisa en la impresora {dialog.printer} que la etiqueta salió completa, legible y con
              el serial correcto.
            </p>
            <div className="zebra-actions">
              <button type="button" onClick={leavePending}>
                Revisar después
              </button>
              <button type="button" onClick={() => void reprint()}>
                No salió · Reimprimir
              </button>
              <button
                type="button"
                className="zebra-primary"
                ref={confirmRef}
                onClick={() => void confirmPrinted()}
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
