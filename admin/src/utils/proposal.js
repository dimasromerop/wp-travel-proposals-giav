const STORAGE_KEY = 'wp_travel_giav_proposal_id';

const hasSessionStorage = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

export function setStoredProposalId(id) {
  if (!hasSessionStorage()) {
    return;
  }

  if (id && Number.isFinite(id) && id > 0) {
    window.sessionStorage.setItem(STORAGE_KEY, String(Math.floor(id)));
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function getStoredProposalId() {
  if (!hasSessionStorage()) {
    return null;
  }

  const value = window.sessionStorage.getItem(STORAGE_KEY);
  if (!value) {
    return null;
  }

  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function clearStoredProposalId() {
  if (!hasSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
