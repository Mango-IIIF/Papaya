import { describe, expect, it } from 'vitest';
import { extractSlicePeaks } from '../audioWaveform';

describe('audioWaveform', () => {
  it('extracts normalized peaks for a slice of audio samples', () => {
    const sampleRate = 100;
    const samples = new Float32Array(400);
    // Loud spike in the second half of [1s, 3s] (samples 200..300)
    for (let i = 100; i < 200; i++) samples[i] = 0.25;
    for (let i = 200; i < 300; i++) samples[i] = 0.8;

    const peaks = extractSlicePeaks(samples, sampleRate, 1, 3, 4);
    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(0.25 / 0.8, 2);
    expect(peaks[2]).toBeCloseTo(1, 2);
  });

  it('returns an empty array for invalid ranges', () => {
    const samples = new Float32Array(100);
    expect(extractSlicePeaks(samples, 100, 2, 2, 10)).toEqual([]);
    expect(extractSlicePeaks(new Float32Array(0), 100, 0, 1, 10)).toEqual([]);
  });
});
