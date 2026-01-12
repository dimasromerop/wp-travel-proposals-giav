# WP Travel Proposals & GIAV — Solicitudes Gravity Forms

Este plugin ahora incluye un mini-CRM de **Solicitudes recibidas** que sincroniza entradas de Gravity Forms y permite convertirlas en propuestas sin asignar precios.

## 1. Flujo general

1. Activa Gravity Forms y configura los formularios ES / EN desde el nuevo submenú **Mapping Gravity Forms** (menú `Propuestas > Solicitudes recibidas`) para que el CRM pueda sincronizar entradas.
2. La pantalla **Solicitudes recibidas** (`admin.php?page=wp-travel-giav-requests`) actúa como listado CRM: filtros por estado/idioma, búsqueda, vista rápida y acciones para convertir o abrir la propuesta generada.
3. Cada entrada se registra en `wp_travel_giav_requests` con estado CRM, metadata mapeada, intenciones y el último `proposal_id` convertido.
4. Convertir siempre crea una nueva propuesta `draft` sin servicios ni precios. Se rellenan `first_name`/`last_name`, fechas, pax y las intenciones detectadas, y el wizard abre el draft recién creado.

## 2. Configuración de mapeo

La pantalla **Mapping Gravity Forms** permite registrar los `form_id` ES/EN y mapear cada campo del formulario a un campo canónico. El mapeo se mantiene por formulario (opciones `wp_travel_giav_gf_map_{FORM_ID}`) y los IDs de formularios se guardan en `wp_travel_giav_gf_forms`.

| Campo | Descripción |
| --- | --- |
| `package` | Nombre del paquete o tour preferido |
| `first_name`, `last_name` | Nombre y apellidos del cliente (se construyen a partir de los campos `nombre` / `apellido` si ya existen) |
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

- Listado con filtros por estado, idioma y búsqueda, mostrando cliente, fechas, pax e intenciones detectadas.
- Detalle con resumen (jugadores, green-fees, vuelos, notas), vista de estado CRM y botón para convertir a propuesta.
- Cada conversión genera una nueva propuesta sin precios; si ya hay una propuesta asociada, se refresca y se abre el wizard.
- Los banners del wizard informan las intenciones (golf, vuelos, paquete, más info) y ayudan al comercial a no olvidar servicios clave.

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

Cuando se llama a `POST /travel/v1/requests/{id}/convert` siempre se crea una propuesta nueva (`draft`) asociada a la solicitud, con `first_name`/`last_name`, fechas, pax e intenciones; no se reutiliza ninguna propuesta anterior ni se asignan precios desde los datos de la solicitud.
