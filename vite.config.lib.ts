import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.getRandomValues !== 'function'
) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
/*
 * Dependencies stay external so an app that also uses the viewer loads one copy.
 * `@lucide/svelte` ships uncompiled `.svelte` files, so bundle it into the compiled
 * library output rather than forcing every consumer to run the Svelte Vite plugin.
 */
const BUNDLED = ['@lucide/svelte'];
const externalPackages = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter(
  (name) => !BUNDLED.includes(name),
);
const isExternal = (id: string) =>
  externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

const customElementConfig = (filename: string | undefined) => {
  if (/(StoryViewer|StoryBuilder)Element\.svelte$/.test(filename ?? '')) {
    return { customElement: true };
  }
  return {};
};

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  plugins: [
    svelte({
      configFile: resolve(import.meta.dirname, 'svelte.config.js'),
      dynamicCompileOptions({ filename }) {
        return customElementConfig(filename);
      },
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/lib/index.ts'),
        element: resolve(import.meta.dirname, 'src/lib/element.ts'),
        'element-story-viewer': resolve(import.meta.dirname, 'src/lib/elements/story-viewer.ts'),
        'element-story-builder': resolve(import.meta.dirname, 'src/lib/elements/story-builder.ts'),
        'story-viewer': resolve(import.meta.dirname, 'src/lib/story-viewer.ts'),
        'story-builder': resolve(import.meta.dirname, 'src/lib/story-builder.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: isExternal,
    },
    outDir: resolve(import.meta.dirname, 'src/dist'),
    emptyOutDir: true,
  },
});
