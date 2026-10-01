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
export function labelZpl(d: LabelData, c: LabelConfig, logo: string) {
  validateConfig(c);
  if (!/^\d{6}-\d+$/.test(d.serial))
    throw new Error('El serial no se puede representar en Code 39.');
  const w = Math.round(c.width * ({ 203: 8, 300: 12, 600: 24 }[c.dpi] || 8)),
    h = Math.round(c.height * ({ 203: 8, 300: 12, 600: 24 }[c.dpi] || 8)),
    x = (v: number) => Math.round(w * v),
    y = (v: number) => Math.round(h * v);
  const text = (px: number, py: number, value: unknown, size: number, width: number) => {
    const str = String(value ?? 'No aplica');
    const font = Math.min(y(size), Math.floor((x(width) / Math.max(1, str.length)) * 1.65));
    if (font < (c.dpi / 25.4) * 1.5)
      throw new Error('El texto no cabe con suficiente tamaño. Aumenta el tamaño de etiqueta.');
    return `^FO${x(px)},${y(py)}^A0N,${font},${Math.round(font * 0.58)}^FH_^FD${field(str)}^FS`;
  };
  // Code 39: narrow:wide 1:2, 12 modules per symbol, 1-module inter-character gap, 10-module quiet zones.
  const symbols = d.serial.length + 2,
    module = Math.floor(x(0.92) / (symbols * 13 - 1 + 20));
  if (module < 2) throw new Error('El código de barras no cabe. Aumenta el ancho o la resolución.');
  const barcodeWidth = (symbols * 13 - 1) * module;
  const date = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(d.creado_en));
  return (
    `^XA^CI28^PW${w}^LL${h}^LH0,0\n^FO${x(0.04)},${y(0.04)}${logo}^FS\n` +
    text(0.4, 0.06, d.serial, 0.07, 0.55) +
    text(0.4, 0.16, conditionName(d.condicion), 0.06, 0.55) +
    `\n^FO${Math.round((w - barcodeWidth) / 2)},${y(0.32)}^BY${module},2,${y(0.3)}^B3N,N,${y(0.3)},N,N^FD${d.serial}^FS\n` +
    text(0.04, 0.68, `DN: ${d.dn}`, 0.055, 0.29) +
    text(0.36, 0.68, `PN: ${d.pn}`, 0.055, 0.24) +
    text(0.64, 0.68, `SN: ${d.sn ?? 'N/A'}`, 0.055, 0.32) +
    text(0.04, 0.79, date, 0.043, 0.57) +
    text(0.67, 0.79, `${d.longitud_real} m`, 0.05, 0.29) +
    text(0.04, 0.89, d.operador, 0.047, 0.71) +
    text(0.78, 0.89, d.turno, 0.045, 0.18) +
    '\n^PQ1,0,1,N^XZ'
  );
}
export async function logoGraphic(c: LabelConfig) {
  const image = new Image();
  image.src = '/otek-logo.png';
  await image.decode();
  const width = Math.round(c.width * ({ 203: 8, 300: 12, 600: 24 }[c.dpi] || 8) * 0.28),
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
