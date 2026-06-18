// ─── Supabase sync — data access layer ────────────────────────────────────────
// Pure data methods against the five Supabase tables + the Storage bucket.
// No orchestration here — the sync logic (who wins, pull vs push) lives in
// engine/storage/index.ts which owns the cache.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredManuscript } from './provider';
import type { Annotation, Edit, ReaderSession } from '../types';

const BUCKET = 'manuscripts';

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
      this.sb.storage.from(BUCKET).remove([`${this.userId}/${id}.md`]),
    ]);
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
}
