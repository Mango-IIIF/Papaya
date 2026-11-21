<script lang="ts">
  import { PanelLeft } from '@lucide/svelte';
  import MangoFooterBrand from '../ui/MangoFooterBrand.svelte';
  import { t } from '../../core/i18n';

  interface Props {
    title: string;
    dirty?: boolean;
    hasChapters?: boolean;
    chaptersOpen?: boolean;
    onUpdateTitle: (value: string) => void;
    onToggleChapters: () => void;
  }

  let {
    title,
    dirty = false,
    hasChapters = false,
    chaptersOpen = true,
    onUpdateTitle,
    onToggleChapters,
  }: Props = $props();
</script>

<div class="studio-titlebar" data-testid="studio-titlebar">
  <MangoFooterBrand position="inline" />

  {#if hasChapters}
    <button
      type="button"
      class="studio-titlebar__toggle"
      class:studio-titlebar__toggle--active={chaptersOpen}
      data-testid="studio-toggle-chapters"
      aria-pressed={chaptersOpen}
      aria-label={$t('storyBuilder.studio.toggleChapters')}
      title={$t('storyBuilder.studio.toggleChapters')}
      onclick={onToggleChapters}
    >
      <PanelLeft aria-hidden="true" />
    </button>
  {/if}

  <span class="viewer__title-divider" aria-hidden="true">|</span>

  <input
    type="text"
    class="studio-titlebar__input"
    data-testid="studio-title-input"
    aria-label={$t('storyBuilder.studio.titleAria')}
    placeholder={$t('storyBuilder.studio.titlePlaceholder')}
    value={title}
    oninput={(event) => onUpdateTitle((event.currentTarget as HTMLInputElement).value)}
  />

  {#if hasChapters}
    <span
      class="studio-titlebar__status"
      class:studio-titlebar__status--dirty={dirty}
      data-testid="studio-save-status"
      title={dirty ? $t('storyBuilder.studio.unsaved') : $t('storyBuilder.studio.saved')}
    >
      <i aria-hidden="true"></i>
      <span>{dirty ? $t('storyBuilder.studio.unsaved') : $t('storyBuilder.studio.saved')}</span>
    </span>
  {/if}
</div>

<style>
  .studio-titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .studio-titlebar__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
  }

  .studio-titlebar__toggle:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--viewer-text, #e8edf4);
  }

  .studio-titlebar__toggle--active {
    color: var(--viewer-text, #e8edf4);
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 8%, transparent);
  }

  .studio-titlebar__toggle :global(svg) {
    width: 16px;
    height: 16px;
  }

  .studio-titlebar__input {
    min-width: 80px;
    max-width: 210px;
    flex: 0 1 180px;
    height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    transition: background-color 140ms ease, border-color 140ms ease;
  }

  .studio-titlebar__input:hover {
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 5%, transparent);
  }

  .studio-titlebar__input:focus {
    outline: none;
    border-color: var(--story-builder-accent, #2ac7ff);
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.65));
  }

  .studio-titlebar__input::placeholder {
    color: var(--viewer-muted, #9aa6b2);
    font-weight: 500;
  }

  .studio-titlebar__status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 500;
    color: var(--viewer-muted, #9aa6b2);
    white-space: nowrap;
  }

  .studio-titlebar__status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34d399;
  }

  .studio-titlebar__status--dirty i {
    background: #f59e0b;
  }

  @media (max-width: 900px) {
    .studio-titlebar__status span {
      display: none;
    }
  }
</style>
