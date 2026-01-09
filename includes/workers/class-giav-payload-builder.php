<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_build_payload( array $version, array $items, array $snapshot = [] ) {

    if ( empty( $snapshot ) && ! empty( $version['json_snapshot'] ) ) {
        $snapshot = json_decode( $version['json_snapshot'], true );
    }

    $currency = '';
    if ( isset( $snapshot['header']['currency'] ) ) {
        $currency = (string) $snapshot['header']['currency'];
    } elseif ( isset( $snapshot['currency'] ) ) {
        $currency = (string) $snapshot['currency'];
    }

    $total_sell_price = isset( $snapshot['totals']['totals_sell_price'] )
        ? (float) $snapshot['totals']['totals_sell_price']
        : (float) ( $version['totals_sell_price'] ?? 0 );

    $snapshot_items = isset( $snapshot['items'] ) && is_array( $snapshot['items'] )
        ? array_values( $snapshot['items'] )
        : [];

    return [
        'external_reference' => $version['public_token'],
        'currency'           => $currency,
        'total_sell_price'   => $total_sell_price,
        'services'           => array_map( function ( $item, $index ) use ( $snapshot_items ) {
            $cost_net = isset( $item['line_cost_net'] )
                ? (float) $item['line_cost_net']
                : (float) ( ( $item['quantity'] ?? 0 ) * ( $item['unit_cost_net'] ?? 0 ) );
            $sell_price = isset( $item['line_sell_price'] )
                ? (float) $item['line_sell_price']
                : (float) ( ( $item['quantity'] ?? 0 ) * ( $item['unit_sell_price'] ?? 0 ) );

            if ( isset( $item['service_type'] ) && $item['service_type'] === 'hotel' && isset( $snapshot_items[ $index ] ) ) {
                $snapshot_item = $snapshot_items[ $index ];
                $giav_pricing = isset( $snapshot_item['giav_pricing'] ) && is_array( $snapshot_item['giav_pricing'] )
                    ? $snapshot_item['giav_pricing']
                    : [];
                if ( isset( $giav_pricing['giav_total_pvp'] ) ) {
                    $sell_price = (float) $giav_pricing['giav_total_pvp'];
                }
                if ( isset( $giav_pricing['giav_total_net'] ) ) {
                    $cost_net = (float) $giav_pricing['giav_total_net'];
                }
            }

            return [
                'giav_entity_type' => $item['giav_entity_type'] ?? null,
                'giav_entity_id'   => $item['giav_entity_id'] ?? null,
                'supplier_id'      => $item['giav_supplier_id'] ?? null,
                'cost_net'         => $cost_net,
                'sell_price'       => $sell_price,
                'start_date'       => $item['start_date'] ?? null,
                'end_date'         => $item['end_date'] ?? null,
            ];
        }, $items, array_keys( $items ) ),
    ];
}
