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

    private const SORTABLE_FIELDS = [
        'fecha_inicio',
        'total_pvp',
        'dias_hasta_viaje',
        'agente_comercial',
        'cliente_nombre',
    ];

    private const PAYMENT_STATUS = [
        'pagado',
        'pendiente',
        'vencido',
    ];

    private const DEFAULT_PER_PAGE = 25;
    private const MAX_PER_PAGE     = 100;

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
                        'page' => [
                            'type'              => 'integer',
                            'required'          => false,
                            'sanitize_callback' => 'absint',
                        ],
                        'per_page' => [
                            'type'              => 'integer',
                            'required'          => false,
                            'sanitize_callback' => 'absint',
                        ],
                        'sort_by' => [
                            'type'              => 'string',
                            'required'          => false,
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'order' => [
                            'type'              => 'string',
                            'required'          => false,
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'agent' => [
                            'type'              => 'string',
                            'required'          => false,
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'payment_status' => [
                            'type'              => 'string',
                            'required'          => false,
                            'sanitize_callback' => 'sanitize_text_field',
                        ],
                        'payment_due_days' => [
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
            return new WP_Error( 'bad_year', 'Aヵo invケlido.' );
        }

        $cache_key = 'wp_travel_giav_dashboard_' . $year;
        if ( ! $force ) {
            $cached = get_transient( $cache_key );
            if ( is_array( $cached ) ) {
                $items = $cached['expedientes'] ?? [];
                $payload = $this->build_payload_from_cached_data( $cached, $request );
                return rest_ensure_response( $payload );
            }
        }

        $service = new WP_Travel_GIAV_Dashboard_Service();
        $data    = $service->build_year_dashboard( $year );

        if ( is_wp_error( $data ) ) {
            return $data;
        }

        set_transient( $cache_key, $data, 10 * MINUTE_IN_SECONDS );

        return rest_ensure_response( $this->build_payload_from_cached_data( $data, $request ) );
    }

    /**
     * Builds the response payload while preserving the cached data structure.
     */
    private function build_payload_from_cached_data( array $data, WP_REST_Request $request ): array {
        $page      = max( 1, (int) ( $request->get_param( 'page' ) ?: 1 ) );
        $per_page  = $this->sanitize_per_page( $request->get_param( 'per_page' ) );
        $sort_by   = $this->sanitize_sort_field( $request->get_param( 'sort_by' ) );
        $order     = $this->sanitize_sort_order( $request->get_param( 'order' ) );

        $items     = is_array( $data['expedientes'] ?? null ) ? $data['expedientes'] : [];
        $filtered  = $this->filter_expedientes( $items, $request );
        $sorted    = $this->sort_expedientes( $filtered, $sort_by, $order );
        $paginated = $this->paginate_expedientes( $sorted, $page, $per_page );

        return [
            'summary'     => $data['summary'],
            'chart'       => $data['chart'],
            'currency'    => $data['currency'] ?? 'EUR',
            'expedientes' => $paginated,
        ];
    }

    /**
     * Applies filters based on agent name, payment status, and upcoming payments.
     */
    private function filter_expedientes( array $items, WP_REST_Request $request ): array {
        $agent            = trim( (string) $request->get_param( 'agent' ) );
        $payment_status   = strtolower( trim( (string) $request->get_param( 'payment_status' ) ) );
        $payment_due_days = $this->sanitize_positive_int( $request->get_param( 'payment_due_days' ) );

        if ( $payment_status && ! in_array( $payment_status, self::PAYMENT_STATUS, true ) ) {
            $payment_status = '';
        }

        return array_values( array_filter( $items, function( $item ) use ( $agent, $payment_status, $payment_due_days ) {
            if ( $agent !== '' && $item['agente_comercial'] ) {
                if ( stripos( $item['agente_comercial'], $agent ) === false ) {
                    return false;
                }
            }

            if ( $payment_status !== '' ) {
                $estado = strtolower( (string) ( $item['pagos']['estado'] ?? '' ) );
                if ( $estado !== $payment_status ) {
                    return false;
                }
            }

            if ( $payment_due_days > 0 ) {
                $dias = isset( $item['pagos']['dias_para_vencer'] ) ? (int) $item['pagos']['dias_para_vencer'] : null;
                if ( $dias === null || $dias > $payment_due_days ) {
                    return false;
                }
            }

            return true;
        } ) );
    }

    /**
     * Sanitizes sort field input against the allowed list.
     */
    private function sanitize_sort_field( ?string $value ): string {
        $value = trim( (string) $value );
        if ( in_array( $value, self::SORTABLE_FIELDS, true ) ) {
            return $value;
        }
        return 'fecha_inicio';
    }

    /**
     * Sanitizes sort order value.
     */
    private function sanitize_sort_order( ?string $value ): string {
        $order = strtolower( trim( (string) $value ) );
        if ( 'desc' === $order ) {
            return 'desc';
        }
        return 'asc';
    }

    /**
     * Sorts expedientes by the specified key and direction.
     */
    private function sort_expedientes( array $items, string $sort_by, string $order ): array {
        usort( $items, function( $a, $b ) use ( $sort_by, $order ) {
            return $this->compare_values( $a[ $sort_by ] ?? null, $b[ $sort_by ] ?? null, $order );
        } );
        return $items;
    }

    /**
     * Compares two values taking ordering into account.
     */
    private function compare_values( $a, $b, string $order ): int {
        if ( $a === $b ) {
            return 0;
        }

        $direction = 'desc' === $order ? -1 : 1;

        if ( is_numeric( $a ) && is_numeric( $b ) ) {
            return $direction * ( (float) $a <=> (float) $b );
        }

        return $direction * strcasecmp( (string) $a, (string) $b );
    }

    /**
     * Sanitizes per_page with defined boundaries.
     */
    private function sanitize_per_page( $value ): int {
        $per_page = (int) $this->sanitize_positive_int( $value );
        if ( $per_page < 1 ) {
            $per_page = self::DEFAULT_PER_PAGE;
        }
        return min( $per_page, self::MAX_PER_PAGE );
    }

    /**
     * Sanitizes an integer ensuring it is non-negative.
     */
    private function sanitize_positive_int( $value ): int {
        $number = isset( $value ) ? absint( $value ) : 0;
        return $number;
    }

    /**
     * Applies pagination metadata.
     */
    private function paginate_expedientes( array $items, int $page, int $per_page ): array {
        $total       = count( $items );
        $total_pages = $per_page > 0 ? (int) ceil( $total / $per_page ) : 0;
        $offset      = ( $page - 1 ) * $per_page;
        $slice       = array_slice( $items, $offset, $per_page );

        return [
            'items' => array_values( $slice ),
            'meta'  => [
                'page'        => $page,
                'per_page'    => $per_page,
                'total'       => $total,
                'total_pages' => $total_pages,
            ],
        ];
    }
}
