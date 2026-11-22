/**
 * Lightweight IIIF v2 & v3 Manifest and Collection parser for the Story Sources picker.
 */

import { resolveIiifText } from './manifestAttribution';

export type SourceCanvasItem = {
  index: number;
  id: string;
  label: string;
  thumbnail: string | null;
};

export type SourceCollectionEntry = {
  id: string;
  type: 'Manifest' | 'Collection';
  label: string;
  thumbnail: string | null;
};

export type ParsedIiifResource =
  | {
      kind: 'manifest';
      id: string;
      label: string;
      canvases: SourceCanvasItem[];
    }
  | {
      kind: 'collection';
      id: string;
      label: string;
      items: SourceCollectionEntry[];
    };

const extractThumbnailUrl = (node: unknown): string | null => {
  if (!node || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  const thumb = record.thumbnail;
  if (typeof thumb === 'string' && thumb.trim()) return thumb.trim();
  const firstThumb = Array.isArray(thumb) ? thumb[0] : thumb;
  if (typeof firstThumb === 'string' && firstThumb.trim()) return firstThumb.trim();
  if (firstThumb && typeof firstThumb === 'object') {
    const obj = firstThumb as Record<string, unknown>;
    const id = obj.id ?? obj['@id'];
    if (typeof id === 'string' && id.trim()) return id.trim();
  }

  // Fallback for IIIF v3 canvas painting image body
  const items = Array.isArray(record.items) ? record.items : [];
  for (const page of items) {
    if (!page || typeof page !== 'object') continue;
    const annos = Array.isArray((page as Record<string, unknown>).items)
      ? ((page as Record<string, unknown>).items as unknown[])
      : [];
    for (const anno of annos) {
      if (!anno || typeof anno !== 'object') continue;
      const body = (anno as Record<string, unknown>).body;
      const firstBody = Array.isArray(body) ? body[0] : body;
      if (firstBody && typeof firstBody === 'object') {
        const bodyObj = firstBody as Record<string, unknown>;
        const service = Array.isArray(bodyObj.service) ? bodyObj.service[0] : bodyObj.service;
        if (service && typeof service === 'object') {
          const serviceId =
            (service as Record<string, unknown>).id ?? (service as Record<string, unknown>)['@id'];
          if (typeof serviceId === 'string' && serviceId.trim()) {
            const clean = serviceId.trim().replace(/\/+$/, '');
            const typeStr = String(
              (service as Record<string, unknown>).type ??
                (service as Record<string, unknown>)['@type'] ??
                '',
            );
            const size = typeStr.includes('3') ? 'max' : 'full';
            return `${clean}/full/!240,240/0/default.jpg`.replace('!240,240', size === 'max' ? '240,' : '240,');
          }
        }
        const bodyId = bodyObj.id ?? bodyObj['@id'];
        if (
          typeof bodyId === 'string' &&
          bodyId.trim() &&
          (bodyObj.type === 'Image' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(bodyId))
        ) {
          return bodyId.trim();
        }
      }
    }
  }

  // Fallback for IIIF v2 canvas images array
  const images = Array.isArray(record.images) ? record.images : [];
  const firstImg = images[0];
  if (firstImg && typeof firstImg === 'object') {
    const resource = (firstImg as Record<string, unknown>).resource;
    if (resource && typeof resource === 'object') {
      const resObj = resource as Record<string, unknown>;
      const service = Array.isArray(resObj.service) ? resObj.service[0] : resObj.service;
      if (service && typeof service === 'object') {
        const serviceId =
          (service as Record<string, unknown>)['@id'] ?? (service as Record<string, unknown>).id;
        if (typeof serviceId === 'string' && serviceId.trim()) {
          return `${serviceId.trim().replace(/\/+$/, '')}/full/240,/0/default.jpg`;
        }
      }
      const resId = resObj['@id'] ?? resObj.id;
      if (typeof resId === 'string' && resId.trim()) return resId.trim();
    }
  }

  return null;
};

export const parseIiifResource = (
  json: unknown,
  fallbackId: string,
  language = 'en',
): ParsedIiifResource | null => {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  const id = String(raw.id ?? raw['@id'] ?? fallbackId);
  const label = resolveIiifText(raw.label, language) || id;
  const rawType = String(raw.type ?? raw['@type'] ?? '').toLowerCase();

  // IIIF v2 or v3 Collection
  if (rawType.includes('collection')) {
    const rawItems: unknown[] = [
      ...(Array.isArray(raw.items) ? raw.items : []),
      ...(Array.isArray(raw.collections) ? raw.collections : []),
      ...(Array.isArray(raw.manifests) ? raw.manifests : []),
      ...(Array.isArray(raw.members) ? raw.members : []),
    ];
    const items: SourceCollectionEntry[] = [];
    for (const entry of rawItems) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const entryId = obj.id ?? obj['@id'];
      if (typeof entryId !== 'string' || !entryId.trim()) continue;
      const entryType = String(obj.type ?? obj['@type'] ?? '').toLowerCase();
      items.push({
        id: entryId.trim(),
        type: entryType.includes('collection') ? 'Collection' : 'Manifest',
        label: resolveIiifText(obj.label, language) || entryId.trim(),
        thumbnail: extractThumbnailUrl(obj),
      });
    }
    return { kind: 'collection', id, label, items };
  }

  // IIIF v3 Manifest (`items`) or v2 Manifest (`sequences[0].canvases`)
  const rawCanvases: unknown[] = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.sequences) &&
        raw.sequences[0] &&
        typeof raw.sequences[0] === 'object' &&
        Array.isArray((raw.sequences[0] as Record<string, unknown>).canvases)
      ? ((raw.sequences[0] as Record<string, unknown>).canvases as unknown[])
      : [];

  const canvases: SourceCanvasItem[] = rawCanvases
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
    .map((canvas, index) => ({
      index,
      id: String(canvas.id ?? canvas['@id'] ?? `${id}/canvas/${index}`),
      label: resolveIiifText(canvas.label, language) || `Canvas ${index + 1}`,
      thumbnail: extractThumbnailUrl(canvas),
    }));

  return { kind: 'manifest', id, label, canvases };
};
