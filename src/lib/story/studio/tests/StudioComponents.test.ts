import { mount, tick, unmount } from 'svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import type { Chapter, StoryState } from '../../../core/types/story';
import StudioToolbar from '../StudioToolbar.svelte';
import StudioStageHud from '../StudioStageHud.svelte';
import StudioSettingsModal from '../StudioSettingsModal.svelte';
import StudioBottomDock from '../StudioBottomDock.svelte';
import StudioInspector from '../StudioInspector.svelte';

describe('Studio UI components', () => {
  it('switches between Frame, Annotate, and Audio modes in StudioToolbar', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onSelectMode = vi.fn();
    const onTogglePreview = vi.fn();
    const onOpenSettings = vi.fn();
    const onExport = vi.fn();

    const instance = mount(StudioToolbar, {
      target,
      props: {
        mode: 'frame',
        hasChapters: true,
        canAnnotate: true,
        annotationCount: 2,
        canUndo: true,
        canRedo: false,
        isPreviewing: false,
        inspectorOpen: true,
        onSelectMode,
        onUndo: vi.fn(),
        onRedo: vi.fn(),
        onTogglePreview,
        onOpenSettings,
        onExport,
        onToggleInspector: vi.fn(),
      },
    });
    await tick();

    target.querySelector<HTMLButtonElement>('[data-testid="studio-mode-annotate"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-mode-audio"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-settings"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-export"]')?.click();

    expect(onSelectMode).toHaveBeenNthCalledWith(1, 'annotate');
    expect(onSelectMode).toHaveBeenNthCalledWith(2, 'audio');
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
    expect(target.querySelector('.studio-toolbar__badge')?.textContent).toBe('2');

    unmount(instance);
    target.remove();
  });

  it('shows Save view / Add shot / Reset pill in StudioStageHud when view is moved', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onSaveView = vi.fn();
    const onAddShot = vi.fn();
    const onResetView = vi.fn();

    const instance = mount(StudioStageHud, {
      target,
      props: {
        mode: 'frame',
        isPreviewing: false,
        viewModified: true,
        selectedShotNumber: null,
        canAddShot: true,
        annotationTool: 'select',
        chapterCard: {
          index: 0,
          total: 3,
          title: 'Chapter 1',
          descriptionHtml: '<p>Hello world</p>',
        },
        onSaveView,
        onAddShot,
        onResetView,
        onSelectAnnotationTool: vi.fn(),
        onDoneAnnotating: vi.fn(),
      },
    });
    await tick();

    expect(target.querySelector('[data-testid="studio-story-card"]')?.textContent).toContain(
      'Chapter 1',
    );
    target.querySelector<HTMLButtonElement>('[data-testid="studio-hide-card"]')?.click();
    await tick();
    expect(target.querySelector('[data-testid="studio-story-card"]')).toBeNull();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-show-card"]')?.click();
    await tick();
    expect(target.querySelector('[data-testid="studio-story-card"]')).not.toBeNull();

    target.querySelector<HTMLButtonElement>('[data-testid="studio-save-view"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-hud-add-shot"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-reset-view"]')?.click();

    expect(onSaveView).toHaveBeenCalledOnce();
    expect(onAddShot).toHaveBeenCalledOnce();
    expect(onResetView).toHaveBeenCalledOnce();

    unmount(instance);
    target.remove();
  });

  it('lets authors pick a story frame shape in StudioSettingsModal', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onUpdateAspect = vi.fn();

    const instance = mount(StudioSettingsModal, {
      target,
      props: {
        open: true,
        story: { chapters: [], presentationAspect: 16 / 9 },
        onClose: vi.fn(),
        onUpdateAspect,
        onUpdateIdentifiers: vi.fn(),
      },
    });
    await tick();

    target.querySelector<HTMLButtonElement>('[data-testid="story-aspect-4:3"]')?.click();
    expect(onUpdateAspect).toHaveBeenCalledWith(4 / 3);

    unmount(instance);
    target.remove();
  });

  it('scales narration waveform proportionally on long durations and extends timeline via +5s', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onUpdateMotionDuration = vi.fn();

    const chapter: Chapter = {
      id: 'ch-1',
      manifest: 'https://example.org/manifest.json',
      canvas: 'https://example.org/canvas/1',
      viewBox: { x: 0, y: 0, w: 1000, h: 1000 },
      narrationSegment: { en: { start: 0, end: 16 } },
      cameraTrack: {
        durationMs: 228_000,
        preset: 'zoom-in',
        keyframes: [
          { id: 'k1', timeMs: 0, viewBox: { x: 0, y: 0, w: 1000, h: 1000 } },
          { id: 'k2', timeMs: 228_000, viewBox: { x: 250, y: 250, w: 500, h: 500 } },
        ],
      },
    };
    const story: StoryState = {
      chapters: [chapter],
      narration: { tracks: { en: { src: '' } } },
    };

    const instance = mount(StudioBottomDock, {
      target,
      props: {
        mode: 'frame',
        audioTrack: 'narration',
        storyStore: writable(story),
        story,
        selectedChapterIdStore: writable(chapter.id),
        chapter,
        language: 'en',
        languages: ['en'],
        mediaTypeStore: writable('image'),
        mediaType: 'image',
        mediaSourcesStore: writable([]),
        mediaMarksStore: writable({ start: null, end: null }),
        avMarksValidStore: writable(false),
        selectedPointId: null,
        motionPreviewing: false,
        onSelectAudioTrack: vi.fn(),
        onOpenAudioTrack: vi.fn(),
        onSaveView: vi.fn(),
        onAddShot: vi.fn(),
        onGoToShot: vi.fn(),
        onSelectShot: vi.fn(),
        onMoveShotTime: vi.fn(),
        onEvenSpaceShots: vi.fn(),
        onScrubTo: vi.fn(),
        onPreviewMotion: vi.fn(),
        onStopMotionPreview: vi.fn(),
        onUpdateMotionDuration,
        onPreviewChapter: vi.fn(),
        onSetNarrationTrack: vi.fn(),
        onAssignNarrationSegment: vi.fn(),
        onSkipNarration: vi.fn(),
        onAssignMediaSegment: vi.fn(),
        onPreviewMediaSegment: vi.fn(),
        onStopPreviewMediaSegment: vi.fn(),
      },
    });
    await tick();

    const narrationClip = target.querySelector<HTMLElement>(
      '[data-testid="camera-timeline-narration-clip"]',
    );
    expect(narrationClip).not.toBeNull();
    const widthPct = parseFloat(narrationClip?.style.width ?? '0');
    // 16s / 228s ≈ 7.02% — must NOT stretch to 100%.
    expect(widthPct).toBeGreaterThan(6.5);
    expect(widthPct).toBeLessThan(7.5);

    const timeText = target
      .querySelector('[data-testid="camera-timeline-time"]')
      ?.textContent?.trim();
    expect(timeText).toBe('0:00.0 / 3:48.0');

    target.querySelector<HTMLButtonElement>('[data-testid="camera-timeline-extend"]')?.click();
    expect(onUpdateMotionDuration).toHaveBeenCalledWith(233_000);

    unmount(instance);
    target.remove();
  });

  it('shows a clear silent-chapter hint in StudioBottomDock when there is no narration', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const chapter: Chapter = {
      id: 'ch-silent',
      manifest: 'https://example.org/manifest.json',
      canvas: 'https://example.org/canvas/1',
      viewBox: { x: 0, y: 0, w: 1000, h: 1000 },
      cameraTrack: {
        durationMs: 10_000,
        preset: 'pan',
        keyframes: [
          { id: 'k1', timeMs: 0, viewBox: { x: 0, y: 0, w: 1000, h: 1000 } },
          { id: 'k2', timeMs: 10_000, viewBox: { x: 200, y: 200, w: 600, h: 600 } },
        ],
      },
    };
    const story: StoryState = { chapters: [chapter] };

    const instance = mount(StudioBottomDock, {
      target,
      props: {
        mode: 'frame',
        audioTrack: 'narration',
        storyStore: writable(story),
        story,
        selectedChapterIdStore: writable(chapter.id),
        chapter,
        language: 'en',
        languages: ['en'],
        mediaTypeStore: writable('image'),
        mediaType: 'image',
        mediaSourcesStore: writable([]),
        mediaMarksStore: writable({ start: null, end: null }),
        avMarksValidStore: writable(false),
        selectedPointId: null,
        motionPreviewing: false,
        onSelectAudioTrack: vi.fn(),
        onOpenAudioTrack: vi.fn(),
        onSaveView: vi.fn(),
        onAddShot: vi.fn(),
        onGoToShot: vi.fn(),
        onSelectShot: vi.fn(),
        onMoveShotTime: vi.fn(),
        onEvenSpaceShots: vi.fn(),
        onScrubTo: vi.fn(),
        onPreviewMotion: vi.fn(),
        onStopMotionPreview: vi.fn(),
        onUpdateMotionDuration: vi.fn(),
        onPreviewChapter: vi.fn(),
        onSetNarrationTrack: vi.fn(),
        onAssignNarrationSegment: vi.fn(),
        onSkipNarration: vi.fn(),
        onAssignMediaSegment: vi.fn(),
        onPreviewMediaSegment: vi.fn(),
        onStopPreviewMediaSegment: vi.fn(),
      },
    });
    await tick();

    expect(
      target.querySelector('[data-testid="camera-timeline-narration-clip"]'),
    ).toBeNull();
    expect(
      target.querySelector('[data-testid="camera-timeline-silent-hint"]'),
    ).not.toBeNull();

    unmount(instance);
    target.remove();
  });

  it('renders canvas and zoom viewer controls at the top of StudioInspector', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onPrevCanvas = vi.fn();
    const onNextCanvas = vi.fn();
    const onZoomOut = vi.fn();
    const onZoomIn = vi.fn();
    const onGoHome = vi.fn();

    const chapter: Chapter = {
      id: 'ch-1',
      manifest: 'https://example.org/manifest.json',
      canvas: 'https://example.org/canvas/2',
      viewBox: { x: 0, y: 0, w: 1000, h: 1000 },
    };
    const story: StoryState = { chapters: [chapter] };

    const instance = mount(StudioInspector, {
      target,
      props: {
        mode: 'frame',
        audioTrack: 'narration',
        storyStore: writable(story),
        story,
        chapter,
        chapterIndex: 0,
        language: 'en',
        languages: ['en'],
        mediaType: 'image',
        layers: [],
        layerOpacities: {},
        selectedPointId: null,
        selectedAnnotationIdStore: writable(null),
        selectedAnnotationId: null,
        viewerCanvasIndex: 1,
        viewerCanvasCount: 5,
        viewerZoomPercent: 145,
        onPrevCanvas,
        onNextCanvas,
        onZoomOut,
        onZoomIn,
        onGoHome,
        onLanguageChange: vi.fn(),
        onOpenSources: vi.fn(),
        onUpdateTitle: vi.fn(),
        onUpdateDescription: vi.fn(),
        onApplyPreset: vi.fn(),
        onClearMotion: vi.fn(),
        onAddShot: vi.fn(),
        onGoToShot: vi.fn(),
        onSelectShot: vi.fn(),
        onUpdateShotFromView: vi.fn(),
        onReorderShot: vi.fn(),
        onDeleteShot: vi.fn(),
        onUpdateMotionDuration: vi.fn(),
        onUpdateMotionPathType: vi.fn(),
        onUpdateMotionDwell: vi.fn(),
        onUpdateMotionEasing: vi.fn(),
        onEvenSpaceShots: vi.fn(),
        onUpdateAdvanceMode: vi.fn(),
        onUpdateDelay: vi.fn(),
        onUpdateLayerOpacity: vi.fn(),
        onEditAnnotation: vi.fn(),
        onFinishAnnotationEdit: vi.fn(),
        onDeleteAnnotation: vi.fn(),
        onSetAnnotationLabel: vi.fn(),
        onSetAnnotationStyle: vi.fn(),
        onSetNarrationTrack: vi.fn(),
        onSkipNarration: vi.fn(),
        onSelectAudioTrack: vi.fn(),
      },
    });
    await tick();

    expect(
      target.querySelector('[data-testid="studio-viewer-page"]')?.textContent?.trim(),
    ).toBe('2 / 5');
    expect(
      target.querySelector('[data-testid="studio-viewer-zoom"]')?.textContent?.trim(),
    ).toBe('145%');

    target.querySelector<HTMLButtonElement>('[data-testid="studio-viewer-prev"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-viewer-next"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-viewer-zoom-out"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-viewer-zoom-in"]')?.click();
    target.querySelector<HTMLButtonElement>('[data-testid="studio-viewer-home"]')?.click();

    expect(onPrevCanvas).toHaveBeenCalledOnce();
    expect(onNextCanvas).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onGoHome).toHaveBeenCalledOnce();

    unmount(instance);
    target.remove();
  });
});
