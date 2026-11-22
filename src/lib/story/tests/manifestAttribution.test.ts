import { describe, expect, it } from 'vitest';
import { extractManifestAttribution, resolveIiifText } from '../manifestAttribution';

describe('manifestAttribution', () => {
  it('extracts localized IIIF Presentation 3 attribution, rights, provider, and homepage', () => {
    const manifest = {
      id: 'https://example.org/manifest.json',
      type: 'Manifest',
      label: { en: ['Book of Hours'], cy: ['Llyfr Oriau'] },
      requiredStatement: {
        label: { en: ['Attribution'], cy: ['Priodoliad'] },
        value: { en: ['<span>National Library</span>'], cy: ['Llyfrgell Genedlaethol'] },
      },
      rights: 'https://creativecommons.org/licenses/by/4.0/',
      provider: [
        {
          id: 'https://example.org/org',
          type: 'Agent',
          label: { en: ['National Library'], cy: ['Llyfrgell Genedlaethol'] },
          homepage: [{ id: 'https://example.org/', type: 'Text', label: { en: ['Home'] } }],
        },
      ],
      homepage: [{ id: 'https://example.org/item/1', label: { en: ['Catalogue record'] } }],
    };

    const en = extractManifestAttribution(manifest, manifest.id, 'en');
    expect(en?.title).toBe('Book of Hours');
    expect(en?.attributionLabel).toBe('Attribution');
    expect(en?.attribution).toBe('National Library');
    expect(en?.rights).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(en?.providers).toEqual([{ name: 'National Library', homepage: 'https://example.org/' }]);
    expect(en?.homepage).toEqual({ label: 'Catalogue record', href: 'https://example.org/item/1' });

    const cy = extractManifestAttribution(manifest, manifest.id, 'cy');
    expect(cy?.title).toBe('Llyfr Oriau');
    expect(cy?.attribution).toBe('Llyfrgell Genedlaethol');
  });

  it('extracts IIIF Presentation 2 attribution and license', () => {
    const manifest = {
      '@id': 'https://example.org/v2/manifest.json',
      '@type': 'sc:Manifest',
      label: 'Illuminated Leaf',
      attribution: 'Provided by <b>Archive</b>',
      license: 'https://creativecommons.org/publicdomain/mark/1.0/',
    };

    const parsed = extractManifestAttribution(manifest, manifest['@id'], 'en');
    expect(parsed?.title).toBe('Illuminated Leaf');
    expect(parsed?.attribution).toBe('Provided by Archive');
    expect(parsed?.rights).toBe('https://creativecommons.org/publicdomain/mark/1.0/');
  });

  it('resolves v2 @language arrays', () => {
    expect(
      resolveIiifText(
        [
          { '@language': 'en', '@value': 'Hello' },
          { '@language': 'fr', '@value': 'Bonjour' },
        ],
        'fr',
      ),
    ).toBe('Bonjour');
  });
});
