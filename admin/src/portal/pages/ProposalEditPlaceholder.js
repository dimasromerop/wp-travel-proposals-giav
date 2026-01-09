import { Link } from 'react-router-dom';

const ProposalEditPlaceholder = () => (
  <div className="casanova-portal-section">
    <h2>Wizard en migración</h2>
    <p>
      Estamos preparando la nueva versión del wizard. Por ahora puedes seguir
      utilizando elflow actual desde el admin clásico, y pronto tendrás esta
      experiencia integrada.
    </p>
    <div className="casanova-portal-detail__actions-row">
      <Link to="/proposals" className="button-link">
        Volver al listado
      </Link>
      <p className="casanova-portal-detail__note">
        Si necesitas editar ya, usa el wizard en <strong>wp-admin</strong>.
      </p>
    </div>
  </div>
);

export default ProposalEditPlaceholder;
