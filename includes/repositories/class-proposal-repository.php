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

    public function accept_proposal( int $proposal_id, int $version_id, string $accepted_by, ?int $accepted_by_user_id = null, ?string $accepted_ip = null ) {
        $data = [
            'status'              => 'accepted',
            'accepted_version_id' => $version_id,
            'accepted_at'         => current_time( 'mysql' ),
            'accepted_by'         => $accepted_by,
            'accepted_by_user_id' => $accepted_by_user_id,
            'accepted_ip'         => $accepted_ip,
            'confirmation_status' => 'pending',
            'portal_invite_status'=> null,
        ];

        $formats = [ '%s', '%d', '%s', '%s', '%d', '%s', '%s', '%s' ];

        return $this->update(
            $data,
            [ 'id' => $proposal_id ],
            $formats,
            [ '%d' ]
        );
    }

    public function clear_acceptance( int $proposal_id, string $status = 'sent' ) {
        return $this->update(
            [
                'status'              => $status,
                'accepted_version_id' => null,
                'accepted_at'         => null,
                'accepted_by'         => null,
                'accepted_by_user_id' => null,
                'accepted_ip'         => null,
                'confirmation_status' => null,
                'portal_invite_status'=> null,
            ],
            [ 'id' => $proposal_id ],
            [ '%s', '%d', '%s', '%s', '%d', '%s', '%s', '%s' ],
            [ '%d' ]
        );
    }

    public function get_by_id( int $proposal_id ) {
        return $this->get_row( 'id = %d', [ $proposal_id ] );
    }

    public function update_basics( int $proposal_id, array $data ) {
        if ( empty( $data ) ) {
            return 0;
        }

        return $this->update(
            $data,
            [ 'id' => $proposal_id ],
            null,
            [ '%d' ]
        );
    }

    public function update_from_snapshot_header( int $proposal_id, array $header ) {
        if ( empty( $header ) ) {
            return 0;
        }

        $data = [];
        $fields = [
            'customer_name'     => 'customer_name',
            'customer_email'    => 'customer_email',
            'customer_country'  => 'customer_country',
            'customer_language' => 'customer_language',
            'start_date'        => 'start_date',
            'end_date'          => 'end_date',
            'pax_total'         => 'pax_total',
            'players_count'     => 'players_count',
            'currency'          => 'currency',
            'proposal_title'    => 'proposal_title',
        ];

        foreach ( $fields as $source => $target ) {
            if ( ! array_key_exists( $source, $header ) ) {
                continue;
            }
            $value = $header[ $source ];
            if ( in_array( $source, [ 'pax_total', 'players_count' ], true ) ) {
                $data[ $target ] = (int) $value;
            } else {
                $data[ $target ] = is_string( $value ) ? sanitize_text_field( $value ) : $value;
            }
        }

        return $this->update_basics( $proposal_id, $data );
    }

    public function update_traveler_details( int $proposal_id, string $full_name, string $dni ) {
        $data = [
            'traveler_full_name' => sanitize_text_field( $full_name ),
            'traveler_dni'       => sanitize_text_field( $dni ),
        ];

        return $this->update(
            $data,
            [ 'id' => $proposal_id ],
            [ '%s', '%s' ],
            [ '%d' ]
        );
    }

    public function update_giav_ids( int $proposal_id, array $data ) {
        if ( empty( $data ) ) {
            return 0;
        }

        $data['giav_sync_updated_at'] = current_time( 'mysql' );

        return $this->update(
            $data,
            [ 'id' => $proposal_id ],
            null,
            [ '%d' ]
        );
    }

    public function update_giav_sync_status( int $proposal_id, string $status, ?string $error_message = null ) {
        $data = [
            'giav_sync_status'     => $status,
            'giav_sync_error'      => $error_message,
            'giav_sync_updated_at' => current_time( 'mysql' ),
        ];

        return $this->update(
            $data,
            [ 'id' => $proposal_id ],
            [ '%s', '%s', '%s' ],
            [ '%d' ]
        );
    }

    public function get_admin_list( string $search, int $page, int $per_page, array $args = [] ): array {
        $page = max( 1, $page );
        $per_page = max( 1, $per_page );
        $offset = ( $page - 1 ) * $per_page;

        $where = '1=1';
        $params = [];
        $join = '';

        $author = isset( $args['author'] ) ? trim( (string) $args['author'] ) : '';
        if ( $author !== '' ) {
            $join = "LEFT JOIN {$this->wpdb->users} u ON u.ID = p.created_by";
            if ( is_numeric( $author ) ) {
                $where .= ' AND p.created_by = %d';
                $params[] = (int) $author;
            } else {
                $like = '%' . $this->wpdb->esc_like( $author ) . '%';
                $where .= ' AND u.display_name LIKE %s';
                $params[] = $like;
            }
        }

        if ( $search !== '' ) {
            $like = '%' . $this->wpdb->esc_like( $search ) . '%';
            $where .= " AND (customer_name LIKE %s OR customer_email LIKE %s OR proposal_token LIKE %s OR CAST(id AS CHAR) LIKE %s)";
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $count_sql = "SELECT COUNT(*) FROM {$this->table} p {$join} WHERE {$where}";
        $count_sql = $this->wpdb->prepare( $count_sql, $params );
        $total = (int) $this->wpdb->get_var( $count_sql );

        $versions_table = WP_TRAVEL_GIAV_TABLE_VERSIONS;
        $items_table = WP_TRAVEL_GIAV_TABLE_ITEMS;
        if ( ! $join ) {
            $join = "LEFT JOIN {$this->wpdb->users} u ON u.ID = p.created_by";
        }

        $order_by = isset( $args['order_by'] ) && in_array( $args['order_by'], [ 'id', 'updated_at' ], true )
            ? $args['order_by']
            : 'updated_at';
        $order = strtoupper( isset( $args['order'] ) ? (string) $args['order'] : 'DESC' );
        $order = in_array( $order, [ 'ASC', 'DESC' ], true ) ? $order : 'DESC';

        $list_sql = "
            SELECT p.*, u.display_name AS author_name,
                v.created_at AS current_version_created_at,
                v.totals_sell_price AS current_version_total,
                v.version_number AS current_version_number,
                COALESCE(NULLIF(p.proposal_title, ''), (
                    SELECT i.display_name FROM {$items_table} i
                    WHERE i.version_id = p.current_version_id
                    ORDER BY i.day_index ASC, i.id ASC
                    LIMIT 1
                )) AS display_title
            FROM {$this->table} p
            LEFT JOIN {$versions_table} v ON v.id = p.current_version_id
            {$join}
            WHERE {$where}
            ORDER BY p.{$order_by} {$order}
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
        $updated = $this->update(
            [ 'current_version_id' => $version_id ],
            [ 'id' => $proposal_id ],
            [ '%d' ],
            [ '%d' ]
        );

        $proposal = $this->get_by_id( $proposal_id );
        if ( $proposal && $proposal['status'] === 'accepted' && (int) $proposal['accepted_version_id'] !== $version_id ) {
            $this->clear_acceptance( $proposal_id );
        }

        return $updated;
    }

    public function is_editable( array $proposal ): bool {
        return in_array( $proposal['status'], [ 'draft', 'sent' ], true );
    }

    public function list_proposals( array $args = [] ) : array {
        $defaults = [
            'order_by' => 'updated_at',
            'order'    => 'DESC',
            'limit'    => 50,
            'offset'   => 0,
            'search'   => '',
            'author'   => '',
        ];

        $args = wp_parse_args( $args, $defaults );

        $order_by = in_array( $args['order_by'], [ 'id', 'updated_at' ], true )
            ? $args['order_by']
            : 'updated_at';
        $order = strtoupper( (string) $args['order'] );
        $order = in_array( $order, [ 'ASC', 'DESC' ], true ) ? $order : 'DESC';

        $limit = max( 1, (int) $args['limit'] );
        $offset = max( 0, (int) $args['offset'] );

        $users_table = $this->wpdb->users;
        $items_table = WP_TRAVEL_GIAV_TABLE_ITEMS;
        $where = '1=1';
        $params = [];

        if ( $args['search'] !== '' ) {
            $like = '%' . $this->wpdb->esc_like( $args['search'] ) . '%';
            $where .= " AND (p.customer_name LIKE %s OR p.customer_email LIKE %s OR p.proposal_token LIKE %s OR CAST(p.id AS CHAR) LIKE %s)";
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        if ( $args['author'] !== '' ) {
            if ( is_numeric( $args['author'] ) ) {
                $where .= ' AND p.created_by = %d';
                $params[] = (int) $args['author'];
            } else {
                $like = '%' . $this->wpdb->esc_like( $args['author'] ) . '%';
                $where .= ' AND u.display_name LIKE %s';
                $params[] = $like;
            }
        }

        $sql = "
            SELECT p.*, u.display_name AS author_name,
                COALESCE(NULLIF(p.proposal_title, ''), (
                    SELECT i.display_name FROM {$items_table} i
                    WHERE i.version_id = p.current_version_id
                    ORDER BY i.day_index ASC, i.id ASC
                    LIMIT 1
                )) AS display_title
            FROM {$this->table} p
            LEFT JOIN {$users_table} u ON u.ID = p.created_by
            WHERE {$where}
            ORDER BY p.{$order_by} {$order}
            LIMIT %d OFFSET %d
        ";

        return $this->wpdb->get_results(
            $this->wpdb->prepare( $sql, array_merge( $params, [ $limit, $offset ] ) ),
            ARRAY_A
        );
    }

    public function delete_by_id( int $proposal_id ): bool {
        $versions_table = WP_TRAVEL_GIAV_TABLE_VERSIONS;
        $items_table = WP_TRAVEL_GIAV_TABLE_ITEMS;

        $version_ids = $this->wpdb->get_col(
            $this->wpdb->prepare(
                "SELECT id FROM {$versions_table} WHERE proposal_id = %d",
                $proposal_id
            )
        );

        if ( ! empty( $version_ids ) ) {
            $placeholders = implode( ',', array_fill( 0, count( $version_ids ), '%d' ) );
            $items_sql = $this->wpdb->prepare(
                "DELETE FROM {$items_table} WHERE version_id IN ({$placeholders})",
                $version_ids
            );
            $this->wpdb->query( $items_sql );

            $versions_sql = $this->wpdb->prepare(
                "DELETE FROM {$versions_table} WHERE id IN ({$placeholders})",
                $version_ids
            );
            $this->wpdb->query( $versions_sql );
        }

        $deleted = $this->wpdb->delete( $this->table, [ 'id' => $proposal_id ], [ '%d' ] );
        return (bool) $deleted;
    }

    public function delete_by_ids( array $proposal_ids ): int {
        $deleted = 0;
        foreach ( $proposal_ids as $proposal_id ) {
            if ( $this->delete_by_id( (int) $proposal_id ) ) {
                $deleted++;
            }
        }
        return $deleted;
    }
}
