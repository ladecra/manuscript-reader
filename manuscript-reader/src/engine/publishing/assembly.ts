// ─── Publishing assembly state — the stage model over readiness ───────────────
// `computePublishReadiness` answers "is each element present?"; this layer answers
// "where is the author in assembling this edition?" — grouping the item-level
// checks into the navigable STAGES the Studio rail walks (Structure → Matter →
// Details → Preview), plus the format and export summary that frame them.
//
// This is deliberately a publishing *state* model, not a rail helper: the rail is
// today's only consumer, but progress indicators, hub entry points, publication
// profiles, and onboarding are all expected to read the same shape. So it returns a
// container (`PublishingAssembly`) callers can grow into, not a bare stage array.
// Pure, browser-independent, testable — the rail is presentation over this.

import {
  computePublishReadiness, summarizeReadiness,
  type ArtifactFormat, type ReadinessItem, type ReadinessSummary, type PublishReadinessInput,
} from './readiness';

export type AssemblyStageId = 'structure' | 'matter' | 'details' | 'preview';

/** complete = green check; optional-open = gray check (work available, none
 *  required); attention = a required gap; not-applicable = this format omits the
 *  stage entirely (e.g. matter for an agent submission). */
export type AssemblyStageStatus = 'complete' | 'optional-open' | 'attention' | 'not-applicable';

export interface AssemblyStage {
  id: AssemblyStageId;
  label: string;
  status: AssemblyStageStatus;
  /** The Studio center pane this stage opens. */
  prepPane: 'chapters' | 'matter' | 'details' | 'preview';
  /** Short rail sub-line, e.g. "12 chapters" or "Not used for agent submission". */
  summary?: string;
}

export interface PublishingAssembly {
  format: ArtifactFormat;
  stages: AssemblyStage[];
  /** Item-level export readiness for this format (drives footer + export gate). */
  readiness: ReadinessSummary;
  /** Whether a file can be produced at all (source text present). Distinct from
   *  readiness: export is a confirm-on-gaps action, not blocked by missing items. */
  canExport: boolean;
}

/** Formats that render an authored front/back-matter apparatus. An agent
 *  submission (smf) and toolchain markdown (md) do not, so the Matter stage is
 *  not-applicable for them — shown, never an error. */
const MATTER_FORMATS: ArtifactFormat[] = ['docx', 'pdf', 'epub'];

const STAGE_LABEL: Record<AssemblyStageId, string> = {
  structure: 'Structure',
  matter: 'Front & back matter',
  details: 'Publishing details',
  preview: 'Preview',
};

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Roll a set of readiness items into a stage status: a required gap is
 *  attention, an optional gap is optional-open, all-present is complete, and an
 *  empty set is optional-open (nothing tracked, but the stage still applies). */
function statusFromItems(items: ReadinessItem[]): AssemblyStageStatus {
  if (!items.length) return 'optional-open';
  if (items.some(i => i.required && !i.met)) return 'attention';
  if (items.some(i => !i.met)) return 'optional-open';
  return 'complete';
}

function matterNotApplicableReason(format: ArtifactFormat): string {
  return format === 'smf' ? 'Not used for agent submission' : 'Not used for this format';
}

function detailsSummary(items: ReadinessItem[]): string {
  const missingReq = items.filter(i => i.required && !i.met).length;
  if (missingReq) return plural(missingReq, 'required detail') + ' missing';
  const missingOpt = items.filter(i => !i.met).length;
  if (missingOpt) return plural(missingOpt, 'optional detail') + ' open';
  return 'All details set';
}

/** The whole assembly state for a manuscript + target format. `hasSource` is the
 *  screen's `canExport` (source markdown present); it defaults to "structure was
 *  built", a fair proxy since the structure is parsed from that markdown. */
export function computeAssembly(
  input: PublishReadinessInput,
  format: ArtifactFormat,
  opts: { hasSource?: boolean } = {},
): PublishingAssembly {
  const items = computePublishReadiness(input, format);
  const readiness = summarizeReadiness(items);
  const hasSource = opts.hasSource ?? !!input.structure;

  const chapters = input.structure?.chapters ?? [];
  const matterCount = (input.structure?.frontMatter.length ?? 0) + (input.structure?.backMatter.length ?? 0);

  // Structure: not driven by readiness items (there are none for it) — chapters
  // exist or they don't. The read-only chapter map can't be "confirmed" yet, so
  // existence is the honest bar (a `structureConfirmedAt` flag is a follow-on).
  const structure: AssemblyStage = {
    id: 'structure',
    label: STAGE_LABEL.structure,
    prepPane: 'chapters',
    status: chapters.length ? 'complete' : 'attention',
    summary: chapters.length ? plural(chapters.length, 'chapter') : 'No chapters detected',
  };

  const detailItems = items.filter(i => i.action === 'details');
  const details: AssemblyStage = {
    id: 'details',
    label: STAGE_LABEL.details,
    prepPane: 'details',
    status: statusFromItems(detailItems),
    summary: detailsSummary(detailItems),
  };

  const matterApplies = MATTER_FORMATS.includes(format);
  const matterItems = items.filter(i => i.action === 'matter');
  const matter: AssemblyStage = {
    id: 'matter',
    label: STAGE_LABEL.matter,
    prepPane: 'matter',
    status: matterApplies ? statusFromItems(matterItems) : 'not-applicable',
    summary: matterApplies
      ? (matterCount ? plural(matterCount, 'section') : 'Optional — none added')
      : matterNotApplicableReason(format),
  };

  // Preview is a v1 stub: structure + matter-order summary, full typeset render
  // ships with the PDF route. Always optional-open until then.
  const preview: AssemblyStage = {
    id: 'preview',
    label: STAGE_LABEL.preview,
    prepPane: 'preview',
    status: 'optional-open',
    summary: 'Sample preview',
  };

  return {
    format,
    stages: [structure, matter, details, preview],
    readiness,
    canExport: hasSource,
  };
}
