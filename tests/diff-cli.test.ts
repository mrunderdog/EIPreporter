import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import type { ProposalRecord } from "../src/types.ts";

test("diff CLI prints persisted change event counts", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-"));
  const databasePath = join(directory, "events.sqlite");
  const db = openDatabase(databasePath);

  try {
    insertSnapshot(db, [
      makeRecord("EIP-1", "Draft", "hash-a"),
      makeRecord("ERC-20", "Review", "hash-b"),
    ]);
    insertSnapshot(db, [
      makeRecord("EIP-1", "Final", "hash-a2"),
      makeRecord("ERC-20", "Withdrawn", "hash-b"),
      makeRecord("ERC-40", "Draft", "hash-d"),
    ]);
  } finally {
    db.close();
  }

  try {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", resolve("src/cli/diff.ts"), "--db", databasePath],
      { cwd: resolve("."), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout.trim(),
      [
        "New proposals: 1",
        "Status changes: 2",
        "Final transitions: 1",
        "Withdrawn transitions: 1",
        "Content changes: 1",
      ].join("\n"),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
