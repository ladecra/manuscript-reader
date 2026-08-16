# Archive: beta-loop wind-down snapshot (August 2026)

**Status:** Preserved reference — not the vNext product roadmap  
**Archive branch:** `archive/beta-loop-2026-08`  
**Working branch for vNext:** `vnext` (same commit as this archive)  
**Source branch name at capture:** `perf/parse-cache-and-marking`

## Purpose

This commit preserves the full application tree after the beta-loop / publishing-studio wind-down and before the journal-first vNext IA cut. It includes:

- Parser and ingestion work on `perf/parse-cache-and-marking`
- Removed publishing studio, auth panel, workspace rail, and Supabase sync **from the vNext working tree** (files still exist in this commit’s history for recovery)
- Cloudflare share worker (`files/worker/`) and client sync adapters (`files/manuscript-reader/src/sync/`)
- Hub, reports, and share surfaces not yet stripped from routes (Phase 1)

Recover beta-loop UI, Supabase sync sources, or studio code from this commit or branch. Do not treat this snapshot as the product identity going forward.

## Commit

**SHA:** `725b5b94350fbef4ad2050757cba494ab96b5306`

## Check baseline (Phase 0, 2026-08-16)

Run from `files/manuscript-reader/`:

| Check | Result | Notes |
| --- | --- | --- |
| `npm run lint` | Pass | ESLint clean |
| `npm run build` | Pass | `tsc -b && vite build`; wrangler log warnings in sandbox only |
| `npm run check-fixtures` | Pass | All golden fixtures including `plaintext-pasted-frontmatter.txt` |
| `npm run check-position-intent` | Pass | Reading vs work bookmarks |
| `npm run check-sessions` | Pass | Session merge and editorial signal fixtures |

## High-risk paths preserved in this snapshot

**Deleted in tree (recover from this commit):**

- `files/manuscript-reader/src/engine/storage/supabaseClient.ts`
- `files/manuscript-reader/src/engine/storage/supabaseSync.ts`
- `files/manuscript-reader/src/components/auth/AuthPanel.tsx`
- `files/manuscript-reader/src/components/studio/**`
- `files/manuscript-reader/src/components/layout/ManuscriptWorkspaceRail.tsx`
- `files/manuscript-reader/src/screens/PublishingStudioScreen.tsx`
- `files/manuscript-reader/fixtures/check-delete-sync.mjs`
- `files/manuscript-reader/fixtures/check-snapshot-sync.mjs`

**Added / untracked at capture (now tracked):**

- `files/worker/**`
- `files/manuscript-reader/src/sync/**`
- `files/manuscript-reader/src/state/demoSeed.ts`
- Beta-loop check fixtures: `check-convergence.mjs`, `check-workflow-status.mjs`

## Planning documents (workspace, outside `files/` git)

- `raw/vellibris-vnext-constitution.md`
- `raw/vnext-inventory.md`
- `raw/vellibris-vnext-designer-brief.md`

## Next steps

Work continues on branch **`vnext`**. Phase 1: IA cut per inventory §9–§10. Personal Supabase sync restoration is Phase 5; do not delete migration paths before replacement is proven.
