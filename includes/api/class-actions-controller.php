<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Actions_Controller extends WP_Travel_REST_Controller {

    protected $namespace = 'travel/v1';

    public function register_routes() {

        register_rest_route( $this->namespace, '/proposals/(?P<id>\d+)/send', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'send_proposal' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/proposals/(?P<id>\d+)/accept', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'accept_proposal_admin' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/proposals/(?P<id>\d+)/giav-retry', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'retry_giav_sync' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/proposals/public/(?P<token>[a-zA-Z0-9]+)/accept', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'accept_proposal_public' ],
                'permission_callback' => '__return_true', // público (token)
            ],
        ] );

        register_rest_route( $this->namespace, '/versions/(?P<id>\d+)/confirm', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'confirm_version' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/versions/(?P<id>\d+)/giav-preflight', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'giav_preflight' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );
    }
    
    public function send_proposal( WP_REST_Request $request ) {

        $proposal_id = (int) $request['id'];

        // Prevent critical actions when DB schema is incomplete or migrations failed
        if ( function_exists( 'wp_travel_giav_db_check' ) ) {
            $dbcheck = wp_travel_giav_db_check();
            $migration_failed = get_option( 'wp_travel_giav_migration_failed', false );
            if ( $migration_failed ) {
                return $this->error( 'DB migration previously failed; contact administrator', 503 );
            }
            if ( empty( $dbcheck['healthy'] ) ) {
                return $this->error( 'DB schema incomplete: ' . implode( ', ', $dbcheck['missing'] ), 503 );
            }
        }

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();
        $audit_repo    = new WP_Travel_Audit_Log_Repository();

        $proposal = $proposal_repo->get_by_id( $proposal_id );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        if ( ! $proposal_repo->is_editable( $proposal ) ) {
            return $this->error( 'Proposal cannot be sent in current status' );
        }

        // Snapshot viene ya calculado desde frontend/backend previo
        $snapshot = $request->get_param( 'snapshot' );
        if ( empty( $snapshot ) || ! is_array( $snapshot ) ) {
            return $this->error( 'Snapshot is required' );
        }

        $version_number = (int) $request->get_param( 'version_number' );

        $resolved = WP_Travel_GIAV_Snapshot_Resolver::resolve_snapshot(
            $snapshot,
            [
                'proposal_id'    => $proposal_id,
                'version_number' => $version_number,
            ]
        );

        if ( ! empty( $resolved['errors'] ) ) {
            return new WP_Error(
                'wp_travel_snapshot_invalid',
                'Snapshot validation failed',
                [
                    'status'    => 422,
                    'errors'    => $resolved['errors'],
                    'preflight' => $resolved['preflight'],
                ]
            );
        }

        $snapshot = $resolved['snapshot'];
        $header = isset( $snapshot['header'] ) && is_array( $snapshot['header'] ) ? $snapshot['header'] : [];
        if ( ! empty( $header ) ) {
            $proposal_repo->update_from_snapshot_header( $proposal_id, $header );
        }
        $totals = isset( $snapshot['totals'] ) && is_array( $snapshot['totals'] ) ? $snapshot['totals'] : [];
        $public_token = wp_generate_password( 32, false );

        $version_id = $version_repo->create_version( [
            'proposal_id'       => $proposal_id,
            'version_number'    => $version_number,
            'json_snapshot'     => wp_json_encode( $snapshot ),
            'totals_cost_net'   => isset( $totals['totals_cost_net'] ) ? (float) $totals['totals_cost_net'] : 0,
            'totals_sell_price' => isset( $totals['totals_sell_price'] ) ? (float) $totals['totals_sell_price'] : 0,
            'totals_margin_abs' => isset( $totals['totals_margin_abs'] ) ? (float) $totals['totals_margin_abs'] : 0,
            'totals_margin_pct' => isset( $totals['totals_margin_pct'] ) ? (float) $totals['totals_margin_pct'] : 0,
            'template_id'       => isset( $snapshot['template_id'] ) ? $snapshot['template_id'] : null,
            'terms_version'     => isset( $snapshot['terms_version'] ) ? $snapshot['terms_version'] : null,
            'public_token'      => $public_token,
        ] );

        $item_repo = new WP_Travel_Proposal_Item_Repository();
        if ( ! empty( $snapshot['items'] ) && is_array( $snapshot['items'] ) ) {
            foreach ( $snapshot['items'] as $item ) {
                $item_repo->add_item( WP_Travel_GIAV_Snapshot_Resolver::build_item_row( $version_id, $item ) );
            }
        }

        $this->log_snapshot_resolution( $proposal_id, $version_id, $resolved['logs'] );

        $proposal_repo->update_status( $proposal_id, 'sent' );
        $proposal_repo->set_current_version( $proposal_id, $version_id );

        $audit_repo->log(
            get_current_user_id(),
            'send',
            'proposal',
            $proposal_id,
            [ 'version_id' => $version_id ]
        );

        return $this->response( [
            'version_id'   => $version_id,
            'public_token' => $public_token,
            'public_url'   => wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] ),
            'status'       => 'sent',
        ] );
    }
    public function accept_proposal_admin( WP_REST_Request $request ) {
        $proposal_id = (int) $request['id'];
        $version_id = (int) $request->get_param( 'version_id' );

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();
        $audit_repo    = new WP_Travel_Audit_Log_Repository();

        $proposal = $proposal_repo->get_by_id( $proposal_id );
        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        if ( $proposal['status'] === 'accepted' ) {
            return $this->error( 'Proposal already accepted' );
        }

        if ( $version_id <= 0 ) {
            $version_id = (int) $proposal['current_version_id'];
        }

        if ( $version_id <= 0 ) {
            return $this->error( 'Missing version_id' );
        }

        $version = $version_repo->get_by_id( $version_id );
        if ( ! $version || (int) $version['proposal_id'] !== $proposal_id ) {
            return $this->error( 'Version not found', 404 );
        }

        $proposal_repo->accept_proposal(
            $proposal_id,
            $version_id,
            'admin',
            get_current_user_id(),
            $this->get_request_ip()
        );

        $audit_repo->log(
            get_current_user_id(),
            'accept',
            'proposal',
            $proposal_id,
            [ 'version_id' => $version_id ]
        );

        $proposal = $proposal_repo->get_by_id( $proposal_id );
        wp_travel_giav_notify_proposal_acceptance( $proposal, $version, 'admin' );

        return $this->response( [
            'ok'                  => true,
            'status'              => $proposal['status'],
            'accepted_at'         => $proposal['accepted_at'],
            'accepted_version_id' => $proposal['accepted_version_id'],
            'confirmation_status' => $proposal['confirmation_status'],
            'portal_invite_status'=> $proposal['portal_invite_status'],
        ] );
    }

    public function accept_proposal_public( WP_REST_Request $request ) {
        $token = sanitize_text_field( $request['token'] );
        $nonce = (string) $request->get_header( 'x_wp_nonce' );
        if ( '' === $nonce ) {
            $nonce = (string) $request->get_param( '_wpnonce' );
        }
        if ( '' === $nonce ) {
            $nonce = (string) $request->get_param( 'nonce' );
        }
        $nonce = sanitize_text_field( $nonce );

        $should_log = defined( 'WP_DEBUG' ) && WP_DEBUG;
        if ( '' === $nonce ) {
            if ( $should_log ) {
                error_log( '[WP Travel GIAV] Public accept missing nonce.' );
            }
            return new WP_Error( 'wp_travel_nonce_missing', 'Missing nonce', [ 'status' => 403 ] );
        }

        if ( ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
            if ( $should_log ) {
                error_log( sprintf(
                    '[WP Travel GIAV] Public accept invalid nonce for action wp_rest: %s...',
                    substr( $nonce, 0, 8 )
                ) );
            }
            return new WP_Error( 'wp_travel_nonce_invalid', 'Invalid nonce', [ 'status' => 403 ] );
        }

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();
        $audit_repo    = new WP_Travel_Audit_Log_Repository();

        $proposal = $proposal_repo->get_by_token( $token );
        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        if ( $proposal['status'] === 'accepted' ) {
            return $this->response( [
                'ok'                  => true,
                'status'              => $proposal['status'],
                'accepted_at'         => $proposal['accepted_at'],
                'accepted_version_id' => $proposal['accepted_version_id'],
                'confirmation_status' => $proposal['confirmation_status'],
                'portal_invite_status'=> $proposal['portal_invite_status'],
                'giav_status'         => $proposal['giav_sync_status'] ?? 'none',
                'message'             => 'Propuesta ya aceptada.',
            ] );
        }

        if ( $proposal['status'] !== 'sent' ) {
            return $this->error( 'Proposal cannot be accepted' );
        }

        $current_version_id = (int) $proposal['current_version_id'];
        if ( $current_version_id <= 0 ) {
            return $this->error( 'Proposal cannot be accepted' );
        }

        $version = $version_repo->get_by_id( $current_version_id );
        if ( ! $version || (int) $version['proposal_id'] !== (int) $proposal['id'] ) {
            return $this->error( 'Proposal cannot be accepted' );
        }

        $full_name = trim( (string) $request->get_param( 'full_name' ) );
        $dni = wp_travel_giav_normalize_dni( (string) $request->get_param( 'dni' ) );

        if ( strlen( $full_name ) < 3 ) {
            return $this->error( 'Nombre completo obligatorio' );
        }

        if ( strlen( $dni ) < 6 ) {
            return $this->error( 'DNI obligatorio' );
        }

        $proposal_repo->accept_proposal(
            (int) $proposal['id'],
            $current_version_id,
            'client',
            null,
            $this->get_request_ip()
        );

        $proposal_repo->update_traveler_details(
            (int) $proposal['id'],
            $full_name,
            $dni
        );

        $audit_repo->log(
            0,
            'accept',
            'proposal',
            $proposal['id'],
            [ 'version_id' => $current_version_id ]
        );

        $accepted_proposal = $proposal_repo->get_by_id( (int) $proposal['id'] );
        wp_travel_giav_notify_proposal_acceptance( $accepted_proposal, $version, 'client' );

        $giav_result = wp_travel_giav_create_expediente_from_proposal( (int) $proposal['id'] );
        $giav_status = 'pending';
        $giav_message = 'Aceptada. Estamos procesando tu expediente.';
        if ( ! is_wp_error( $giav_result ) && is_array( $giav_result ) ) {
            $giav_status = $giav_result['status'] ?? 'pending';
            if ( $giav_status === 'ok' ) {
                $giav_message = 'Aceptada y expediente creado.';
            }
        }

        return $this->response( [
            'ok'                  => true,
            'status'              => $accepted_proposal['status'],
            'accepted_at'         => $accepted_proposal['accepted_at'],
            'accepted_version_id' => $accepted_proposal['accepted_version_id'],
            'confirmation_status' => $accepted_proposal['confirmation_status'],
            'portal_invite_status'=> $accepted_proposal['portal_invite_status'],
            'giav_status'         => $giav_status,
            'message'             => $giav_message,
        ] );
    }

    private function get_request_ip(): ?string {
        $ip = '';
        if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
            $parts = explode( ',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'] );
            $ip = trim( $parts[0] );
        } elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
            $ip = (string) $_SERVER['REMOTE_ADDR'];
        }

        $ip = sanitize_text_field( $ip );
        return $ip !== '' ? $ip : null;
    }

    public function confirm_version( WP_REST_Request $request ) {
        $version_id = (int) $request['id'];

        $version_repo  = new WP_Travel_Proposal_Version_Repository();
        $proposal_repo = new WP_Travel_Proposal_Repository();
        $audit_repo    = new WP_Travel_Audit_Log_Repository();

        $version = $version_repo->get_by_id( $version_id );

        if ( ! $version ) {
            return $this->error( 'Version not found', 404 );
        }

        $proposal = $proposal_repo->get_by_id( (int) $version['proposal_id'] );

        if ( $proposal['status'] !== 'accepted' ) {
            return $this->error( 'Proposal must be accepted before confirmation' );
        }

        // Preflight GIAV: bloquear confirmación si hay items sin mapeo activo
        $preflight = WP_Travel_GIAV_Preflight::check_version( $version_id );
        if ( empty( $preflight['ok'] ) ) {
            return new WP_Error(
                'wp_travel_giav_preflight_failed',
                'GIAV mapping incomplete',
                [
                    'status'    => 409,
                    'preflight' => $preflight,
                ]
            );
        }

        $proposal_repo->update_status( $proposal['id'], 'queued' );

        // Encolar tarea (sin SOAP aún)
        if ( class_exists( 'ActionScheduler' ) ) {
            as_enqueue_async_action(
                'wp_travel_giav_sync',
                [ 'version_id' => $version_id ],
                'wp-travel-giav'
            );
        }

        $audit_repo->log(
            get_current_user_id(),
            'queue_sync',
            'version',
            $version_id
        );

        return $this->response( [
            'status' => 'queued',
        ] );
    }

    public function retry_giav_sync( WP_REST_Request $request ) {
        $proposal_id = (int) $request['id'];

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $proposal = $proposal_repo->get_by_id( $proposal_id );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        if ( ! empty( $proposal['giav_expediente_id'] ) ) {
            return $this->response( [
                'status'             => 'ok',
                'giav_expediente_id' => $proposal['giav_expediente_id'],
            ] );
        }

        $pending_status = isset( $proposal['giav_sync_status'] ) ? $proposal['giav_sync_status'] : 'none';
        if ( $pending_status === 'pending' && ! wp_travel_giav_pending_is_stale( $proposal ) ) {
            return $this->response( [
                'status' => 'pending',
            ], 202 );
        }

        $result = wp_travel_giav_create_expediente_from_proposal( $proposal_id );
        if ( is_wp_error( $result ) ) {
            return $this->error( $result->get_error_message(), 500 );
        }

        return $this->response( $result );
    }

    public function giav_preflight( WP_REST_Request $request ) {
        $version_id = (int) $request['id'];

        // Prevent GIAV confirmation/preflight when DB schema incomplete or migrations failed
        if ( function_exists( 'wp_travel_giav_db_check' ) ) {
            $dbcheck = wp_travel_giav_db_check();
            $migration_failed = get_option( 'wp_travel_giav_migration_failed', false );
            if ( $migration_failed ) {
                return $this->error( 'DB migration previously failed; contact administrator', 503 );
            }
            if ( empty( $dbcheck['healthy'] ) ) {
                return $this->error( 'DB schema incomplete: ' . implode( ', ', $dbcheck['missing'] ), 503 );
            }
        }

        $version_repo = new WP_Travel_Proposal_Version_Repository();
        $version      = $version_repo->get_by_id( $version_id );

        if ( ! $version ) {
            return $this->error( 'Version not found', 404 );
        }

        $check = WP_Travel_GIAV_Preflight::check_version( $version_id );

        return $this->response( $check );
    }
}
