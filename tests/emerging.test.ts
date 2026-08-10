import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, insertEmergingActivitySnapshots } from "../src/db.ts";
import {
  buildEmergingLayer,
  detectEmergingAlerts,
  extractProposalIds,
  resolveProposalIdentity,
} from "../src/emerging.ts";
import type { EmergingRawSignal } from "../src/types.ts";

test("resolves the same EIP from Magicians and GitHub PR into one issue", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "100", title: "EIP-9001: New transaction policy" }),
      githubSignal({ sourceId: "ethereum/EIPs#1", title: "Add EIP-9001 New transaction policy" }),
    ],
  });

  assert.equal(layer.issues.length, 1);
  assert.deepEqual(layer.issues[0]?.eipIds, ["EIP-9001"]);
  assert.deepEqual(new Set(layer.issues[0]?.sources), new Set(["ethereum_magicians", "github_pr"]));
});

test("keeps unnumbered unrelated topics separate", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "101", title: "Future issuance policy discussion" }),
      magiciansSignal({ sourceId: "102", title: "Wallet signature UX research" }),
    ],
  });

  assert.equal(layer.issues.length, 2);
  assert.ok(layer.issues.every((issue) => issue.eipIds.length === 0));
});

test("velocity lifts fast activity growth above an old large thread with minor activity", () => {
  const db = openDatabase(":memory:");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "fast", collectedAt: "2026-08-09T00:00:00.000Z", replyCount: 5, viewCount: 300, participantCount: 3 },
    { source: "ethereum_magicians", sourceId: "old", collectedAt: "2026-08-09T00:00:00.000Z", replyCount: 210, viewCount: 10000, participantCount: 45 },
  ]);

  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "fast", title: "EIP-9002: Fast emerging account abstraction issue", replyCount: 38, viewCount: 2100, participantCount: 13 }),
      magiciansSignal({ sourceId: "old", title: "EIP-9003: Old governance thread", createdAt: "2024-01-01T00:00:00.000Z", replyCount: 212, viewCount: 10100, participantCount: 45 }),
    ],
  });

  const fast = layer.issues.find((issue) => issue.eipIds.includes("EIP-9002"));
  const old = layer.issues.find((issue) => issue.eipIds.includes("EIP-9003"));
  assert.ok(fast && old);
  assert.ok(fast.heatScore > old.heatScore);
  assert.equal(fast.status, "HOT_ISSUE");
});

test("detects EARLY to HOT threshold crossing and suppresses duplicate alerts", () => {
  const db = openDatabase(":memory:");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "hot", collectedAt: "2026-08-09T00:00:00.000Z", replyCount: 4, viewCount: 200, participantCount: 2 },
  ]);
  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "hot", title: "EIP-9004: Issuance governance fork decision", replyCount: 55, viewCount: 3200, participantCount: 18 }),
    ],
  });

  const first = detectEmergingAlerts(db, layer, new Date("2026-08-10T00:01:00.000Z"));
  const second = detectEmergingAlerts(db, layer, new Date("2026-08-10T01:00:00.000Z"));
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});

test("missing participant count is unknown, not zero", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "unknown", title: "EIP-9005: Unknown participant metric", participantCount: undefined }),
    ],
  });

  assert.equal(layer.issues[0]?.metrics.participantCount, undefined);
  assert.ok(layer.issues[0]?.confidenceScore);
});

test("detects_fast_emerging_issue_before_official_repo_merge using historical-like EIP-8363 fixture", () => {
  const db = openDatabase(":memory:");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "8363-like", collectedAt: "2026-08-09T00:00:00.000Z", replyCount: 5, viewCount: 320, participantCount: 3 },
    { source: "github_pr", sourceId: "ethereum/EIPs#8363-like", collectedAt: "2026-08-09T00:00:00.000Z", replyCount: 1, participantCount: 1 },
  ]);

  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({
        sourceId: "8363-like",
        title: "EIP-8363: New protocol governance discussion",
        createdAt: "2026-08-07T00:00:00.000Z",
        replyCount: 42,
        viewCount: 2500,
        participantCount: 14,
      }),
      githubSignal({
        sourceId: "ethereum/EIPs#8363-like",
        title: "Draft EIP-8363 protocol governance proposal",
        replyCount: 7,
        participantCount: 3,
      }),
    ],
  });

  const issue = layer.issues.find((item) => item.eipIds.includes("EIP-8363"));
  assert.ok(issue);
  assert.equal(issue.status, "HOT_ISSUE");
  assert.ok(issue.heatScore >= 65);
});

test("cold-start detects a strong historical-like EIP-8363 issue without previous snapshots", () => {
  const db = openDatabase(":memory:");
  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({
        sourceId: "8363-cold-start",
        title: "EIP-8363: New protocol governance discussion",
        createdAt: "2026-08-07T00:00:00.000Z",
        replyCount: 42,
        viewCount: 2500,
        participantCount: 14,
      }),
      githubSignal({
        sourceId: "ethereum/EIPs#8363-cold-start",
        title: "Draft EIP-8363 protocol governance proposal",
        replyCount: 7,
        participantCount: 3,
      }),
    ],
  });

  const issue = layer.issues.find((item) => item.eipIds.includes("EIP-8363"));
  assert.ok(issue);
  assert.equal(issue.status, "HOT_ISSUE");
  assert.ok(issue.scoreBreakdown.some((item) => item.label === "Absolute Activity" && item.value > 0));
});

test("7-day delta is the primary production velocity signal", () => {
  const db = openDatabase(":memory:");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "weekly", collectedAt: "2026-08-03T00:00:00.000Z", replyCount: 10, viewCount: 700, participantCount: 4 },
  ]);

  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "weekly", title: "EIP-9009: Weekly wallet UX activity", replyCount: 35, viewCount: 2400, participantCount: 12 }),
    ],
  });

  const issue = layer.issues.find((item) => item.eipIds.includes("EIP-9009"));
  const weeklyVelocity = issue?.metrics.velocity.find((item) => item.windowHours === 168);
  assert.equal(weeklyVelocity?.replyDelta, 25);
  assert.equal(weeklyVelocity?.participantDelta, 8);
  assert.ok(issue?.scoreBreakdown.some((item) => item.label === "7-day Velocity" && item.value > 0));
});

test("negative regression does not mark simple noise as HOT", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "noise", title: "EIP-9006: Fresh topic with a few views", replyCount: 0, viewCount: 9, participantCount: 1 }),
    ],
  });

  assert.notEqual(layer.issues[0]?.status, "HOT_ISSUE");
});

test("extracts EIP and ERC ids without hardcoded proposal lists", () => {
  assert.deepEqual(extractProposalIds("Draft ERC 9007 and eip-9008"), ["ERC-9007", "EIP-9008"]);
});

test("entity resolution uses frontmatter primary and keeps title mentions as related references", () => {
  const identity = resolveProposalIdentity({
    title: "Slot-Based Equipment for ERC-6551 Accounts",
    frontmatterProposalId: "ERC-8216",
  });

  assert.equal(identity.primaryProposalId, "ERC-8216");
  assert.ok(identity.relatedProposalIds.includes("ERC-6551"));
});

test("entity resolution does not let title references override frontmatter primary", () => {
  const identity = resolveProposalIdentity({
    title: "Changes to EIP-1559 behavior",
    frontmatterProposalId: "EIP-9999",
  });

  assert.equal(identity.primaryProposalId, "EIP-9999");
  assert.ok(identity.relatedProposalIds.includes("EIP-1559"));
});

test("entity resolution can use title-leading proposal id when metadata is absent", () => {
  const identity = resolveProposalIdentity({
    title: "EIP-8363: Tapered Issuance Burn",
  });

  assert.equal(identity.primaryProposalId, "EIP-8363");
  assert.deepEqual(identity.relatedProposalIds, []);
});

test("merges sources with the same primary proposal id", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      githubSignal({
        sourceId: "ethereum/ercs#1",
        title: "Slot-Based Equipment for ERC-6551 Accounts",
        primaryProposalId: "ERC-8216",
        relatedProposalIds: ["ERC-6551"],
        extractedEipIds: ["ERC-8216", "ERC-6551"],
      }),
      magiciansSignal({
        sourceId: "topic-8216",
        title: "ERC-8216: Slot-Based Equipment",
        primaryProposalId: "ERC-8216",
        extractedEipIds: ["ERC-8216"],
      }),
    ],
  });

  assert.equal(layer.issues.length, 1);
  assert.equal(layer.issues[0]?.primaryProposalId, "ERC-8216");
  assert.deepEqual(new Set(layer.issues[0]?.sources), new Set(["github_pr", "ethereum_magicians"]));
  assert.ok(layer.issues[0]?.relatedProposalIds?.includes("ERC-6551"));
});

test("does not merge separate proposals that only share a related reference", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      githubSignal({
        sourceId: "ethereum/ercs#8216",
        title: "Slot-Based Equipment for ERC-6551 Accounts",
        primaryProposalId: "ERC-8216",
        relatedProposalIds: ["ERC-6551"],
        extractedEipIds: ["ERC-8216", "ERC-6551"],
      }),
      githubSignal({
        sourceId: "ethereum/ercs#9000",
        title: "Another extension for ERC-6551 Accounts",
        primaryProposalId: "ERC-9000",
        relatedProposalIds: ["ERC-6551"],
        extractedEipIds: ["ERC-9000", "ERC-6551"],
      }),
    ],
  });

  assert.equal(layer.issues.length, 2);
  assert.deepEqual(layer.issues.map((issue) => issue.primaryProposalId).sort(), ["ERC-8216", "ERC-9000"]);
  assert.ok(layer.issues.every((issue) => issue.sources.length === 1));
  assert.ok(layer.issues.every((issue) => issue.scoreBreakdown.find((part) => part.label === "Cross-source Spread")?.value === 0));
});

function magiciansSignal(overrides: Partial<EmergingRawSignal>): EmergingRawSignal {
  const title = overrides.title ?? "EIP-9000: Example";
  return {
    source: "ethereum_magicians",
    sourceId: "topic-1",
    url: "https://ethereum-magicians.org/t/example/1",
    title,
    createdAt: "2026-08-09T00:00:00.000Z",
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    replyCount: 12,
    viewCount: 700,
    participantCount: 5,
    extractedEipIds: extractProposalIds(title),
    collectedAt: "2026-08-10T00:00:00.000Z",
    facts: {},
    ...overrides,
  };
}

function githubSignal(overrides: Partial<EmergingRawSignal>): EmergingRawSignal {
  const title = overrides.title ?? "Add EIP-9000";
  return {
    source: "github_pr",
    sourceId: "ethereum/EIPs#9000",
    sourceRepo: "ethereum/EIPs",
    url: "https://github.com/ethereum/EIPs/pull/9000",
    title,
    createdAt: "2026-08-09T00:00:00.000Z",
    lastActivityAt: "2026-08-10T00:00:00.000Z",
    replyCount: 4,
    participantCount: 1,
    extractedEipIds: extractProposalIds(title),
    collectedAt: "2026-08-10T00:00:00.000Z",
    facts: {},
    ...overrides,
  };
}
