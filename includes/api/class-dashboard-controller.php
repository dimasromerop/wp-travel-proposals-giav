<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Dashboard endpoints (GIAV source of truth).
 */
class WP_Travel_GIAV_Dashboard_Controller extends WP_Travel_REST_Controller {

    /**
     * Namespace for the REST routes.
     *
     * NOTE: If this is missing, register_rest_route() ends up registering the route under an empty
     * namespace, which effectively makes the endpoint unreachable at /wp-json/travel/v1/...
     */
    protected $namespace = 'travel/v1';

    /**
     * Base path for this controller.
     */
    protected $rest_base = 'dashboard';

    public function register_routes() {
        register_rest_route(
            $this->namespace,
            '/' . $this->rest_base,
            [
                [
                    'methods'             => WP_REST_Server::READABLE,
                    'callback'            => [ $this, 'get_dashboard' ],
                    'permission_callback' => [ $this, 'permission_check' ],
                    'args'                => [
                        'year' => [
                            'type'              => 'integer',
                            'required'          => false,
                            'sanitize_callback' => 'absint',
                        ],
                        'force' => [
                            'type'              => 'boolean',
                            'required'          => false,
                            'sanitize_callback' => 'rest_sanitize_boolean',
                        ],
                    ],
                ],
            ]
        );
    }

    public function get_dashboard( WP_REST_Request $request ) {
        $year  = (int) ( $request->get_param( 'year' ) ?: (int) gmdate( 'Y' ) );
        $force = (bool) $request->get_param( 'force' );

        if ( $year < 2000 || $year > ( (int) gmdate( 'Y' ) + 2 ) ) {
            return new WP_Error( 'bad_year', 'Año inválido.' );
        }

        $cache_key = 'wp_travel_giav_dashboard_' . $year;
        if ( ! $force ) {
            $cached = get_transient( $cache_key );
            if ( is_array( $cached ) ) {
                return rest_ensure_response( $cached );
            }
        }

        $service = new WP_Travel_GIAV_Dashboard_Service();
        $data    = $service->build_year_dashboard( $year );

        if ( is_wp_error( $data ) ) {
            return $data;
        }

        // Keep it short: GIAV is slow and humans are impatient.
        set_transient( $cache_key, $data, 10 * MINUTE_IN_SECONDS );

        return rest_ensure_response( $data );
    }
}
