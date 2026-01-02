<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Viewer {

    private static $booted = false;

    public static function boot() {
        if ( self::$booted ) {
            return;
        }

        add_action( 'init', [ __CLASS__, 'register_route' ] );
        add_filter( 'query_vars', [ __CLASS__, 'add_query_vars' ] );
        add_action( 'template_redirect', [ __CLASS__, 'maybe_render' ] );

        self::$booted = true;
    }

    public static function register_route() {
        add_rewrite_rule( '^travel-proposal/([A-Za-z0-9]+)/?$', 'index.php?travel_proposal_token=$matches[1]', 'top' );
        add_rewrite_rule( '^travel-proposal/([A-Za-z0-9]+)/v/([A-Za-z0-9]+)/?$', 'index.php?travel_proposal_token=$matches[1]&travel_proposal_version_token=$matches[2]', 'top' );
    }

    public static function add_query_vars( $vars ) {
        $vars[] = 'travel_proposal_token';
        $vars[] = 'travel_proposal_version_token';
        return $vars;
    }

    public static function flush_rewrite_rules() {
        self::register_route();
        flush_rewrite_rules();
    }

    public static function maybe_render() {
        $proposal_token = get_query_var( 'travel_proposal_token' );
        if ( ! $proposal_token ) {
            return;
        }

        $version_token = get_query_var( 'travel_proposal_version_token' );
        $version_id_override = 0;
        if ( isset( $_GET['v'] ) ) {
            $version_id_override = absint( wp_unslash( $_GET['v'] ) );
        }

        $proposal_repo = new WP_Travel_Proposal_Repository();
        $version_repo  = new WP_Travel_Proposal_Version_Repository();

        $proposal = $proposal_repo->get_by_token( $proposal_token );
        if ( ! $proposal ) {
            self::render_error( 'Propuesta no encontrada', [ 'token' => $proposal_token ], 404 );
        }

        $current_version = null;
        $current_version_id = isset( $proposal['current_version_id'] ) ? (int) $proposal['current_version_id'] : 0;
        if ( $current_version_id > 0 ) {
            $maybe_current = $version_repo->get_by_id( $current_version_id );
            if ( $maybe_current && (int) $maybe_current['proposal_id'] === (int) $proposal['id'] ) {
                $current_version = $maybe_current;
            }
        }

        if ( ! $current_version ) {
            $current_version = $version_repo->get_latest_for_proposal( $proposal['id'] );
            if ( $current_version ) {
                $proposal_repo->set_current_version( $proposal['id'], $current_version['id'] );
                error_log( sprintf(
                    '[WP Travel GIAV] Proposal viewer auto-set current_version_id=%d for proposal_id=%d',
                    $current_version['id'],
                    $proposal['id']
                ) );
            }
        }

        if ( ! $current_version ) {
            self::render_error( 'No hay versiones disponibles para esta propuesta', [ 'proposal_id' => $proposal['id'] ], 404 );
        }

        $selected_version = null;
        if ( $version_token ) {
            $selected_version = $version_repo->get_by_proposal_and_token( $proposal['id'], $version_token );
            if ( ! $selected_version ) {
                error_log( sprintf(
                    '[WP Travel GIAV] Proposal viewer rejected version token="%s" for proposal_id=%d',
                    $version_token,
                    $proposal['id']
                ) );
                self::render_error( 'Versión no encontrada', [ 'version_token' => $version_token ], 404 );
            }
        } elseif ( $version_id_override ) {
            $selected_version = $version_repo->get_by_id( $version_id_override );
            if ( ! $selected_version || (int) $selected_version['proposal_id'] !== (int) $proposal['id'] ) {
                error_log( sprintf(
                    '[WP Travel GIAV] Proposal viewer rejected version id=%d for proposal_id=%d',
                    $version_id_override,
                    $proposal['id']
                ) );
                self::render_error( 'Versión no disponible', [ 'version_id' => $version_id_override ], 404 );
            }

            $expired = ! empty( $selected_version['revoked_at'] )
                || ( ! empty( $selected_version['expires_at'] ) && strtotime( $selected_version['expires_at'] ) <= current_time( 'timestamp' ) );
            if ( $expired ) {
                error_log( sprintf(
                    '[WP Travel GIAV] Proposal viewer refused expired version id=%d for proposal_id=%d',
                    $version_id_override,
                    $proposal['id']
                ) );
                self::render_error( 'Versión no disponible', [ 'version_id' => $version_id_override ], 404 );
            }
        } else {
            $selected_version = $current_version;
        }

        self::render_snapshot( $proposal, $current_version, $selected_version );
    }

    private static function render_snapshot( array $proposal, array $current_version, array $version ) {
        nocache_headers();

        $snapshot = json_decode( $version['json_snapshot'], true );
        if ( ! is_array( $snapshot ) ) {
            self::render_error( 'Snapshot inválido para esta versión', [ 'version_id' => $version['id'] ], 500 );
        }

        $items = isset( $snapshot['items'] ) && is_array( $snapshot['items'] ) ? $snapshot['items'] : [];
        if ( empty( $items ) ) {
            self::render_error( 'No hay servicios asociados a esta propuesta', [ 'version_id' => $version['id'] ], 404 );
        }

        $requires_mapping = apply_filters(
            'wp_travel_giav_requires_mapping_service_types',
            [ 'hotel', 'golf' ]
        );

        $errors = [];
        foreach ( $items as $index => $item ) {
            $service_name = trim( (string) ( $item['display_name'] ?? '' ) );
            if ( $service_name === '' ) {
                $errors[] = sprintf( 'Servicio #%d sin display_name', $index + 1 );
            }

            $service_type = isset( $item['service_type'] ) ? (string) $item['service_type'] : '';
            if ( in_array( $service_type, (array) $requires_mapping, true ) ) {
                $supplier_name = trim( (string) ( $item['giav_supplier_name'] ?? '' ) );
                if ( $supplier_name === '' ) {
                    $errors[] = sprintf( 'Servicio "%s" requiere proveedor', $service_name ?: '#'.$index );
                }
            }
        }

        if ( $errors ) {
            self::render_error( 'Snapshot incompleto', $errors, 422 );
        }

        $warnings = [];
        foreach ( $items as $item ) {
            if ( ! empty( $item['warnings'] ) && is_array( $item['warnings'] ) ) {
                foreach ( $item['warnings'] as $warning ) {
                    if ( self::is_public_warning( $warning ) && ! empty( $warning['message'] ) ) {
                        $warnings[ (string) $warning['message'] ] = (string) $warning['message'];
                    }
                }
            }
        }

        $header_defaults = [
            'customer_name'     => '',
            'customer_email'    => '',
            'customer_country'  => '',
            'customer_language' => '',
            'start_date'        => '',
            'end_date'          => '',
            'pax_total'         => '',
            'currency'          => '',
        ];

        $header = wp_parse_args( $snapshot['header'] ?? [], $header_defaults );
        $totals = wp_parse_args( $snapshot['totals'] ?? [], [
            'totals_cost_net'   => 0,
            'totals_sell_price' => 0,
            'totals_margin_abs' => 0,
            'totals_margin_pct' => 0,
        ] );

        self::output_html(
            $proposal,
            $current_version,
            $version,
            $header,
            $items,
            array_values( $warnings ),
            $totals
        );
    }

    /**
     * Render the customer-facing HTML.
     *
     * Only reads snapshot header + totals + warnings; it never recalculates costs, margins
     * or consults external services. Internals (coste neto, margen, IDs) stay stored but are
     * intentionally excluded from the commercial render.
     */
    private static function output_html(
        array $proposal,
        array $current_version,
        array $version,
        array $header,
        array $items,
        array $warnings,
        array $totals
    ) {
        status_header( 200 );
        header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );

        $view_timestamp = strtotime( $version['created_at'] ) ?: current_time( 'timestamp' );
        $current_timestamp = $current_version ? strtotime( $current_version['created_at'] ) : 0;
        $is_current = $current_version && (int) $current_version['id'] === (int) $version['id'];

        $view_label = sprintf(
            'Versión %s · Generada el %s',
            esc_html( $version['version_number'] ?? '' ),
            esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $view_timestamp ) )
        );

        $current_label = $current_timestamp
            ? wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $current_timestamp )
            : '';

        $dates = trim( sprintf( '%s - %s', $header['start_date'], $header['end_date'] ) );
        $pax_total = absint( $header['pax_total'] );
        $currency = esc_html( $header['currency'] );

        $price_per_person = 0;
        if ( $pax_total ) {
            $price_per_person = $totals['totals_sell_price'] / $pax_total;
        }

        $current_version_message = $current_label
            ? sprintf( 'La propuesta se actualizó el %s.', $current_label )
            : 'La propuesta se actualizó recientemente.';
        ?>
        <!doctype html>
        <html lang="<?php echo esc_attr( get_bloginfo( 'language' ) ); ?>">
        <head>
            <meta charset="<?php echo esc_attr( get_option( 'blog_charset' ) ); ?>">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo esc_html( $header['customer_name'] ?: 'Propuesta de viaje' ); ?></title>
            <style>
                body {
                    margin: 0;
                    background: #f4f4f7;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                    color: #0f172a;
                }
                .proposal-page {
                    max-width: 960px;
                    margin: 0 auto;
                    padding: 36px 24px 48px;
                }
                .proposal-header {
                    text-align: center;
                    margin-bottom: 32px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .proposal-header h1 {
                    margin: 0;
                    font-size: 32px;
                    letter-spacing: 0.02em;
                }
                .proposal-status__meta {
                    color: #475569;
                    font-size: 14px;
                }
                .proposal-version {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    align-items: center;
                    flex-wrap: wrap;
                    font-size: 14px;
                    color: #475569;
                }
                .version-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 999px;
                    font-size: 12px;
                    border: 1px solid #d1d5db;
                }
                .version-pill--active {
                    background: #dcfce7;
                    color: #166534;
                    border-color: #86efac;
                }
                .version-pill--archive {
                    background: #eef2ff;
                    color: #3730a3;
                    border-color: #c7d2fe;
                }
                .version-banner {
                    margin-top: 8px;
                    padding: 16px;
                    background: #fef3c7;
                    border: 1px solid #fde68a;
                    border-radius: 12px;
                    color: #92400e;
                    font-size: 14px;
                }
                .version-banner strong {
                    display: block;
                    margin-bottom: 6px;
                }
                .version-banner__link {
                    color: #92400e;
                    font-weight: 600;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 6px;
                }
                .proposal-section {
                    margin-bottom: 32px;
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 24px;
                    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.05);
                }
                .proposal-section h2 {
                    margin: 0 0 16px;
                    font-size: 18px;
                }
                .service-list {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: grid;
                    gap: 16px;
                }
                .service-item {
                    padding: 16px;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                }
                .service-item .service-title {
                    font-weight: 600;
                    margin-bottom: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                }
                .service-item .service-subtitle {
                    color: #475569;
                    font-size: 13px;
                    margin-bottom: 8px;
                }
                .warning-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 2px 10px;
                    border-radius: 999px;
                    font-size: 12px;
                    background: #fff7ed;
                    color: #b45309;
                    border: 1px solid #fde7c1;
                }
                .service-warnings {
                    margin-top: 6px;
                    font-size: 13px;
                    color: #b45309;
                }
                .totals-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
                    gap: 16px;
                }
                .totals-grid .totals-card {
                    background: #f8fafc;
                    border-radius: 10px;
                    padding: 16px;
                    text-align: center;
                    border: 1px solid #e2e8f0;
                }
                .totals-grid .label {
                    font-size: 12px;
                    color: #94a3b8;
                    margin-bottom: 8px;
                }
                .totals-grid .value {
                    font-size: 18px;
                    font-weight: 700;
                    color: #0f172a;
                }
                .observations ul {
                    margin: 0;
                    padding-left: 18px;
                }
                .observations li {
                    margin-bottom: 6px;
                }
            </style>
        </head>
        <body>
        <div class="proposal-page">
            <div class="proposal-header">
                <h1><?php echo esc_html( $header['customer_name'] ?: 'Propuesta de viaje' ); ?></h1>
                <div class="proposal-status__meta">
                    <?php echo esc_html( trim( sprintf( '%s | %s pax | %s', $dates, $pax_total, $currency ) ) ); ?>
                </div>
                <div class="proposal-version">
                    <span><?php echo esc_html( $view_label ); ?></span>
                    <span class="version-pill <?php echo $is_current ? 'version-pill--active' : 'version-pill--archive'; ?>">
                        <?php echo $is_current ? 'Versión vigente' : 'Versión anterior'; ?>
                    </span>
                </div>
                <?php if ( ! $is_current && $current_version ) : ?>
                    <div class="version-banner">
                        <strong>Estás viendo una versión anterior.</strong>
                        <span><?php echo esc_html( $current_version_message ); ?></span>
                        <a href="<?php echo esc_url( self::get_proposal_url( $proposal['proposal_token'] ) ); ?>" class="version-banner__link">Ver versión actual</a>
                    </div>
                <?php endif; ?>
            </div>

            <div class="proposal-section">
                <h2>Servicios incluidos</h2>
                <ul class="service-list">
                    <?php foreach ( $items as $item ) : ?>
                        <?php
                        $display_name = esc_html( $item['display_name'] ?? 'Servicio' );
                        $supplier = esc_html( $item['giav_supplier_name'] ?? '' );
                        $item_warnings = [];
                        if ( ! empty( $item['warnings'] ) && is_array( $item['warnings'] ) ) {
                            foreach ( $item['warnings'] as $warning ) {
                                if ( self::is_public_warning( $warning ) && ! empty( $warning['message'] ) ) {
                                    $item_warnings[] = esc_html( $warning['message'] );
                                }
                            }
                        }
                        ?>
                        <li class="service-item">
                            <div class="service-title">
                                <span><?php echo $display_name; ?></span>
                                <?php if ( $item_warnings ) : ?>
                                    <span class="warning-badge">Aviso</span>
                                <?php endif; ?>
                            </div>
                            <div class="service-subtitle">Proveedor: <?php echo $supplier ?: 'Proveedor no disponible'; ?></div>
                            <?php if ( $item_warnings ) : ?>
                                <div class="service-warnings">
                                    <?php foreach ( $item_warnings as $message ) : ?>
                                        <div><?php echo $message; ?></div>
                                    <?php endforeach; ?>
                                </div>
                            <?php endif; ?>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>

            <?php if ( $warnings ) : ?>
                <div class="proposal-section observations">
                    <h2>Observaciones</h2>
                    <ul>
                        <?php foreach ( $warnings as $message ) : ?>
                            <li><?php echo esc_html( $message ); ?></li>
                        <?php endforeach; ?>
                    </ul>
                </div>
            <?php endif; ?>

            <div class="proposal-section">
                <h2>Totales</h2>
                <div class="totals-grid">
                    <div class="totals-card">
                        <div class="label">Precio total</div>
                        <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $totals['totals_sell_price'], 2 ); ?></div>
                    </div>
                    <div class="totals-card">
                        <div class="label">Precio por persona</div>
                        <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $price_per_person, 2 ); ?></div>
                    </div>
                </div>
            </div>
        </div>
        </body>
        </html>
        <?php
        exit;
    }

    private static function get_proposal_url( string $token ) {
        return home_url( '/travel-proposal/' . $token . '/' );
    }

    private static function is_public_warning( array $warning ) : bool {
        $code = strtoupper( (string) ( $warning['code'] ?? '' ) );
        $message = strtolower( (string) ( $warning['message'] ?? '' ) );

        $hidden_codes = [
            'GENERIC_SUPPLIER',
            'SUPPLIER_NAME_MISSING',
            'MANUAL_SERVICE',
        ];

        if ( in_array( $code, $hidden_codes, true ) ) {
            return false;
        }

        if ( $message !== '' && ( str_contains( $message, 'missing mapping' ) || str_contains( $message, 'generic supplier' ) ) ) {
            return false;
        }

        return true;
    }

    private static function render_error( $message, array $details = [], $status = 500 ) {
        status_header( $status );
        header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );

        if ( $details ) {
            error_log( sprintf( '[WP Travel GIAV] Proposal viewer error: %s (%s)', $message, wp_json_encode( $details ) ) );
        } else {
            error_log( sprintf( '[WP Travel GIAV] Proposal viewer error: %s', $message ) );
        }

        ?>
        <!doctype html>
        <html lang="<?php echo esc_attr( get_bloginfo( 'language' ) ); ?>">
        <head>
            <meta charset="<?php echo esc_attr( get_option( 'blog_charset' ) ); ?>">
            <title>Propuesta no disponible</title>
            <style>
                body {
                    margin: 0;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                    background: #fff;
                    color: #0f172a;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                .error-box {
                    max-width: 480px;
                    padding: 32px;
                    border: 1px solid #fecaca;
                    border-radius: 12px;
                    background: #fff7ed;
                    color: #b91c1c;
                    text-align: center;
                }
            </style>
        </head>
        <body>
        <div class="error-box">
            <h1>Propuesta no disponible</h1>
            <p><?php echo esc_html( $message ); ?></p>
        </div>
        </body>
        </html>
        <?php
        exit;
    }
}
