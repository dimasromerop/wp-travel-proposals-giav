<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposals_Controller extends WP_Travel_REST_Controller {

    protected $namespace = 'travel/v1';
    protected $rest_base = 'proposals';

    public function register_routes() {
        register_rest_route( $this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'list_proposals' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'create_proposal' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_proposal' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'callback'            => [ $this, 'update_proposal' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
            [
                'methods'             => WP_REST_Server::DELETABLE,
                'callback'            => [ $this, 'delete_proposal' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)/detail', [
            [
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => [ $this, 'get_proposal_detail' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/bulk-delete', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'bulk_delete_proposals' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)/versions', [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'create_version_snapshot' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\d+)/current-version', [
            [
                'methods'             => WP_REST_Server::EDITABLE,
                'callback'            => [ $this, 'set_current_version' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );
    }

    public function list_proposals( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();

        $page = max( 1, (int) $request->get_param( 'page' ) );
        $per_page = (int) $request->get_param( 'per_page' );
        $per_page = $per_page > 0 ? min( 200, $per_page ) : 50;

        $search = sanitize_text_field( (string) $request->get_param( 'q' ) );
        if ( $search === '' ) {
            $search = sanitize_text_field( (string) $request->get_param( 'search' ) );
        }
        $search = ltrim( $search, '#' );
        $status = sanitize_key( (string) $request->get_param( 'status' ) );
        if ( $status === 'all' ) {
            $status = '';
        }

        $sort = sanitize_text_field( (string) $request->get_param( 'sort' ) ?: 'updated_at' );
        $allowed_sort = [ 'id', 'proposal_title', 'customer_name', 'status', 'updated_at', 'totals_sell_price' ];
        $order_by = in_array( $sort, $allowed_sort, true ) ? $sort : 'updated_at';

        $order = strtoupper( (string) $request->get_param( 'order' ) ?: 'DESC' );
        $order = in_array( $order, [ 'ASC', 'DESC' ], true ) ? $order : 'DESC';

        $result = $repo->get_admin_list(
            $search,
            $page,
            $per_page,
            [
                'status'   => $status,
                'order_by' => $order_by,
                'order'    => $order,
            ]
        );

        $items = array_map( function ( $proposal ) {
            $proposal['public_url'] = wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] );
            return $proposal;
        }, $result['items'] );

        $total_pages = isset( $result['total_pages'] ) ? $result['total_pages'] : (int) ceil( $result['total'] / max( 1, $result['per_page'] ?? $per_page ) );

        return $this->response( [
            'items'       => $items,
            'total'       => $result['total'],
            'page'        => $result['page'],
            'per_page'    => $result['per_page'],
            'total_pages' => $total_pages,
        ] );
    }

    public function create_proposal( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();

        $data = [
            'customer_name'     => $request->get_param( 'customer_name' ),
            'customer_email'    => $request->get_param( 'customer_email' ),
            'customer_country'  => $request->get_param( 'customer_country' ),
            'customer_language' => $request->get_param( 'customer_language' ),
            'start_date'        => $request->get_param( 'start_date' ),
            'end_date'          => $request->get_param( 'end_date' ),
            'pax_total'         => (int) $request->get_param( 'pax_total' ),
            'players_count'     => (int) $request->get_param( 'players_count' ),
            'currency'          => $request->get_param( 'currency' ),
            'proposal_title'    => sanitize_text_field( (string) $request->get_param( 'proposal_title' ) ),
        ];

        if ( empty( $data['customer_name'] ) || empty( $data['start_date'] ) ) {
            return $this->error( 'Missing required fields' );
        }

        $proposal_id = $repo->create( $data );

        return $this->response( [
            'proposal_id' => $proposal_id,
        ], 201 );
    }

    public function update_proposal( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();
        $proposal_id = (int) $request['id'];

        $proposal = $repo->get_by_id( $proposal_id );
        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $data = [];
        $text_fields = [
            'customer_name',
            'customer_email',
            'customer_country',
            'customer_language',
            'start_date',
            'end_date',
            'currency',
            'proposal_title',
        ];

        foreach ( $text_fields as $field ) {
            if ( $request->has_param( $field ) ) {
                $data[ $field ] = sanitize_text_field( (string) $request->get_param( $field ) );
            }
        }

        if ( $request->has_param( 'pax_total' ) ) {
            $data['pax_total'] = (int) $request->get_param( 'pax_total' );
        }
        if ( $request->has_param( 'players_count' ) ) {
            $data['players_count'] = (int) $request->get_param( 'players_count' );
        }

        if ( empty( $data ) ) {
            return $this->error( 'No fields to update', 400 );
        }

        $repo->update_basics( $proposal_id, $data );

        return $this->response( [
            'proposal_id' => $proposal_id,
        ] );
    }

    public function delete_proposal( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();
        $proposal_id = (int) $request['id'];

        $proposal = $repo->get_by_id( $proposal_id );
        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $deleted = $repo->delete_by_id( $proposal_id );

        if ( ! $deleted ) {
            return $this->error( 'Proposal could not be deleted', 500 );
        }

        return $this->response( [
            'deleted' => true,
            'id'      => $proposal_id,
        ] );
    }

    public function bulk_delete_proposals( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();
        $ids = $request->get_param( 'ids' );

        if ( ! is_array( $ids ) || empty( $ids ) ) {
            return $this->error( 'Missing ids', 400 );
        }

        $ids = array_map( 'intval', $ids );
        $deleted = $repo->delete_by_ids( $ids );

        return $this->response( [
            'deleted' => $deleted,
            'ids'     => $ids,
        ] );
    }

    public function get_proposal( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();
        $proposal = $repo->get_by_id( (int) $request['id'] );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $proposal['author_name'] = '';
        if ( ! empty( $proposal['created_by'] ) ) {
            $author = get_user_by( 'id', (int) $proposal['created_by'] );
            if ( $author ) {
                $proposal['author_name'] = $author->display_name;
            }
        }

        $proposal['public_url'] = ! empty( $proposal['proposal_token'] )
            ? home_url( '/travel-proposal/' . $proposal['proposal_token'] . '/' )
            : '';

        return $this->response( $proposal );
    }

    public function get_proposal_detail( WP_REST_Request $request ) {
        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();

        $proposal_id = (int) $request['id'];
        $proposal = $proposal_repo->get_by_id( $proposal_id );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $versions = $version_repo->get_versions_for_proposal( $proposal_id );
        $current_version = null;

        if ( ! empty( $proposal['current_version_id'] ) ) {
            $current_version = $version_repo->get_by_id( (int) $proposal['current_version_id'] );
        }

        if ( ! $current_version ) {
            $current_version = $version_repo->get_latest_for_proposal( $proposal_id );
        }

        $current_snapshot = null;
        if ( $current_version && ! empty( $current_version['json_snapshot'] ) ) {
            $decoded = json_decode( $current_version['json_snapshot'], true );
            if ( is_array( $decoded ) ) {
                $current_snapshot = $decoded;
            }
        }

        $proposal['public_url'] = wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] );

        $versions_payload = array_map( function ( $version ) use ( $proposal ) {
            $version['public_url'] = wp_travel_giav_get_public_proposal_url(
                $proposal['proposal_token'],
                $version['public_token'] ?? ''
            );
            return $version;
        }, $versions );

        $next_version_number = $version_repo->get_next_version_number( $proposal_id );

        return $this->response( [
            'proposal'            => $proposal,
            'versions'            => $versions_payload,
            'current_version'     => $current_version,
            'current_snapshot'    => $current_snapshot,
            'next_version_number' => $next_version_number,
        ] );
    }

    public function create_version_snapshot( WP_REST_Request $request ) {
        $proposal_id = (int) $request['id'];

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $proposal = $proposal_repo->get_by_id( $proposal_id );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $snapshot = $request->get_param( 'snapshot' );
        if ( empty( $snapshot ) || ! is_array( $snapshot ) ) {
            return $this->error( 'Snapshot is required' );
        }

        $version_repo = new WP_Travel_Proposal_Version_Repository();
        $version_number = (int) $request->get_param( 'version_number' );
        if ( $version_number <= 0 ) {
            $version_number = $version_repo->get_next_version_number( $proposal_id );
        }

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
        $proposal_repo->set_current_version( $proposal_id, $version_id );

        return $this->response( [
            'version_id'   => $version_id,
            'public_token' => $public_token,
            'public_url'   => wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] ),
        ], 201 );
    }

    public function set_current_version( WP_REST_Request $request ) {
        $proposal_id = (int) $request['id'];
        $version_id = (int) $request->get_param( 'version_id' );

        if ( $version_id <= 0 ) {
            return $this->error( 'Missing version_id' );
        }

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();

        $proposal = $proposal_repo->get_by_id( $proposal_id );
        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        $version = $version_repo->get_by_id( $version_id );
        if ( ! $version || (int) $version['proposal_id'] !== $proposal_id ) {
            return $this->error( 'Version not found', 404 );
        }

        $proposal_repo->set_current_version( $proposal_id, $version_id );

        return $this->response( [
            'current_version_id' => $version_id,
            'public_url'         => wp_travel_giav_get_public_proposal_url( $proposal['proposal_token'] ),
        ] );
    }
}
