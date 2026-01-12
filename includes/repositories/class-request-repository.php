<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_Request_Repository extends WP_Travel_GIAV_DB {

    public function __construct() {
        parent::__construct();
        $this->table = WP_TRAVEL_GIAV_TABLE_REQUESTS;
    }

    public function get_by_id( int $id ) {
        return $this->get_row( 'id = %d', [ $id ] );
    }

    public function get_by_form_entry( int $form_id, int $entry_id ) {
        return $this->get_row( 'form_id = %d AND entry_id = %d', [ $form_id, $entry_id ] );
    }

    public function upsert_request( int $form_id, int $entry_id, string $lang, string $status, array $meta = [], ?string $notes = null, ?int $assigned_to = null, ?int $proposal_id = null ) {
        $form_id = absint( $form_id );
        $entry_id = absint( $entry_id );
        $payload = [
            'form_id'   => $form_id,
            'entry_id'  => $entry_id,
            'lang'      => sanitize_key( $lang ) ?: 'es',
            'status'    => in_array( sanitize_key( $status ), WP_TRAVEL_GIAV_REQUEST_STATUSES, true ) ? sanitize_key( $status ) : 'new',
            'meta_json' => wp_json_encode( $meta ),
        ];

        if ( $notes !== null ) {
            $payload['notes'] = sanitize_textarea_field( $notes );
        }

        if ( $assigned_to !== null ) {
            $payload['assigned_to'] = absint( $assigned_to );
        }

        if ( $proposal_id !== null ) {
            $payload['proposal_id'] = absint( $proposal_id );
        }

        $existing = $this->get_by_form_entry( $form_id, $entry_id );
        if ( $existing ) {
            $this->update( $payload, [ 'id' => $existing['id'] ], null, [ '%d' ] );
            return (int) $existing['id'];
        }

        return $this->insert( $payload );
    }

    public function update_meta( int $request_id, array $meta ) {
        return $this->update(
            [ 'meta_json' => wp_json_encode( $meta ) ],
            [ 'id' => $request_id ],
            null,
            [ '%d' ]
        );
    }

    public function update_status( int $request_id, string $status, ?string $notes = null, ?int $assigned_to = null ) {
        $status = sanitize_key( $status );
        if ( ! in_array( $status, WP_TRAVEL_GIAV_REQUEST_STATUSES, true ) ) {
            return 0;
        }

        $payload = [ 'status' => $status ];
        if ( $notes !== null ) {
            $payload['notes'] = sanitize_textarea_field( $notes );
        }

        if ( $assigned_to !== null ) {
            $payload['assigned_to'] = absint( $assigned_to );
        }

        return $this->update( $payload, [ 'id' => $request_id ], null, [ '%d' ] );
    }

    public function assign_proposal( int $request_id, int $proposal_id ) {
        return $this->update(
            [ 'proposal_id' => absint( $proposal_id ) ],
            [ 'id' => $request_id ],
            [ '%d' ],
            [ '%d' ]
        );
    }

    public function list_requests( array $args = [] ) {
        $defaults = [
            'status'   => '',
            'lang'     => '',
            'form_id'  => 0,
            'search'   => '',
            'page'     => 1,
            'per_page' => 20,
        ];
        $args = wp_parse_args( $args, $defaults );

        $params = [];
        $where = '1=1';

        if ( $args['status'] ) {
            $where  .= ' AND status = %s';
            $params[] = sanitize_key( $args['status'] );
        }

        if ( $args['lang'] ) {
            $where  .= ' AND lang = %s';
            $params[] = sanitize_key( $args['lang'] );
        }

        if ( $args['form_id'] ) {
            $where  .= ' AND form_id = %d';
            $params[] = absint( $args['form_id'] );
        }

        if ( $args['search'] ) {
            $term = $this->wpdb->esc_like( trim( $args['search'] ) );
            $like = '%' . $term . '%';
            $where .= ' AND ( meta_json LIKE %s';
            $params[] = $like;
            if ( ctype_digit( $args['search'] ) ) {
                $where  .= ' OR entry_id = %d';
                $params[] = absint( $args['search'] );
            }
            $where .= ' )';
        }

        $per_page = max( 1, min( 100, absint( $args['per_page'] ) ) );
        $page     = max( 1, absint( $args['page'] ) );
        $offset   = ( $page - 1 ) * $per_page;

        $count_sql = "SELECT COUNT(*) FROM {$this->table} WHERE {$where}";
        $total = (int) $this->wpdb->get_var( $this->wpdb->prepare( $count_sql, $params ) );

        $list_sql = "SELECT * FROM {$this->table} WHERE {$where} ORDER BY created_at DESC LIMIT %d OFFSET %d";
        $list_params = array_merge( $params, [ $per_page, $offset ] );
        $rows = $this->wpdb->get_results( $this->wpdb->prepare( $list_sql, $list_params ), ARRAY_A );

        $items = array_map( [ $this, 'hydrate_request_row' ], $rows );

        return [
            'items'    => $items,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $per_page,
        ];
    }

    public function hydrate_request_row( array $row ) {
        $meta = [];
        if ( ! empty( $row['meta_json'] ) ) {
            $decoded = json_decode( $row['meta_json'], true );
            if ( is_array( $decoded ) ) {
                $meta = $decoded;
            }
        }

        return [
            'id'          => (int) $row['id'],
            'form_id'     => (int) $row['form_id'],
            'entry_id'    => (int) $row['entry_id'],
            'lang'        => $row['lang'],
            'status'      => $row['status'],
            'notes'       => $row['notes'],
            'assigned_to' => $row['assigned_to'],
            'proposal_id' => $row['proposal_id'],
            'created_at'  => $row['created_at'],
            'updated_at'  => $row['updated_at'],
            'meta'        => $meta,
            'mapped'      => $meta['mapped'] ?? [],
            'intentions'  => $meta['intentions'] ?? [],
            'raw'         => $meta['raw'] ?? [],
            'can_convert' => true,
            'can_view_linked_proposals' => ! empty( $row['proposal_id'] ),
        ];
    }
}
