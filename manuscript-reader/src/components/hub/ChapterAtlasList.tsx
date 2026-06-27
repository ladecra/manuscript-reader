import { useMemo } from 'react';
import {
  chapterLengthInsightFlag,
  chapterLengthRatio,
  formatChapterLengthRatio,
  meanChapterWordCount,
  splitTwoColumns,
} from '../../engine/prose/chapterLengthOutlier';

export type ChapterAtlasRow = {
  key: string;
  index: number;
  title: string;
  sceneBreakCount?: number;
};

const TWO_COLUMN_MIN = 15;

function ChapterAtlasRowView({
  row,
  words,
  meanWords,
}: {
  row: ChapterAtlasRow;
  words: number | undefined;
  meanWords: number;
}) {
  const title = row.title.trim() || 'Untitled chapter';
  const ratio = words != null && words > 0 && meanWords > 0 ? chapterLengthRatio(words, meanWords) : null;
  const flag = ratio != null ? chapterLengthInsightFlag(ratio) : null;

  return (
    <li className="chapter-atlas-row">
      <span className="chapter-atlas-num">{row.index}</span>
      <span className={`chapter-atlas-title${row.title.trim() ? '' : ' is-untitled'}`}>{title}</span>
      <span className="chapter-atlas-meta">
        {words != null && words > 0 && (
          <span className="chapter-atlas-words">{words.toLocaleString()}</span>
        )}
        {flag && ratio != null && (
          <span
            className={`chapter-length-flag chapter-length-flag--${flag}`}
            title={flag === 'short' ? 'Much shorter than your average chapter' : 'Much longer than your average chapter'}
          >
            {formatChapterLengthRatio(ratio)}
          </span>
        )}
        {(row.sceneBreakCount ?? 0) > 0 && (
          <span className="chapter-atlas-scenes">
            {row.sceneBreakCount} scene break{row.sceneBreakCount !== 1 ? 's' : ''}
          </span>
        )}
      </span>
    </li>
  );
}

function ChapterAtlasColumn({
  rows,
  wordsByIndex,
  meanWords,
}: {
  rows: ChapterAtlasRow[];
  wordsByIndex: Map<number, number>;
  meanWords: number;
}) {
  return (
    <ol className="chapter-atlas-list">
      {rows.map(row => (
        <ChapterAtlasRowView
          key={row.key}
          row={row}
          words={wordsByIndex.get(row.index)}
          meanWords={meanWords}
        />
      ))}
    </ol>
  );
}

/** Read-only chapter list with word counts and strict length flags (studio map). */
export function ChapterAtlasList({
  rows,
  wordsByIndex,
  twoColumnMin = TWO_COLUMN_MIN,
}: {
  rows: ChapterAtlasRow[];
  wordsByIndex: Map<number, number>;
  twoColumnMin?: number;
}) {
  const meanWords = useMemo(
    () => meanChapterWordCount(rows.map(r => wordsByIndex.get(r.index) ?? 0)),
    [rows, wordsByIndex],
  );

  const useTwoCol = rows.length > twoColumnMin;
  const [left, right] = useMemo(
    () => (useTwoCol ? splitTwoColumns(rows) : [rows, [] as ChapterAtlasRow[]]),
    [rows, useTwoCol],
  );

  if (!rows.length) return null;

  if (!useTwoCol) {
    return (
      <ChapterAtlasColumn rows={rows} wordsByIndex={wordsByIndex} meanWords={meanWords} />
    );
  }

  return (
    <div className="chapter-atlas-columns">
      <ChapterAtlasColumn rows={left} wordsByIndex={wordsByIndex} meanWords={meanWords} />
      <ChapterAtlasColumn rows={right} wordsByIndex={wordsByIndex} meanWords={meanWords} />
    </div>
  );
}
