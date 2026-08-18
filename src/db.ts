import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { diffRecords } from "./diff.ts";
import type { ChangeEvent, DiscussionHeatItem, EmergingActivitySnapshot, EmergingLayer, ProposalChange, ProposalRecord, SnapshotInfo } from "./types.ts";

export type AppDatabase = DatabaseSync;

export function openDatabase(path: string): AppDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

export function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS proposal_snapshots (
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      proposal_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT,
      status TEXT,
      proposal_type TEXT,
      category TEXT,
      created TEXT,
      updated TEXT,
      discussion_to TEXT,
      discussion_links_json TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      body_excerpt TEXT,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      source_repo TEXT NOT NULL,
      source_path TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      raw_content_hash TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, proposal_id)
    );

    CREATE INDEX IF NOT EXISTS idx_proposal_snapshots_proposal_id
      ON proposal_snapshots (proposal_id);

    CREATE TABLE IF NOT EXISTS change_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      previous_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (
        event_type IN (
          'new_proposal',
          'status_change',
          'final_transition',
          'withdrawn_transition',
          'content_hash_change'
        )
      ),
      proposal_id TEXT NOT NULL,
      previous_status TEXT,
      current_status TEXT,
      previous_hash TEXT,
      current_hash TEXT,
      title TEXT,
      source_repo TEXT NOT NULL,
      source_path TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      changed_files_json TEXT NOT NULL DEFAULT '[]',
      changed_sections_json TEXT,
      diff_summary TEXT,
      diff_evidence TEXT,
      detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (snapshot_id, proposal_id, event_type)
    );

    CREATE INDEX IF NOT EXISTS idx_change_events_snapshot_id
      ON change_events (snapshot_id);

    CREATE INDEX IF NOT EXISTS idx_change_events_proposal_id
      ON change_events (proposal_id);

    CREATE TABLE IF NOT EXISTS discussion_activity_cache (
      discussion_url TEXT PRIMARY KEY,
      fetched_at TEXT NOT NULL,
      activity_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emerging_activity_snapshots (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      reply_count INTEGER,
      view_count INTEGER,
      participant_count INTEGER,
      source_repo TEXT,
      url TEXT,
      title TEXT,
      category TEXT,
      status TEXT,
      created_at TEXT,
      last_activity_at TEXT,
      primary_proposal_id TEXT,
      related_proposal_ids_json TEXT NOT NULL DEFAULT '[]',
      extracted_eip_ids_json TEXT NOT NULL DEFAULT '[]',
      author_logins_json TEXT NOT NULL DEFAULT '[]',
      labels_json TEXT NOT NULL DEFAULT '[]',
      facts_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (source, source_id, collected_at)
    );

    CREATE INDEX IF NOT EXISTS idx_emerging_activity_lookup
      ON emerging_activity_snapshots (source, source_id, collected_at);

    CREATE TABLE IF NOT EXISTS emerging_alert_state (
      issue_id TEXT PRIMARY KEY,
      last_status TEXT NOT NULL,
      last_heat_score INTEGER NOT NULL,
      last_alerted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emerging_layers (
      generated_at TEXT PRIMARY KEY,
      layer_json TEXT NOT NULL
    );
  `);

  addColumnIfMissing(db, "proposal_snapshots", "description", "TEXT");
  addColumnIfMissing(db, "proposal_snapshots", "body_excerpt", "TEXT");
  addColumnIfMissing(db, "proposal_snapshots", "keywords_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "proposal_snapshots", "discussion_links_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "change_events", "changed_files_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "change_events", "changed_sections_json", "TEXT");
  addColumnIfMissing(db, "change_events", "diff_summary", "TEXT");
  addColumnIfMissing(db, "change_events", "diff_evidence", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "source_repo", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "url", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "title", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "category", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "status", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "created_at", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "last_activity_at", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "primary_proposal_id", "TEXT");
  addColumnIfMissing(db, "emerging_activity_snapshots", "related_proposal_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "emerging_activity_snapshots", "extracted_eip_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "emerging_activity_snapshots", "author_logins_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "emerging_activity_snapshots", "labels_json", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, "emerging_activity_snapshots", "facts_json", "TEXT NOT NULL DEFAULT '{}'");
}

export function insertEmergingActivitySnapshots(db: AppDatabase, snapshots: EmergingActivitySnapshot[]): void {
  if (!snapshots.length) return;
  const insert = db.prepare(`
    INSERT OR REPLACE INTO emerging_activity_snapshots (
      source,
      source_id,
      collected_at,
      reply_count,
      view_count,
      participant_count,
      source_repo,
      url,
      title,
      category,
      status,
      created_at,
      last_activity_at,
      primary_proposal_id,
      related_proposal_ids_json,
      extracted_eip_ids_json,
      author_logins_json,
      labels_json,
      facts_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN");
  try {
    for (const snapshot of snapshots) {
      insert.run(
        snapshot.source,
        snapshot.sourceId,
        snapshot.collectedAt,
        snapshot.replyCount ?? null,
        snapshot.viewCount ?? null,
        snapshot.participantCount ?? null,
        snapshot.sourceRepo ?? null,
        snapshot.url ?? null,
        snapshot.title ?? null,
        snapshot.category ?? null,
        snapshot.status ?? null,
        snapshot.createdAt ?? null,
        snapshot.lastActivityAt ?? null,
        snapshot.primaryProposalId ?? null,
        JSON.stringify(snapshot.relatedProposalIds ?? []),
        JSON.stringify(snapshot.extractedEipIds ?? []),
        JSON.stringify(snapshot.authorLogins ?? []),
        JSON.stringify(snapshot.labels ?? []),
        JSON.stringify(snapshot.facts ?? {}),
      );
    }
    const newestInsertedAt = maxIso(snapshots.map((snapshot) => snapshot.collectedAt));
    const cutoff = new Date(newestInsertedAt.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM emerging_activity_snapshots WHERE collected_at < ?").run(cutoff);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function maxIso(values: string[]): Date {
  const times = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  return new Date(times.length ? Math.max(...times) : 0);
}

export function getEmergingActivitySnapshots(
  db: AppDatabase,
  source: string,
  sourceId: string,
  since: string,
): EmergingActivitySnapshot[] {
  const rows = db.prepare(`
    SELECT
      source,
      source_id AS sourceId,
      collected_at AS collectedAt,
      reply_count AS replyCount,
      view_count AS viewCount,
      participant_count AS participantCount,
      source_repo AS sourceRepo,
      url,
      title,
      category,
      status,
      created_at AS createdAt,
      last_activity_at AS lastActivityAt,
      primary_proposal_id AS primaryProposalId,
      related_proposal_ids_json AS relatedProposalIdsJson,
      extracted_eip_ids_json AS extractedEipIdsJson,
      author_logins_json AS authorLoginsJson,
      labels_json AS labelsJson,
      facts_json AS factsJson
    FROM emerging_activity_snapshots
    WHERE source = ? AND source_id = ? AND collected_at >= ?
    ORDER BY collected_at ASC
  `).all(source, sourceId, since) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    source: row.source as EmergingActivitySnapshot["source"],
    sourceId: String(row.sourceId),
    collectedAt: String(row.collectedAt),
    replyCount: row.replyCount === null || row.replyCount === undefined ? undefined : Number(row.replyCount),
    viewCount: row.viewCount === null || row.viewCount === undefined ? undefined : Number(row.viewCount),
    participantCount: row.participantCount === null || row.participantCount === undefined ? undefined : Number(row.participantCount),
    sourceRepo: row.sourceRepo as EmergingActivitySnapshot["sourceRepo"] | undefined,
    url: row.url ? String(row.url) : undefined,
    title: row.title ? String(row.title) : undefined,
    category: row.category ? String(row.category) : undefined,
    status: row.status ? String(row.status) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
    lastActivityAt: row.lastActivityAt ? String(row.lastActivityAt) : undefined,
    primaryProposalId: row.primaryProposalId ? String(row.primaryProposalId) : undefined,
    relatedProposalIds: parseJsonArray(String(row.relatedProposalIdsJson ?? "[]")),
    extractedEipIds: parseJsonArray(String(row.extractedEipIdsJson ?? "[]")),
    authorLogins: parseJsonArray(String(row.authorLoginsJson ?? "[]")),
    labels: parseJsonArray(String(row.labelsJson ?? "[]")),
    facts: parseJsonObject(row.factsJson),
  }));
}

export function getLatestEmergingActivitySnapshotsSince(db: AppDatabase, since: string): EmergingActivitySnapshot[] {
  const rows = db.prepare(`
    SELECT
      s.source,
      s.source_id AS sourceId,
      s.collected_at AS collectedAt,
      s.reply_count AS replyCount,
      s.view_count AS viewCount,
      s.participant_count AS participantCount,
      s.source_repo AS sourceRepo,
      s.url,
      s.title,
      s.category,
      s.status,
      s.created_at AS createdAt,
      s.last_activity_at AS lastActivityAt,
      s.primary_proposal_id AS primaryProposalId,
      s.related_proposal_ids_json AS relatedProposalIdsJson,
      s.extracted_eip_ids_json AS extractedEipIdsJson,
      s.author_logins_json AS authorLoginsJson,
      s.labels_json AS labelsJson,
      s.facts_json AS factsJson
    FROM emerging_activity_snapshots s
    JOIN (
      SELECT source, source_id, MAX(collected_at) AS collected_at
      FROM emerging_activity_snapshots
      WHERE collected_at >= ?
      GROUP BY source, source_id
    ) latest
      ON latest.source = s.source
      AND latest.source_id = s.source_id
      AND latest.collected_at = s.collected_at
    ORDER BY s.collected_at DESC
  `).all(since) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    source: row.source as EmergingActivitySnapshot["source"],
    sourceId: String(row.sourceId),
    collectedAt: String(row.collectedAt),
    replyCount: row.replyCount === null ? undefined : Number(row.replyCount),
    viewCount: row.viewCount === null ? undefined : Number(row.viewCount),
    participantCount: row.participantCount === null ? undefined : Number(row.participantCount),
    sourceRepo: row.sourceRepo as EmergingActivitySnapshot["sourceRepo"] | undefined,
    url: row.url ? String(row.url) : undefined,
    title: row.title ? String(row.title) : undefined,
    category: row.category ? String(row.category) : undefined,
    status: row.status ? String(row.status) : undefined,
    createdAt: row.createdAt ? String(row.createdAt) : undefined,
    lastActivityAt: row.lastActivityAt ? String(row.lastActivityAt) : undefined,
    primaryProposalId: row.primaryProposalId ? String(row.primaryProposalId) : undefined,
    relatedProposalIds: parseJsonArray(String(row.relatedProposalIdsJson ?? "[]")),
    extractedEipIds: parseJsonArray(String(row.extractedEipIdsJson ?? "[]")),
    authorLogins: parseJsonArray(String(row.authorLoginsJson ?? "[]")),
    labels: parseJsonArray(String(row.labelsJson ?? "[]")),
    facts: parseJsonObject(row.factsJson),
  }));
}

export function insertEmergingLayer(db: AppDatabase, layer: EmergingLayer): void {
  db.prepare(`
    INSERT OR REPLACE INTO emerging_layers (generated_at, layer_json)
    VALUES (?, ?)
  `).run(layer.generatedAt, JSON.stringify(layer));
}

export function getLatestEmergingLayerSince(db: AppDatabase, since: string): EmergingLayer | null {
  const row = db.prepare(`
    SELECT layer_json AS layerJson
    FROM emerging_layers
    WHERE generated_at >= ?
    ORDER BY generated_at DESC
    LIMIT 1
  `).get(since) as { layerJson: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.layerJson) as EmergingLayer;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function getEmergingAlertState(
  db: AppDatabase,
  issueId: string,
): { issueId: string; lastStatus: string; lastHeatScore: number; lastAlertedAt: string } | null {
  const row = db.prepare(`
    SELECT
      issue_id AS issueId,
      last_status AS lastStatus,
      last_heat_score AS lastHeatScore,
      last_alerted_at AS lastAlertedAt
    FROM emerging_alert_state
    WHERE issue_id = ?
  `).get(issueId) as { issueId: string; lastStatus: string; lastHeatScore: number; lastAlertedAt: string } | undefined;
  return row ?? null;
}

export function upsertEmergingAlertState(
  db: AppDatabase,
  issueId: string,
  status: string,
  heatScore: number,
  alertedAt: string,
): void {
  db.prepare(`
    INSERT INTO emerging_alert_state (issue_id, last_status, last_heat_score, last_alerted_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(issue_id) DO UPDATE SET
      last_status = excluded.last_status,
      last_heat_score = excluded.last_heat_score,
      last_alerted_at = excluded.last_alerted_at
  `).run(issueId, status, heatScore, alertedAt);
}

export function getCachedDiscussionActivity(
  db: AppDatabase,
  discussionUrl: string,
): { fetchedAt: string; activity: Partial<DiscussionHeatItem> } | null {
  const row = db
    .prepare("SELECT fetched_at AS fetchedAt, activity_json AS activityJson FROM discussion_activity_cache WHERE discussion_url = ?")
    .get(discussionUrl) as { fetchedAt: string; activityJson: string } | undefined;
  if (!row) return null;

  try {
    const parsed = JSON.parse(row.activityJson) as unknown;
    return {
      fetchedAt: row.fetchedAt,
      activity: parsed && typeof parsed === "object" ? parsed as Partial<DiscussionHeatItem> : {},
    };
  } catch {
    return null;
  }
}

export function upsertCachedDiscussionActivity(
  db: AppDatabase,
  discussionUrl: string,
  fetchedAt: string,
  activity: Partial<DiscussionHeatItem>,
): void {
  db.prepare(`
    INSERT INTO discussion_activity_cache (discussion_url, fetched_at, activity_json)
    VALUES (?, ?, ?)
    ON CONFLICT(discussion_url) DO UPDATE SET
      fetched_at = excluded.fetched_at,
      activity_json = excluded.activity_json
  `).run(discussionUrl, fetchedAt, JSON.stringify(activity));
}

export function insertSnapshot(db: AppDatabase, records: ProposalRecord[]): SnapshotInfo {
  db.exec("BEGIN");
  try {
    const previousSnapshot = db
      .prepare("SELECT id FROM snapshots ORDER BY id DESC LIMIT 1")
      .get() as { id: number } | undefined;
    const previousRecords = previousSnapshot ? getSnapshotRecords(db, previousSnapshot.id) : [];

    const snapshot = db
      .prepare("INSERT INTO snapshots DEFAULT VALUES RETURNING id, collected_at")
      .get() as { id: number; collected_at: string };

    const insert = db.prepare(`
      INSERT INTO proposal_snapshots (
        snapshot_id,
        proposal_id,
        kind,
        number,
        title,
        status,
        proposal_type,
        category,
        created,
        updated,
        discussion_to,
        discussion_links_json,
        description,
        body_excerpt,
        keywords_json,
        source_repo,
        source_path,
        canonical_url,
        raw_content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const record of records) {
      insert.run(
        snapshot.id,
        record.proposalId,
        record.kind,
        record.number,
        record.title,
        record.status,
        record.proposalType,
        record.category,
        record.created,
        record.updated,
        record.discussionTo,
        JSON.stringify(record.discussionLinks ?? (record.discussionTo ? [record.discussionTo] : [])),
        record.description ?? null,
        record.bodyExcerpt ?? null,
        JSON.stringify(record.keywords ?? []),
        record.sourceRepo,
        record.sourcePath,
        record.canonicalUrl,
        record.rawContentHash,
      );
    }

    if (previousSnapshot) {
      insertChangeEvents(
        db,
        snapshot.id,
        previousSnapshot.id,
        diffRecords(previousRecords, records),
      );
    }

    db.exec("COMMIT");
    return { id: snapshot.id, collectedAt: snapshot.collected_at, proposalCount: records.length };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listSnapshots(db: AppDatabase, limit = 2): SnapshotInfo[] {
  const rows = db
    .prepare(
      `
        SELECT
          snapshots.id,
          snapshots.collected_at AS collectedAt,
          COUNT(proposal_snapshots.proposal_id) AS proposalCount
        FROM snapshots
        LEFT JOIN proposal_snapshots ON proposal_snapshots.snapshot_id = snapshots.id
        GROUP BY snapshots.id
        ORDER BY snapshots.id DESC
        LIMIT ?
      `,
    )
    .all(limit) as Array<{ id: number; collectedAt: string; proposalCount: number }>;

  return rows.map((row) => ({
    id: row.id,
    collectedAt: row.collectedAt,
    proposalCount: Number(row.proposalCount),
  }));
}

export function getSnapshotRecords(db: AppDatabase, snapshotId: number): ProposalRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          proposal_id AS proposalId,
          kind,
          number,
          title,
          status,
          proposal_type AS proposalType,
          category,
          created,
          updated,
          discussion_to AS discussionTo,
          discussion_links_json AS discussionLinksJson,
          description,
          body_excerpt AS bodyExcerpt,
          keywords_json AS keywordsJson,
          source_repo AS sourceRepo,
          source_path AS sourcePath,
          canonical_url AS canonicalUrl,
          raw_content_hash AS rawContentHash
        FROM proposal_snapshots
        WHERE snapshot_id = ?
        ORDER BY kind, number
      `,
    )
    .all(snapshotId) as unknown as Array<Omit<ProposalRecord, "keywords" | "discussionLinks"> & {
      keywordsJson: string;
      discussionLinksJson: string;
    }>;

  return rows.map(({ keywordsJson, discussionLinksJson, ...row }) => {
    const discussionLinks = parseJsonArray(discussionLinksJson);
    const discussionUrl = discussionLinks[0] ?? row.discussionTo ?? null;
    return {
    ...row,
      discussionUrl,
      discussionLinks,
      discussionSignal: {
        hasDiscussion: discussionLinks.length > 0 || Boolean(row.discussionTo),
        discussionUrl,
        discussionLinks: discussionLinks.length > 0 ? discussionLinks : row.discussionTo ? [row.discussionTo] : [],
        discussionScore: discussionUrl ? 10 : null,
        discussionSummary: discussionUrl
          ? "Discussion metadata available; activity details unavailable."
          : null,
        discussionEvidence: discussionUrl ? "stored discussion metadata" : null,
      },
      keywords: parseJsonArray(keywordsJson),
    };
  });
}

export function getChangeEvents(db: AppDatabase, snapshotId: number): ChangeEvent[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          snapshot_id AS snapshotId,
          previous_snapshot_id AS previousSnapshotId,
          event_type AS type,
          proposal_id AS proposalId,
          previous_status AS previousStatus,
          current_status AS currentStatus,
          previous_hash AS previousHash,
          current_hash AS currentHash,
          title,
          source_repo AS sourceRepo,
          source_path AS sourcePath,
          canonical_url AS canonicalUrl,
          changed_files_json AS changedFilesJson,
          changed_sections_json AS changedSectionsJson,
          diff_summary AS diffSummary,
          diff_evidence AS diffEvidence,
          detected_at AS detectedAt
        FROM change_events
        WHERE snapshot_id = ?
        ORDER BY proposal_id, id
      `,
    )
    .all(snapshotId) as unknown as Array<Omit<ChangeEvent, "changedFiles" | "changedSections"> & {
      changedFilesJson: string;
      changedSectionsJson: string | null;
    }>;

  return rows.map(({ changedFilesJson, changedSectionsJson, ...row }) => ({
    ...row,
    changedFiles: parseJsonArray(changedFilesJson),
    changedSections: changedSectionsJson ? parseJsonArray(changedSectionsJson) : null,
  }));
}

export function getChangeEventsSince(db: AppDatabase, since: string, until: string): ChangeEvent[] {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          snapshot_id AS snapshotId,
          previous_snapshot_id AS previousSnapshotId,
          event_type AS type,
          proposal_id AS proposalId,
          previous_status AS previousStatus,
          current_status AS currentStatus,
          previous_hash AS previousHash,
          current_hash AS currentHash,
          title,
          source_repo AS sourceRepo,
          source_path AS sourcePath,
          canonical_url AS canonicalUrl,
          changed_files_json AS changedFilesJson,
          changed_sections_json AS changedSectionsJson,
          diff_summary AS diffSummary,
          diff_evidence AS diffEvidence,
          detected_at AS detectedAt
        FROM change_events
        WHERE detected_at >= ? AND detected_at <= ?
        ORDER BY detected_at DESC, proposal_id, id
      `,
    )
    .all(since, until) as unknown as Array<Omit<ChangeEvent, "changedFiles" | "changedSections"> & {
      changedFilesJson: string;
      changedSectionsJson: string | null;
    }>;

  return rows.map(({ changedFilesJson, changedSectionsJson, ...row }) => ({
    ...row,
    changedFiles: parseJsonArray(changedFilesJson),
    changedSections: changedSectionsJson ? parseJsonArray(changedSectionsJson) : null,
  }));
}

function insertChangeEvents(
  db: AppDatabase,
  snapshotId: number,
  previousSnapshotId: number,
  changes: ProposalChange[],
): void {
  const insert = db.prepare(`
    INSERT INTO change_events (
      snapshot_id,
      previous_snapshot_id,
      event_type,
      proposal_id,
      previous_status,
      current_status,
      previous_hash,
      current_hash,
      title,
      source_repo,
      source_path,
      canonical_url,
      changed_files_json,
      changed_sections_json,
      diff_summary,
      diff_evidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const change of changes) {
    insert.run(
      snapshotId,
      previousSnapshotId,
      change.type,
      change.proposalId,
      change.previousStatus,
      change.currentStatus,
      change.previousHash,
      change.currentHash,
      change.title,
      change.sourceRepo,
      change.sourcePath,
      change.canonicalUrl,
      JSON.stringify(change.changedFiles ?? []),
      change.changedSections ? JSON.stringify(change.changedSections) : null,
      change.diffSummary ?? null,
      change.diffEvidence ?? null,
    );
  }
}

function addColumnIfMissing(
  db: AppDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
