import { describe, expect, it } from 'vitest';
import { applyMarkdownFormat, renderChapterRichText } from '../richText';

describe('richText', () => {
  it('renders paragraphs, bold, italic, links, lists, and blockquotes safely', () => {
    const html = renderChapterRichText(
      'See **bold** and *italic* with [IIIF](https://iiif.io).\n\n- One\n- Two\n\n> Quoted line',
    );
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain(
      '<a href="https://iiif.io" target="_blank" rel="noopener noreferrer">IIIF</a>',
    );
    expect(html).toContain('<ul><li>One</li><li>Two</li></ul>');
    expect(html).toContain('<blockquote><p>Quoted line</p></blockquote>');
  });

  it('escapes raw HTML and blocks unsafe link protocols', () => {
    const html = renderChapterRichText(
      '<script>alert(1)</script> [click](javascript:alert(2))',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
  });

  it('applies markdown formatting around the selected range', () => {
    const bold = applyMarkdownFormat('hello world', 6, 11, 'bold');
    expect(bold.value).toBe('hello **world**');

    const italic = applyMarkdownFormat('hello world', 0, 5, 'italic');
    expect(italic.value).toBe('*hello* world');

    const link = applyMarkdownFormat('read more', 0, 9, 'link');
    expect(link.value).toBe('[read more](https://)');

    const list = applyMarkdownFormat('first\nsecond', 0, 12, 'list');
    expect(list.value).toBe('- first\n- second');
  });
});
