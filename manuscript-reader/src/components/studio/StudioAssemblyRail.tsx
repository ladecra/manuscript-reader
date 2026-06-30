import { CheckIcon, ChevronRightIcon } from '../ui/Icons';
import type { AssemblyStage, AssemblyStageStatus } from '../../engine/publishing/assembly';

type StagePane = AssemblyStage['prepPane'];

const STATUS_WORD: Record<AssemblyStageStatus, string> = {
  complete: 'Complete',
  'optional-open': 'Optional',
  attention: 'Needs attention',
  'not-applicable': 'Not applicable',
};

function StageMark({ status }: { status: AssemblyStageStatus }) {
  if (status === 'attention') {
    return <span className="studio-stage-mark studio-stage-mark--attention" aria-hidden="true" />;
  }
  return <CheckIcon size={13} className="studio-stage-mark studio-stage-mark--check" aria-hidden="true" />;
}

export interface AssemblyUnmetItem {
  id: string;
  label: string;
  pane: StagePane;
}

interface StudioAssemblyRailProps {
  /** Edition title line, e.g. "Print edition (Word)". */
  railTitle: string;
  stages: AssemblyStage[];
  activePane: StagePane | null;
  onOpenStage: (pane: StagePane) => void;
  /** One-line readiness summary (same copy as the hero note). */
  summaryLine: string;
  /** Unmet required details, compact checklist under the export button. */
  unmet: AssemblyUnmetItem[];
  primaryLabel: string;
  canExport: boolean;
  disabledHint: string;
  onExport: () => void;
  className?: string;
}

/** The assembly navigation column: revisitable stages with per-format status, a
 *  fixed export footer, and the only required-gaps checklist (center no longer
 *  duplicates it). Pure presentation over `computeAssembly`. */
export function StudioAssemblyRail({
  railTitle,
  stages,
  activePane,
  onOpenStage,
  summaryLine,
  unmet,
  primaryLabel,
  canExport,
  disabledHint,
  onExport,
  className,
}: StudioAssemblyRailProps) {
  const shownUnmet = unmet.slice(0, 3);
  const moreUnmet = unmet.length - shownUnmet.length;

  return (
    <aside className={`hub-tools studio-assembly-rail${className ? ` ${className}` : ''}`}>
      <nav className="hub-tools-nav" aria-label="Edition assembly">
        <h2 className="studio-assembly-title">{railTitle}</h2>
        {summaryLine && <div className="studio-assembly-summary">{summaryLine}</div>}

        <div className="instrument-nav hub-tools-group-nav studio-assembly-stages">
          {stages.map(stage => {
            const active = activePane === stage.prepPane;
            return (
              <button
                key={stage.id}
                type="button"
                className={`instrument-item instrument-item--tool studio-stage-item studio-stage-item--${stage.status}${active ? ' active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => onOpenStage(stage.prepPane)}
              >
                <span className="instrument-item-icon"><StageMark status={stage.status} /></span>
                <span className="instrument-item-stack">
                  <span className="instrument-item-label">{stage.label}</span>
                  {stage.summary && <span className="instrument-item-sub">{stage.summary}</span>}
                </span>
                <span className="visually-hidden">{STATUS_WORD[stage.status]}</span>
                <span className="instrument-item-chevron"><ChevronRightIcon size={10} /></span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="studio-format-actions">
        <button
          type="button"
          className="hub-continue-btn btn-fill studio-format-primary"
          disabled={!canExport}
          title={!canExport ? disabledHint : undefined}
          onClick={onExport}
        >
          {primaryLabel}
        </button>
      </div>

      <div className="hub-tools-footer studio-assembly-footer">
        {unmet.length === 0 ? (
          <div className="studio-assembly-ready">
            <CheckIcon size={12} className="hub-tools-saved-icon" aria-hidden="true" />
            <span>{summaryLine}</span>
          </div>
        ) : (
          <>
            <div className="instrument-group-label studio-assembly-footer-label">Still required</div>
            <ul className="studio-assembly-unmet">
              {shownUnmet.map(item => (
                <li key={item.id}>
                  <button type="button" className="studio-assembly-unmet-link" onClick={() => onOpenStage(item.pane)}>
                    {item.label}
                  </button>
                </li>
              ))}
              {moreUnmet > 0 && <li className="studio-assembly-unmet-more">and {moreUnmet} more</li>}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
