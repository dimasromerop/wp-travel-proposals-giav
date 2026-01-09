<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_GIAV_Mapping_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_MAPPING;
    }

    public function get_active_mapping( string $wp_object_type, int $wp_object_id ) {
        return $this->get_row(
            'wp_object_type = %s AND wp_object_id = %d AND status = %s',
            [ $wp_object_type, $wp_object_id, 'active' ]
        );
    }

    /**
     * Returns the active mapping if present, otherwise a generic GIAV supplier fallback.
     *
     * This does NOT write anything to DB; it is meant for safe defaults during preflight/sync.
     */
    public function get_effective_supplier_mapping( string $wp_object_type, int $wp_object_id ) : array {
        $m = $this->get_active_mapping( $wp_object_type, $wp_object_id );
        if ( $m ) {
            return $m;
        }

        return [
            'wp_object_type'       => $wp_object_type,
            'wp_object_id'         => $wp_object_id,
            'giav_entity_type'     => 'supplier',
            'giav_entity_id'       => defined('WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID') ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID : '1734698',
            'giav_supplier_id'     => defined('WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID') ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID : '1734698',
            'giav_supplier_name'   => defined('WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME') ? WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME : 'Proveedores varios',
            'status'               => 'needs_review',
            'match_type'           => 'auto_generic',
        ];
    }
}