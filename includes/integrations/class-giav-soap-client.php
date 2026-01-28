<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Minimal SOAP client wrapper for GIAV.
 *
 * This mirrors the proven approach used in the customer portal plugin:
 * - Basic auth (login/password) optionally
 * - apikey injected into the request body
 * - robust error handling returning WP_Error
 */
class WP_Travel_GIAV_Soap_Client {

    /** @var SoapClient|null */
    private static $client = null;
    private $last_request = '';
    private $last_response = '';
    private $last_method = '';
    private $last_duration_ms = 0.0;

    /**
     * Returns a cached SoapClient.
     */
    private function client(): SoapClient {
        if ( self::$client instanceof SoapClient ) {
            return self::$client;
        }

        if ( ! defined( 'CASANOVA_GIAV_WSDL' ) || ! CASANOVA_GIAV_WSDL ) {
            throw new Exception( 'CASANOVA_GIAV_WSDL no está definido en wp-config.php' );
        }

        $opts = [
            'trace'              => true,
            'exceptions'         => true,
            'cache_wsdl'         => WSDL_CACHE_BOTH,
            'connection_timeout' => 15,
        ];

        if ( defined( 'CASANOVA_GIAV_USER' ) && defined( 'CASANOVA_GIAV_PASS' ) && CASANOVA_GIAV_PASS !== '' ) {
            $opts['login']    = CASANOVA_GIAV_USER;
            $opts['password'] = CASANOVA_GIAV_PASS;
        }

        self::$client = new SoapClient( CASANOVA_GIAV_WSDL, $opts );
        return self::$client;
    }

    /**
     * Performs a SOAP call injecting apikey into the body.
     *
     * @return mixed|WP_Error
     */
    public function call( string $method, $params = [] ) {
        if ( ! defined( 'CASANOVA_GIAV_APIKEY' ) || ! CASANOVA_GIAV_APIKEY ) {
            return new WP_Error( 'giav_config', 'CASANOVA_GIAV_APIKEY no está definido en wp-config.php' );
        }

        $client = $this->client();

        // Normalize params to stdClass.
        if ( is_array( $params ) ) {
            $obj = new stdClass();
            foreach ( $params as $k => $v ) {
                $obj->$k = $v;
            }
            $params = $obj;
        } elseif ( ! is_object( $params ) ) {
            $params = new stdClass();
        }

        if ( ! isset( $params->apikey ) ) {
            $params->apikey = CASANOVA_GIAV_APIKEY;
        }

        $this->last_method = $method;
        $start_time = microtime( true );

        try {
            $response = $client->__soapCall( $method, [ $params ] );
            $this->last_duration_ms = ( microtime( true ) - $start_time ) * 1000;
            $this->last_request = $client->__getLastRequest();
            $this->last_response = $client->__getLastResponse();
            return $response;
        } catch ( Throwable $e ) {
            $this->last_duration_ms = ( microtime( true ) - $start_time ) * 1000;
            $this->last_request = $client->__getLastRequest();
            $this->last_response = $client->__getLastResponse();
            error_log( '[WP_TRAVEL_GIAV SOAP] ' . $method . ' :: ' . $e->getMessage() );
            return new WP_Error( 'soap_error', $e->getMessage() );
        }
    }

    public function get_last_request(): string {
        return (string) $this->last_request;
    }

    public function get_last_response(): string {
        return (string) $this->last_response;
    }

    public function get_last_method(): string {
        return $this->last_method;
    }

    public function get_last_duration_ms(): float {
        return $this->last_duration_ms;
    }

    /**
     * Proveedor_GET by ID.
     *
     * @return object|WP_Error
     */
    public function proveedor_get( int $id_proveedor ) {
        if ( $id_proveedor <= 0 ) {
            return new WP_Error( 'bad_id', 'ID proveedor inválido' );
        }

        $res = $this->call( 'Proveedor_GET', [ 'id' => $id_proveedor ] );
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        if ( is_object( $res ) && isset( $res->Proveedor_GETResult ) ) {
            return $res->Proveedor_GETResult;
        }
        return $res;
    }

    /**
     * Proveedor_SEARCH by name.
     *
     * According to the WSDL, several fields are mandatory:
     * - genera347_349 (FiltroBoleanoOpcional)
     * - cifExacto (bool)
     * - incluirDeshabilitados (bool)
     * - pageSize (int)
     * - pageIndex (int)
     *
     * @return array|WP_Error Array of WsProveedor
     */
    public function proveedor_search( string $q, int $page_size = 20, int $page_index = 0, bool $include_disabled = false ) {
        $q = trim( (string) $q );
        if ( $q === '' ) {
            return [];
        }

        $page_size  = max( 1, min( 100, (int) $page_size ) );
        $page_index = max( 0, (int) $page_index );

        $p = new stdClass();
        $p->apikey                = CASANOVA_GIAV_APIKEY;
        $p->nombre                = $q;
        $p->genera347_349          = 'NoAplicar';
        $p->cifExacto              = false;
        $p->incluirDeshabilitados  = $include_disabled;
        $p->pageSize               = $page_size;
        $p->pageIndex              = $page_index;

        $res = $this->call( 'Proveedor_SEARCH', $p );
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        $list = null;
        if ( is_object( $res ) && isset( $res->Proveedor_SEARCHResult ) ) {
            $list = $res->Proveedor_SEARCHResult;
        } else {
            $list = $res;
        }

        // Normalize ArrayOfWsProveedor.
        if ( $list === null ) {
            return [];
        }
        if ( is_object( $list ) && count( get_object_vars( $list ) ) === 0 ) {
            return [];
        }
        if ( is_array( $list ) ) {
            return $list;
        }
        if ( is_object( $list ) && isset( $list->WsProveedor ) ) {
            $items = $list->WsProveedor;
            if ( $items === null ) {
                return [];
            }
            if ( is_array( $items ) ) {
                return $items;
            }
            if ( is_object( $items ) ) {
                return [ $items ];
            }
            return [];
        }
        if ( is_object( $list ) ) {
            return [ $list ];
        }

        return [];
    }

    /**
     * AgenteComercial_GET by ID.
     *
     * @return object|WP_Error
     */
    public function agente_comercial_get( int $id_agente ) {
        if ( $id_agente <= 0 ) {
            return new WP_Error( 'bad_id', 'ID agente comercial invalido' );
        }

        $res = $this->call( 'AgenteComercial_GET', [ 'id' => $id_agente ] );
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        if ( is_object( $res ) && isset( $res->AgenteComercial_GETResult ) ) {
            return $res->AgenteComercial_GETResult;
        }
        return $res;
    }

    /**
     * AgenteComercial_SEARCH by name/alias/email.
     *
     * According to the WSDL, several fields are mandatory:
     * - incluirVinculados (bool)
     * - incluirBloqueados (bool)
     * - pageSize (int)
     * - pageIndex (int)
     *
     * @return array|WP_Error Array of WsAgenteComercial
     */
    public function agente_comercial_search(
        string $q = '',
        string $email = '',
        int $page_size = 20,
        int $page_index = 0,
        bool $include_linked = true,
        bool $include_blocked = false
    ) {
        $q = trim( (string) $q );
        $email = trim( (string) $email );

        if ( $q === '' && $email === '' ) {
            return [];
        }

        $page_size  = max( 1, min( 100, (int) $page_size ) );
        $page_index = max( 0, (int) $page_index );

        $p = new stdClass();
        $p->apikey                   = CASANOVA_GIAV_APIKEY;
        $p->idsAgente                = null;
        $p->aliasAgente              = $q !== '' ? $q : null;
        $p->nombre                   = $q !== '' ? $q : null;
        $p->correo                   = $email !== '' ? $email : null;
        $p->incluirVinculados        = (bool) $include_linked;
        $p->incluirBloqueados        = (bool) $include_blocked;
        $p->fechaHoraModificacionDesde = null;
        $p->fechaHoraModificacionHasta = null;
        $p->customDataValues         = null;
        $p->pageSize                 = $page_size;
        $p->pageIndex                = $page_index;

        $res = $this->call( 'AgenteComercial_SEARCH', $p );
        if ( is_wp_error( $res ) ) {
            return $res;
        }

        $list = null;
        if ( is_object( $res ) && isset( $res->AgenteComercial_SEARCHResult ) ) {
            $list = $res->AgenteComercial_SEARCHResult;
        } else {
            $list = $res;
        }

        if ( $list === null ) {
            return [];
        }
        if ( is_object( $list ) && count( get_object_vars( $list ) ) === 0 ) {
            return [];
        }
        if ( is_array( $list ) ) {
            return $list;
        }
        if ( is_object( $list ) && isset( $list->WsAgenteComercial ) ) {
            $items = $list->WsAgenteComercial;
            if ( $items === null ) {
                return [];
            }
            if ( is_array( $items ) ) {
                return $items;
            }
            if ( is_object( $items ) ) {
                return [ $items ];
            }
            return [];
        }
        if ( is_object( $list ) ) {
            return [ $list ];
        }

        return [];
    }
}
