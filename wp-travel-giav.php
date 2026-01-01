<?php
/**
 * Plugin Name: WP Travel Proposals & GIAV Connector
 * Plugin URI:  https://example.com
 * Description: Sistema interno para creación de propuestas de viaje, versionado y sincronización con GIAV.
 * Version:     0.1.0
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
define( 'WP_TRAVEL_GIAV_VERSION', '0.1.0' );
define( 'WP_TRAVEL_GIAV_PLUGIN_FILE', __FILE__ );
define( 'WP_TRAVEL_GIAV_TABLE_PROPOSALS', $wpdb->prefix . 'travel_proposals' );
define( 'WP_TRAVEL_GIAV_TABLE_VERSIONS', $wpdb->prefix . 'travel_proposal_versions' );
define( 'WP_TRAVEL_GIAV_TABLE_ITEMS', $wpdb->prefix . 'travel_proposal_items' );
define( 'WP_TRAVEL_GIAV_TABLE_MAPPING', $wpdb->prefix . 'giav_mapping' );
define( 'WP_TRAVEL_GIAV_TABLE_AUDIT', $wpdb->prefix . 'travel_audit_log' );
define( 'WP_TRAVEL_GIAV_TABLE_SYNC_LOG', $wpdb->prefix . 'travel_giav_sync_log' );

// Default supplier fallback in GIAV ("Proveedores varios").
// Used when a service requires a supplier but no explicit mapping exists yet.
define( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_ID', '1734698' );
define( 'WP_TRAVEL_GIAV_DEFAULT_SUPPLIER_NAME', 'Proveedores varios' );

/**
 * Core includes (DB + repositories).
 *
 * We load these early so REST controllers and workers can rely on them
 * without ordering issues.
 */
require_once __DIR__ . '/includes/helpers/class-db.php';
require_once __DIR__ . '/includes/helpers/class-giav-preflight.php';
require_once __DIR__ . '/includes/integrations/class-giav-soap-client.php';

require_once __DIR__ . '/includes/repositories/class-proposal-repository.php';
require_once __DIR__ . '/includes/repositories/class-proposal-version-repository.php';
require_once __DIR__ . '/includes/repositories/class-proposal-item-repository.php';
require_once __DIR__ . '/includes/repositories/class-giav-mapping-repository.php';
require_once __DIR__ . '/includes/repositories/class-audit-log-repository.php';


/**
 * Plugin activation hook
 */
register_activation_hook( __FILE__, 'wp_travel_giav_activate' );

function wp_travel_giav_activate() {
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
        customer_email VARCHAR(255) NULL,
        customer_country CHAR(2) NULL,
        customer_language CHAR(2) DEFAULT 'es',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        pax_total INT(11) DEFAULT 1,
        currency CHAR(3) DEFAULT 'EUR',
        status ENUM('draft','sent','accepted','queued','synced','error','revoked','lost') DEFAULT 'draft',
        current_version_id BIGINT(20) UNSIGNED NULL,
        created_by BIGINT(20) UNSIGNED NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
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
    $sql_items = "
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

    dbDelta( $sql_proposals );
    dbDelta( $sql_versions );
    dbDelta( $sql_items );
    dbDelta( $sql_mapping );
    dbDelta( $sql_audit );
    dbDelta( $sql_sync_log );

    update_option( 'wp_travel_giav_db_version', WP_TRAVEL_GIAV_VERSION );
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

    ( new WP_Travel_Proposals_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Versions_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Items_Controller() )->register_routes();
    ( new WP_Travel_Proposal_Actions_Controller() )->register_routes();
}

require_once __DIR__ . '/includes/workers/class-giav-sync-worker.php';
require_once __DIR__ . '/includes/workers/class-giav-payload-builder.php';
require_once __DIR__ . '/includes/helpers/class-giav-sync-logger.php';
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




add_action( 'wp_travel_giav_sync', 'wp_travel_giav_sync_worker' );

add_action( 'admin_menu', 'wp_travel_giav_admin_menu' );
add_action( 'admin_enqueue_scripts', 'wp_travel_giav_admin_assets' );

function wp_travel_giav_admin_menu() {
    add_menu_page(
        'Travel Proposals',
        'Travel Proposals',
        'manage_options',
        'wp-travel-proposals',
        'wp_travel_giav_render_app',
        'dashicons-portfolio',
        26
    );

    // WP ⇄ GIAV mapping admin (uses same React app container)
    add_submenu_page(
        'wp-travel-proposals',
        'GIAV Mapping',
        'GIAV Mapping',
        'manage_options',
        'wp-travel-giav-mapping',
        'wp_travel_giav_render_app'
    );
}

function wp_travel_giav_render_app() {
    echo '<div id="wp-travel-giav-admin"></div>';
}

function wp_travel_giav_admin_assets( $hook ) {

    // Allow assets for main page + mapping submenu page.
    if ( ! in_array( $hook, [ 'toplevel_page_wp-travel-proposals', 'travel-proposals_page_wp-travel-giav-mapping' ], true ) ) {
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
        ]
    );
}
