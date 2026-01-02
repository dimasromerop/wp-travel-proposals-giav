<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Proposal_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;
    }

    public function create( array $data ) {
        $data['created_by'] = get_current_user_id();
        $data['proposal_token'] = wp_generate_password( 32, false );
        return $this->insert( $data );
    }

    public function get_by_token( string $token ) {
        return $this->get_row( 'proposal_token = %s', [ $token ] );
    }

    public function set_accepted_version( int $proposal_id, int $version_id ) {
        return $this->update(
            [
                'accepted_version_id' => $version_id,
                'accepted_at'         => current_time( 'mysql' ),
            ],
            [ 'id' => $proposal_id ],
            [ '%d', '%s' ],
            [ '%d' ]
        );
    }

    public function get_by_id( int $proposal_id ) {
        return $this->get_row( 'id = %d', [ $proposal_id ] );
    }

    public function update_status( int $proposal_id, string $status ) {
        return $this->update(
            [ 'status' => $status ],
            [ 'id' => $proposal_id ],
            [ '%s' ],
            [ '%d' ]
        );
    }

    public function set_current_version( int $proposal_id, int $version_id ) {
        return $this->update(
            [ 'current_version_id' => $version_id ],
            [ 'id' => $proposal_id ],
            [ '%d' ],
            [ '%d' ]
        );
    }

    public function is_editable( array $proposal ): bool {
        return in_array( $proposal['status'], [ 'draft', 'sent' ], true );
    }
}
