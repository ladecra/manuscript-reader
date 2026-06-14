// ─── Ingestion Engine: Markdown Parser ───────────────────────────────────────
// Converts normalized Markdown (post-preprocessMarkdown) into rendered HTML
// and a structured chapters array.

import type { Chapter, ParsedManuscript } from '../types';

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(s: string): string {
  s = escHtml(s);
  s = s.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.*?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/_((?!_).*?)_/g, '<em>$1</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color:var(--muted);text-underline-offset:3px;" target="_blank" rel="noopener">$1</a>',
  );
  return s;
}

/**
 * Parse normalized Markdown into HTML + chapters.
 * Expects text that has already been through preprocessMarkdown.
 */
export function parseMarkdown(md: string): ParsedManuscript {
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = md.split('\n');

  let html = '';
  let i = 0;
  let chIdx = 0;
  let inBlock = false;
  const chapters: Chapter[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // Skip HTML comments (e.g. <!-- title: ... -->)
    if (/^<!--[\s\S]*?-->\s*$/.test(line.trim())) { i++; continue; }

    // ── Chapter heading (# ) ──
    if (/^# /.test(line)) {
      if (inBlock) html += '</div>';
      chIdx++;
      const title = line.replace(/^# /, '').trim();
      const id = `ch-${chIdx}`;
      chapters.push({ index: chIdx, title, id });
      html +=
        `<span class="chapter-marker" id="${id}">` +
        `Chapter ${String(chIdx).padStart(2, '0')}</span>` +
        `<h1>${inline(title)}</h1>` +
        `<div class="chapter-block">`;
      inBlock = true;
      i++;
      continue;
    }

    // ── Section headings ──
    if (/^## /.test(line)) {
      html += `<h2>${inline(line.replace(/^## /, '').trim())}</h2>`;
      i++;
      continue;
    }
    if (/^### /.test(line)) {
      html += `<h3>${inline(line.replace(/^### /, '').trim())}</h3>`;
      i++;
      continue;
    }

    // ── Horizontal rule / scene break ──
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      html += '<hr>';
      i++;
      continue;
    }

    // ── Block quote ──
    if (/^> /.test(line)) {
      let bq = '';
      while (i < lines.length && /^> /.test(lines[i])) {
        bq += inline(lines[i].replace(/^> /, '')) + ' ';
        i++;
      }
      html += `<blockquote>${bq.trim()}</blockquote>`;
      continue;
    }

    // ── Unordered list ──
    if (/^[-*+] /.test(line)) {
      html += '<ul>';
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^[-*+] /, ''))}</li>`;
        i++;
      }
      html += '</ul>';
      continue;
    }

    // ── Ordered list ──
    if (/^\d+\. /.test(line)) {
      html += '<ol>';
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\d+\. /, ''))}</li>`;
        i++;
      }
      html += '</ol>';
      continue;
    }

    // ── Code block ──
    if (/^```/.test(line)) {
      i++;
      let code = '';
      while (i < lines.length && !/^```/.test(lines[i])) {
        code += escHtml(lines[i]) + '\n';
        i++;
      }
      html += `<pre><code>${code}</code></pre>`;
      i++;
      continue;
    }

    // ── Blank line ──
    if (line.trim() === '') { i++; continue; }

    // ── Setext h1 (===) → chapter ──
    if (i + 1 < lines.length && /^={3,}\s*$/.test(lines[i + 1].trim())) {
      if (inBlock) html += '</div>';
      chIdx++;
      const title = line.trim();
      const id = `ch-${chIdx}`;
      chapters.push({ index: chIdx, title, id });
      html +=
        `<span class="chapter-marker" id="${id}">` +
        `Chapter ${String(chIdx).padStart(2, '0')}</span>` +
        `<h1>${inline(title)}</h1>` +
        `<div class="chapter-block">`;
      inBlock = true;
      i += 2;
      continue;
    }

    // ── Bare standalone number (chapter divider artifact) ──
    if (/^\s*\d{1,3}\s*$/.test(line)) { i++; continue; }

    // ── Paragraph (catch-all) ──
    let para = '';
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3} /.test(lines[i]) &&
      !/^[-*+] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !/^> /.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^={3,}\s*$/.test(lines[i].trim())
    ) {
      para += lines[i] + ' ';
      i++;
    }
    if (para.trim()) html += `<p>${inline(para.trim())}</p>`;
  }

  if (inBlock) html += '</div>';

  return { html, chapters };
}

/** Word count from raw markdown text. */
export function countWords(md: string): number {
  return md.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Compute per-chapter word counts from raw markdown.
 * Returns a map of chapterIndex → word count. Forematter (text before the
 * first `# ` heading) is ignored. Mirrors the chapter segmentation in
 * parseMarkdown so indices line up with the chapters array.
 */
export function computeChapterWords(md: string): Map<number, number> {
  const normalized = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const result = new Map<number, number>();
  let chIdx = 0;
  let buffer: string[] = [];

  const flush = () => {
    if (chIdx > 0) {
      const text = buffer.join(' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/[#>*_`~-]+/g, ' ');
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      result.set(chIdx, (result.get(chIdx) ?? 0) + words);
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSetextH1 = i + 1 < lines.length && /^={3,}\s*$/.test(lines[i + 1].trim());
    if (/^# /.test(line)) {
      flush();
      chIdx++;
      // heading title itself excluded from body word count
      continue;
    }
    if (isSetextH1) {
      flush();
      chIdx++;
      i++; // skip the === underline
      continue;
    }
    buffer.push(line);
  }
  flush();
  return result;
}
