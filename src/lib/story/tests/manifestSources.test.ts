import { describe, expect, it } from 'vitest';
import { parseIiifResource } from '../manifestSources';

describe('manifestSources', () => {
  it('parses IIIF v3 manifests and canvases with thumbnails', () => {
    const manifest = {
      id: 'https://example.org/manifest/1',
      type: 'Manifest',
      label: { en: ['Folio Collection'] },
      items: [
        {
          id: 'https://example.org/canvas/1',
          type: 'Canvas',
          label: { en: ['Folio 1r'] },
          thumbnail: [{ id: 'https://example.org/thumb/1.jpg', type: 'Image' }],
        },
        {
          id: 'https://example.org/canvas/2',
          type: 'Canvas',
          label: { en: ['Folio 1v'] },
        },
      ],
    };

    const parsed = parseIiifResource(manifest, manifest.id, 'en');
    expect(parsed?.kind).toBe('manifest');
    if (parsed?.kind === 'manifest') {
      expect(parsed.label).toBe('Folio Collection');
      expect(parsed.canvases).toEqual([
        {
          index: 0,
          id: 'https://example.org/canvas/1',
          label: 'Folio 1r',
          thumbnail: 'https://example.org/thumb/1.jpg',
        },
        {
          index: 1,
          id: 'https://example.org/canvas/2',
          label: 'Folio 1v',
          thumbnail: null,
        },
      ]);
    }
  });

  it('parses IIIF v2 manifests and IIIF collections', () => {
    const collection = {
      id: 'https://example.org/collection/1',
      type: 'Collection',
      label: { en: ['Exhibition'] },
      items: [
        {
          id: 'https://example.org/manifest/a',
          type: 'Manifest',
          label: { en: ['Painting A'] },
        },
        {
          id: 'https://example.org/collection/sub',
          type: 'Collection',
          label: { en: ['Sub-collection'] },
        },
      ],
    };

    const parsed = parseIiifResource(collection, collection.id, 'en');
    expect(parsed?.kind).toBe('collection');
    if (parsed?.kind === 'collection') {
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].type).toBe('Manifest');
      expect(parsed.items[1].type).toBe('Collection');
    }
  });
});
