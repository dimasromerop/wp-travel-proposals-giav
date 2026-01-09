<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

abstract class WP_Travel_GIAV_DB {

    protected $table;
    protected $wpdb;

    public function __construct() {
        global $wpdb;
        $this->wpdb = $wpdb;
    }

    protected function insert( array $data, array $format = null ) {
        $this->wpdb->insert( $this->table, $data, $format );
        return $this->wpdb->insert_id;
    }

    protected function update( array $data, array $where, array $format = null, array $where_format = null ) {
        return $this->wpdb->update( $this->table, $data, $where, $format, $where_format );
    }

    protected function get_row( $where_sql, array $params = [] ) {
        $sql = "SELECT * FROM {$this->table} WHERE {$where_sql} LIMIT 1";
        return $this->wpdb->get_row( $this->wpdb->prepare( $sql, $params ), ARRAY_A );
    }

    protected function get_results( $where_sql = '1=1', array $params = [] ) {
        $sql = "SELECT * FROM {$this->table} WHERE {$where_sql}";
        return $this->wpdb->get_results( $this->wpdb->prepare( $sql, $params ), ARRAY_A );
    }
}