import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import StudioToolbar from '../StudioToolbar.svelte';
import StudioStageHud from '../StudioStageHud.svelte';
import StudioSettingsModal from '../StudioSettingsModal.svelte';

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
});
