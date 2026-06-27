import { useCallback } from 'react';
import { useReaderStore } from '../state/readerStore';
import { useLibraryStore } from '../state/libraryStore';
import { showToast } from '../components/ui/Toast';
import type { ExportManuscriptMeta } from '../engine/exports/manuscriptMarkdown';
import type { ExtentRequest } from '../engine/exports/manuscriptExtent';

export type ManuscriptArtifactFormat = 'epub' | 'docx' | 'md';

/** The single home for *publishable artifact* exports (EPUB · publication DOCX ·
 *  SMF · working Markdown). Both the manuscript hub and the Publishing Studio call
 *  this so the bytes are produced by exactly one code path; collaboration exports
 *  (report, share-reader, revision log) stay in the hub — they're a different intent.
 *
 *  Self-contained: reads the open manuscript + library from the stores and assembles
 *  `exportMeta` fresh on every call so an export always reflects the latest saved
 *  title-page details. The export *source* is always the current working markdown
 *  (`combinedMarkdown`) — the Studio's "save a version" step is a safety capture, not
 *  the bytes we ship. */
export function useManuscriptArtifactExports() {
  const manuscript = useReaderStore(s => s.manuscript);
  const library = useLibraryStore(s => s.library);

  const exportMeta = useCallback((): ExportManuscriptMeta => ({
    title: library.find(m => m.id === manuscript?.id)?.metadata.title ?? manuscript?.metadata.title ?? '',
    author: manuscript?.metadata.author,
    publishing: manuscript?.metadata.publishing,
  }), [library, manuscript]);

  const exportManuscript = useCallback(async (format: ManuscriptArtifactFormat, markdownOverride?: string) => {
    if (!manuscript) return;
    const md = markdownOverride ?? manuscript.metadata.combinedMarkdown;
    if (!md) { showToast('Manuscript not cached — re-import the file to export it.'); return; }
    try {
      if (format === 'md') {
        const { exportManuscriptMarkdown } = await import('../engine/exports/manuscriptMarkdown');
        exportManuscriptMarkdown(exportMeta(), manuscript.id, md);
      } else if (format === 'epub') {
        const { exportManuscriptEpub } = await import('../engine/exports/manuscriptEpub');
        exportManuscriptEpub(exportMeta(), manuscript.id, md);
      } else {
        showToast('Building manuscript…');
        const { exportManuscriptDocx } = await import('../engine/exports/manuscriptDocx');
        await exportManuscriptDocx(exportMeta(), manuscript.id, md);
      }
      showToast('Manuscript exported.');
    } catch (e) { console.error('Manuscript export error:', e); showToast('Export failed — see console.'); }
  }, [manuscript, exportMeta]);

  const exportSmf = useCallback(async (request: ExtentRequest, markdownOverride?: string) => {
    if (!manuscript) return;
    const md = markdownOverride ?? manuscript.metadata.combinedMarkdown;
    if (!md) { showToast('Manuscript not cached — re-import the file to export it.'); return; }
    try {
      showToast('Building submission…');
      const { exportManuscriptSmfDocx } = await import('../engine/exports/manuscriptSmfDocx');
      await exportManuscriptSmfDocx(exportMeta(), manuscript.id, md, request);
      showToast('Submission manuscript exported.');
    } catch (e) { console.error('SMF export error:', e); showToast('Export failed — see console.'); }
  }, [manuscript, exportMeta]);

  return { exportMeta, exportManuscript, exportSmf };
}
