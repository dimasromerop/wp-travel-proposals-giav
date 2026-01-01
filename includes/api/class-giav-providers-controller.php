<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST endpoints to query GIAV providers (proveedores).
 *
 * These endpoints are meant to power the admin mapping UI.
 */
class WP_Travel_GIAV_Providers_Controller extends WP_REST_Controller {

    /** @var WP_Travel_GIAV_Soap_Client */
    private $soap;

    public function __construct() {
        $this->namespace = 'travel/v1';
        $this->rest_base = 'giav/providers';
        $this->soap      = new WP_Travel_GIAV_Soap_Client();
    }

    public function register_routes() {

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/search', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ $this, 'search' ],
            'permission_callback' => [ $this, 'permissions' ],
            'args'                => [
                'q' => [
                    'required' => true,
                    'type'     => 'string',
                ],
                'pageSize' => [
                    'required' => false,
                    'type'     => 'integer',
                    'default'  => 20,
                ],
                'pageIndex' => [
                    'required' => false,
                    'type'     => 'integer',
                    'default'  => 0,
                ],
                'includeDisabled' => [
                    'required' => false,
                    'type'     => 'boolean',
                    'default'  => false,
                ],
            ],
        ] );

        register_rest_route( $this->namespace, '/' . $this->rest_base . '/(?P<id>\\d+)', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ $this, 'get' ],
            'permission_callback' => [ $this, 'permissions' ],
            'args'                => [
                'id' => [
                    'required' => true,
                    'type'     => 'integer',
                ],
            ],
        ] );
    }

    public function permissions() {
        // Only admins should map providers.
        return current_user_can( 'manage_options' );
    }

    public function search( WP_REST_Request $req ) {
        $q               = sanitize_text_field( (string) $req->get_param( 'q' ) );
        $page_size       = (int) $req->get_param( 'pageSize' );
        $page_index      = (int) $req->get_param( 'pageIndex' );
        $include_disabled = (bool) $req->get_param( 'includeDisabled' );

        $items = $this->soap->proveedor_search( $q, $page_size, $page_index, $include_disabled );
        if ( is_wp_error( $items ) ) {
            return $items;
        }

        $out = array_map( function ( $p ) {
            if ( ! is_object( $p ) ) {
                return null;
            }

            $id = (int) ( $p->Id ?? $p->ID ?? 0 );

            $alias  = trim( (string) ( $p->NombreAlias ?? '' ) );
            $nombre = trim( (string) ( $p->Nombre ?? '' ) );
            $label  = $alias !== '' ? $alias : ( $nombre !== '' ? $nombre : ( $id ? ( 'Proveedor #' . $id ) : '' ) );

            return [
                'id'    => $id,
                'title' => $label,
                'raw'   => [
                    'Nombre'      => $nombre,
                    'NombreAlias' => $alias,
                    'Cif'         => isset( $p->Cif ) ? (string) $p->Cif : '',
                    'Email'       => isset( $p->Email ) ? (string) $p->Email : '',
                    'Telefono'    => isset( $p->Telefono ) ? (string) $p->Telefono : '',
                ],
            ];
        }, $items );

        $out = array_values( array_filter( $out ) );
        return rest_ensure_response( $out );
    }

    public function get( WP_REST_Request $req ) {
        $id = (int) $req->get_param( 'id' );

        $prov = $this->soap->proveedor_get( $id );
        if ( is_wp_error( $prov ) ) {
            return $prov;
        }
        if ( ! is_object( $prov ) ) {
            return new WP_Error( 'not_found', 'Proveedor no encontrado', [ 'status' => 404 ] );
        }

        $alias  = trim( (string) ( $prov->NombreAlias ?? '' ) );
        $nombre = trim( (string) ( $prov->Nombre ?? '' ) );
        $label  = $alias !== '' ? $alias : ( $nombre !== '' ? $nombre : ( 'Proveedor #' . $id ) );

        return rest_ensure_response( [
            'id'    => (int) ( $prov->Id ?? $id ),
            'title' => $label,
            'raw'   => $prov,
        ] );
    }
}
