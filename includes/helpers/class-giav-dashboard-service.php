<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Builds aggregated dashboard data from GIAV.
 *
 * NOTE: We intentionally keep this conservative and read-only.
 */
class WP_Travel_GIAV_Dashboard_Service {

    /**
     * @return array|WP_Error
     */
    public function build_year_dashboard( int $year ) {
        $from = sprintf( '%04d-01-01', $year );
        $to   = sprintf( '%04d-12-31', $year );

        $expedientes = $this->fetch_expedientes_by_created_date( $from, $to );
        if ( is_wp_error( $expedientes ) ) {
            return $expedientes;
        }

        $rows = [];
        $aggregate = [
            'year'                 => $year,
            'expedientes_count'    => 0,
            'expedientes_closed'   => 0,
            'expedientes_open'     => 0,
            'pending_cobrar_total' => 0.0,
            'pending_pagar_total'  => 0.0,
            'margen_neto_total'    => 0.0,
        ];

        $monthly = array_fill( 1, 12, [ 'margen_neto' => 0.0, 'pending_cobrar' => 0.0, 'count' => 0 ] );

        foreach ( $expedientes as $exp ) {
            $exp_id = (int) ( $exp->Id ?? 0 );
            if ( $exp_id <= 0 ) {
                continue;
            }

            $aggregate['expedientes_count']++;
            $cerrado = ! empty( $exp->Cerrado );
            if ( $cerrado ) {
                $aggregate['expedientes_closed']++;
            } else {
                $aggregate['expedientes_open']++;
            }

            $info = $this->fetch_info_economica( $exp_id );
            if ( is_wp_error( $info ) ) {
                // Don't fail the whole dashboard for one broken expediente.
                $info = (object) [
                    'MargenNeto'       => 0.0,
                    'PendienteCobrar'  => 0.0,
                    'PendientePagar'   => 0.0,
                ];
            }

            $margen_neto      = (float) ( $info->MargenNeto ?? 0 );
            $pending_cobrar   = (float) ( $info->PendienteCobrar ?? 0 );
            $pending_pagar    = (float) ( $info->PendientePagar ?? 0 );

            $aggregate['pending_cobrar_total'] += $pending_cobrar;
            $aggregate['pending_pagar_total']  += $pending_pagar;
            $aggregate['margen_neto_total']    += $margen_neto;

            $created = $exp->FechaCreacion ?? null;
            $month = 1;
            if ( $created ) {
                $ts = strtotime( (string) $created );
                if ( $ts ) {
                    $month = (int) gmdate( 'n', $ts );
                }
            }

            $monthly[ $month ]['margen_neto']    += $margen_neto;
            $monthly[ $month ]['pending_cobrar'] += $pending_cobrar;
            $monthly[ $month ]['count']          += 1;

            $rows[] = [
                'id'            => $exp_id,
                'codigo'        => (string) ( $exp->Codigo ?? '' ),
                'titulo'        => (string) ( $exp->Titulo ?? '' ),
                'fecha_creacion'=> $this->date_only( $exp->FechaCreacion ?? null ),
                'fecha_desde'   => $this->date_only( $exp->FechaDesde ?? null ),
                'fecha_hasta'   => $this->date_only( $exp->FechaHasta ?? null ),
                'cerrado'       => $cerrado,
                'pendiente_cobrar' => $pending_cobrar,
                'margen_neto'   => $margen_neto,
            ];
        }

        // Sort by creation date desc (newest first).
        usort( $rows, function( $a, $b ) {
            return strcmp( $b['fecha_creacion'] ?? '', $a['fecha_creacion'] ?? '' );
        } );

        return [
            'summary' => [
                'year'                 => $aggregate['year'],
                'expedientes_count'    => $aggregate['expedientes_count'],
                'expedientes_closed'   => $aggregate['expedientes_closed'],
                'expedientes_open'     => $aggregate['expedientes_open'],
                'margen_neto_total'    => round( (float) $aggregate['margen_neto_total'], 2 ),
                'pending_cobrar_total' => round( (float) $aggregate['pending_cobrar_total'], 2 ),
                'pending_pagar_total'  => round( (float) $aggregate['pending_pagar_total'], 2 ),
            ],
            'monthly' => $monthly,
            'expedientes' => array_slice( $rows, 0, 250 ),
        ];
    }

    /**
     * @return array|WP_Error
     */
    private function fetch_expedientes_by_created_date( string $from_ymd, string $to_ymd ) {
        $page_size = 100;
        $page      = 0;
        $all       = [];

        do {
            $params = [
                'fechaCreacionDesde'          => $from_ymd,
                'fechaCreacionHasta'          => $to_ymd,
                'modoMultiFiltroFecha'        => 'Salida',
                'multiFiltroFechaDesde'       => null,
                'multiFiltroFechaHasta'       => null,
                'facturacionPendiente'        => 'NoAplicar',
                'cobroPendiente'              => 'NoAplicar',
                'estadoCierre'                => 'NoAplicar',
                'tipoExpediente'              => 'NoAplicar',
                'recepcionCosteTotal'         => 'NoAplicar',
                'pageSize'                    => $page_size,
                'pageIndex'                   => $page,
                // The rest are optional; leave them empty to avoid over-filtering.
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
        } while ( ! $done && $page < 50 );

        return $all;
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

    private function date_only( $value ): ?string {
        if ( empty( $value ) ) {
            return null;
        }
        $ts = strtotime( (string) $value );
        if ( ! $ts ) {
            return null;
        }
        return gmdate( 'Y-m-d', $ts );
    }
}
