import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import ProposalsList from './pages/ProposalsList';
import ProposalDetail from './pages/ProposalDetail';
import ProposalWizardPage from './pages/ProposalWizardPage';
import RequestsList from './pages/RequestsList';
import RequestDetail from './pages/RequestDetail';

const PortalLayout = ( { children, config } ) => (
  <div className="casanova-portal">
    <header className="casanova-portal__header">
      <div className="casanova-portal__header-main">
        <div>
          <p className="casanova-portal__eyebrow">Portal de propuestas</p>
          <h1>Gestión de reservas</h1>
        </div>
        <div className="casanova-portal__user">
          <div className="casanova-portal__user-meta">
            <span>{config.currentUser?.displayName || 'Administrador'}</span>
            <small>{config.currentUser?.email || ''}</small>
          </div>
          {config.logoutUrl ? (
            <div className="casanova-portal__user-actions">
              <a className="casanova-portal__logout" href={config.logoutUrl}>
                Cerrar sesión
              </a>
            </div>
          ) : null}
        </div>
      </div>
      <p className="casanova-portal__subtitle">
        Monitorea versiones, revisa estados y sincroniza con GIAV.
      </p>
    </header>
    <div className="casanova-portal__body">
      <aside className="casanova-portal__sidebar">
        <div className="casanova-portal__branding">
          <span className="casanova-portal__branding-icon">CG</span>
          <div>
            <strong>Casanova</strong>
            <small>Gestión premium</small>
          </div>
        </div>
        <nav className="casanova-portal__nav">
          <NavLink
            to="/proposals"
            className={ ( { isActive } ) =>
              `casanova-portal__nav-link ${
                isActive ? 'casanova-portal__nav-link--active' : ''
              }`
            }
          >
            Listado de propuestas
          </NavLink>
          <NavLink
            to="/requests"
            className={ ( { isActive } ) =>
              `casanova-portal__nav-link ${
                isActive ? 'casanova-portal__nav-link--active' : ''
              }`
            }
          >
            Solicitudes recibidas
          </NavLink>
        </nav>
        <div className="casanova-portal__status">
          <span>Base de datos</span>
          <strong
            className={
              config.flags?.dbHealthy ? 'status-chip--ok' : 'status-chip--warning'
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
    return (
      <div className="casanova-portal__loading">Cargando configuración...</div>
    );
  }

  return (
    <HashRouter>
      <PortalLayout config={config}>
          <Routes>
            <Route path="/" element={ <Navigate to="/proposals" replace /> } />
            <Route path="/proposals" element={<ProposalsList />} />
            <Route path="/requests" element={<RequestsList />} />
            <Route path="/requests/:requestId" element={<RequestDetail />} />
            <Route path="/nueva" element={<ProposalWizardPage mode="create" />} />
            <Route path="/propuesta/:proposalId" element={<ProposalDetail />} />
            <Route path="/propuesta/:proposalId/editar" element={<ProposalWizardPage mode="edit" />} />
            <Route path="/proposals/:proposalId" element={<ProposalDetail />} />
            <Route path="/proposals/:proposalId/edit" element={<ProposalWizardPage mode="edit" />} />
            <Route path="*" element={ <Navigate to="/proposals" replace /> } />
          </Routes>
      </PortalLayout>
    </HashRouter>
  );
};

export default App;
