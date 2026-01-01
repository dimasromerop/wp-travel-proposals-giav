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
}