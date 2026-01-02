<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

function wp_travel_giav_should_log() {
    return defined( 'WP_DEBUG' ) && WP_DEBUG;
}

function wp_travel_giav_get_internal_notification_email() {
    $configured = get_option( 'wp_travel_giav_internal_notification_email', '' );
    $email = '';
    if ( is_email( $configured ) ) {
        $email = $configured;
    } elseif ( is_email( get_option( 'admin_email' ) ) ) {
        $email = get_option( 'admin_email' );
    }
    return $email;
}

function wp_travel_giav_notify_proposal_acceptance( array $proposal, array $version, string $accepted_by ) {
    if ( empty( $proposal ) || empty( $version ) ) {
        return;
    }

    $should_log = wp_travel_giav_should_log();
    if ( $should_log ) {
        error_log( sprintf(
            '[WP Travel GIAV] Proposal #%d accepted via %s (version %d).',
            (int) ( $proposal['id'] ?? 0 ),
            $accepted_by,
            (int) ( $version['id'] ?? 0 )
        ) );
    }

    $public_url = wp_travel_giav_get_public_proposal_url(
        $proposal['proposal_token'] ?? '',
        $version['public_token'] ?? ''
    );
    $public_url_display = $public_url ?: 'No disponible';

    $customer_name = trim( (string) ( $proposal['customer_name'] ?? '' ) );
    $client_email = sanitize_email( $proposal['customer_email'] ?? '' );

    if ( is_email( $client_email ) ) {
        $subject = 'Hemos recibido tu aceptación';
        $message = sprintf(
            "Hola%s,\n\nHemos recibido tu aceptación de la propuesta #%d.\n\nGracias. Estamos confirmando disponibilidad con proveedores.\nTe avisaremos por email cuando tu reserva esté confirmada y puedas acceder al portal para pagos y gestión.\n\nPuedes revisar la propuesta en este enlace:\n%s\n",
            $customer_name ? ' ' . $customer_name : '',
            (int) ( $proposal['id'] ?? 0 ),
            $public_url_display
        );
        $headers = [ 'Content-Type: text/plain; charset=UTF-8' ];
        $sent = wp_mail( $client_email, $subject, $message, $headers );

        if ( $should_log ) {
            error_log( sprintf(
                '[WP Travel GIAV] Client email (%s) for proposal #%d: %s',
                $client_email,
                (int) $proposal['id'],
                $sent ? 'ok' : 'error'
            ) );
            if ( ! $sent ) {
                error_log( sprintf(
                    '[WP Travel GIAV] wp_mail returned false when sending client email for proposal #%d',
                    (int) $proposal['id']
                ) );
            }
        }
    } elseif ( $should_log ) {
        error_log( sprintf(
            '[WP Travel GIAV] Cliente sin email válido para propuesta #%d; se omite notificación.',
            (int) ( $proposal['id'] ?? 0 )
        ) );
    }

    $internal_email = wp_travel_giav_get_internal_notification_email();
    if ( $internal_email ) {
        $admin_link = admin_url( 'admin.php?page=travel_proposals&proposal_id=' . (int) ( $proposal['id'] ?? 0 ) );
        $subject = 'Propuesta aceptada - acción requerida';
        $message = sprintf(
            "Proposal ID: #%d\nCliente: %s\nEnlace admin: %s\nEnlace público: %s\nNota: Pendiente de confirmación.",
            (int) ( $proposal['id'] ?? 0 ),
            $customer_name ?: '-',
            $admin_link,
            $public_url_display
        );
        $headers = [ 'Content-Type: text/plain; charset=UTF-8' ];
        $sent_internal = wp_mail( $internal_email, $subject, $message, $headers );

        if ( $should_log ) {
            error_log( sprintf(
                '[WP Travel GIAV] Internal email (%s) for proposal #%d: %s',
                $internal_email,
                (int) $proposal['id'],
                $sent_internal ? 'ok' : 'error'
            ) );
            if ( ! $sent_internal ) {
                error_log( sprintf(
                    '[WP Travel GIAV] wp_mail returned false when sending internal email for proposal #%d',
                    (int) $proposal['id']
                ) );
            }
        }
    } elseif ( $should_log ) {
        error_log( sprintf(
            '[WP Travel GIAV] No hay email interno configurado para propuesta #%d; se omite notificación interna.',
            (int) ( $proposal['id'] ?? 0 )
        ) );
    }
}
