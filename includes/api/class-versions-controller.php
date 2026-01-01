<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Versions_Controller extends WP_Travel_REST_Controller {

    protected $namespace = 'travel/v1';
    protected $rest_base = 'versions';

    public function register_routes() {

        register_rest_route( $this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'create_version' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );
    }

    public function create_version( WP_REST_Request $request ) {

        $proposal_id = (int) $request->get_param( 'proposal_id' );

        if ( ! $proposal_id ) {
            return $this->error( 'Missing proposal_id' );
        }

        $repo = new WP_Travel_Proposal_Version_Repository();

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
        $totals = isset( $snapshot['totals'] ) && is_array( $snapshot['totals'] ) ? $snapshot['totals'] : [];
        $public_token = wp_generate_password( 32, false );

        $data = [
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
        ];

        $version_id = $repo->create_version( $data );

        $item_repo = new WP_Travel_Proposal_Item_Repository();
        if ( ! empty( $snapshot['items'] ) && is_array( $snapshot['items'] ) ) {
            foreach ( $snapshot['items'] as $item ) {
                $item_repo->add_item( WP_Travel_GIAV_Snapshot_Resolver::build_item_row( $version_id, $item ) );
            }
        }

        $this->log_snapshot_resolution( $proposal_id, $version_id, $resolved['logs'] );

        return $this->response( [
            'version_id'   => $version_id,
            'public_token' => $data['public_token'],
        ], 201 );
    }
}
