# Etiquetas Winder — Zebra Browser Print

Referencia: ETIQUETA_ZEBRA.xlsx, hoja Etiqueta (A1:AB12). Serial K3, Code 39 B5, condición S2, DN E9, PN N9, SN W9; pie con fecha, operador, longitud y turno. El archivo no define dimensiones físicas ni resolución. El usuario confirmó posteriormente 104 × 54 mm y 203 dpi; no se ha probado salida física.

## Instalación
1. Obtener Browser Print para Windows y su JavaScript SDK desde https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html (formulario de Zebra).
2. Instalar Browser Print en cada puesto de captura y configurar la impresora USB/red compatible con ZPL.
3. Ejecutar `./CONFIGURAR_ZEBRA.ps1 -Biblioteca 'ruta/BrowserPrint-3.1.250.min.js'` con la biblioteca base oficial. No usar BrowserPrint-Zebra como sustituto de la biblioteca base. La biblioteca se sirve localmente, sin CDN.
4. Autorizar el origen de Winder en Accepted Hosts de Browser Print. Si el navegador pide acceso a la red local, permitirlo para este sitio.
5. En Winder, abrir Impresión de etiquetas, buscar y seleccionar la impresora, indicar ancho, alto y dpi reales. Guardar configuración.
6. Validar una etiqueta desde el detalle de un tubo existente, comprobar el tamaño, márgenes, legibilidad y lectura Code 39. Luego usar la impresión automática.

La plantilla admite ancho 70–104 mm, alto 40–150 mm y 203/300/600 dpi. Dimensiones fuera de esos rangos requieren adaptar el diseño. No se cambian temperatura, velocidad ni calibración de la impresora. Se envía una copia.

El backend proporciona datos persistidos, incluida fecha de creación; las reimpresiones conservan esa fecha. Longitud/condición reflejan cambios aprobados. ZPL usa Code 39 nativo y logo monocromático. Textos escapados en UTF-8; nunca se envían comandos introducidos en los nombres.

El tubo se confirma antes de imprimir. Fallar la impresión no revierte el registro ni solicita otro serial. Los registros devueltos como duplicados no se imprimen automáticamente. Las etiquetas pendientes se conservan en el navegador por usuario: no constituyen una cola global ni una confirmación física. Un envío aceptado se muestra como enviado, no como impreso. Ante timeout, comprobar salida antes de reintentar. La reimpresión también está disponible desde el detalle, incluso si se borran los datos del navegador.

## Backend
GET /api/v1/produccion/tuberia/registros/{id}/etiqueta requiere permiso PRODUCCION.TUBERIA.REGISTRAR y acceso a Producción. No modifica datos. No requiere migración.

Impresora confirmada por el usuario: Zebra ZT411. Configuración confirmada: etiqueta de 104 × 54 mm, 203 dpi (832 × 432 puntos). Máximo ancho imprimible 104 mm; conversión 8/12/24 puntos por mm según resolución.

