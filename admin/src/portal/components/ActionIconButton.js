import { createElement } from 'react';

const ICON_SIZE = 18;

const IconEye = () => (
  <svg viewBox="0 0 24 24" fill="none" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true">
    <path
      d="M12 5C7 5 3.1 8.5 2 11.5c1.1 3 5 6.5 10 6.5s8.9-3.5 10-6.5C20.9 8.5 17 5 12 5z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IconDocument = () => (
  <svg viewBox="0 0 24 24" fill="none" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true">
    <path
      d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M13 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPencil = () => (
  <svg viewBox="0 0 24 24" fill="none" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true">
    <path
      d="M4 20h3l11-11-3-3L4 17v3z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M14 4l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true">
    <path
      d="M4 12h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M12 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true">
    <path
      d="M9 4h10a1 1 0 0 1 1 1v12"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="5"
      y="8"
      width="10"
      height="12"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M9 10h-3a2 2 0 0 0-2 2v6h6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ICONS = {
  eye: <IconEye />,
  document: <IconDocument />,
  pencil: <IconPencil />,
  arrow: <IconArrow />,
  copy: <IconCopy />,
};

export default function ActionIconButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled = false,
  className = '',
}) {
  const content = ICONS[icon] || icon;
  return (
    <button
      type="button"
      className={`casanova-action-icon ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={tooltip || label}
      aria-label={tooltip || label}
    >
      {content}
    </button>
  );
}
