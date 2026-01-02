<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Version_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_VERSIONS;
    }

    public function create_version( array $data ) {
        return $this->insert( $data );
    }

    public function get_by_id( int $version_id ) {
        return $this->get_row( 'id = %d', [ $version_id ] );
    }

    public function get_by_token( string $token ) {
        return $this->get_row(
            'public_token = %s AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
            [ $token ]
        );
    }

    public function get_by_proposal_and_token( int $proposal_id, string $token ) {
        return $this->get_row(
            'proposal_id = %d AND public_token = %s AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
            [ $proposal_id, $token ]
        );
    }

    public function get_latest_for_proposal( int $proposal_id ) {
        $sql = $this->wpdb->prepare(
            "SELECT * FROM {$this->table} WHERE proposal_id = %d ORDER BY created_at DESC LIMIT 1",
            [ $proposal_id ]
        );
        return $this->wpdb->get_row( $sql, ARRAY_A );
    }

    public function get_versions_for_proposal( int $proposal_id ): array {
        $sql = $this->wpdb->prepare(
            "SELECT * FROM {$this->table} WHERE proposal_id = %d ORDER BY created_at DESC",
            [ $proposal_id ]
        );
        return $this->wpdb->get_results( $sql, ARRAY_A );
    }

    public function get_next_version_number( int $proposal_id ): int {
        $sql = $this->wpdb->prepare(
            "SELECT MAX(version_number) FROM {$this->table} WHERE proposal_id = %d",
            [ $proposal_id ]
        );
        $max = (int) $this->wpdb->get_var( $sql );
        return max( 1, $max + 1 );
    }

    public function mark_sync_status( int $version_id, string $status, ?string $giav_booking_id = null ) {
        $data = [
            'giav_last_sync_status' => $status,
            'giav_last_sync_at'     => current_time( 'mysql' ),
        ];

        if ( $giav_booking_id ) {
            $data['giav_booking_id'] = $giav_booking_id;
        }

        return $this->update(
            $data,
            [ 'id' => $version_id ],
            null,
            [ '%d' ]
        );
    }

    public function increment_views( int $version_id ) {
        $this->wpdb->query(
            $this->wpdb->prepare(
                "UPDATE {$this->table} SET views_count = views_count + 1 WHERE id = %d",
                $version_id
            )
        );
    }
}
