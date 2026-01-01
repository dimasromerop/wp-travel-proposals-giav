<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Item_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_ITEMS;
    }

    public function add_item( array $data ) {
        return $this->insert( $data );
    }

    public function get_by_version( int $version_id ) {
        return $this->get_results( 'version_id = %d', [ $version_id ] );
    }
}