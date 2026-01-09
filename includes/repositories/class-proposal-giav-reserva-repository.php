<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_GIAV_Reserva_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_RESERVAS;
    }

    public function create( array $data ) {
        $data['created_at'] = current_time( 'mysql' );
        return $this->insert( $data );
    }

    public function get_by_item( int $proposal_id, int $version_id, int $item_id ) {
        return $this->get_row(
            'proposal_id = %d AND version_id = %d AND item_id = %d',
            [ $proposal_id, $version_id, $item_id ]
        );
    }
}
