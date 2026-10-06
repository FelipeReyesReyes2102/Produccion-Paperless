// La etiqueta (ZPL con QR OTEK1) la genera el servidor: app/services/zpl.py en Administración.
// Aquí solo quedan las medidas usadas por el modo local de respaldo (Browser Print).
export type LabelConfig = { width: number; height: number; dpi: number };
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
