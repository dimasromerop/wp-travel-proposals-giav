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

    // Required fields according to WSDL (api_2_05.xml). Missing any of these throws SOAP encoding errors.
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
        'rgpdSigned'            => 'NoAplicar',
        'pageSize'              => 50,
        'pageIndex'             => 0,
    ];

    $response = wp_travel_giav_call( 'Cliente_SEARCH', $params, $trace );

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
    $agent_id = 0;
    if ( isset( $data['id_agente_comercial'] ) ) {
        $agent_id = (int) $data['id_agente_comercial'];
    } elseif ( isset( $data['giav_agent_id'] ) ) {
        $agent_id = (int) $data['giav_agent_id'];
    } elseif ( isset( $data['agent_id'] ) ) {
        $agent_id = (int) $data['agent_id'];
    }

    $params = [
        'idOficina'             => null,
        'idCliente'             => (int) $data['id_cliente'],
        'idDepartamento'        => null,
        'idAgenteComercial'     => $agent_id > 0 ? $agent_id : null,
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
    ];

    return array_merge( $defaults, $data );
}

function wp_travel_giav_reserva_normal_create( array $data, array &$trace = null ) {
    $payload = wp_travel_giav_build_reserva_payload( $data );
    return wp_travel_giav_call( 'Reserva_Normal_POST', $payload, $trace );
}

/**
 * Sets reservation nesting (anidamiento) to a container reservation (e.g. PQ).
 *
 * According to WSDL: Reserva_Anidamiento_PUT(apikey, idReservaCoste, idReservaContenedoraAnidamiento).
 *
 * @return true|WP_Error
 */
function wp_travel_giav_reserva_set_anidamiento( int $id_reserva_coste, ?int $id_reserva_contenedora, array &$trace = null ) {
    if ( $id_reserva_coste <= 0 ) {
        return new WP_Error( 'bad_id', 'ID reserva inválido para anidamiento.' );
    }

    $params = [
        'idReservaCoste' => (int) $id_reserva_coste,
        'idReservaContenedoraAnidamiento' => $id_reserva_contenedora !== null ? (int) $id_reserva_contenedora : null,
    ];

    $res = wp_travel_giav_call( 'Reserva_Anidamiento_PUT', $params, $trace );
    if ( is_wp_error( $res ) ) {
        return $res;
    }

    return true;
}



/**
 * Map hotel meal plan label (human) to GIAV regimen enum.
 * GIAV enums: AD, SA, MP, PC, TI, SP
 */
function wp_travel_giav_map_regimen_label_to_code( ?string $label ): ?string {
    if ( $label === null ) {
        return null;
    }
    $l = strtolower( trim( $label ) );
    if ( $l === '' ) {
        return null;
    }
    // Common Spanish labels
    if ( strpos( $l, 'alojamiento y desayuno' ) !== false || strpos( $l, 'desayuno' ) !== false || $l === 'ad' ) {
        return 'AD';
    }
    if ( strpos( $l, 'solo alojamiento' ) !== false || strpos( $l, 'sin desayuno' ) !== false || $l === 'sa' ) {
        return 'SA';
    }
    if ( strpos( $l, 'media' ) !== false || strpos( $l, 'mp' ) !== false ) {
        return 'MP';
    }
    if ( strpos( $l, 'pensión completa' ) !== false || strpos( $l, 'pension completa' ) !== false || strpos( $l, 'pc' ) !== false ) {
        return 'PC';
    }
    if ( strpos( $l, 'todo incluido' ) !== false || strpos( $l, 'ti' ) !== false ) {
        return 'TI';
    }
    if ( $l === 'sp' ) {
        return 'SP';
    }
    // Unknown label -> don't send (GIAV is picky)
    return null;
}

/**
 * Best-effort players count resolver for golf services (GIAV uses numPax).
 */
function wp_travel_giav_get_players_count( array $proposal, array $snapshot, array $item, array $snapshot_item = [] ): int {
    $candidates = [
        $item['players_quantity'] ?? null,
        $item['players'] ?? null,
        $item['quantity'] ?? null,
        $snapshot_item['players_quantity'] ?? null,
        $snapshot_item['players'] ?? null,
        $snapshot['header']['players'] ?? null,
        $snapshot['header']['players_count'] ?? null,
        $proposal['players_count'] ?? null,
        $proposal['golf_players'] ?? null,
        $proposal['players'] ?? null,
    ];
    foreach ( $candidates as $v ) {
        if ( is_numeric( $v ) ) {
            $n = (int) $v;
            if ( $n > 0 ) {
                return $n;
            }
        }
    }
    return 0;
}

/**
 * Build GIAV hotel-specific fields: numPax, regimen, rooming text, and uso/num lines.
 * Uses snapshot room_pricing when available and excludes "extra" single rooms when quote is informative.
 */
function wp_travel_giav_build_giav_hotel_fields( array $proposal, array $snapshot, array $item, array $snapshot_item = [] ): array {
    $pax_total = 0;
    $pax_candidates = [
        $proposal['pax_total'] ?? null,
        $snapshot['header']['pax'] ?? null,
        $proposal['pax'] ?? null,
    ];
    foreach ( $pax_candidates as $v ) {
        if ( is_numeric( $v ) ) {
            $pax_total = (int) $v;
            if ( $pax_total > 0 ) {
                break;
            }
        }
    }

    $room_pricing = [];
    if ( isset( $snapshot_item['room_pricing'] ) && is_array( $snapshot_item['room_pricing'] ) ) {
        $room_pricing = $snapshot_item['room_pricing'];
    } elseif ( isset( $item['room_pricing'] ) && is_array( $item['room_pricing'] ) ) {
        $room_pricing = $item['room_pricing'];
    }

    $double_rooms = 0;
    $single_rooms = 0;
    if ( isset( $room_pricing['double']['rooms'] ) && is_numeric( $room_pricing['double']['rooms'] ) ) {
        $double_rooms = (int) $room_pricing['double']['rooms'];
    }
    if ( isset( $room_pricing['single']['rooms'] ) && is_numeric( $room_pricing['single']['rooms'] ) ) {
        $single_rooms = (int) $room_pricing['single']['rooms'];
    }

// Fallback: some snapshots store hotel_rooms + pax_total without room_pricing.
if ( $double_rooms === 0 && $single_rooms === 0 ) {
    $maybe_rooms = $snapshot_item['hotel_rooms'] ?? $item['hotel_rooms'] ?? null;
    if ( is_numeric( $maybe_rooms ) ) {
        $maybe_rooms = (int) $maybe_rooms;
        if ( $maybe_rooms > 0 ) {
            // Assume doubles by default.
            $double_rooms = $maybe_rooms;
        }
    }
}


    $informative = false;
    foreach ( [ 'hotel_informative_quote', 'informative_quote', 'quote_informative', 'cotizacion_informativa', 'allow_extra_rooms' ] as $k ) {
        if ( ! empty( $snapshot_item[ $k ] ) ) { $informative = true; break; }
        if ( ! empty( $item[ $k ] ) ) { $informative = true; break; }
    }

    // Exclude "extra" single rooms if informative: cover pax with doubles first, then only needed singles.
    $included_double = max( 0, $double_rooms );
    $included_single = max( 0, $single_rooms );
    if ( $informative && $pax_total > 0 ) {
        $covered = $included_double * 2;
        $remain = $pax_total - $covered;
        if ( $remain <= 0 ) {
            $included_single = 0;
        } else {
            $included_single = min( $included_single, $remain ); // singles cover 1 pax each
        }
    }

    $computed_pax = 0;
    $computed_pax += $included_double * 2;
    $computed_pax += $included_single;

    if ( $computed_pax <= 0 && $pax_total > 0 ) {
        $computed_pax = $pax_total;
    }

    $meal_label = $snapshot_item['hotel_regimen'] ?? $item['hotel_regimen'] ?? $snapshot_item['meal_plan_label'] ?? $snapshot_item['meal_plan'] ?? $item['meal_plan_label'] ?? $item['meal_plan'] ?? null;
    $regimen = wp_travel_giav_map_regimen_label_to_code( is_string( $meal_label ) ? $meal_label : null );

    $room_type = $snapshot_item['hotel_room_type'] ?? $item['hotel_room_type'] ?? $snapshot_item['room_type_label'] ?? $snapshot_item['room_type'] ?? $item['room_type_label'] ?? $item['room_type'] ?? '';
    $room_type = trim( (string) $room_type );

    $rooming_lines = [];
    if ( $included_double > 0 ) {
        $rooming_lines[] = sprintf( '%d x Habitación Doble%s', $included_double, $room_type !== '' ? ' - ' . $room_type : '' );
    }
    if ( $included_single > 0 ) {
        $rooming_lines[] = sprintf( '%d x Habitación Individual%s', $included_single, $room_type !== '' ? ' - ' . $room_type : '' );
    }
    $rooming_text = ! empty( $rooming_lines ) ? implode( "\n", $rooming_lines ) : null;

    $fields = [
        'numPax'  => $computed_pax > 0 ? $computed_pax : null,
        'regimen' => $regimen,
        'rooming' => $rooming_text,
        'uso1'    => null, 'num1' => null,
        'uso2'    => null, 'num2' => null,
        'uso3'    => null, 'num3' => null,
        'uso4'    => null, 'num4' => null,
    ];

    $idx = 1;
    if ( $included_double > 0 ) {
        $fields['uso' . $idx] = 'DB';
        $fields['num' . $idx] = $included_double;
        $idx++;
    }
    if ( $included_single > 0 && $idx <= 4 ) {
        $fields['uso' . $idx] = 'IN';
        $fields['num' . $idx] = $included_single;
        $idx++;
    }

    return $fields;
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
            $error_message = $client_response->get_error_message();
            if ( $dni !== '' ) {
                $giav_client_id = wp_travel_giav_cliente_search_por_dni( $dni, $trace ) ?: 0;
                if ( $giav_client_id > 0 && wp_travel_giav_debug_enabled() ) {
                    error_log( sprintf(
                        '[WP Travel GIAV] Cliente existente encontrado tras error al crear: %d (proposal #%d)',
                        $giav_client_id,
                        $proposal_id
                    ) );
                }
            }

            if ( $giav_client_id <= 0 ) {
                $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $error_message );
                wp_travel_giav_send_error_notification( $proposal, $error_message, $trace );
                return $client_response;
            }
        } else {
            $giav_client_id = wp_travel_giav_extract_id_from_response(
                $client_response,
                [ 'Cliente_POSTResult' ]
            ) ?: 0;
        }
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

    $titulo = '';
    if ( ! empty( $proposal['proposal_title'] ) ) {
        $titulo = (string) $proposal['proposal_title'];
    } elseif ( ! empty( $proposal['display_title'] ) ) {
        $titulo = (string) $proposal['display_title'];
    } elseif ( ! empty( $proposal['customer_name'] ) ) {
        $titulo = 'Viaje - ' . (string) $proposal['customer_name'];
    } else {
        $titulo = sprintf( 'Propuesta #%d', (int) $proposal['id'] );
    }


    $observaciones = sprintf(
        'Creado desde WP Travel. Proposal:%d Version:%d Token:%s',
        (int) $proposal['id'],
        $version_id,
        $proposal['proposal_token'] ?? ''
    );

    $giav_agent_id = 0;
    if ( ! empty( $snapshot['header']['giav_agent_id'] ) ) {
        $giav_agent_id = (int) $snapshot['header']['giav_agent_id'];
    }
    if ( $giav_agent_id <= 0 && ! empty( $snapshot['header']['agent_id'] ) ) {
        $giav_agent_id = (int) $snapshot['header']['agent_id'];
    }
    if ( $giav_agent_id <= 0 ) {
        $giav_agent_id = (int) ( $proposal['giav_agent_id'] ?? 0 );
    }

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
            'id_agente_comercial'           => $giav_agent_id > 0 ? $giav_agent_id : null,
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
                // GIAV requiere margen de operación previsto para permitir costes anidados en PQ/CI.
                // Establecemos 20% por defecto para evitar el fallo: "Para admitir servicios de costes anidados...".
                'margenOperacionPrevisto' => 20,
                'descripcion'  => sprintf( 'Paquete combinado - Propuesta #%d', (int) $proposal['id'] ),
                'observaciones'=> $observaciones,
                'fechadesde'   => $fecha_desde,
                'fechahasta'   => $fecha_hasta,
                'ventacomis'   => $total_sell,
                // En modo valoración ANIDADA, el paquete PQ no lleva coste directo.
                // El coste se compone con los servicios anidados (hijos).
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

            // When using a package (PQ) as container, line items should carry only cost. PVP is on the package.
            if ( $pq_reserva_id > 0 ) {
                $line_sell = 0.0;
            }

            $notes_public = trim( (string) ( $item['notes_public'] ?? '' ) );
            $item_observaciones = $notes_public;
            if ( $pq_reserva_id > 0 ) {
                $item_observaciones = trim( $item_observaciones . "\nPaquetePQ:" . $pq_reserva_id );
            }

            
    $reserva_payload = [
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

            'numPax'       => isset( $item['pax_quantity'] ) ? (int) $item['pax_quantity'] : (int) ( $proposal['pax_total'] ?? 0 ),
    ];

    $snapshot_item_for_giav = ( isset( $snapshot_items[ $index ] ) && is_array( $snapshot_items[ $index ] ) ) ? $snapshot_items[ $index ] : [];
    $giav_extra_fields = [];

    if ( $service_type === 'hotel' ) {
        $giav_extra_fields = wp_travel_giav_build_giav_hotel_fields( $proposal, $snapshot, $item, $snapshot_item_for_giav );
    } elseif ( $service_type === 'golf' ) {
        $players = wp_travel_giav_get_players_count( $proposal, $snapshot, $item, $snapshot_item_for_giav );
        if ( $players > 0 ) {
            $giav_extra_fields['numPax'] = $players;
        }
    } else {
        // transfer/extra/otros: keep numPax already set (pax_quantity or proposal pax)
        $giav_extra_fields = [];
    }

    // Merge extra fields without losing existing values (extra fields win when not null).
    foreach ( $giav_extra_fields as $k => $v ) {
        if ( $v !== null ) {
            $reserva_payload[ $k ] = $v;
        }
    }

    $reserva_response = wp_travel_giav_reserva_normal_create( $reserva_payload, $trace );

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
                // Force nesting under the PQ container (Reserva_Anidamiento_PUT).
                if ( $pq_reserva_id > 0 ) {
                    $anid = wp_travel_giav_reserva_set_anidamiento( (int) $giav_reserva_id, (int) $pq_reserva_id, $trace );
                    if ( is_wp_error( $anid ) ) {
                        $proposal_repo->update_giav_sync_status( $proposal_id, 'error', $anid->get_error_message() );
                        wp_travel_giav_send_error_notification( $proposal, $anid->get_error_message(), $trace );
                        return $anid;
                    }
                }

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
