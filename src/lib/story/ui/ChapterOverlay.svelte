<script lang="ts">
  import { ChevronDown, FolderOpen, Play, Square } from "@lucide/svelte";
  import { readable, writable, type Readable } from "svelte/store";
  import { manifestsStore } from "@mango-iiif/iiif-viewer/core";
  import {
    type ChapterAdvance,
    type ChapterDrawingAnnotation,
    type StoryState,
  } from "../../core/types/story";
  import type { ViewBox } from "@mango-iiif/iiif-viewer/core";
  import type { MediaType, MediaSource } from "@mango-iiif/iiif-viewer/core";
  import { resolveIiifText } from "../manifestAttribution";
  import ChapterTextForm from "./ChapterTextForm.svelte";
  import ChapterPositionSection from "./ChapterPositionSection.svelte";
  import ChapterCameraConfig from "./ChapterCameraConfig.svelte";
  import InspectorSection from "./InspectorSection.svelte";
  import StoryBuilderWideAnnotations from "./StoryBuilderWideAnnotations.svelte";
  import StoryBuilderWideAnnotationOptions from "./StoryBuilderWideAnnotationOptions.svelte";
  import {
    evaluateChapterTasks,
    isStageTool,
    type ChapterTaskEvaluation,
    type ChapterTaskId,
  } from "../chapterTasks";
  import { resolvePresentationAspect } from "../framing";
  import { applyFrameField } from "../frameGeometry";
  import { t } from '../../core/i18n';

  export let story: Readable<StoryState>;
  export let layers: MediaSource[] = [];
  export let layerOpacities: Record<string, number> = {};
  export let onUpdateLayerOpacity:
    ((id: string, opacity: number) => void) | undefined = undefined;

  let manifestSupportsLayers = false;
  /* Comparison authoring remains implemented but is not ready to expose in
     Chapter tools yet. Keep this gate local so the section can be restored
     without removing its task evaluation or UI implementation. */
  const SHOW_COMPARISON_TOOL = false;
  $: manifestSupportsLayers =
    layers.length > 1 && layers.every((src) => src.type === "image");

  export let open = false;
  export let docked = false;
  export let chapterId: string | null = null;
  export let activeChapterTask: Readable<ChapterTaskId | null> = readable(null);
  export let validationErrors: string[] = [];
  export let mediaType: Readable<MediaType | null>;
  export let transitionDelayDefaultMs = 2000;
  export let language = "en";
  export let languages: string[] = ["en"];
  export let currentManifest: string | null = null;
  export let onClose: (() => void) | undefined;
  export let onOpenSources: (() => void) | undefined = undefined;
  export let onSetAnnotationLanguage: ((lang: string) => void) | undefined;
  export let onUpdateManifest:
    ((chapterId: string, manifest: string) => void) | undefined;
  export let onLoadManifest: ((manifest: string) => void) | undefined;
  export let onCreateChapter: (() => void) | undefined;
  export let onReloadManifest:
    | ((chapterId: string, manifest: string, canvasIndex: number) => void)
    | undefined;
  export let onUpdateChapterTitle:
    ((chapterId: string, lang: string, value: string) => void) | undefined;
  export let onUpdateChapterDescription:
    ((chapterId: string, lang: string, value: string) => void) | undefined;
  export let onUpdateAdvanceMode:
    ((chapterId: string, mode: ChapterAdvance["mode"]) => void) | undefined;
  export let onUpdateDelay:
    ((chapterId: string, delayMs?: number) => void) | undefined;
  export let onSetChapterPosition:
    ((chapterId: string, viewBox: ViewBox) => void) | undefined = undefined;
  /* Drawn annotations, edited here while the annotation tool is open. */
  export let selectedAnnotationId: Readable<string | null> = readable(null);
  export let onEditAnnotation: ((annotationId: string) => void) | undefined = undefined;
  export let onFinishAnnotationEdit: (() => void) | undefined = undefined;
  export let onDeleteAnnotation: ((annotationId: string) => void) | undefined = undefined;
  export let onSetAnnotationLabel:
    ((annotationId: string, language: string, value: string) => void) | undefined = undefined;
  export let onSetAnnotationStyle:
    | ((
        annotationId: string,
        style: {
          color?: string | null;
          strokeWidth?: "thin" | "medium" | "thick";
          fillMode?: ChapterDrawingAnnotation["fillMode"];
          motivation?: ChapterDrawingAnnotation["motivation"] | null;
        },
      ) => void)
    | undefined = undefined;
  export let storyPreviewing: Readable<boolean> = readable(false);
  export let onPreviewChapter: ((chapterId: string) => void) | undefined =
    undefined;
  export let onStopChapterPreview: (() => void) | undefined = undefined;
  export let onRevertChapterPosition: ((chapterId: string) => void) | undefined;
  export let onSave: (() => void) | undefined;
  export let onCancel: (() => void) | undefined;
  /** Re-reads the chapter from the viewer after its source or canvas changed. */
  export let onChapterTaskChange:
    ((task: ChapterTaskId | null) => void) | undefined = undefined;

  /* The annotation list and options take the chapter as a store. */
  const chapterIdStore = writable<string | null>(chapterId);
  $: chapterIdStore.set(chapterId);
  $: annotationSelected = Boolean(
    $selectedAnnotationId &&
      chapter?.drawingAnnotations?.some(
        (annotation) => annotation.id === $selectedAnnotationId,
      ),
  );
  /* A second click on the selected annotation lets go of it. */
  const toggleAnnotation = (annotationId: string) => {
    if ($selectedAnnotationId === annotationId) onFinishAnnotationEdit?.();
    else onEditAnnotation?.(annotationId);
  };

  let activeLanguage = language;
  let lastLanguageProp = language;
  let chapter: StoryState["chapters"][number] | null = null;
  let chapterValidationErrors: string[] = [];
  let chapterTitleDraft = "";

  let chapterDescriptionDraft = "";
  let chapterTitleDrafts: Record<string, string> = {};
  let chapterDescriptionDrafts: Record<string, string> = {};
  let manifestDraft = "";
  let advanceModeDraft: ChapterAdvance["mode"] = "manual";
  let delayDraft: number | undefined = undefined;
  let lastChapterId: string | null = null;
  let lastCurrentManifest: string | null = null;
  let mediaTypeValue: MediaType | null = null;
  let taskEvaluations: ChapterTaskEvaluation[] = [];
  let chapterIndex = -1;
  let chapterHasSavedPosition = false;

  /*
   * Exact by design. This keys "has the stored framing changed at all", which
   * decides whether to overwrite the author's in-progress form entry — a
   * tolerance here would silently discard a small manual edit. Use
   * `framingsWithin` when the question is whether the viewer has arrived
   * somewhere.
   */
  const positionSignature = (value: ViewBox | null | undefined): string =>
    value ? `${value.x}:${value.y}:${value.w}:${value.h}` : "";

  /*
   * One inspector, one form, no tabs. This panel is the chapter's words: its
   * title and description, its annotations, its narration, stacked in the
   * order an author writes them. What is set once or rarely (the transition,
   * the source, layers, the frame as typed numbers) sits behind More. The
   * sections that need the stage to themselves — drawing, narration, media
   * timing — open their tool in place.
   *
   * What acts on the image is not here. The frame and camera motion are both
   * set from the bar under the image, where the view being taken is.
   */
  const MORE_TASKS: ReadonlySet<ChapterTaskId> = new Set<ChapterTaskId>([
    "position",
    "transition-timing",
    "source",
    "layers",
    "comparison",
  ]);
  let moreOpen = false;
  /*
   * Keyed for the template. A lookup function would hide the dependency on
   * `taskEvaluations` from the compiler, and a section rendered before the
   * viewer had settled on a media type would never learn that it had.
   */
  let evaluations: Partial<Record<ChapterTaskId, ChapterTaskEvaluation>> = {};
  $: evaluations = Object.fromEntries(
    taskEvaluations.map((evaluation) => [evaluation.id, evaluation]),
  ) as Partial<Record<ChapterTaskId, ChapterTaskEvaluation>>;
  const evaluationFor = (task: ChapterTaskId): ChapterTaskEvaluation | undefined =>
    evaluations[task];

  const activateTool = (task: ChapterTaskId) => {
    if (evaluationFor(task)?.availability.state !== "available") return;
    onChapterTaskChange?.(task);
  };

  /** Closes whatever tool is open on the stage, keeping its edits. */
  const finishTool = () => {
    handleSave();
  };

  /* The inspector follows an open tool to its section, so a tool started
     from elsewhere (the annotation list, say) is never out of sight. */
  let followedTask: ChapterTaskId | null = null;
  $: {
    const task = $activeChapterTask;
    if (task && task !== followedTask) {
      followedTask = task;
      if (MORE_TASKS.has(task)) moreOpen = true;
    } else if (!task) {
      followedTask = null;
    }
  }

  let inspectorChapterId: string | null = null;
  $: if (chapterId !== inspectorChapterId) {
    inspectorChapterId = chapterId;
    onChapterTaskChange?.(null);
  }

  /* A problem in a section behind More must not stay hidden behind it. */
  $: if (
    taskEvaluations.some(
      (evaluation) =>
        MORE_TASKS.has(evaluation.id) &&
        evaluation.availability.state === "available" &&
        evaluation.status.completion === "attention",
    )
  ) {
    moreOpen = true;
  }

  let delayMs: number | undefined;
  let lastActiveLanguage = activeLanguage;

  let positionDrafts: { x: string; y: string; w: string; h: string } = {
    x: "",
    y: "",
    w: "",
    h: "",
  };
  let lastPositionSyncKey = "";
  let positionSectionAvailable = false;

  const formatPositionValue = (value: number | undefined): string =>
    value === undefined || !Number.isFinite(value)
      ? ""
      : String(Math.round(value));

  const positionDraftsFromViewBox = (
    value: ViewBox | undefined,
  ): { x: string; y: string; w: string; h: string } => ({
    x: formatPositionValue(value?.x),
    y: formatPositionValue(value?.y),
    w: formatPositionValue(value?.w),
    h: formatPositionValue(value?.h),
  });

  /*
   * A typed width or height pulls the other dimension along as the author
   * types, so the pair on screen always describes a frame the story can hold.
   * The frame's shape is locked to the story's presentation aspect; the
   * readout says so rather than quietly rewriting numbers on commit.
   */
  const handlePositionFieldInput = (
    field: "x" | "y" | "w" | "h",
    value: string,
  ) => {
    const next = { ...positionDrafts, [field]: value };
    const numeric = Number(value);
    if (
      presentationAspect &&
      value.trim() !== "" &&
      Number.isFinite(numeric) &&
      numeric > 0
    ) {
      if (field === "w") next.h = formatPositionValue(numeric / presentationAspect);
      if (field === "h") next.w = formatPositionValue(numeric * presentationAspect);
    }
    positionDrafts = next;
  };

  const commitPositionField = (field: "x" | "y" | "w" | "h") => {
    if (!chapterId || !chapter) return;
    const drafts = positionDrafts;
    const value = Number(drafts[field]);
    const valid =
      drafts[field].trim() !== "" &&
      Number.isFinite(value) &&
      (field === "x" || field === "y" || value > 0);
    if (!valid) {
      if (chapter.viewBox) {
        positionDrafts = positionDraftsFromViewBox(chapter.viewBox);
      }
      return;
    }
    if (chapter.viewBox) {
      const next = applyFrameField(
        chapter.viewBox,
        field,
        value,
        presentationAspect ?? Number.NaN,
      );
      if (positionSignature(next) === positionSignature(chapter.viewBox)) return;
      onSetChapterPosition?.(chapterId, next);
      return;
    }
    // No frame yet: the chapter needs all four numbers before it has one.
    const parsed = {
      x: Number(drafts.x),
      y: Number(drafts.y),
      w: Number(drafts.w),
      h: Number(drafts.h),
    };
    if (
      [drafts.x, drafts.y, drafts.w, drafts.h].every((entry) => entry.trim() !== "") &&
      [parsed.x, parsed.y, parsed.w, parsed.h].every(Number.isFinite) &&
      parsed.w > 0 &&
      parsed.h > 0
    ) {
      onSetChapterPosition?.(chapterId, parsed);
    }
  };

  $: if (language !== lastLanguageProp) {
    lastLanguageProp = language;
    activeLanguage = language;
    onSetAnnotationLanguage?.(language);
  }

  $: if (activeLanguage !== lastActiveLanguage) {
    const activeChapter = $story.chapters.find((item) => item.id === chapterId);
    const nextTitle =
      activeChapter?.title?.[activeLanguage] ??
      chapterTitleDrafts[activeLanguage] ??
      "";
    const nextDescription =
      activeChapter?.description?.[activeLanguage] ??
      chapterDescriptionDrafts[activeLanguage] ??
      "";

    chapterTitleDraft = nextTitle;
    chapterDescriptionDraft = nextDescription;
    chapterTitleDrafts[activeLanguage] = nextTitle;
    chapterDescriptionDrafts[activeLanguage] = nextDescription;

    lastActiveLanguage = activeLanguage;
    onSetAnnotationLanguage?.(activeLanguage);
  }

  const formatHms = (value: number | null | undefined): string => {
    if (!Number.isFinite(value ?? NaN)) return "";
    const total = Math.max(0, Math.floor(value as number));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  };

  $: chapter = $story.chapters.find((item) => item.id === chapterId) ?? null;
  $: presentationAspect =
    $story.chapters.length > 0 || $story.presentationAspect
      ? resolvePresentationAspect($story)
      : null;
  $: chapterHasSavedPosition = Boolean(chapter?.viewBox);
  $: {
    const positionSyncKey = `${chapterId ?? ""}:${positionSignature(chapter?.viewBox)}`;
    if (positionSyncKey !== lastPositionSyncKey) {
      lastPositionSyncKey = positionSyncKey;
      positionDrafts = positionDraftsFromViewBox(chapter?.viewBox);
    }
  }
  $: positionSectionAvailable =
    Boolean(chapter) &&
    mediaTypeValue !== "audio" &&
    mediaTypeValue !== "video" &&
    mediaTypeValue !== "model" &&
    !chapter?.model;
  $: {
    chapterIndex = $story.chapters.findIndex((item) => item.id === chapterId);
    const prefix = `Chapter ${chapterIndex + 1}:`;
    chapterValidationErrors =
      chapterIndex >= 0
        ? validationErrors
            .filter((message) => message.startsWith(prefix))
            .map((message) => message.slice(prefix.length).trim())
        : validationErrors.filter((message) => message.startsWith("Story:"));
  }

  $: if (chapterId !== lastChapterId) {
    lastChapterId = chapterId;
    manifestDraft = chapter?.manifest ?? "";

    chapterTitleDrafts = {};
    if (chapter?.title) {
      for (const [lang, value] of Object.entries(chapter.title)) {
        chapterTitleDrafts[lang] = value ?? "";
      }
    }

    chapterDescriptionDrafts = {};
    if (chapter?.description) {
      for (const [lang, value] of Object.entries(chapter.description)) {
        chapterDescriptionDrafts[lang] = value ?? "";
      }
    }

    chapterTitleDraft = chapterTitleDrafts[activeLanguage] ?? "";
    chapterDescriptionDraft = chapterDescriptionDrafts[activeLanguage] ?? "";

    advanceModeDraft = chapter?.advance?.mode ?? "auto";
    delayDraft =
      chapter?.advance?.mode === "manual"
        ? undefined
        : (chapter?.advance?.delayMs ?? transitionDelayDefaultMs);

    if (!chapter && currentManifest && manifestDraft.trim() === "") {
      manifestDraft = currentManifest;
      lastCurrentManifest = currentManifest;
    }

  }

  $: if (chapter && chapterId === lastChapterId) {
    const nextManifest = chapter.manifest ?? "";
    if (manifestDraft !== nextManifest) {
      manifestDraft = nextManifest;
    }

    const nextTitle = chapter.title?.[activeLanguage] ?? "";
    if (chapterTitleDraft !== nextTitle) {
      chapterTitleDraft = nextTitle;
    }
    chapterTitleDrafts[activeLanguage] = nextTitle;

    const nextDescription = chapter.description?.[activeLanguage] ?? "";
    if (chapterDescriptionDraft !== nextDescription) {
      chapterDescriptionDraft = nextDescription;
    }
    chapterDescriptionDrafts[activeLanguage] = nextDescription;

    const nextAdvanceMode = chapter.advance?.mode ?? "auto";
    if (advanceModeDraft !== nextAdvanceMode) {
      advanceModeDraft = nextAdvanceMode;
    }

    const nextDelay =
      chapter.advance?.mode === "manual"
        ? undefined
        : (chapter.advance?.delayMs ?? transitionDelayDefaultMs);
    if (delayDraft !== nextDelay) {
      delayDraft = nextDelay;
    }
  }

  $: if (
    !chapter &&
    currentManifest &&
    currentManifest !== lastCurrentManifest
  ) {
    if (manifestDraft.trim() === "" || manifestDraft === lastCurrentManifest) {
      manifestDraft = currentManifest;
      lastCurrentManifest = currentManifest;
    }
  }

  $: if (!chapter) {
    chapterTitleDraft = chapterTitleDrafts[activeLanguage] ?? "";
    chapterDescriptionDraft = chapterDescriptionDrafts[activeLanguage] ?? "";
  }

  $: delayMs = delayDraft;

  const handleManifestInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    manifestDraft = value;
    if (chapterId) {
      onUpdateManifest?.(chapterId, value);
    }
  };

  const handleReload = () => {
    if (!manifestDraft.trim()) return;
    if (!chapterId || !chapter) {
      onLoadManifest?.(manifestDraft);
      return;
    }
    onReloadManifest?.(chapterId, manifestDraft, chapter.canvasIndex);
  };

  const handleChapterTitleInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    chapterTitleDraft = value;
    chapterTitleDrafts[activeLanguage] = value;
    if (chapterId) {
      onUpdateChapterTitle?.(chapterId, activeLanguage, value);
    }
  };

  const handleChapterDescriptionInput = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;
    chapterDescriptionDraft = value;
    chapterDescriptionDrafts[activeLanguage] = value;
    if (chapterId) {
      onUpdateChapterDescription?.(chapterId, activeLanguage, value);
    }
  };

  const handleDelaySecondsChange = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    const seconds = value === "" ? undefined : Number(value);
    const ms =
      seconds === undefined || !Number.isFinite(seconds)
        ? undefined
        : (seconds as number) * 1000;
    delayDraft = ms;
    advanceModeDraft = delayDraft !== undefined ? "auto" : "manual";
    if (chapterId) {
      onUpdateAdvanceMode?.(chapterId, advanceModeDraft);
      onUpdateDelay?.(chapterId, ms);
    }
  };

  /* Every field saves as it is typed, so finishing a tool only closes it. */
  const handleSave = () => {
    if (!chapterId || !chapter) return;
    onSave?.();
  };

  const handleRevertView = () => {
    if (chapterId) onRevertChapterPosition?.(chapterId);
  };

  const handleChapterPreview = () => {
    if ($storyPreviewing) {
      onStopChapterPreview?.();
      return;
    }
    if (chapterId) onPreviewChapter?.(chapterId);
  };

  $: mediaTypeValue = $mediaType;
  $: taskEvaluations = chapter
    ? evaluateChapterTasks({
        story: $story,
        chapter,
        chapterIndex,
        mediaType: mediaTypeValue,
        layers,
        loadedSources: layers,
        validationErrors: chapterValidationErrors,
        languages,
      })
    : [];
  /*
   * One line each for the stage tools while they are closed, so the inspector
   * says what a chapter has without the tool having to be opened to find out.
   */
  $: narrationSummary = (() => {
    const segment = chapter?.narrationSegment?.[activeLanguage];
    if (!segment || !(segment.end > segment.start)) {
      return $t('storyBuilder.inspector.narrationNone', {
        language: activeLanguage.toUpperCase(),
      });
    }
    return $t('storyBuilder.inspector.narrationSummary', {
      language: activeLanguage.toUpperCase(),
      start: formatHms(segment.start),
      end: formatHms(segment.end),
    });
  })();
  $: annotationCount = chapter?.drawingAnnotations?.length ?? 0;
  $: chapterSourceTitle = (() => {
    if (!chapter?.manifest) return '';
    const json = $manifestsStore[chapter.manifest]?.json as Record<string, unknown> | undefined;
    const resolved = json ? resolveIiifText(json.label, activeLanguage) : '';
    if (resolved) return resolved;
    try {
      const parsed = new URL(chapter.manifest);
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.slice(-2).join('/') || parsed.hostname;
    } catch {
      return chapter.manifest;
    }
  })();
  $: mediaSummary = chapter?.media
    ? $t('storyBuilder.inspector.mediaSummary', {
        start: formatHms(chapter.media.start),
        end: formatHms(chapter.media.end),
      })
    : $t('storyBuilder.inspector.mediaWhole');

  const handleLanguageChange = (value: string) => {
    activeLanguage = value;
    onSetAnnotationLanguage?.(value);
  };
</script>

<svelte:window
  on:keydown={(event) => {
    if (!open || event.key !== "Escape") return;
    const task = $activeChapterTask;
    if (task && isStageTool(task)) {
      // Drawing is a transaction; leaving it by Escape discards, as Cancel does.
      if (task === "focus") onCancel?.();
      else onChapterTaskChange?.(null);
      return;
    }
    onClose?.();
  }}
/>

<div
  class="chapter-overlay"
  class:chapter-overlay--docked={docked}
  class:chapter-overlay--annotation-task={$activeChapterTask === "focus"}
  data-testid="chapter-overlay"
  aria-hidden={!open}
  hidden={!open}
>
  {#if !docked}
    <div
      class="chapter-overlay__scrim"
      role="button"
      tabindex="0"
      aria-label={$t('storyBuilder.overlay.closeMetadata')}
      on:click={() => onClose?.()}
      on:keydown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClose?.();
      }}
    ></div>
  {/if}

  <div
    class="chapter-overlay__panel"
    role={docked ? "region" : "dialog"}
    aria-modal="false"
    aria-labelledby="chapter-overlay-title"
  >
    <div class="chapter-overlay__header">
      {#if !docked}
        <button
          class="chapter-overlay__back"
          type="button"
          data-testid="chapter-overlay-back"
          on:click={() => onClose?.()}
        >
          {$t('common.back')}
        </button>
      {/if}
      <div>
        <div class="chapter-overlay__eyebrow">
          {chapterIndex >= 0
            ? $t('storyBuilder.chapters.number', { number: chapterIndex + 1 })
            : chapter
              ? $t('storyBuilder.overlay.selectedChapter')
              : $t('storyBuilder.overlay.newStory')}
        </div>
        <div class="chapter-overlay__title" id="chapter-overlay-title">
          {chapter
            ? chapterTitleDraft.trim() || $t('storyBuilder.tasks.title')
            : $t('storyBuilder.overlay.loadSource')}
        </div>
        {#if chapter && chapterSourceTitle && $activeChapterTask !== "focus"}
          <div class="chapter-overlay__source-context" data-testid="chapter-source-context">
            <span title={chapter.manifest}>
              {chapterSourceTitle} · {$t('storyBuilder.sources.canvasNumber', { number: chapter.canvasIndex + 1 })}
            </span>
            {#if onOpenSources}
              <button
                type="button"
                class="chapter-overlay__source-change"
                data-testid="chapter-change-source"
                on:click={() => onOpenSources?.()}
              >
                <FolderOpen aria-hidden="true" />
                <span>{$t('storyBuilder.sources.changeSource')}</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
      {#if chapter && $activeChapterTask !== "focus"}
        <button
          class="chapter-overlay__preview-chapter"
          type="button"
          data-testid="chapter-preview"
          on:click={handleChapterPreview}
        >
          {#if $storyPreviewing}
            <Square aria-hidden="true" />
          {:else}
            <Play aria-hidden="true" />
          {/if}
          <span>
            <strong>
              {$storyPreviewing
                ? $t('storyBuilder.overlay.stopChapterPreview')
                : $t('storyBuilder.overlay.previewChapter')}
            </strong>
            <small>
              {$storyPreviewing
                ? $t('storyBuilder.overlay.chapterPreviewPlaying')
                : $t('storyBuilder.overlay.previewChapterHint')}
            </small>
          </span>
        </button>
      {/if}
      {#if !docked}
        <button
          class="chapter-overlay__close"
          type="button"
          data-testid="chapter-overlay-close"
          on:click={() => onClose?.()}
          aria-label={$t('common.close')}
        >
          {$t('common.closeGlyph')}
        </button>
      {/if}
    </div>

    <form class="chapter-overlay__form" on:submit|preventDefault>
      {#if chapterValidationErrors.length > 0}
        <div class="chapter-overlay__validation" role="alert">
          <strong>{$t('storyBuilder.tasks.status.attention')}</strong>
          <ul>
            {#each chapterValidationErrors as message}
              <li>{message}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if !chapter}
        <div class="chapter-overlay__body">
          <div class="chapter-overlay__empty-source">
            <p class="chapter-overlay__hint">
              {$t('storyBuilder.overlay.sourceHint')}
            </p>
            <ChapterCameraConfig
              chapterExists={false}
              chapterCanvasIndex={0}
              {manifestDraft}
              sourceLoaded={Boolean(
                currentManifest && currentManifest === manifestDraft.trim(),
              )}
              onManifestInput={handleManifestInput}
              onReloadManifest={() => handleReload()}
              {onCreateChapter}
            />
          </div>
        </div>
      {:else}
        <div class="chapter-overlay__body chapter-inspector__sections">
            {#if $activeChapterTask !== "focus"}
            <InspectorSection
              id="details"
              title={$t('storyBuilder.tasks.items.details.title')}
              status={evaluations["details"]?.status}
              availability={evaluations["details"]?.availability ?? { state: "available" }}
            >
              <ChapterTextForm
                {activeLanguage}
                {languages}
                {chapterTitleDraft}
                {chapterDescriptionDraft}
                onLanguageChange={handleLanguageChange}
                onChapterTitleInput={handleChapterTitleInput}
                onChapterDescriptionInput={handleChapterDescriptionInput}
              />
            </InspectorSection>

            {/if}

            <InspectorSection
              id="focus"
              title={$t('storyBuilder.tasks.items.focus.title')}
              status={evaluations["focus"]?.status}
              availability={evaluations["focus"]?.availability ?? { state: "available" }}
              active={$activeChapterTask === "focus"}
              activateLabel={$t('storyBuilder.inspector.open')}
              onActivate={() => activateTool("focus")}
              onDone={finishTool}
            >
              {#if $activeChapterTask === "focus"}
                <StoryBuilderWideAnnotations
                  {story}
                  layout="inspector"
                  selectedChapterId={chapterIdStore}
                  {selectedAnnotationId}
                  language={activeLanguage}
                  onDeleteDrawing={(id) => onDeleteAnnotation?.(id)}
                  onEditDrawing={toggleAnnotation}
                />
                {#if annotationSelected}
                  <div class="chapter-inspector__annotation" data-testid="annotation-options">
                    <StoryBuilderWideAnnotationOptions
                      {story}
                      layout="inspector"
                      selectedChapterId={chapterIdStore}
                      {selectedAnnotationId}
                      language={activeLanguage}
                      {languages}
                      onSetLabel={(id, lang, value) => onSetAnnotationLabel?.(id, lang, value)}
                      onSetStyle={(id, style) => onSetAnnotationStyle?.(id, style)}
                    />
                  </div>
                {/if}
              {:else}
                <p class="chapter-overlay__hint" data-testid="inspector-summary-focus">
                  {$t(
                    annotationCount === 1
                      ? 'storyBuilder.inspector.annotationsSummaryOne'
                      : 'storyBuilder.inspector.annotationsSummary',
                    { count: annotationCount },
                  )}
                </p>
              {/if}
            </InspectorSection>
            {#if $activeChapterTask !== "focus"}
            <InspectorSection
              id="audio-timing"
              title={$t('storyBuilder.tasks.items.audio-timing.title')}
              status={evaluations["audio-timing"]?.status}
              availability={evaluations["audio-timing"]?.availability ?? { state: "available" }}
              active={$activeChapterTask === "audio-timing"}
              activateLabel={$t('storyBuilder.inspector.edit')}
              onActivate={() => activateTool("audio-timing")}
              onDone={finishTool}
            >
              {#if $activeChapterTask === "audio-timing"}
                <div class="chapter-overlay__wide-tool-note">
                  <strong>{$t('storyBuilder.narration.editor')}</strong>
                  <span>{$t('storyBuilder.narration.editorHint')}</span>
                </div>
              {:else}
                <p class="chapter-overlay__hint" data-testid="inspector-summary-audio-timing">
                  {narrationSummary}
                </p>
              {/if}
            </InspectorSection>

            <InspectorSection
              id="media-timing"
              title={$t('storyBuilder.tasks.items.media-timing.title')}
              status={evaluations["media-timing"]?.status}
              availability={evaluations["media-timing"]?.availability ?? { state: "hidden" }}
              active={$activeChapterTask === "media-timing"}
              activateLabel={$t('storyBuilder.inspector.edit')}
              onActivate={() => activateTool("media-timing")}
              onDone={finishTool}
            >
              {#if $activeChapterTask === "media-timing"}
                <div class="chapter-overlay__section-title">
                  {mediaTypeValue === "video"
                    ? $t('storyBuilder.media.videoTiming')
                    : $t('storyBuilder.media.audioTiming')}
                </div>
                <div class="chapter-overlay__wide-tool-note">
                  <strong
                    >{$t('storyBuilder.media.chooseSegment', {
                      type: mediaTypeValue === 'video'
                        ? $t('media.type.video').toLowerCase()
                        : $t('media.type.audio').toLowerCase(),
                    })}</strong
                  >
                  <span>
                    {$t('storyBuilder.media.editorHint', {
                      type: mediaTypeValue === 'video'
                        ? $t('media.type.video').toLowerCase()
                        : $t('media.type.audio').toLowerCase(),
                    })}
                  </span>
                  <ul>
                    <li>
                      {$t('storyBuilder.media.dragSelection')}
                    </li>
                    <li>{$t('storyBuilder.media.dragEdge')}</li>
                    <li>
                      {$t('storyBuilder.media.longMediaHint')}
                    </li>
                    <li>
                      {$t('storyBuilder.media.autoSaveHint')}
                    </li>
                  </ul>
                </div>
              {:else}
                <p class="chapter-overlay__hint" data-testid="inspector-summary-media-timing">
                  {mediaSummary}
                </p>
              {/if}
            </InspectorSection>

            <button
              class="chapter-inspector__more"
              type="button"
              aria-expanded={moreOpen}
              aria-controls="chapter-inspector-more"
              data-testid="inspector-more"
              on:click={() => (moreOpen = !moreOpen)}
            >
              <ChevronDown aria-hidden="true" />
              <span>{$t('storyBuilder.inspector.more')}</span>
              <small>{$t('storyBuilder.inspector.moreHint')}</small>
            </button>
            <div
              id="chapter-inspector-more"
              class="chapter-inspector__more-body"
              hidden={!moreOpen}
            >
            <InspectorSection
              id="position"
              title={$t('storyBuilder.tasks.items.position.title')}
              status={evaluations["position"]?.status}
              availability={evaluations["position"]?.availability ?? { state: "available" }}
            >
              {#if positionSectionAvailable}
                <ChapterPositionSection
                  hasSavedPosition={chapterHasSavedPosition}
                  {positionDrafts}
                  aspect={presentationAspect}
                  onFieldInput={handlePositionFieldInput}
                  onCommit={commitPositionField}
                  onGoToPosition={handleRevertView}
                />
              {/if}
            </InspectorSection>
            <InspectorSection
              id="transition-timing"
              title={$t('storyBuilder.tasks.items.transition-timing.title')}
              status={evaluations["transition-timing"]?.status}
              availability={evaluations["transition-timing"]?.availability ?? { state: "available" }}
            >
              <p class="chapter-overlay__hint">
                {$t('storyBuilder.transition.description')}
              </p>
              <label class="chapter-overlay__label">
                {$t('storyBuilder.transition.delay')}
                <input
                  class="chapter-overlay__input"
                  type="number"
                  min="0"
                  step="0.5"
                  data-testid="chapter-transition-delay"
                  value={delayMs !== undefined ? (delayMs / 1000).toString() : ''}
                  on:input={handleDelaySecondsChange}
                />
              </label>
            </InspectorSection>

            <InspectorSection
              id="source"
              title={$t('storyBuilder.tasks.items.source.title')}
              status={evaluations["source"]?.status}
              availability={evaluations["source"]?.availability ?? { state: "available" }}
            >
              <ChapterCameraConfig
                embedded={true}
                chapterExists={true}
                chapterCanvasIndex={chapter.canvasIndex}
                {manifestDraft}
                onManifestInput={handleManifestInput}
                onReloadManifest={() => handleReload()}
              />
            </InspectorSection>

            <InspectorSection
              id="layers"
              title={$t('storyBuilder.tasks.items.layers.title')}
              availability={evaluations["layers"]?.availability ?? { state: "available" }}
            >
              {#if manifestSupportsLayers}
                <div class="chapter-overlay__section-content">
                  {#each layers as layer, index (layer.id)}
                    {@const opacity =
                      layerOpacities[layer.id] !== undefined
                        ? layerOpacities[layer.id]
                        : index === 0
                          ? 1.0
                          : 0.0}
                    <div class="chapter-overlay__layer-item">
                      <div class="chapter-overlay__layer-info">
                        <span class="chapter-overlay__layer-name">
                          {layer.label ||
                            (index === 0
                              ? $t('viewer.panels.layers.baseImage')
                              : $t('viewer.panels.layers.layerNumber', { number: index + 1 }))}
                        </span>
                        <span class="chapter-overlay__layer-value"
                          >{Math.round(opacity * 100)}%</span
                        >
                      </div>
                      <input
                        class="chapter-overlay__layer-slider"
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round(opacity * 100)}
                        on:input={(event) => {
                          const val = Number(event.currentTarget.value) / 100;
                          onUpdateLayerOpacity?.(layer.id, val);
                        }}
                      />
                    </div>
                  {/each}
                </div>
              {/if}
            </InspectorSection>

            {#if SHOW_COMPARISON_TOOL}
              <InspectorSection
                id="comparison"
                title={$t('storyBuilder.tasks.items.comparison.title')}
                availability={evaluations["comparison"]?.availability ?? { state: "available" }}
              >
                <p class="chapter-overlay__hint">
                  {$t('storyBuilder.comparison.hint')}
                </p>
              </InspectorSection>
            {/if}
            </div>
            {/if}
        </div>

      {/if}
    </form>
  </div>
</div>

<style>
  :global {
    .chapter-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      justify-content: flex-end;
      z-index: 12;
      width: 100%;
      height: 100%;
    }

    .chapter-overlay[hidden] {
      display: none;
    }

    .chapter-overlay--docked {
      position: relative;
      inset: auto;
      display: block;
      height: 100%;
      pointer-events: auto;
    }

    .chapter-overlay--docked .chapter-overlay__panel {
      width: 100%;
      max-width: 100%;
      border-left: 0;
      background: var(--viewer-panel, #121922);
    }

    .chapter-overlay--docked .chapter-overlay__header {
      grid-template-columns: minmax(0, 1fr);
      padding: 16px;
    }

    .chapter-overlay--docked .chapter-overlay__form {
      padding: 14px 14px 22px;
    }

    .chapter-overlay__scrim {
      position: absolute;
      inset: 0;
      background: var(--viewer-well-bg, rgba(5, 10, 22, 0.18));
      pointer-events: auto;
    }

    .chapter-overlay__panel {
      position: relative;
      pointer-events: auto;
      width: clamp(360px, 42cqw, 500px);
      max-width: 92cqw;
      height: 100%;
      min-height: 100%;
      align-self: stretch;
      border-radius: 0;
      border-left: 1px solid
        var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      background: var(--viewer-panel, #121922);
      color: var(--viewer-text, #e8edf4);
      box-shadow: none;
      overflow-x: hidden;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .chapter-overlay__header {
      position: sticky;
      top: 0;
      z-index: 3;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      min-width: 0;
      padding: 16px 18px;
      background: var(--viewer-panel, #121922);
      border-bottom: 1px solid
        var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    }

    .chapter-overlay__header > div {
      min-width: 0;
      max-width: 100%;
    }

    /* Annotation editing is a focused workspace, not another dashboard view.
       Keep its chapter identity but give the list, tools and properties the
       vertical space otherwise spent on preview and inspector navigation. */
    .chapter-overlay--annotation-task .chapter-overlay__header {
      padding: 10px 14px;
    }

    .chapter-overlay--annotation-task .chapter-overlay__form {
      gap: 8px;
      padding: 8px 12px 0;
    }

    .chapter-overlay--annotation-task .chapter-overlay__body,
    .chapter-overlay--annotation-task .inspector-section__body {
      gap: 8px;
    }

    .chapter-overlay__eyebrow {
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--viewer-muted, #9aa6b2);
    }

    .chapter-overlay__title {
      font-size: 18px;
      font-weight: 600;
      color: var(--viewer-text, #e8edf4);
      letter-spacing: 0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chapter-overlay__source-context {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
      margin-top: 6px;
      font-size: 11px;
      color: var(--viewer-muted, #9aa6b2);
    }

    .chapter-overlay__source-context > span {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chapter-overlay__source-change {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 7px;
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
      border-radius: 7px;
      background: transparent;
      color: var(--story-builder-accent, #2ac7ff);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .chapter-overlay__source-change:hover {
      background: color-mix(in srgb, var(--story-builder-accent, #2ac7ff) 12%, transparent);
    }

    .chapter-overlay__source-change :global(svg) {
      width: 12px;
      height: 12px;
    }

    .chapter-overlay__preview-chapter {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      width: 100%;
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.14));
      border-radius: 8px;
      padding: 9px 12px;
      background: transparent;
      color: var(--viewer-text, #e8edf4);
      text-align: left;
      cursor: pointer;
    }

    .chapter-overlay__preview-chapter:hover,
    .chapter-overlay__preview-chapter:focus-visible {
      border-color: var(--accent, var(--story-builder-accent, #2ac7ff));
      background: color-mix(in srgb, var(--accent, var(--story-builder-accent, #2ac7ff)) 10%, transparent);
    }

    .chapter-overlay__preview-chapter :global(svg) {
      width: 17px;
      height: 17px;
      color: var(--accent, var(--story-builder-accent, #2ac7ff));
    }

    .chapter-overlay__preview-chapter span {
      display: grid;
      gap: 2px;
    }

    .chapter-overlay__preview-chapter strong {
      font-size: 13px;
      font-weight: 600;
    }

    .chapter-overlay__preview-chapter small {
      color: var(--viewer-muted, #9aa6b2);
      font-size: 12px;
      line-height: 1.35;
    }

    .chapter-overlay__back {
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      border-radius: 10px;
      padding: 8px 10px;
      background: var(--viewer-panel-strong, #1b242e);
      color: var(--viewer-text, #e8edf4);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      cursor: pointer;
    }

    .chapter-overlay__close {
      width: var(--viewer-close-button-size, 28px);
      height: var(--viewer-close-button-size, 28px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid
        var(--viewer-close-button-border, rgba(255, 255, 255, 0.18));
      border-radius: var(--viewer-close-button-radius, 10px);
      background: var(--viewer-close-button-bg, rgba(255, 255, 255, 0.1));
      color: var(--viewer-close-button-color, rgba(232, 237, 246, 0.9));
      font-size: var(--viewer-close-button-glyph-size, 15px);
      line-height: 1;
      text-transform: none;
      letter-spacing: 0;
      padding: 0;
      cursor: pointer;
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        transform 0.08s ease;
    }

    .chapter-overlay__close:hover:not(:disabled) {
      background: var(
        --viewer-close-button-hover-bg,
        rgba(255, 255, 255, 0.16)
      );
      border-color: var(
        --viewer-close-button-hover-border,
        rgba(255, 255, 255, 0.34)
      );
    }

    .chapter-overlay__close:focus-visible {
      outline: 2px solid
        var(--viewer-close-button-focus-ring, rgba(42, 199, 255, 0.55));
      outline-offset: 2px;
    }

    .chapter-overlay__close:active:not(:disabled) {
      transform: translateY(1px);
    }

    .chapter-overlay__form {
      display: grid;
      gap: 14px;
      padding: 14px 18px 22px;
    }

    .chapter-overlay__body {
      display: grid;
      gap: 12px;
    }

    /*
     * The three groups of the inspector: a segmented row that stays put while
     * the sections beneath it change, so there is no drill-down and nothing to
     * go back from.
     */
    .chapter-inspector__annotation {
      padding-top: 12px;
      border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
    }

    .chapter-inspector__more {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-width: 0;
      min-height: 46px;
      padding: 8px 0;
      border: 0;
      border-top: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      border-radius: 0;
      background: transparent;
      color: var(--viewer-text, #e8edf4);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      text-align: start;
      cursor: pointer;
    }

    .chapter-inspector__more small {
      margin-inline-start: auto;
      overflow: hidden;
      color: var(--viewer-muted, #9aa6b2);
      font-size: 12px;
      font-weight: 400;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chapter-inspector__more svg {
      flex: 0 0 auto;
      width: 15px;
      height: 15px;
      transition: transform 0.15s ease;
    }

    .chapter-inspector__more[aria-expanded="false"] svg {
      transform: rotate(-90deg);
    }

    .chapter-inspector__more:hover {
      background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
    }

    .chapter-inspector__more:focus-visible {
      outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
      outline-offset: 1px;
    }

    .chapter-inspector__more-body {
      display: grid;
      gap: 0;
    }

    /* The first section under More follows its heading directly. */
    .chapter-inspector__more-body > :global(.inspector-section:first-child) {
      padding-block-start: 2px;
      border-top: 0;
    }

    .chapter-inspector__more-body[hidden] {
      display: none;
    }

    .chapter-inspector__sections {
      /* Zero-floored, so a long heading or hint truncates instead of pushing
         the form wider than its panel. */
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
      gap: 0;
    }

    .chapter-overlay__wide-tool-note {
      display: grid;
      gap: 4px;
      padding: 13px;
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent, var(--story-builder-accent, #2ac7ff)) 7%, transparent);
    }

    .chapter-overlay__wide-tool-note strong {
      font-size: 12px;
    }
    .chapter-overlay__wide-tool-note span {
      color: var(--viewer-muted, #9aa6b2);
      font-size: 10px;
      line-height: 1.4;
    }
    .chapter-overlay__wide-tool-note ul {
      display: grid;
      gap: 7px;
      margin: 6px 0 0;
      padding-left: 17px;
      color: var(--viewer-muted, #9aa6b2);
      font-size: 10px;
      line-height: 1.45;
    }
    .chapter-overlay__annotation-tools {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
      margin-top: 11px;
    }
    .chapter-overlay--annotation-task .chapter-overlay__annotation-tools {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 3px;
    }
    .chapter-overlay__annotation-tools button {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      padding: 8px;
      background: transparent;
      color: var(--viewer-muted, #9aa6b2);
      font-size: 10px;
      cursor: pointer;
    }
    .chapter-overlay__annotation-tools button :global(svg) {
      flex: 0 0 auto;
      width: 14px;
      height: 14px;
    }
    .chapter-overlay__field { display:grid; gap:7px; color:var(--viewer-muted, #9aa6b2); font-size:10px; font-weight:700; }

    .chapter-overlay__section {
      display: grid;
      gap: 12px;
    }

    .chapter-overlay__section--card {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      background: var(--viewer-surface, #151d26);
    }

    .chapter-overlay__section-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--viewer-muted, #9aa6b2);
      font-weight: 700;
    }

    .chapter-overlay__section-content {
      display: grid;
      gap: 10px;
    }

    .chapter-overlay__section-content[hidden] {
      display: none;
    }

    .chapter-overlay__label {
      display: grid;
      gap: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--viewer-muted, #9aa6b2);
    }

    .chapter-overlay__hint {
      font-size: 12px;
      line-height: 1.45;
      color: var(--viewer-muted, #9aa6b2);
    }

    .chapter-overlay__validation {
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--viewer-danger, #ffb8b8) 35%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--viewer-danger, #ffb8b8) 10%, transparent);
      color: var(--viewer-danger, #ffd0d0);
      font-size: 12px;
    }

    .chapter-overlay__validation ul {
      margin: 6px 0 0;
      padding-left: 18px;
    }

    .chapter-overlay__input,
    .chapter-overlay__textarea {
      border: 1px solid color-mix(in srgb, var(--viewer-text, #e8edf4) 22%, transparent);
      border-radius: 8px;
      padding: 9px 11px;
      background: var(--viewer-panel, #121922);
      color: var(--viewer-text, #e8edf4);
      font-size: 13px;
      outline: none;
    }

    .chapter-overlay__input::placeholder,
    .chapter-overlay__textarea::placeholder {
      color: color-mix(in srgb, var(--viewer-muted, #9aa6b2) 45%, transparent);
    }

    .chapter-overlay__input:focus,
    .chapter-overlay__textarea:focus {
      border-color: var(--accent, var(--story-builder-accent, #2ac7ff));
      outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
      outline-offset: 1px;
    }

    .chapter-overlay__textarea {
      resize: vertical;
      min-height: 94px;
    }

    .chapter-overlay__input:disabled,
    .chapter-overlay__textarea:disabled {
      opacity: 0.56;
      cursor: not-allowed;
    }

    .chapter-overlay__row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: end;
    }

    .chapter-overlay__button {
      border: 1px solid var(--viewer-panel-border, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      min-height: 34px;
      padding: 7px 12px;
      background: var(--viewer-panel-strong, #1b242e);
      color: var(--viewer-text, #e8edf4);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition:
        background 0.16s ease,
        border-color 0.16s ease;
      white-space: nowrap;
    }

    .chapter-overlay__button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .chapter-overlay__button--primary {
      background: var(--accent, var(--story-builder-accent, #2ac7ff));
      border-color: transparent;
      color: var(--story-builder-on-accent, #06141d);
    }

    .chapter-overlay__button--subtle {
      background: var(--viewer-panel-strong, #1b242e);
    }

    .chapter-overlay__button:not(:disabled):hover {
      background: color-mix(
        in srgb,
        var(--viewer-panel-strong, #1b242e) 82%,
        white
      );
      border-color: color-mix(
        in srgb,
        var(--viewer-muted, #9aa6b2) 45%,
        transparent
      );
    }

    .chapter-overlay__button--primary:not(:disabled):hover {
      background: var(--story-builder-accent-hover, #5bd5ff);
    }

    .chapter-overlay__layer-item {
      display: grid;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--viewer-text, #e8edf4) 4%, transparent);
      border: 1px solid color-mix(in srgb, var(--viewer-text, #e8edf4) 3%, transparent);
      transition:
        background-color 0.2s ease,
        border-color 0.2s ease;
    }

    .chapter-overlay__layer-item:hover {
      background: color-mix(in srgb, var(--viewer-text, #e8edf4) 6%, transparent);
      border-color: color-mix(in srgb, var(--viewer-text, #e8edf4) 6%, transparent);
    }

    .chapter-overlay__layer-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .chapter-overlay__layer-name {
      font-weight: 700;
      color: color-mix(in srgb, var(--viewer-text, #e8edf4) 90%, transparent);
    }

    .chapter-overlay__layer-value {
      font-weight: 600;
      color: var(--viewer-muted, #9aa6b2);
      font-variant-numeric: tabular-nums;
    }

    .chapter-overlay__layer-slider {
      width: 100%;
      accent-color: var(--accent, var(--story-builder-accent, #2ac7ff));
      cursor: pointer;
      background: color-mix(in srgb, var(--viewer-text, #e8edf4) 10%, transparent);
      height: 4px;
      border-radius: 2px;
      outline: none;
    }

    @media (max-width: 860px) {
      .chapter-overlay__panel {
        width: 100%;
        max-width: 100%;
        border-radius: 0;
      }

      .chapter-overlay__row {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
