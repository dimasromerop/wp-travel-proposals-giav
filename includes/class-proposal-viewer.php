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
        add_filter( 'query_vars', [ __CLASS__, 'add_query_var' ] );
        add_action( 'template_redirect', [ __CLASS__, 'maybe_render' ] );

        self::$booted = true;
    }

    public static function register_route() {
        add_rewrite_rule( '^travel-proposal/([A-Za-z0-9]+)(?:/)?$', 'index.php?travel_proposal_view=$matches[1]', 'top' );
    }

    public static function add_query_var( $vars ) {
        $vars[] = 'travel_proposal_view';
        return $vars;
    }

    public static function flush_rewrite_rules() {
        self::register_route();
        flush_rewrite_rules();
    }

    public static function maybe_render() {
        $token = get_query_var( 'travel_proposal_view' );
        if ( ! $token ) {
            return;
        }

        self::render_snapshot( $token );
    }

    private static function render_snapshot( $token ) {
        nocache_headers();

        $repo = new WP_Travel_Proposal_Version_Repository();
        $version = $repo->get_by_token( $token );

        if ( ! $version ) {
            self::render_error( 'Versión no encontrada', [ 'token' => $token ], 404 );
        }

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
                    $errors[] = sprintf( 'Servicio "%s" requiere proveedor', $service_name ?: "#{$index}" );
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
                    if ( ! empty( $warning['message'] ) ) {
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

        self::output_html( $header, $items, array_values( $warnings ), $totals, $version );
    }

    private static function output_html( array $header, array $items, array $warnings, array $totals, array $version ) {
        status_header( 200 );
        header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );

        $version_label = sprintf(
            'Versión %s · Generada el %s',
            esc_html( $version['version_number'] ?? '' ),
            esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $version['created_at'] ) )
        );

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
                }
                .proposal-header h1 {
                    margin: 0;
                    font-size: 28px;
                    letter-spacing: 0.02em;
                }
                .proposal-header .meta {
                    color: #475569;
                    font-size: 14px;
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
                .version-label {
                    font-size: 12px;
                    color: #94a3b8;
                    text-align: right;
                    margin-top: -12px;
                }
            </style>
        </head>
        <body>
        <div class="proposal-page">
            <div class="proposal-header">
                <h1><?php echo esc_html( $header['customer_name'] ?: 'Propuesta de viaje' ); ?></h1>
                <div class="meta">
                    <?php echo esc_html( sprintf( '%s → %s | %s pax | %s', $header['start_date'], $header['end_date'], $header['pax_total'], $header['currency'] ) ); ?>
                </div>
                <div class="version-label"><?php echo esc_html( $version_label ); ?></div>
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
                                if ( ! empty( $warning['message'] ) ) {
                                    $item_warnings[] = esc_html( $warning['message'] );
                                }
                            }
                        }
                        ?>
                        <li class="service-item">
                            <div class="service-title">
                                <?php echo $display_name; ?>
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
                        <div class="label">Coste neto</div>
                        <div class="value"><?php echo esc_html( $header['currency'] ); ?> <?php echo number_format( $totals['totals_cost_net'], 2 ); ?></div>
                    </div>
                    <div class="totals-card">
                        <div class="label">PVP total</div>
                        <div class="value"><?php echo esc_html( $header['currency'] ); ?> <?php echo number_format( $totals['totals_sell_price'], 2 ); ?></div>
                    </div>
                    <div class="totals-card">
                        <div class="label">Margen</div>
                        <div class="value"><?php echo esc_html( $header['currency'] ); ?> <?php echo number_format( $totals['totals_margin_abs'], 2 ); ?></div>
                        <div class="label"><?php echo esc_html( round( $totals['totals_margin_pct'], 2 ) ); ?>%</div>
                    </div>
                </div>
            </div>
        </div>
        </body>
        </html>
        <?php
        exit;
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
