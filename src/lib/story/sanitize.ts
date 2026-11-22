/**
 * Strict sanitizers for untrusted CSS values and content URLs coming from
 * external IIIF story AnnotationPages or query parameters.
 */

const SAFE_HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SAFE_FUNC_COLOR =
  /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/+-]+\s*\)$/i;
const SAFE_NAMED_COLOR = /^[a-z]{3,20}$/i;

/**
 * Validates a CSS color string from untrusted story JSON so it cannot inject
 * additional CSS declarations (such as `url(...)` or `; ...`) into inline `style` attributes.
 */
export const sanitizeCssColor = (
  value: string | null | undefined,
  fallback: string,
): string => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return fallback;
  if (
    SAFE_HEX_COLOR.test(trimmed) ||
    SAFE_FUNC_COLOR.test(trimmed) ||
    SAFE_NAMED_COLOR.test(trimmed)
  ) {
    return trimmed;
  }
  return fallback;
};

/**
 * Allows `http:`, `https:`, or single-slash relative URLs while blocking
 * `javascript:`, `data:`, `file:`, and protocol-relative `//host` URLs.
 */
export const isSafeContentUrl = (rawUrl: string | null | undefined): boolean => {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('//')) return false;
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return true;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    // Plain relative path like `test-story/demo.json`
    return !trimmed.includes(':');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};
