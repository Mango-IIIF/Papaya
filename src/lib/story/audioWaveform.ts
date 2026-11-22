/**
 * Extracts normalized amplitude peaks for a chapter's narration audio slice
 * so the camera timeline can render the real audio waveform behind keyframes.
 */

export const extractSlicePeaks = (
  channelData: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  bucketCount = 96,
): number[] => {
  if (
    !channelData.length ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(startSec) ||
    !Number.isFinite(endSec) ||
    endSec <= startSec ||
    bucketCount <= 0
  ) {
    return [];
  }

  const startSample = Math.max(0, Math.min(channelData.length - 1, Math.floor(startSec * sampleRate)));
  const endSample = Math.max(
    startSample + 1,
    Math.min(channelData.length, Math.ceil(endSec * sampleRate)),
  );
  const totalSamples = endSample - startSample;
  const buckets = Math.max(1, Math.floor(bucketCount));
  const peaks: number[] = new Array(buckets).fill(0);

  let maxPeak = 0;
  for (let i = 0; i < buckets; i++) {
    const from = startSample + Math.floor((i / buckets) * totalSamples);
    const to = Math.max(from + 1, startSample + Math.floor(((i + 1) / buckets) * totalSamples));
    let peak = 0;
    const step = Math.max(1, Math.floor((to - from) / 64));
    for (let s = from; s < to && s < channelData.length; s += step) {
      const amp = Math.abs(channelData[s]);
      if (amp > peak) peak = amp;
    }
    peaks[i] = peak;
    if (peak > maxPeak) maxPeak = peak;
  }

  if (maxPeak <= 0) return peaks.map(() => 0.08);
  return peaks.map((value) => Math.max(0.08, Math.min(1, value / maxPeak)));
};

const decodedBufferCache = new Map<string, Promise<AudioBuffer | null>>();

const decodeAudioUrl = (url: string): Promise<AudioBuffer | null> => {
  const existing = decodedBufferCache.get(url);
  if (existing) return existing;

  const task = (async (): Promise<AudioBuffer | null> => {
    if (typeof fetch !== 'function') return null;
    const AudioCtx =
      typeof globalThis !== 'undefined'
        ? ((globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
          (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AudioCtx) return null;

    let ctx: AudioContext | null = null;
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      ctx = new AudioCtx();
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      return null;
    } finally {
      try {
        await ctx?.close?.();
      } catch {
        // Ignore AudioContext close errors.
      }
    }
  })();

  decodedBufferCache.set(url, task);
  return task;
};

/**
 * Fetches and decodes a narration audio URL (cached per URL) and returns
 * normalized peak bars for `[startSec, endSec]`, or `null` if audio decoding
 * is unavailable or blocked by CORS.
 */
export const loadAudioSlicePeaks = async (
  url: string,
  startSec: number,
  endSec: number,
  bucketCount = 96,
): Promise<number[] | null> => {
  if (!url.trim() || endSec <= startSec) return null;
  const buffer = await decodeAudioUrl(url.trim());
  if (!buffer || buffer.numberOfChannels === 0) return null;
  const peaks = extractSlicePeaks(
    buffer.getChannelData(0),
    buffer.sampleRate,
    startSec,
    endSec,
    bucketCount,
  );
  return peaks.length > 0 ? peaks : null;
};
