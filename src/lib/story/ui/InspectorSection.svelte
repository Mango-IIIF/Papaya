<script lang="ts">
  import { AlertCircle } from '@lucide/svelte';
  import type { ChapterTaskId, TaskAvailability, TaskStatus } from '../chapterTasks';
  import { t } from '../../core/i18n';

  /*
   * One section of the chapter inspector: a plain heading over its fields.
   *
   * The inspector is a form, not a checklist. A section does not report that
   * it is "configured" and does not fold away — what a chapter has is visible
   * in the fields themselves. The only thing a heading ever says about its
   * section is that something in it needs attention. A section that works on
   * the stage — drawing, narration, media timing — carries one control that
   * opens its tool, and Done in its place while the tool is open.
   */

  export let id: ChapterTaskId;
  export let title: string;
  export let status: TaskStatus | undefined = undefined;
  export let availability: TaskAvailability = { state: 'available' };
  /** Set for a stage tool: whether its tool is open on the stage right now. */
  export let active: boolean | undefined = undefined;
  export let onActivate: (() => void) | undefined = undefined;
  export let activateLabel = '';
  /** Closes the open tool, keeping its edits. Shown in place of Edit while active. */
  export let onDone: (() => void) | undefined = undefined;

  $: disabled = availability.state === 'disabled';
  $: attention = status?.completion === 'attention';
  $: bodyId = `inspector-section-${id}`;
</script>

{#if availability.state !== 'hidden'}
  <section
    class="inspector-section"
    class:inspector-section--active={active}
    class:inspector-section--disabled={disabled}
    class:inspector-section--attention={attention}
    data-task-id={id}
    data-testid={`inspector-section-${id}`}
    aria-labelledby={`${bodyId}-title`}
  >
    <div class="inspector-section__header">
      <h3 class="inspector-section__title" id={`${bodyId}-title`}>{title}</h3>
      {#if attention}
        <span
          class="inspector-section__attention"
          data-testid={`inspector-attention-${id}`}
        >
          <AlertCircle aria-hidden="true" />
          <span>{$t(status?.labelKey ?? 'storyBuilder.tasks.status.attention')}</span>
        </span>
      {/if}
      {#if onActivate && !active && !disabled}
        <button
          class="inspector-section__activate"
          type="button"
          data-testid={`inspector-activate-${id}`}
          on:click={() => onActivate?.()}
        >
          {activateLabel || $t('storyBuilder.inspector.edit')}
        </button>
      {:else if active && onDone}
        <button
          class="inspector-section__activate inspector-section__activate--done"
          type="button"
          data-testid={`inspector-done-${id}`}
          on:click={() => onDone?.()}
        >
          {$t('storyBuilder.inspector.done')}
        </button>
      {/if}
    </div>
    {#if disabled && availability.state === 'disabled'}
      <p class="inspector-section__unavailable">
        {availability.reason}
        {#if availability.action}<small>{availability.action}</small>{/if}
      </p>
    {:else}
      <div class="inspector-section__body" id={bodyId}>
        <slot />
      </div>
    {/if}
  </section>
{/if}

<style>
  /* Sections are separated by a rule, not boxed: the panel is one form. */
  .inspector-section {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding-block: 14px;
    border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
  }

  .inspector-section:first-child {
    padding-block-start: 2px;
    border-top: 0;
  }

  .inspector-section__header {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 30px;
    gap: 8px;
  }

  .inspector-section__title {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 600;
    color: var(--viewer-text, #e8edf4);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-section--disabled .inspector-section__title {
    color: var(--viewer-muted, #9aa6b2);
  }

  .inspector-section__attention {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 5px;
    font-size: 12px;
    color: var(--viewer-warning, #e8b85f);
    white-space: nowrap;
  }

  .inspector-section__attention :global(svg) {
    width: 14px;
    height: 14px;
  }

  .inspector-section__activate {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid var(--story-builder-accent, #2ac7ff);
    background: transparent;
    color: var(--story-builder-accent, #2ac7ff);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .inspector-section__activate:hover {
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 12%, transparent);
  }

  .inspector-section__activate:focus-visible {
    outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
    outline-offset: 1px;
  }

  .inspector-section__activate--done {
    border-color: transparent;
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .inspector-section__activate--done:hover {
    background: var(--story-builder-accent-hover, #5bd5ff);
  }

  .inspector-section__body {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .inspector-section__unavailable {
    display: grid;
    gap: 2px;
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--viewer-muted, #9aa6b2);
  }

  .inspector-section__unavailable small {
    font-size: 12px;
  }
</style>
