<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { StoryPlugin, StoryPluginContext } from '../../core/types/story';
  import { translate } from '../../core/i18n';

  /**
   * Mounts one story plugin into the host's own layout.
   *
   * The markup matches the viewer's plugin panel, because the story UI styles
   * itself against those class names, but the context is the story one: the
   * builder needs the stage surfaces and story events the viewer does not have.
   */
  interface Props {
    plugin: StoryPlugin;
    context: Omit<StoryPluginContext, 'mount'>;
    overlay?: boolean;
  }

  let { plugin, context, overlay = false }: Props = $props();

  let container: HTMLDivElement | null = $state(null);
  let initPromise: Promise<void> | null = null;
  let mounted = false;
  let failed = false;

  const reportError = (phase: 'init' | 'destroy', key: string, cause: unknown) => {
    const message = translate(key, { label: plugin.label, id: plugin.id });
    console.error(message, cause);
    context.events.emit('pluginError', {
      pluginId: plugin.id,
      pluginLabel: plugin.label,
      phase,
      message,
      cause,
    });
  };

  onMount(() => {
    if (!container) return;
    mounted = true;
    try {
      const result = plugin.init({ ...context, mount: container });
      if (result && typeof (result as Promise<void>).then === 'function') {
        initPromise = (result as Promise<void>).catch((error) => {
          failed = true;
          reportError('init', 'plugins.errors.initialise', error);
        });
      }
    } catch (error) {
      failed = true;
      reportError('init', 'plugins.errors.initialise', error);
    }
  });

  onDestroy(() => {
    if (!mounted) return;
    const finalize = () => {
      try {
        plugin.destroy();
        container?.replaceChildren();
      } catch (error) {
        reportError('destroy', 'plugins.errors.cleanup', error);
      }
    };
    if (initPromise && !failed) void initPromise.finally(finalize);
    else finalize();
  });
</script>

<div
  class="plugin-panel"
  class:plugin-panel--overlay={overlay}
  style:pointer-events={overlay ? (plugin.pointerEvents ?? 'auto') : undefined}
>
  {#if overlay}
    <div class="plugin-panel__body" bind:this={container}></div>
  {:else}
    <div class="plugin-panel__panel">
      <div class="plugin-panel__title">{plugin.label}</div>
      <div class="plugin-panel__body" bind:this={container}></div>
    </div>
  {/if}
</div>

<style>
  .plugin-panel--overlay {
    pointer-events: auto;
  }

  .plugin-panel__panel {
    display: grid;
    gap: 8px;
    padding: 14px;
    border-radius: 18px;
    background: var(--viewer-panel, #121922);
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    font-size: 13px;
  }

  .plugin-panel__title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--viewer-muted, #9aa6b2);
  }

  .plugin-panel__body {
    color: var(--viewer-text, #e8edf4);
    line-height: 1.4;
  }
</style>
