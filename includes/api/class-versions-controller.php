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

        $data = [
            'proposal_id'   => $proposal_id,
            'version_number'=> (int) $request->get_param( 'version_number' ),
            'json_snapshot' => wp_json_encode( $request->get_param( 'snapshot' ) ),
            'public_token'  => wp_generate_password( 32, false ),
        ];

        $version_id = $repo->create_version( $data );

        return $this->response( [
            'version_id'  => $version_id,
            'public_token'=> $data['public_token'],
        ], 201 );
    }
}