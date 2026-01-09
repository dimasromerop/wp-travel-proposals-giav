<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_log_sync_start( int $version_id, string $hash ) {
    global $wpdb;

    $wpdb->insert(
        WP_TRAVEL_GIAV_TABLE_SYNC_LOG,
        [
            'version_id'    => $version_id,
            'attempt_number'=> 1,
            'request_hash'  => $hash,
            'started_at'    => current_time( 'mysql' ),
        ]
    );

    return $wpdb->insert_id;
}

function wp_travel_giav_log_sync_success( int $log_id, array $response ) {
    global $wpdb;

    $wpdb->update(
        WP_TRAVEL_GIAV_TABLE_SYNC_LOG,
        [
            'response_xml' => wp_json_encode( $response ),
            'finished_at'  => current_time( 'mysql' ),
        ],
        [ 'id' => $log_id ]
    );
}

function wp_travel_giav_log_sync_error( int $log_id, string $error ) {
    global $wpdb;

    $wpdb->update(
        WP_TRAVEL_GIAV_TABLE_SYNC_LOG,
        [
            'error_message' => $error,
            'finished_at'   => current_time( 'mysql' ),
        ],
        [ 'id' => $log_id ]
    );
}