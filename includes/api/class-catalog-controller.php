<?php
if (!defined('ABSPATH')) {
    exit;
}

class WP_Travel_Catalog_Controller extends WP_REST_Controller {

    public function register_routes() {

        register_rest_route('travel/v1', '/catalog/search', [
            'methods'  => WP_REST_Server::READABLE,
            'callback' => [$this, 'search'],
            'permission_callback' => [$this, 'permissions'],
        ]);

        register_rest_route('travel/v1', '/giav-mapping', [
            'methods'  => WP_REST_Server::READABLE,
            'callback' => [$this, 'get_mapping'],
            'permission_callback' => [$this, 'permissions'],
        ]);

        // Admin-only: create/update mapping. Validates against GIAV when mapping suppliers.
        register_rest_route('travel/v1', '/giav-mapping/upsert', [
            'methods'  => WP_REST_Server::CREATABLE,
            'callback' => [$this, 'upsert_mapping'],
            'permission_callback' => [$this, 'permissions_admin'],
            'args' => [
                'wp_object_type' => [ 'required' => true, 'type' => 'string' ],
                'wp_object_id'   => [ 'required' => true, 'type' => 'integer' ],
                'giav_entity_type' => [ 'required' => true, 'type' => 'string' ],
                'giav_entity_id' => [ 'required' => true, 'type' => 'string' ],
                'giav_supplier_id' => [ 'required' => false, 'type' => 'string' ],
                'status' => [ 'required' => false, 'type' => 'string', 'default' => 'active' ],
                'match_type' => [ 'required' => false, 'type' => 'string', 'default' => 'manual' ],
            ],
        ]);

        // Admin-only: batch upsert mappings (same GIAV supplier for multiple WP objects).
        register_rest_route('travel/v1', '/giav-mapping/batch-upsert', [
            'methods'  => WP_REST_Server::CREATABLE,
            'callback' => [$this, 'batch_upsert_mappings'],
            'permission_callback' => [$this, 'permissions_admin'],
        ]);

        // Admin-only: list WP objects with their current mapping (LEFT JOIN).
        register_rest_route('travel/v1', '/giav-mapping/list', [
            'methods'  => WP_REST_Server::READABLE,
            'callback' => [$this, 'list_mappings'],
            'permission_callback' => [$this, 'permissions_admin'],
            'args' => [
                'type' => [ 'required' => true, 'type' => 'string' ], // hotel | golf
                'q'    => [ 'required' => false, 'type' => 'string', 'default' => '' ],
                'limit'=> [ 'required' => false, 'type' => 'integer', 'default' => 50 ],
                'offset'=> [ 'required' => false, 'type' => 'integer', 'default' => 0 ],
            ],
        ]);
    }

    /**
     * Batch upsert mappings.
     *
     * Expects payload:
     * {
     *   giav_supplier_id: "123",
     *   wp_object_type: "hotel"|"course",
     *   items: [{ wp_object_id: 1 }, { wp_object_id: 2 }],
     *   status: "active" (optional),
     *   match_type: "batch" (optional)
     * }
     */
    public function batch_upsert_mappings( WP_REST_Request $req ) {
        wp_travel_giav_clear_rest_output();
        global $wpdb;

        $wp_object_type   = sanitize_text_field( $req->get_param('wp_object_type') );
        $giav_supplier_id = sanitize_text_field( $req->get_param('giav_supplier_id') );
        $items            = $req->get_param('items');
        $status           = sanitize_text_field( $req->get_param('status') ?? 'active' );
        $match_type       = sanitize_text_field( $req->get_param('match_type') ?? 'batch' );

        if ( $wp_object_type === '' ) {
            return new WP_Error('bad_request', 'wp_object_type es obligatorio', ['status' => 400]);
        }
        if ( ! in_array( $wp_object_type, ['hotel','course'], true ) ) {
            return new WP_Error('bad_request', 'wp_object_type inválido', ['status' => 400]);
        }
        $idProv = (int) $giav_supplier_id;
        if ( $idProv <= 0 ) {
            return new WP_Error('bad_request', 'giav_supplier_id debe ser un ID numérico', ['status' => 400]);
        }
        if ( ! is_array( $items ) || empty( $items ) ) {
            return new WP_Error('bad_request', 'items debe ser un array no vacío', ['status' => 400]);
        }
        if ( ! in_array( $status, ['active','needs_review','deprecated'], true ) ) {
            $status = 'active';
        }
        if ( ! in_array( $match_type, ['manual','suggested','imported','batch','auto_generic'], true ) ) {
            $match_type = 'batch';
        }

        // Validate supplier once against GIAV + get official name.
        $giav_supplier_name = null;
        if ( class_exists('WP_Travel_GIAV_Soap_Client') ) {
            $soap = new WP_Travel_GIAV_Soap_Client();
            $prov = $soap->proveedor_get( $idProv );
            if ( is_wp_error( $prov ) ) {
                return new WP_Error('giav_error', 'No se pudo validar el proveedor en GIAV: ' . $prov->get_error_message(), ['status' => 502]);
            }
            if ( ! is_object( $prov ) && ! is_array( $prov ) ) {
                return new WP_Error('not_found', 'Proveedor no encontrado en GIAV', ['status' => 404]);
            }
            if ( is_object( $prov ) ) {
                $alias = isset($prov->NombreAlias) ? (string) $prov->NombreAlias : '';
                $name  = isset($prov->Nombre) ? (string) $prov->Nombre : '';
            } else {
                $alias = isset($prov['NombreAlias']) ? (string) $prov['NombreAlias'] : '';
                $name  = isset($prov['Nombre']) ? (string) $prov['Nombre'] : '';
            }
            $giav_supplier_name = $alias !== '' ? $alias : ($name !== '' ? $name : null);
        }

        $table   = $wpdb->prefix . 'giav_mapping';
        $now     = current_time('mysql');
        $user_id = get_current_user_id();

        $results = [
            'ok' => true,
            'total' => count($items),
            'updated' => 0,
            'created' => 0,
            'errors' => [],
        ];

        foreach ( $items as $it ) {
            $wp_object_id = isset($it['wp_object_id']) ? (int) $it['wp_object_id'] : 0;
            if ( $wp_object_id <= 0 ) {
                $results['ok'] = false;
                $results['errors'][] = [ 'wp_object_id' => $wp_object_id, 'error' => 'wp_object_id inválido' ];
                continue;
            }

            $data = [
                'wp_object_type'     => $wp_object_type,
                'wp_object_id'       => $wp_object_id,
                'giav_entity_type'   => 'supplier',
                'giav_entity_id'     => (string) $idProv,
                'giav_supplier_id'   => (string) $idProv,
                'giav_supplier_name' => $giav_supplier_name,
                'status'             => $status,
                'match_type'         => $match_type,
                'updated_at'         => $now,
                'updated_by'         => $user_id,
            ];

            $existing_id = $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT id FROM {$table} WHERE wp_object_type = %s AND wp_object_id = %d LIMIT 1",
                    $wp_object_type,
                    $wp_object_id
                )
            );

            if ( $existing_id ) {
                $ok = $wpdb->update(
                    $table,
                    $data,
                    ['id' => (int) $existing_id],
                    ['%s','%d','%s','%s','%s','%s','%s','%s','%s','%d'],
                    ['%d']
                );
                if ( $ok === false ) {
                    $results['ok'] = false;
                    $results['errors'][] = [ 'wp_object_id' => $wp_object_id, 'error' => 'db_update_error' ];
                } else {
                    $results['updated']++;
                }
            } else {
                $ok = $wpdb->insert(
                    $table,
                    $data,
                    ['%s','%d','%s','%s','%s','%s','%s','%s','%s','%d']
                );
                if ( $ok === false ) {
                    $results['ok'] = false;
                    $results['errors'][] = [ 'wp_object_id' => $wp_object_id, 'error' => 'db_insert_error' ];
                } else {
                    $results['created']++;
                }
            }
        }

        return rest_ensure_response($results);
    }

    public function permissions() {
        return wp_travel_giav_rest_permission_response();
    }

    public function permissions_admin() {
        return wp_travel_giav_rest_permission_response();
    }

    /**
     * Buscar hoteles (CCT JetEngine) o campos de golf (CPT)
     */
    public function search(WP_REST_Request $req) {
        wp_travel_giav_clear_rest_output();
        global $wpdb;

        $type = sanitize_text_field($req->get_param('type'));
        $q    = sanitize_text_field($req->get_param('q') ?? '');

        if ($type === 'hotel') {
            // JetEngine CCT
            $table = $wpdb->prefix . 'jet_cct_hoteles';

            $sql = $wpdb->prepare(
    "SELECT _ID as id, nombre_hotel as title
     FROM {$table}
     WHERE nombre_hotel LIKE %s
     ORDER BY nombre_hotel ASC
     LIMIT 20",
    '%' . $wpdb->esc_like($q) . '%'
);


            $rows = $wpdb->get_results($sql, ARRAY_A);

            return rest_ensure_response(array_map(function ($r) {
                return [
                    'id'   => (int) $r['id'],
                    'title'=> $r['title'],
                    'type' => 'hotel',
                ];
            }, $rows));
        }

        if ($type === 'golf') {
            // CPT campos_de_golf
            $posts = get_posts([
                'post_type'      => 'campos_de_golf',
                's'              => $q,
                'posts_per_page' => 20,
                'post_status'    => 'publish',
            ]);

            return rest_ensure_response(array_map(function ($p) {
                return [
                    'id'    => $p->ID,
                    'title' => $p->post_title,
                    'type'  => 'course',
                ];
            }, $posts));
        }

        return new WP_Error('invalid_type', 'Tipo no soportado', ['status' => 400]);
    }

    /**
     * Mapeo GIAV
     */
    public function get_mapping(WP_REST_Request $req) {
        wp_travel_giav_clear_rest_output();
        global $wpdb;

        $wp_object_type = sanitize_text_field($req->get_param('wp_object_type'));
        $wp_object_id   = intval($req->get_param('wp_object_id'));

        $table = $wpdb->prefix . 'giav_mapping';

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT giav_entity_type, giav_entity_id, giav_supplier_id, giav_supplier_name, status
                 FROM {$table}
                 WHERE wp_object_type = %s AND wp_object_id = %d
                 LIMIT 1",
                $wp_object_type,
                $wp_object_id
            ),
            ARRAY_A
        );

        if (!$row) {
            // Provide a safe default supplier so the UI can show something actionable.
            return rest_ensure_response([
                'status' => 'needs_review',
                'giav_entity_type'   => 'supplier',
                'giav_entity_id'     => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                'giav_supplier_id'   => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                'giav_supplier_name' => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME,
                'match_type'         => 'auto_generic',
                'is_fallback'        => true,
            ]);
        }

        return rest_ensure_response($row);
    }

    /**
     * List WP catalog objects and their mapping row (if any).
     *
     * type=hotel -> JetEngine CCT (wp_jet_cct_hoteles)
     * type=golf  -> CPT campos_de_golf
     */
    public function list_mappings( WP_REST_Request $req ) {
        wp_travel_giav_clear_rest_output();
        global $wpdb;

        $type   = sanitize_text_field( (string) $req->get_param( 'type' ) );
        $q      = sanitize_text_field( (string) ( $req->get_param( 'q' ) ?? '' ) );
        $limit  = max( 1, min( 200, (int) $req->get_param( 'limit' ) ) );
        $offset = max( 0, (int) $req->get_param( 'offset' ) );

        $map_table = $wpdb->prefix . 'giav_mapping';

        if ( $type === 'hotel' ) {
            $cct_table = $wpdb->prefix . 'jet_cct_hoteles';
            $like      = '%' . $wpdb->esc_like( $q ) . '%';

            // LEFT JOIN so we can show missing mappings too.
            $sql = $wpdb->prepare(
    "SELECT h._ID AS wp_object_id,
            h.nombre_hotel AS title,
            m.giav_entity_type,
            m.giav_entity_id,
            m.giav_supplier_id,
            m.giav_supplier_name,
            m.status,
            m.match_type,
            m.updated_at
     FROM {$cct_table} h
     LEFT JOIN {$map_table} m
       ON m.wp_object_type = 'hotel'
      AND m.wp_object_id = h._ID
     WHERE h.nombre_hotel LIKE %s
     ORDER BY h.nombre_hotel ASC
     LIMIT %d OFFSET %d",
    $like,
    $limit,
    $offset
);


            $rows = $wpdb->get_results( $sql, ARRAY_A );
            $out  = array_map( function( $r ) {
                return [
                    'wp_object_type' => 'hotel',
                    'wp_object_id'   => (int) $r['wp_object_id'],
                    'title'          => (string) $r['title'],
                    'mapping'        => $r['giav_entity_id'] ? [
                        'giav_entity_type' => $r['giav_entity_type'],
                        'giav_entity_id'   => $r['giav_entity_id'],
                        'giav_supplier_id' => $r['giav_supplier_id'],
                        'giav_supplier_name' => $r['giav_supplier_name'] ?? null,
                        'status'           => $r['status'] ?: 'missing',
                        'match_type'       => $r['match_type'] ?: 'manual',
                        'updated_at'       => $r['updated_at'],
                    ] : [
                        'giav_entity_type'   => 'supplier',
                        'giav_entity_id'     => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                        'giav_supplier_id'   => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                        'giav_supplier_name' => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME,
                        'status'             => 'needs_review',
                        'match_type'         => 'auto_generic',
                        'is_fallback'        => true,
                    ],
                ];
            }, $rows );

            return rest_ensure_response( [
                'items'  => $out,
                'limit'  => $limit,
                'offset' => $offset,
            ] );
        }

        if ( $type === 'golf' ) {
            $like = '%' . $wpdb->esc_like( $q ) . '%';

            $sql = $wpdb->prepare(
    "SELECT p.ID AS wp_object_id,
            p.post_title AS title,
            m.giav_entity_type,
            m.giav_entity_id,
            m.giav_supplier_id,
            m.giav_supplier_name,
            m.status,
            m.match_type,
            m.updated_at
     FROM {$wpdb->posts} p
     LEFT JOIN {$map_table} m
       ON m.wp_object_type = 'course'
      AND m.wp_object_id = p.ID
     WHERE p.post_type = 'campos_de_golf'
       AND p.post_status = 'publish'
       AND p.post_title LIKE %s
     ORDER BY p.post_title ASC
     LIMIT %d OFFSET %d",
    $like,
    $limit,
    $offset
);


            $rows = $wpdb->get_results( $sql, ARRAY_A );
            $out  = array_map( function( $r ) {
                return [
                    'wp_object_type' => 'course',
                    'wp_object_id'   => (int) $r['wp_object_id'],
                    'title'          => (string) $r['title'],
                    'mapping'        => $r['giav_entity_id'] ? [
                        'giav_entity_type' => $r['giav_entity_type'],
                        'giav_entity_id'   => $r['giav_entity_id'],
                        'giav_supplier_id' => $r['giav_supplier_id'],
                        'giav_supplier_name' => $r['giav_supplier_name'] ?? null,
                        'status'           => $r['status'] ?: 'missing',
                        'match_type'       => $r['match_type'] ?: 'manual',
                        'updated_at'       => $r['updated_at'],
                    ] : [
                        'giav_entity_type'   => 'supplier',
                        'giav_entity_id'     => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                        'giav_supplier_id'   => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID,
                        'giav_supplier_name' => WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME,
                        'status'             => 'needs_review',
                        'match_type'         => 'auto_generic',
                        'is_fallback'        => true,
                    ],
                ];
            }, $rows );

            return rest_ensure_response( [
                'items'  => $out,
                'limit'  => $limit,
                'offset' => $offset,
            ] );
        }

        return new WP_Error( 'invalid_type', 'Tipo no soportado. Usa hotel o golf.', [ 'status' => 400 ] );
    }

    /**
     * Upsert mapping row (admin only).
     *
     * If giav_entity_type is 'supplier', we validate the supplier exists in GIAV via Proveedor_GET.
     */
    public function upsert_mapping(WP_REST_Request $req) {
        wp_travel_giav_clear_rest_output();
        global $wpdb;

    $wp_object_type   = sanitize_text_field($req->get_param('wp_object_type'));
    $wp_object_id     = (int) $req->get_param('wp_object_id');
    $giav_entity_type = sanitize_text_field($req->get_param('giav_entity_type'));
    $giav_entity_id   = sanitize_text_field($req->get_param('giav_entity_id'));
    $giav_supplier_id = sanitize_text_field($req->get_param('giav_supplier_id') ?? '');
    $status           = sanitize_text_field($req->get_param('status') ?? 'active');
    $match_type       = sanitize_text_field($req->get_param('match_type') ?? 'manual');

    // NEW: will be filled only for supplier mappings
    $giav_supplier_name = null;

    if ($wp_object_type === '' || $wp_object_id <= 0) {
        return new WP_Error('bad_request', 'WP object inválido', ['status' => 400]);
    }
    if (!in_array($giav_entity_type, ['supplier','service','product'], true)) {
        return new WP_Error('bad_request', 'giav_entity_type inválido', ['status' => 400]);
    }
    if ($giav_entity_id === '') {
        return new WP_Error('bad_request', 'giav_entity_id es obligatorio', ['status' => 400]);
    }
    if (!in_array($status, ['active','needs_review','deprecated'], true)) {
        return new WP_Error('bad_request', 'status inválido', ['status' => 400]);
    }
        if (!in_array($match_type, ['manual','suggested','imported','batch','auto_generic'], true)) {
        $match_type = 'manual';
    }

    // Validate supplier existence against GIAV + force status/name.
    if ($giav_entity_type === 'supplier') {
        $idProv = (int) $giav_entity_id;
        if ($idProv <= 0) {
            return new WP_Error('bad_request', 'giav_entity_id debe ser un ID numérico de proveedor', ['status' => 400]);
        }

        if (class_exists('WP_Travel_GIAV_Soap_Client')) {
            $soap = new WP_Travel_GIAV_Soap_Client();
            $prov = $soap->proveedor_get($idProv);

            if (is_wp_error($prov)) {
                return new WP_Error(
                    'giav_error',
                    'No se pudo validar el proveedor en GIAV: ' . $prov->get_error_message(),
                    ['status' => 502]
                );
            }

            // Depending on how the SOAP client returns: object/array.
            // We accept array or object; anything else = not found.
            if (!is_object($prov) && !is_array($prov)) {
                return new WP_Error('not_found', 'Proveedor no encontrado en GIAV', ['status' => 404]);
            }

            // Extract supplier name (prefer alias).
            if (is_object($prov)) {
                $alias = isset($prov->NombreAlias) ? (string) $prov->NombreAlias : '';
                $name  = isset($prov->Nombre) ? (string) $prov->Nombre : '';
            } else {
                $alias = isset($prov['NombreAlias']) ? (string) $prov['NombreAlias'] : '';
                $name  = isset($prov['Nombre']) ? (string) $prov['Nombre'] : '';
            }

            $giav_supplier_name = $alias !== '' ? $alias : ($name !== '' ? $name : null);
        }

        // Keep supplier id in both fields for convenience.
        if ($giav_supplier_id === '') {
            $giav_supplier_id = (string) $idProv;
        }

        // If this is an explicit auto-generic fallback, keep it as needs_review.
        // For real mappings (manual/batch/etc.) we can safely mark it active once validated.
        if ( $match_type === 'auto_generic' || $status === 'needs_review' ) {
            $status = 'needs_review';
        } else {
            $status = 'active';
        }
    }

    $table = $wpdb->prefix . 'giav_mapping';
    $now = current_time('mysql');
    $user_id = get_current_user_id();

    $data = [
        'wp_object_type'     => $wp_object_type,
        'wp_object_id'       => $wp_object_id,
        'giav_entity_type'   => $giav_entity_type,
        'giav_entity_id'     => $giav_entity_id,
        'giav_supplier_id'   => $giav_supplier_id !== '' ? $giav_supplier_id : null,
        'giav_supplier_name' => $giav_supplier_name, // NEW COLUMN
        'status'             => $status,
        'match_type'         => $match_type,
        'updated_at'         => $now,
        'updated_by'         => $user_id,
    ];

    // Upsert by unique (wp_object_type, wp_object_id)
    $existing_id = $wpdb->get_var(
        $wpdb->prepare(
            "SELECT id FROM {$table} WHERE wp_object_type = %s AND wp_object_id = %d LIMIT 1",
            $wp_object_type,
            $wp_object_id
        )
    );

    if ($existing_id) {
        $ok = $wpdb->update(
            $table,
            $data,
            ['id' => (int)$existing_id],
            // NOTE: format count must match $data count
            ['%s','%d','%s','%s','%s','%s','%s','%s','%s','%d'],
            ['%d']
        );
    } else {
        $ok = $wpdb->insert(
            $table,
            $data,
            // NOTE: format count must match $data count
            ['%s','%d','%s','%s','%s','%s','%s','%s','%s','%d']
        );
        $existing_id = $wpdb->insert_id;
    }

    if ($ok === false) {
        return new WP_Error('db_error', 'No se pudo guardar el mapeo', ['status' => 500]);
    }

    return rest_ensure_response([
        'id' => (int) $existing_id,
        'wp_object_type' => $wp_object_type,
        'wp_object_id' => $wp_object_id,
        'giav_entity_type' => $giav_entity_type,
        'giav_entity_id' => $giav_entity_id,
        'giav_supplier_id' => $giav_supplier_id,
        'giav_supplier_name' => $giav_supplier_name, // NEW
        'status' => $status,
        'match_type' => $match_type,
    ]);
}



}
