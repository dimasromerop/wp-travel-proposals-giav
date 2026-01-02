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

        register_rest_route( $this->namespace, '/proposals/accept/(?P<token>[a-zA-Z0-9]+)', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'accept_proposal' ],
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
    public function accept_proposal( WP_REST_Request $request ) {

        $token = sanitize_text_field( $request['token'] );

        $version_repo = new WP_Travel_Proposal_Version_Repository();
        $proposal_repo = new WP_Travel_Proposal_Repository();
        $audit_repo = new WP_Travel_Audit_Log_Repository();

        $version = $version_repo->get_by_token( $token );

        if ( ! $version ) {
            return $this->error( 'Invalid or expired token', 404 );
        }

        $proposal = $proposal_repo->get_by_id( (int) $version['proposal_id'] );

        if ( $proposal['status'] !== 'sent' ) {
            return $this->error( 'Proposal cannot be accepted' );
        }

        $proposal_repo->update_status( $proposal['id'], 'accepted' );
        $proposal_repo->set_current_version( $proposal['id'], $version['id'] );
        $proposal_repo->set_accepted_version( $proposal['id'], $version['id'] );

        $audit_repo->log(
            0,
            'accept',
            'proposal',
            $proposal['id'],
            [ 'version_id' => $version['id'] ]
        );

        return $this->response( [
            'status' => 'accepted',
        ] );
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

public function giav_preflight( WP_REST_Request $request ) {

    $version_id = (int) $request['id'];

    $version_repo = new WP_Travel_Proposal_Version_Repository();
    $version      = $version_repo->get_by_id( $version_id );

    if ( ! $version ) {
        return $this->error( 'Version not found', 404 );
    }

    $check = WP_Travel_GIAV_Preflight::check_version( $version_id );

    return $this->response( $check );
}
}
