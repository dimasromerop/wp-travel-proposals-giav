<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_gf_is_active() {
    return class_exists( 'GFAPI' );
}

function wp_travel_giav_gf_get_forms_config() {
    $defaults = [
        'es_form_id' => 0,
        'en_form_id' => 0,
    ];
    return wp_parse_args( get_option( WP_TRAVEL_GIAV_GF_FORMS_OPTION, [] ), $defaults );
}

function wp_travel_giav_gf_update_forms_config( array $config ) {
    $sanitized = [
        'es_form_id' => absint( $config['es_form_id'] ?? 0 ),
        'en_form_id' => absint( $config['en_form_id'] ?? 0 ),
    ];
    return update_option( WP_TRAVEL_GIAV_GF_FORMS_OPTION, $sanitized );
}

function wp_travel_giav_gf_get_canonical_fields() {
    return [
        'package',
        'nombre',
        'apellido',
        'email',
        'telefono',
        'fecha_llegada',
        'fecha_regreso',
        'green_fees_per_player',
        'jugadores',
        'no_jugadores',
        'vuelos_checkbox',
        'aeropuerto_salida',
        'mas_info',
    ];
}

function wp_travel_giav_gf_get_mapping_for_form( $form_id ) {
    $form_id = absint( $form_id );
    if ( $form_id <= 0 ) {
        return [];
    }
    $mapping = get_option( WP_TRAVEL_GIAV_GF_MAP_OPTION_PREFIX . $form_id, [] );
    return is_array( $mapping ) ? $mapping : [];
}

function wp_travel_giav_gf_update_mapping_for_form( $form_id, array $mapping ) {
    $form_id = absint( $form_id );
    if ( $form_id <= 0 ) {
        return false;
    }

    $clean = [];
    foreach ( wp_travel_giav_gf_get_canonical_fields() as $key ) {
        if ( isset( $mapping[ $key ] ) ) {
            $clean[ $key ] = absint( $mapping[ $key ] );
        }
    }

    return update_option( WP_TRAVEL_GIAV_GF_MAP_OPTION_PREFIX . $form_id, $clean );
}

function wp_travel_giav_gf_get_lang_for_form( $form_id ) {
    $config = wp_travel_giav_gf_get_forms_config();
    if ( $form_id === absint( $config['es_form_id'] ) ) {
        return 'es';
    }
    if ( $form_id === absint( $config['en_form_id'] ) ) {
        return 'en';
    }
    return '';
}

function wp_travel_giav_gf_get_form_fields( $form_id ) {
    if ( ! wp_travel_giav_gf_is_active() ) {
        return [];
    }

    $form = GFAPI::get_form( (int) $form_id );
    if ( is_wp_error( $form ) || empty( $form['fields'] ) || ! is_array( $form['fields'] ) ) {
        return [];
    }

    $fields = [];
    foreach ( $form['fields'] as $field ) {
        $fields[] = [
            'id'    => (int) ( is_object( $field ) ? ( $field->id ?? 0 ) : ( $field['id'] ?? 0 ) ),
            'label' => (string) ( is_object( $field ) ? ( $field->label ?? '' ) : ( $field['label'] ?? '' ) ),
            'type'  => (string) ( is_object( $field ) ? ( $field->type ?? '' ) : ( $field['type'] ?? '' ) ),
        ];
    }

    return $fields;
}

function wp_travel_giav_gf_get_entry_value( $entry, $field_id ) {
    if ( empty( $entry ) || empty( $field_id ) ) {
        return '';
    }

    $key = (string) $field_id;
    if ( isset( $entry[ $key ] ) ) {
        return $entry[ $key ];
    }

    if ( isset( $entry[ (int) $key ] ) ) {
        return $entry[ (int) $key ];
    }

    return '';
}

function wp_travel_giav_gf_map_entry_fields( $entry, $form_id ) {
    $mapping = wp_travel_giav_gf_get_mapping_for_form( $form_id );
    $lang = wp_travel_giav_gf_get_lang_for_form( $form_id ) ?: 'es';

    $get = static function ( $field_key ) use ( $entry, $mapping ) {
        $field_id = $mapping[ $field_key ] ?? 0;
        $value = wp_travel_giav_gf_get_entry_value( $entry, $field_id );
        return is_array( $value ) ? implode( ', ', $value ) : $value;
    };

    $nombre = sanitize_text_field( $get( 'nombre' ) );
    $apellido = sanitize_text_field( $get( 'apellido' ) );
    $email = sanitize_email( $get( 'email' ) );
    $telefono = sanitize_text_field( $get( 'telefono' ) );
    $package = sanitize_text_field( $get( 'package' ) );
    $arrival = sanitize_text_field( $get( 'fecha_llegada' ) );
    $departure = sanitize_text_field( $get( 'fecha_regreso' ) );
    $green_fees = is_numeric( $get( 'green_fees_per_player' ) ) ? floatval( $get( 'green_fees_per_player' ) ) : 0;
    $players = max( 0, absint( $get( 'jugadores' ) ) );
    $non_players = max( 0, absint( $get( 'no_jugadores' ) ) );
    $more_info = sanitize_textarea_field( $get( 'mas_info' ) );
    $airport = sanitize_text_field( $get( 'aeropuerto_salida' ) );
    $flights_checkbox = wp_travel_giav_gf_get_entry_value( $entry, $mapping['vuelos_checkbox'] ?? 0 );
    $flights_requested = filter_var( $flights_checkbox, FILTER_VALIDATE_BOOLEAN ) && $airport !== '';

    $mapped = [
        'package'                => $package,
        'nombre'                 => $nombre,
        'apellido'               => $apellido,
        'email'                  => $email,
        'telefono'               => $telefono,
        'fecha_llegada'          => $arrival,
        'fecha_regreso'          => $departure,
        'green_fees_per_player'  => $green_fees,
        'jugadores'              => $players,
        'no_jugadores'           => $non_players,
        'pax_total'              => $players + $non_players,
        'flights_requested'      => $flights_requested,
        'departure_airport'      => $airport,
        'more_info'              => $more_info,
    ];

    $intentions = [
        'golf' => [
            'requested' => $players > 0 || $green_fees > 0,
            'green_fees_per_player' => $green_fees,
        ],
        'flights' => [
            'requested' => $flights_requested,
            'departure_airport' => $airport,
        ],
        'package' => $package,
        'more_info' => $more_info,
    ];

    $meta = [
        'mapped' => $mapped,
        'intentions' => $intentions,
        'raw' => [
            'entry_id'     => absint( $entry['id'] ?? 0 ),
            'form_id'      => absint( $form_id ),
            'date_created' => sanitize_text_field( $entry['date_created'] ?? '' ),
        ],
    ];

    return [
        'lang'       => $lang,
        'mapped'     => $mapped,
        'intentions' => $intentions,
        'meta'       => $meta,
        'customer_name' => trim( $nombre . ' ' . $apellido ),
    ];
}

function wp_travel_giav_gf_sync_form_entries( $form_id, $limit = 50 ) {
    if ( ! wp_travel_giav_gf_is_active() ) {
        return 0;
    }

    if ( ! class_exists( 'WP_Travel_Request_Repository' ) ) {
        return 0;
    }

    $form_id = absint( $form_id );
    if ( $form_id <= 0 ) {
        return 0;
    }

    $repo = new WP_Travel_Request_Repository();
    $last_entry = (int) get_option( 'wp_travel_giav_requests_last_entry_' . $form_id, 0 );
    $search_config = [];
    $sorting = [
        'key'       => 'id',
        'direction' => 'DESC',
    ];
    $paging = [
        'offset'    => 0,
        'page_size' => max( 10, min( 100, absint( $limit ) ) ),
    ];

    $entries = GFAPI::get_entries( $form_id, $search_config, $sorting, $paging );
    if ( is_wp_error( $entries ) || ! is_array( $entries ) ) {
        return 0;
    }

    $max_id = $last_entry;
    foreach ( $entries as $entry ) {
        $entry_id = absint( $entry['id'] ?? 0 );
        if ( $entry_id <= $last_entry ) {
            continue;
        }

        $mapped = wp_travel_giav_gf_map_entry_fields( $entry, $form_id );
        $repo->upsert_request( $form_id, $entry_id, $mapped['lang'], 'new', $mapped['meta'] );
        $max_id = max( $max_id, $entry_id );
    }

    if ( $max_id > $last_entry ) {
        update_option( 'wp_travel_giav_requests_last_entry_' . $form_id, $max_id );
    }

    return $max_id - $last_entry;
}

function wp_travel_giav_gf_refresh_request_meta( $request ) {
    if ( empty( $request ) || empty( $request['form_id'] ) || empty( $request['entry_id'] ) ) {
        return null;
    }

    if ( ! wp_travel_giav_gf_is_active() ) {
        return null;
    }

    $entry = GFAPI::get_entry( (int) $request['entry_id'] );
    if ( is_wp_error( $entry ) ) {
        return null;
    }

    $mapped = wp_travel_giav_gf_map_entry_fields( $entry, $request['form_id'] );
    return $mapped['meta'];
}
