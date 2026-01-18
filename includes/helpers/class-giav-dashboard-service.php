<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Builds an operational dashboard for accepted expedientes in GIAV.
 */
class WP_Travel_GIAV_Dashboard_Service {

    private const SERVICE_START_KEYS = [
        'FechaInicioServicio',
        'fechaInicioServicio',
        'FechaDesde',
        'fechaDesde',
        'FechaInicio',
        'fechaInicio',
        'start_date',
        'FechaSalida',
        'fechaSalida',
        'FechaServicioDesde',
        'fechaServicioDesde',
        'FechaPrimerServicio',
        'fechaPrimerServicio',
        'FechaReserva',
        'fechaReserva',
        'FechaServicio',
        'fechaServicio',
    ];

    private const SERVICE_END_KEYS = [
        'FechaFinServicio',
        'fechaFinServicio',
        'FechaHasta',
        'fechaHasta',
        'FechaFin',
        'fechaFin',
        'FechaServicioHasta',
        'fechaServicioHasta',
        'FechaRegreso',
        'fechaRegreso',
        'FechaVuelta',
        'fechaVuelta',
        'FechaServicioFin',
        'fechaServicioFin',
        'FechaEntrega',
        'fechaEntrega',
    ];

    /**
     * Cache for client names to avoid redundant SOAP calls.
     *
     * @var array<int,string|null>
     */
    private $cliente_name_cache = [];

    /**
     * Builds the dashboard payload for a given year.
     *
     * @return array|WP_Error
     */
    public function build_year_dashboard( int $year ) {
        $from = sprintf( '%04d-01-01', $year );
        $to   = sprintf( '%04d-12-31', $year );

        $expedientes = $this->fetch_expedientes_by_start_date( $from, $to );
        if ( is_wp_error( $expedientes ) ) {
            return $expedientes;
        }

        $expediente_ids = $this->extract_expediente_ids( $expedientes );
        $reservas = $this->fetch_reservas_for_expedientes( $expediente_ids );
        if ( is_wp_error( $reservas ) ) {
            return $reservas;
        }
        $reservas_by_expediente = $this->group_reservas_by_expediente( $reservas );

        $models = [];
        foreach ( $expedientes as $expediente ) {
            $exp_id = (int) ( $expediente->Id ?? $expediente->ID ?? 0 );
            $row = $this->build_expediente_model( $expediente, $reservas_by_expediente[ $exp_id ] ?? [] );
            if ( $row !== null ) {
                $models[] = $row;
            }
        }

        usort( $models, function( $a, $b ) {
            return ( $a['fecha_inicio_ts'] ?? 0 ) <=> ( $b['fecha_inicio_ts'] ?? 0 );
        } );

        return [
            'summary'      => $this->build_summary( $models, $year ),
            'chart'        => $this->build_monthly_chart( $models, $year ),
            'expedientes'  => $models,
            'currency'     => $this->resolve_currency(),
        ];
    }

    /**
     * Fetches expedientes filtered by the travel departure date.
     *
     * @return array|WP_Error
     */
    private function fetch_expedientes_by_start_date( string $from_ymd, string $to_ymd ) {
        $from_filter = $this->normalize_date_filter( $from_ymd );
        $to_filter   = $this->normalize_date_filter( $to_ymd );

        $page_size = 100;
        $page      = 0;
        $all       = [];

        do {
            $params = [
                'fechaCreacionDesde'          => null,
                'fechaCreacionHasta'          => null,
                'modoMultiFiltroFecha'        => 'Salida',
                'multiFiltroFechaDesde'       => $from_filter,
                'multiFiltroFechaHasta'       => $to_filter,
                'facturacionPendiente'        => 'NoAplicar',
                'cobroPendiente'              => 'NoAplicar',
                'estadoCierre'                => 'NoAplicar',
                'tipoExpediente'              => 'NoAplicar',
                'recepcionCosteTotal'         => 'NoAplicar',
                'pageSize'                    => $page_size,
                'pageIndex'                   => $page,
                'idsExpediente'               => null,
                'codOficina'                  => null,
                'idsOficina'                  => null,
                'codigoDesde'                 => null,
                'codigoHasta'                 => null,
                'idsCliente'                  => null,
                'idsPasajeros'                => null,
                'idsDepartamento'             => null,
                'idsAgenteComercial'          => null,
                'fechaHoraModificacionDesde'  => null,
                'fechaHoraModificacionHasta'  => null,
                'fechaCierreDesde'            => null,
                'fechaCierreHasta'            => null,
                'idsEntitiesStages'           => null,
                'idsUsuarioCreacion'          => null,
                'titulo'                      => null,
                'idsCategories'               => null,
                'idsPresupuesto'              => null,
                'customDataValues'            => null,
            ];

            $trace = [];
            $res = wp_travel_giav_call( 'Expediente_SEARCH', $params, $trace );
            if ( is_wp_error( $res ) ) {
                return $res;
            }

            $list = null;
            if ( is_object( $res ) && isset( $res->Expediente_SEARCHResult ) ) {
                $list = $res->Expediente_SEARCHResult;
            } else {
                $list = $res;
            }

            $items = [];
            if ( is_object( $list ) && isset( $list->WsExpediente ) ) {
                $list = $list->WsExpediente;
            }
            if ( is_array( $list ) ) {
                $items = $list;
            } elseif ( is_object( $list ) ) {
                $items = [ $list ];
            }

            foreach ( $items as $it ) {
                if ( is_object( $it ) ) {
                    $all[] = $it;
                }
            }

            $page++;
            $done = count( $items ) < $page_size;
        } while ( ! $done && $page <= 50 );

        return $all;
    }

    /**
     * Extracts unique expediente IDs from the raw SOAP objects.
     *
     * @param array $expedientes
     * @return int[]
     */
    private function extract_expediente_ids( array $expedientes ): array {
        $ids = [];
        foreach ( $expedientes as $expediente ) {
            $id = (int) ( $expediente->Id ?? $expediente->ID ?? 0 );
            if ( $id > 0 ) {
                $ids[ $id ] = $id;
            }
        }
        return array_values( $ids );
    }

    /**
     * Fetches reservas for a list of expedientes in paginated batches.
     *
     * @param int[] $expediente_ids
     * @return array|WP_Error
     */
    private function fetch_reservas_for_expedientes( array $expediente_ids ): array|WP_Error {
        $expediente_ids = array_values( array_filter( $expediente_ids, function( $value ) {
            return $value > 0;
        } ) );
        if ( empty( $expediente_ids ) ) {
            return [];
        }

        $page_size = 100;
        $page = 0;
        $all = [];

        do {
            $params = [
                'idsExpediente'              => $this->build_array_of_int( $expediente_ids ),
                'idsCliente'                 => null,
                'idsProveedor'               => null,
                'idsPrestatario'             => null,
                'idsProducto'                => null,
                'facturacionPendiente'       => 'NoAplicar',
                'cobroPendiente'             => 'NoAplicar',
                'prepagoPendiente'           => 'NoAplicar',
                'modofiltroImporte'          => 'venta',
                'importeDesde'               => 0,
                'importeHasta'               => 9999999,
                'recepcionCosteTotal'        => 'NoAplicar',
                'fechaReserva'               => 'creacion',
                'modoFiltroLocalizadorPedido' => 'LOCPED',
                'pageSize'                   => $page_size,
                'pageIndex'                  => $page,
            ];

            $trace = [];
            $res = wp_travel_giav_call( 'Reservas_SEARCH', $params, $trace );
            if ( is_wp_error( $res ) ) {
                return $res;
            }

            $list = null;
            if ( is_object( $res ) && isset( $res->Reservas_SEARCHResult ) ) {
                $list = $res->Reservas_SEARCHResult;
            } else {
                $list = $res;
            }

            $items = [];
            if ( is_object( $list ) && isset( $list->WsReserva ) ) {
                $list = $list->WsReserva;
            }

            if ( is_array( $list ) ) {
                $items = $list;
            } elseif ( is_object( $list ) ) {
                $items = [ $list ];
            }

            foreach ( $items as $it ) {
                if ( is_object( $it ) ) {
                    $all[] = $it;
                }
            }

            $page++;
            $done = count( $items ) < $page_size;
        } while ( ! $done );

        return $all;
    }

    /**
     * Groups reservas by expediente ID.
     *
     * @param array $reservas
     * @return array<int,array>
     */
    private function group_reservas_by_expediente( array $reservas ): array {
        $grouped = [];
        foreach ( $reservas as $reserva ) {
            $id = (int) ( $reserva->IdExpediente ?? $reserva->idExpediente ?? 0 );
            if ( $id <= 0 ) {
                continue;
            }
            $grouped[ $id ][] = $reserva;
        }
        return $grouped;
    }

    /**
     * Builds a normalized expediente row or null if the entry should be skipped.
     */
    private function build_expediente_model( $expediente, array $reservas = [] ): ?array {
        $exp_id = (int) ( $expediente->Id ?? $expediente->ID ?? 0 );
        if ( $exp_id <= 0 ) {
            return null;
        }

        $info = $this->fetch_info_economica( $exp_id );
        if ( is_wp_error( $info ) ) {
            $info = null;
        }

        if ( ! $this->is_expediente_accepted( $expediente, $info ) ) {
            return null;
        }


        $fecha_inicio = $this->resolve_date_string( $expediente, [ 'FechaDesde', 'fechaDesde', 'fecha_inicio', 'start_date', 'fechaSalida', 'fecha_inicio_viaje' ] );
        $fecha_fin = $this->resolve_date_string( $expediente, [ 'FechaHasta', 'fechaHasta', 'fecha_fin', 'end_date', 'fechaRegreso' ] );

        if ( $fecha_fin && ! $fecha_inicio ) {
            $fecha_inicio = $fecha_fin;
        }

        if ( ! $fecha_inicio || ! $fecha_fin ) {
            $derived = $this->derive_dates_from_reservas( $reservas );
            if ( ! $fecha_inicio && ! empty( $derived['start'] ) ) {
                $fecha_inicio = $derived['start'];
            }
            if ( ! $fecha_fin && ! empty( $derived['end'] ) ) {
                $fecha_fin = $derived['end'];
            }
        }

        if ( ! $fecha_inicio ) {
            return null;
        }

        $fecha_fin = $fecha_fin ?: $fecha_inicio;

        $fecha_inicio_dt = $this->parse_date_value( $fecha_inicio );
        $timestamp = $fecha_inicio_dt ? (int) $fecha_inicio_dt->format( 'U' ) : null;

        $total_pvp       = $this->calculate_reserva_total( $reservas );
        if ( $total_pvp <= 0 ) {
            $total_pvp = $this->extract_total_pvp( $info );
        }
        $margen_estimado = $this->extract_margen_estimado( $info );
        $dias_hasta      = $this->calculate_days_until( $fecha_inicio );

        $pagos = $this->build_payment_data( $fecha_inicio_dt, $info, $total_pvp );

        return [
            'giav_id_humano'     => $this->resolve_human_id( $expediente ),
            'cliente_nombre'     => $this->resolve_cliente_nombre( $expediente, $reservas ),
            'agente_comercial'  => $this->resolve_agente_comercial( $expediente ),
            'nombre_viaje'       => $this->get_string_field( $expediente, [ 'Titulo', 'titulo', 'Nombre', 'nombre_viaje', 'Descripcion' ] ),
            'fecha_inicio'       => $fecha_inicio,
            'fecha_fin'          => $fecha_fin,
            'dias_hasta_viaje'   => $dias_hasta,
            'total_pvp'          => round( $total_pvp, 2 ),
            'margen_estimado'    => round( $margen_estimado, 2 ),
            'pagos'              => $pagos,
            'riesgo'             => $pagos['riesgo'],
            'fecha_inicio_ts'    => $timestamp,
        ];
    }

    private function derive_dates_from_reservas( array $reservas ): array {
        $min_start = null;
        $max_end   = null;

        foreach ( $reservas as $reserva ) {
            $start = $this->extract_service_date( $reserva, self::SERVICE_START_KEYS );
            if ( $start && ( $min_start === null || $start < $min_start ) ) {
                $min_start = $start;
            }

            $end = $this->extract_service_date( $reserva, self::SERVICE_END_KEYS );
            if ( $end && ( $max_end === null || $end > $max_end ) ) {
                $max_end = $end;
            }
        }

        return [
            'start' => $min_start ? $min_start->format( 'Y-m-d' ) : null,
            'end'   => $max_end ? $max_end->format( 'Y-m-d' ) : null,
        ];
    }

    private function extract_service_date( $reserva, array $keys ): ?\DateTimeImmutable {
        foreach ( $keys as $key ) {
            $value = $this->get_value( $reserva, [ $key ], null );
            if ( $value ) {
                $date = $this->parse_date_value( $value );
                if ( $date ) {
                    return $date;
                }
            }
        }
        return null;
    }

    /**
     * Determines whether the expediente can be considered accepted.
     */
    private function is_expediente_accepted( $expediente, $info ): bool {
        $candidates = [
            'Aceptado',
            'Aceptada',
            'aceptado',
            'aceptada',
            'Estado',
            'estado',
            'EstadoActual',
            'estadoActual',
            'EstadoCierre',
            'estadoCierre',
        ];
        foreach ( $candidates as $key ) {
            $value = $this->get_string_field( $expediente, [ $key ] );
            if ( $value !== '' ) {
                $normalized = strtolower( $value );
                if ( strpos( $normalized, 'acept' ) !== false || strpos( $normalized, 'cerrado' ) !== false ) {
                    return true;
                }
                if ( in_array( $normalized, [ 'ganada', 'ganado', 'yes', 'true' ], true ) ) {
                    return true;
                }
            }
        }

        if ( ! empty( $expediente->Cerrado ) || ! empty( $expediente->cerrado ) ) {
            return true;
        }

        return true;
    }

    /**
     * Builds payment metadata for an expediente.
     */
    private function build_payment_data( ?\DateTimeImmutable $fecha_inicio_dt, $info, float $total_pvp ): array {
        $now = new \DateTimeImmutable( 'now', new \DateTimeZone( 'UTC' ) );
        $pending = $this->convert_to_float( $this->get_value( $info, [ 'PendienteCobrar', 'pendienteCobrar', 'PendienteCobro', 'pendiente_cobro', 'Pendiente', 'pendiente' ], 0 ) );
        $is_paid = $pending <= 0.0;

        $candidates = $this->gather_due_candidates( $fecha_inicio_dt, $info );
        $next = $this->select_next_due_candidate( $candidates, $now );

        $dias_para_vencer = null;
        $proximo_vencimiento = null;
        $tipo = 'final';
        if ( $next ) {
            $proximo_vencimiento = $next['date']->format( 'Y-m-d' );
            $dias_para_vencer = (int) ceil( ( $next['date']->getTimestamp() - $now->getTimestamp() ) / DAY_IN_SECONDS );
            $tipo = $next['label'] ?? 'final';
        }

        $estado = 'pendiente';
        if ( $is_paid ) {
            $estado = 'pagado';
        } elseif ( $next && $next['date'] < $now ) {
            $estado = 'vencido';
        }

        $riesgo = 'ok';
        if ( 'vencido' === $estado ) {
            $riesgo = 'danger';
        } elseif ( $dias_para_vencer !== null && $dias_para_vencer <= 15 ) {
            $riesgo = 'warning';
        }

        if ( 'pagado' === $estado ) {
            $riesgo = 'ok';
        }

        $pendiente_total = round( $pending, 2 );
        $pagado_total = round( max( $total_pvp - $pending, 0.0 ), 2 );
        $total_value = round( $total_pvp, 2 );

        return [
            'estado'             => $estado,
            'proximo_vencimiento' => $proximo_vencimiento,
            'dias_para_vencer'   => $dias_para_vencer,
            'tipo'               => $tipo,
            'monto_pendiente'    => $pendiente_total,
            'pendiente_total'    => $pendiente_total,
            'pagado_total'       => $pagado_total,
            'total_pvp'          => $total_value,
            'riesgo'             => $riesgo,
        ];
    }

    /**
     * Gathers due date candidates (deposit + final) in chronological order.
     */
    private function gather_due_candidates( ?\DateTimeImmutable $fecha_inicio_dt, $info ): array {
        $candidates = [];

        if ( $fecha_inicio_dt ) {
            try {
                $final_due = $fecha_inicio_dt->sub( new \DateInterval( 'P15D' ) );
                $candidates[] = [ 'label' => 'final', 'date' => $final_due ];
            } catch ( \Exception $e ) {
                // ignore invalid interval
            }
        }

        $deposit = $this->resolve_deposit_due_from_info( $info );
        if ( ! $deposit && $fecha_inicio_dt ) {
            try {
                $deposit = $fecha_inicio_dt->sub( new \DateInterval( 'P45D' ) );
            } catch ( \Exception $e ) {
                $deposit = null;
            }
        }

        if ( $deposit ) {
            $candidates[] = [ 'label' => 'deposito', 'date' => $deposit ];
        }

        usort( $candidates, function( $a, $b ) {
            return $a['date'] <=> $b['date'];
        } );

        return $candidates;
    }

    /**
     * Selects the next due candidate on or after today or the last if none are upcoming.
     */
    private function select_next_due_candidate( array $candidates, \DateTimeImmutable $now ): ?array {
        foreach ( $candidates as $candidate ) {
            if ( $candidate['date'] >= $now ) {
                return $candidate;
            }
        }
        return empty( $candidates ) ? null : end( $candidates );
    }

    /**
     * Attempts to resolve a deposit due date from the economic info.
     */
    private function resolve_deposit_due_from_info( $info ): ?\DateTimeImmutable {
        if ( ! is_object( $info ) ) {
            return null;
        }

        $keys = [
            'FechaLimiteServicio',
            'fechaLimiteServicio',
            'FechaPrimerServicio',
            'fechaPrimerServicio',
            'FechaPago1',
            'fechaPago1',
            'PrimerVencimiento',
            'primerVencimiento',
        ];

        foreach ( $keys as $key ) {
            $value = $this->get_value( $info, [ $key ], null );
            if ( $value ) {
                $date = $this->parse_date_value( $value );
                if ( $date ) {
                    return $date;
                }
            }
        }

        foreach ( get_object_vars( $info ) as $key => $value ) {
            if ( stripos( $key, 'fecha' ) !== false && stripos( $key, 'servicio' ) !== false ) {
                $date = $this->parse_date_value( $value );
                if ( $date ) {
                    return $date;
                }
            }
        }

        return null;
    }

    /**
     * Builds the summary data structure.
     */
    private function build_summary( array $models, int $year ): array {
        $ventas = 0.0;
        $margen = 0.0;
        $riesgos = 0;
        foreach ( $models as $model ) {
            $ventas += (float) ( $model['total_pvp'] ?? 0.0 );
        $margen += (float) ( $model['margen_estimado'] ?? 0.0 );
            if ( isset( $model['pagos']['estado'] ) && 'vencido' === $model['pagos']['estado'] ) {
                $riesgos++;
            }
        }

        return [
            'year'                    => $year,
            'ventas_estimadas_total'  => round( $ventas, 2 ),
            'margen_estimado_total'   => round( $margen, 2 ),
            'expedientes_total'       => count( $models ),
            'expedientes_riesgo_cobro'=> $riesgos,
        ];
    }

    /**
     * Builds the monthly chart payload.
     */
    private function build_monthly_chart( array $models, int $year ): array {
        $months = [];
        for ( $m = 1; $m <= 12; $m++ ) {
            $months[ $m ] = [
                'month'       => sprintf( '%04d-%02d', $year, $m ),
                'ventas'      => 0.0,
                'expedientes' => 0,
            ];
        }

        foreach ( $models as $model ) {
            $month_index = $this->month_index_from_date( $model['fecha_inicio'] ?? null );
            if ( $month_index >= 1 && $month_index <= 12 ) {
                $months[ $month_index ]['ventas'] += (float) ( $model['total_pvp'] ?? 0.0 );
                $months[ $month_index ]['expedientes']++;
            }
        }

        return array_values( array_map( function( $entry ) {
            $entry['ventas'] = round( (float) $entry['ventas'], 2 );
            return $entry;
        }, $months ) );
    }

    /**
     * Resolves the currency for the dashboard.
     */
    private function resolve_currency(): string {
        if ( defined( 'WP_TRAVEL_CURRENCY' ) && WP_TRAVEL_CURRENCY ) {
            return WP_TRAVEL_CURRENCY;
        }
        if ( defined( 'CASANOVA_GIAV_CURRENCY' ) && CASANOVA_GIAV_CURRENCY ) {
            return CASANOVA_GIAV_CURRENCY;
        }
        return 'EUR';
    }

    /**
     * Parses a date string into a normalized Y-m-d format.
     */
    private function resolve_date_string( $object, array $keys ): ?string {
        foreach ( $keys as $key ) {
            $value = $this->get_value( $object, [ $key ], null );
            if ( $value ) {
                $date = $this->parse_date_value( $value );
                if ( $date ) {
                    return $date->format( 'Y-m-d' );
                }
            }
        }
        return null;
    }

    /**
     * Parses a raw value into a DateTimeImmutable instance.
     */
    private function parse_date_value( $value ): ?\DateTimeImmutable {
        if ( empty( $value ) ) {
            return null;
        }
        $timestamp = strtotime( (string) $value );
        if ( ! $timestamp ) {
            return null;
        }
        return ( new \DateTimeImmutable( '@' . $timestamp ) )->setTimezone( new \DateTimeZone( 'UTC' ) );
    }

    /**
     * Calculates days until a reference date.
     */
    private function calculate_days_until( ?string $date ): int {
        $target = $this->parse_date_value( $date );
        if ( ! $target ) {
            return 0;
        }
        $now = new \DateTimeImmutable( 'now', new \DateTimeZone( 'UTC' ) );
        $interval = $now->diff( $target );
        return (int) $interval->format( '%r%a' );
    }

    /**
     * Sums the estimated total across all reservas for an expediente.
     */
    private function calculate_reserva_total( array $reservas ): float {
        $total = 0.0;
        foreach ( $reservas as $reserva ) {
            $total += $this->extract_reserva_price( $reserva );
        }
        return round( $total, 2 );
    }

    /**
     * Extracts the sale price for a reserva.
     */
    private function extract_reserva_price( $reserva ): float {
        $keys = [
            'VentaComis',
            'ventaComis',
            'Venta',
            'venta',
            'PvpRecomendado',
            'pvpRecomendado',
        ];
        $value = $this->get_value( $reserva, $keys, 0 );
        return $this->convert_to_float( $value );
    }

    /**
     * Formats a date boundary with a time portion for SOAP filters.
     */
    /**
     * Normalizes filter values to `yyyy-MM-dd`.
     */
    private function normalize_date_filter( string $value ): string {
        $clean = trim( (string) $value );
        if ( $clean === '' ) {
            return '';
        }

        try {
            $dt = new \DateTimeImmutable( $clean );
            return $dt->format( 'Y-m-d' );
        } catch ( \Exception $e ) {
            return $clean;
        }
    }

    /**
     * Extracts a value from an object or array given a list of possible keys.
     */
    private function get_value( $object, array $keys, $default = null ) {
        if ( ! is_object( $object ) && ! is_array( $object ) ) {
            return $default;
        }
        foreach ( $keys as $key ) {
            if ( is_array( $object ) && array_key_exists( $key, $object ) && null !== $object[ $key ] ) {
                return $object[ $key ];
            }
            if ( is_object( $object ) && isset( $object->$key ) && null !== $object->$key ) {
                return $object->$key;
            }
        }
        return $default;
    }

    /**
     * Retrieves a string representation for potential key names.
     */
    private function get_string_field( $object, array $keys ): string {
        $value = $this->get_value( $object, $keys, '' );
        if ( is_array( $value ) ) {
            $value = implode( ' ', $value );
        }
        return trim( (string) $value );
    }

    /**
     * Extracts the human identifier (Código o ID).
     */
    private function resolve_human_id( $expediente ): string {
        $candidates = [ 'Codigo', 'codigo', 'CodigoExpediente', 'codigoExpediente', 'Id', 'id', 'ID' ];
        return $this->get_string_field( $expediente, $candidates );
    }

    /**
     * Resolves the client name.
     */
    private function resolve_cliente_nombre( $expediente, array $reservas ): string {
        $name = $this->resolve_cliente_from_reservas( $reservas );
        if ( $name !== '' ) {
            return $name;
        }

        $client_id = (int) ( $expediente->IdCliente ?? $expediente->idCliente ?? 0 );
        if ( $client_id > 0 ) {
            $cached = $this->get_cached_cliente_name( $client_id );
            if ( $cached !== null && $cached !== '' ) {
                return $cached;
            }
        }

        $client = $this->get_value( $expediente, [ 'Cliente', 'cliente', 'ClienteExpediente', 'clienteExpediente' ], null );
        if ( $client ) {
            $full_name = $this->build_person_name( $client );
            if ( $full_name !== '' ) {
                return $full_name;
            }
        }
        return $this->get_string_field( $expediente, [ 'ClienteNombre', 'cliente_nombre', 'clienteName', 'customer_name', 'NombreCliente' ] );
    }

    /**
     * Attempts to resolve the client name from associated reservas.
     */
    private function resolve_cliente_from_reservas( array $reservas ): string {
        foreach ( $reservas as $reserva ) {
            $datos = $this->get_value( $reserva, [ 'DatosExternos' ], null );
            if ( $datos ) {
                $name = $this->extract_cliente_name( $datos );
                if ( $name !== '' ) {
                    return $name;
                }
            }
        }
        return '';
    }

    /**
     * Returns a cached client name or fetches it from GIAV.
     */
    private function get_cached_cliente_name( int $client_id ): ?string {
        if ( array_key_exists( $client_id, $this->cliente_name_cache ) ) {
            return $this->cliente_name_cache[ $client_id ];
        }

        $name = $this->fetch_cliente_name( $client_id );
        $this->cliente_name_cache[ $client_id ] = $name;
        return $name;
    }

    /**
     * Fetches a client record from GIAV and extracts the display name.
     */
    private function fetch_cliente_name( int $client_id ): ?string {
        if ( $client_id <= 0 ) {
            return null;
        }

        $trace = [];
        $res = wp_travel_giav_call( 'Cliente_GET', [ 'id' => $client_id ], $trace );
        if ( is_wp_error( $res ) ) {
            return null;
        }

        $cliente = null;
        if ( is_object( $res ) && isset( $res->Cliente_GETResult ) ) {
            $cliente = $res->Cliente_GETResult;
        } else {
            $cliente = $res;
        }

        if ( ! is_object( $cliente ) ) {
            return null;
        }

        $name = $this->extract_cliente_name( $cliente );
        return $name !== '' ? $name : null;
    }

    /**
     * Extracts a readable name from a client-like object.
     */
    private function extract_cliente_name( $object ): string {
        return $this->get_string_field( $object, [ 'NombreCliente', 'nombreCliente', 'NombreClienteAlias', 'ApellidosNombreCliente' ] );
    }

    /**
     * Builds a SOAP-friendly ArrayOfInt structure.
     *
     * @param int[] $values
     * @return array|null
     */
    private function build_array_of_int( array $values ): ?array {
        $unique = array_values( array_unique( array_filter( $values, function( $value ) {
            return $value > 0;
        } ) ) );

        if ( empty( $unique ) ) {
            return null;
        }

        return [ 'int' => $unique ];
    }

    /**
     * Resolves the agent/commercial contact name.
     */
    private function resolve_agente_comercial( $expediente ): string {
        $agent = $this->get_value( $expediente, [ 'AgenteComercial', 'agente_comercial', 'Agente', 'agente', 'Responsable', 'responsable' ], null );
        if ( $agent ) {
            $name = $this->build_person_name( $agent );
            if ( $name !== '' ) {
                return $name;
            }
        }
        return $this->get_string_field( $expediente, [ 'ResponsableNombre', 'responsableNombre' ] );
    }

    /**
     * Builds a full name from an object or fallback fields.
     */
    private function build_person_name( $value ): string {
        if ( is_object( $value ) || is_array( $value ) ) {
            $first = $this->get_value( $value, [ 'Nombre', 'nombre', 'FirstName', 'first_name' ], '' );
            $last  = $this->get_value( $value, [ 'Apellidos', 'apellidos', 'LastName', 'last_name' ], '' );
            if ( $first || $last ) {
                return trim( $first . ' ' . $last );
            }
            $fallback = $this->get_value( $value, [ 'ClienteNombre', 'customer_name', 'NombreCliente' ], '' );
            if ( $fallback ) {
                return trim( (string) $fallback );
            }
        }
        return '';
    }

    /**
     * Extracts the total PVP value from economic info.
     */
    private function extract_total_pvp( $info ): float {
        $keys = [
            'VentaComercial',
            'ventaComercial',
            'ventaTotal',
            'VentaTotal',
            'ventacomis',
            'ventacomisTotal',
            'PrecioVentaTotal',
            'precioVentaTotal',
            'PvpTotal',
            'PVPTotal',
            'PVP',
            'ImporteTotal',
            'importeTotal',
            'Total',
            'total',
        ];
        $value = $this->get_value( $info, $keys, 0 );
        return $this->convert_to_float( $value );
    }

    /**
     * Extracts the estimated margin from economic info.
     */
    private function extract_margen_estimado( $info ): float {
        $keys = [
            'margenOperacionPrevisto',
            'MargenOperacionPrevisto',
            'margenEstimado',
            'MargenEstimado',
        ];
        $value = $this->get_value( $info, $keys, 0 );
        return $this->convert_to_float( $value );
    }

    /**
     * Converts a value into a float safely.
     */
    private function convert_to_float( $value ): float {
        if ( is_numeric( $value ) ) {
            return (float) $value;
        }
        $clean = preg_replace( '/[^0-9\-,\.]/', '', (string) $value );
        if ( $clean === '' ) {
            return 0.0;
        }
        $clean = str_replace( [ ',', ' ' ], [ '.', '' ], $clean );
        return (float) $clean;
    }

    /**
     * Extracts the month number from a date string.
     */
    private function month_index_from_date( ?string $value ): ?int {
        if ( ! $value ) {
            return null;
        }
        $dt = $this->parse_date_value( $value );
        if ( ! $dt ) {
            return null;
        }
        return (int) $dt->format( 'n' );
    }

    /**
     * @return object|WP_Error
     */
    private function fetch_info_economica( int $expediente_id ) {
        $trace = [];
        $res = wp_travel_giav_call( 'Expediente_InfoEconomica_GET', [ 'id' => $expediente_id ], $trace );
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        if ( is_object( $res ) && isset( $res->Expediente_InfoEconomica_GETResult ) ) {
            return $res->Expediente_InfoEconomica_GETResult;
        }

        return $res;
    }
}
