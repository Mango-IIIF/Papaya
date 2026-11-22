import { describe, expect, it } from 'vitest';
import { isSafeContentUrl, sanitizeCssColor } from '../sanitize';

describe('sanitize helpers', () => {
  it('accepts valid CSS colors and rejects CSS injection payloads', () => {
    expect(sanitizeCssColor('#e07a3f', '#000')).toBe('#e07a3f');
    expect(sanitizeCssColor('#fff', '#000')).toBe('#fff');
    expect(sanitizeCssColor('rgb(255, 128, 0)', '#000')).toBe('rgb(255, 128, 0)');
    expect(sanitizeCssColor('rgba(10, 20, 30, 0.5)', '#000')).toBe('rgba(10, 20, 30, 0.5)');
    expect(sanitizeCssColor('crimson', '#000')).toBe('crimson');

    expect(
      sanitizeCssColor('red; background-image: url(https://evil.example/x)', '#000'),
    ).toBe('#000');
    expect(sanitizeCssColor('expression(alert(1))', '#000')).toBe('#000');
    expect(sanitizeCssColor('url(javascript:alert(1))', '#000')).toBe('#000');
    expect(sanitizeCssColor('', '#000')).toBe('#000');
  });

  it('validates content URLs and blocks unsafe schemes and protocol-relative URLs', () => {
    expect(isSafeContentUrl('https://example.org/story.json')).toBe(true);
    expect(isSafeContentUrl('http://localhost:5173/demo.json')).toBe(true);
    expect(isSafeContentUrl('test-story/demo.json')).toBe(true);
    expect(isSafeContentUrl('/stories/demo.json')).toBe(true);
    expect(isSafeContentUrl('./demo.json')).toBe(true);

    expect(isSafeContentUrl('//evil.example/story.json')).toBe(false);
    expect(isSafeContentUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeContentUrl('data:application/json,{}')).toBe(false);
    expect(isSafeContentUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeContentUrl('')).toBe(false);
  });
});
