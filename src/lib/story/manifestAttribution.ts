/**
 * Extracts localized IIIF Presentation 2 & 3 attribution, rights, provider,
 * and source metadata from a manifest JSON document for display in the reader.
 */

export type ManifestAttributionLink = {
  label: string;
  href: string;
};

export type ManifestAttribution = {
  manifestId: string;
  title: string;
  attributionLabel?: string;
  attribution?: string;
  rights?: string;
  providers: Array<{ name: string; homepage?: string }>;
  homepage?: ManifestAttributionLink;
};

const stripTags = (input: string): string =>
  input
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isSafeUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Resolves a IIIF v3 language map, v2 string/array, or v2 `@value`/`@language` array.
 */
export const resolveIiifText = (value: unknown, language = 'en'): string => {
  if (!value) return '';
  if (typeof value === 'string') return stripTags(value);

  if (Array.isArray(value)) {
    const langLower = language.toLowerCase();
    const matched = value.find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>)['@language'] === 'string' &&
        ((entry as Record<string, unknown>)['@language'] as string).toLowerCase() === langLower,
    );
    if (matched) return resolveIiifText(matched, language);
    for (const entry of value) {
      const resolved = resolveIiifText(entry, language);
      if (resolved) return resolved;
    }
    return '';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['@value'] === 'string') {
      return stripTags(record['@value']);
    }

    const langLower = language.toLowerCase();
    const keys = Object.keys(record);
    const exactKey = keys.find((key) => key.toLowerCase() === langLower);
    const baseLang = langLower.split('-')[0];
    const baseKey = exactKey ?? keys.find((key) => key.toLowerCase().split('-')[0] === baseLang);
    const fallbackKey =
      baseKey ??
      keys.find((key) => key === 'none') ??
      keys.find((key) => key.toLowerCase() === 'en') ??
      keys[0];

    if (fallbackKey) {
      const entry = record[fallbackKey];
      if (Array.isArray(entry)) {
        return entry
          .map((item) => (typeof item === 'string' ? stripTags(item) : resolveIiifText(item, language)))
          .filter(Boolean)
          .join(' ');
      }
      return resolveIiifText(entry, language);
    }
  }

  return '';
};

const extractProviders = (
  raw: Record<string, unknown>,
  language: string,
): Array<{ name: string; homepage?: string }> => {
  const providerValue = raw.provider;
  const list = Array.isArray(providerValue)
    ? providerValue
    : providerValue && typeof providerValue === 'object'
      ? [providerValue]
      : [];

  const providers: Array<{ name: string; homepage?: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const name = resolveIiifText(entry.label, language);
    if (!name) continue;
    const hpRaw = Array.isArray(entry.homepage) ? entry.homepage[0] : entry.homepage;
    const hpHref =
      hpRaw && typeof hpRaw === 'object'
        ? ((hpRaw as Record<string, unknown>).id ?? (hpRaw as Record<string, unknown>)['@id'])
        : hpRaw;
    providers.push({
      name,
      ...(isSafeUrl(hpHref) ? { homepage: hpHref.trim() } : {}),
    });
  }
  return providers;
};

const extractHomepage = (
  raw: Record<string, unknown>,
  language: string,
): ManifestAttributionLink | undefined => {
  const candidate = Array.isArray(raw.homepage)
    ? raw.homepage[0]
    : (raw.homepage ?? (Array.isArray(raw.related) ? raw.related[0] : raw.related));
  if (!candidate) return undefined;
  if (isSafeUrl(candidate)) {
    return { label: candidate.trim(), href: candidate.trim() };
  }
  if (typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    const href = obj.id ?? obj['@id'];
    if (!isSafeUrl(href)) return undefined;
    const label = resolveIiifText(obj.label, language) || href.trim();
    return { label, href: href.trim() };
  }
  return undefined;
};

export const extractManifestAttribution = (
  manifestJson: unknown,
  manifestId: string,
  language = 'en',
): ManifestAttribution | null => {
  if (!manifestJson || typeof manifestJson !== 'object') return null;
  const raw = manifestJson as Record<string, unknown>;

  const title = resolveIiifText(raw.label, language) || manifestId;
  const requiredStatement =
    raw.requiredStatement && typeof raw.requiredStatement === 'object'
      ? (raw.requiredStatement as Record<string, unknown>)
      : null;

  const attributionLabel = requiredStatement
    ? resolveIiifText(requiredStatement.label, language) || undefined
    : undefined;
  const attribution =
    (requiredStatement ? resolveIiifText(requiredStatement.value, language) : '') ||
    resolveIiifText(raw.attribution, language) ||
    undefined;

  const rawRights = raw.rights ?? (Array.isArray(raw.license) ? raw.license[0] : raw.license);
  const rights =
    typeof rawRights === 'string' && rawRights.trim()
      ? rawRights.trim()
      : resolveIiifText(rawRights, language) || undefined;

  const providers = extractProviders(raw, language);
  const homepage = extractHomepage(raw, language);

  return {
    manifestId,
    title,
    ...(attributionLabel ? { attributionLabel } : {}),
    ...(attribution ? { attribution } : {}),
    ...(rights ? { rights } : {}),
    providers,
    ...(homepage ? { homepage } : {}),
  };
};
