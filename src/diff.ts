import type { ChangeSummary, ProposalChange, ProposalRecord } from "./types.ts";

export function diffRecords(previous: ProposalRecord[], current: ProposalRecord[]): ProposalChange[] {
  const previousById = new Map(previous.map((record) => [record.proposalId, record]));
  const changes: ProposalChange[] = [];

  for (const currentRecord of current) {
    const previousRecord = previousById.get(currentRecord.proposalId);
    if (!previousRecord) {
      changes.push(makeChange("new_proposal", null, currentRecord));
      continue;
    }

    if (normalizeStatus(previousRecord.status) !== normalizeStatus(currentRecord.status)) {
      changes.push(makeChange("status_change", previousRecord, currentRecord));
    }

    if (isTransition(previousRecord.status, currentRecord.status, "final")) {
      changes.push(makeChange("final_transition", previousRecord, currentRecord));
    }

    if (isTransition(previousRecord.status, currentRecord.status, "withdrawn")) {
      changes.push(makeChange("withdrawn_transition", previousRecord, currentRecord));
    }

    if (previousRecord.rawContentHash !== currentRecord.rawContentHash) {
      changes.push(makeChange("content_hash_change", previousRecord, currentRecord));
    }
  }

  return changes.sort((a, b) => a.proposalId.localeCompare(b.proposalId, undefined, { numeric: true }));
}

export function summarizeChanges(changes: Array<Pick<ProposalChange, "type">>): ChangeSummary {
  const summary: ChangeSummary = {
    new_proposal: 0,
    status_change: 0,
    final_transition: 0,
    withdrawn_transition: 0,
    content_hash_change: 0,
  };

  for (const change of changes) {
    summary[change.type] += 1;
  }

  return summary;
}

function isTransition(previousStatus: string | null, currentStatus: string | null, target: string): boolean {
  return normalizeStatus(previousStatus) !== target && normalizeStatus(currentStatus) === target;
}

function normalizeStatus(status: string | null): string | null {
  return status?.trim().toLowerCase() || null;
}

function makeChange(
  type: ProposalChange["type"],
  previousRecord: ProposalRecord | null,
  currentRecord: ProposalRecord,
): ProposalChange {
  const changedFiles = type === "content_hash_change" || type === "new_proposal"
    ? [currentRecord.sourcePath]
    : [];
  const changedSections = detectChangedSections(previousRecord, currentRecord);
  const hasContentChange = type === "content_hash_change";

  return {
    type,
    proposalId: currentRecord.proposalId,
    previousStatus: previousRecord?.status ?? null,
    currentStatus: currentRecord.status,
    previousHash: previousRecord?.rawContentHash ?? null,
    currentHash: currentRecord.rawContentHash,
    title: currentRecord.title,
    sourceRepo: currentRecord.sourceRepo,
    sourcePath: currentRecord.sourcePath,
    canonicalUrl: currentRecord.canonicalUrl,
    changedFiles,
    changedSections,
    diffSummary: hasContentChange
      ? "Recent proposal content changed; section-level diff not available."
      : type === "new_proposal"
        ? "New proposal added to the tracked repository."
        : "Proposal metadata changed.",
    diffEvidence: hasContentChange
      ? "rawContentHash changed between snapshots"
      : type === "new_proposal"
        ? "proposal was absent from the previous snapshot"
        : "status metadata changed between snapshots",
  };
}

function detectChangedSections(
  previousRecord: ProposalRecord | null,
  currentRecord: ProposalRecord,
): string[] | null {
  if (!previousRecord || previousRecord.rawContentHash === currentRecord.rawContentHash) return null;

  const sections = new Set<string>();
  if (previousRecord.title !== currentRecord.title) sections.add("Frontmatter: title");
  if (previousRecord.status !== currentRecord.status) sections.add("Frontmatter: status");
  if (previousRecord.proposalType !== currentRecord.proposalType) sections.add("Frontmatter: type");
  if (previousRecord.category !== currentRecord.category) sections.add("Frontmatter: category");
  if (previousRecord.updated !== currentRecord.updated) sections.add("Frontmatter: updated");
  if (previousRecord.discussionTo !== currentRecord.discussionTo) sections.add("Frontmatter: discussions-to");
  if (previousRecord.description !== currentRecord.description) sections.add("Frontmatter: description");

  return sections.size > 0 ? [...sections] : null;
}
