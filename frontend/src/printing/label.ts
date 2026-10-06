export type LabelData = {
  id: string;
  serial: string;
  condicion: string;
  dn: string;
  pn: string;
  sn: string | null;
  creado_en: string;
  operador: string;
  longitud_real: string;
  turno: string;
  lote?: string;
  orden?: string;
  producto?: string;
  numero_pipe?: number;
  // Contenido del QR generado por la API (formato OTEK1, ver IMPRESION_ZEBRA.md).
  codigo_qr?: string;
};
export type LabelConfig = { width: number; height: number; dpi: number };
export const conditionName = (s: string) =>
  ({
    ANILLO_QA: 'Anillo QA',
    DESPUNTE: 'Despunte',
    DECLASADO: 'Declasado',
    SCRAP: 'Scrap',
    OK: 'OK',
    PNC: 'PNC',
  })[s] || s;
export function validateConfig(c: LabelConfig) {
  if (
    !Number.isFinite(c.width) ||
    !Number.isFinite(c.height) ||
    c.width < 70 ||
    c.width > 104 ||
    c.height < 40 ||
    c.height > 150 ||
    ![203, 300, 600].includes(c.dpi)
  )
    throw new Error('Configura ancho (70–104 mm), alto (40–150 mm) y resolución de la etiqueta.');
}
// Encode all bytes so user data cannot introduce ZPL commands or field separators.
export const field = (value: unknown) =>
  Array.from(new TextEncoder().encode(String(value ?? 'No aplica')))
    .map((b) => '_' + b.toString(16).padStart(2, '0'))
    .join('');
// Ancho medio aproximado de un carácter de la fuente 0 de Zebra respecto a su alto (con ancho = alto).
const CHAR = 0.62;
// Capacidad alfanumérica de QR con corrección M por versión (1..10); módulos = 17 + 4·versión.
const QR_M_ALNUM = [20, 38, 61, 90, 122, 154, 178, 221, 262, 311];
const QR_ALNUM = /^[0-9A-Z $%*+\-./:]+$/;
export function qrModules(payload: string) {
  const version = QR_M_ALNUM.findIndex((cap) => payload.length <= cap) + 1;
  if (!version) throw new Error('El contenido del QR es demasiado largo.');
  return 17 + 4 * version;
}
export function labelZpl(d: LabelData, c: LabelConfig, logo: string) {
  validateConfig(c);
  if (!/^\d{6}-\d+$/.test(d.serial)) throw new Error('Serial con formato inesperado.');
  const payload = d.codigo_qr || d.serial;
  // Solo caracteres alfanuméricos de QR: nunca llegan ^ ni ~ (comandos ZPL) dentro del código.
  if (!QR_ALNUM.test(payload)) throw new Error('El contenido del QR tiene caracteres no válidos.');
  const dots = { 203: 8, 300: 12, 600: 24 }[c.dpi] || 8;
  const w = Math.round(c.width * dots),
    h = Math.round(c.height * dots),
    x = (v: number) => Math.round(w * v),
    y = (v: number) => Math.round(h * v);
  const minFont = (c.dpi / 25.4) * 1.8; // ~1.8 mm de alto mínimo legible
  // Texto sin comprimir; se reduce solo si no cabe en el ancho disponible (en puntos).
  const textAt = (px: number, py: number, value: unknown, size: number, avail: number) => {
    const str = String(value ?? 'No aplica');
    const font = Math.min(y(size), Math.floor(avail / (Math.max(1, str.length) * CHAR)));
    if (font < minFont)
      throw new Error('El texto no cabe con suficiente tamaño. Aumenta el tamaño de etiqueta.');
    return `^FO${px},${y(py)}^A0N,${font},${font}^FH_^FD${field(str)}^FS\n`;
  };
  const stroke = Math.max(2, Math.round(dots / 4));
  const line = (py: number) => `^FO${x(0.06)},${y(py)}^GB${x(0.9)},${stroke},${stroke}^FS\n`;
  // Condición en negativo (blanco sobre negro) para distinguir OK de despunte, anillo QA, etc.
  const condition = conditionName(d.condicion).toUpperCase();
  const condFont = Math.min(y(0.09), Math.floor(x(0.58) / (condition.length * CHAR)));
  const conditionBox =
    `^FO${x(0.35)},${y(0.21)}^GB${x(0.61)},${y(0.11)},${y(0.11)}^FS\n` +
    `^FO${x(0.37)},${y(0.21) + Math.round((y(0.11) - condFont) / 2) + 2}^A0N,${condFont},${condFont}^FR^FH_^FD${field(condition)}^FS\n`;
  // QR: módulos de al menos 0.5 mm para lectores 2D de planta.
  const modules = qrModules(payload);
  const qrBox = Math.min(y(0.475), x(0.3));
  const mag = Math.min(10, Math.floor(qrBox / modules));
  if (mag < Math.ceil(dots / 2))
    throw new Error('El código QR no cabe con buena lectura. Aumenta el tamaño de etiqueta.');
  const qrSize = modules * mag;
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(d.creado_en));
  const length = Number(d.longitud_real);
  const meters = Number.isFinite(length) ? length.toFixed(3) : d.longitud_real;
  // Bloque de datos a la derecha del QR.
  const x0 = x(0.06) + qrSize + x(0.035),
    avail = x(0.96) - x0,
    col = Math.floor(avail / 3);
  return (
    `^XA^CI28^PW${w}^LL${h}^LH0,0\n^FO${x(0.06)},${y(0.04)}${logo}^FS\n` +
    textAt(x(0.35), 0.03, d.serial, 0.15, x(0.61)) +
    conditionBox +
    line(0.345) +
    `^FO${x(0.06)},${y(0.375)}^BQN,2,${mag}^FDMA,${payload}^FS\n` +
    textAt(x0, 0.39, `DN ${d.dn}`, 0.085, col - 8) +
    textAt(x0 + col, 0.39, `PN ${d.pn}`, 0.085, col - 8) +
    textAt(x0 + 2 * col, 0.39, `SN ${d.sn ?? 'N/A'}`, 0.085, col - 8) +
    textAt(x0, 0.515, `${meters} m`, 0.13, Math.floor(avail * 0.58)) +
    textAt(x0 + Math.floor(avail * 0.6), 0.545, `Turno ${d.turno}`, 0.08, Math.floor(avail * 0.4)) +
    textAt(x0, 0.68, date, 0.065, avail) +
    textAt(x0, 0.765, d.operador, 0.065, avail) +
    '^PQ1,0,1,N^XZ'
  );
}
export async function logoGraphic(c: LabelConfig) {
  const image = new Image();
  image.src = '/otek-logo.png';
  await image.decode();
  const width = Math.round(c.width * ({ 203: 8, 300: 12, 600: 24 }[c.dpi] || 8) * 0.26),
    height = Math.round((width * image.height) / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data,
    rowBytes = Math.ceil(width / 8);
  let hex = '';
  for (let y = 0; y < height; y++)
    for (let bx = 0; bx < rowBytes; bx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = bx * 8 + bit,
          i = (y * width + x) * 4;
        if (x < width && (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 190) byte |= 128 >> bit;
      }
      hex += byte.toString(16).padStart(2, '0');
    }
  return `^GFA,${rowBytes * height},${rowBytes * height},${rowBytes},${hex}`;
}
