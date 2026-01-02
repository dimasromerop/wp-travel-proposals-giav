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

    public function get_admin_list( string $search, int $page, int $per_page ): array {
        $page = max( 1, $page );
        $per_page = max( 1, $per_page );
        $offset = ( $page - 1 ) * $per_page;

        $where = '1=1';
        $params = [];

        if ( $search !== '' ) {
            $like = '%' . $this->wpdb->esc_like( $search ) . '%';
            $where .= " AND (customer_name LIKE %s OR customer_email LIKE %s OR proposal_token LIKE %s OR CAST(id AS CHAR) LIKE %s)";
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $count_sql = "SELECT COUNT(*) FROM {$this->table} WHERE {$where}";
        $count_sql = $this->wpdb->prepare( $count_sql, $params );
        $total = (int) $this->wpdb->get_var( $count_sql );

        $versions_table = WP_TRAVEL_GIAV_TABLE_VERSIONS;
        $list_sql = "
            SELECT p.*, v.created_at AS current_version_created_at, v.totals_sell_price AS current_version_total, v.version_number AS current_version_number
            FROM {$this->table} p
            LEFT JOIN {$versions_table} v ON v.id = p.current_version_id
            WHERE {$where}
            ORDER BY p.updated_at DESC
            LIMIT %d OFFSET %d
        ";

        $list_params = array_merge( $params, [ $per_page, $offset ] );
        $list_sql = $this->wpdb->prepare( $list_sql, $list_params );
        $items = $this->wpdb->get_results( $list_sql, ARRAY_A );

        return [
            'items'      => $items,
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $per_page,
            'total_page' => (int) ceil( $total / $per_page ),
        ];
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
