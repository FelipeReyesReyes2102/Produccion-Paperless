# Producción Paperless
Destino: https://github.com/FelipeReyesReyes2102/Produccion-Paperless

Interfaz Winder en frontend. Comparte API y PostgreSQL de Administración Paperless. No crear otra base ni duplicar usuarios.

Desarrollo: ejecutar npm ci y npm run dev desde frontend. Vite usa localhost:5174 y redirige /api y /uploads a 127.0.0.1:8001. Arrancar la API desde Administración Paperless y autorizar este origen.

Impresión: consultar IMPRESION_ZEBRA.md. CONFIGURAR_ZEBRA.ps1 instala la biblioteca oficial en frontend/public/vendor. El SDK oficial y la configuración de impresora no se incluyen. Impresión centralizada en servidor pendiente de implementación.

Estado: copia local separada; rama, comparación remota y publicación pendientes.
El alojamiento deberá redirigir /api y /uploads hacia la API compartida. Configuración definitiva pendiente del inventario y los dominios.
