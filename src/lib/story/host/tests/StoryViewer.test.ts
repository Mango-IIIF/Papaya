import { describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import StoryViewer from '../StoryViewer.svelte';

const createTarget = (): HTMLDivElement => {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('StoryViewer', () => {
  it('renders only stage and story controls', async () => {
    const target = createTarget();

    const instance = mount(StoryViewer, { target, props: {} });

    await waitFor(() => Boolean(target.querySelector('[data-testid="story-controls-stage"]')));

    expect(target.querySelector('[data-testid="story-controls-stage"]')).toBeTruthy();
    expect(target.querySelector('[data-testid="story-stage"]')).toBeTruthy();
    expect(target.querySelector('.story-stage--fluid')).toBeNull();
    expect(target.querySelector('.viewer__top-row')).toBeTruthy();
    expect(target.querySelector('.stage__media--fill')).toBeTruthy();
    expect(target.querySelector('nav[aria-label="Story chapters"]')).toBeTruthy();
    expect(target.querySelector('.stage__toolbar')).toBeNull();
    expect(target.querySelector('.stage__counter')).toBeNull();
    expect(target.querySelector('.panel-stack')).toBeNull();
    expect(target.querySelector('.viewer__header')).toBeNull();

    unmount(instance);
    target.remove();
  });

  it('supports fluid fill framing via story.framingMode config', async () => {
    const target = createTarget();

    const instance = mount(StoryViewer, {
      target,
      props: { config: { story: { framingMode: 'fill' } } },
    });

    await waitFor(() => Boolean(target.querySelector('[data-testid="story-controls-stage"]')));
    expect(target.querySelector('.story-stage--fluid')).toBeTruthy();

    unmount(instance);
    target.remove();
  });

  it('switches languages in the reader when a story carries multiple languages', async () => {
    const target = createTarget();
    const multilingualStory = {
      '@context': [
        'http://www.w3.org/ns/anno.jsonld',
        'https://mangoviewer.dev/schema/story/1/context.json',
        'http://iiif.io/api/presentation/3/context.json',
      ],
      id: 'https://example.org/stories/multilingual',
      type: 'AnnotationPage',
      label: { en: ['English Story'], cy: ['Stori Gymraeg'] },
      items: [
        {
          id: 'https://example.org/stories/multilingual/annotation/1',
          type: 'Annotation',
          motivation: 'supplementing',
          label: { en: ['Opening'], cy: ['Agoriad'] },
          summary: { en: ['See **detail**'], cy: ['Gweler **manylion**'] },
          target: {
            source: 'https://example.org/canvas/1',
            type: 'SpecificResource',
            partOf: { id: 'https://example.org/manifest.json', type: 'Manifest' },
            selector: {
              type: 'FragmentSelector',
              conformsTo: 'http://www.w3.org/TR/media-frags/',
              value: 'xywh=0,0,100,100',
            },
          },
          body: {
            id: 'https://example.org/stories/multilingual/annotation/1/state',
            type: 'mango:ViewerState',
            format: 'application/vnd.mango.story-state+json',
            mangoState: { canvasIndex: 0, playback: { advance: 'manual' } },
          },
        },
      ],
    };

    const instance = mount(StoryViewer, {
      target,
      props: { story: multilingualStory },
    });

    await waitFor(() => Boolean(target.querySelector('[data-testid="story-viewer-language"] select')));
    const select = target.querySelector('[data-testid="story-viewer-language"] select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['en', 'cy']);
    expect(target.querySelector('.story-shell__title')?.textContent).toBe('Opening');
    expect(target.querySelector('[data-testid="story-shell-description"] strong')?.textContent).toBe('detail');

    select.value = 'cy';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => target.querySelector('.story-shell__title')?.textContent === 'Agoriad');
    expect(target.querySelector('[data-testid="story-shell-description"] strong')?.textContent).toBe('manylion');

    unmount(instance);
    target.remove();
  });

  it('embeds the viewer headless', async () => {
    const target = createTarget();

    const instance = mount(StoryViewer, { target, props: {} });

    await waitFor(() => Boolean(target.querySelector('.viewer--headless')));

    const embedded = target.querySelector('.viewer--headless');
    expect(embedded?.closest('.stage__presentation-frame')).toBeTruthy();
    expect(embedded?.querySelector('.viewer__top-row')).toBeNull();

    unmount(instance);
    target.remove();
  });
});
