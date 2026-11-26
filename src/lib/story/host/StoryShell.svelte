<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { Expand, Shrink } from '@lucide/svelte';
  import {
    createViewerFullscreenController,
    isIPadLikeDevice,
    resolveViewerTheme,
  } from '@mango-iiif/iiif-viewer/core';
  import '@mango-iiif/iiif-viewer/themes.css';
  import { t } from '../../core/i18n';

  /**
   * The frame both story hosts share: the themed root, the title row and the
   * fullscreen control. Canonical `--viewer-*` tokens come from Mango's
   * `@mango-iiif/iiif-viewer/themes.css`; only story-specific `--story-*`
   * palette tokens are defined here.
   */
  interface Props {
    variant: 'viewer' | 'builder';
    theme?: string;
    root?: HTMLDivElement | null;
    title?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    variant,
    theme = 'dark',
    root = $bindable(null),
    title = undefined,
    actions = undefined,
    children = undefined,
  }: Props = $props();

  let resolvedTheme = $derived(resolveViewerTheme(theme));
  let isFullscreen = $state(false);
  let isFullscreenFallback = $state(false);

  const getShadowHost = (): Element | null => {
    const node = root?.getRootNode();
    return node instanceof ShadowRoot ? node.host : null;
  };

  const fullscreen = createViewerFullscreenController({
    getRoot: () => root,
    getShadowHost,
    preferFallback: () => typeof navigator !== 'undefined' && isIPadLikeDevice(navigator),
    /* The chapter rail scrolls sideways under a finger, even in fullscreen. */
    allowTouch: (target) => target.classList.contains('story-shell__footer'),
    onChange: ({ active, fallback }) => {
      isFullscreen = active;
      isFullscreenFallback = fallback;
    },
  });

  onMount(() => fullscreen.attach());
</script>

<div
  class="viewer"
  class:viewer--story-viewer={variant === 'viewer'}
  class:viewer--story-builder={variant === 'builder'}
  class:viewer--fullscreen-fallback={isFullscreenFallback}
  data-theme={resolvedTheme}
  aria-live="polite"
  bind:this={root}
>
  <div class="viewer__top-row">
    <div class="viewer__top-title">
      {@render title?.()}
    </div>

    <div class="viewer__top-actions">
      {@render actions?.()}

      <button
        type="button"
        class="viewer__fullscreen-btn viewer__fullscreen-btn--labelled"
        onclick={() => fullscreen.toggle()}
        aria-label={isFullscreen
          ? $t('viewer.stage.controls.closeFullscreen')
          : $t('viewer.stage.controls.enterFullscreen')}
        title={isFullscreen
          ? $t('viewer.stage.controls.closeFullscreen')
          : $t('viewer.stage.controls.enterFullscreen')}
      >
        {#if isFullscreen}
          <Shrink aria-hidden="true" />
        {:else}
          <Expand aria-hidden="true" />
        {/if}
        <span>
          {isFullscreen
            ? $t('viewer.stage.controls.closeFullscreen')
            : $t('viewer.stage.controls.fullscreen')}
        </span>
      </button>
    </div>
  </div>

  {@render children?.()}
</div>

<style>
  .viewer__top-row {
    display: flex;
    align-items: flex-start;
    min-width: 0;
    gap: 12px;
  }

  .viewer__top-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .viewer__top-title :global(.viewer__title-divider) {
    color: var(--viewer-muted, rgba(255, 255, 255, 0.35));
    font-size: 14px;
    font-weight: 300;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }

  .viewer__top-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    gap: 10px;
  }

  .viewer__fullscreen-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: var(--viewer-chrome-radius);
    background: var(--viewer-panel);
    color: var(--viewer-text);
    width: 34px;
    height: 34px;
    cursor: pointer;
    z-index: 10;
    line-height: 1;
    font-size: 16px;
  }

  .viewer__fullscreen-btn--labelled {
    width: auto;
    padding-inline: 10px;
    border-color: transparent;
    background: transparent;
    font-size: 13px;
  }

  .viewer__fullscreen-btn :global(svg) {
    width: 18px;
    height: 18px;
  }

  .viewer {
    /*
     * Story chrome runs its own palette rather than reusing `--viewer-accent`:
     * the story viewer is a presentation surface with its own identity, and the
     * two accents are deliberately different in the default theme. Every theme
     * below restates this block, so a story never inherits a palette that was
     * only contrast-checked against viewer chrome. Base `--viewer-*` tokens
     * come from `@mango-iiif/iiif-viewer/themes.css`.
     */
    --story-shell-bg: linear-gradient(180deg, #10161e 0%, #0b1118 100%);
    --story-line: rgba(255, 255, 255, 0.14);
    --story-text: #edf5ff;
    --story-muted: #d8dee9;
    --story-accent: #9a57ff;
    --story-accent-2: #4bc6ff;
    --story-accent-text: #be8dff;
    --story-accent-text-hover: #d8bcff;
    --story-control-bg: rgba(8, 17, 32, 0.6);
    --story-control-border: rgba(255, 255, 255, 0.24);
    --story-control-hover-bg: rgba(255, 255, 255, 0.12);
    --story-track-bg: rgba(255, 255, 255, 0.2);
    --story-track-border: rgba(255, 255, 255, 0.15);
    --story-active-ring: rgba(64, 171, 245, 0.84);
    --story-active-halo: rgba(227, 240, 255, 0.42);
    --story-error: #ffb3c1;
    --story-note-bg: rgba(255, 255, 255, 0.92);
    --story-note-text: #2b2520;
    --story-label-bg: rgba(20, 16, 12, 0.82);
    --story-label-text: #ffffff;
    /* The family accent: Mango's `--viewer-accent-2` and Lychee's editor
       accent on the dark theme. `--story-builder-on-accent` is the label
       colour that reads on a solid fill of it; every theme states the pair. */
    --story-builder-accent: #2ac7ff;
    --story-builder-accent-hover: #5bd5ff;
    --story-builder-on-accent: #06141d;

    display: grid;
    grid-template-rows: auto 1fr;
    gap: 16px;
    box-sizing: border-box;
    height: 100%;
    max-height: none;
    min-height: 0;
    overflow: hidden;
    padding: 20px;
    border-width: 1px;
    border-style: solid;
    border-radius: var(--viewer-chrome-radius);
    font-family: sans-serif;
    /* Shadow DOM blocks selector leakage, but inherited text properties still
       cross the host boundary. Keep host typography and bidi choices from
       silently rewriting viewer labels or rearranging time values. */
    font-style: normal;
    font-variant: normal;
    font-size: 16px;
    font-weight: 400;
    line-height: normal;
    letter-spacing: normal;
    word-spacing: normal;
    word-break: normal;
    overflow-wrap: normal;
    white-space: normal;
    text-align: left;
    text-indent: 0;
    text-transform: none;
    direction: var(--mango-viewer-direction, ltr);
    box-shadow: var(--viewer-frame-shadow, none);
    container-type: size;
    container-name: mango-viewer;
    position: relative;
  }

  .viewer:fullscreen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    min-height: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  .viewer.viewer--story-builder {
    min-height: 0;
    gap: 12px;
    padding: 14px;
  }

  .viewer--story-builder .viewer__top-row {
    align-items: center;
  }

  .viewer--story-builder .viewer__top-title {
    display: none;
  }

  .viewer--story-builder .viewer__top-actions {
    flex: 1 1 auto;
  }

  .viewer--story-builder .viewer__top-actions :global(.plugin-slot) {
    flex: 1 1 auto;
  }

  .viewer--story-builder .viewer__top-actions :global(.plugin-panel__panel) {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .viewer--story-builder .viewer__top-actions :global(.plugin-panel__title) {
    display: none;
  }

  .viewer.viewer--story-viewer {
    --story-shell-radius: var(--viewer-chrome-radius);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    padding: 0;
    border: 0;
    border-radius: var(--story-shell-radius);
    background: var(--viewer-surface);
  }

  .viewer--story-viewer .viewer__top-row {
    position: relative;
    z-index: 12;
    align-items: center;
    min-height: 56px;
    padding: 10px 12px;
    box-sizing: border-box;
    background: var(--viewer-surface);
    border-bottom: 1px solid var(--viewer-panel-border);
  }

  .viewer--story-viewer .viewer__top-title {
    display: flex;
    align-items: center;
    gap: 10px;
    overflow: hidden;
    color: var(--viewer-text);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
  }

  .viewer--story-viewer .viewer__top-title :global(span:last-child) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .viewer--story-viewer .viewer__fullscreen-btn {
    width: auto;
    height: 36px;
  }

  .viewer:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    min-height: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  .viewer.viewer--fullscreen-fallback {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    min-height: 0;
    border: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  .viewer--story-viewer:fullscreen,
  .viewer--story-viewer:-webkit-full-screen,
  .viewer--story-viewer.viewer--fullscreen-fallback {
    --story-shell-radius: 0;
  }

  .viewer:fullscreen::backdrop {
    background: #0b0f14;
  }

  .viewer[data-theme='light'] {
    --story-shell-bg: linear-gradient(180deg, #ffffff 0%, #eaf0f8 100%);
    --story-line: rgba(34, 48, 65, 0.14);
    --story-text: #1d2a3a;
    --story-muted: #56677d;
    --story-accent: #6d3bd4;
    --story-accent-2: #1f8fc4;
    --story-accent-text: #5a2fbd;
    --story-accent-text-hover: #43219a;
    --story-control-bg: rgba(255, 255, 255, 0.88);
    --story-control-border: rgba(34, 48, 65, 0.22);
    --story-control-hover-bg: rgba(109, 59, 212, 0.12);
    --story-track-bg: rgba(34, 48, 65, 0.14);
    --story-track-border: rgba(34, 48, 65, 0.12);
    --story-active-ring: rgba(31, 143, 196, 0.72);
    --story-active-halo: rgba(34, 48, 65, 0.24);
    --story-error: #b3243c;
    --story-note-bg: rgba(255, 255, 255, 0.95);
    --story-note-text: #1d2a3a;
    --story-label-bg: rgba(29, 42, 58, 0.86);
    --story-label-text: #ffffff;
    --story-builder-accent: #b4551f;
    --story-builder-accent-hover: #93430f;
    --story-builder-on-accent: #ffffff;
  }

  .viewer[data-theme='sepia'] {
    --story-shell-bg: linear-gradient(180deg, #f9f3e7 0%, #e8dbc2 100%);
    --story-line: rgba(76, 58, 35, 0.18);
    --story-text: #3d3023;
    --story-muted: #6b5a44;
    --story-accent: #a8562a;
    --story-accent-2: #2f858b;
    --story-accent-text: #8d451f;
    --story-accent-text-hover: #6d3415;
    --story-control-bg: rgba(255, 250, 240, 0.9);
    --story-control-border: rgba(76, 58, 35, 0.24);
    --story-control-hover-bg: rgba(168, 86, 42, 0.14);
    --story-track-bg: rgba(76, 58, 35, 0.16);
    --story-track-border: rgba(76, 58, 35, 0.14);
    --story-active-ring: rgba(47, 133, 139, 0.74);
    --story-active-halo: rgba(76, 58, 35, 0.26);
    --story-error: #a32b26;
    --story-note-bg: rgba(255, 250, 240, 0.95);
    --story-note-text: #3d3023;
    --story-label-bg: rgba(61, 48, 35, 0.86);
    --story-label-text: #fffaf0;
    --story-builder-accent: #a8562a;
    --story-builder-accent-hover: #8a4319;
    --story-builder-on-accent: #ffffff;
  }

  .viewer[data-theme='midnight'] {
    --story-shell-bg: linear-gradient(180deg, #0b1b30 0%, #040c18 100%);
    --story-line: rgba(126, 180, 235, 0.18);
    --story-text: #edf6ff;
    --story-muted: #a8bdd6;
    --story-accent: #a78bfa;
    --story-accent-2: #38bdf8;
    --story-accent-text: #c4b1ff;
    --story-accent-text-hover: #ddd0ff;
    --story-control-bg: rgba(5, 15, 28, 0.72);
    --story-control-border: rgba(126, 180, 235, 0.28);
    --story-control-hover-bg: rgba(126, 180, 235, 0.14);
    --story-track-bg: rgba(126, 180, 235, 0.2);
    --story-track-border: rgba(126, 180, 235, 0.16);
    --story-active-ring: rgba(56, 189, 248, 0.82);
    --story-active-halo: rgba(199, 226, 255, 0.4);
    --story-error: #ff9db0;
    /*
     * Deep rather than bright: these accents are button fills carrying white
     * labels, so the fill has to stay dark enough to clear 4.5:1 against white.
     * A lighter orange reads better against the midnight panel but drops the
     * label to ~2.4:1.
     */
    --story-builder-accent: #c2410c;
    --story-builder-accent-hover: #d4550f;
    --story-builder-on-accent: #ffffff;
  }

  @container mango-viewer (max-width: 1024px) {
    .viewer {
      min-height: 0;
      max-height: 100%;
      height: 100%;
      overflow: hidden;
      padding: 12px;
      border-radius: var(--viewer-chrome-radius);
      gap: 10px;
    }
    .viewer.viewer--story-viewer {
      gap: 0;
      padding: 0;
    }
    .viewer.viewer--story-builder {
      height: 100%;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
    }
    .viewer--story-builder .viewer__top-row {
      flex-wrap: wrap;
    }
    .viewer--story-builder .viewer__top-actions {
      width: 100%;
    }
  }

  @container mango-viewer (max-width: 700px) {
    .viewer.viewer--story-builder {
      height: 100%;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
    }
    .viewer--story-builder .viewer__top-actions {
      min-width: 0;
      justify-content: flex-start;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }
    .viewer--story-builder .viewer__top-actions::-webkit-scrollbar {
      display: none;
    }
    .viewer--story-builder .viewer__fullscreen-btn {
      width: 40px;
      min-width: 40px;
      height: 40px;
      padding: 0;
      flex: 0 0 40px;
    }
    .viewer--story-builder .viewer__fullscreen-btn span {
      display: none;
    }
  }

  /*
     * Element-relative, not viewport-relative: these two rules used to be
     * `@media (max-width: 1024px)`, which is wrong for an embedded element whose
     * width is decided by the host page rather than the window.
     */
  @container mango-viewer (max-width: 1024px) {
    .viewer.viewer--story-builder {
      height: 100%;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
    }
  }

  @keyframes viewer-slidein-left {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }

  @keyframes viewer-slidein-right {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
</style>
