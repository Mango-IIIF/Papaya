/**
 * Lightweight, strictly sanitized rich-text rendering for chapter descriptions.
 *
 * Chapter descriptions remain plain strings in IIIF `summary` language maps,
 * so plain text and external AnnotationPages stay 100% compatible while authors
 * who want italics, bold, links, lists, or blockquotes can use simple Markdown
 * in the Formatted alternative view.
 */

export type RichTextFormatAction = 'bold' | 'italic' | 'link' | 'list' | 'quote';

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const isSafeHref = (rawUrl: string): boolean => {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:'
    );
  } catch {
    return false;
  }
};

const renderInline = (rawLine: string): string => {
  const escaped = escapeHtml(rawLine);

  // Extract inline code first so formatting inside backticks is left literal.
  const codeTokens: string[] = [];
  let text = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const token = `@@MANGOCODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });

  // Markdown links: [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const decodedUrl = url.replace(/&amp;/g, '&');
    if (!isSafeHref(decodedUrl)) return label;
    const safeUrl = escapeHtml(decodedUrl);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold (**text** or __text__)
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');

  // Italic (*text* or _text_)
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, '$1<em>$2</em>');

  return text.replace(/@@MANGOCODE(\d+)@@/g, (_, idx: string) => codeTokens[Number(idx)] ?? '');
};

/**
 * Renders a plain or Markdown-formatted chapter description into safe HTML.
 * Only emits `p`, `strong`, `em`, `a`, `ul`, `ol`, `li`, `blockquote`, `code`, and `br`.
 */
export const renderChapterRichText = (source: string | null | undefined): string => {
  const normalized = (source ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(`<blockquote><p>${quoteLines.map(renderInline).join('<br />')}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph (consecutive non-blank, non-special lines)
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${paragraphLines.map(renderInline).join('<br />')}</p>`);
  }

  return blocks.join('');
};

/**
 * Applies a lightweight Markdown formatting action to a textarea selection.
 */
export const applyMarkdownFormat = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: RichTextFormatAction,
): { value: string; selectionStart: number; selectionEnd: number } => {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);

  if (action === 'bold') {
    const inner = selected || 'bold text';
    const inserted = `**${inner}**`;
    return {
      value: `${before}${inserted}${after}`,
      selectionStart: start + 2,
      selectionEnd: start + 2 + inner.length,
    };
  }

  if (action === 'italic') {
    const inner = selected || 'italic text';
    const inserted = `*${inner}*`;
    return {
      value: `${before}${inserted}${after}`,
      selectionStart: start + 1,
      selectionEnd: start + 1 + inner.length,
    };
  }

  if (action === 'link') {
    const label = selected || 'link text';
    const inserted = `[${label}](https://)`;
    const urlStart = start + label.length + 3;
    return {
      value: `${before}${inserted}${after}`,
      selectionStart: urlStart,
      selectionEnd: urlStart + 'https://'.length,
    };
  }

  const prefix = action === 'list' ? '- ' : '> ';
  const block = selected || (action === 'list' ? 'List item' : 'Quote');
  const prefixed = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n');
  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const leading = needsLeadingNewline ? '\n' : '';
  const nextValue = `${before}${leading}${prefixed}${after}`;
  const nextStart = start + leading.length;
  return {
    value: nextValue,
    selectionStart: nextStart,
    selectionEnd: nextStart + prefixed.length,
  };
};
