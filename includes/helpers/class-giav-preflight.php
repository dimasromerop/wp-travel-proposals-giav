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

            // ...
$wp_object_type = isset( $item['wp_object_type'] ) ? (string) $item['wp_object_type'] : '';
$wp_object_id   = isset( $item['wp_object_id'] ) ? (int) $item['wp_object_id'] : 0;

// NUEVO: soportar items "manuales" (sin WP ref) si tienen proveedor GIAV
$giav_supplier_id   = isset( $item['giav_supplier_id'] ) ? trim( (string) $item['giav_supplier_id'] ) : '';
$giav_supplier_name = isset( $item['giav_supplier_name'] ) ? trim( (string) $item['giav_supplier_name'] ) : '';

if ( $wp_object_type === '' || $wp_object_id <= 0 ) {

    if ( $giav_supplier_id !== '' ) {
        $warnings[] = [
            'item_id'      => $item_id,
            'service_type' => $service_type,
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
        }

        return [
            'ok'       => empty( $blocking ),
            'blocking' => $blocking,
            'warnings' => $warnings,
        ];
    }
}
