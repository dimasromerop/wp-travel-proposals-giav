import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

/**
 * Inline row actions for the portal proposals list.
 * Actions:
 * - Editar
 * - Vista pública (si existe URL)
 * - Copiar enlace (si existe URL y el navegador lo permite)
 */
export default function RowActionsMenu({ proposal }) {
  const publicUrl = proposal?.public_url || '';
  const editTo = useMemo(() => `/propuesta/${proposal?.id}/editar`, [proposal?.id]);

  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  const copyDisabled = !publicUrl || !canCopy;
  const copyTitle = !publicUrl
    ? 'No hay enlace público disponible'
    : !canCopy
      ? 'Tu navegador no permite copiar al portapapeles'
      : 'Copiar enlace';

  const handleCopy = async () => {
    if (!publicUrl || !canCopy) return;

    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch (_) {
      // Si falla el portapapeles, simplemente no hacemos nada adicional.
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
        <span aria-hidden="true">✏️</span>
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
          <span aria-hidden="true">🌐</span>
        </a>
      ) : (
        <button
          type="button"
          className="cg-row-actions-inline__icon cg-row-actions-inline__icon--disabled"
          disabled
          title="No hay vista pública disponible"
          aria-label="Vista pública no disponible"
        >
          <span aria-hidden="true">🌐</span>
        </button>
      )}

      <button
        type="button"
        className="cg-row-actions-inline__icon"
        onClick={handleCopy}
        disabled={copyDisabled}
        title={copyTitle}
      >
        <span aria-hidden="true">📋</span>
      </button>
    </div>
  );
}
