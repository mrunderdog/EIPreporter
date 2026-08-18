import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase, insertEmergingActivitySnapshots } from "../src/db.ts";
import {
  buildEmergingLayer,
  collectEmergingSourceSignals,
  detectEmergingAlerts,
  extractProposalIds,
  resolveProposalIdentity,
  selectWeeklyBaselineSnapshot,
} from "../src/emerging.ts";
import type { EmergingActivitySnapshot, EmergingIssue, EmergingRawSignal } from "../src/types.ts";

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

test("paginated Magicians discovery finds high activity topic outside latest page 0", async () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  const pages = new Map([
    ["https://ethereum-magicians.org/latest.json?page=0", latestPage(Array.from({ length: 30 }, (_, index) => topic({ id: index + 1, title: `Minor discussion ${index}`, replyCount: 1 })), "/latest?page=1")],
    ["https://ethereum-magicians.org/latest.json?page=1", latestPage([
      topic({ id: 100, title: "EIP-9100: Protocol materiality security discussion", replyCount: 175, views: 5200, participantCount: 24 }),
    ], "/latest?page=2")],
    ["https://ethereum-magicians.org/latest.json?page=2", latestPage([
      topic({ id: 200, title: "Old inactive consensus thread", createdAt: "2026-01-01T00:00:00.000Z", lastActivityAt: "2026-01-02T00:00:00.000Z", replyCount: 300, views: 9000, participantCount: 40 }),
    ])],
  ]);

  const collected = await collectEmergingSourceSignals({
    now,
    fetchImpl: mockFetch(pages),
  });
  const layer = buildEmergingLayer({ now, rawSignals: collected.rawSignals, sourceStatus: collected.sourceStatus });

  assert.ok(layer.rawSignals.some((signal) => signal.sourceId === "100"));
  assert.equal(layer.diagnostics?.magicians?.pagesFetched, 3);
  assert.equal(layer.diagnostics?.magicians?.topicsWithinWindow, 31);
  assert.ok(layer.issues.find((issue) => issue.primaryProposalId === "EIP-9100"));
  assert.ok(!layer.issues.some((issue) => issue.title === "Old inactive consensus thread"));
});

test("rolling previous candidate remains when current latest no longer contains it", () => {
  const db = openDatabase(":memory:");
  const now = new Date("2026-08-10T00:00:00.000Z");
  buildEmergingLayer({
    db,
    now: new Date("2026-08-07T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({
        sourceId: "rolling-high-activity",
        title: "EIP-9101: Rolling protocol-level wallet discussion",
        createdAt: "2026-08-05T00:00:00.000Z",
        lastActivityAt: "2026-08-07T00:00:00.000Z",
        replyCount: 120,
        viewCount: 5000,
        participantCount: 21,
      }),
    ],
  });

  const layer = buildEmergingLayer({
    db,
    now,
    rawSignals: [
      magiciansSignal({ sourceId: "current-minor", title: "EIP-9102: Minor current proposal", replyCount: 1, viewCount: 20, participantCount: 1 }),
    ],
  });

  const retained = layer.issues.find((issue) => issue.eipIds.includes("EIP-9101"));
  assert.ok(retained);
  assert.ok(retained.sourceSignals.some((signal) => signal.facts.restoredFromRollingSnapshot));
});

test("high activity generic candidate outranks low activity generic candidate", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "generic-high", title: "Protocol-level wallet security discussion", replyCount: 180, viewCount: 5500, participantCount: 26, extractedEipIds: [] }),
      githubSignal({ sourceId: "ethereum/EIPs#low", title: "Add EIP-9103 small wording update", replyCount: 0, participantCount: 1 }),
    ],
  });

  const high = layer.issues.find((issue) => issue.title === "Protocol-level wallet security discussion");
  const low = layer.issues.find((issue) => issue.eipIds.includes("EIP-9103"));
  assert.ok(high && low);
  assert.ok(layer.issues.indexOf(high) < layer.issues.indexOf(low));
});

test("old high cumulative thread without current activity is not HOT", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      magiciansSignal({
        sourceId: "old-cumulative",
        title: "EIP-9104: Old consensus security thread",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastActivityAt: "2025-02-01T00:00:00.000Z",
        replyCount: 250,
        viewCount: 9000,
        participantCount: 40,
      }),
    ],
  });

  assert.notEqual(layer.issues[0]?.status, "HOT_ISSUE");
});

test("primary proposal id is removed from related ids and duplicates are collapsed", () => {
  const layer = buildEmergingLayer({
    now: new Date("2026-08-10T00:00:00.000Z"),
    rawSignals: [
      githubSignal({
        sourceId: "ethereum/EIPs#1234",
        title: "EIP-1234 references EIP-5678",
        primaryProposalId: "EIP-1234",
        relatedProposalIds: ["EIP-1234", "EIP-5678", "EIP-5678"],
        extractedEipIds: ["EIP-1234", "EIP-5678"],
      }),
    ],
  });

  assert.deepEqual(layer.issues[0]?.relatedProposalIds, ["EIP-5678"]);
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
  const asOf = new Date("2026-08-10T00:00:00.000Z");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "weekly", collectedAt: "2026-08-03T00:00:00.000Z", replyCount: 10, viewCount: 700, participantCount: 4 },
  ]);

  const layer = buildEmergingLayer({
    db,
    now: asOf,
    rawSignals: [
      magiciansSignal({ sourceId: "weekly", title: "EIP-9009: Weekly wallet UX activity", replyCount: 35, viewCount: 2400, participantCount: 12 }),
    ],
  });

  const issue = layer.issues.find((item) => item.eipIds.includes("EIP-9009"));
  const weeklyVelocity = issue?.metrics.velocity.find((item) => item.windowHours === 168);
  assert.equal(weeklyVelocity?.replyDelta, 25, velocityFailureMessage(issue, asOf));
  assert.equal(weeklyVelocity?.participantDelta, 8, velocityFailureMessage(issue, asOf));
  assert.ok(issue?.scoreBreakdown.some((item) => item.label === "7-day Velocity" && item.value > 0));
});

test("weekly baseline selection accepts exactly 7 days", () => {
  const baseline = weeklyBaselineFor([
    { collectedAt: "2026-08-03T00:00:00.000Z" },
  ], "2026-08-10T00:00:00.000Z");

  assert.equal(baseline?.collectedAt, "2026-08-03T00:00:00.000Z");
});

test("weekly baseline selection tolerates GitHub Actions cron drift", () => {
  const baseline = weeklyBaselineFor([
    { collectedAt: "2026-08-03T00:03:00.000Z" },
  ], "2026-08-10T00:11:00.000Z");

  assert.equal(baseline?.collectedAt, "2026-08-03T00:03:00.000Z");
});

test("weekly velocity scoring is timezone independent for the same epoch", () => {
  const asOf = new Date(Date.UTC(2026, 7, 10, 0, 0, 0));
  const issue = weeklyVelocityIssue(asOf, "2026-08-03T00:00:00.000Z");
  const weeklyVelocity = issue?.metrics.velocity.find((item) => item.windowHours === 168);

  assert.equal(weeklyVelocity?.replyDelta, 25, velocityFailureMessage(issue, asOf));
  assert.equal(issue?.scoreBreakdown.find((item) => item.label === "7-day Velocity")?.value, 25);
});

test("weekly baseline selection accepts the 6 to 8 day tolerance window", () => {
  assert.equal(weeklyBaselineFor([{ collectedAt: "2026-08-04T00:00:00.000Z" }], "2026-08-10T00:00:00.000Z")?.collectedAt, "2026-08-04T00:00:00.000Z");
  assert.equal(weeklyBaselineFor([{ collectedAt: "2026-08-02T00:00:00.000Z" }], "2026-08-10T00:00:00.000Z")?.collectedAt, "2026-08-02T00:00:00.000Z");
});

test("weekly baseline selection rejects too recent snapshots", () => {
  const baseline = weeklyBaselineFor([
    { collectedAt: "2026-08-08T00:00:00.000Z" },
  ], "2026-08-10T00:00:00.000Z");

  assert.equal(baseline, undefined);
});

test("weekly baseline selection rejects too old snapshots", () => {
  const baseline = weeklyBaselineFor([
    { collectedAt: "2026-07-21T00:00:00.000Z" },
  ], "2026-08-10T00:00:00.000Z");

  assert.equal(baseline, undefined);
});

test("weekly baseline selection chooses the candidate closest to 7 days deterministically", () => {
  const baseline = weeklyBaselineFor([
    { sourceId: "older", collectedAt: "2026-08-02T22:00:00.000Z" },
    { sourceId: "closer", collectedAt: "2026-08-03T01:00:00.000Z" },
  ], "2026-08-10T00:00:00.000Z");

  assert.equal(baseline?.sourceId, "closer");
});

test("weekly baseline selection rejects future snapshots", () => {
  const baseline = weeklyBaselineFor([
    { collectedAt: "2026-08-11T00:00:00.000Z" },
  ], "2026-08-10T00:00:00.000Z");

  assert.equal(baseline, undefined);
});

test("two-week emerging scan simulation keeps weekly velocity in canonical layer", () => {
  const db = openDatabase(":memory:");
  buildEmergingLayer({
    db,
    now: new Date("2026-08-03T00:03:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "weekly-sim", title: "EIP-9010: Simulated weekly activity", replyCount: 10, viewCount: 700, participantCount: 4, collectedAt: "2026-08-03T00:03:00.000Z" }),
    ],
  });

  const layer = buildEmergingLayer({
    db,
    now: new Date("2026-08-10T00:11:00.000Z"),
    rawSignals: [
      magiciansSignal({ sourceId: "weekly-sim", title: "EIP-9010: Simulated weekly activity", replyCount: 35, viewCount: 2400, participantCount: 12, collectedAt: "2026-08-10T00:11:00.000Z" }),
    ],
  });

  const issue = layer.issues.find((item) => item.eipIds.includes("EIP-9010"));
  const weeklyVelocity = issue?.metrics.velocity.find((item) => item.windowHours === 168);
  assert.equal(weeklyVelocity?.replyDelta, 25, velocityFailureMessage(issue, new Date(layer.generatedAt)));
  assert.equal(issue?.scoreBreakdown.find((item) => item.label === "7-day Velocity")?.value, 25);
  assert.equal(layer.whatsHappeningNow.some((item) => item.eipIds.includes("EIP-9010")), true);
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

function weeklyBaselineFor(
  snapshots: Array<Partial<EmergingActivitySnapshot> & { collectedAt: string }>,
  currentCollectedAt: string,
): EmergingActivitySnapshot | undefined {
  return selectWeeklyBaselineSnapshot(
    snapshots.map((snapshot, index) => ({
      source: "ethereum_magicians",
      sourceId: `candidate-${index}`,
      replyCount: 10,
      viewCount: 700,
      participantCount: 4,
      ...snapshot,
    })),
    currentCollectedAt,
  );
}

function weeklyVelocityIssue(asOf: Date, baselineCollectedAt: string): EmergingIssue | undefined {
  const db = openDatabase(":memory:");
  insertEmergingActivitySnapshots(db, [
    { source: "ethereum_magicians", sourceId: "weekly-tz", collectedAt: baselineCollectedAt, replyCount: 10, viewCount: 700, participantCount: 4 },
  ]);
  const layer = buildEmergingLayer({
    db,
    now: asOf,
    rawSignals: [
      magiciansSignal({
        sourceId: "weekly-tz",
        title: "EIP-9011: Timezone stable weekly activity",
        replyCount: 35,
        viewCount: 2400,
        participantCount: 12,
        collectedAt: asOf.toISOString(),
      }),
    ],
  });
  return layer.issues.find((item) => item.eipIds.includes("EIP-9011"));
}

function velocityFailureMessage(issue: EmergingIssue | undefined, asOf: Date): string {
  const weeklyVelocity = issue?.metrics.velocity.find((item) => item.windowHours === 168);
  const velocityScore = issue?.scoreBreakdown.find((item) => item.label === "7-day Velocity");
  return [
    `asOf=${asOf.toISOString()}`,
    `current=${issue?.sourceSignals[0]?.collectedAt ?? "missing"}`,
    `replyDelta7d=${weeklyVelocity?.replyDelta ?? "missing"}`,
    `viewDelta7d=${weeklyVelocity?.viewDelta ?? "missing"}`,
    `participantDelta7d=${weeklyVelocity?.participantDelta ?? "missing"}`,
    `velocityScore=${velocityScore?.value ?? "missing"}`,
    `heat=${issue?.heatScore ?? "missing"}`,
  ].join(" ");
}

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

function latestPage(topics: unknown[], moreTopicsUrl?: string): unknown {
  return { topic_list: { topics, more_topics_url: moreTopicsUrl } };
}

function topic(input: {
  id: number;
  title: string;
  createdAt?: string;
  lastActivityAt?: string;
  replyCount?: number;
  views?: number;
  participantCount?: number;
}): unknown {
  return {
    id: input.id,
    slug: `topic-${input.id}`,
    title: input.title,
    created_at: input.createdAt ?? "2026-08-06T00:00:00.000Z",
    bumped_at: input.lastActivityAt ?? "2026-08-09T00:00:00.000Z",
    last_posted_at: input.lastActivityAt ?? "2026-08-09T00:00:00.000Z",
    reply_count: input.replyCount ?? 0,
    views: input.views ?? 30,
    participant_count: input.participantCount ?? 1,
    tags: [],
    posters: [],
  };
}

function mockFetch(pages: Map<string, unknown>): typeof fetch {
  return async (url) => {
    const key = String(url);
    const payload = pages.get(key) ?? [];
    return new Response(JSON.stringify(key.includes("api.github.com") ? payload : payload), { status: 200 });
  };
}
