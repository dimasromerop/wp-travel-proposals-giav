<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * GIAV Preflight checks: ensures a version is safe to sync/confirm in GIAV.
 *
 * Default rule: items that require a supplier SHOULD have an active WP⇄GIAV mapping.
 * If missing, we fall back to a generic GIAV supplier and emit a warning.
 */
class WP_Travel_GIAV_Preflight {

    /**
     * Check a proposal version before GIAV confirmation/sync.
     *
     * @return array{ok:bool, blocking:array<int,array>, warnings:array<int,array>}
     */
    public static function check_version( int $version_id ) : array {

        $version_repo = new WP_Travel_Proposal_Version_Repository();
        $version = $version_repo->get_by_id( $version_id );

        if ( $version && ! empty( $version['json_snapshot'] ) ) {
            $snapshot = json_decode( $version['json_snapshot'], true );
            if ( is_array( $snapshot ) ) {
                $snapshot_check = self::check_snapshot( $snapshot );
                if ( $snapshot_check['source'] === 'snapshot' ) {
                    return $snapshot_check['result'];
                }
            }
        }

        return self::check_version_legacy( $version_id );
    }

    private static function check_snapshot( array $snapshot ) : array {
        $items = isset( $snapshot['items'] ) && is_array( $snapshot['items'] )
            ? $snapshot['items']
            : [];

        $warnings = [];
        $blocking = [];
        $has_preflight = false;

        foreach ( $items as $item ) {
            if ( array_key_exists( 'preflight_ok', $item ) || isset( $item['warnings'] ) || isset( $item['blocking'] ) ) {
                $has_preflight = true;
            }

            if ( isset( $item['warnings'] ) && is_array( $item['warnings'] ) ) {
                $warnings = array_merge( $warnings, $item['warnings'] );
            }
            if ( isset( $item['blocking'] ) && is_array( $item['blocking'] ) ) {
                $blocking = array_merge( $blocking, $item['blocking'] );
            }
        }

        if ( ! $has_preflight ) {
            return [
                'source' => 'legacy',
                'result' => [
                    'ok'       => true,
                    'blocking' => [],
                    'warnings' => [],
                ],
            ];
        }

        return [
            'source' => 'snapshot',
            'result' => [
                'ok'       => empty( $blocking ),
                'blocking' => $blocking,
                'warnings' => $warnings,
            ],
        ];
    }

    private static function check_version_legacy( int $version_id ) : array {
        $item_repo    = new WP_Travel_Proposal_Item_Repository();
        $mapping_repo = new WP_Travel_GIAV_Mapping_Repository();

        $items = $item_repo->get_by_version( $version_id );

        $requires_mapping = apply_filters(
            'wp_travel_giav_requires_mapping_service_types',
            [ 'hotel', 'golf' ]
        );

        $blocking = [];
        $warnings = [];

        foreach ( (array) $items as $item ) {

            $service_type = isset( $item['service_type'] ) ? (string) $item['service_type'] : '';
            $item_id      = isset( $item['id'] ) ? (int) $item['id'] : 0;

            if ( ! in_array( $service_type, (array) $requires_mapping, true ) ) {
                continue;
            }

            $wp_object_type = isset( $item['wp_object_type'] ) ? (string) $item['wp_object_type'] : '';
            $wp_object_id   = isset( $item['wp_object_id'] ) ? (int) $item['wp_object_id'] : 0;
            $title          = isset( $item['title'] ) ? (string) $item['title'] : '';

            $giav_supplier_id   = isset( $item['giav_supplier_id'] ) ? trim( (string) $item['giav_supplier_id'] ) : '';
            $giav_supplier_name = isset( $item['giav_supplier_name'] ) ? trim( (string) $item['giav_supplier_name'] ) : '';

            $default_supplier_id = defined( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID' )
                ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID
                : '1734698';

            if ( $wp_object_type === '' || $wp_object_id <= 0 ) {
                if ( $giav_supplier_id !== '' ) {
                    $warnings[] = [
                        'item_id'      => $item_id,
                        'service_type' => $service_type,
                        'title'        => $title,
                        'reason'       => 'manual_item_with_supplier',
                        'supplier'     => [
                            'giav_supplier_id'   => $giav_supplier_id,
                            'giav_supplier_name' => $giav_supplier_name,
                        ],
                    ];
                    continue;
                }

                $blocking[] = [
                    'item_id'      => $item_id,
                    'service_type' => $service_type,
                    'title'        => $title,
                    'reason'       => 'missing_supplier_for_manual_item',
                ];
                continue;
            }


            $mapping = $mapping_repo->get_active_mapping( $wp_object_type, $wp_object_id );

            if ( ! $mapping ) {
                $fallback = $mapping_repo->get_effective_supplier_mapping( $wp_object_type, $wp_object_id );

                $warnings[] = [
                    'item_id'        => $item_id,
                    'service_type'   => $service_type,
                    'wp_object_type' => $wp_object_type,
                    'wp_object_id'   => $wp_object_id,
                    'title'          => $title,
                    'reason'         => 'missing_active_mapping_fallback_generic_supplier',
                    'fallback'       => [
                        'giav_supplier_id'   => $fallback['giav_supplier_id'],
                        'giav_supplier_name' => $fallback['giav_supplier_name'],
                        'status'             => $fallback['status'],
                        'match_type'         => $fallback['match_type'],
                    ],
                ];
                continue;
            }

            if ( ! empty( $mapping['giav_supplier_id'] ) && $mapping['giav_supplier_id'] === $default_supplier_id ) {
                $warnings[] = [
                    'item_id'      => $item_id,
                    'service_type' => $service_type,
                    'wp_object_type' => $wp_object_type,
                    'wp_object_id' => $wp_object_id,
                    'title'        => $title,
                    'reason'       => 'generic_supplier',
                    'supplier'     => [
                        'giav_supplier_id'   => $mapping['giav_supplier_id'],
                        'giav_supplier_name' => $mapping['giav_supplier_name'] ?? '',
                    ],
                ];
            }
        }

        return [
            'ok'       => empty( $blocking ),
            'blocking' => $blocking,
            'warnings' => $warnings,
        ];
    }
}
