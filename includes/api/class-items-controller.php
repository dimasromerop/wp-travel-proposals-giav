<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Items_Controller extends WP_Travel_REST_Controller {

    protected $namespace = 'travel/v1';
    protected $rest_base = 'items';

    public function register_routes() {

        register_rest_route( $this->namespace, '/' . $this->rest_base, [
            [
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => [ $this, 'add_item' ],
                'permission_callback' => [ $this, 'permission_check' ],
            ],
        ] );
    }

    public function add_item( WP_REST_Request $request ) {

        $repo = new WP_Travel_Proposal_Item_Repository();

        $data = [
            'version_id'        => (int) $request->get_param( 'version_id' ),
            'service_type'      => $request->get_param( 'service_type' ),
            'display_name'      => $request->get_param( 'display_name' ),
            'wp_object_type'    => $request->get_param( 'wp_object_type' ),
            'wp_object_id'      => (int) $request->get_param( 'wp_object_id' ),
            'giav_entity_type'  => $request->get_param( 'giav_entity_type' ),
            'giav_entity_id'    => $request->get_param( 'giav_entity_id' ),
            'giav_supplier_id'  => $request->get_param( 'giav_supplier_id' ),
            'giav_supplier_name'=> $request->get_param( 'giav_supplier_name' ),
            'supplier_source'   => $request->get_param( 'supplier_source' ),
            'supplier_resolution_chain' => wp_json_encode( $request->get_param( 'supplier_resolution_chain' ) ?? [] ),
            'warnings_json'     => wp_json_encode( $request->get_param( 'warnings' ) ?? [] ),
            'blocking_json'     => wp_json_encode( $request->get_param( 'blocking' ) ?? [] ),
            'preflight_ok'      => $request->get_param( 'preflight_ok' ) ? 1 : 0,
            'start_date'        => $request->get_param( 'start_date' ),
            'end_date'          => $request->get_param( 'end_date' ),
            'quantity'          => (int) $request->get_param( 'quantity' ),
            'unit_cost_net'     => (float) $request->get_param( 'unit_cost_net' ),
            'unit_sell_price'   => (float) $request->get_param( 'unit_sell_price' ),
            'notes_public'      => $request->get_param( 'notes_public' ),
            'notes_internal'    => $request->get_param( 'notes_internal' ),
        ];

        if ( ! $data['version_id'] || ! $data['service_type'] ) {
            return $this->error( 'Missing required fields' );
        }

        $item_id = $repo->add_item( $data );

        return $this->response( [
            'item_id' => $item_id,
        ], 201 );
    }
}
