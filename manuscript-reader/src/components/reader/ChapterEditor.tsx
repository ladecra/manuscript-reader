import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { htmlToMarkdownBlocks } from '../../engine/manuscript/blockEdit';

interface ChapterEditorProps {
  chapterTitle: string;
  initialHtml: string;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  /** Viewport Y at tap (full manuscript); keeps the caret line under the finger. */
  tapClientY?: number;
  /** Plain-text offset in the reader chapter block at tap time. */
  charOffset?: number;
}

// Map a plain-text character offset (from the chapter block's text content) to the
// nearest ProseMirror document position so TipTap can restore the cursor after mount.
/* eslint-disable @typescript-eslint/no-explicit-any */
function charOffsetToPmPos(doc: any, charOffset: number | undefined): number {
  const max = Math.max(1, doc.content.size - 1);
  if (charOffset === undefined) return 1;
  let chars = 0;
  let result = 1;
  let found = false;
  let lastTextEnd = 1;
  doc.nodesBetween(0, doc.content.size, (node: any, pos: number) => {
    if (found) return false;
    if (node.isText) {
      const len: number = node.text.length;
      lastTextEnd = pos + len;
      if (chars + len > charOffset) { result = pos + (charOffset - chars); found = true; }
      else chars += len;
      return false;
    }
    return true;
  });
  if (!found && charOffset >= chars) result = lastTextEnd;
  return Math.min(Math.max(1, result), max);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function ChapterEditor({
  chapterTitle,
  initialHtml,
  onSave,
  onCancel,
  tapClientY,
  charOffset,
}: ChapterEditorProps) {
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

  // Place the caret near the tap without TipTap/browser auto-scroll fighting us.
  // Caller resets window scroll to 0 before mount so alignment math is stable.
  useEffect(() => {
    if (!editor) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const { view } = editor;
      const pmPos = charOffsetToPmPos(editor.state.doc, charOffset);

      editor.commands.setTextSelection(pmPos);

      let lockY = window.scrollY;
      if (tapClientY != null) {
        const caret = view.coordsAtPos(pmPos);
        lockY = Math.max(0, window.scrollY + caret.top - tapClientY);
        window.scrollTo(0, lockY);
      }

      editor.commands.focus(pmPos, { scrollIntoView: false });

      // iOS Safari still nudges the viewport on focus — put it back once.
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - lockY) > 2) window.scrollTo(0, lockY);
      });
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the editor instance is ready
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

      <div className="chapter-editor-bar" role="toolbar" aria-label="Editing actions">
        <button className="chapter-editor-cancel" onClick={onCancel} type="button">Cancel</button>
        <button className="chapter-editor-save" onClick={handleSave} type="button">Save &amp; close</button>
      </div>
    </div>
  );
}
