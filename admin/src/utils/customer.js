export function buildCustomerFullName(firstName = '', lastName = '', fallback = '') {
  const first = (firstName || '').trim();
  const last = (lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) {
    return combined;
  }
  const fallbackName = (fallback || '').trim();
  return fallbackName;
}

export function splitCustomerFullName(fullName = '') {
  const source = (fullName || '').trim();
  if (!source) {
    return { firstName: '', lastName: '' };
  }
  const segments = source.split(/\s+/);
  const firstName = segments.shift() || '';
  const lastName = segments.join(' ');
  return { firstName, lastName };
}
