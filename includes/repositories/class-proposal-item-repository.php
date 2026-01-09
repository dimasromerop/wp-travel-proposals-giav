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
        $sql = "SELECT * FROM {$this->table} WHERE version_id = %d ORDER BY id ASC";
        return $this->wpdb->get_results( $this->wpdb->prepare( $sql, [ $version_id ] ), ARRAY_A );
    }
}
