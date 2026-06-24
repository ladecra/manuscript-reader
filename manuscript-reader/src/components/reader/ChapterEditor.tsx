import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { htmlToMarkdownBlocks } from '../../engine/manuscript/blockEdit';

interface ChapterEditorProps {
  chapterTitle: string;
  initialHtml: string;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  tapY?: number;
  charOffset?: number;
}

// Map a plain-text character offset (from the chapter block's text content) to the
// nearest ProseMirror document position so TipTap can restore the cursor after mount.
/* eslint-disable @typescript-eslint/no-explicit-any */
function charOffsetToPmPos(doc: any, charOffset: number | undefined): number {
  if (charOffset === undefined) return 1;
  let chars = 0;
  let result = 1;
  let found = false;
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (found) return false;
    if (node.isText) {
      const len: number = node.text.length;
      if (chars + len > charOffset) { result = pos + (charOffset - chars); found = true; }
      else chars += len;
      return false;
    }
    return true;
  });
  return result;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function ChapterEditor({ chapterTitle, initialHtml, onSave, onCancel, tapY, charOffset }: ChapterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] }, // h1 is reserved for chapter titles
        codeBlock: false,               // not part of our prose grammar
      }),
    ],
    content: initialHtml,
    autofocus: false,
  });

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(htmlToMarkdownBlocks(editor.getHTML()));
  }, [editor, onSave]);

  // Place the cursor where the tap landed and open the editor with that same line
  // under the finger — otherwise mounting TipTap (which replaces the whole scrolled
  // #content) jumps the viewport to the chapter top. Two rAFs so TipTap has laid out
  // its content before we measure caret coordinates.
  useEffect(() => {
    if (!editor) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const pmPos = charOffsetToPmPos(editor.state.doc, charOffset);
      editor.commands.setTextSelection(pmPos);
      editor.commands.focus();
      if (tapY !== undefined) {
        // coordsAtPos is viewport-relative; nudge the page so the caret sits back
        // at the tap's Y. Guard against the caret being off the laid-out doc.
        const caret = editor.view.coordsAtPos(pmPos);
        if (caret) window.scrollBy(0, caret.top - tapY);
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSave]);

  return (
    <div className="chapter-editor">
      <div className="chapter-editor-header">
        <span className="chapter-editor-eyebrow">Manuscript view · editing</span>
        <span className="chapter-editor-title">{chapterTitle}</span>
      </div>
      <EditorContent editor={editor} className="chapter-editor-content" />
      <div className="chapter-editor-hint">⌘S to save · Esc to cancel · ⌘B bold · ⌘I italic</div>

      {/* Fixed action bar — always reachable without scrolling back to the top
          (the old top-only Save was a real pain on long chapters / mobile). */}
      <div className="chapter-editor-bar" role="toolbar" aria-label="Editing actions">
        <button className="chapter-editor-cancel" onClick={onCancel} type="button">Cancel</button>
        <button className="chapter-editor-save" onClick={handleSave} type="button">Save &amp; close</button>
      </div>
    </div>
  );
}
