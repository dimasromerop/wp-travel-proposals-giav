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

        $accepted_version = null;
        if ( ! empty( $proposal['accepted_version_id'] ) ) {
            $accepted_version = $version_repo->get_by_id( (int) $proposal['accepted_version_id'] );
            if ( ! $accepted_version || (int) $accepted_version['proposal_id'] !== (int) $proposal['id'] ) {
                $accepted_version = null;
            }
        }

        self::render_snapshot( $proposal, $current_version, $selected_version, $accepted_version );
    }

    private static function render_snapshot( array $proposal, array $current_version, array $version, ?array $accepted_version ) {
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
            'players_count'     => '',
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
            $accepted_version,
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
        ?array $accepted_version,
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
            esc_html__( 'Versión %s generada el %s', 'wp-travel-giav' ),
            esc_html( $version['version_number'] ?? '' ),
            esc_html( wp_travel_giav_format_datetime( $view_timestamp ) )
        );

        $current_label = $current_timestamp
            ? wp_travel_giav_format_datetime( $current_timestamp )
            : '';


        $formatted_start = self::format_spanish_date( (string) ( $header['start_date'] ?? '' ) );
        $formatted_end = self::format_spanish_date( (string) ( $header['end_date'] ?? '' ) );
        $date_separator = ' ' . "\u{2192}" . ' ';
        $dates = trim( implode( $date_separator, array_filter( [ $formatted_start, $formatted_end ] ) ) );

        $pax_total = absint( $header['pax_total'] );
        $players_total = absint( $header['players_count'] );
        $currency = esc_html( $header['currency'] );
        $currency_label = $currency !== '' ? $currency : 'EUR';
        $pricing = self::compute_pricing_breakdown( $items, $totals, $header );

        $destination = '';
        $destination_candidates = [
            $proposal['proposal_title'] ?? '',
            $header['proposal_title'] ?? '',
            $items[0]['display_name'] ?? '',
        ];
        foreach ( $destination_candidates as $candidate ) {
            $candidate = trim( (string) $candidate );
            if ( $candidate !== '' ) {
                $destination = $candidate;
                break;
            }
        }

        $proposal_status = $proposal['status'] ?? 'draft';
        if ( $proposal_status === 'accepted' ) {
            self::render_pending_confirmation_view(
                $totals,
                $dates,
                $currency,
                $pricing,
                $destination
            );
        }

        $hotel_items = array_values( array_filter( $items, function ( $item ) {
            return ( $item['service_type'] ?? '' ) === 'hotel';
        } ) );
        $golf_items = array_values( array_filter( $items, function ( $item ) {
            return ( $item['service_type'] ?? '' ) === 'golf';
        } ) );
        $other_items = array_values( array_filter( $items, function ( $item ) {
            $type = $item['service_type'] ?? '';
            return $type !== 'hotel' && $type !== 'golf';
        } ) );

        $includes_hotel = [];
        $includes_regimens = [];
        $hotel_double_total = 0;
        $hotel_single_total = 0;
        $regimen_labels = [
            'AD' => 'Alojamiento y Desayuno',
            'SA' => 'Solo Alojamiento',
            'MP' => 'Media Pensión',
            'PC' => 'Pensión Completa',
            'TI' => 'Todo Incluido',
            'SP' => 'Según Programa',
        ];
        $hotel_count = count( $hotel_items );
        foreach ( $hotel_items as $hotel_item ) {
            $hotel_name = trim( (string) ( $hotel_item['display_name'] ?? '' ) );
            $room_type = trim( (string) ( $hotel_item['hotel_room_type'] ?? '' ) );
            $nights = absint( $hotel_item['hotel_nights'] ?? 0 );
            $night_label = $nights > 0
                ? sprintf( '%d noche%s', $nights, $nights === 1 ? '' : 's' )
                : 'Estancia';
            $line = sprintf( '%s de alojamiento', $night_label );
            if ( $room_type !== '' ) {
                $line .= sprintf( ' en %s', $room_type );
            }
            if ( $hotel_name !== '' ) {
                $line .= sprintf( ' en %s', $hotel_name );
            }
            $includes_hotel[] = $line;

            $room_pricing = isset( $hotel_item['room_pricing'] ) && is_array( $hotel_item['room_pricing'] )
                ? $hotel_item['room_pricing']
                : [];
            $double_enabled = ! empty( $room_pricing['double']['enabled'] );
            $single_enabled = ! empty( $room_pricing['single']['enabled'] );

            if ( $double_enabled ) {
                $double_rooms = absint( $room_pricing['double']['rooms'] ?? 0 );
                $double_total = (float) ( $room_pricing['double']['total_pvp'] ?? 0 );
                $hotel_double_total += $double_total;
                $label = $double_rooms > 0
                    ? sprintf( 'Habitaciones dobles (%d hab.)', $double_rooms )
                    : 'Habitaciones dobles';
                $includes_hotel[] = $label;
            }

            if ( $single_enabled ) {
                $single_rooms = absint( $room_pricing['single']['rooms'] ?? 0 );
                $single_total = (float) ( $room_pricing['single']['total_pvp'] ?? 0 );
                $hotel_single_total += $single_total;
                $label = $single_rooms > 0
                    ? sprintf( 'Habitaciones individuales (%d hab.)', $single_rooms )
                    : 'Habitaciones individuales';
                $includes_hotel[] = $label;
            }

            $regimen = trim( (string) ( $hotel_item['hotel_regimen'] ?? '' ) );
            $regimen_label = $regimen !== '' ? ( $regimen_labels[ $regimen ] ?? $regimen ) : '';
            if ( $regimen !== '' ) {
                $regimen_line = sprintf( 'Régimen: %s', $regimen_label );
                if ( $hotel_count > 1 && $hotel_name !== '' ) {
                    $regimen_line .= sprintf( ' (%s)', $hotel_name );
                }
                $includes_regimens[] = $regimen_line;
            }
            $notes = trim( (string) ( $hotel_item['notes_public'] ?? '' ) );
            if ( $notes !== '' ) {
                $includes_hotel[] = sprintf( 'Notas: %s', $notes );
            }
        }

        $golf_courses = [];
        $golf_fee_breakdown = [];
        $total_green_fees_per_person = 0;
        foreach ( $golf_items as $golf_item ) {
            $course_name = trim( (string) ( $golf_item['display_name'] ?? '' ) );
            if ( $course_name !== '' ) {
                $golf_courses[] = $course_name;
            }
            $green_value = absint( $golf_item['green_fees_per_person'] ?? 0 );
            if ( $green_value <= 0 ) {
                $green_value = 1;
            }
            if ( $green_value > 0 ) {
                $total_green_fees_per_person += $green_value;
                $golf_fee_breakdown[] = [
                    'name'       => $course_name,
                    'green_fees' => $green_value,
                ];
            }
        }

        $other_includes = [];
        foreach ( $other_items as $other_item ) {
            $label = trim( (string) ( $other_item['display_name'] ?? '' ) );
            if ( $label !== '' ) {
                $other_includes[] = $label;
            }
            $components_text = trim( (string) ( $other_item['package_components_text'] ?? '' ) );
            if ( $components_text !== '' ) {
                $lines = array_filter( array_map( 'trim', explode( "\n", $components_text ) ) );
                foreach ( $lines as $line ) {
                    $other_includes[] = $line;
                }
            }
        }

        $has_green_fee_breakdown = $total_green_fees_per_person > 0 && ! empty( $golf_fee_breakdown );

        $current_version_message = $current_label
            ? sprintf(
                esc_html__( 'La propuesta se actualizó el %s.', 'wp-travel-giav' ),
                esc_html( $current_label )
            )
            : esc_html__( 'La propuesta se actualizó recientemente.', 'wp-travel-giav' );

        $accepted_at = ! empty( $proposal['accepted_at'] ) ? strtotime( $proposal['accepted_at'] ) : 0;
        $accepted_message = '';
        if ( $proposal_status === 'accepted' && $accepted_at ) {
            $giav_status = $proposal['giav_sync_status'] ?? 'none';
            $giav_message = $giav_status === 'ok' && ! empty( $proposal['giav_expediente_id'] )
                ? esc_html__( 'Aceptada y expediente creado.', 'wp-travel-giav' )
                : esc_html__( 'Aceptada. Estamos procesando tu expediente.', 'wp-travel-giav' );
            $accepted_message = sprintf(
                esc_html__( 'Propuesta aceptada el %s.', 'wp-travel-giav' ),
                esc_html( wp_travel_giav_format_datetime( $accepted_at ) )
            ) . ' ' . $giav_message;
        }

        $accepted_version_message = '';
        if ( $accepted_version && ! empty( $accepted_version['created_at'] ) ) {
            $accepted_version_message = sprintf(
                esc_html__( 'Has aceptado la versión de fecha %s.', 'wp-travel-giav' ),
                esc_html( wp_travel_giav_format_datetime( strtotime( $accepted_version['created_at'] ) ) )
            );
        }

        // Permitir aceptación en la vista pública siempre que exista una versión vigente
        // y la propuesta no esté ya aceptada. Históricamente el estado ha variado
        // (draft/sent/published), así que no acoplamos la UI a un único literal.
        $can_accept = $proposal_status !== 'accepted'
            && ! empty( $proposal['proposal_token'] )
            && ! empty( $proposal['current_version_id'] );
        $meta_parts = [];
        if ( $pax_total ) {
            $meta_parts[] = sprintf( '%d pax', $pax_total );
        }
        if ( $players_total ) {
            $meta_parts[] = sprintf( '%d jugadores', $players_total );
        }
        if ( $currency ) {
            $meta_parts[] = $currency;
        }
        $meta_line = implode( ' | ', $meta_parts );
        $rest_nonce = wp_create_nonce( 'wp_rest' );
        $accept_endpoint = rest_url( 'travel/v1/proposals/public/' . $proposal['proposal_token'] . '/accept' );
        $public_payload = [
            'restNonce' => $rest_nonce,
            'token'     => $proposal['proposal_token'],
        ];
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
                .proposal-accept {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    align-items: center;
                    text-align: center;
                }
                .proposal-accept__button {
                    background: #0ea5e9;
                    color: #ffffff;
                    border: none;
                    border-radius: 999px;
                    padding: 12px 24px;
                    font-size: 15px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .proposal-accept__button[disabled] {
                    opacity: 0.6;
                    cursor: default;
                }
                .proposal-accept__message {
                    color: #15803d;
                    background: #ecfdf3;
                    border: 1px solid #bbf7d0;
                    border-radius: 12px;
                    padding: 12px 18px;
                    font-size: 14px;
                }
                .proposal-accept__note {
                    color: #475569;
                    font-size: 13px;
                }
                .proposal-accept__form {
                    margin-top: 16px;
                    display: grid;
                    gap: 12px;
                    padding: 16px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                }
                .proposal-accept__field {
                    display: grid;
                    gap: 6px;
                    text-align: left;
                }
                .proposal-accept__field label {
                    font-size: 13px;
                    color: #475569;
                }
                .proposal-accept__field input {
                    border-radius: 12px;
                    border: 1px solid #cbd5f5;
                    padding: 10px 12px;
                    font-size: 14px;
                }
                .proposal-accept__actions {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .proposal-section h2 {
                    margin: 0 0 16px;
                    font-size: 18px;
                }
                .travel-dates {
                    font-size: 15px;
                    color: #0f172a;
                    font-weight: 600;
                }
                .proposal-meta {
                    font-size: 13px;
                    color: #475569;
                }
                .includes-block {
                    background: #f8fafc;
                    border-radius: 14px;
                    padding: 16px 18px;
                    border: 1px solid #e2e8f0;
                    margin-top: 16px;
                }
                .includes-block h3 {
                    margin: 0 0 10px;
                    font-size: 16px;
                }
                .includes-list {
                    margin: 0;
                    padding-left: 18px;
                    display: grid;
                    gap: 6px;
                }
                .includes-list ul {
                    margin-top: 8px;
                }
                .service-group {
                    margin-top: 24px;
                }
                .service-group h3 {
                    margin: 0 0 12px;
                    font-size: 16px;
                }
                .service-group__grid {
                    display: grid;
                    gap: 14px;
                }
                .service-card {
                    padding: 16px;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    background: #ffffff;
                }
                .service-card__title {
                    font-weight: 600;
                    margin-bottom: 6px;
                }
                .service-card__meta {
                    font-size: 13px;
                    color: #475569;
                    margin-bottom: 8px;
                }
                .service-card__details {
                    font-size: 14px;
                    color: #1f2937;
                    display: grid;
                    gap: 6px;
                }
                .service-card__note {
                    margin-top: 10px;
                    padding: 10px 12px;
                    border-radius: 10px;
                    background: #f1f5f9;
                    font-size: 13px;
                    color: #0f172a;
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
                .totals-note {
                    margin-top: 12px;
                    font-size: 12px;
                    color: #64748b;
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
                    <?php if ( $dates ) : ?>
                        <div class="travel-dates">Fechas: <?php echo esc_html( $dates ); ?></div>
                    <?php endif; ?>
                    <?php if ( $meta_line ) : ?>
                        <div class="proposal-meta"><?php echo esc_html( $meta_line ); ?></div>
                    <?php endif; ?>
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

            <?php if ( $accepted_message || $can_accept ) : ?>
                <div class="proposal-section proposal-accept" id="proposal-accept">
                    <?php if ( $accepted_message ) : ?>
                        <div class="proposal-accept__message" id="proposal-accept-message">
                            <?php echo esc_html( $accepted_message ); ?>
                            <?php if ( $accepted_version_message ) : ?>
                                <div><?php echo esc_html( $accepted_version_message ); ?></div>
                            <?php endif; ?>
                        </div>
                    <?php elseif ( $can_accept ) : ?>
                        <div class="proposal-accept__note">¿Todo correcto? Puedes confirmar la propuesta desde aquí.</div>
                        <button type="button" class="proposal-accept__button" id="proposal-accept-button">
                            Aceptar propuesta
                        </button>
                        <form class="proposal-accept__form" id="proposal-accept-form" style="display:none;">
                            <div class="proposal-accept__field">
                                <label for="proposal-full-name">Nombre completo *</label>
                                <input type="text" id="proposal-full-name" name="full_name" required minlength="3" />
                            </div>
                            <div class="proposal-accept__field">
                                <label for="proposal-dni">DNI *</label>
                                <input type="text" id="proposal-dni" name="dni" required minlength="6" />
                            </div>
                            <div class="proposal-accept__actions">
                                <button type="submit" class="proposal-accept__button" id="proposal-accept-submit">
                                    Confirmar aceptación
                                </button>
                                <span class="proposal-accept__note">No necesitas registro para confirmar.</span>
                            </div>
                        </form>
                        <div class="proposal-accept__note" id="proposal-accept-feedback" style="display:none;"></div>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <div class="proposal-section">
                <h2>Programa de viaje</h2>
                <?php if ( $includes_hotel || $includes_regimens || $has_green_fee_breakdown || $other_includes ) : ?>
                    <div class="includes-block">
                        <h3>Incluye:</h3>
                        <ul class="includes-list">
                            <?php foreach ( $includes_hotel as $line ) : ?>
                                <li><?php echo esc_html( $line ); ?></li>
                            <?php endforeach; ?>
                            <?php foreach ( $includes_regimens as $line ) : ?>
                                <li><?php echo esc_html( $line ); ?></li>
                            <?php endforeach; ?>
                            <?php if ( $has_green_fee_breakdown ) : ?>
                                <li>
                                    <?php echo esc_html( sprintf( '%d green-fees por jugador en:', $total_green_fees_per_person ) ); ?>
                                    <ul>
                                        <?php foreach ( $golf_fee_breakdown as $fee_detail ) : ?>
                                            <?php
                                            $fee_count = absint( $fee_detail['green_fees'] ?? 0 );
                                            if ( $fee_count <= 0 ) {
                                                continue;
                                            }
                                            $course_label = trim( (string) ( $fee_detail['name'] ?? '' ) );
                                            if ( $course_label === '' ) {
                                                $course_label = __( 'Campo de golf', 'wp-travel-giav' );
                                            }
                                            ?>
                                            <li><?php echo esc_html( sprintf( '%dx %s', $fee_count, $course_label ) ); ?></li>
                                        <?php endforeach; ?>
                                    </ul>
                                </li>
                            <?php endif; ?>
                            <?php foreach ( $other_includes as $line ) : ?>
                                <li><?php echo esc_html( $line ); ?></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                <?php endif; ?>

                <?php if ( $hotel_items ) : ?>
                    <div class="service-group">
                        <h3>Alojamiento</h3>
                        <div class="service-group__grid">
                            <?php foreach ( $hotel_items as $item ) : ?>
                                <?php
                                $display_name = esc_html( $item['display_name'] ?? 'Alojamiento' );
                                $room_type = trim( (string) ( $item['hotel_room_type'] ?? '' ) );
                                $regimen = trim( (string) ( $item['hotel_regimen'] ?? '' ) );
                                $regimen_label = $regimen !== '' ? ( $regimen_labels[ $regimen ] ?? $regimen ) : '';
                                $start_date = self::format_spanish_date( (string) ( $item['start_date'] ?? '' ) );
                                $end_date = self::format_spanish_date( (string) ( $item['end_date'] ?? '' ) );
                                $notes = trim( (string) ( $item['notes_public'] ?? '' ) );
                                $nights = absint( $item['hotel_nights'] ?? 0 );
                                $room_pricing = isset( $item['room_pricing'] ) && is_array( $item['room_pricing'] )
                                    ? $item['room_pricing']
                                    : [];
                                $double_enabled = ! empty( $room_pricing['double']['enabled'] );
                                $single_enabled = ! empty( $room_pricing['single']['enabled'] );
                                $meta_parts = [];
                                if ( $start_date || $end_date ) {
                                    $meta_parts[] = trim( implode( ' → ', array_filter( [ $start_date, $end_date ] ) ) );
                                }
                                if ( $nights > 0 ) {
                                    $meta_parts[] = sprintf( '%d noche%s', $nights, $nights === 1 ? '' : 's' );
                                }
                                $meta_line = implode( ' · ', $meta_parts );
                                ?>
                                <div class="service-card">
                                    <div class="service-card__title"><?php echo $display_name; ?></div>
                                    <?php if ( $meta_line ) : ?>
                                        <div class="service-card__meta"><?php echo esc_html( $meta_line ); ?></div>
                                    <?php endif; ?>
                                    <?php if ( $room_type || $regimen_label ) : ?>
                                        <div class="service-card__details">
                                            <?php if ( $room_type ) : ?>
                                                <div>Tipo de habitación: <?php echo esc_html( $room_type ); ?></div>
                                            <?php endif; ?>
                                            <?php if ( $regimen_label ) : ?>
                                                <div>Régimen: <?php echo esc_html( $regimen_label ); ?></div>
                                            <?php endif; ?>
                                        </div>
                                    <?php endif; ?>
                                    <?php if ( $double_enabled || $single_enabled ) : ?>
                                        <div class="service-card__details">
                                            <?php if ( $double_enabled ) : ?>
                                                <?php
                                                $double_rooms = absint( $room_pricing['double']['rooms'] ?? 0 );
                                                $double_label = $double_rooms > 0
                                                    ? sprintf( 'Habitaciones dobles (%d hab.)', $double_rooms )
                                                    : 'Habitaciones dobles';
                                                ?>
                                                <div><?php echo esc_html( $double_label ); ?></div>
                                            <?php endif; ?>
                                            <?php if ( $single_enabled ) : ?>
                                                <?php
                                                $single_rooms = absint( $room_pricing['single']['rooms'] ?? 0 );
                                                $single_label = $single_rooms > 0
                                                    ? sprintf( 'Habitaciones individuales (%d hab.)', $single_rooms )
                                                    : 'Habitaciones individuales';
                                                ?>
                                                <div><?php echo esc_html( $single_label ); ?></div>
                                            <?php endif; ?>
                                        </div>
                                    <?php endif; ?>

                                    <?php
                                    $hotel_pricing_mode = isset( $item['hotel_pricing_mode'] ) ? (string) $item['hotel_pricing_mode'] : '';
                                    if ( $hotel_pricing_mode === '' && isset( $item['pricing_mode'] ) ) {
                                        $hotel_pricing_mode = (string) $item['pricing_mode'];
                                    }
                                    $nightly_rates = [];
                                    if ( isset( $item['nightly_rates'] ) && is_array( $item['nightly_rates'] ) ) {
                                        $nightly_rates = $item['nightly_rates'];
                                    } elseif ( isset( $item['hotel_nightly_rates'] ) && is_array( $item['hotel_nightly_rates'] ) ) {
                                        $nightly_rates = $item['hotel_nightly_rates'];
                                    }
                                    ?>
                                    <?php if ( $hotel_pricing_mode === 'per_night' && ! empty( $nightly_rates ) ) : ?>
                                        <details class="service-card__details" style="margin-top:10px;">
                                            <summary><?php echo esc_html__( 'Precio variable por noche', 'wp-travel-giav' ); ?></summary>
                                            <div style="overflow:auto; margin-top:8px;">
                                                <table style="width:100%; border-collapse:collapse;">
                                                    <thead>
                                                        <tr>
                                                            <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #e5e7eb;"><?php echo esc_html__( 'Fecha', 'wp-travel-giav' ); ?></th>
                                                            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #e5e7eb;"><?php echo esc_html__( 'Neto', 'wp-travel-giav' ); ?></th>
                                                            <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #e5e7eb;"><?php echo esc_html__( 'Margen', 'wp-travel-giav' ); ?></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <?php foreach ( $nightly_rates as $row ) : ?>
                                                            <?php
                                                            if ( ! is_array( $row ) ) {
                                                                continue;
                                                            }
                                                            $row_date = self::format_spanish_date( (string) ( $row['date'] ?? '' ) );
                                                            $net = isset( $row['net_price'] ) ? (float) $row['net_price'] : (float) ( $row['unit_cost_net'] ?? 0 );
                                                            $margin_pct = isset( $row['margin_pct'] ) ? (float) $row['margin_pct'] : (float) ( $row['margin'] ?? 0 );
                                                            ?>
                                                            <tr>
                                                                <td style="padding:6px 8px; border-bottom:1px solid #f1f5f9;"><?php echo esc_html( $row_date ?: (string) ( $row['date'] ?? '' ) ); ?></td>
                                                                <td style="padding:6px 8px; text-align:right; border-bottom:1px solid #f1f5f9;"><?php echo esc_html( $currency_label ); ?> <?php echo esc_html( number_format( $net, 2 ) ); ?></td>
                                                                <td style="padding:6px 8px; text-align:right; border-bottom:1px solid #f1f5f9;"><?php echo esc_html( number_format( $margin_pct, 2 ) ); ?>%</td>
                                                            </tr>
                                                        <?php endforeach; ?>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                    <?php endif; ?>
                                    <?php if ( $notes ) : ?>
                                        <div class="service-card__note"><?php echo esc_html( $notes ); ?></div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endif; ?>

                <?php if ( $golf_items ) : ?>
                    <div class="service-group">
                        <h3>Golf</h3>
                        <div class="service-group__grid">
                            <?php foreach ( $golf_items as $item ) : ?>
                                <?php
                                $display_name = esc_html( $item['display_name'] ?? 'Campo de golf' );
                                $start_date = self::format_spanish_date( (string) ( $item['start_date'] ?? '' ) );
                                $end_date = self::format_spanish_date( (string) ( $item['end_date'] ?? '' ) );
                                $notes = trim( (string) ( $item['notes_public'] ?? '' ) );
                                $green_value = absint( $item['green_fees_per_person'] ?? 0 );
                                if ( $green_value <= 0 ) {
                                    $green_value = 1;
                                }
                                $golf_meta = [];
                                if ( $start_date || $end_date ) {
                                    $golf_meta[] = trim( implode( ' → ', array_filter( [ $start_date, $end_date ] ) ) );
                                }
                                if ( $green_value > 0 ) {
                                    $golf_meta[] = sprintf( '%d green-fees por jugador', $green_value );
                                }
                                $golf_meta_line = implode( ' · ', $golf_meta );
                                ?>
                                <div class="service-card">
                                    <div class="service-card__title"><?php echo $display_name; ?></div>
                                    <?php if ( $golf_meta_line ) : ?>
                                        <div class="service-card__meta"><?php echo esc_html( $golf_meta_line ); ?></div>
                                    <?php endif; ?>
                                    <?php if ( $notes ) : ?>
                                        <div class="service-card__note"><?php echo esc_html( $notes ); ?></div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endif; ?>

                <?php if ( $other_items ) : ?>
                    <div class="service-group">
                        <h3>Extras y transfers</h3>
                        <div class="service-group__grid">
                            <?php foreach ( $other_items as $item ) : ?>
                                <?php
                                $display_name = esc_html( $item['display_name'] ?? 'Servicio' );
                                $start_date = self::format_spanish_date( (string) ( $item['start_date'] ?? '' ) );
                                $end_date = self::format_spanish_date( (string) ( $item['end_date'] ?? '' ) );
                                $notes = trim( (string) ( $item['notes_public'] ?? '' ) );
                                $components_text = trim( (string) ( $item['package_components_text'] ?? '' ) );
                                $meta_parts = [];
                                if ( $start_date || $end_date ) {
                                    $meta_parts[] = trim( implode( ' → ', array_filter( [ $start_date, $end_date ] ) ) );
                                }
                                $meta_line = implode( ' · ', $meta_parts );
                                ?>
                                <div class="service-card">
                                    <div class="service-card__title"><?php echo $display_name; ?></div>
                                    <?php if ( $meta_line ) : ?>
                                        <div class="service-card__meta"><?php echo esc_html( $meta_line ); ?></div>
                                    <?php endif; ?>
                                    <?php if ( $components_text ) : ?>
                                        <div class="service-card__details">
                                            <?php foreach ( array_filter( array_map( 'trim', explode( "\n", $components_text ) ) ) as $line ) : ?>
                                                <div><?php echo esc_html( $line ); ?></div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                    <?php if ( $notes ) : ?>
                                        <div class="service-card__note"><?php echo esc_html( $notes ); ?></div>
                                    <?php endif; ?>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endif; ?>
            </div>

            <div class="proposal-section">
                <h2>Totales</h2>
                <div class="totals-grid">
                    <div class="totals-card">
                        <div class="label">Total viaje</div>
                        <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $pricing['total_trip'], 2 ); ?></div>
                    </div>
                    <?php if ( $pricing['players_count'] > 0 && null !== ( $pricing['price_player_double'] ?? null ) ) : ?>
                        <div class="totals-card">
                            <div class="label">Precio jugador en doble</div>
                            <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $pricing['price_player_double'], 2 ); ?></div>
                        </div>
                    <?php endif; ?>
                    <div class="totals-card">
                        <div class="label">Precio no jugador en doble</div>
                        <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $pricing['price_non_player_double'], 2 ); ?></div>
                    </div>
                    <?php if ( $pricing['has_single_supplement'] ) : ?>
                        <div class="totals-card">
                            <div class="label">Suplemento individual</div>
                            <div class="value"><?php echo esc_html( $currency ); ?> <?php echo number_format( $pricing['supplement_single'], 2 ); ?></div>
                        </div>
                    <?php endif; ?>
                </div>
                <div class="totals-note">
                    Precios por persona. El suplemento individual aplica por persona alojada en habitación individual.
                </div>
            </div>
        </div>
        <script>
            window.TRAVEL_PUBLIC = <?php echo wp_json_encode( $public_payload ); ?>;
        </script>
        <?php if ( $can_accept && ! $accepted_message ) : ?>
        <script>
            (function () {
                const button = document.getElementById('proposal-accept-button');
                const form = document.getElementById('proposal-accept-form');
                const submitButton = document.getElementById('proposal-accept-submit');
                const fullNameInput = document.getElementById('proposal-full-name');
                const dniInput = document.getElementById('proposal-dni');
                if (!button) return;
                const feedback = document.getElementById('proposal-accept-feedback');
                button.addEventListener('click', () => {
                    if (form) {
                        form.style.display = 'grid';
                    }
                    button.style.display = 'none';
                    if (fullNameInput) {
                        fullNameInput.focus();
                    }
                });
                if (!form) return;
                form.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (submitButton?.disabled) return;
                    const restNonce = window.TRAVEL_PUBLIC && window.TRAVEL_PUBLIC.restNonce;
                    if (!restNonce) {
                        if (feedback) {
                            feedback.textContent = 'No se pudo validar la solicitud.';
                            feedback.style.display = 'block';
                        }
                        return;
                    }
                    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
                    let dni = dniInput ? dniInput.value.trim() : '';
                    dni = dni.toUpperCase().replace(/\s+/g, '');
                    if (fullName.length < 3) {
                        if (feedback) {
                            feedback.textContent = 'Introduce tu nombre completo.';
                            feedback.style.display = 'block';
                        }
                        return;
                    }
                    if (dni.length < 6) {
                        if (feedback) {
                            feedback.textContent = 'Introduce un DNI válido.';
                            feedback.style.display = 'block';
                        }
                        return;
                    }
                    if (submitButton) {
                        submitButton.disabled = true;
                    }
                    if (feedback) {
                        feedback.textContent = 'Procesando aceptación...';
                        feedback.style.display = 'block';
                    }
                    try {
                        const res = await fetch('<?php echo esc_url_raw( $accept_endpoint ); ?>', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-WP-Nonce': restNonce
                            },
                            credentials: 'same-origin',
                            body: JSON.stringify({ full_name: fullName, dni })
                        });
                        const payload = await res.json();
                        if (!res.ok || !payload?.ok) {
                            throw new Error(payload?.message || 'No se pudo registrar la aceptación.');
                        }
                        if (feedback) {
                            feedback.textContent = payload?.message || '';
                            feedback.style.display = payload?.message ? 'block' : 'none';
                        }
                        window.location.reload();
                    } catch (err) {
                        if (feedback) {
                            feedback.textContent = err?.message || 'No se pudo registrar la aceptación.';
                            feedback.style.display = 'block';
                        }
                        if (submitButton) {
                            submitButton.disabled = false;
                        }
                    }
                });
            })();
        </script>
        <?php endif; ?>
        </body>
        </html>
        <?php
        exit;
    }

    private static function get_proposal_url( string $token ) {
        return home_url( '/travel-proposal/' . $token . '/' );
    }

    private static function compute_pricing_breakdown( array $items, array $totals, array $header ) : array {
        $pax_total = absint( $header['pax_total'] ?? 0 );
        $players_raw = isset( $header['players_count'] ) ? (int) $header['players_count'] : $pax_total;
        $players_count = min( $pax_total, max( 0, $players_raw ) );
        $non_players_count = max( 0, $pax_total - $players_count );

        $golf_total = 0.0;
        $total_double = 0.0;
        $total_single = 0.0;
        $double_rooms = 0;
        $single_rooms = 0;

        foreach ( $items as $item ) {
            $type = $item['service_type'] ?? '';
            if ( $type === 'golf' ) {
                $golf_total += (float) ( $item['line_sell_price'] ?? 0 );
            }
            if ( $type === 'hotel' ) {
                $room_pricing = isset( $item['room_pricing'] ) && is_array( $item['room_pricing'] )
                    ? $item['room_pricing']
                    : [];
                if ( ! empty( $room_pricing['double']['enabled'] ) ) {
                    $double_rooms += absint( $room_pricing['double']['rooms'] ?? 0 );
                    $total_double += (float) ( $room_pricing['double']['total_pvp'] ?? 0 );
                }
                if ( ! empty( $room_pricing['single']['enabled'] ) ) {
                    $single_rooms += absint( $room_pricing['single']['rooms'] ?? 0 );
                    $total_single += (float) ( $room_pricing['single']['total_pvp'] ?? 0 );
                }
            }
        }

        $total_trip = isset( $totals['totals_sell_price'] ) ? (float) $totals['totals_sell_price'] : 0.0;

        // Compute per-person hotel prices using capacities
        $pax_double_cap = $double_rooms * 2;
        $pax_single_cap = $single_rooms;

        $pp_double = ( $pax_double_cap > 0 ) ? ( $total_double / $pax_double_cap ) : 0.0;
        $pp_single = ( $pax_single_cap > 0 ) ? ( $total_single / $pax_single_cap ) : 0.0;

        $has_single_supplement = $pax_double_cap > 0 && $pax_single_cap > 0;
        $supplement_single = null;
        if ( $has_single_supplement ) {
            $supplement_single = max( 0, $pp_single - $pp_double );
        }

        // common_total = total_trip - hotel_double - hotel_single - golf_total
        $common_total = $total_trip - ( $total_double + $total_single ) - $golf_total;
        $common_pp = ( $pax_total > 0 ) ? ( $common_total / $pax_total ) : 0.0;

        $price_non_player_double = $pp_double + $common_pp;
        $price_player_double = null;
        if ( $players_count > 0 && $golf_total > 0 ) {
            $price_player_double = $price_non_player_double + ( $golf_total / $players_count );
        }

        return [
            'pax_total'                => $pax_total,
            'players_count'            => $players_count,
            'non_players_count'        => $non_players_count,
            'golf_total'               => $golf_total,
            'total_trip'               => $total_trip,
            'price_non_player_double'  => $price_non_player_double,
            'price_player_double'      => $price_player_double,
            'has_single_supplement'    => $has_single_supplement,
            'supplement_single'        => $supplement_single,
            'pp_double'                => $pp_double,
            'pp_single'                => $pp_single,
            'pax_double_cap'           => $pax_double_cap,
            'pax_single_cap'           => $pax_single_cap,
        ];
    }

    private static function render_pending_confirmation_view(
        array $totals,
        string $dates,
        string $currency,
        array $pricing,
        string $destination
    ) {
        status_header( 200 );
        header( 'Content-Type: text/html; charset=' . get_option( 'blog_charset' ) );

        $total_value = isset( $totals['totals_sell_price'] ) ? (float) $totals['totals_sell_price'] : 0;
        $currency_label = $currency ?: 'EUR';
        $show_player_price = ( $pricing['players_count'] ?? 0 ) > 0 && null !== ( $pricing['price_player_double'] ?? null );
        $show_supplement = ! empty( $pricing['has_single_supplement'] );
        ?>
        <!doctype html>
        <html lang="<?php echo esc_attr( get_bloginfo( 'language' ) ); ?>">
        <head>
            <meta charset="<?php echo esc_attr( get_option( 'blog_charset' ) ); ?>">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title><?php echo esc_html__( 'Propuesta aceptada', 'wp-travel-giav' ); ?></title>
            <style>
                :root {
                    color-scheme: light;
                }
                body {
                    margin: 0;
                    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                    background: #f1f5f9;
                    color: #0f172a;
                }
                .proposal-page {
                    max-width: 860px;
                    margin: 0 auto;
                    padding: 48px 24px 64px;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .proposal-accepted__hero {
                    text-align: center;
                    padding: 36px 24px;
                    border-radius: 20px;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 25px 60px rgba(15, 23, 42, 0.08);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .proposal-accepted__status {
                    font-size: 12px;
                    letter-spacing: 0.4em;
                    text-transform: uppercase;
                    color: #0f172a;
                    font-weight: 600;
                }
                .proposal-accepted__message {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 600;
                }
                .proposal-accepted__secondary {
                    margin: 0;
                    color: #475569;
                    line-height: 1.6;
                    font-size: 16px;
                }
                .proposal-accepted__summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 16px;
                }
                .proposal-accepted__tile {
                    background: #ffffff;
                    border-radius: 16px;
                    padding: 20px;
                    border: 1px solid #e2e8f0;
                    text-align: center;
                }
                .proposal-accepted__label {
                    font-size: 14px;
                    color: #475569;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }
                .proposal-accepted__value {
                    margin-top: 4px;
                    font-size: 26px;
                    font-weight: 700;
                    color: #0f172a;
                }
                .proposal-accepted__details {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 16px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .proposal-accepted__detail-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 15px;
                    color: #0f172a;
                }
                .proposal-accepted__detail-row span {
                    color: #94a3b8;
                    font-size: 13px;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                }
                .proposal-accepted__detail-row strong {
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
        <main class="proposal-page proposal-accepted">
            <section class="proposal-accepted__hero">
                <div class="proposal-accepted__status">
                    <?php echo esc_html__( 'Propuesta aceptada', 'wp-travel-giav' ); ?>
                </div>
                <p class="proposal-accepted__message">
                    <?php echo esc_html__( 'Propuesta aceptada. Ahora vamos a confirmar los servicios.', 'wp-travel-giav' ); ?>
                </p>
                <p class="proposal-accepted__secondary">
                    <?php echo esc_html__( 'Te avisaremos por email cuando tu reserva esté confirmada y puedas acceder al portal para pagos y gestión.', 'wp-travel-giav' ); ?>
                </p>
            </section>
            <section class="proposal-accepted__summary">
                <div class="proposal-accepted__tile">
                    <div class="proposal-accepted__label">
                        <?php echo esc_html__( 'Precio total', 'wp-travel-giav' ); ?>
                    </div>
                    <div class="proposal-accepted__value">
                        <?php echo esc_html( $currency_label ); ?> <?php echo number_format( $total_value, 2 ); ?>
                    </div>
                </div>
                <?php if ( $show_player_price ) : ?>
                    <div class="proposal-accepted__tile">
                        <div class="proposal-accepted__label">
                            <?php echo esc_html__( 'Precio jugador en doble', 'wp-travel-giav' ); ?>
                        </div>
                        <div class="proposal-accepted__value">
                            <?php echo esc_html( $currency_label ); ?> <?php echo number_format( (float) $pricing['price_player_double'], 2 ); ?>
                        </div>
                    </div>
                <?php endif; ?>
                <div class="proposal-accepted__tile">
                    <div class="proposal-accepted__label">
                        <?php echo esc_html__( 'Precio no jugador en doble', 'wp-travel-giav' ); ?>
                    </div>
                    <div class="proposal-accepted__value">
                        <?php echo esc_html( $currency_label ); ?> <?php echo number_format( (float) $pricing['price_non_player_double'], 2 ); ?>
                    </div>
                </div>
                <?php if ( $show_supplement ) : ?>
                    <div class="proposal-accepted__tile">
                        <div class="proposal-accepted__label">
                            <?php echo esc_html__( 'Suplemento individual', 'wp-travel-giav' ); ?>
                        </div>
                        <div class="proposal-accepted__value">
                            <?php echo esc_html( $currency_label ); ?> <?php echo number_format( (float) $pricing['supplement_single'], 2 ); ?>
                        </div>
                    </div>
                <?php endif; ?>
            </section>
            <?php if ( $dates || $destination ) : ?>
                <section class="proposal-accepted__details">
                    <?php if ( $dates ) : ?>
                        <div class="proposal-accepted__detail-row">
                            <span><?php echo esc_html__( 'Fechas', 'wp-travel-giav' ); ?></span>
                            <strong><?php echo esc_html( $dates ); ?></strong>
                        </div>
                    <?php endif; ?>
                    <?php if ( $destination ) : ?>
                        <div class="proposal-accepted__detail-row">
                            <span><?php echo esc_html__( 'Destino', 'wp-travel-giav' ); ?></span>
                            <strong><?php echo esc_html( $destination ); ?></strong>
                        </div>
                    <?php endif; ?>
                </section>
            <?php endif; ?>
        </main>
        </body>
        </html>
        <?php
        exit;
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

    private static function format_spanish_date( string $date ) : string {
        $date = trim( $date );
        if ( $date === '' ) {
            return '';
        }
        $timestamp = strtotime( $date );
        if ( ! $timestamp ) {
            return $date;
        }
        return wp_date( 'j \\d\\e F \\d\\e Y', $timestamp );
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
