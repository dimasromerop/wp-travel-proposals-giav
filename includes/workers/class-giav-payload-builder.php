<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_build_payload( array $version, array $items ) {

    $snapshot = json_decode( $version['json_snapshot'], true );

    return [
        'external_reference' => $version['public_token'],
        'currency'           => $snapshot['currency'],
        'total_sell_price'   => $version['totals_sell_price'],
        'services'           => array_map( function ( $item ) {
            return [
                'giav_entity_type' => $item['giav_entity_type'],
                'giav_entity_id'   => $item['giav_entity_id'],
                'supplier_id'      => $item['giav_supplier_id'],
                'cost_net'         => $item['line_cost_net'],
                'sell_price'       => $item['line_sell_price'],
                'start_date'       => $item['start_date'],
                'end_date'         => $item['end_date'],
            ];
        }, $items ),
    ];
}