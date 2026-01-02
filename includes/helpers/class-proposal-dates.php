<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_is_spanish_locale() : bool {
    $locale = get_locale();
    return strpos( $locale, 'es' ) === 0;
}

function wp_travel_giav_get_date_format_template( bool $with_time = true ) : string {
    if ( wp_travel_giav_is_spanish_locale() ) {
        return $with_time
            ? apply_filters( 'wp_travel_giav_spanish_datetime_format', 'd/m/Y H:i' )
            : apply_filters( 'wp_travel_giav_spanish_date_format', 'd/m/Y' );
    }

    if ( $with_time ) {
        $default = trim( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) );
        return apply_filters( 'wp_travel_giav_datetime_format', $default, $with_time );
    }

    $default = get_option( 'date_format' );
    return apply_filters( 'wp_travel_giav_date_format', $default, $with_time );
}

function wp_travel_giav_format_datetime( $value, bool $with_time = true ) : string {
    if ( $value === null || $value === '' ) {
        return '';
    }

    if ( is_numeric( $value ) ) {
        $timestamp = (int) $value;
    } else {
        $timestamp = strtotime( (string) $value );
    }

    if ( $timestamp === false || $timestamp <= 0 ) {
        return '';
    }

    return wp_date( wp_travel_giav_get_date_format_template( $with_time ), $timestamp );
}
