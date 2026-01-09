<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

abstract class WP_Travel_REST_Controller extends WP_REST_Controller {

    public function permission_check() {
    return current_user_can( 'manage_options' );
}


    protected function response( $data, int $status = 200 ) {
        return new WP_REST_Response( $data, $status );
    }

    protected function error( string $message, int $status = 400 ) {
        return new WP_Error( 'wp_travel_error', $message, [ 'status' => $status ] );
    }

    protected function log_snapshot_resolution( int $proposal_id, int $version_id, array $logs ) : void {
        if ( empty( $logs ) ) {
            return;
        }

        $prefix = '[WP Travel GIAV]';

        if ( ! empty( $logs['generic'] ) ) {
            $indexes = array_map( function ( $entry ) {
                return isset( $entry['index'] ) ? (int) $entry['index'] + 1 : 0;
            }, $logs['generic'] );
            error_log(
                sprintf(
                    '%s Generic supplier fallback for proposal %d version %d items: %s',
                    $prefix,
                    $proposal_id,
                    $version_id,
                    implode( ',', array_filter( $indexes ) )
                )
            );
        }

        if ( ! empty( $logs['override'] ) ) {
            $indexes = array_map( function ( $entry ) {
                return isset( $entry['index'] ) ? (int) $entry['index'] + 1 : 0;
            }, $logs['override'] );
            error_log(
                sprintf(
                    '%s Supplier override applied for proposal %d version %d items: %s',
                    $prefix,
                    $proposal_id,
                    $version_id,
                    implode( ',', array_filter( $indexes ) )
                )
            );
        }

        if ( ! empty( $logs['missing_supplier_name'] ) ) {
            $indexes = array_map( function ( $entry ) {
                return isset( $entry['index'] ) ? (int) $entry['index'] + 1 : 0;
            }, $logs['missing_supplier_name'] );
            error_log(
                sprintf(
                    '%s Supplier name missing for proposal %d version %d items: %s',
                    $prefix,
                    $proposal_id,
                    $version_id,
                    implode( ',', array_filter( $indexes ) )
                )
            );
        }

        if ( ! empty( $logs['blocking'] ) ) {
            $indexes = array_map( function ( $entry ) {
                return isset( $entry['index'] ) ? (int) $entry['index'] + 1 : 0;
            }, $logs['blocking'] );
            error_log(
                sprintf(
                    '%s Preflight blocking for proposal %d version %d items: %s',
                    $prefix,
                    $proposal_id,
                    $version_id,
                    implode( ',', array_filter( $indexes ) )
                )
            );
        }
    }
}
