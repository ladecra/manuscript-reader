// ─── DEV-ONLY demo seed ──────────────────────────────────────────────────────
// Sample manuscripts for evaluating the redesign against the mockups. Seeded only
// when the app is opened with `?demo` in DEV — never in a production build, never
// without the flag — so it cannot pollute a real library. IDs are prefixed
// `demo-` so they're recognizable and removable. The share-loop numbers
// (shared / readerCount / newResponses) are the "target state" the sync worker
// (brief §3.2) will make real; here they stand in so the Library reads truthfully.
import type { StoredManuscript } from '../engine/storage/provider';
import type { Annotation, ReaderSession } from '../engine/types';

const DEMO_PREFIX = 'demo-';

function ts(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

// A little real prose so the reader/console aren't empty when opened from a demo
// row — several paragraphs per chapter so the book typesetting (drop cap, first-
// line indents, chapter rhythm, scene breaks) is actually evaluable in the reader.
function body(title: string, opening: string): string {
  return `<!-- title: ${title} -->

# Chapter One

${opening}

She had come here the summer she was nine, and the summer after, and every summer since that mattered. The weir had been her father's favourite argument against leaving. *Where else,* he used to say, *does the water work so hard to stay in one place?*

Now the fields above were somebody else's fields, and the house had a name she had not chosen, and still the river arrived each morning with the same brown patience and left each evening as something louder and more sure of itself.

A heron stood in the shallows below the fall, grey and folded, ignoring her with the particular thoroughness of wild things. She envied it the way one envies the very old: not the years, but the economy of movement, the sense that nothing further needed to be proved.

# Chapter Two

The morning came the way mornings did there — slowly, and then all at once, as if the light had been deciding.

By the time the bell rang in the village she had already walked the length of the low field twice, and the dew had soaked through her boots, and she had made and unmade the same decision a dozen times. There would be time for the village. The weir kept its own hour, and for a little while longer she intended to keep it with them.

He counted the years the way other men counted money, and found himself just as poor. It was not a thing he would have said aloud, but the river had a way of drawing such admissions out of a person, one cold morning at a time.
`;
}

interface DemoReader { name: string; progress: number; state?: 'reading' | 'finished'; }
interface DemoResponses { highlights: number; notes: number; questions: number; }

interface DemoSpec {
  id: string; title: string; author: string; genre: string;
  wordCount: number; chapterCount: number; importedAt: number;
  shared: boolean; readerCount?: number; newResponses?: number;
  readers?: DemoReader[]; responses?: DemoResponses;
  opening: string;
}

const SPECS: DemoSpec[] = [
  {
    id: `${DEMO_PREFIX}three-rivers`, title: 'Three Rivers', author: 'A. Morgan', genre: 'Literary Fiction',
    wordCount: 66798, chapterCount: 21, importedAt: ts(2026, 6, 28), shared: true, readerCount: 4, newResponses: 2,
    readers: [
      { name: 'Jane Doe', progress: 1.0, state: 'finished' },
      { name: 'Sam Lee', progress: 0.65, state: 'reading' },
      { name: 'Alex Kim', progress: 0.30, state: 'reading' },
      { name: 'Nadia West', progress: 0.82, state: 'reading' },
    ],
    responses: { highlights: 48, notes: 32, questions: 18 },
    opening: 'The river changed its mind at the weir. All morning it had come down slow and brown from the high fields, and then the stone lip caught it and the water remembered that it was a river after all.',
  },
  {
    id: `${DEMO_PREFIX}long-horizon`, title: 'The Long Horizon', author: 'A. Morgan', genre: 'Historical Fiction',
    wordCount: 82310, chapterCount: 24, importedAt: ts(2026, 6, 20), shared: true, readerCount: 5, newResponses: 1,
    readers: [
      { name: 'Priya Nair', progress: 1.0, state: 'finished' },
      { name: 'Tom Reyes', progress: 0.88, state: 'reading' },
      { name: 'Marion Ellis', progress: 0.52, state: 'reading' },
      { name: 'Devon Clarke', progress: 0.41, state: 'reading' },
      { name: 'Ruth Okafor', progress: 0.19, state: 'reading' },
    ],
    responses: { highlights: 41, notes: 27, questions: 14 },
    opening: 'They had been three weeks on the road when the mountains finally showed themselves, pale and enormous, like something remembered rather than seen.',
  },
  {
    id: `${DEMO_PREFIX}garden-below`, title: 'The Garden Below', author: 'A. Morgan', genre: 'Mystery',
    wordCount: 54203, chapterCount: 18, importedAt: ts(2026, 6, 12), shared: false,
    opening: 'The gate had been locked for as long as anyone could remember, which was exactly why Vivian decided, that particular Tuesday, to find out what it was locking away.',
  },
  {
    id: `${DEMO_PREFIX}night-tide`, title: 'Night Tide', author: 'A. Morgan', genre: 'Fantasy',
    wordCount: 91617, chapterCount: 27, importedAt: ts(2026, 5, 30), shared: true, readerCount: 4, newResponses: 9,
    readers: [
      { name: 'Cass Wynne', progress: 0.95, state: 'reading' },
      { name: 'Ibrahim Fadel', progress: 0.70, state: 'reading' },
      { name: 'Lena Sørensen', progress: 0.44, state: 'reading' },
      { name: 'Marcus Bell', progress: 0.12, state: 'reading' },
    ],
    responses: { highlights: 52, notes: 34, questions: 21 },
    opening: 'On the night the second moon rose, the tide came in carrying lights that were not reflections, and the harbourmaster did the only sensible thing: he rang the old bell and pretended he had not seen them.',
  },
  {
    id: `${DEMO_PREFIX}when-we-left`, title: 'When We Left', author: 'A. Morgan', genre: 'Contemporary',
    wordCount: 71442, chapterCount: 20, importedAt: ts(2026, 5, 18), shared: false,
    opening: 'We told ourselves it was temporary, the way you do, packing the car in the blue dark before the neighbours woke, as though leaving quietly made it less like leaving.',
  },
];

export const DEMO_PREFIX_ID = DEMO_PREFIX;

// ─── Demo feedback (real Annotation + ReaderSession objects) ──────────────────
// Aggregate roster numbers above make the Library read truthfully; these are the
// actual marks the REPORT computes over — crafted to land distinct readers on the
// SAME paragraphs of the shared demo prose, so the passage-convergence pass has
// real overlap to resolve (a cool cluster, a divided beat, a warm passage, and a
// lone one-voice). Quotes are substrings of `body()`'s Chapter One/Two paragraphs.
const RID = { jane: 'demo-r-jane', sam: 'demo-r-sam', alex: 'demo-r-alex', nadia: 'demo-r-nadia' };
const NAME: Record<string, string> = { [RID.jane]: 'Jane Doe', [RID.sam]: 'Sam Lee', [RID.alex]: 'Alex Kim', [RID.nadia]: 'Nadia West' };

interface DemoMark { rid: string; type: Annotation['type']; ch: number; chTitle: string; quote: string; }
const MARKS: DemoMark[] = [
  // Ch1 ¶4 (the heron) — COOL: three readers converge with concern
  { rid: RID.jane, type: 'question',   ch: 1, chTitle: 'Chapter One', quote: 'the particular thoroughness of wild things' },
  { rid: RID.sam,  type: 'question',   ch: 1, chTitle: 'Chapter One', quote: 'ignoring her with the particular thoroughness' },
  { rid: RID.alex, type: 'continuity', ch: 1, chTitle: 'Chapter One', quote: 'the economy of movement' },
  // Ch2 ¶3 (counted the years) — DIVIDED: two lean in, two flag it
  { rid: RID.jane,  type: 'highlight', ch: 2, chTitle: 'Chapter Two', quote: 'He counted the years the way other men counted money' },
  { rid: RID.sam,   type: 'highlight', ch: 2, chTitle: 'Chapter Two', quote: 'found himself just as poor' },
  { rid: RID.alex,  type: 'question',  ch: 2, chTitle: 'Chapter Two', quote: 'drawing such admissions out of a person' },
  { rid: RID.nadia, type: 'question',  ch: 2, chTitle: 'Chapter Two', quote: 'one cold morning at a time' },
  // Ch1 ¶2 (the summer she was nine) — WARM: two readers lean in, no concern
  { rid: RID.jane, type: 'highlight', ch: 1, chTitle: 'Chapter One', quote: 'the summer she was nine' },
  { rid: RID.sam,  type: 'note',      ch: 1, chTitle: 'Chapter One', quote: 'argument against leaving' },
  // Ch2 ¶1 (the morning came) — ONE VOICE: a single reader's concern
  { rid: RID.alex, type: 'question', ch: 2, chTitle: 'Chapter Two', quote: 'as if the light had been deciding' },
];

export interface DemoFeedback { annotations: Annotation[]; sessions: ReaderSession[]; }

/** Real annotations + sessions for a demo manuscript, or null when it has none.
 *  Only the flagship 'three-rivers' demo carries feedback (the report we open). */
export function demoFeedbackFor(manuscriptId: string): DemoFeedback | null {
  if (manuscriptId !== `${DEMO_PREFIX}three-rivers`) return null;
  const annotations: Annotation[] = MARKS.map((m, i) => ({
    id: `${manuscriptId}-ann-${i + 1}`,
    type: m.type,
    quote: m.quote,
    note: '',
    chapterTitle: m.chTitle,
    chapterIndex: m.ch,
    createdAt: ts(2026, 6, 29) + i * 1000,
    readerName: NAME[m.rid],
    readerId: m.rid,
    imported: true,
  }));
  const byReader = (rid: string) => annotations.filter(a => a.readerId === rid).map(a => a.id);
  const session = (rid: string, progress: number, done: boolean): ReaderSession => ({
    id: `${manuscriptId}-sess-${rid}`,
    manuscriptId,
    readerId: rid,
    readerName: NAME[rid],
    startedAt: ts(2026, 6, 28),
    completedAt: done ? ts(2026, 6, 30) : undefined,
    progress,
    annotationIds: byReader(rid),
  });
  const sessions: ReaderSession[] = [
    session(RID.jane, 1.0, true),
    session(RID.sam, 0.65, false),
    session(RID.alex, 0.30, false),
    session(RID.nadia, 0.82, false),
  ];
  return { annotations, sessions };
}

export function demoManuscripts(): StoredManuscript[] {
  return SPECS.map(s => ({
    id: s.id,
    title: s.title,
    author: s.author,
    wordCount: s.wordCount,
    chapterCount: s.chapterCount,
    lastOpened: s.importedAt,
    importedAt: s.importedAt,
    status: 'Draft',
    combinedMarkdown: body(s.title, s.opening),
    revision: 1,
    publishing: { genre: s.genre },
    shared: s.shared,
    readerCount: s.readerCount,
    newResponses: s.newResponses,
    readers: s.readers,
    responses: s.responses,
  }));
}
