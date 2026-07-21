import assert from "node:assert/strict";
import test from "node:test";
import { diffRecords, summarizeChanges } from "../src/diff.ts";
import type { ProposalRecord } from "../src/types.ts";

test("detects new proposals, status transitions, and content hash changes", () => {
  const previous = [
    makeRecord("EIP-1", "Draft", "hash-a"),
    makeRecord("ERC-20", "Review", "hash-b"),
    makeRecord("ERC-30", "Draft", "hash-c"),
  ];
  const current = [
    makeRecord("EIP-1", "Final", "hash-a2"),
    makeRecord("ERC-20", "Withdrawn", "hash-b"),
    makeRecord("ERC-30", "Draft", "hash-c"),
    makeRecord("ERC-40", "Draft", "hash-d"),
  ];

  const changes = diffRecords(previous, current);

  assert.deepEqual(
    changes.map((change) => change.type),
    [
      "status_change",
      "final_transition",
      "content_hash_change",
      "status_change",
      "withdrawn_transition",
      "new_proposal",
    ],
  );

  assert.deepEqual(summarizeChanges(changes), {
    new_proposal: 1,
    status_change: 2,
    final_transition: 1,
    withdrawn_transition: 1,
    content_hash_change: 1,
  });

  const contentChange = changes.find((change) => change.type === "content_hash_change");
  assert.deepEqual(contentChange?.changedFiles, ["EIPS/eip-1.md"]);
  assert.deepEqual(contentChange?.changedSections, ["Frontmatter: status"]);
  assert.equal(contentChange?.diffEvidence, "rawContentHash changed between snapshots");
});

test("uses a safe fallback when changed sections are unknown", () => {
  const previous = [makeRecord("ERC-777", "Draft", "hash-a")];
  const current = [makeRecord("ERC-777", "Draft", "hash-b")];

  const [change] = diffRecords(previous, current);

  assert.equal(change.type, "content_hash_change");
  assert.deepEqual(change.changedFiles, ["ERCS/erc-777.md"]);
  assert.equal(change.changedSections, null);
  assert.equal(
    change.diffSummary,
    "Recent proposal content changed; section-level diff not available.",
  );
});

function makeRecord(proposalId: string, status: string, rawContentHash: string): ProposalRecord {
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
    discussionTo: null,
    sourceRepo: kind === "ERC" ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: kind === "ERC" ? `ERCS/erc-${rawNumber}.md` : `EIPS/eip-${rawNumber}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash,
  };
}
