<?php
/**
 * Plugin Name: WP Travel Proposals & GIAV Connector
 * Plugin URI:  https://example.com
 * Description: Sistema interno para creación de propuestas de viaje, versionado y sincronización con GIAV.
 * Version:     0.2.3
 * Author:      Casanova Golf
 * Author URI:  https://www.casanova.golf
 * License:     GPLv2 or later
 * Text Domain: wp-travel-giav
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

global $wpdb;

/**
 * Plugin constants
 */
define( 'WP_TRAVEL_GIAV_VERSION', '0.2.3' );
define( 'WP_TRAVEL_GIAV_DB_VERSION', '0.9.0' );
define( 'WP_TRAVEL_GIAV_PLUGIN_FILE', __FILE__ );
define( 'WP_TRAVEL_GIAV_TABLE_PROPOSALS', $wpdb->prefix . 'travel_proposals' );
define( 'WP_TRAVEL_GIAV_TABLE_VERSIONS', $wpdb->prefix . 'travel_proposal_versions' );
define( 'WP_TRAVEL_GIAV_TABLE_ITEMS', $wpdb->prefix . 'travel_proposal_items' );
define( 'WP_TRAVEL_GIAV_TABLE_MAPPING', $wpdb->prefix . 'giav_mapping' );
define( 'WP_TRAVEL_GIAV_TABLE_AUDIT', $wpdb->prefix . 'travel_audit_log' );
define( 'WP_TRAVEL_GIAV_TABLE_SYNC_LOG', $wpdb->prefix . 'travel_giav_sync_log' );
define( 'WP_TRAVEL_GIAV_TABLE_RESERVAS', $wpdb->prefix . 'travel_giav_reservas' );
define( 'WP_TRAVEL_GIAV_TABLE_REQUESTS', $wpdb->prefix . 'travel_giav_requests' );

if ( ! function_exists( 'wp_travel_giav_clear_rest_output' ) ) {
    function wp_travel_giav_clear_rest_output(): void {
        while ( ob_get_level() ) {
            ob_end_clean();
        }
    }
}

add_action( 'rest_pre_serve_request', 'wp_travel_giav_clear_rest_output', 0 );

// Default supplier fallback in GIAV ("Proveedores varios").
// Used when a service requires a supplier but no explicit mapping exists yet.
define( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID', '1249826' );
define( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME', 'Proveedores varios' );
define( 'WP_TRAVEL_GIAV_PQ_SUPPLIER_ID', '1250196' );
define( 'WP_TRAVEL_GIAV_PORTAL_SLUG', 'gestion-reservas' );
define( 'WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS', 'casanova_manage_reservas' );
define( 'WP_TRAVEL_GIAV_CAPABILITY_MANAGE_PROPOSALS', 'manage_travel_proposals' );
define( 'WP_TRAVEL_GIAV_PROPOSAL_STATUSES', [
    'draft',
    'sent',
    'accepted',
    'queued',
    'synced',
    'error',
    'revoked',
    'lost',
] );

define( 'WP_TRAVEL_GIAV_REQUEST_STATUSES', [
    'new',
    'contacted',
    'quoting',
    'proposal_sent',
    'won',
    'lost',
    'archived',
] );

define( 'WP_TRAVEL_GIAV_GF_FORMS_OPTION', 'wp_travel_giav_gf_forms' );
define( 'WP_TRAVEL_GIAV_GF_MAP_OPTION_PREFIX', 'wp_travel_giav_gf_map_' );

/**
 * Build the public proposal URL for admin listings and detail views.
 */
function wp_travel_giav_get_public_proposal_url( string $proposal_token, string $version_token = '' ): string {
    $proposal_token = trim( $proposal_token );
    if ( $proposal_token === '' ) {
        return '';
    }

    if ( $version_token !== '' ) {
        return home_url( '/travel-proposal/' . $proposal_token . '/v/' . $version_token . '/' );
    }

    return home_url( '/travel-proposal/' . $proposal_token . '/' );
}

function wp_travel_giav_get_items_schema( $charset_collate ) {
    return "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_ITEMS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        version_id BIGINT(20) UNSIGNED NOT NULL,
        day_index INT(11) DEFAULT 1,
        service_type ENUM('hotel','golf','transfer','extra') NOT NULL,
        display_name VARCHAR(255) NULL,
        wp_object_type ENUM('hotel','course','other','manual') NULL,
        wp_object_id BIGINT(20) UNSIGNED NULL,
        giav_entity_type ENUM('supplier','service','product') NULL,
        giav_entity_id VARCHAR(100) NULL,
        giav_supplier_id VARCHAR(100) NULL,
        giav_supplier_name VARCHAR(255) NULL,
        supplier_source VARCHAR(20) NULL,
        supplier_resolution_chain LONGTEXT NULL,
        warnings_json LONGTEXT NULL,
        blocking_json LONGTEXT NULL,
        preflight_ok TINYINT(1) DEFAULT 1,
        start_date DATE NULL,
        end_date DATE NULL,
        quantity INT(11) DEFAULT 1,
        pax_quantity INT(11) DEFAULT 1,
        unit_cost_net DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        unit_sell_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        line_cost_net DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_cost_net) STORED,
        line_sell_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_sell_price) STORED,
        notes_internal TEXT NULL,
        notes_public TEXT NULL,
        PRIMARY KEY (id),
        KEY idx_version (version_id)
    ) $charset_collate;
    ";
}

function wp_travel_giav_get_requests_schema( $charset_collate ) {
    return "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_REQUESTS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        form_id INT(11) NOT NULL,
        entry_id INT(11) NOT NULL,
        lang VARCHAR(5) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'new',
        proposal_id BIGINT(20) UNSIGNED NULL,
        assigned_to BIGINT(20) UNSIGNED NULL,
        notes TEXT NULL,
        meta_json LONGTEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_form_entry (form_id, entry_id),
        KEY idx_status (status),
        KEY idx_proposal (proposal_id)
    ) $charset_collate;
    ";
}

/**
 * Core includes (DB + repositories).
 *
 * We load these early so REST controllers and workers can rely on them
 * without ordering issues.
 */
require_once __DIR__ . '/includes/helpers/class-db.php';
require_once __DIR__ . '/includes/helpers/class-giav-snapshot-resolver.php';
require_once __DIR__ . '/includes/helpers/class-giav-preflight.php';
require_once __DIR__ . '/includes/helpers/class-proposal-notifications.php';
require_once __DIR__ . '/includes/helpers/class-giav-proposal-sync.php';
require_once __DIR__ . '/includes/helpers/class-giav-dashboard-service.php';
require_once __DIR__ . '/includes/integrations/class-giav-soap-client.php';
require_once __DIR__ . '/includes/helpers/class-db-migrator.php';
require_once __DIR__ . '/includes/helpers/class-gf-requests.php';

require_once __DIR__ . '/includes/repositories/class-proposal-repository.php';
require_once __DIR__ . '/includes/repositories/class-proposal-version-repository.php';
require_once __DIR__ . '/includes/repositories/class-proposal-item-repository.php';
require_once __DIR__ . '/includes/repositories/class-proposal-giav-reserva-repository.php';
require_once __DIR__ . '/includes/repositories/class-giav-mapping-repository.php';
require_once __DIR__ . '/includes/repositories/class-request-repository.php';
require_once __DIR__ . '/includes/repositories/class-audit-log-repository.php';
require_once __DIR__ . '/includes/class-proposal-viewer.php';


/**
 * Plugin activation hook
 */
register_activation_hook( __FILE__, 'wp_travel_giav_activate' );
add_action( 'plugins_loaded', 'wp_travel_giav_maybe_upgrade_schema' );
add_action( 'plugins_loaded', 'wp_travel_giav_load_textdomain' );

/**
 * Load plugin translations.
 *
 * WPML can translate plugin strings via String Translation, but loading a
 * textdomain keeps us compatible with the standard WordPress i18n pipeline
 * (mo files, Loco Translate, etc.).
 */
function wp_travel_giav_load_textdomain() {
    load_plugin_textdomain(
        'wp-travel-giav',
        false,
        dirname( plugin_basename( __FILE__ ) ) . '/languages'
    );
}

function wp_travel_giav_activate() {

// Ensure admins can access the portal/admin screens even if we later use a custom capability.
$admin_role = get_role( 'administrator' );
if ( $admin_role && ! $admin_role->has_cap( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS ) ) {
    $admin_role->add_cap( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS );
}
// Optional: also allow shop_manager if it exists (common in WP setups).
$shop_role = get_role( 'shop_manager' );
if ( $shop_role && ! $shop_role->has_cap( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS ) ) {
    $shop_role->add_cap( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS );
}

    global $wpdb;

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $charset_collate = $wpdb->get_charset_collate();

    /**
     * 1. Proposals (Cabecera)
     */
    $sql_proposals = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_PROPOSALS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        crm_customer_id VARCHAR(50) NULL,
        customer_name VARCHAR(255) NOT NULL,
        first_name VARCHAR(150) NULL,
        last_name VARCHAR(150) NULL,
        proposal_title VARCHAR(255) NULL,
        customer_email VARCHAR(255) NULL,
        customer_country CHAR(2) NULL,
        customer_language CHAR(2) DEFAULT 'es',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        pax_total INT(11) DEFAULT 1,
        players_count INT(11) DEFAULT 0,
        currency CHAR(3) DEFAULT 'EUR',
        status ENUM('draft','sent','accepted','queued','synced','error','revoked','lost') DEFAULT 'draft',
        proposal_token VARCHAR(64) NOT NULL,
        current_version_id BIGINT(20) UNSIGNED NULL,
        accepted_version_id BIGINT(20) UNSIGNED NULL,
        accepted_at DATETIME NULL,
        accepted_by VARCHAR(20) NULL,
        accepted_by_user_id BIGINT(20) UNSIGNED NULL,
        accepted_ip VARCHAR(45) NULL,
        confirmation_status ENUM('pending','confirmed') NULL,
        portal_invite_status ENUM('pending','sent','active') NULL,
        traveler_full_name VARCHAR(255) NULL,
        traveler_dni VARCHAR(20) NULL,
        giav_client_id BIGINT(20) UNSIGNED NULL,
        giav_expediente_id BIGINT(20) UNSIGNED NULL,
        giav_pq_reserva_id BIGINT(20) UNSIGNED NULL,
        giav_sync_status ENUM('none','pending','ok','error') DEFAULT 'none',
        giav_sync_error LONGTEXT NULL,
        giav_sync_updated_at DATETIME NULL,
        source_type VARCHAR(50) NULL,
        source_form_id INT(11) UNSIGNED NULL,
        source_entry_id INT(11) UNSIGNED NULL,
        source_request_id BIGINT(20) UNSIGNED NULL,
        source_meta_json LONGTEXT NULL,
        created_by BIGINT(20) UNSIGNED NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_proposal_token (proposal_token),
        KEY idx_status (status),
        KEY idx_customer (customer_email)
    ) $charset_collate;
    ";

    /**
     * 2. Proposal Versions (Snapshots)
     */
    $sql_versions = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_VERSIONS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        proposal_id BIGINT(20) UNSIGNED NOT NULL,
        version_number INT(11) NOT NULL DEFAULT 1,
        json_snapshot LONGTEXT NOT NULL,
        totals_cost_net DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        totals_sell_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        totals_margin_abs DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        totals_margin_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        template_id INT(11) NULL,
        terms_version VARCHAR(50) NULL,
        public_token VARCHAR(64) NOT NULL,
        expires_at DATETIME NULL,
        revoked_at DATETIME NULL,
        views_count INT(11) DEFAULT 0,
        max_views INT(11) NULL,
        idempotency_key VARCHAR(128) NULL,
        giav_booking_id VARCHAR(100) NULL,
        giav_last_sync_status ENUM('never','queued','success','error') DEFAULT 'never',
        giav_last_sync_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_token (public_token),
        UNIQUE KEY idx_proposal_version (proposal_id, version_number),
        KEY idx_proposal (proposal_id)
    ) $charset_collate;
    ";

    /**
     * 3. Proposal Items (Líneas)
     */
    $sql_items = wp_travel_giav_get_items_schema( $charset_collate );

    /**
     * 4. GIAV Mapping
     */
    $sql_mapping = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_MAPPING . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        wp_object_type VARCHAR(50) NOT NULL,
        wp_object_id BIGINT(20) UNSIGNED NOT NULL,
        giav_entity_type ENUM('supplier','service','product') NOT NULL,
        giav_entity_id VARCHAR(100) NOT NULL,
        giav_supplier_id VARCHAR(100) NULL,
        giav_supplier_name VARCHAR(255) NULL,
        status ENUM('active','needs_review','deprecated') DEFAULT 'needs_review',
        match_type ENUM('manual','suggested','imported','batch','auto_generic') DEFAULT 'manual',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by BIGINT(20) UNSIGNED NULL,
        PRIMARY KEY (id),
        UNIQUE KEY idx_wp_object (wp_object_type, wp_object_id),
        KEY idx_giav_entity (giav_entity_id)
    ) $charset_collate;
    ";

    /**
     * 5. Audit Log
     */
    $sql_audit = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_AUDIT . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        actor_user_id BIGINT(20) UNSIGNED NOT NULL,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id BIGINT(20) UNSIGNED NOT NULL,
        meta_data JSON NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_entity (entity_type, entity_id)
    ) $charset_collate;
    ";

    /**
     * 6. GIAV Sync Log
     */
    $sql_sync_log = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_SYNC_LOG . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        version_id BIGINT(20) UNSIGNED NOT NULL,
        attempt_number INT(11) DEFAULT 1,
        request_hash VARCHAR(64) NULL,
        response_xml LONGTEXT NULL,
        http_status INT(3) NULL,
        error_message TEXT NULL,
        started_at DATETIME NOT NULL,
        finished_at DATETIME NULL,
        PRIMARY KEY (id),
        KEY idx_version (version_id)
    ) $charset_collate;
    ";

    /**
     * 7. GIAV Reservas por propuesta
     */
    $sql_reservas = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_RESERVAS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        proposal_id BIGINT(20) UNSIGNED NOT NULL,
        version_id BIGINT(20) UNSIGNED NOT NULL,
        item_id BIGINT(20) UNSIGNED NULL,
        giav_reserva_id BIGINT(20) UNSIGNED NULL,
        tipo_reserva VARCHAR(10) NULL,
        proveedor_id VARCHAR(100) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_proposal_version (proposal_id, version_id),
        KEY idx_item (item_id),
        KEY idx_giav_reserva (giav_reserva_id)
    ) $charset_collate;
    ";

    /**
     * 8. Solicitudes (Gravity Forms)
     */
    $sql_requests = wp_travel_giav_get_requests_schema( $charset_collate );

    dbDelta( $sql_proposals );
    dbDelta( $sql_versions );
    dbDelta( $sql_items );
    dbDelta( $sql_mapping );
    dbDelta( $sql_audit );
    dbDelta( $sql_sync_log );
    dbDelta( $sql_reservas );
    dbDelta( $sql_requests );

    if ( class_exists( 'WP_Travel_Proposal_Viewer' ) ) {
        WP_Travel_Proposal_Viewer::flush_rewrite_rules();
    }

    update_option( 'wp_travel_giav_db_version', WP_TRAVEL_GIAV_DB_VERSION );
}

function wp_travel_giav_maybe_upgrade_schema() {
    $current = get_option( 'wp_travel_giav_db_version' );
    if ( version_compare( $current, WP_TRAVEL_GIAV_DB_VERSION, '>=' ) ) {
        return;
    }

    if ( ! is_admin() ) {
        return;
    }

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    global $wpdb;

    $charset_collate = $wpdb->get_charset_collate();
    $sql_items = wp_travel_giav_get_items_schema( $charset_collate );
    dbDelta( $sql_items );

    if ( version_compare( $current ?: '0.0.0', '0.3.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_3_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.4.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_4_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.5.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_5_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.6.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_6_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.7.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_7_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.8.0', '<' ) ) {
        wp_travel_giav_upgrade_requests_to_0_8_0();
    }

    if ( version_compare( $current ?: '0.0.0', '0.9.0', '<' ) ) {
        wp_travel_giav_upgrade_proposals_to_0_9_0();
    }

    update_option( 'wp_travel_giav_db_version', WP_TRAVEL_GIAV_DB_VERSION );
}

function wp_travel_giav_upgrade_proposals_to_0_3_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;

    if ( ! wp_travel_giav_table_has_column( $table, 'proposal_token' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN proposal_token VARCHAR(64) NULL"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'accepted_version_id' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN accepted_version_id BIGINT(20) UNSIGNED NULL"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'accepted_at' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN accepted_at DATETIME NULL"
        );
    }

    wp_travel_giav_backfill_proposal_tokens( $table );

    $wpdb->query(
        "ALTER TABLE {$table} MODIFY COLUMN proposal_token VARCHAR(64) NOT NULL"
    );

    if ( ! wp_travel_giav_table_has_index( $table, 'idx_proposal_token' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD UNIQUE KEY idx_proposal_token (proposal_token)"
        );
    }
}

function wp_travel_giav_upgrade_proposals_to_0_4_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;

    if ( ! wp_travel_giav_table_has_column( $table, 'proposal_title' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN proposal_title VARCHAR(255) NULL"
        );
    }
}

function wp_travel_giav_upgrade_proposals_to_0_5_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;

    if ( ! wp_travel_giav_table_has_column( $table, 'status' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN status ENUM('draft','sent','accepted','queued','synced','error','revoked','lost') DEFAULT 'draft'"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'accepted_by' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN accepted_by VARCHAR(20) NULL"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'accepted_by_user_id' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN accepted_by_user_id BIGINT(20) UNSIGNED NULL"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'accepted_ip' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN accepted_ip VARCHAR(45) NULL"
        );
    }
}

function wp_travel_giav_upgrade_proposals_to_0_6_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;

    if ( ! wp_travel_giav_table_has_column( $table, 'confirmation_status' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN confirmation_status ENUM('pending','confirmed') NULL"
        );
    }

    if ( ! wp_travel_giav_table_has_column( $table, 'portal_invite_status' ) ) {
        $wpdb->query(
            "ALTER TABLE {$table} ADD COLUMN portal_invite_status ENUM('pending','sent','active') NULL"
        );
    }
}

function wp_travel_giav_upgrade_proposals_to_0_7_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;

    $columns = [
        'traveler_full_name'  => "ALTER TABLE {$table} ADD COLUMN traveler_full_name VARCHAR(255) NULL",
        'traveler_dni'        => "ALTER TABLE {$table} ADD COLUMN traveler_dni VARCHAR(20) NULL",
        'giav_client_id'      => "ALTER TABLE {$table} ADD COLUMN giav_client_id BIGINT(20) UNSIGNED NULL",
        'giav_expediente_id'  => "ALTER TABLE {$table} ADD COLUMN giav_expediente_id BIGINT(20) UNSIGNED NULL",
        'giav_pq_reserva_id'  => "ALTER TABLE {$table} ADD COLUMN giav_pq_reserva_id BIGINT(20) UNSIGNED NULL",
        'giav_sync_status'    => "ALTER TABLE {$table} ADD COLUMN giav_sync_status ENUM('none','pending','ok','error') DEFAULT 'none'",
        'giav_sync_error'     => "ALTER TABLE {$table} ADD COLUMN giav_sync_error LONGTEXT NULL",
        'giav_sync_updated_at'=> "ALTER TABLE {$table} ADD COLUMN giav_sync_updated_at DATETIME NULL",
    ];

    foreach ( $columns as $column => $sql ) {
        if ( ! wp_travel_giav_table_has_column( $table, $column ) ) {
            $wpdb->query( $sql );
        }
    }

    $charset_collate = $wpdb->get_charset_collate();
    $sql_reservas = "
    CREATE TABLE " . WP_TRAVEL_GIAV_TABLE_RESERVAS . " (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        proposal_id BIGINT(20) UNSIGNED NOT NULL,
        version_id BIGINT(20) UNSIGNED NOT NULL,
        item_id BIGINT(20) UNSIGNED NULL,
        giav_reserva_id BIGINT(20) UNSIGNED NULL,
        tipo_reserva VARCHAR(10) NULL,
        proveedor_id VARCHAR(100) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_proposal_version (proposal_id, version_id),
        KEY idx_item (item_id),
        KEY idx_giav_reserva (giav_reserva_id)
    ) $charset_collate;
    ";

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql_reservas );
}

function wp_travel_giav_upgrade_requests_to_0_8_0() {
    global $wpdb;

    $charset_collate = $wpdb->get_charset_collate();
    $sql_requests = wp_travel_giav_get_requests_schema( $charset_collate );
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta( $sql_requests );

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;
    $columns = [
        'source_type'       => "ALTER TABLE {$table} ADD COLUMN source_type VARCHAR(50) NULL",
        'source_form_id'    => "ALTER TABLE {$table} ADD COLUMN source_form_id INT(11) UNSIGNED NULL",
        'source_entry_id'   => "ALTER TABLE {$table} ADD COLUMN source_entry_id INT(11) UNSIGNED NULL",
        'source_request_id' => "ALTER TABLE {$table} ADD COLUMN source_request_id BIGINT(20) UNSIGNED NULL",
        'source_meta_json'  => "ALTER TABLE {$table} ADD COLUMN source_meta_json LONGTEXT NULL",
    ];

    foreach ( $columns as $column => $sql ) {
        if ( ! wp_travel_giav_table_has_column( $table, $column ) ) {
            $wpdb->query( $sql );
        }
    }
}

function wp_travel_giav_upgrade_proposals_to_0_9_0() {
    global $wpdb;

    $table = WP_TRAVEL_GIAV_TABLE_PROPOSALS;
    $columns = [
        'first_name' => "ALTER TABLE {$table} ADD COLUMN first_name VARCHAR(150) NULL",
        'last_name'  => "ALTER TABLE {$table} ADD COLUMN last_name VARCHAR(150) NULL",
    ];

    foreach ( $columns as $column => $sql ) {
        if ( ! wp_travel_giav_table_has_column( $table, $column ) ) {
            $wpdb->query( $sql );
        }
    }
}

function wp_travel_giav_table_has_column( $table, $column ) {
    global $wpdb;

    $row = $wpdb->get_row(
        $wpdb->prepare(
            "SHOW COLUMNS FROM {$table} LIKE %s",
            $column
        )
    );

    return (bool) $row;
}

function wp_travel_giav_table_has_index( $table, $index ) {
    global $wpdb;

    $row = $wpdb->get_row(
        $wpdb->prepare(
            "SHOW INDEX FROM {$table} WHERE Key_name = %s",
            $index
        )
    );

    return (bool) $row;
}

function wp_travel_giav_backfill_proposal_tokens( $table ) {
    global $wpdb;

    $rows = $wpdb->get_results(
        "SELECT id FROM {$table} WHERE proposal_token IS NULL OR proposal_token = ''",
        ARRAY_A
    );

    if ( empty( $rows ) ) {
        return;
    }

    foreach ( $rows as $row ) {
        $token = wp_travel_giav_generate_unique_token( $table, 'proposal_token' );
        $wpdb->update(
            $table,
            [ 'proposal_token' => $token ],
            [ 'id' => $row['id'] ],
            [ '%s' ],
            [ '%d' ]
        );
    }
}

function wp_travel_giav_generate_unique_token( $table, $column ) {
    global $wpdb;

    do {
        $token = wp_generate_password( 32, false );
        $count = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE {$column} = %s",
                $token
            )
        );
    } while ( $count > 0 );

    return $token;
}

add_action( 'rest_api_init', 'wp_travel_giav_register_api' );

function wp_travel_giav_register_api() {
    // Base REST controller must be loaded first.
    require_once __DIR__ . '/includes/api/class-rest-controller.php';

    // REST controllers.
    require_once __DIR__ . '/includes/api/class-proposals-controller.php';
    require_once __DIR__ . '/includes/api/class-versions-controller.php';
    require_once __DIR__ . '/includes/api/class-items-controller.php';
    require_once __DIR__ . '/includes/api/class-actions-controller.php';
    require_once __DIR__ . '/includes/api/class-requests-controller.php';
    require_once __DIR__ . '/includes/api/class-dashboard-controller.php';

    ( new WP_Travel_Proposals_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Versions_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Items_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Actions_Controller() )->register_routes();
    ( new WP_Travel_Requests_Controller() )->register_routes();
    ( new WP_Travel_GIAV_Dashboard_Controller() )->register_routes();

    // DB health endpoint (public read)
    register_rest_route( 'travel/v1', '/health/db', [
        [
            'methods'  => WP_REST_Server::READABLE,
            'callback' => function () {
                $check = wp_travel_giav_db_check();
                $migration_failed = get_option( 'wp_travel_giav_migration_failed', false );
                $log = function_exists( 'wp_travel_giav_get_migration_log' ) ? wp_travel_giav_get_migration_log() : [];
                return rest_ensure_response( [
                    'healthy' => ! empty( $check['healthy'] ) && ! $migration_failed,
                    'missing' => $check['missing'],
                    'migration_failed' => (bool) $migration_failed,
                    'migration_log' => array_slice( $log, -50 ),
                ] );
            },
            'permission_callback' => '__return_true',
        ],
    ] );
}

require_once __DIR__ . '/includes/workers/class-giav-sync-worker.php';
require_once __DIR__ . '/includes/workers/class-giav-payload-builder.php';
require_once __DIR__ . '/includes/helpers/class-giav-sync-logger.php';
require_once __DIR__ . '/includes/helpers/class-proposal-dates.php';
require_once __DIR__ . '/includes/api/class-catalog-controller.php';
require_once __DIR__ . '/includes/api/class-giav-providers-controller.php';

// --- Catalog controller (CPT/CCT search + GIAV mapping) ---
add_action('rest_api_init', function () {
    // Catalog (CPT/CCT search + local mapping CRUD)
    if (class_exists('WP_Travel_Catalog_Controller')) {
        (new WP_Travel_Catalog_Controller())->register_routes();
    }

    // GIAV Providers (SOAP-backed search/get)
    if (class_exists('WP_Travel_GIAV_Providers_Controller')) {
        (new WP_Travel_GIAV_Providers_Controller())->register_routes();
    }
}, 20);


WP_Travel_Proposal_Viewer::boot();



add_action( 'wp_travel_giav_sync', 'wp_travel_giav_sync_worker' );

add_action( 'admin_menu', 'wp_travel_giav_admin_menu' );
add_action( 'admin_enqueue_scripts', 'wp_travel_giav_admin_assets' );

// Backwards-compat: old wp-admin dashboard URL now lives inside the internal portal.
add_action( 'admin_init', function () {
    if ( isset( $_GET['page'] ) && $_GET['page'] === 'wp-travel-giav-dashboard' ) {
        $portal = site_url( '/' . WP_TRAVEL_GIAV_PORTAL_SLUG . '/#/dashboard' );
        wp_safe_redirect( $portal );
        exit;
    }
} );

function wp_travel_giav_admin_menu() {
    add_menu_page(
        'Propuestas',
        'Propuestas',
        WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS,
        'travel_proposals',
        'wp_travel_giav_render_app',
        'dashicons-portfolio',
        26
    );

    // WP ⇄ GIAV mapping admin (uses same React app container)
    add_submenu_page(
        'travel_proposals',
        'GIAV Mapping',
        'GIAV Mapping',
        WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS,
        'wp-travel-giav-mapping',
        'wp_travel_giav_render_app'
    );

    add_submenu_page(
        'travel_proposals',
        'Solicitudes recibidas',
        'Solicitudes recibidas',
        WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS,
        'wp-travel-giav-requests',
        'wp_travel_giav_render_requests'
    );

    add_submenu_page(
        'travel_proposals',
        'Mapping Gravity Forms',
        'Mapping Gravity Forms',
        WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS,
        'wp-travel-giav-requests-settings',
        'wp_travel_giav_render_requests_settings'
    );

    add_submenu_page(
        'travel_proposals',
        'Configuración',
        'Configuración',
        WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS,
        'travel_proposals_settings',
        'wp_travel_giav_render_settings'
    );
}

function wp_travel_giav_render_app() {
    if ( ! wp_travel_giav_can_manage_proposals() ) {
        wp_die( 'No tienes permisos suficientes para ver esta página.' );
    }
    echo '<div id="wp-travel-giav-admin"></div>';
}

function wp_travel_giav_render_requests() {
    if ( ! wp_travel_giav_can_manage_proposals() ) {
        wp_die( 'No tienes permisos suficientes para ver esta página.' );
    }
    echo '<div id="wp-travel-giav-requests"></div>';
}

function wp_travel_giav_render_requests_settings() {
    if ( ! wp_travel_giav_can_manage_proposals() ) {
        wp_die( 'No tienes permisos suficientes para ver esta página.' );
    }
    echo '<div id="wp-travel-giav-requests-settings"></div>';
}

function wp_travel_giav_render_settings() {
    if ( ! wp_travel_giav_can_manage_proposals() ) {
        wp_die( 'No tienes permisos suficientes para ver esta página.' );
    }

    $saved = false;
    if ( $_SERVER['REQUEST_METHOD'] === 'POST' && isset( $_POST['wp_travel_giav_internal_notification_email'] ) ) {
        check_admin_referer( 'wp_travel_giav_update_settings', 'wp_travel_giav_update_settings_nonce' );
        $email = sanitize_email( wp_unslash( $_POST['wp_travel_giav_internal_notification_email'] ) );
        if ( $email === '' ) {
            delete_option( 'wp_travel_giav_internal_notification_email' );
        } else {
            update_option( 'wp_travel_giav_internal_notification_email', $email );
        }
        $saved = true;
    }

    $internal_email = get_option( 'wp_travel_giav_internal_notification_email', '' );
    ?>
    <div class="wrap">
        <h1>Configuración de viajes GIAV</h1>
        <?php if ( $saved ) : ?>
            <div class="notice notice-success is-dismissible">
                <p>Configuración guardada.</p>
            </div>
        <?php endif; ?>
        <form method="post">
            <?php wp_nonce_field( 'wp_travel_giav_update_settings', 'wp_travel_giav_update_settings_nonce' ); ?>
            <table class="form-table">
                <tr>
                    <th scope="row">
                        <label for="wp_travel_giav_internal_notification_email">
                            Email para notificaciones internas
                        </label>
                    </th>
                    <td>
                        <input
                            type="email"
                            id="wp_travel_giav_internal_notification_email"
                            name="wp_travel_giav_internal_notification_email"
                            class="regular-text"
                            value="<?php echo esc_attr( $internal_email ); ?>"
                        />
                        <p class="description">
                            Notificaciones que avisan al equipo interno cuando una propuesta se acepta.
                            Si se deja vacío, se usará el email de administración del sitio.
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button( 'Guardar cambios' ); ?>
        </form>
    </div>
    <?php
}

function wp_travel_giav_admin_assets( $hook ) {

    // Allow assets for main page + mapping submenu page.
    $page = sanitize_text_field( $_GET['page'] ?? '' );
    $load_by_page = $page !== '' && strpos( $page, 'wp-travel-giav-' ) === 0;
    $allowed_hooks = [
        'toplevel_page_travel_proposals',
        'travel_proposals_page_wp-travel-giav-mapping',
        'travel_proposals_page_wp-travel-giav-requests',
        'travel_proposals_page_wp-travel-giav-requests-settings',
    ];

    if ( ! $load_by_page && ! in_array( $hook, $allowed_hooks, true ) ) {
        return;
    }

    $asset_file = plugin_dir_path( __FILE__ ) . 'admin/build/index.asset.php';
    $asset = file_exists( $asset_file )
        ? include $asset_file
        : [
            'dependencies' => [ 'wp-element', 'wp-components', 'wp-api-fetch' ],
            'version'      => WP_TRAVEL_GIAV_VERSION,
        ];

    wp_enqueue_script(
        'wp-travel-giav-admin', // 👈 ESTE HANDLE ES CLAVE
        plugins_url( 'admin/build/index.js', __FILE__ ),
        $asset['dependencies'],
        $asset['version'],
        true
    );


    $css_file = plugin_dir_path( __FILE__ ) . 'admin/build/index.css';
    if ( file_exists( $css_file ) ) {
        wp_enqueue_style(
            'wp-travel-giav-admin-style',
            plugins_url( 'admin/build/index.css', __FILE__ ),
            [ 'wp-components' ],
            $asset['version']
        );
    }

    wp_localize_script(
        'wp-travel-giav-admin', // 👈 TIENE QUE SER EL MISMO
        'WP_TRAVEL_GIAV',
        [
            'apiUrl' => rest_url( 'travel/v1' ),
            'nonce'  => wp_create_nonce( 'wp_rest' ),
            'dbHealthy' => wp_travel_giav_db_is_healthy(),
              'dbIssues' => wp_travel_giav_db_check(),
              'requestStatuses' => WP_TRAVEL_GIAV_REQUEST_STATUSES,
        ]
    );

    // NOTE: Dashboard UI lives exclusively in the internal React portal (/gestion-reservas).
}


function wp_travel_giav_can_manage_proposals() {
    return current_user_can( 'manage_options' )
        || current_user_can( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_RESERVAS )
        || current_user_can( WP_TRAVEL_GIAV_CAPABILITY_MANAGE_PROPOSALS );
}

function wp_travel_giav_is_portal_page() {
    if ( is_admin() ) {
        return false;
    }

    if ( ! function_exists( 'is_page' ) || ! did_action( 'wp' ) ) {
        return false;
    }

    return is_page( WP_TRAVEL_GIAV_PORTAL_SLUG );
}

function wp_travel_giav_page_has_portal_shortcode() {
    if ( ! wp_travel_giav_is_portal_page() ) {
        return false;
    }

    $post = get_post();
    if ( ! $post || empty( $post->post_content ) ) {
        return false;
    }

    if ( ! function_exists( 'has_shortcode' ) ) {
        return false;
    }

    return has_shortcode( $post->post_content, 'casanova_gestion_reservas' );
}

function wp_travel_giav_shortcode_portal() {
    if ( ! wp_travel_giav_can_manage_proposals() ) {
        $login_url = wp_login_url( get_permalink() );
        if ( ! is_user_logged_in() ) {
            return '<div class="casanova-portal-access"><strong>Acceso restringido.</strong> Inicia sesion con una cuenta autorizada. <a href="' . esc_url( $login_url ) . '">Iniciar sesion</a></div>';
        }

        return '<div class="casanova-portal-access"><strong>Acceso restringido.</strong> Esta cuenta no tiene permisos para acceder a Gestion de reservas.</div>';
    }

    return '<div id="casanova-gestion-reservas-app" class="casanova-gestion-reservas-app"></div>';
}

function wp_travel_giav_rest_permission_response() {
    if ( ! wp_travel_giav_db_is_healthy() ) {
        return new WP_Error(
            'wp_travel_giav_db_unhealthy',
            'La base de datos del plugin no está lista. Ejecuta las migraciones pendientes.',
            [ 'status' => 503 ]
        );
    }

    if ( ! wp_travel_giav_can_manage_proposals() ) {
        return new WP_Error(
            'rest_forbidden',
            'No tienes permisos suficientes para acceder a Travel Proposals.',
            [ 'status' => 403 ]
        );
    }

    return true;
}

function wp_travel_giav_portal_access_control() {
    if ( ! wp_travel_giav_is_portal_page() ) {
        return;
    }

    if ( ! wp_travel_giav_db_is_healthy() ) {
        wp_die(
            'La base de datos del plugin no está lista. Revisa las migraciones pendientes.',
            'Servicio no disponible',
            [ 'response' => 503 ]
        );
    }

    if ( wp_travel_giav_page_has_portal_shortcode() ) {
        return;
    }

    if ( ! is_user_logged_in() ) {
        $scheme = ( isset( $_SERVER['HTTPS'] ) && 'off' !== $_SERVER['HTTPS'] && '0' !== $_SERVER['HTTPS'] ) ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $request = $_SERVER['REQUEST_URI'] ?? '';
        $current_url = $scheme . '://' . $host . $request;

        if ( empty( $current_url ) ) {
            $current_url = site_url( '/' . WP_TRAVEL_GIAV_PORTAL_SLUG );
        }

        wp_safe_redirect( wp_login_url( esc_url_raw( $current_url ) ) );
        exit;
    }

    if ( ! wp_travel_giav_can_manage_proposals() ) {
        wp_die( 'No autorizado', 'Acceso denegado', [ 'response' => 403 ] );
    }
}

function wp_travel_giav_enqueue_portal_assets() {
    if ( ! wp_travel_giav_is_portal_page() || ! wp_travel_giav_can_manage_proposals() ) {
        return;
    }

    $handle = 'wp-travel-giav-portal';
    $asset_file = plugin_dir_path( __FILE__ ) . 'admin/build/portal.asset.php';
    $asset = file_exists( $asset_file )
        ? include $asset_file
        : [
            'dependencies' => [ 'wp-element' ],
            'version'      => WP_TRAVEL_GIAV_VERSION,
        ];

    wp_enqueue_script(
        $handle,
        plugins_url( 'admin/build/portal.js', __FILE__ ),
        $asset['dependencies'],
        $asset['version'],
        true
    );

    $css_file = plugin_dir_path( __FILE__ ) . 'admin/build/portal.css';
    if ( file_exists( $css_file ) ) {
        wp_enqueue_style(
            'wp-travel-giav-portal-style',
            plugins_url( 'admin/build/portal.css', __FILE__ ),
            [ 'wp-components' ],
            $asset['version']
        );
    }

    $current_user = wp_get_current_user();
    $caps = [];
    if ( ! empty( $current_user->allcaps ) ) {
        $caps = array_keys( array_filter( (array) $current_user->allcaps ) );
    }

    $page_base = get_permalink();
    if ( ! $page_base ) {
        $page_base = site_url( '/' . WP_TRAVEL_GIAV_PORTAL_SLUG );
    }

    wp_localize_script(
        $handle,
        'CASANOVA_GESTION_RESERVAS',
        [
            'restUrl'     => rest_url( 'travel/v1' ),
            'wpRestRoot'  => rest_url(),
            'nonce'       => wp_create_nonce( 'wp_rest' ),
            'pageBase'    => $page_base,
            'currentUser' => [
                'id'          => (int) $current_user->ID,
                'email'       => $current_user->user_email,
                'displayName' => $current_user->display_name,
                'roles'       => $current_user->roles,
                'caps'        => $caps,
            ],
            'logoutUrl'  => wp_logout_url( $page_base ),
            'flags'       => [
                'dbHealthy' => wp_travel_giav_db_is_healthy(),
            ],
            'endpoints'   => [
                'proposals' => rest_url( 'travel/v1/proposals' ),
                'detail'    => rest_url( 'travel/v1/proposals/%d' ),
                'versions'  => rest_url( 'travel/v1/proposals/%d/versions' ),
                'requests' => rest_url( 'travel/v1/requests' ),
                'request_detail' => rest_url( 'travel/v1/requests/%d' ),
                'request_status' => rest_url( 'travel/v1/requests/%d/status' ),
                'request_convert' => rest_url( 'travel/v1/requests/%d/convert' ),
            ],
        ]
    );
}

function wp_travel_giav_render_portal_container( $content ) {
    if ( ! is_main_query() || ! is_singular() || ! wp_travel_giav_is_portal_page() ) {
        return $content;
    }

    if ( function_exists( 'has_shortcode' ) && has_shortcode( $content, 'casanova_gestion_reservas' ) ) {
        return do_shortcode( $content );
    }

    return do_shortcode( '[casanova_gestion_reservas]' );
}

function wp_travel_giav_hide_portal_title( $title, $post_id = null ) {
    if ( ! wp_travel_giav_is_portal_page() ) {
        return $title;
    }

    if ( ! wp_travel_giav_can_manage_proposals() ) {
        return $title;
    }

    if ( ! is_main_query() ) {
        return $title;
    }

    $queried_id = get_queried_object_id();
    if ( $queried_id && $post_id && (int) $post_id === (int) $queried_id ) {
        return '';
    }

    return $title;
}

add_filter( 'the_title', 'wp_travel_giav_hide_portal_title', 10, 2 );
add_action( 'template_redirect', 'wp_travel_giav_portal_access_control' );
add_action( 'wp_enqueue_scripts', 'wp_travel_giav_enqueue_portal_assets' );
add_filter( 'the_content', 'wp_travel_giav_render_portal_container' );
add_shortcode( 'casanova_gestion_reservas', 'wp_travel_giav_shortcode_portal' );

/**
 * Check DB schema required for the plugin and report missing tables/columns.
 * Returns array: ['healthy' => bool, 'missing' => array]
 */
function wp_travel_giav_db_check() {
    global $wpdb;

    $required = [
        WP_TRAVEL_GIAV_TABLE_PROPOSALS => [ 'id', 'proposal_token', 'source_type', 'first_name', 'last_name' ],
        WP_TRAVEL_GIAV_TABLE_VERSIONS  => [ 'id', 'public_token' ],
        WP_TRAVEL_GIAV_TABLE_ITEMS     => [ 'id', 'version_id' ],
        WP_TRAVEL_GIAV_TABLE_MAPPING   => [ 'id' ],
        WP_TRAVEL_GIAV_TABLE_AUDIT     => [ 'id' ],
        WP_TRAVEL_GIAV_TABLE_SYNC_LOG  => [ 'id' ],
        WP_TRAVEL_GIAV_TABLE_RESERVAS  => [ 'id' ],
        WP_TRAVEL_GIAV_TABLE_REQUESTS  => [ 'id', 'form_id', 'entry_id', 'status' ],
    ];

    $missing = [];
    foreach ( $required as $table => $cols ) {
        $table_exists = (bool) $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) );
        if ( ! $table_exists ) {
            $missing[] = "table: {$table}";
            continue;
        }
        foreach ( $cols as $col ) {
            if ( ! wp_travel_giav_table_has_column( $table, $col ) ) {
                $missing[] = "column: {$table}.{$col}";
            }
        }
    }

    return [
        'healthy' => empty( $missing ),
        'missing' => $missing,
    ];
}

function wp_travel_giav_db_is_healthy() {
    $check = wp_travel_giav_db_check();
    $migration_failed = get_option( 'wp_travel_giav_migration_failed', false );
    if ( $migration_failed ) {
        return false;
    }
    return ! empty( $check['healthy'] );
}

// Run automatic migrations (with logging/backoff) early on admin pages
add_action( 'admin_init', 'wp_travel_giav_run_migrations', 5 );

// Admin: show blocking notice when DB schema is incomplete or migrations failed
add_action( 'admin_init', function () {
    if ( ! is_admin() ) {
        return;
    }

    $check = wp_travel_giav_db_check();

    $migration_failed = get_option( 'wp_travel_giav_migration_failed', false );
    if ( $migration_failed ) {
        add_action( 'admin_notices', function () use ( $migration_failed ) {
            $msg = 'WP Travel Proposals & GIAV: DB migration failed. Review logs and run migrations manually.';
            echo '<div class="notice notice-error"><p><strong>' . esc_html( $msg ) . '</strong></p></div>';
        } );
        return;
    }

    if ( ! $check['healthy'] ) {
        add_action( 'admin_notices', function () use ( $check ) {
            $msg = 'WP Travel Proposals & GIAV: missing DB schema: ' . implode( ', ', $check['missing'] );
            echo '<div class="notice notice-error"><p><strong>' . esc_html( $msg ) . '</strong></p></div>';
        } );
    }
} );