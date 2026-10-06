// Lectura del QR de la etiqueta (formato OTEK1). Espejo de backend/app/services/label_code.py.
// El servidor sigue siendo la fuente de verdad: el serial se usa para consultar el tubo y el
// resto de campos solo para autollenado y para detectar etiquetas desactualizadas.
export type LabelCode = {
  serial: string;
  lote?: string | null;
  orden?: string | null;
  producto?: string | null;
  dn?: string | null;
  pn?: string | null;
  sn?: string | null;
  condicion?: string | null;
  longitud?: string | null;
  numero_pipe?: string | null;
  fecha?: string | null;
};
const KEYS: Record<string, keyof LabelCode> = {
  SER: 'serial',
  LOT: 'lote',
  ORD: 'orden',
  PRO: 'producto',
  DN: 'dn',
  PN: 'pn',
  SN: 'sn',
  CON: 'condicion',
  LON: 'longitud',
  PIP: 'numero_pipe',
  FEC: 'fecha',
};
const CONDITIONS = ['OK', 'DESPUNTE', 'ANILLO_QA', 'SCRAP', 'DECLASADO', 'PNC', 'CORTADO', 'CAÑON'];
const clean = (v: string) =>
  v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/_/g, '-');

/** Devuelve los datos del QR, o null si el texto no es un código OTEK1 (p. ej. un serial simple). */
export function parseLabelCode(text: string): LabelCode | null {
  const parts = text.trim().split('/');
  if (parts[0]?.toUpperCase() !== 'OTEK1') return null;
  const data: Record<string, string | null> = {};
  for (const part of parts.slice(1)) {
    const i = part.indexOf(':');
    const key = KEYS[part.slice(0, i).toUpperCase()];
    if (i > 0 && key) data[key] = part.slice(i + 1) === 'NA' ? null : part.slice(i + 1);
  }
  if (!data.serial) return null;
  if (data.condicion)
    data.condicion = CONDITIONS.find((c) => clean(c) === data.condicion) ?? data.condicion;
  return data as unknown as LabelCode;
}

/** Serial a consultar, tanto si se escaneó el QR como si se escribió el serial a mano. */
export const serialFromScan = (text: string) => parseLabelCode(text)?.serial ?? text.trim();
