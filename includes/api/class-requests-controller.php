<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Requests_Controller extends WP_Travel_REST_Controller {

    protected $namespace = 'travel/v1';
    protected $rest_base = 'requests';

    public function register_routes() {
        register_rest_route( $this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'list_requests' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_request' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)/status', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'callback'            => [ $this, 'update_request_status' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)/convert', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'convert_request' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/mapping', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_mapping_config' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'save_mapping_config' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/mapping/(?P<form_id>\d+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_form_mapping' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'save_form_mapping' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );
    }

    public function list_requests( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $form_param = $request->get_param( 'form' );
        $form_ids = $this->get_target_form_ids( $form_param );
        foreach ( $form_ids as $form_id ) {
            wp_travel_giav_gf_sync_form_entries( $form_id );
        }

        $repo = new WP_Travel_Request_Repository();
        $response = $repo->list_requests( [
            'status'   => sanitize_text_field( (string) $request->get_param( 'status' ) ),
            'lang'     => sanitize_text_field( (string) $request->get_param( 'lang' ) ),
            'form_id'  => absint( $request->get_param( 'form_id' ) ),
            'search'   => sanitize_text_field( (string) $request->get_param( 'q' ) ),
            'page'     => max( 1, (int) $request->get_param( 'page' ) ),
            'per_page' => max( 1, min( 100, (int) $request->get_param( 'per_page' ) ?: 20 ) ),
        ] );

        $proposal_map = [];
        $proposal_ids = array_values(
            array_filter(
                array_map(
                    static fn( $item ) => $item['proposal_id'] ?? 0,
                    $response['items'] ?? []
                )
            )
        );
        if ( $proposal_ids ) {
            $proposal_repo = new WP_Travel_Proposal_Repository();
            $proposals = $proposal_repo->get_by_ids( $proposal_ids );
            foreach ( $proposals as $proposal ) {
                $proposal_map[ (int) $proposal['id'] ] = $this->build_request_proposal_summary( $proposal );
            }
        }

        $total_pages = (int) ceil( $response['total'] / max( 1, $response['per_page'] ) );

        foreach ( $response['items'] as &$item ) { // phpcs:ignore WordPress.NamingConventions.ValidVariableName.VariableNotSnakeCase
            if ( ! empty( $item['proposal_id'] ) && isset( $proposal_map[ (int) $item['proposal_id'] ] ) ) {
                $item['proposal'] = $proposal_map[ (int) $item['proposal_id'] ];
            } else {
                $item['proposal'] = null;
            }
        }
        unset( $item );

        return $this->response( [
            'items'       => $response['items'],
            'total'       => $response['total'],
            'page'        => $response['page'],
            'per_page'    => $response['per_page'],
            'total_pages' => $total_pages,
        ] );
    }

    public function get_request( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $repo = new WP_Travel_Request_Repository();
        $item = $repo->get_by_id( (int) $request['id'] );
        if ( ! $item ) {
            return $this->error( 'Solicitud no encontrada.', 404 );
        }

        if ( empty( $item['meta'] ) ) {
            $meta = wp_travel_giav_gf_refresh_request_meta( $item );
            if ( $meta ) {
                $repo->update_meta( $item['id'], $meta );
                $item['meta'] = $meta;
                $item['mapped'] = $meta['mapped'] ?? [];
                $item['intentions'] = $meta['intentions'] ?? [];
                $item['raw'] = $meta['raw'] ?? [];
            }
        }

        $proposal_data = null;
        if ( $item['proposal_id'] ) {
            $proposal_repo = new WP_Travel_Proposal_Repository();
            $proposal = $proposal_repo->get_by_id( (int) $item['proposal_id'] );
            if ( $proposal ) {
                $proposal_data = [
                    'id'         => $proposal['id'],
                    'proposal'   => $proposal,
                    'public_url' => $proposal['proposal_token']
                        ? wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] )
                        : '',
                ];
            }
        }

        return $this->response( [
            'request'  => $item,
            'proposal' => $proposal_data,
        ] );
    }

    public function update_request_status( WP_REST_Request $request ) {
        $data = $request->get_json_params();
        $status = sanitize_key( (string) ( $data['status'] ?? '' ) );
        if ( ! in_array( $status, WP_TRAVEL_GIAV_REQUEST_STATUSES, true ) ) {
            return $this->error( 'Estado inválido.', 400 );
        }

        $notes = isset( $data['notes'] ) ? sanitize_textarea_field( $data['notes'] ) : null;
        $assigned_to = isset( $data['assigned_to'] ) ? absint( $data['assigned_to'] ) : null;

        $repo = new WP_Travel_Request_Repository();
        $updated = $repo->update_status( (int) $request['id'], $status, $notes, $assigned_to );

        if ( ! $updated ) {
            return $this->error( 'No se pudo actualizar el estado.', 500 );
        }

        $item = $repo->get_by_id( (int) $request['id'] );
        if ( ! $item ) {
            return $this->response( [] );
        }
        return $this->response( $repo->hydrate_request_row( $item ) );
    }

    public function convert_request( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $repo = new WP_Travel_Request_Repository();
        $item = $repo->get_by_id( (int) $request['id'] );
        if ( ! $item ) {
            return $this->error( 'Solicitud no encontrada.', 404 );
        }

        $meta = $item['meta'];
        if ( empty( $meta ) ) {
            $meta = wp_travel_giav_gf_refresh_request_meta( $item );
            if ( $meta ) {
                $repo->update_meta( $item['id'], $meta );
            }
        }

        $mapped = $meta['mapped'] ?? [];
        if ( empty( $mapped ) ) {
            return $this->error( 'No hay datos mapeados para convertir la solicitud.', 422 );
        }

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $proposal_data = $this->build_proposal_payload( $item, $meta );
        $proposal_id = $proposal_repo->create( $proposal_data );

        $version_repo = new WP_Travel_Proposal_Version_Repository();
        $version_number = $version_repo->get_next_version_number( $proposal_id );
        $public_token = wp_generate_password( 32, false );
        $snapshot = [
            'header' => [
                'proposal_title'     => $proposal_data['proposal_title'],
                'customer_name'      => $proposal_data['customer_name'],
                'first_name'         => $proposal_data['first_name'] ?? '',
                'last_name'          => $proposal_data['last_name'] ?? '',
                'customer_email'     => $proposal_data['customer_email'],
                'customer_language'  => $proposal_data['customer_language'],
                'start_date'         => $proposal_data['start_date'],
                'end_date'           => $proposal_data['end_date'],
                'pax_total'          => $proposal_data['pax_total'],
                'players_count'      => $proposal_data['players_count'],
                'currency'           => $proposal_data['currency'],
            ],
            'items' => [],
            'intentions' => $meta['intentions'] ?? [],
        ];

        $version_id = $version_repo->create_version( [
            'proposal_id'       => $proposal_id,
            'version_number'    => $version_number,
            'json_snapshot'     => wp_json_encode( $snapshot ),
            'totals_cost_net'   => 0,
            'totals_sell_price' => 0,
            'totals_margin_abs' => 0,
            'totals_margin_pct' => 0,
            'public_token'      => $public_token,
        ] );

        $proposal_repo->set_current_version( $proposal_id, $version_id );
        $repo->assign_proposal( $item['id'], $proposal_id );

        $redirect = $this->build_wizard_url( $proposal_id );

        return $this->response( [
            'proposal_id' => $proposal_id,
            'redirect_url' => $redirect,
        ], 201 );
    }

    public function get_mapping_config() {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $config = wp_travel_giav_gf_get_forms_config();
        $forms = array_filter( [
            'es' => absint( $config['es_form_id'] ),
            'en' => absint( $config['en_form_id'] ),
        ] );

        $fields = [];
        $mappings = [];
        foreach ( $forms as $lang => $form_id ) {
            $fields[ $form_id ] = wp_travel_giav_gf_get_form_fields( $form_id );
            $mappings[ $form_id ] = wp_travel_giav_gf_get_mapping_for_form( $form_id );
        }

        return $this->response( [
            'forms'    => $config,
            'fields'   => $fields,
            'mappings' => $mappings,
        ] );
    }

    public function save_mapping_config( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $data = $request->get_json_params();
        $es = absint( $data['es_form_id'] ?? 0 );
        $en = absint( $data['en_form_id'] ?? 0 );

        wp_travel_giav_gf_update_forms_config( [ 'es_form_id' => $es, 'en_form_id' => $en ] );

        return $this->response( [
            'forms' => wp_travel_giav_gf_get_forms_config(),
        ] );
    }

    public function get_form_mapping( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $form_id = absint( $request['form_id'] );
        if ( ! $form_id ) {
            return $this->error( 'Formulario inválido.', 400 );
        }

        return $this->response( [
            'form_id' => $form_id,
            'fields'  => wp_travel_giav_gf_get_form_fields( $form_id ),
            'mapping' => wp_travel_giav_gf_get_mapping_for_form( $form_id ),
        ] );
    }

    public function save_form_mapping( WP_REST_Request $request ) {
        if ( ! wp_travel_giav_gf_is_active() ) {
            return $this->error( 'Gravity Forms no está activo.', 503 );
        }

        $form_id = absint( $request['form_id'] );
        if ( ! $form_id ) {
            return $this->error( 'Formulario inválido.', 400 );
        }

        $data = $request->get_json_params();
        $mapping = [];
        foreach ( wp_travel_giav_gf_get_canonical_fields() as $field ) {
            if ( isset( $data[ $field ] ) ) {
                $mapping[ $field ] = absint( $data[ $field ] );
            }
        }

        wp_travel_giav_gf_update_mapping_for_form( $form_id, $mapping );

        return $this->response( [
            'form_id' => $form_id,
            'mapping' => $mapping,
        ] );
    }

    private function get_target_form_ids( ?string $form_param ): array {
        $config = wp_travel_giav_gf_get_forms_config();
        $form = trim( (string) $form_param );
        $ids = [];
        $es = absint( $config['es_form_id'] );
        $en = absint( $config['en_form_id'] );

        if ( $form === 'es' && $es ) {
            $ids[] = $es;
        } elseif ( $form === 'en' && $en ) {
            $ids[] = $en;
        } elseif ( ctype_digit( $form ) ) {
            $ids[] = absint( $form );
        } else {
            if ( $es ) {
                $ids[] = $es;
            }
            if ( $en ) {
                $ids[] = $en;
            }
        }

        return array_values( array_unique( array_filter( $ids ) ) );
    }

    private function build_request_proposal_summary( array $proposal ): array {
        $public_url = '';
        if ( ! empty( $proposal['proposal_token'] ) ) {
            $public_url = wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] );
        }

        return [
            'id'            => (int) $proposal['id'],
            'status'        => $proposal['status'] ?? '',
            'proposal_title'=> $proposal['proposal_title'] ?? '',
            'first_name'    => $proposal['first_name'] ?? '',
            'last_name'     => $proposal['last_name'] ?? '',
            'customer_name' => $proposal['customer_name'] ?? '',
            'public_url'    => $public_url,
        ];
    }

    private function build_proposal_payload( array $request, array $meta ): array {
        $mapped = $meta['mapped'] ?? [];
        $intentions = $meta['intentions'] ?? [];
        $first_name = sanitize_text_field( $mapped['first_name'] ?? '' );
        $last_name = sanitize_text_field( $mapped['last_name'] ?? '' );
        $name = trim( $first_name . ' ' . $last_name );
        if ( $name === '' ) {
            $name = sprintf( 'Solicitud #%d', $request['entry_id'] );
        }

        $start_date = sanitize_text_field( $mapped['fecha_llegada'] ?? '' );
        $end_date   = sanitize_text_field( $mapped['fecha_regreso'] ?? '' );
        $now        = current_time( 'Y-m-d' );
        if ( $start_date === '' ) {
            $start_date = $now;
        }
        if ( $end_date === '' ) {
            $end_date = $start_date;
        }

        return [
            'first_name'       => $first_name,
            'last_name'        => $last_name,
            'customer_name'    => $name,
            'customer_email'   => sanitize_email( $mapped['email'] ?? '' ),
            'customer_country' => '',
            'customer_language'=> sanitize_key( $request['lang'] ?? 'es' ),
            'start_date'       => $start_date,
            'end_date'         => $end_date,
            'pax_total'        => max( 1, absint( $mapped['pax_total'] ?? 1 ) ),
            'players_count'    => max( 0, absint( $mapped['jugadores'] ?? 0 ) ),
            'currency'         => 'EUR',
            'proposal_title'   => sanitize_text_field( $mapped['package'] ?: 'Solicitud #' . $request['entry_id'] ),
            'source_type'      => 'gravityforms',
            'source_form_id'   => (int) $request['form_id'],
            'source_entry_id'  => (int) $request['entry_id'],
            'source_request_id'=> (int) $request['id'],
            'source_meta_json' => wp_json_encode( [
                'mapped'     => $mapped,
                'intentions' => $intentions,
            ] ),
        ];
    }

    private function build_wizard_url( int $proposal_id ): string {
        $base = site_url( '/' . WP_TRAVEL_GIAV_PORTAL_SLUG );
        $slug = rtrim( $base, '/' ) . '#/propuesta/' . $proposal_id . '/editar';
        return $slug;
    }
}
