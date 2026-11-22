<script lang="ts">
  import { FolderOpen, Sparkles } from '@lucide/svelte';
  import { parseIiifResource } from '../manifestSources';
  import { t } from '../../core/i18n';

  interface Props {
    onLoadSingleManifest: (url: string) => void;
    onOpenSourcesWithUrl: (url?: string) => void;
  }

  let { onLoadSingleManifest, onOpenSourcesWithUrl }: Props = $props();

  let urlInput = $state('');
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    loading = true;
    errorMessage = null;
    try {
      const response = await fetch(trimmed);
      if (response.ok) {
        const json = await response.json();
        const parsed = parseIiifResource(json, trimmed);
        if (parsed?.kind === 'collection' || (parsed?.kind === 'manifest' && parsed.canvases.length > 1)) {
          loading = false;
          onOpenSourcesWithUrl(trimmed);
          return;
        }
      }
      onLoadSingleManifest(trimmed);
    } catch {
      // Fallback: let the viewer attempt to load it directly.
      onLoadSingleManifest(trimmed);
    } finally {
      loading = false;
    }
  };
</script>

<div class="studio-welcome" data-testid="studio-welcome">
  <div class="studio-welcome__card">
    <div class="studio-welcome__icon" aria-hidden="true">
      <Sparkles />
    </div>
    <h2>{$t('storyBuilder.studio.welcomeTitle')}</h2>
    <p>{$t('storyBuilder.studio.welcomeSubtitle')}</p>

    <form class="studio-welcome__form" onsubmit={handleSubmit}>
      <input
        type="url"
        data-testid="studio-welcome-url"
        aria-label={$t('storyBuilder.sources.urlLabel')}
        placeholder={$t('storyBuilder.studio.welcomePlaceholder')}
        bind:value={urlInput}
        disabled={loading}
      />
      <button
        type="submit"
        class="studio-welcome__submit"
        data-testid="studio-welcome-load"
        disabled={loading || !urlInput.trim()}
      >
        {$t('storyBuilder.studio.welcomeLoad')}
      </button>
    </form>

    {#if errorMessage}
      <p class="studio-welcome__error" role="alert">{errorMessage}</p>
    {/if}

    <button
      type="button"
      class="studio-welcome__browse"
      data-testid="studio-welcome-browse"
      onclick={() => onOpenSourcesWithUrl(urlInput.trim() || undefined)}
    >
      <FolderOpen aria-hidden="true" />
      <span>{$t('storyBuilder.studio.welcomeBrowse')}</span>
    </button>
  </div>
</div>

<style>
  .studio-welcome {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    padding: 24px;
    background: radial-gradient(
      circle at 50% 35%,
      rgba(42, 199, 255, 0.08),
      var(--viewer-stage, #090d13) 65%
    );
  }

  .studio-welcome__card {
    display: grid;
    justify-items: center;
    gap: 12px;
    width: min(500px, 100%);
    padding: 32px 28px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    background: var(--viewer-panel, #111720);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    color: var(--viewer-text, #e8edf4);
    text-align: center;
  }

  .studio-welcome__icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 16%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-welcome__icon :global(svg) {
    width: 22px;
    height: 22px;
  }

  .studio-welcome__card h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .studio-welcome__card p {
    margin: 0;
    max-width: 38ch;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-welcome__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    width: 100%;
    margin-top: 6px;
  }

  .studio-welcome__form input {
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.16));
    border-radius: 9px;
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.65));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 13px;
    min-width: 0;
  }

  .studio-welcome__form input:focus {
    outline: none;
    border-color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-welcome__submit {
    height: 38px;
    padding: 0 18px;
    border: 0;
    border-radius: 9px;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .studio-welcome__submit:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .studio-welcome__browse {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-welcome__browse:hover {
    color: var(--viewer-text, #e8edf4);
    background: rgba(255, 255, 255, 0.06);
  }

  .studio-welcome__browse :global(svg) {
    width: 14px;
    height: 14px;
  }

  .studio-welcome__error {
    color: #fca5a5 !important;
    font-size: 12px !important;
  }
</style>
