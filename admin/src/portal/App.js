import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import ProposalsList from './pages/ProposalsList';
import ProposalDetail from './pages/ProposalDetail';

const getBasePath = (pageBase) => {
  if ( ! pageBase ) {
    return '/gestion-reservas';
  }

  try {
    const url = new URL( pageBase, window.location.origin );
    return url.pathname.replace( /\/$/, '' ) || '/';
  } catch ( error ) {
    return pageBase.replace( /\/$/, '' ) || '/';
  }
};

const PortalLayout = ( { children, config } ) => (
  <div className="casanova-portal">
    <header className="casanova-portal__header">
      <div>
        <p className="casanova-portal__eyebrow">Portal de propuestas</p>
        <h1>Gestión de reservas</h1>
        <p>Monitorea versiones, revisa estados y sincroniza con GIAV.</p>
      </div>
      <div className="casanova-portal__user">
        <span>{config.currentUser?.displayName || 'Administrador'}</span>
        <small>{config.currentUser?.email || ''}</small>
      </div>
    </header>
    <div className="casanova-portal__body">
      <aside className="casanova-portal__sidebar">
        <nav>
          <Link to="/">Listado de propuestas</Link>
        </nav>
        <div className="casanova-portal__status">
          <span>Base de datos</span>
          <strong
            className={
              config.flags?.dbHealthy ? 'status-green' : 'status-warning'
            }
          >
            {config.flags?.dbHealthy ? 'OK' : 'Revisar'}
          </strong>
        </div>
      </aside>
      <section className="casanova-portal__content">{children}</section>
    </div>
  </div>
);

const App = () => {
  const config = window.CASANOVA_GESTION_RESERVAS;

  if ( ! config ) {
    return <div className="casanova-portal__loading">Cargando configuración...</div>;
  }

  const basename = getBasePath( config.pageBase );

  return (
    <BrowserRouter basename={basename}>
      <PortalLayout config={config}>
        <Routes>
          <Route path="/" element={<ProposalsList />} />
          <Route
            path="/propuesta/:proposalId"
            element={<ProposalDetail />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PortalLayout>
    </BrowserRouter>
  );
};

export default App;
