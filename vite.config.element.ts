import { join, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

if (
  typeof globalThis.crypto === 'undefined' ||
  typeof globalThis.crypto.getRandomValues !== 'function'
) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
}

const customElementConfig = (filename: string | undefined) => {
  if (/(StoryViewer|StoryBuilder)Element\.svelte$/.test(filename ?? '')) {
    return { customElement: true };
  }
  return {};
};

export default defineConfig({
  root: resolve(import.meta.dirname, 'src'),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  /*
   * `@mango-iiif/iiif-viewer` may be linked from a sibling checkout, which
   * would otherwise resolve its own copies of these from its own
   * node_modules: two Svelte runtimes cannot share components or stores.
   */
  resolve: {
    dedupe: ['svelte', '@lucide/svelte', '@mango-iiif/annotation', '@mango-iiif/av', '@mango-iiif/w3c-parser'],
  },
  plugins: [
    svelte({
      configFile: resolve(import.meta.dirname, 'svelte.config.js'),
      dynamicCompileOptions({ filename }) {
        return customElementConfig(filename);
      },
    }),
    {
      name: 'mango-story-element-shadow-css',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const jsChunk = bundle['mango-story-element.js'];
        const cssAsset = bundle['mango-story-element.css'];
        if (jsChunk?.type !== 'chunk' || cssAsset?.type !== 'asset') return;
        if (jsChunk.code.includes('/* mango-css-injected */')) return;

        const css =
          typeof cssAsset.source === 'string'
            ? cssAsset.source
            : Buffer.from(cssAsset.source).toString('utf8');
        jsChunk.code += `\n/* mango-css-injected */\n;if (typeof window !== 'undefined' && window.__setMangoStoryCss) { window.__setMangoStoryCss(${JSON.stringify(css)}); }`;
      },
      writeBundle(_options, bundle) {
        const standaloneDir = resolve(import.meta.dirname, 'src/dist/standalone');
        if (!existsSync(standaloneDir)) return;
        for (const entry of readdirSync(standaloneDir)) {
          if (!(`standalone/${entry}` in bundle)) {
            rmSync(join(standaloneDir, entry), { recursive: true, force: true });
          }
        }
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/lib/element-bundle.ts'),
      name: 'MangoStoryElement',
      formats: ['es'],
      fileName: () => 'mango-story-element.js',
    },
    rolldownOptions: {
      output: {
        chunkFileNames: 'standalone/[name]-[hash].js',
        assetFileNames: 'mango-story-element.[ext]',
      },
    },
    outDir: resolve(import.meta.dirname, 'src/dist'),
    emptyOutDir: false,
    cssCodeSplit: false,
  },
});
