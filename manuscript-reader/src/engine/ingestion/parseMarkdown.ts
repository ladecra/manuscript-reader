// ─── Ingestion Engine: Markdown Parser ───────────────────────────────────────
// Converts normalized Markdown (post-preprocessMarkdown) into rendered HTML
// and a structured chapters array.

import type { Chapter, ParsedManuscript, StructuralBlock } from '../types';

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

// The number is rendered separately (the "Chapter 01" marker span + nav ch-num),
// so a "Chapter N — " / "Prologue — " label prefix on the title itself just
// doubles it. Strip the leading keyword+number+separator so the displayed title
// is the bare subtitle ("White Hunger"), falling back to the original when there
// is nothing left (an untitled "Chapter 5").
const CHAPTER_LABEL_PREFIX =
  /^(?:chapter|part|book|section|prologue|epilogue|interlude|afterword|foreword|prelude)(?:\s+(?:\d{1,3}|[ivxlcdm]+))?\s*[—–:-]\s*/i;

export function stripChapterLabel(title: string): string {
  const stripped = title.replace(CHAPTER_LABEL_PREFIX, '').trim();
  return stripped || title;
}

/**
 * Parse normalized Markdown into HTML + chapters.
 * Expects text that has already been through preprocessMarkdown.
 */
export function parseMarkdown(md: string): ParsedManuscript {
  md = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = md.split('\n');

  // Character offset of each line's start within the normalized markdown, so
  // every block can record the exact source span it was rendered from. Edit
  // mode (Phase 4/7) rewrites a block by splicing this span; offsets are into
  // the *normalized* markdown, so callers must normalize before splicing.
  const lineStart: number[] = new Array(lines.length);
  { let acc = 0; for (let k = 0; k < lines.length; k++) { lineStart[k] = acc; acc += lines[k].length + 1; } }
  const lineEnd = (k: number) => lineStart[k] + lines[k].length;
  const src = (start: number, end: number) => ` data-md-start="${start}" data-md-end="${end}"`;

  let html = '';
  let i = 0;
  let chIdx = 0;
  let inBlock = false;
  const chapters: Chapter[] = [];
  // Structural substrate, pushed from the SAME pass that builds `html`. Each
  // block records its role, source span, plain text, and owning chapter (0 =
  // forematter). The structural model (manuscriptStructure.ts) groups these.
  const blocks: StructuralBlock[] = [];
  const block = (role: StructuralBlock['role'], start: number, end: number, text: string, level?: number) =>
    blocks.push({ role, sourceStart: start, sourceEnd: end, text: text.trim(), level, chapterIndex: chIdx });

  while (i < lines.length) {
    const line = lines[i];

    // Skip HTML comments (e.g. <!-- title: ... -->)
    if (/^<!--[\s\S]*?-->\s*$/.test(line.trim())) { i++; continue; }

    // ── Chapter heading (# ) ──
    if (/^# /.test(line)) {
      if (inBlock) html += '</div>';
      chIdx++;
      const title = stripChapterLabel(line.replace(/^# /, '').trim());
      const id = `ch-${chIdx}`;
      chapters.push({ index: chIdx, title, id });
      block('chapter-heading', lineStart[i], lineEnd(i), title);
      html +=
        `<span class="chapter-marker" id="${id}">` +
        `Chapter ${String(chIdx).padStart(2, '0')}</span>` +
        `<h1${src(lineStart[i], lineEnd(i))}>${inline(title)}</h1>` +
        `<div class="chapter-block">`;
      inBlock = true;
      i++;
      continue;
    }

    // ── Section headings ──
    if (/^## /.test(line)) {
      const text = line.replace(/^## /, '').trim();
      block('subheading', lineStart[i], lineEnd(i), text, 2);
      html += `<h2${src(lineStart[i], lineEnd(i))}>${inline(text)}</h2>`;
      i++;
      continue;
    }
    if (/^### /.test(line)) {
      const text = line.replace(/^### /, '').trim();
      block('subheading', lineStart[i], lineEnd(i), text, 3);
      html += `<h3${src(lineStart[i], lineEnd(i))}>${inline(text)}</h3>`;
      i++;
      continue;
    }

    // ── Horizontal rule / scene break ──
    // Tight runs (`***`, `---`, `___`) AND the spaced/glyph forms real manuscripts
    // overwhelmingly use: "* * *", "- - -", "· · ·", bullet/em-dash rows. Rule:
    // once whitespace is removed the line is ≥3 separator glyphs and nothing else.
    // Excludes `=` (setext underline, handled below) and backtick (code fence).
    const sepOnly = line.trim().replace(/\s+/g, '');
    if (sepOnly.length >= 3 && /^[*\-_·•—–]+$/.test(sepOnly)) {
      block('scene-break', lineStart[i], lineEnd(i), '');
      html += '<hr>';
      i++;
      continue;
    }

    // ── Block quote ──
    if (/^> /.test(line)) {
      const bqStart = i;
      let bq = '';
      let bqText = '';
      while (i < lines.length && /^> /.test(lines[i])) {
        const inner = lines[i].replace(/^> /, '');
        bq += inline(inner) + ' ';
        bqText += inner + ' ';
        i++;
      }
      block('blockquote', lineStart[bqStart], lineEnd(i - 1), bqText);
      html += `<blockquote${src(lineStart[bqStart], lineEnd(i - 1))}>${bq.trim()}</blockquote>`;
      continue;
    }

    // ── Unordered list ──
    if (/^[-*+] /.test(line)) {
      const listStart = i;
      let listText = '';
      html += '<ul>';
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        const item = lines[i].replace(/^[-*+] /, '');
        html += `<li>${inline(item)}</li>`;
        listText += item + '\n';
        i++;
      }
      html += '</ul>';
      block('list', lineStart[listStart], lineEnd(i - 1), listText);
      continue;
    }

    // ── Ordered list ──
    if (/^\d+\. /.test(line)) {
      const listStart = i;
      let listText = '';
      html += '<ol>';
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        const item = lines[i].replace(/^\d+\. /, '');
        html += `<li>${inline(item)}</li>`;
        listText += item + '\n';
        i++;
      }
      html += '</ol>';
      block('list', lineStart[listStart], lineEnd(i - 1), listText);
      continue;
    }

    // ── Code block ──
    if (/^```/.test(line)) {
      const codeStart = i;
      i++;
      let code = '';
      while (i < lines.length && !/^```/.test(lines[i])) {
        code += escHtml(lines[i]) + '\n';
        i++;
      }
      html += `<pre><code>${code}</code></pre>`;
      block('code', lineStart[codeStart], lineEnd(Math.min(i, lines.length - 1)), code);
      i++;
      continue;
    }

    // ── Blank line ──
    if (line.trim() === '') { i++; continue; }

    // ── Setext h1 (===) → chapter ──
    if (i + 1 < lines.length && /^={3,}\s*$/.test(lines[i + 1].trim())) {
      if (inBlock) html += '</div>';
      chIdx++;
      const title = stripChapterLabel(line.trim());
      const id = `ch-${chIdx}`;
      chapters.push({ index: chIdx, title, id });
      block('chapter-heading', lineStart[i], lineEnd(i + 1), title);
      html +=
        `<span class="chapter-marker" id="${id}">` +
        `Chapter ${String(chIdx).padStart(2, '0')}</span>` +
        `<h1${src(lineStart[i], lineEnd(i + 1))}>${inline(title)}</h1>` +
        `<div class="chapter-block">`;
      inBlock = true;
      i += 2;
      continue;
    }

    // ── Bare standalone number (chapter divider artifact) ──
    if (/^\s*\d{1,3}\s*$/.test(line)) { i++; continue; }

    // ── Paragraph (catch-all) ──
    const paraStart = i;
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
    if (para.trim()) {
      block('paragraph', lineStart[paraStart], lineEnd(i - 1), para);
      html += `<p${src(lineStart[paraStart], lineEnd(i - 1))}>${inline(para.trim())}</p>`;
    }
  }

  if (inBlock) html += '</div>';

  return { html, chapters, blocks };
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
