import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { htmlToMarkdownBlocks } from '../../engine/manuscript/blockEdit';

interface ChapterEditorProps {
  chapterTitle: string;
  initialHtml: string;
  onSave: (markdown: string) => void;
  onCancel: () => void;
}

export function ChapterEditor({ chapterTitle, initialHtml, onSave, onCancel }: ChapterEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] }, // h1 is reserved for chapter titles
        codeBlock: false,               // not part of our prose grammar
      }),
    ],
    content: initialHtml,
    autofocus: 'start',
  });

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(htmlToMarkdownBlocks(editor.getHTML()));
  }, [editor, onSave]);

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
        <span className="chapter-editor-title">{chapterTitle}</span>
        <div className="chapter-editor-actions">
          <button className="chapter-editor-cancel" onClick={onCancel} type="button">Cancel</button>
          <button className="chapter-editor-save" onClick={handleSave} type="button">Save</button>
        </div>
      </div>
      <EditorContent editor={editor} className="chapter-editor-content" />
      <div className="chapter-editor-hint">⌘S to save · Esc to cancel · ⌘B bold · ⌘I italic</div>
    </div>
  );
}
