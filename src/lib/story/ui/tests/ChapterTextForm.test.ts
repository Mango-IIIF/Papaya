import { describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import ChapterTextForm from '../ChapterTextForm.svelte';

describe('ChapterTextForm', () => {
  it('switches between plain and formatted views and applies markdown formatting', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onChapterDescriptionInput = vi.fn();

    const instance = mount(ChapterTextForm, {
      target,
      props: {
        activeLanguage: 'en',
        languages: ['en', 'cy'],
        chapterTitleDraft: 'Intro',
        chapterDescriptionDraft: 'A **bold** note',
        onChapterDescriptionInput,
      },
    });
    await tick();

    // Default plain view hides toolbar and preview.
    expect(target.querySelector('[data-testid="chapter-description-toolbar"]')).toBeNull();
    expect(target.querySelector('[data-testid="chapter-description-preview"]')).toBeNull();

    // Switch to formatted alternative view.
    (target.querySelector('[data-testid="chapter-description-view-formatted"]') as HTMLButtonElement).click();
    await tick();

    expect(target.querySelector('[data-testid="chapter-description-toolbar"]')).toBeTruthy();
    expect(target.querySelector('[data-testid="chapter-description-preview"] strong')?.textContent).toBe(
      'bold',
    );

    // Apply italic formatting on selection.
    const textarea = target.querySelector('[data-testid="chapter-description"]') as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 1);
    (target.querySelector('[data-testid="format-italic"]') as HTMLButtonElement).click();
    await tick();

    expect(onChapterDescriptionInput).toHaveBeenCalled();
    expect(textarea.value).toContain('*A*');

    unmount(instance);
    target.remove();
  });
});
