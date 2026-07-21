import assert from "node:assert/strict";
import test from "node:test";
import {
  getChangeEvents,
  getSnapshotRecords,
  insertSnapshot,
  listSnapshots,
  openDatabase,
} from "../src/db.ts";
import type { ProposalRecord } from "../src/types.ts";

test("stores and reads proposal snapshots", () => {
  const db = openDatabase(":memory:");

  try {
    const snapshot = insertSnapshot(db, [makeRecord("EIP-1")]);
    const snapshots = listSnapshots(db);
    const records = getSnapshotRecords(db, snapshot.id);

    assert.equal(snapshot.proposalCount, 1);
    assert.equal(snapshots.length, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].proposalId, "EIP-1");
    assert.equal(records[0].rawContentHash, "hash");
    assert.deepEqual(records[0].keywords, []);
    assert.deepEqual(records[0].discussionLinks, []);
    assert.equal(records[0].discussionSignal?.hasDiscussion, false);
  } finally {
    db.close();
  }
});

test("persists change events when a new snapshot is inserted", () => {
  const db = openDatabase(":memory:");

  try {
    const baseline = insertSnapshot(db, [
      makeRecord("EIP-1", "Draft", "hash-a"),
      makeRecord("ERC-20", "Review", "hash-b"),
      makeRecord("ERC-30", "Draft", "hash-c"),
    ]);
    assert.deepEqual(getChangeEvents(db, baseline.id), []);

    const current = insertSnapshot(db, [
      makeRecord("EIP-1", "Final", "hash-a2"),
      makeRecord("ERC-20", "Withdrawn", "hash-b"),
      makeRecord("ERC-30", "Draft", "hash-c"),
      makeRecord("ERC-40", "Draft", "hash-d"),
    ]);
    const events = getChangeEvents(db, current.id);

    assert.deepEqual(
      events.map((event) => event.type),
      [
        "status_change",
        "final_transition",
        "content_hash_change",
        "status_change",
        "withdrawn_transition",
        "new_proposal",
      ],
    );
    assert.ok(events.every((event) => event.snapshotId === current.id));
    assert.ok(events.every((event) => event.previousSnapshotId === baseline.id));

    const finalTransition = events.find((event) => event.type === "final_transition");
    assert.equal(finalTransition?.proposalId, "EIP-1");
    assert.equal(finalTransition?.previousStatus, "Draft");
    assert.equal(finalTransition?.currentStatus, "Final");
    assert.equal(finalTransition?.previousHash, "hash-a");
    assert.equal(finalTransition?.currentHash, "hash-a2");
    assert.deepEqual(finalTransition?.changedFiles, []);
    assert.match(finalTransition?.detectedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

    const contentChange = events.find((event) => event.type === "content_hash_change");
    assert.deepEqual(contentChange?.changedFiles, ["EIPS/eip-1.md"]);
    assert.deepEqual(contentChange?.changedSections, [
      "Frontmatter: status",
      "Frontmatter: description",
    ]);
    assert.equal(
      contentChange?.diffSummary,
      "Recent proposal content changed; section-level diff not available.",
    );
  } finally {
    db.close();
  }
});

function makeRecord(
  proposalId: string,
  status = "Draft",
  rawContentHash = "hash",
): ProposalRecord {
  const [kind, rawNumber] = proposalId.split("-");

  return {
    proposalId,
    kind: kind as ProposalRecord["kind"],
    number: Number(rawNumber),
    title: `${proposalId} title`,
    status,
    proposalType: "Standards Track",
    category: kind === "ERC" ? "ERC" : "Core",
    created: "2020-01-01",
    updated: null,
    discussionTo: proposalId === "ERC-20" ? "https://ethereum-magicians.org/t/erc-20" : null,
    discussionLinks: proposalId === "ERC-20" ? ["https://ethereum-magicians.org/t/erc-20"] : [],
    sourceRepo: kind === "ERC" ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: kind === "ERC" ? `ERCS/erc-${rawNumber}.md` : `EIPS/eip-${rawNumber}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash,
  };
}
