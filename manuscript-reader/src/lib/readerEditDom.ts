// DOM helpers for reader edit-mode markdown shortcuts (browser-only).

import type { MarkdownBlockPromote } from '../engine/manuscript/editMarkdownShortcut';

const LEAF = 'p, blockquote, h2, h3, h4, li';

export function lineTextBeforeCaretInChapterBlock(
  block: HTMLElement,
): { leaf: HTMLElement; line: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node: Node = range.startContainer;
  const leaf = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))
    ?.closest?.(LEAF) as HTMLElement | null;
  if (!leaf || !block.contains(leaf)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(leaf);
  pre.setEnd(range.startContainer, range.startOffset);
  const line = pre.toString().split('\n')[0] ?? '';
  return { leaf, line };
}

function replaceLeaf(leaf: HTMLElement, tag: string, title: string) {
  const el = document.createElement(tag);
  el.textContent = title;
  leaf.replaceWith(el);
}

export function applyMarkdownPromoteInBlock(
  block: HTMLElement,
  leaf: HTMLElement,
  promote: MarkdownBlockPromote,
): 'chapter-split' | 'replaced' {
  if (promote.kind === 'chapter') {
    splitChapterAtParagraph(block, leaf, promote.title);
    return 'chapter-split';
  }
  if (promote.kind === 'blockquote') {
    replaceLeaf(leaf, 'blockquote', promote.title);
    return 'replaced';
  }
  const tag = promote.level === 2 ? 'h2' : promote.level === 3 ? 'h3' : 'h4';
  replaceLeaf(leaf, tag, promote.title);
  return 'replaced';
}

/** Turn `# Title` at a paragraph into a new chapter (h1 + following body). */
export function splitChapterAtParagraph(block: HTMLElement, p: HTMLElement, title: string) {
  const newBlock = document.createElement('div');
  newBlock.className = 'chapter-block';
  let n = p.nextSibling;
  while (n) {
    const next = n.nextSibling;
    newBlock.appendChild(n);
    n = next;
  }
  p.remove();

  const id = `ch-split-${Date.now()}`;
  const marker = document.createElement('span');
  marker.className = 'chapter-marker';
  marker.id = id;
  marker.textContent = 'Chapter';

  const h1 = document.createElement('h1');
  h1.id = id;
  h1.textContent = title;

  block.after(marker, h1, newBlock);
}
