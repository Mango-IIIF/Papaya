<script lang="ts">
  import type { Chapter, StoryState } from '../../core/types/story';
  import { t } from '../../core/i18n';

  interface Props {
    story: StoryState;
    chapter: Chapter;
    audioTrack: 'narration' | 'media';
    isAvChapter: boolean;
    isVideoChapter: boolean;
    language: string;
    languages: string[];
    onLanguageChange: (lang: string) => void;
    onSetNarrationTrack: (lang: string, src: string) => void;
    onSkipNarration: (lang: string) => void;
    onSelectAudioTrack: (track: 'narration' | 'media') => void;
  }

  let {
    story,
    chapter,
    audioTrack,
    isAvChapter,
    isVideoChapter,
    language,
    languages,
    onLanguageChange,
    onSetNarrationTrack,
    onSkipNarration,
    onSelectAudioTrack,
  }: Props = $props();

  const formatHms = (sec: number): string => {
    const whole = Math.max(0, Math.floor(sec));
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  let narrationSegment = $derived(chapter.narrationSegment?.[language] ?? null);
  let audioUrlDraft = $state('');
  let lastAudioSync = '';

  $effect(() => {
    const nextUrl = story.narration?.tracks?.[language]?.src ?? '';
    const key = `${language}:${nextUrl}`;
    if (key !== lastAudioSync) {
      lastAudioSync = key;
      audioUrlDraft = nextUrl;
    }
  });
</script>

<section class="studio-section" data-testid="studio-audio-panel">
  {#if isAvChapter}
    <div
      class="studio-segmented studio-segmented--full"
      role="tablist"
      aria-label={$t('storyBuilder.studio.audioTrackSwitchAria')}
    >
      <button
        type="button"
        role="tab"
        class:studio-segmented--active={audioTrack === 'narration'}
        aria-selected={audioTrack === 'narration'}
        data-testid="inspector-audio-tab-narration"
        onclick={() => onSelectAudioTrack('narration')}
      >
        {$t('storyBuilder.studio.narrationTab')}
      </button>
      <button
        type="button"
        role="tab"
        class:studio-segmented--active={audioTrack === 'media'}
        aria-selected={audioTrack === 'media'}
        data-testid="inspector-audio-tab-media"
        onclick={() => onSelectAudioTrack('media')}
      >
        {isVideoChapter
          ? $t('storyBuilder.studio.iiifVideoTab')
          : $t('storyBuilder.studio.iiifAudioTab')}
      </button>
    </div>
  {/if}

  {#if isAvChapter && audioTrack === 'media'}
    <div class="studio-section__head">
      <h3>{$t('storyBuilder.studio.sourceMediaTitle')}</h3>
    </div>

    <div class="studio-audio-summary" data-testid="studio-source-media-summary">
      {#if chapter.media && chapter.media.end > chapter.media.start}
        <strong>
          {$t('storyBuilder.inspector.mediaSummary', {
            start: formatHms(chapter.media.start),
            end: formatHms(chapter.media.end),
          })}
        </strong>
      {:else}
        <span>{$t('storyBuilder.inspector.mediaWhole')}</span>
      {/if}
    </div>

    <p class="studio-hint">{$t('storyBuilder.studio.sourceMediaHint')}</p>
  {:else}
    <div class="studio-section__head">
      <h3>{$t('storyBuilder.studio.audioTrackTitle')}</h3>
    </div>

    {#if languages.length > 1}
      <div class="studio-presets">
        {#each languages as lang}
          <button
            type="button"
            class="studio-chip"
            class:studio-chip--active={lang === language}
            onclick={() => onLanguageChange(lang)}
          >
            {lang.toUpperCase()}
          </button>
        {/each}
      </div>
    {/if}

    <label class="studio-field">
      <span>{$t('storyBuilder.narration.audioUrl')}</span>
      <input
        type="url"
        placeholder={$t('storyBuilder.settings.audioFileUrl')}
        bind:value={audioUrlDraft}
      />
    </label>

    <button
      type="button"
      class="studio-full-btn"
      onclick={() => onSetNarrationTrack(language, audioUrlDraft.trim())}
    >
      {$t('storyBuilder.settings.saveAudio')}
    </button>

    <div class="studio-audio-summary">
      {#if narrationSegment}
        <strong>
          {$t('storyBuilder.inspector.narrationSummary', {
            language: language.toUpperCase(),
            start: formatHms(narrationSegment.start),
            end: formatHms(narrationSegment.end),
          })}
        </strong>
        <button
          type="button"
          class="studio-chip"
          onclick={() => onSkipNarration(language)}
        >
          {$t('storyBuilder.narration.skip')}
        </button>
      {:else}
        <span>
          {$t('storyBuilder.inspector.narrationNone', {
            language: language.toUpperCase(),
          })}
        </span>
      {/if}
    </div>

    <p class="studio-hint">{$t('storyBuilder.studio.audioTrackHint')}</p>
  {/if}
</section>

<style>
  .studio-section {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .studio-section__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .studio-section__head h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .studio-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 9px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 3%, transparent);
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-chip:hover {
    color: var(--viewer-text, #e8edf4);
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 8%, transparent);
  }

  .studio-chip--active {
    border-color: var(--story-builder-accent, #2ac7ff);
    background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 14%, transparent);
    color: var(--story-builder-accent, #2ac7ff);
  }

  .studio-field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .studio-field span {
    font-size: 11px;
    font-weight: 600;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-field input {
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 7px;
    background: var(--viewer-input-bg, rgba(6, 10, 16, 0.6));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12.5px;
    box-sizing: border-box;
  }

  .studio-full-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    background: var(--viewer-toolbar-button-bg, rgba(255, 255, 255, 0.04));
    color: var(--viewer-text, #e8edf4);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-full-btn:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .studio-segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.12));
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
    box-sizing: border-box;
  }

  .studio-segmented button {
    height: 24px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted, #9aa6b2);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .studio-segmented .studio-segmented--active {
    background: var(--story-builder-accent, #2ac7ff);
    color: var(--story-builder-on-accent, #06141d);
  }

  .studio-audio-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
    font-size: 12px;
    color: var(--viewer-muted, #9aa6b2);
  }

  .studio-audio-summary strong {
    color: var(--viewer-text, #e8edf4);
    font-variant-numeric: tabular-nums;
  }

  .studio-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--viewer-muted, #9aa6b2);
  }
</style>
