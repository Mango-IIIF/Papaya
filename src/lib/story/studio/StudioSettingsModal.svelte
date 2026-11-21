<script lang="ts">
  import { Check, X } from '@lucide/svelte';
  import type { StoryState } from '../../core/types/story';
  import { resolvePresentationAspect } from '../framing';
  import { t } from '../../core/i18n';

  interface Props {
    open: boolean;
    story: StoryState;
    onClose: () => void;
    onUpdateAspect: (aspect: number) => void;
    onUpdateIdentifiers: (id: string, annotationBase: string) => void;
  }

  let {
    open,
    story,
    onClose,
    onUpdateAspect,
    onUpdateIdentifiers,
  }: Props = $props();

  const ASPECT_PRESETS: Array<{ label: string; value: number }> = [
    { label: '16:9', value: 16 / 9 },
    { label: '3:2', value: 3 / 2 },
    { label: '4:3', value: 4 / 3 },
    { label: '1:1', value: 1 },
    { label: '9:16', value: 9 / 16 },
  ];

  let activeAspect = $derived(resolvePresentationAspect(story));
  let idDraft = $state('');
  let baseDraft = $state('');
  let wasOpen = false;

  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      idDraft = story.publication?.id ?? '';
      baseDraft = story.publication?.annotationBase ?? '';
    } else if (!open && wasOpen) {
      wasOpen = false;
    }
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && event.key === 'Escape') onClose();
  }}
/>

{#if open}
  <div class="studio-modal" data-testid="studio-settings-modal">
    <button
      type="button"
      class="studio-modal__scrim"
      tabindex="-1"
      aria-label={$t('common.close')}
      onclick={onClose}
    ></button>

    <div
      class="studio-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-settings-title"
    >
      <header class="studio-modal__header">
        <div>
          <h2 id="studio-settings-title">{$t('storyBuilder.studio.settingsTitle')}</h2>
          <p>{$t('storyBuilder.studio.settingsSubtitle')}</p>
        </div>
        <button
          type="button"
          class="studio-modal__close"
          aria-label={$t('common.close')}
          onclick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="studio-modal__body">
        <section class="studio-modal__section">
          <h3>{$t('storyBuilder.settings.presentationAspect')}</h3>
          <p class="studio-modal__hint">{$t('storyBuilder.settings.presentationAspectHint')}</p>
          <div class="studio-modal__aspects" role="group" aria-label={$t('storyBuilder.settings.presentationAspect')}>
            {#each ASPECT_PRESETS as preset}
              {@const selected = Math.abs(activeAspect - preset.value) / preset.value < 0.04}
              <button
                type="button"
                class="studio-modal__aspect"
                class:studio-modal__aspect--active={selected}
                aria-pressed={selected}
                data-testid={`story-aspect-${preset.label}`}
                onclick={() => onUpdateAspect(preset.value)}
              >
                <span
                  class="studio-modal__aspect-preview"
                  style={`aspect-ratio: ${preset.value}`}
                ></span>
                <b>{preset.label}</b>
              </button>
            {/each}
          </div>
        </section>

        <section class="studio-modal__section">
          <h3>{$t('storyBuilder.settings.identifiers')}</h3>
          <p class="studio-modal__hint">
            {$t('storyBuilder.settings.identifiersHint')}
          </p>

          <label class="studio-modal__field">
            <span>{$t('storyBuilder.settings.annotationPageId')}</span>
            <input
              type="url"
              placeholder={$t('storyBuilder.studio.welcomePlaceholder')}
              bind:value={idDraft}
            />
          </label>

          <label class="studio-modal__field">
            <span>{$t('storyBuilder.settings.annotationBase')}</span>
            <input
              type="url"
              placeholder={$t('storyBuilder.settings.annotationBasePlaceholder')}
              bind:value={baseDraft}
            />
          </label>

          <button
            type="button"
            class="studio-modal__save"
            onclick={() => onUpdateIdentifiers(idDraft.trim(), baseDraft.trim())}
          >
            <Check aria-hidden="true" />
            <span>{$t('storyBuilder.settings.saveIdentifiers')}</span>
          </button>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .studio-modal {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .studio-modal__scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(3, 7, 12, 0.7);
    backdrop-filter: blur(4px);
    cursor: pointer;
  }

  .studio-modal__panel {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(520px, 100%);
    max-height: min(620px, 90%);
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 14px;
    background: var(--viewer-panel, #111720);
    color: var(--viewer-text, #e8edf4);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.52);
    overflow: hidden;
  }

  .studio-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  .studio-modal__header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }

  .studio-modal__header p {
    margin: 3px 0 0;
    font-size: 12px;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-modal__close {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .studio-modal__close :global(svg) {
    width: 16px;
    height: 16px;
  }

  .studio-modal__body {
    display: grid;
    gap: 20px;
    padding: 18px;
    overflow-y: auto;
  }

  .studio-modal__section {
    display: grid;
    gap: 10px;
  }

  .studio-modal__section h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
  }

  .studio-modal__hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-modal__aspects {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .studio-modal__aspect {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 7px;
    padding: 10px 6px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 3%, transparent);
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }

  .studio-modal__aspect:hover {
    color: var(--viewer-text, #e8edf4);
    border-color: color-mix(in srgb, var(--viewer-text, #e8edf4) 30%, transparent);
  }

  .studio-modal__aspect--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 14%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-modal__aspect-preview {
    display: block;
    max-width: 28px;
    max-height: 22px;
    min-width: 12px;
    min-height: 12px;
    width: 100%;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }

  .studio-modal__field {
    display: grid;
    gap: 5px;
  }

  .studio-modal__field span {
    font-size: 11px;
    font-weight: 600;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-modal__field input {
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.65));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12.5px;
  }

  .studio-modal__save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 14px;
    border: 0;
    border-radius: 8px;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
    font: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    justify-self: start;
  }

  .studio-modal__save :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
