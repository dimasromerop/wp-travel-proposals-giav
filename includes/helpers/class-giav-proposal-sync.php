<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_debug_enabled(): bool {
    return defined( 'CASANOVA_GIAV_DEBUG' ) && CASANOVA_GIAV_DEBUG;
}

function wp_travel_giav_pending_timeout_seconds(): int {
    return (int) apply_filters( 'wp_travel_giav_pending_timeout_seconds', 300 );
}

function wp_travel_giav_pending_is_stale( array $proposal ): bool {
    $timestamp = null;
    if ( ! empty( $proposal['giav_sync_updated_at'] ) ) {
        $timestamp = mysql2date( 'U', $proposal['giav_sync_updated_at'], false );
    }

    if ( $timestamp === null || $timestamp === 0 ) {
        return true;
    }

    return ( time() - $timestamp ) > wp_travel_giav_pending_timeout_seconds();
}

function wp_travel_giav_call( string $method, array $params = [], array &$trace = null ) {
    $client = new WP_Travel_GIAV_Soap_Client();
    $response = $client->call( $method, $params );

    $trace = [
        'method'        => $client->get_last_method(),
        'duration_ms'   => $client->get_last_duration_ms(),
        'last_request'  => $client->get_last_request(),
        'last_response' => $client->get_last_response(),
    ];

    if ( wp_travel_giav_debug_enabled() ) {
        error_log( sprintf(
            '[WP Travel GIAV] %s completed in %.1f ms',
            $method,
            $trace['duration_ms']
        ) );
        if ( is_wp_error( $response ) ) {
            error_log( sprintf( '[WP Travel GIAV] %s error: %s', $method, $response->get_error_message() ) );
            if ( ! empty( $trace['last_request'] ) ) {
                error_log( '[WP Travel GIAV] Last Request: ' . $trace['last_request'] );
            }
            if ( ! empty( $trace['last_response'] ) ) {
                error_log( '[WP Travel GIAV] Last Response: ' . $trace['last_response'] );
            }
        }
    }

    return $response;
}

function wp_travel_giav_extract_id_from_response( $response, array $candidate_keys = [] ): ?int {
    if ( is_int( $response ) ) {
        return $response > 0 ? $response : null;
    }

    if ( is_numeric( $response ) ) {
        $value = (int) $response;
        return $value > 0 ? $value : null;
    }

    if ( ! is_object( $response ) ) {
        return null;
    }

    foreach ( $candidate_keys as $key ) {
        if ( isset( $response->$key ) && is_numeric( $response->$key ) ) {
            $value = (int) $response->$key;
            return $value > 0 ? $value : null;
        }
    }

    foreach ( get_object_vars( $response ) as $key => $value ) {
        if ( is_numeric( $value ) && ( stripos( $key, 'Result' ) !== false || stripos( $key, 'Id' ) !== false ) ) {
            $value = (int) $value;
            return $value > 0 ? $value : null;
        }
    }

    return null;
}

function wp_travel_giav_normalize_dni( string $dni ): string {
    $dni = strtoupper( preg_replace( '/\s+/', '', $dni ) );
    return trim( $dni );
}

function wp_travel_giav_split_full_name( string $full_name ): array {
    $full_name = trim( preg_replace( '/\s+/', ' ', $full_name ) );
    if ( $full_name === '' ) {
        return [ 'nombre' => '', 'apellidos' => '' ];
    }

    $parts = explode( ' ', $full_name );
    if ( count( $parts ) === 1 ) {
        $word = $parts[0];
        return [ 'nombre' => $word, 'apellidos' => $word ];
    }

    $surname = array_pop( $parts );
    return [
        'nombre'    => trim( implode( ' ', $parts ) ),
        'apellidos' => trim( $surname ),
    ];
}

function wp_travel_giav_format_date( ?string $value ): ?string {
    if ( $value === null ) {
        return null;
    }

    $value = trim( (string) $value );
    if ( $value === '' ) {
        return null;
    }

    $timestamp = strtotime( $value );
    if ( $timestamp === false ) {
        return null;
    }

    return gmdate( 'Y-m-d', $timestamp );
}

function wp_travel_giav_get_destination_country_code( array $proposal, array $snapshot ): ?string {
    $header = $snapshot['header'] ?? [];
    $candidates = [
        $header['customer_country'] ?? '',
        $proposal['customer_country'] ?? '',
    ];

    foreach ( $candidates as $candidate ) {
        $candidate = strtoupper( trim( (string) $candidate ) );
        if ( $candidate !== '' ) {
            return $candidate;
        }
    }

    return null;
}

function wp_travel_giav_resolve_destination( array $proposal, array $snapshot ): array {
    $country = wp_travel_giav_get_destination_country_code( $proposal, $snapshot );
    $country = $country !== null ? strtoupper( $country ) : '';

    $eu_countries = [
        'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU',
        'IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    ];

    $destino = 'RestoMundo';
    $zone = 'XX_No_requerido';

    if ( $country === 'ES' ) {
        $destino = 'Nacional';
        $zone = 'ES_Nacional';
    } elseif ( in_array( $country, $eu_countries, true ) ) {
        $destino = 'UniónEuropea';
        $zone = 'ES_UnionEuropea';
    }

    return [
        'code'  => $country !== '' ? $country : null,
        'destino' => $destino,
        'zone' => $zone,
    ];
}

function wp_travel_giav_extract_client_search_id( $item ): ?int {
    if ( ! is_object( $item ) ) {
        return null;
    }

    $keys = [ 'Id', 'ID', 'id', 'idCliente', 'IdCliente', 'idcliente', 'IDCliente' ];
    foreach ( $keys as $key ) {
        if ( isset( $item->$key ) && is_numeric( $item->$key ) ) {
            $value = (int) $item->$key;
            if ( $value > 0 ) {
                return $value;
            }
        }
    }

    foreach ( get_object_vars( $item ) as $value ) {
        if ( is_numeric( $value ) ) {
            $value = (int) $value;
            if ( $value > 0 ) {
                return $value;
            }
        }
    }

    return null;
}

function wp_travel_giav_get_default_tax_type(): string {
    return (string) apply_filters( 'wp_travel_giav_default_tax_type', 'G' );
}

function wp_travel_giav_cliente_search_por_dni( string $dni, array &$trace = null ): ?int {
    $dni = wp_travel_giav_normalize_dni( $dni );
    if ( $dni === '' ) {
        return null;
    }

    $params = [
        'documento'             => $dni,
        'documentoModo'         => 'Solo_NIF',
        'documentoExacto'       => true,
        'incluirDeshabilitados' => false,
        'modoFecha'             => 'Creacion',
        'fechaHoraDesde'        => null,
        'fechaHoraHasta'        => null,
        'edadDesde'             => null,
        'edadHasta'             => null,
        'pageSize'              => 50,
        'pageIndex'             => 0,
    ];

    $response = wp_travel_giav_call( 'Cliente_SEARCH', $params, $trace );

    if ( is_wp_error( $response ) ) {
        $fallback_params = [
            'documento'             => $dni,
            'documentoModo'         => 'Solo_NIF',
            'documentoExacto'       => true,
            'incluirDeshabilitados' => false,
            'modoFecha'             => 'Creacion',
            'fechaHoraDesde'        => null,
            'fechaHoraHasta'        => null,
            'edadDesde'             => null,
            'edadHasta'             => null,
            'pageSize'              => 50,
            'pageIndex'             => 0,
        ];
        $response = wp_travel_giav_call( 'Cliente_SEARCH', $fallback_params, $trace );
    }

    if ( is_wp_error( $response ) ) {
        return null;
    }

    $list = null;
    if ( is_object( $response ) && isset( $response->Cliente_SEARCHResult ) ) {
        $list = $response->Cliente_SEARCHResult;
    } else {
        $list = $response;
    }

    if ( $list === null ) {
        return null;
    }

    if ( is_object( $list ) && isset( $list->WsCliente ) ) {
        $list = $list->WsCliente;
    }

    $items = [];
    if ( is_array( $list ) ) {
        $items = $list;
    } elseif ( is_object( $list ) ) {
        $items = [ $list ];
    }

    foreach ( $items as $item ) {
        $id = wp_travel_giav_extract_client_search_id( $item );
        if ( $id ) {
            return $id;
        }
    }

    return null;
}

function wp_travel_giav_cliente_create( array $data, array &$trace = null ) {
    $params = [
        'tipoCliente'                   => 'Particular',
        'documento'                     => $data['dni'] ?? '',
        'email'                         => $data['email'] ?? '',
        'apellidos'                     => $data['apellidos'] ?? '',
        'nombre'                        => $data['nombre'] ?? '',
        'telefono'                      => $data['telefono'] ?? '',
        'comentarios'                   => $data['comentarios'] ?? '',
        'creditoImporte'                => 0,
        'traspasaDepartamentos'         => false,
        'factTotalizadora'              => false,
        'deshabilitado'                 => false,
        'empresa_Facturar_Reg_General'  => false,
        'idTaxDistrict'                 => null,
        'comisionesIVAIncluido'         => false,
        'comisionesComisionDefecto'     => null,
        'excluir_347_349'               => false,
        'idAgenteComercial'             => null,
        'validaAeat'                    => false,
        'idEntityStage'                 => null,
        'idPaymentTerm'                 => null,
        'validaROI'                     => false,
        'inscritoROI'                   => false,
        'idSepatipo'                    => 'Puntual',
        'idSepaEstado'                  => 'Pendiente',
        'sepaFecha'                     => null,
        'mailingConsent'                => 'Pending',
        'rgpdSigned'                    => false,
        'customerPortal_Enabled'        => false,
        'customerPortal_Email'          => '',
        'customerPortal_Password'       => '',
        'customerPortal_DefaultVendorId'=> null,
        'customerPortal_Zone_TravelFiles'=> false,
        'customerPortal_Zone_Invoicing' => false,
        'customerPortal_Zone_Payments'  => false,
        'customerPortal_Zone_Contact'   => false,
        'facturaECodPais'               => 'ESP',
        'facturaEAcepta'                => false,
        'printOptions'                  => null,
        'customDataValues'              => null,
    ];

    return wp_travel_giav_call( 'Cliente_POST', $params, $trace );
}

function wp_travel_giav_expediente_create( array $data, array &$trace = null ) {
    $params = [
        'idOficina'             => null,
        'idCliente'             => (int) $data['id_cliente'],
        'idDepartamento'        => null,
        'idAgenteComercial'     => null,
        'idEntityStage'         => null,
        'esGrupo'               => false,
        'titulo'                => $data['titulo'] ?? '',
        'observacionesInternas' => $data['observaciones'] ?? '',
        'fechaApertura'         => $data['fecha_apertura'] ?? null,
        'fechaDesde'            => $data['fecha_desde'] ?? null,
        'fechaHasta'            => $data['fecha_hasta'] ?? null,
        'destinationIdCountryZone' => null,
    ];

    return wp_travel_giav_call( 'Expediente_POST', $params, $trace );
}

function wp_travel_giav_build_reserva_payload( array $data ): array {
    $defaults = [
        'idExpediente'                   => 0,
        'idCliente'                      => 0,
        'idProveedor'                    => 0,
        'idPrestatario'                  => null,
        'idProducto'                     => null,
        'idGastoGestion'                 => null,
        'idAgenteComercial'              => null,
        'tipoReserva'                    => 'OT',
        'subtipoReserva'                 => null,
        'descripcion'                    => '',
        'textoBono'                      => null,
        'observaciones'                  => null,
        'codModalidadpago'               => 'C',
        'fechaPrepago'                   => null,
        'pagaderoPor'                    => null,
        'ventacomis'                     => 0,
        'costeComis'                     => 0,
        'ventaNoComis'                   => 0,
        'costeNoComis'                   => 0,
        'porcentajeComisionMinorista'    => 0,
        'comisionMinoristaIncluyeImpuestos' => false,
        'gastosGestion'                  => 0,
        'recuperacion'                   => 0,
        'margenOperacionPrevisto'        => null,
        'comisionAgenteComercial'        => 0,
        'tipoIVA'                        => wp_travel_giav_get_default_tax_type(),
        'rooming'                        => null,
        'fechadesde'                     => null,
        'fechahasta'                     => null,
        'fechalimite'                    => null,
        'regimen'                        => null,
        'uso1'                           => null,
        'uso2'                           => null,
        'uso3'                           => null,
        'uso4'                           => null,
        'num1'                           => null,
        'num2'                           => null,
        'num3'                           => null,
        'num4'                           => null,
        'clienteBono'                    => null,
        'localizador'                    => null,
        'via'                            => 'WP Travel',
        'numPax'                         => null,
        'numAdultos'                     => null,
        'numNinos'                       => null,
        'ts_MultiData0'                  => null,
        'ts_MultiData1'                  => null,
        'ts_MultiData2'                  => null,
        'ts_MultiData3'                  => null,
        'ts_MultiData4'                  => null,
        'destinationCountryISO3166Code'  => null,
        'destinationIdCountryZone'       => null,
        'CodSolicitud'                   => null,
        'servicioOtrosOtrosREAV'         => false,
        'idEntityStage'                  => null,
        'customDataValues'               => null,
        'idsPasajeros'                   => null,
        'Anidacion_IdReservaContenedora' => null,
    ];

    return array_merge( $defaults, $data );
}

function wp_travel_giav_reserva_normal_create( array $data, array &$trace = null ) {
    $payload = wp_travel_giav_build_reserva_payload( $data );
    return wp_travel_giav_call( 'Reserva_Normal_POST', $payload, $trace );
}

function wp_travel_giav_send_error_notification( array $proposal, string $error, array $trace = [] ) {
    $internal_email = wp_travel_giav_get_internal_notification_email();
    if ( ! $internal_email ) {
        return;
    }

    $message_lines = [
        'GIAV sync error',
        'Proposal ID: #' . (int) ( $proposal['id'] ?? 0 ),
        'Token: ' . ( $proposal['proposal_token'] ?? '' ),
        'Accepted version: ' . ( $proposal['accepted_version_id'] ?? '' ),
        'Error: ' . $error,
    ];

    if ( wp_travel_giav_debug_enabled() && ! empty( $trace ) ) {
        $message_lines[] = '';
        $message_lines[] = 'SOAP Trace:';
        $message_lines[] = 'Method: ' . ( $trace['method'] ?? '' );
        $message_lines[] = 'Duration: ' . ( $trace['duration_ms'] ?? '' ) . ' ms';
        if ( ! empty( $trace['last_request'] ) ) {
            $message_lines[] = 'Last Request:';
            $message_lines[] = $trace['last_request'];
        }
        if ( ! empty( $trace['last_response'] ) ) {
            $message_lines[] = 'Last Response:';
            $message_lines[] = $trace['last_response'];
        }
    }

    wp_mail(
        $internal_email,
        'GIAV sync error en propuesta ' . (int) ( $proposal['id'] ?? 0 ),
        implode( "\n", $message_lines ),
        [ 'Content-Type: text/plain; charset=UTF-8' ]
    );
}

function wp_travel_giav_create_expediente_from_proposal( int $proposal_id ) {
    $proposal_repo = new WP_Travel_Proposal_Repository();
    $version_repo  = new WP_Travel_Proposal_Version_Repository();
    $item_repo     = new WP_Travel_Proposal_Item_Repository();
    $reserva_repo  = class_exists( 'WP_Travel_Proposal_GIAV_Reserva_Repository' )
        ? new WP_Travel_Proposal_GIAV_Reserva_Repository()
        : null;

    $proposal = $proposal_repo->get_by_id( $proposal_id );
    if ( ! $proposal ) {
        return new WP_Error( 'proposal_missing', 'Proposal not found.' );
    }

    if ( ! empty( $proposal['giav_expediente_id'] ) ) {
        return [
            'status'             => 'ok',
            'giav_expediente_id' => (int) $proposal['giav_expediente_id'],
        ];
    }

    $pending_status = isset( $proposal['giav_sync_status'] ) ? $proposal['giav_sync_status'] : 'none';
    if ( $pending_status === 'pending' ) {
        if ( ! wp_travel_giav_pending_is_stale( $proposal ) ) {
            return [
                'status' => 'pending',
            ];
        }
        if ( wp_travel_giav_debug_enabled() ) {
            error_log( sprintf(
                '[WP Travel GIAV] Pending sync for proposal #%d appears stale (updated_at=%s); retrying',
                $proposal_id,
                $proposal['giav_sync_updated_at'] ?? 'n/a'
            ) );
        }
    }

    $proposal_repo->update_giav_sync_status(
        $proposal_id,
        'pending',
        null
    );

    $version_id = (int) ( $proposal['accepted_version_id'] ?? 0 );
    if ( $version_id <= 0 ) {
        $error = 'Accepted version is missing.';
        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $error );
        wp_travel_giav_send_error_notification( $proposal, $error );
        return new WP_Error( 'missing_version', $error );
    }

    $version = $version_repo->get_by_id( $version_id );
    if ( ! $version ) {
        $error = 'Accepted version not found.';
        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $error );
        wp_travel_giav_send_error_notification( $proposal, $error );
        return new WP_Error( 'missing_version', $error );
    }

    $snapshot = [];
    if ( ! empty( $version['json_snapshot'] ) ) {
        $decoded = json_decode( $version['json_snapshot'], true );
        if ( is_array( $decoded ) ) {
            $snapshot = $decoded;
        }
    }

    $items = $item_repo->get_by_version( $version_id );
    $destination_meta = wp_travel_giav_resolve_destination( $proposal, $snapshot );

    $dni = wp_travel_giav_normalize_dni( (string) ( $proposal['traveler_dni'] ?? '' ) );
    $full_name = trim( (string) ( $proposal['traveler_full_name'] ?? '' ) );
    if ( $full_name === '' ) {
        $full_name = trim( (string) ( $proposal['customer_name'] ?? '' ) );
    }

    $name_parts = wp_travel_giav_split_full_name( $full_name );
    $trace = [];

    $giav_client_id = (int) ( $proposal['giav_client_id'] ?? 0 );
    if ( $giav_client_id <= 0 && $dni !== '' ) {
        $giav_client_id = wp_travel_giav_cliente_search_por_dni( $dni, $trace ) ?: 0;
    }

    if ( $giav_client_id <= 0 ) {
        $client_response = wp_travel_giav_cliente_create(
            [
                'dni'        => $dni,
                'email'      => $proposal['customer_email'] ?? '',
                'telefono'   => '',
                'nombre'     => $name_parts['nombre'],
                'apellidos'  => $name_parts['apellidos'],
                'comentarios'=> sprintf( 'Cliente web (propuesta %d)', (int) $proposal['id'] ),
            ],
            $trace
        );

        if ( is_wp_error( $client_response ) ) {
            $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $client_response->get_error_message() );
            wp_travel_giav_send_error_notification( $proposal, $client_response->get_error_message(), $trace );
            return $client_response;
        }

        $giav_client_id = wp_travel_giav_extract_id_from_response(
            $client_response,
            [ 'Cliente_POSTResult' ]
        ) ?: 0;
    }

    if ( $giav_client_id <= 0 ) {
        $error = 'No se pudo obtener idCliente en GIAV.';
        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $error );
        wp_travel_giav_send_error_notification( $proposal, $error, $trace );
        return new WP_Error( 'giav_client_missing', $error );
    }

    $proposal_repo->update_giav_ids(
        $proposal_id,
        [
            'giav_client_id' => $giav_client_id,
        ]
    );
    if ( wp_travel_giav_debug_enabled() ) {
        error_log( sprintf(
            '[WP Travel GIAV] Cliente GIAV creado/encontrado: %d (proposal #%d)',
            $giav_client_id,
            $proposal_id
        ) );
    }

    $dates = $snapshot['header'] ?? [];
    $fecha_desde = wp_travel_giav_format_date( $dates['start_date'] ?? ( $proposal['start_date'] ?? '' ) );
    $fecha_hasta = wp_travel_giav_format_date( $dates['end_date'] ?? ( $proposal['end_date'] ?? '' ) );

    $titulo = sprintf(
        'Propuesta #%d - %s',
        (int) $proposal['id'],
        $full_name !== '' ? $full_name : 'Cliente'
    );

    $observaciones = sprintf(
        'Creado desde WP Travel. Proposal:%d Version:%d Token:%s',
        (int) $proposal['id'],
        $version_id,
        $proposal['proposal_token'] ?? ''
    );

    $expediente_response = wp_travel_giav_expediente_create(
        [
            'id_cliente'    => $giav_client_id,
            'titulo'        => $titulo,
            'observaciones' => $observaciones,
            'fecha_apertura'=> wp_travel_giav_format_date( current_time( 'mysql' ) ) ?? gmdate( 'Y-m-d' ),
            'fecha_desde'   => $fecha_desde,
            'fecha_hasta'   => $fecha_hasta,
            'destinationCountryISO3166Code' => $destination_meta['code'] ?? null,
            'destinationIdCountryZone'      => $destination_meta['zone'] ?? 'XX_No_requerido',
        ],
        $trace
    );

    if ( is_wp_error( $expediente_response ) ) {
        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $expediente_response->get_error_message() );
        wp_travel_giav_send_error_notification( $proposal, $expediente_response->get_error_message(), $trace );
        return $expediente_response;
    }

    $giav_expediente_id = wp_travel_giav_extract_id_from_response(
        $expediente_response,
        [ 'Expediente_POSTResult' ]
    ) ?: 0;

    if ( $giav_expediente_id <= 0 ) {
        $error = 'No se pudo obtener idExpediente en GIAV.';
        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $error );
        wp_travel_giav_send_error_notification( $proposal, $error, $trace );
        return new WP_Error( 'giav_expediente_missing', $error );
    }

    $proposal_repo->update_giav_ids(
        $proposal_id,
        [
            'giav_expediente_id' => $giav_expediente_id,
        ]
    );
    if ( wp_travel_giav_debug_enabled() ) {
        error_log( sprintf(
            '[WP Travel GIAV] Expediente GIAV creado: %d (proposal #%d)',
            $giav_expediente_id,
            $proposal_id
        ) );
    }

    $totals = isset( $snapshot['totals'] ) && is_array( $snapshot['totals'] ) ? $snapshot['totals'] : [];
    $total_sell = isset( $totals['totals_sell_price'] ) ? (float) $totals['totals_sell_price'] : 0.0;
    $total_cost = isset( $totals['totals_cost_net'] ) ? (float) $totals['totals_cost_net'] : 0.0;
    $destination_meta = wp_travel_giav_resolve_destination( $proposal, $snapshot );
    $tax_type = wp_travel_giav_get_default_tax_type();
    $pq_reserva_id = (int) ( $proposal['giav_pq_reserva_id'] ?? 0 );
    if ( $pq_reserva_id <= 0 ) {
        $pq_response = wp_travel_giav_reserva_normal_create(
            [
                'idExpediente' => $giav_expediente_id,
                'idCliente'    => $giav_client_id,
                'idProveedor'  => (int) WP_TRAVEL_GIAV_PQ_SUPPLIER_ID,
                'tipoReserva'  => 'PQ',
                'descripcion'  => sprintf( 'Paquete combinado - Propuesta #%d', (int) $proposal['id'] ),
                'observaciones'=> $observaciones,
                'fechadesde'   => $fecha_desde,
                'fechahasta'   => $fecha_hasta,
                'ventacomis'   => $total_sell,
                'costeComis'   => 0,
                'ventaNoComis' => 0,
                'costeNoComis' => 0,
                'gastosGestion'=> 0,
                'recuperacion' => 0,
                'numPax'       => isset( $proposal['pax_total'] ) ? (int) $proposal['pax_total'] : null,
                'Destino'                          => $destination_meta['destino'],
                'destinationCountryISO3166Code'    => $destination_meta['code'] ?? null,
                'destinationIdCountryZone'         => $destination_meta['zone'],
                'tipoIVA'                          => $tax_type,
                'Anidacion_IdReservaContenedora'   => null,
            ],
            $trace
        );

        if ( is_wp_error( $pq_response ) ) {
            $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $pq_response->get_error_message() );
            wp_travel_giav_send_error_notification( $proposal, $pq_response->get_error_message(), $trace );
            return $pq_response;
        }

        $pq_reserva_id = wp_travel_giav_extract_id_from_response(
            $pq_response,
            [ 'Reserva_Normal_POSTResult' ]
        ) ?: 0;

        if ( $pq_reserva_id > 0 ) {
            $proposal_repo->update_giav_ids(
                $proposal_id,
                [
                    'giav_pq_reserva_id' => $pq_reserva_id,
                ]
            );
            if ( wp_travel_giav_debug_enabled() ) {
                error_log( sprintf(
                    '[WP Travel GIAV] Reserva PQ creada: %d (proposal #%d)',
                    $pq_reserva_id,
                    $proposal_id
                ) );
            }

            if ( $reserva_repo ) {
                $reserva_repo->create( [
                    'proposal_id'   => $proposal_id,
                    'version_id'    => $version_id,
                    'item_id'       => null,
                    'giav_reserva_id' => $pq_reserva_id,
                    'tipo_reserva'  => 'PQ',
                    'proveedor_id'  => (string) WP_TRAVEL_GIAV_PQ_SUPPLIER_ID,
                ] );
            }
        }
    }

    if ( $reserva_repo ) {
        $snapshot_items = isset( $snapshot['items'] ) && is_array( $snapshot['items'] )
            ? array_values( $snapshot['items'] )
            : [];

        foreach ( $items as $index => $item ) {
            $existing = $reserva_repo->get_by_item( $proposal_id, $version_id, (int) $item['id'] );
            if ( $existing ) {
                continue;
            }

            $service_type = $item['service_type'] ?? '';
            $tipo_reserva = 'OT';
            $subtipo = null;

            switch ( $service_type ) {
                case 'hotel':
                    $tipo_reserva = 'HT';
                    break;
                case 'golf':
                    $tipo_reserva = 'OT';
                    $subtipo = 'Otros';
                    break;
                case 'transfer':
                    $tipo_reserva = 'OT';
                    $subtipo = 'Traslados';
                    break;
                case 'extra':
                default:
                    $tipo_reserva = 'OT';
                    $subtipo = 'Otros';
                    break;
            }

            $line_cost = isset( $item['line_cost_net'] ) ? (float) $item['line_cost_net'] : 0.0;
            $line_sell = isset( $item['line_sell_price'] ) ? (float) $item['line_sell_price'] : 0.0;

            if ( $service_type === 'hotel' && isset( $snapshot_items[ $index ] ) && is_array( $snapshot_items[ $index ] ) ) {
                $snapshot_item = $snapshot_items[ $index ];
                $giav_pricing = isset( $snapshot_item['giav_pricing'] ) && is_array( $snapshot_item['giav_pricing'] )
                    ? $snapshot_item['giav_pricing']
                    : [];
                if ( isset( $giav_pricing['giav_total_pvp'] ) ) {
                    $line_sell = (float) $giav_pricing['giav_total_pvp'];
                }
                if ( isset( $giav_pricing['giav_total_net'] ) ) {
                    $line_cost = (float) $giav_pricing['giav_total_net'];
                }
            }

            $notes_public = trim( (string) ( $item['notes_public'] ?? '' ) );
            $item_observaciones = $notes_public;
            if ( $pq_reserva_id > 0 ) {
                $item_observaciones = trim( $item_observaciones . "\nPaquetePQ:" . $pq_reserva_id );
            }

            $reserva_response = wp_travel_giav_reserva_normal_create(
                [
                    'idExpediente' => $giav_expediente_id,
                    'idCliente'    => $giav_client_id,
                    'idProveedor'  => (int) ( $item['giav_supplier_id'] ?? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID ),
                    'tipoReserva'  => $tipo_reserva,
                    'subtipoReserva' => $subtipo,
                    'descripcion'  => $item['display_name'] ?? 'Servicio',
                    'observaciones'=> $item_observaciones !== '' ? $item_observaciones : null,
                    'fechadesde'   => $item['start_date'] ?? $fecha_desde,
                    'fechahasta'   => $item['end_date'] ?? $fecha_hasta,
                    'ventacomis'   => $line_sell,
                    'costeComis'   => $line_cost,
                    'ventaNoComis' => 0,
            'costeNoComis' => 0,
            'gastosGestion'=> 0,
            'recuperacion' => 0,
            'Destino'      => $destination_meta['destino'],
            'destinationCountryISO3166Code' => $destination_meta['code'] ?? null,
            'destinationIdCountryZone'      => $destination_meta['zone'],
            'tipoIVA'      => $tax_type,
            'Anidacion_IdReservaContenedora' => $pq_reserva_id > 0 ? $pq_reserva_id : null,
            'numPax'       => isset( $item['pax_quantity'] ) ? (int) $item['pax_quantity'] : (int) ( $proposal['pax_total'] ?? 0 ),
                ],
                $trace
            );

            if ( is_wp_error( $reserva_response ) ) {
                $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $reserva_response->get_error_message() );
                wp_travel_giav_send_error_notification( $proposal, $reserva_response->get_error_message(), $trace );
                return $reserva_response;
            }

            $giav_reserva_id = wp_travel_giav_extract_id_from_response(
                $reserva_response,
                [ 'Reserva_Normal_POSTResult' ]
            );

            if ( $giav_reserva_id ) {
                $reserva_repo->create( [
                    'proposal_id'    => $proposal_id,
                    'version_id'     => $version_id,
                    'item_id'        => (int) $item['id'],
                    'giav_reserva_id'=> $giav_reserva_id,
                    'tipo_reserva'   => $tipo_reserva,
                    'proveedor_id'   => (string) ( $item['giav_supplier_id'] ?? '' ),
                ] );
                if ( wp_travel_giav_debug_enabled() ) {
                    error_log( sprintf(
                        '[WP Travel GIAV] Reserva creada: %d (item #%d)',
                        $giav_reserva_id,
                        (int) $item['id']
                    ) );
                }
            }
        }
    }

    $proposal_repo->update_giav_sync_status( $proposal_id, 'ok', null );

    return [
        'status'             => 'ok',
        'giav_client_id'     => $giav_client_id,
        'giav_expediente_id' => $giav_expediente_id,
        'giav_pq_reserva_id' => $pq_reserva_id,
    ];
}
