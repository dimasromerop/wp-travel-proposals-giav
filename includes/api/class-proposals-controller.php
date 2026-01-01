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
            'currency'          => $request->get_param( 'currency' ),
        ];

        if ( empty( $data['customer_name'] ) || empty( $data['start_date'] ) ) {
            return $this->error( 'Missing required fields' );
        }

        $proposal_id = $repo->create( $data );

        return $this->response( [
            'proposal_id' => $proposal_id,
        ], 201 );
    }

    public function get_proposal( WP_REST_Request $request ) {
        $repo = new WP_Travel_Proposal_Repository();
        $proposal = $repo->get_by_id( (int) $request['id'] );

        if ( ! $proposal ) {
            return $this->error( 'Proposal not found', 404 );
        }

        return $this->response( $proposal );
    }
}