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
export function labelZpl(d: LabelData, c: LabelConfig, logo: string) {
  validateConfig(c);
  if (!/^\d{6}-\d+$/.test(d.serial))
    throw new Error('El serial no se puede representar en Code 39.');
  const dots = { 203: 8, 300: 12, 600: 24 }[c.dpi] || 8;
  const w = Math.round(c.width * dots),
    h = Math.round(c.height * dots),
    x = (v: number) => Math.round(w * v),
    y = (v: number) => Math.round(h * v);
  const minFont = (c.dpi / 25.4) * 1.8; // ~1.8 mm de alto mínimo legible
  // Texto sin comprimir; se reduce solo si no cabe en el ancho disponible.
  const text = (px: number, py: number, value: unknown, size: number, avail: number) => {
    const str = String(value ?? 'No aplica');
    const font = Math.min(y(size), Math.floor(x(avail) / (Math.max(1, str.length) * CHAR)));
    if (font < minFont)
      throw new Error('El texto no cabe con suficiente tamaño. Aumenta el tamaño de etiqueta.');
    return `^FO${x(px)},${y(py)}^A0N,${font},${font}^FH_^FD${field(str)}^FS\n`;
  };
  const line = (py: number) =>
    `^FO${x(0.06)},${y(py)}^GB${x(0.9)},${Math.max(2, Math.round(dots / 4))},${Math.max(2, Math.round(dots / 4))}^FS\n`;
  // Condición en negativo (blanco sobre negro) para distinguir OK de despunte, anillo QA, etc.
  const condition = conditionName(d.condicion).toUpperCase();
  const condFont = Math.min(y(0.1), Math.floor(x(0.58) / (condition.length * CHAR)));
  const conditionBox =
    `^FO${x(0.35)},${y(0.235)}^GB${x(0.61)},${y(0.13)},${y(0.13)}^FS\n` +
    `^FO${x(0.37)},${y(0.235) + Math.round((y(0.13) - condFont) / 2) + 2}^A0N,${condFont},${condFont}^FR^FH_^FD${field(condition)}^FS\n`;
  // Code 39: narrow:wide 1:2, 12 modules per symbol, 1-module inter-character gap, 10-module quiet zones.
  const symbols = d.serial.length + 2,
    module = Math.floor(x(0.9) / (symbols * 13 - 1 + 20));
  if (module < 2) throw new Error('El código de barras no cabe. Aumenta el ancho o la resolución.');
  const barcodeWidth = (symbols * 13 - 1) * module;
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(d.creado_en));
  const length = Number(d.longitud_real);
  const meters = Number.isFinite(length) ? length.toFixed(3) : d.longitud_real;
  return (
    `^XA^CI28^PW${w}^LL${h}^LH0,0\n^FO${x(0.06)},${y(0.05)}${logo}^FS\n` +
    text(0.35, 0.05, d.serial, 0.16, 0.61) +
    conditionBox +
    line(0.395) +
    `^FO${Math.round((w - barcodeWidth) / 2)},${y(0.425)}^BY${module},2,${y(0.2)}^B3N,N,${y(0.2)},N,N^FD${d.serial}^FS\n` +
    line(0.645) +
    text(0.06, 0.675, `DN ${d.dn}`, 0.095, 0.29) +
    text(0.37, 0.675, `PN ${d.pn}`, 0.095, 0.28) +
    text(0.68, 0.675, `SN ${d.sn ?? 'N/A'}`, 0.095, 0.28) +
    text(0.06, 0.795, `${meters} m`, 0.105, 0.42) +
    text(0.52, 0.81, `Turno ${d.turno}`, 0.08, 0.44) +
    text(0.06, 0.905, `${date}  ${d.operador}`, 0.065, 0.9) +
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
