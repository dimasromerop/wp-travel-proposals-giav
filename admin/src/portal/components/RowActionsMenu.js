import { useMemo } from 'react';
import { Link } from 'react-router-dom';

// Inline SVG icons (no external deps). Using currentColor keeps them consistent with the theme.
function IconPencil(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 20h9" stroke="currentColor" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGlobe(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        stroke="currentColor"
      />
      <path d="M3 12h18" stroke="currentColor" strokeLinecap="round" />
      <path
        d="M12 3c2.8 3 4.2 6 4.2 9s-1.4 6-4.2 9c-2.8-3-4.2-6-4.2-9S9.2 6 12 3Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCopyLink(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.6 4"
        stroke="currentColor"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.1 0L5.5 12.4a5 5 0 0 0 7.1 7.1L13.4 20"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTrash(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 4h6l1 2H8l1-2z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 7h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 7z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6" stroke="currentColor" strokeLinecap="round" />
      <path d="M14 11v6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

export default function RowActionsMenu({ proposal, onDelete }) {
  const publicUrl = proposal?.public_url || '';
  const editTo = useMemo(() => `/propuesta/${proposal?.id}/editar`, [proposal?.id]);

  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  const copyDisabled = !publicUrl || !canCopy;
  const copyTitle = !publicUrl
    ? 'No hay enlace pública disponible'
    : !canCopy
      ? 'Tu navegador no permite copiar al portapapeles'
      : 'Copiar enlace';

  const handleCopy = async () => {
    if (!publicUrl || !canCopy) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch (_) {
      // Si falla el portapapeles, no hacemos nada.
    }
  };

  const handleDelete = () => {
    if (typeof onDelete === 'function') {
      onDelete(proposal);
    }
  };

  return (
    <div className="cg-row-actions-inline">
      <Link
        to={editTo}
        className="cg-row-actions-inline__icon"
        title="Editar propuesta"
        aria-label="Editar propuesta"
      >
        <IconPencil className="cg-row-actions-inline__svg" />
      </Link>

      {publicUrl ? (
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className="cg-row-actions-inline__icon"
          title="Vista pública"
          aria-label="Vista pública"
        >
          <IconGlobe className="cg-row-actions-inline__svg" />
        </a>
      ) : (
        <button
          type="button"
          className="cg-row-actions-inline__icon cg-row-actions-inline__icon--disabled"
          disabled
          title="No hay vista pública disponible"
          aria-label="Vista pública no disponible"
        >
          <IconGlobe className="cg-row-actions-inline__svg" />
        </button>
      )}

      <button
        type="button"
        className="cg-row-actions-inline__icon"
        onClick={handleCopy}
        disabled={copyDisabled}
        title={copyTitle}
        aria-label={copyTitle}
      >
        <IconCopyLink className="cg-row-actions-inline__svg" />
      </button>

      {typeof onDelete === 'function' ? (
        <button
          type="button"
          className="cg-row-actions-inline__icon cg-row-actions-inline__icon--destructive"
          title="Eliminar propuesta"
          aria-label="Eliminar propuesta"
          onClick={handleDelete}
        >
          <IconTrash className="cg-row-actions-inline__svg" />
        </button>
      ) : null}
    </div>
  );
}
