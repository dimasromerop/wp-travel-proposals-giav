<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_GIAV_Snapshot_Resolver {

    /**
     * Hotel pricing modes
     * - simple: legacy behaviour (single price per night / room_pricing)
     * - per_night: variable net price per night breakdown (Option A)
     */
    const HOTEL_PRICING_MODE_SIMPLE    = 'simple';
    const HOTEL_PRICING_MODE_PER_NIGHT = 'per_night';

    /**
     * Normalize/validate nightly rates for hotel items.
     *
     * Expected structure (stored inside snapshot item):
     * nightly_rates: [
     *   { date: 'YYYY-MM-DD', net_price: 120, margin_pct: 20 }
     * ]
     *
     * Notes:
     * - margin_pct defaults to item.markup_pct (if present) when not provided
     * - dates must be within [start_date, end_date) (end_date exclusive)
     */
    private static function normalize_hotel_nightly_rates( array $item, array &$blocking, array &$warnings ) : array {
        $mode = isset( $item['hotel_pricing_mode'] ) ? (string) $item['hotel_pricing_mode'] : '';
        if ( $mode === '' && isset( $item['pricing_mode'] ) ) {
            // tolerate a generic key name from earlier iterations
            $mode = (string) $item['pricing_mode'];
        }

        $mode = $mode !== '' ? $mode : self::HOTEL_PRICING_MODE_SIMPLE;
        $mode = in_array( $mode, [ self::HOTEL_PRICING_MODE_SIMPLE, self::HOTEL_PRICING_MODE_PER_NIGHT ], true )
            ? $mode
            : self::HOTEL_PRICING_MODE_SIMPLE;

        $start = isset( $item['start_date'] ) ? (string) $item['start_date'] : '';
        $end   = isset( $item['end_date'] ) ? (string) $item['end_date'] : '';
        $rates = isset( $item['nightly_rates'] ) && is_array( $item['nightly_rates'] )
            ? $item['nightly_rates']
            : ( ( isset( $item['hotel_nightly_rates'] ) && is_array( $item['hotel_nightly_rates'] ) ) ? $item['hotel_nightly_rates'] : [] );

        // Always store normalized key names in snapshot.
        $normalized = [
            'hotel_pricing_mode' => $mode,
        ];

        if ( $mode !== self::HOTEL_PRICING_MODE_PER_NIGHT ) {
            // Legacy mode: keep payload untouched (compat).
            if ( ! empty( $rates ) ) {
                $warnings[] = self::build_message(
                    'NIGHTLY_RATES_IGNORED',
                    'nightly_rates provided but hotel_pricing_mode is not per_night',
                    'warning'
                );
            }

            return $normalized;
        }

        if ( $start === '' || $end === '' ) {
            $blocking[] = self::build_message(
                'MISSING_DATES_FOR_NIGHTLY_RATES',
                'start_date and end_date are required when using per-night hotel pricing',
                'blocking'
            );
            return $normalized;
        }

        if ( empty( $rates ) ) {
            $blocking[] = self::build_message(
                'MISSING_NIGHTLY_RATES',
                'nightly_rates must be provided when using per-night hotel pricing',
                'blocking'
            );
            $normalized['nightly_rates'] = [];
            return $normalized;
        }

        $markup_default = isset( $item['markup_pct'] ) ? (float) $item['markup_pct'] : null;

        try {
            $dt_start = new DateTimeImmutable( $start );
            $dt_end   = new DateTimeImmutable( $end );
        } catch ( Exception $e ) {
            $blocking[] = self::build_message(
                'INVALID_DATES_FOR_NIGHTLY_RATES',
                'Invalid start_date/end_date when using per-night hotel pricing',
                'blocking'
            );
            return $normalized;
        }

        if ( $dt_end <= $dt_start ) {
            $blocking[] = self::build_message(
                'INVALID_DATE_RANGE_FOR_NIGHTLY_RATES',
                'end_date must be after start_date when using per-night hotel pricing',
                'blocking'
            );
            return $normalized;
        }

        // Build expected date set for [start, end)
        $expected = [];
        for ( $d = $dt_start; $d < $dt_end; $d = $d->modify( '+1 day' ) ) {
            $expected[ $d->format( 'Y-m-d' ) ] = true;
        }

        $seen = [];
        $out  = [];
        foreach ( $rates as $row ) {
            if ( ! is_array( $row ) ) {
                continue;
            }
            $date = isset( $row['date'] ) ? (string) $row['date'] : '';
            if ( $date === '' ) {
                $blocking[] = self::build_message(
                    'MISSING_NIGHTLY_RATE_DATE',
                    'Each nightly rate row must include date',
                    'blocking'
                );
                continue;
            }
            if ( isset( $seen[ $date ] ) ) {
                $blocking[] = self::build_message(
                    'DUPLICATE_NIGHTLY_RATE_DATE',
                    'Duplicate nightly rate date: ' . $date,
                    'blocking'
                );
                continue;
            }
            $seen[ $date ] = true;

            if ( empty( $expected[ $date ] ) ) {
                $blocking[] = self::build_message(
                    'INVALID_NIGHTLY_RATE_DATE',
                    'Nightly rate date outside service range: ' . $date,
                    'blocking'
                );
                continue;
            }

            $net = isset( $row['net_price'] ) ? (float) $row['net_price'] : ( isset( $row['unit_cost_net'] ) ? (float) $row['unit_cost_net'] : 0 );
            if ( $net < 0 ) {
                $net = 0;
            }

            $margin = null;
            if ( array_key_exists( 'margin_pct', $row ) ) {
                $margin = (float) $row['margin_pct'];
            } elseif ( array_key_exists( 'margin', $row ) ) {
                $margin = (float) $row['margin'];
            } elseif ( null !== $markup_default ) {
                $margin = (float) $markup_default;
            } else {
                $margin = 0.0;
            }
            if ( $margin < 0 ) {
                $margin = 0;
            }

            $out[] = [
                'date'       => $date,
                'net_price'  => round( $net, 2 ),
                'margin_pct' => round( $margin, 2 ),
            ];
        }

        // Missing dates?
        $missing = array_diff_key( $expected, $seen );
        if ( ! empty( $missing ) ) {
            $blocking[] = self::build_message(
                'MISSING_NIGHTLY_RATE_ROWS',
                'Missing nightly rate rows for dates: ' . implode( ', ', array_keys( $missing ) ),
                'blocking'
            );
        }

        // Sort by date for stable snapshots.
        usort( $out, static function( $a, $b ) {
            return strcmp( (string) $a['date'], (string) $b['date'] );
        } );

        $normalized['nightly_rates'] = $out;

        return $normalized;
    }

    public static function resolve_snapshot( array $snapshot, array $context = [] ) : array {
        $items = isset( $snapshot['items'] ) && is_array( $snapshot['items'] )
            ? $snapshot['items']
            : [];

        $requires_mapping = apply_filters(
            'wp_travel_giav_requires_mapping_service_types',
            [ 'hotel', 'golf' ]
        );

        $mapping_repo = new WP_Travel_GIAV_Mapping_Repository();

        $default_supplier_id = defined( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID' )
            ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID
            : '1734698';
        $default_supplier_name = defined( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME' )
            ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME
            : 'Proveedores varios';

        $all_warnings = [];
        $all_blocking = [];
        $errors = [];
        $logs = [
            'generic'               => [],
            'override'              => [],
            'blocking'              => [],
            'missing_supplier_name' => [],
        ];

        foreach ( $items as $index => $item ) {
            $item_warnings = [];
            $item_blocking = [];

            $service_type = isset( $item['service_type'] ) ? (string) $item['service_type'] : '';
            $requires_supplier = in_array( $service_type, (array) $requires_mapping, true );

            $wp_object_type = isset( $item['wp_object_type'] ) ? (string) $item['wp_object_type'] : '';
            $wp_object_id   = isset( $item['wp_object_id'] ) ? (int) $item['wp_object_id'] : 0;
            $is_manual = ( $wp_object_type === 'manual' ) || $wp_object_id <= 0;

            $display_name = isset( $item['display_name'] ) ? trim( (string) $item['display_name'] ) : '';
            if ( $display_name === '' ) {
                $title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
                if ( $title !== '' ) {
                    $display_name = $title;
                }
            }
            $item['display_name'] = $display_name;

            if ( $display_name === '' ) {
                $item_blocking[] = self::build_message(
                    'MISSING_DISPLAY_NAME',
                    'display_name is required for snapshot',
                    'blocking'
                );
                $errors[] = [
                    'index' => $index,
                    'code'  => 'MISSING_DISPLAY_NAME',
                ];
            }

            if ( $service_type === 'golf' ) {
                $green_fees_per_person = isset( $item['green_fees_per_person'] ) ? (int) $item['green_fees_per_person'] : 0;
                if ( $green_fees_per_person <= 0 ) {
                    $item_blocking[] = self::build_message(
                        'MISSING_GREEN_FEES',
                        'green_fees_per_person must be >= 1 for golf services',
                        'blocking'
                    );
                }
            }

            if ( $service_type === 'hotel' ) {
                // Normalize optional hotel per-night pricing (Option A)
                $hotel_pricing_patch = self::normalize_hotel_nightly_rates( $item, $item_blocking, $item_warnings );
                $item = array_merge( $item, $hotel_pricing_patch );

                $room_pricing = isset( $item['room_pricing'] ) && is_array( $item['room_pricing'] )
                    ? $item['room_pricing']
                    : [];
                $double_enabled = ! empty( $room_pricing['double']['enabled'] );
                $single_enabled = ! empty( $room_pricing['single']['enabled'] );

                if ( ! $double_enabled && ! $single_enabled ) {
                    $item_blocking[] = self::build_message(
                        'MISSING_ROOM_PRICING',
                        'At least one room pricing mode (double or single) must be enabled',
                        'blocking'
                    );
                    $errors[] = [
                        'index' => $index,
                        'code'  => 'MISSING_ROOM_PRICING',
                    ];
                }

                if ( $double_enabled ) {
                    $double_rooms = isset( $room_pricing['double']['rooms'] ) ? (int) $room_pricing['double']['rooms'] : 0;
                    $double_basis = isset( $room_pricing['double']['pricing_basis'] ) ? (string) $room_pricing['double']['pricing_basis'] : '';
                    if ( $double_rooms < 1 ) {
                        $item_blocking[] = self::build_message(
                            'MISSING_DOUBLE_ROOMS',
                            'double.rooms must be >= 1 when enabled',
                            'blocking'
                        );
                        $errors[] = [
                            'index' => $index,
                            'code'  => 'MISSING_DOUBLE_ROOMS',
                        ];
                    }
                    if ( $double_basis === '' ) {
                        $item_blocking[] = self::build_message(
                            'MISSING_DOUBLE_BASIS',
                            'double.pricing_basis must be provided when enabled',
                            'blocking'
                        );
                        $errors[] = [
                            'index' => $index,
                            'code'  => 'MISSING_DOUBLE_BASIS',
                        ];
                    }
                }

                if ( $single_enabled ) {
                    $single_rooms = isset( $room_pricing['single']['rooms'] ) ? (int) $room_pricing['single']['rooms'] : 0;
                    if ( $single_rooms < 1 ) {
                        $item_blocking[] = self::build_message(
                            'MISSING_SINGLE_ROOMS',
                            'single.rooms must be >= 1 when enabled',
                            'blocking'
                        );
                        $errors[] = [
                            'index' => $index,
                            'code'  => 'MISSING_SINGLE_ROOMS',
                        ];
                    }
                }
                $giav_pricing = isset( $item['giav_pricing'] ) && is_array( $item['giav_pricing'] )
                    ? $item['giav_pricing']
                    : [];
                $giav_total = isset( $giav_pricing['giav_total_pvp'] ) ? (float) $giav_pricing['giav_total_pvp'] : 0;

                if ( $giav_total <= 0 ) {
                    $item_blocking[] = self::build_message(
                        'MISSING_GIAV_TOTAL',
                        'giav_pricing.giav_total_pvp must be provided for hotel services',
                        'blocking'
                    );
                    $errors[] = [
                        'index' => $index,
                        'code'  => 'MISSING_GIAV_TOTAL',
                    ];
                }
            }

            $override = ! empty( $item['supplier_override'] ) || ! empty( $item['giav_supplier_override'] );

            $mapping = null;
            if ( ! $is_manual && $wp_object_type !== '' && $wp_object_id > 0 ) {
                $mapping = $mapping_repo->get_active_mapping( $wp_object_type, $wp_object_id );
            }

            $resolved_supplier_id = '';
            $resolved_supplier_name = '';
            $resolved_entity_type = '';
            $resolved_entity_id = '';
            $supplier_source = '';

            if ( $is_manual ) {
                $supplier_source = 'manual';
                if ( ! empty( $item['giav_supplier_id'] ) ) {
                    $resolved_supplier_id = (string) $item['giav_supplier_id'];
                    $resolved_supplier_name = isset( $item['giav_supplier_name'] )
                        ? (string) $item['giav_supplier_name']
                        : '';
                } elseif ( $requires_supplier ) {
                    $resolved_supplier_id = (string) $default_supplier_id;
                    $resolved_supplier_name = (string) $default_supplier_name;
                    $logs['generic'][] = [
                        'index'        => $index,
                        'service_type' => $service_type,
                    ];
                }

                if ( $resolved_supplier_id !== '' ) {
                    $resolved_entity_type = 'supplier';
                    $resolved_entity_id   = $resolved_supplier_id;
                }

                if ( $requires_supplier ) {
                    $item_warnings[] = self::build_message(
                        'MANUAL_SERVICE',
                        'Manual service requires supplier review',
                        'warning'
                    );
                }
            } elseif ( $override && ! empty( $item['giav_supplier_id'] ) ) {
                $supplier_source = 'override';
                $resolved_supplier_id = (string) $item['giav_supplier_id'];
                $resolved_supplier_name = isset( $item['giav_supplier_name'] )
                    ? (string) $item['giav_supplier_name']
                    : '';
                $resolved_entity_type = 'supplier';
                $resolved_entity_id   = $resolved_supplier_id;

                $logs['override'][] = [
                    'index'        => $index,
                    'service_type' => $service_type,
                ];
            } elseif ( $mapping ) {
                $supplier_source = 'mapped';
                $resolved_supplier_id = isset( $mapping['giav_supplier_id'] ) ? (string) $mapping['giav_supplier_id'] : '';
                $resolved_supplier_name = isset( $mapping['giav_supplier_name'] )
                    ? (string) $mapping['giav_supplier_name']
                    : '';
                $resolved_entity_type = isset( $mapping['giav_entity_type'] )
                    ? (string) $mapping['giav_entity_type']
                    : 'supplier';
                $resolved_entity_id = isset( $mapping['giav_entity_id'] )
                    ? (string) $mapping['giav_entity_id']
                    : $resolved_supplier_id;

                if ( $requires_supplier && $resolved_supplier_id === (string) $default_supplier_id ) {
                    $item_warnings[] = self::build_message(
                        'GENERIC_SUPPLIER',
                        'Mapped supplier is generic',
                        'warning'
                    );
                }
            } elseif ( $requires_supplier ) {
                $supplier_source = 'generic';
                $resolved_supplier_id = (string) $default_supplier_id;
                $resolved_supplier_name = (string) $default_supplier_name;
                $resolved_entity_type = 'supplier';
                $resolved_entity_id   = $default_supplier_id;

                $item_warnings[] = self::build_message(
                    'GENERIC_SUPPLIER',
                    'Missing mapping, using generic supplier',
                    'warning'
                );
                $logs['generic'][] = [
                    'index'        => $index,
                    'service_type' => $service_type,
                ];
            } elseif ( $override && ! empty( $item['giav_supplier_id'] ) ) {
                $supplier_source = 'override';
                $resolved_supplier_id = (string) $item['giav_supplier_id'];
                $resolved_supplier_name = isset( $item['giav_supplier_name'] )
                    ? (string) $item['giav_supplier_name']
                    : '';
                $resolved_entity_type = 'supplier';
                $resolved_entity_id   = $resolved_supplier_id;

                $logs['override'][] = [
                    'index'        => $index,
                    'service_type' => $service_type,
                ];
            }

            if ( $requires_supplier && $resolved_supplier_id === '' ) {
                $item_blocking[] = self::build_message(
                    'MISSING_SUPPLIER',
                    'Supplier required but missing',
                    'blocking'
                );
            }

            if ( $resolved_supplier_id !== '' && $resolved_supplier_name === '' ) {
                $item_warnings[] = self::build_message(
                    'SUPPLIER_NAME_MISSING',
                    'Supplier name missing',
                    'warning'
                );
                $logs['missing_supplier_name'][] = [
                    'index'        => $index,
                    'service_type' => $service_type,
                ];
            }

            $resolution_chain = [];
            if ( $requires_supplier ) {
                if ( $is_manual ) {
                    $resolution_chain = [ 'manual', 'generic' ];
                } elseif ( $override ) {
                    $resolution_chain = [ 'override', 'mapping', 'generic' ];
                } else {
                    $resolution_chain = [ 'mapping', 'generic' ];
                }
            }

            $item['giav_supplier_id'] = $resolved_supplier_id !== '' ? $resolved_supplier_id : null;
            $item['giav_supplier_name'] = $resolved_supplier_name;
            if ( $resolved_entity_type !== '' ) {
                $item['giav_entity_type'] = $resolved_entity_type;
            }
            if ( $resolved_entity_id !== '' ) {
                $item['giav_entity_id'] = $resolved_entity_id;
            }

            $item['supplier_source'] = $supplier_source;
            $item['supplier_resolution_chain'] = $resolution_chain;
            $item['warnings'] = $item_warnings;
            $item['blocking'] = $item_blocking;
            $item['preflight_ok'] = empty( $item_blocking );

            if ( ! empty( $item_blocking ) ) {
                $logs['blocking'][] = [
                    'index'        => $index,
                    'service_type' => $service_type,
                ];
            }

            $all_warnings = array_merge( $all_warnings, $item_warnings );
            $all_blocking = array_merge( $all_blocking, $item_blocking );

            $items[ $index ] = $item;
        }

        $snapshot['items'] = $items;
        $snapshot['preflight'] = [
            'ok'       => empty( $all_blocking ),
            'warnings' => $all_warnings,
            'blocking' => $all_blocking,
        ];

        return [
            'snapshot'  => $snapshot,
            'preflight' => $snapshot['preflight'],
            'warnings'  => $all_warnings,
            'blocking'  => $all_blocking,
            'errors'    => $errors,
            'logs'      => $logs,
            'context'   => $context,
        ];
    }

    private static function build_message( string $code, string $message, string $severity ) : array {
        return [
            'code'     => $code,
            'message'  => $message,
            'severity' => $severity,
        ];
    }

    public static function build_item_row( int $version_id, array $item ) : array {
        return [
            'version_id'               => $version_id,
            'day_index'                => isset( $item['day_index'] ) ? (int) $item['day_index'] : 1,
            'service_type'             => isset( $item['service_type'] ) ? (string) $item['service_type'] : '',
            'display_name'             => isset( $item['display_name'] ) ? (string) $item['display_name'] : '',
            'wp_object_type'           => isset( $item['wp_object_type'] ) ? (string) $item['wp_object_type'] : null,
            'wp_object_id'             => isset( $item['wp_object_id'] ) ? (int) $item['wp_object_id'] : 0,
            'giav_entity_type'         => isset( $item['giav_entity_type'] ) ? (string) $item['giav_entity_type'] : null,
            'giav_entity_id'           => isset( $item['giav_entity_id'] ) ? (string) $item['giav_entity_id'] : null,
            'giav_supplier_id'         => isset( $item['giav_supplier_id'] ) ? (string) $item['giav_supplier_id'] : null,
            'giav_supplier_name'       => isset( $item['giav_supplier_name'] ) ? (string) $item['giav_supplier_name'] : '',
            'supplier_source'          => isset( $item['supplier_source'] ) ? (string) $item['supplier_source'] : null,
            'supplier_resolution_chain'=> wp_json_encode( $item['supplier_resolution_chain'] ?? [] ),
            'warnings_json'            => wp_json_encode( $item['warnings'] ?? [] ),
            'blocking_json'            => wp_json_encode( $item['blocking'] ?? [] ),
            'preflight_ok'             => empty( $item['blocking'] ) ? 1 : 0,
            'start_date'               => isset( $item['start_date'] ) ? $item['start_date'] : null,
            'end_date'                 => isset( $item['end_date'] ) ? $item['end_date'] : null,
            'quantity'                 => isset( $item['quantity'] ) ? (int) $item['quantity'] : 1,
            'pax_quantity'             => isset( $item['pax_quantity'] ) ? (int) $item['pax_quantity'] : 1,
            'unit_cost_net'            => isset( $item['unit_cost_net'] ) ? (float) $item['unit_cost_net'] : 0,
            'unit_sell_price'          => isset( $item['unit_sell_price'] ) ? (float) $item['unit_sell_price'] : 0,
            'notes_public'             => isset( $item['notes_public'] ) ? (string) $item['notes_public'] : '',
            'notes_internal'           => isset( $item['notes_internal'] ) ? (string) $item['notes_internal'] : '',
        ];
    }
}

/*
 * Manual test checklist:
 * - Catalog item with active mapping -> supplier_source=mapped, no blocking.
 * - Catalog item without mapping -> supplier_source=generic, warning GENERIC_SUPPLIER.
 * - Manual item with generic supplier -> warning MANUAL_SERVICE, no blocking.
 * - Manual item with explicit supplier -> supplier_source=manual, no blocking.
 * - Missing supplier id on required item -> blocking MISSING_SUPPLIER.
 */
