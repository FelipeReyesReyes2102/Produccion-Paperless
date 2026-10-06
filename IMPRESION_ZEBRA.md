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


## Código QR de la etiqueta (formato OTEK1)

Desde octubre de 2026 la etiqueta lleva un QR en lugar del Code 39. La API de Administración genera su contenido (`codigo_qr` en `GET /api/v1/produccion/tuberia/registros/{id}/etiqueta`, función `app.services.label_code.codificar`). Producción solo lo imprime; no lo arma.

Ejemplo:

```
OTEK1/SER:260930-06/LOT:L-01-1026/ORD:OP-5E147A3EDD724CAF/PRO:TUBERIA/DN:900/PN:10/SN:NA/CON:DESPUNTE/LON:0.200/PIP:6/FEC:20260930
```

| Clave | Dato |
|---|---|
| SER | Serial del tubo (AAMMDD-consecutivo) |
| LOT | Folio del lote |
| ORD | Folio de la orden de producción |
| PRO | Tipo de producto (TUBERIA, COPLE) |
| DN, PN, SN | Diámetro, presión y rigidez nominales (`NA` si no aplica) |
| CON | Condición (`ANILLO_QA` se escribe `ANILLO-QA`) |
| LON | Longitud real en metros, 3 decimales |
| PIP | Número de tubo |
| FEC | Fecha de registro AAAAMMDD (hora de México) |

Reglas para cualquier sistema que lo lea:

- Comprobar que empieza con `OTEK1`. Si no, tratar el texto como un serial simple (etiquetas Code 39 anteriores).
- Separar por `/` y cada campo por el primer `:`. Ignorar las claves desconocidas: versiones futuras pueden agregar campos.
- Usar `SER` para consultar el tubo en la API. El registro del servidor es la fuente de verdad. Los demás campos sirven para autollenado y para avisar si la etiqueta está desactualizada (por ejemplo, después de un cambio de longitud aprobado). En ese caso, reimprimir.
- Lectores de referencia: `app.services.label_code.decodificar` (Python) y `frontend/src/printing/labelCode.ts` (Producción).

Solo se usan caracteres del modo alfanumérico de QR (`0-9 A-Z espacio $ % * + - . / :`). Así el código es más pequeño y nunca contiene `^` ni `~`. Se imprime con corrección M y módulos de 5 puntos (0.6 mm a 203 dpi), unos 23 × 23 mm.

Lectores en planta: se necesita un lector 2D (de imagen). Los lectores láser 1D no leen QR. Configurarlo con la misma distribución de teclado que Windows (si no, `-`, `/` y `:` llegan cambiados) y con Enter al final. En Dimensional se escanea el QR en el campo "Serial del tubo".
