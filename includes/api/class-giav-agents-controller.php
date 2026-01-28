<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * REST endpoints to query GIAV commercial agents.
 */
class WP_Travel_GIAV_Agents_Controller extends WP_REST_Controller {

    /** @var WP_Travel_GIAV_Soap_Client */
    private $soap;

    public function __construct() {
        $this->namespace = 'travel/v1';
        $this->rest_base = 'giav/agents';
        $this->soap      = new WP_Travel_GIAV_Soap_Client();
    }

    public function register_routes() {
        register_rest_route( $this->namespace, '/' . $this->rest_base . '/search', [
            'methods'             => WP_REST_Server::READABLE,
            'callback'            => [ $this, 'search' ],
            'permission_callback' => [ $this, 'permissions' ],
            'args'                => [
                'q' => [
                    'required' => false,
                    'type'     => 'string',
                ],
                'email' => [
                    'required' => false,
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
                'includeLinked' => [
                    'required' => false,
                    'type'     => 'boolean',
                    'default'  => true,
                ],
                'includeBlocked' => [
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
        return wp_travel_giav_rest_permission_response();
    }

    public function search( WP_REST_Request $req ) {
        $q = sanitize_text_field( (string) $req->get_param( 'q' ) );
        $email = sanitize_text_field( (string) $req->get_param( 'email' ) );
        $page_size = (int) $req->get_param( 'pageSize' );
        $page_index = (int) $req->get_param( 'pageIndex' );
        $include_linked = (bool) $req->get_param( 'includeLinked' );
        $include_blocked = (bool) $req->get_param( 'includeBlocked' );

        $items = $this->soap->agente_comercial_search(
            $q,
            $email,
            $page_size,
            $page_index,
            $include_linked,
            $include_blocked
        );
        if ( is_wp_error( $items ) ) {
            return $items;
        }

        $out = array_map( function ( $agent ) {
            if ( ! is_object( $agent ) ) {
                return null;
            }

            $id = (int) ( $agent->Id ?? $agent->ID ?? 0 );
            $alias = trim( (string) ( $agent->AliasAgente ?? '' ) );
            $nombre = trim( (string) ( $agent->Nombre ?? '' ) );
            $correo = trim( (string) ( $agent->Correo ?? '' ) );

            $label = $alias !== '' ? $alias : ( $nombre !== '' ? $nombre : ( $id ? ( 'Agente #' . $id ) : '' ) );

            return [
                'id'    => $id,
                'label' => $label,
                'email' => $correo,
                'raw'   => [
                    'Nombre'      => $nombre,
                    'AliasAgente' => $alias,
                    'Correo'      => $correo,
                ],
            ];
        }, $items );

        $out = array_values( array_filter( $out ) );
        return rest_ensure_response( $out );
    }

    public function get( WP_REST_Request $req ) {
        $id = (int) $req->get_param( 'id' );

        $agent = $this->soap->agente_comercial_get( $id );
        if ( is_wp_error( $agent ) ) {
            return $agent;
        }
        if ( ! is_object( $agent ) ) {
            return new WP_Error( 'not_found', 'Agente no encontrado', [ 'status' => 404 ] );
        }

        $alias = trim( (string) ( $agent->AliasAgente ?? '' ) );
        $nombre = trim( (string) ( $agent->Nombre ?? '' ) );
        $correo = trim( (string) ( $agent->Correo ?? '' ) );
        $label = $alias !== '' ? $alias : ( $nombre !== '' ? $nombre : ( 'Agente #' . $id ) );

        return rest_ensure_response( [
            'id'    => (int) ( $agent->Id ?? $id ),
            'label' => $label,
            'email' => $correo,
            'raw'   => $agent,
        ] );
    }
}
