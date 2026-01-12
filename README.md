# WP Travel Proposals & GIAV — Solicitudes Gravity Forms

Este plugin ahora incluye un mini-CRM de **Solicitudes recibidas** que sincroniza entradas de Gravity Forms y permite convertirlas en propuestas sin asignar precios.

## 1. Flujo general

1. Activa Gravity Forms y configura los formularios ES / EN desde **Solicitudes (Gravity Forms)** en el menú del plugin.
2. Cada entrada se almacena en `wp_travel_giav_requests` con estado CRM, metadatos mapeados e intenciones.
3. La nueva sección del portal `gestion-reservas` permite monitorear solicitudes, cambiar estados, ver detalles e iniciar una propuesta.
4. La conversión genera una propuesta en estado `draft`, sin servicios ni precios, pero con intenciones almacenadas para el wizard.

## 2. Configuración de mapeo

Los siguientes campos canónicos pueden mapearse a IDs de Gravity Forms:

| Campo | Descripción |
| --- | --- |
| `package` | Nombre del paquete o tour preferido |
| `nombre`, `apellido` | Datos del cliente |
| `email`, `telefono` | Contacto |
| `fecha_llegada`, `fecha_regreso` | Fechas del viaje |
| `green_fees_per_player` | Green-fees solicitados por jugador |
| `jugadores`, `no_jugadores` | PAX estándar |
| `vuelos_checkbox`, `aeropuerto_salida` | Intención de vuelos |
| `mas_info` | Comentario libre |

La pantalla de configuración guarda:

- `wp_travel_giav_gf_forms` → { `es_form_id`, `en_form_id` }
- `wp_travel_giav_gf_map_{FORM_ID}` → mapeo campo/campo

## 3. Estados CRM

- `new` — Nueva entrada sin procesar  
- `contacted` — Se contactó al cliente  
- `quoting` — Se está cotizando internamente  
- `proposal_sent` — Propuesta enviada  
- `won` — Solicitud ganada/convertida  
- `lost` — Perdida o descartada  
- `archived` — Archivada (no visible en listados activos)

La UI del portal permite filtrar por estado y editarlo desde el detalle.

## 4. Portal de solicitudes

- Listado con filtros por estado, idioma y búsqueda.
- Detalle con resumen (jugadores, green-fees, vuelos, notas) y edición de estado/ notas.
- Botón para convertir la solicitud en propuesta y abrir el wizard.
- Banners en el wizard informan las intenciones detectadas (golf, vuelos, paquete, más info).

## 5. APIs principales

| Endpoint | Descripción |
| --- | --- |
| `GET /travel/v1/requests` | Listado con filtros `status`, `lang`, `form`, `q`, `page`, `per_page`. |
| `GET /travel/v1/requests/{id}` | Detalle con `mapped`, `intentions`, estado, `proposal` si existe. |
| `POST /travel/v1/requests/{id}/status` | Actualiza estado, notas y responsable. |
| `POST /travel/v1/requests/{id}/convert` | Crea propuesta draft (sin precios) y devuelve URL del wizard. |
| `GET /travel/v1/requests/mapping` | Lee IDs y mapeos guardados. |
| `POST /travel/v1/requests/mapping` | Actualiza IDs de formularios ES/EN. |
| `POST /travel/v1/requests/mapping/{form_id}` | Guarda mapeo de campos para un formulario. |

Todos los endpoints requieren la capacidad `manage_options` y que Gravity Forms esté activo. Si GF no está activo, la UI muestra un aviso y los endpoints devuelven errores 503 con mensaje claro.
