// ─── Supabase sync — data access layer ────────────────────────────────────────
// Pure data methods against the five Supabase tables + the Storage bucket.
// No orchestration here — the sync logic (who wins, pull vs push) lives in
// engine/storage/index.ts which owns the cache.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredManuscript, SnapshotRecord } from './provider';
import type { Annotation, Edit, ReaderSession, Snapshot } from '../types';

const BUCKET = 'manuscripts';

/** Bucket path for a snapshot's content-addressed markdown body. */
const snapshotBodyPath = (userId: string, msId: string, versionId: string) =>
  `${userId}/snapshots/${msId}/${versionId}.md`;

export class SupabaseSync {
  private sb: SupabaseClient;
  readonly userId: string;

  constructor(sb: SupabaseClient, userId: string) {
    this.sb = sb;
    this.userId = userId;
  }

  // ── Manuscripts ─────────────────────────────────────────────────────────────

  /** Fetch all manuscript metadata (no markdown). Fast — no Storage round-trips. */
  async fetchAllMetadata(): Promise<StoredManuscript[]> {
    const { data, error } = await this.sb
      .from('manuscripts')
      .select('data, revision')
      .eq('user_id', this.userId);
    if (error) throw error;
    return (data ?? []).map(row => ({
      ...(row.data as Omit<StoredManuscript, 'combinedMarkdown' | 'revision'>),
      revision: row.revision as number,
    }));
  }

  /** Push manuscript metadata to Supabase and upload markdown to Storage. */
  async pushManuscript(ms: StoredManuscript): Promise<void> {
    const { combinedMarkdown, revision, ...metaData } = ms;
    const { error } = await this.sb.from('manuscripts').upsert(
      { user_id: this.userId, manuscript_id: ms.id, revision: revision ?? 0, data: metaData },
      { onConflict: 'user_id,manuscript_id' }
    );
    if (error) throw error;
    if (combinedMarkdown) await this.pushMarkdown(ms.id, combinedMarkdown);
  }

  async pushMarkdown(id: string, markdown: string): Promise<void> {
    const { error } = await this.sb.storage
      .from(BUCKET)
      .upload(`${this.userId}/${id}.md`, new Blob([markdown], { type: 'text/markdown' }), { upsert: true });
    if (error) throw error;
  }

  async fetchMarkdown(id: string): Promise<string | null> {
    const { data, error } = await this.sb.storage
      .from(BUCKET)
      .download(`${this.userId}/${id}.md`);
    if (error) return null; // file doesn't exist yet
    return data.text();
  }

  async deleteManuscript(id: string): Promise<void> {
    await Promise.all([
      this.sb.from('manuscripts').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.from('manuscript_annotations').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.from('manuscript_edits').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.from('manuscript_sessions').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.from('manuscript_positions').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.from('manuscript_snapshots').delete().match({ user_id: this.userId, manuscript_id: id }),
      this.sb.storage.from(BUCKET).remove([`${this.userId}/${id}.md`]),
    ]);
    // Snapshot bodies live under a per-manuscript folder; list + remove them.
    const { data: bodies } = await this.sb.storage.from(BUCKET).list(`${this.userId}/snapshots/${id}`);
    if (bodies?.length) {
      await this.sb.storage.from(BUCKET).remove(bodies.map(f => `${this.userId}/snapshots/${id}/${f.name}`));
    }
  }

  // ── Child entities (annotations, edits, sessions, position) ─────────────────

  async pushAnnotations(id: string, data: Annotation[]): Promise<void> {
    const { error } = await this.sb.from('manuscript_annotations').upsert(
      { user_id: this.userId, manuscript_id: id, data },
      { onConflict: 'user_id,manuscript_id' }
    );
    if (error) throw error;
  }

  async fetchAnnotations(id: string): Promise<Annotation[]> {
    const { data } = await this.sb.from('manuscript_annotations')
      .select('data').match({ user_id: this.userId, manuscript_id: id }).maybeSingle();
    return (data?.data as Annotation[]) ?? [];
  }

  async pushEdits(id: string, data: Edit[]): Promise<void> {
    const { error } = await this.sb.from('manuscript_edits').upsert(
      { user_id: this.userId, manuscript_id: id, data },
      { onConflict: 'user_id,manuscript_id' }
    );
    if (error) throw error;
  }

  async fetchEdits(id: string): Promise<Edit[]> {
    const { data } = await this.sb.from('manuscript_edits')
      .select('data').match({ user_id: this.userId, manuscript_id: id }).maybeSingle();
    return (data?.data as Edit[]) ?? [];
  }

  async pushSessions(id: string, data: ReaderSession[]): Promise<void> {
    const { error } = await this.sb.from('manuscript_sessions').upsert(
      { user_id: this.userId, manuscript_id: id, data },
      { onConflict: 'user_id,manuscript_id' }
    );
    if (error) throw error;
  }

  async fetchSessions(id: string): Promise<ReaderSession[]> {
    const { data } = await this.sb.from('manuscript_sessions')
      .select('data').match({ user_id: this.userId, manuscript_id: id }).maybeSingle();
    return (data?.data as ReaderSession[]) ?? [];
  }

  async pushPosition(id: string, position: number): Promise<void> {
    const { error } = await this.sb.from('manuscript_positions').upsert(
      { user_id: this.userId, manuscript_id: id, position },
      { onConflict: 'user_id,manuscript_id' }
    );
    if (error) throw error;
  }

  async fetchPosition(id: string): Promise<number> {
    const { data } = await this.sb.from('manuscript_positions')
      .select('position').match({ user_id: this.userId, manuscript_id: id }).maybeSingle();
    return (data?.position as number) ?? 0;
  }

  // ── Snapshots (Phase 8) ─────────────────────────────────────────────────────
  // Requires a `manuscript_snapshots` table (user_id, manuscript_id, snapshot_id,
  // version_id, data jsonb, created_at; PK user_id+manuscript_id+snapshot_id) and
  // the existing Storage bucket. Snapshots are immutable + append-only, so sync is
  // presence-reconciled by snapshot_id rather than last-write-wins by revision.
  // Bodies are content-addressed and lazy-pulled (fetchSnapshotBody on first open).

  /** Upsert the index row and upload the content-addressed body (idempotent). */
  async pushSnapshot(snap: Snapshot): Promise<void> {
    const { markdown, ...rec } = snap;
    const { error } = await this.sb.from('manuscript_snapshots').upsert(
      { user_id: this.userId, manuscript_id: snap.manuscriptId, snapshot_id: snap.id,
        version_id: snap.versionId, created_at: snap.createdAt, data: rec },
      { onConflict: 'user_id,manuscript_id,snapshot_id' }
    );
    if (error) throw error;
    await this.sb.storage.from(BUCKET).upload(
      snapshotBodyPath(this.userId, snap.manuscriptId, snap.versionId),
      new Blob([markdown], { type: 'text/markdown' }), { upsert: true });
  }

  /** Snapshot records for a manuscript — meta + frozen children, but NO markdown
   *  bodies (those stay in the bucket and lazy-pull on first open). Used by the
   *  cold-sync index reconcile to learn which snapshots exist remotely. */
  async fetchSnapshotRecords(id: string): Promise<SnapshotRecord[]> {
    const { data } = await this.sb.from('manuscript_snapshots')
      .select('data').match({ user_id: this.userId, manuscript_id: id });
    return (data ?? []).map(row => row.data as SnapshotRecord);
  }

  /** One snapshot's frozen markdown body (lazy-pulled on first open/compare). */
  async fetchSnapshotBody(id: string, versionId: string): Promise<string | null> {
    const { data, error } = await this.sb.storage.from(BUCKET)
      .download(snapshotBodyPath(this.userId, id, versionId));
    if (error) return null;
    return data.text();
  }

  async deleteSnapshot(id: string, snapshotId: string): Promise<void> {
    await this.sb.from('manuscript_snapshots').delete()
      .match({ user_id: this.userId, manuscript_id: id, snapshot_id: snapshotId });
  }
}
