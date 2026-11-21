<script lang="ts">
  import { Bold, Italic, Link2, List, Quote } from '@lucide/svelte';
  import { tick } from 'svelte';
  import { t } from '../../core/i18n';
  import LanguageTabs from '../annotations/LanguageTabs.svelte';
  import {
    applyMarkdownFormat,
    renderChapterRichText,
    type RichTextFormatAction,
  } from '../richText';

  /*
   * The chapter's words: which language is being written, and the title and
   * description in it. Rendered bare, as the body of the inspector's Details
   * section — the section owns the card and its heading.
   */

  export let activeLanguage = 'en';
  export let languages: string[] = ['en'];
  export let chapterTitleDraft = '';
  export let chapterDescriptionDraft = '';

  export let onLanguageChange: ((lang: string) => void) | undefined = undefined;
  export let onChapterTitleInput: ((event: Event) => void) | undefined = undefined;
  export let onChapterDescriptionInput: ((event: Event) => void) | undefined = undefined;

  let descriptionView: 'plain' | 'formatted' = 'plain';
  let descriptionEl: HTMLTextAreaElement | null = null;

  $: richPreviewHtml =
    descriptionView === 'formatted' ? renderChapterRichText(chapterDescriptionDraft) : '';

  const applyFormat = async (action: RichTextFormatAction) => {
    const start = descriptionEl?.selectionStart ?? chapterDescriptionDraft.length;
    const end = descriptionEl?.selectionEnd ?? chapterDescriptionDraft.length;
    const result = applyMarkdownFormat(chapterDescriptionDraft, start, end, action);
    chapterDescriptionDraft = result.value;
    if (descriptionEl) {
      descriptionEl.value = result.value;
      descriptionEl.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
      descriptionEl?.focus();
      descriptionEl?.setSelectionRange(result.selectionStart, result.selectionEnd);
    }
  };
</script>

<div class="chapter-text-form">
  <div class="chapter-overlay__field">
    <span class="chapter-overlay__section-title">{$t('storyBuilder.content.language')}</span>
    <LanguageTabs
      {languages}
      {activeLanguage}
      ariaLabel={$t('storyBuilder.content.language')}
      testIdPrefix="chapter-language"
      onchange={(lang) => onLanguageChange?.(lang)}
    />
  </div>

  <label class="chapter-overlay__label">
    {$t('storyBuilder.content.titleLabel')}
    <input
      class="chapter-overlay__input"
      type="text"
      data-testid="chapter-title"
      value={chapterTitleDraft}
      on:input={onChapterTitleInput}
    />
  </label>

  <div class="chapter-text-form__description">
    <div class="chapter-text-form__description-head">
      <label class="chapter-overlay__label" for="chapter-description-input">
        {$t('storyBuilder.content.descriptionLabel')}
      </label>
      <div
        class="chapter-text-form__view-toggle"
        role="group"
        aria-label={$t('storyBuilder.content.descriptionLabel')}
      >
        <button
          type="button"
          class:chapter-text-form__view-btn--active={descriptionView === 'plain'}
          aria-pressed={descriptionView === 'plain'}
          data-testid="chapter-description-view-plain"
          on:click={() => (descriptionView = 'plain')}
        >
          {$t('storyBuilder.content.plainView')}
        </button>
        <button
          type="button"
          class:chapter-text-form__view-btn--active={descriptionView === 'formatted'}
          aria-pressed={descriptionView === 'formatted'}
          data-testid="chapter-description-view-formatted"
          on:click={() => (descriptionView = 'formatted')}
        >
          {$t('storyBuilder.content.formattedView')}
        </button>
      </div>
    </div>

    {#if descriptionView === 'formatted'}
      <div
        class="chapter-text-form__toolbar"
        role="toolbar"
        data-testid="chapter-description-toolbar"
        aria-label={$t('storyBuilder.content.formattedView')}
      >
        <button
          type="button"
          title={$t('storyBuilder.content.formatBold')}
          aria-label={$t('storyBuilder.content.formatBold')}
          data-testid="format-bold"
          on:click={() => applyFormat('bold')}
        >
          <Bold aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('storyBuilder.content.formatItalic')}
          aria-label={$t('storyBuilder.content.formatItalic')}
          data-testid="format-italic"
          on:click={() => applyFormat('italic')}
        >
          <Italic aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('storyBuilder.content.formatLink')}
          aria-label={$t('storyBuilder.content.formatLink')}
          data-testid="format-link"
          on:click={() => applyFormat('link')}
        >
          <Link2 aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('storyBuilder.content.formatList')}
          aria-label={$t('storyBuilder.content.formatList')}
          data-testid="format-list"
          on:click={() => applyFormat('list')}
        >
          <List aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('storyBuilder.content.formatQuote')}
          aria-label={$t('storyBuilder.content.formatQuote')}
          data-testid="format-quote"
          on:click={() => applyFormat('quote')}
        >
          <Quote aria-hidden="true" />
        </button>
      </div>
    {/if}

    <textarea
      id="chapter-description-input"
      bind:this={descriptionEl}
      class="chapter-overlay__textarea"
      rows="3"
      data-testid="chapter-description"
      value={chapterDescriptionDraft}
      on:input={onChapterDescriptionInput}
    ></textarea>

    {#if descriptionView === 'formatted'}
      <div
        class="chapter-text-form__preview"
        data-testid="chapter-description-preview"
        aria-label={$t('storyBuilder.content.previewLabel')}
      >
        {#if richPreviewHtml}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html richPreviewHtml}
        {:else}
          <span class="chapter-text-form__preview-empty">
            {$t('storyBuilder.content.previewEmpty')}
          </span>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .chapter-text-form {
    display: grid;
    gap: 10px;
  }

  .chapter-text-form__description {
    display: grid;
    gap: 6px;
  }

  .chapter-text-form__description-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .chapter-text-form__view-toggle {
    display: inline-flex;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 7px;
    overflow: hidden;
  }

  .chapter-text-form__view-toggle button {
    border: 0;
    padding: 3px 8px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .chapter-text-form__view-toggle .chapter-text-form__view-btn--active {
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 16%, transparent);
    color: var(--viewer-text, #e8edf4);
  }

  .chapter-text-form__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chapter-text-form__toolbar button {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 7px;
    background: var(--viewer-panel-strong, #1b242e);
    color: var(--viewer-text, #e8edf4);
    cursor: pointer;
  }

  .chapter-text-form__toolbar button:hover {
    border-color: var(--story-builder-accent, #2ac7ff);
  }

  .chapter-text-form__toolbar button :global(svg) {
    width: 14px;
    height: 14px;
  }

  .chapter-text-form__preview {
    padding: 9px 11px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    background: var(--viewer-well-bg, rgba(5, 10, 16, 0.35));
    color: var(--viewer-text, #e8edf4);
    font-size: 13px;
    line-height: 1.5;
  }

  .chapter-text-form__preview :global(p) {
    margin: 0 0 6px;
  }

  .chapter-text-form__preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .chapter-text-form__preview :global(a) {
    color: var(--story-builder-accent, #2ac7ff);
    text-decoration: underline;
  }

  .chapter-text-form__preview :global(ul),
  .chapter-text-form__preview :global(ol) {
    margin: 0 0 6px;
    padding-left: 18px;
  }

  .chapter-text-form__preview :global(blockquote) {
    margin: 0 0 6px;
    padding: 3px 9px;
    border-left: 2px solid var(--story-builder-accent, #2ac7ff);
    color: var(--viewer-muted, #9aa6b2);
  }

  .chapter-text-form__preview-empty {
    color: var(--viewer-muted, #9aa6b2);
    font-size: 12px;
  }
</style>
