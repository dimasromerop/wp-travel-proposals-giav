<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_sync_worker( $args ) {

    if ( empty( $args['version_id'] ) ) {
        return;
    }

    $version_id = (int) $args['version_id'];

    $version_repo = new WP_Travel_Proposal_Version_Repository();
    $proposal_repo = new WP_Travel_Proposal_Repository();
    $item_repo = new WP_Travel_Proposal_Item_Repository();
    $audit_repo = new WP_Travel_Audit_Log_Repository();

    $version = $version_repo->get_by_id( $version_id );
    if ( ! $version ) {
        return;
    }

    // Idempotencia: si ya hay booking_id, no recrear
    if ( ! empty( $version['giav_booking_id'] ) ) {
        return;
    }

// Preflight GIAV: bloquear sync si hay items sin mapeo activo
$preflight = WP_Travel_GIAV_Preflight::check_version( $version_id );
if ( empty( $preflight['ok'] ) ) {
    $version_repo->mark_sync_status( $version_id, 'error' );

    $audit_repo->log(
        0,
        'sync_blocked',
        'version',
        $version_id,
        [ 'preflight' => $preflight ]
    );

    return;
}

    // Marcar estado queued
    $version_repo->mark_sync_status( $version_id, 'queued' );

    $items = $item_repo->get_by_version( $version_id );

    // Fallback: if a required service has no explicit supplier mapping yet,
    // use the generic GIAV supplier and keep a warning in audit log.
    $requires_mapping = apply_filters(
        'wp_travel_giav_requires_mapping_service_types',
        [ 'hotel', 'golf' ]
    );

    $default_supplier_id = defined('WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID') ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID : '1734698';

    $fallback_applied = [];
    foreach ( $items as &$it ) {
        $service_type = isset( $it['service_type'] ) ? (string) $it['service_type'] : '';
        if ( ! in_array( $service_type, (array) $requires_mapping, true ) ) {
            continue;
        }

        $has_supplier = ! empty( $it['giav_supplier_id'] );
        $has_entity   = ! empty( $it['giav_entity_id'] );

        if ( $has_supplier && $has_entity ) {
            continue;
        }

        $fallback_applied[] = [
            'item_id'      => isset($it['id']) ? (int) $it['id'] : 0,
            'service_type' => $service_type,
        ];

        $it['giav_entity_type'] = 'supplier';
        $it['giav_entity_id']   = $default_supplier_id;
        $it['giav_supplier_id'] = $default_supplier_id;
    }
    unset( $it );

    if ( ! empty( $fallback_applied ) ) {
        $audit_repo->log(
            get_current_user_id(),
            'generic_supplier_fallback',
            'version',
            $version_id,
            [
                'default_supplier_id' => $default_supplier_id,
                'items' => $fallback_applied,
            ]
        );
    }

    // Construir payload (stub)
    $payload = wp_travel_giav_build_payload( $version, $items );

    $payload_hash = hash( 'sha256', wp_json_encode( $payload ) );

    // Log técnico: inicio
    $sync_log_id = wp_travel_giav_log_sync_start(
        $version_id,
        $payload_hash
    );

    try {

        $client = new WP_Travel_GIAV_Soap_Client();

        $response = $client->create_booking( $payload );

        if ( empty( $response['booking_id'] ) ) {
            throw new Exception( 'Invalid GIAV response' );
        }

        // Guardar booking_id + estado
        $version_repo->mark_sync_status(
            $version_id,
            'success',
            $response['booking_id']
        );

        // Actualizar propuesta a synced
        $proposal_repo->update_status(
            (int) $version['proposal_id'],
            'synced'
        );

        wp_travel_giav_log_sync_success(
            $sync_log_id,
            $response
        );

        $audit_repo->log(
            get_current_user_id(),
            'sync_success',
            'version',
            $version_id,
            [ 'giav_booking_id' => $response['booking_id'] ]
        );

    } catch ( Exception $e ) {

        $version_repo->mark_sync_status( $version_id, 'error' );

        wp_travel_giav_log_sync_error(
            $sync_log_id,
            $e->getMessage()
        );

        $audit_repo->log(
            get_current_user_id(),
            'sync_error',
            'version',
            $version_id,
            [ 'error' => $e->getMessage() ]
        );
    }
}