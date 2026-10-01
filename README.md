# Producción Paperless (Winder)

Interfaz de planta de O-tek Paperless para el proceso Winder (TypeScript, React 19, Vite 7).
No tiene backend propio: consume la API y la base PostgreSQL de
[Administración Paperless](https://github.com/FelipeReyesReyes2102/Administracion-Paperless).
No crear otra base ni duplicar usuarios, órdenes, lotes o tubos.

## Funcionalidad

- Registro de tubos con parámetros de proceso comparados con el setup asignado a la orden
  (verde dentro de rango, rojo fuera de rango).
- Supervisor y turno, avance del lote y sublotes.
- Serial `AAMMDD-consecutivo` (día productivo cambia a las 07:00); el número de tubo y el
  serial son conceptos distintos.
- Solicitudes de cambio de longitud o condición, con motivo y aprobación del supervisor de
  manufactura (se resuelven en Administración).
- Etiquetas Zebra (ver abajo).

Acceso a Winder: roles OPERARIO, ADMINISTRADOR, SUPERVISOR y SUPERVISOR_MANUFACTURA.

## Desarrollo local

Desde `frontend/`: `npm ci` y `npm run dev` (http://localhost:5174). Vite redirige `/api` y
`/uploads` a 127.0.0.1:8001: arrancar antes la API de Administración Paperless y autorizar
este origen en su `ALLOWED_ORIGINS`.

## Calidad

- Formato: `npm run format` (Prettier); comprobación: `npm run format:check`.
- Compilación con verificación de tipos: `npm run build`.

El commit de formato está en `.git-blame-ignore-revs`; para que `git blame` lo omita:
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Impresión

Implementación actual: Zebra Browser Print local en cada puesto (ZT411, 203 dpi, etiqueta
104 × 54 mm). Detalles en [IMPRESION_ZEBRA.md](IMPRESION_ZEBRA.md).
La biblioteca oficial de Zebra no se incluye en el repositorio: se instala en
`frontend/public/vendor` con `CONFIGURAR_ZEBRA.ps1`. Sin ella la impresión no funciona.
**No se ha verificado impresión física.** La impresión centralizada desde el servidor no está
implementada.

## Despliegue

Se despliega con Docker Compose en el servidor interno de O-tek, junto con Administración;
el sitio redirige `/api` y `/uploads` a la API compartida. La configuración, los secretos y
los procedimientos de despliegue se mantienen fuera de este repositorio.
