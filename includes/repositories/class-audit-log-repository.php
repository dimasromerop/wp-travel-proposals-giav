<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Audit_Log_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_AUDIT;
    }

    public function log( int $user_id, string $action, string $entity_type, int $entity_id, array $meta = [] ) {
        return $this->insert( [
            'actor_user_id' => $user_id,
            'action'        => $action,
            'entity_type'   => $entity_type,
            'entity_id'     => $entity_id,
            'meta_data'     => ! empty( $meta ) ? wp_json_encode( $meta ) : null,
        ] );
    }
}