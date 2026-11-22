import { describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { writable } from 'svelte/store';
import StorySourcesModal from '../StorySourcesModal.svelte';
import type { StoryState } from '../../../core/types/story';

describe('StorySourcesModal', () => {
  it('lists story manifests, browses canvases, and emits add/replace actions', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const manifestUrl = 'https://example.org/manifest.json';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: manifestUrl,
        type: 'Manifest',
        label: { en: ['Demo Manuscript'] },
        items: [
          { id: 'https://example.org/canvas/1', type: 'Canvas', label: { en: ['Folio 1'] } },
          { id: 'https://example.org/canvas/2', type: 'Canvas', label: { en: ['Folio 2'] } },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const story = writable<StoryState>({
      chapters: [
        {
          id: 'ch-1',
          manifest: manifestUrl,
          canvasIndex: 0,
        },
      ],
    });
    const onSelectSourceCanvas = vi.fn();
    const onClose = vi.fn();

    const instance = mount(StorySourcesModal, {
      target,
      props: {
        story,
        open: true,
        currentManifest: manifestUrl,
        hasSelectedChapter: true,
        onSelectSourceCanvas,
        onClose,
      },
    });

    await tick();
    await new Promise((r) => setTimeout(r, 10));
    await tick();

    expect(target.querySelectorAll('[data-testid="story-source-chip"]')).toHaveLength(1);
    expect(target.querySelector('[data-testid="source-canvas-1"]')).toBeTruthy();

    (target.querySelector('[data-testid="source-canvas-add-1"]') as HTMLButtonElement).click();
    expect(onSelectSourceCanvas).toHaveBeenCalledWith(manifestUrl, 1, 'add');
    expect(onClose).toHaveBeenCalled();

    unmount(instance);
    target.remove();
    vi.unstubAllGlobals();
  });
});
