<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WP_Travel_GIAV_DB_Migrator {

    const LOG_OPTION = 'wp_travel_giav_migration_log';
    const FAIL_FLAG  = 'wp_travel_giav_migration_failed';
    const BACKOFF_KEY = 'wp_travel_giav_migration_backoff';
    const INPROG_TRANSIENT = 'wp_travel_giav_migration_in_progress';

    public static function run() {
        if ( ! is_admin() ) {
            return false;
        }

        // prevent concurrent runs
        if ( get_transient( self::INPROG_TRANSIENT ) ) {
            return false;
        }

        $current = get_option( 'wp_travel_giav_db_version' );
        if ( version_compare( $current ?: '0.0.0', WP_TRAVEL_GIAV_DB_VERSION, '>=' ) ) {
            // already up to date
            return true;
        }

        // throttle retries if recent failures
        $backoff = get_option( self::BACKOFF_KEY, [] );
        $now = time();
        if ( ! empty( $backoff['until'] ) && $now < (int) $backoff['until'] ) {
            self::log( 'runner', 'skipped', 'Backoff active until ' . date( 'c', (int) $backoff['until'] ) );
            return false;
        }

        set_transient( self::INPROG_TRANSIENT, 1, 30 ); // mark in progress for 30s

        try {
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
            global $wpdb;
            $charset_collate = $wpdb->get_charset_collate();

            // Always ensure items schema is up-to-date first (idempotent)
            dbDelta( wp_travel_giav_get_items_schema( $charset_collate ) );
            self::log( 'dbDelta_items', 'success', 'dbDelta ran for items schema' );

            $steps = [
                [ 'version' => '0.3.0', 'call' => 'wp_travel_giav_upgrade_proposals_to_0_3_0' ],
                [ 'version' => '0.4.0', 'call' => 'wp_travel_giav_upgrade_proposals_to_0_4_0' ],
                [ 'version' => '0.5.0', 'call' => 'wp_travel_giav_upgrade_proposals_to_0_5_0' ],
                [ 'version' => '0.6.0', 'call' => 'wp_travel_giav_upgrade_proposals_to_0_6_0' ],
                [ 'version' => '0.7.0', 'call' => 'wp_travel_giav_upgrade_proposals_to_0_7_0' ],
            ];

            foreach ( $steps as $step ) {
                if ( version_compare( $current ?: '0.0.0', $step['version'], '<' ) ) {
                    $name = $step['call'];
                    if ( function_exists( $name ) ) {
                        self::log( $name, 'started', 'Running migration for ' . $step['version'] );
                        try {
                            call_user_func( $name );
                            self::log( $name, 'success', 'Completed migration ' . $step['version'] );
                        } catch ( Exception $e ) {
                            self::log( $name, 'failure', $e->getMessage() );
                            // set backoff and fail flag
                            $fails = (int) get_option( 'wp_travel_giav_migration_fail_count', 0 );
                            $fails++;
                            update_option( 'wp_travel_giav_migration_fail_count', $fails );
                            $delay = min( 24 * HOUR_IN_SECONDS, pow( 2, $fails ) * HOUR_IN_SECONDS );
                            update_option( self::BACKOFF_KEY, [ 'count' => $fails, 'until' => $now + $delay ] );
                            update_option( self::FAIL_FLAG, 1 );
                            return false;
                        }
                    } else {
                        // missing function; log and continue
                        self::log( $name, 'skipped', 'Migration function not found: ' . $name );
                    }
                }
            }

            // All migrations ran — update stored version
            update_option( 'wp_travel_giav_db_version', WP_TRAVEL_GIAV_DB_VERSION );
            delete_option( self::FAIL_FLAG );
            delete_option( 'wp_travel_giav_migration_fail_count' );
            delete_option( self::BACKOFF_KEY );
            self::log( 'runner', 'success', 'Migration completed to ' . WP_TRAVEL_GIAV_DB_VERSION );

            return true;
        } catch ( Exception $e ) {
            self::log( 'runner', 'failure', $e->getMessage() );
            // mark failure
            update_option( self::FAIL_FLAG, 1 );
            $fails = (int) get_option( 'wp_travel_giav_migration_fail_count', 0 );
            $fails++;
            update_option( 'wp_travel_giav_migration_fail_count', $fails );
            $delay = min( 24 * HOUR_IN_SECONDS, pow( 2, $fails ) * HOUR_IN_SECONDS );
            update_option( self::BACKOFF_KEY, [ 'count' => $fails, 'until' => $now + $delay ] );
            return false;
        } finally {
            delete_transient( self::INPROG_TRANSIENT );
        }
    }

    public static function log( $step, $status, $message = '' ) {
        $log = get_option( self::LOG_OPTION, [] );
        $entry = [
            'time' => current_time( 'mysql' ),
            'ts'   => time(),
            'step' => $step,
            'status' => $status,
            'message' => $message,
        ];
        $log[] = $entry;
        // keep last 200 entries to limit option size
        $log = array_slice( $log, -200 );
        update_option( self::LOG_OPTION, $log );
    }

    public static function get_log() {
        return get_option( self::LOG_OPTION, [] );
    }
}

function wp_travel_giav_run_migrations() {
    // run on admin init with priority control
    return WP_Travel_GIAV_DB_Migrator::run();
}

function wp_travel_giav_get_migration_log() {
    return WP_Travel_GIAV_DB_Migrator::get_log();
}
