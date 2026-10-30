# Mango Story

[![npm](https://img.shields.io/npm/v/@mango-iiif/story)](https://www.npmjs.com/package/@mango-iiif/story)
[![CI](https://github.com/Mango-IIIF/story/actions/workflows/ci.yml/badge.svg)](https://github.com/Mango-IIIF/story/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Guided IIIF stories for [Mango](https://github.com/Mango-IIIF/Mango). This
package provides two surfaces built on
[`@mango-iiif/iiif-viewer`](https://www.npmjs.com/package/@mango-iiif/iiif-viewer):

- **Story viewer** — plays a narrative of chapters: each chapter opens a canvas
  at an authored region, with text, narration, media segments, model poses,
  layer settings and camera motion.
- **Story builder** — authors those narratives by capturing the viewer's state,
  and exports them as a portable IIIF AnnotationPage.

Stories are W3C/IIIF AnnotationPages, so a plain AnnotationPage from another
tool plays as a story too.

## Fastest start: standalone website

```html
<script type="module" src="https://unpkg.com/@mango-iiif/story/src/dist/mango-story-element.js"></script>

<mango-story-viewer story-url="/stories/exhibition-tour.json"></mango-story-viewer>

<mango-story-builder
  config='{"story":{"languages":["en","cy"]}}'
></mango-story-builder>
```

The standalone bundle includes the viewer and its styles. A story can also be
named by the IIIF Content State parameter: `?iiif-content=/stories/tour.json`.

## Install from npm

```bash
npm install @mango-iiif/story @mango-iiif/iiif-viewer svelte
```

Custom elements:

```js
import "@mango-iiif/story/element"; // both elements
// or only one:
import "@mango-iiif/story/element/story-viewer";
import "@mango-iiif/story/element/story-builder";
```

Svelte components:

```svelte
<script>
  import { StoryViewer, StoryBuilder } from "@mango-iiif/story";
  import "@mango-iiif/iiif-viewer/style.css";
  import "@mango-iiif/story/style.css";
</script>

<StoryViewer storyUrl="/stories/exhibition-tour.json" />
```

### Package entry points

| Entry                                      | Contents                                              |
| ------------------------------------------ | ----------------------------------------------------- |
| `@mango-iiif/story`                        | Everything below                                      |
| `@mango-iiif/story/story-viewer`           | `StoryViewer`, story loading and playback runtime     |
| `@mango-iiif/story/story-builder`          | `StoryBuilder`, builder plugins, serializer, validation |
| `@mango-iiif/story/element`                | `<mango-story-viewer>` and `<mango-story-builder>`    |
| `@mango-iiif/story/element/story-viewer`   | `<mango-story-viewer>` only                           |
| `@mango-iiif/story/element/story-builder`  | `<mango-story-builder>` only                          |
| `@mango-iiif/story/style.css`              | Story styles (the viewer's live in `@mango-iiif/iiif-viewer/style.css`) |

## Elements

Both elements take `config` (viewer config JSON plus a `story` block) and
`plugins` (viewer plugins for the stage). `<mango-story-viewer>` takes
`story-url` or `story` (inline JSON); `<mango-story-builder>` takes either to
open an existing story, or neither to start a new one.

Both expose the embedded viewer's navigation on the element — `getViewBox`,
`setViewBox`, `getZoom`, `setZoom`, `zoomIn`, `zoomOut`, `goHome`, `panTo`,
`getCanvasIndex`, `setCanvasByIndex`, `getCanvasId`, `getManifestId`,
`getState` — plus `getViewer()` for the full viewer API and `on`/`off` for
events. Viewer events (`pageChange`, `viewBoxChange`, …) and story events
(`storyViewerError`, `storySaveRequest`, `storyExport`) are also dispatched as
DOM events on the element.

### Story config

```js
builder.config = {
  language: "en",
  theme: "dark",
  story: {
    languages: ["en", "cy"],              // authoring languages
    annotationPageId: "https://example.org/stories/tour", // public id for exports
    annotationBase: "https://example.org/stories/tour/annotation/",
    identifiersLocked: false,             // stop authors changing host ids
    showDebug: false,
    save: { /* see below */ },
  },
};
```

### Host-managed story storage

Story Builder can save to host-owned storage such as IndexedDB by assigning an
asynchronous handler. The handler receives the portable IIIF AnnotationPage
produced by the builder:

```js
const builder = document.querySelector("mango-story-builder");
builder.config = {
  story: {
    save: {
      handler: async (story) => {
        await storiesDatabase.put(story);
        return { ok: true, message: "Saved locally" };
      },
    },
  },
};
```

The editable state and the IIIF export can also be read on demand with
`builder.getStory()` and `builder.exportStory()`; both return `null` before the
builder is ready. The `storySaveRequest` and `storyExport` events carry the
same portable document when the toolbar actions are used.

## How it fits together

The story hosts mount the viewer's `ViewerCore` headless (no viewer chrome) and
drive it through its public `ViewerApi`, from `@mango-iiif/iiif-viewer/core`.
The builder draws its own stage surfaces over the viewer — chapter frames,
drawn annotations, and the authoring overlay — and talks to its plugins
through a story event bus layered on the viewer's events. The story format is
described by [`schemas/story-annotation-page.schema.json`](schemas/story-annotation-page.schema.json)
and the JSON-LD context in [`schema/story/1/context.json`](schema/story/1/context.json).

## Development

```bash
npm ci
npm run dev
```

`npm run dev` serves the story demos in `apps/demo` at http://localhost:5173.

```bash
npm run build:dist   # library, custom elements and type declarations in src/dist
npm run build:demo   # build:dist, then copy src/dist into apps/demo/dist
npm test             # unit tests
npm run test:e2e     # Playwright, against the built demo
npm run lint
npm run i18n:check
```

`scripts/migrate-story.mjs` upgrades story files written in the older Mango
story shape.

## License

Mango Story is available under the [MIT License](LICENSE).
