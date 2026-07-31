import assert from "node:assert/strict";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import { buildExecutiveSignal, buildWeeklyReport, formatTelegramWeeklySummary, matchKgldCandidate } from "../src/report.ts";
import type { ProposalRecord } from "../src/types.ts";

test("builds weekly report aggregates from the latest snapshot and recent events", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [
      makeRecord("EIP-1", "Draft", "hash-a", "Core proposal", "Core"),
      makeRecord("ERC-20", "Review", "hash-b", "Token standard", "ERC"),
    ]);
    const current = insertSnapshot(db, [
      makeRecord("EIP-1", "Final", "hash-a2", "Core proposal", "Core"),
      makeRecord("ERC-20", "Withdrawn", "hash-b", "Token permit", "ERC"),
      makeRecord("ERC-4626", "Draft", "hash-c", "Tokenized Vaults", "ERC"),
    ]);

    db.prepare("UPDATE change_events SET detected_at = ? WHERE snapshot_id = ?").run(
      "2026-06-10T12:00:00.000Z",
      current.id,
    );

    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    assert.equal(report.ethereumTechRadar.totalProposals, 3);
    assert.equal(report.trendPeriod.days, 180);
    assert.equal(report.changePeriod.days, 7);
    assert.deepEqual(report.ethereumTechRadar.proposalsByRepo, {
      "ethereum/EIPs": 1,
      "ethereum/ercs": 2,
    });
    assert.deepEqual(report.ethereumTechRadar.proposalsByStatus, {
      Draft: 1,
      Final: 1,
      Withdrawn: 1,
    });
    assert.deepEqual(report.ethereumTechRadar.proposalsByType, {
      "Standards Track": 3,
    });
    assert.deepEqual(report.ethereumTechRadar.proposalsByCategory, {
      Core: 1,
      ERC: 2,
    });
    assert.equal(report.ethereumTechRadar.recentChanges.total, 6);
    assert.deepEqual(report.ethereumTechRadar.recentChanges.byEventType, {
      new_proposal: 1,
      status_change: 2,
      final_transition: 1,
      withdrawn_transition: 1,
      content_hash_change: 1,
    });
    assert.equal(report.ethereumTechRadar.recentChanges.finalTransitions[0]?.proposalId, "EIP-1");
    assert.equal(report.ethereumTechRadar.recentChanges.withdrawnTransitions[0]?.proposalId, "ERC-20");
    assert.equal(report.ethereumTechRadar.signalLayer.discussionHeat[0]?.proposalId, "ERC-20");
    assert.equal(report.ethereumTechRadar.signalLayer.discussionHeat[0]?.discussionUrl, "https://ethereum-magicians.org/t/ERC-20");
    assert.equal(report.ethereumTechRadar.signalLayer.diffIntelligence[0]?.proposalId, "EIP-1");
    assert.equal(
      report.ethereumTechRadar.signalLayer.diffIntelligence[0]?.diffSummary,
      "Recent proposal content changed; section-level diff not available.",
    );
    assert.deepEqual(
      report.kgldOpportunityRadar.candidates.map((candidate) => candidate.proposalId),
      ["ERC-4626", "ERC-20"],
    );
    assert.ok(report.ethereumTechRadar.themeInsights.every((item) => item.momentumScore >= 0 && item.momentumScore <= 100));
    assert.ok(report.ethereumTechRadar.themeInsights.every((item) => ["low", "medium", "high"].includes(item.maturitySignal)));
    assert.deepEqual(report.chartData.statusDistribution.data, [1, 1, 1]);
    assert.ok(report.chartData.developerMomentumScores.labels.length > 0);
  } finally {
    db.close();
  }
});

test("builds reports when OPENAI_API_KEY is missing", () => {
  const db = openDatabase(":memory:");
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    insertSnapshot(db, [
      makeRecord("ERC-4626", "Final", "hash", "Tokenized Vaults", "ERC"),
    ]);
    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));

    assert.ok(report);
    assert.equal(process.env.OPENAI_API_KEY, undefined);
  } finally {
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
    db.close();
  }
});

test("generates rule-based Executive Signal and Telegram dashboard summary", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [
      makeRecord("ERC-4337", "Review", "hash-a", "Account abstraction paymaster session key", "ERC"),
      makeRecord("ERC-7579", "Draft", "hash-b", "Modular smart account passkey", "ERC"),
    ]);

    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.ok(report);
    const signal = buildExecutiveSignal(report);
    assert.equal(signal.length, 3);
    assert.match(signal[0], /최근 180일 기준/);
    assert.match(signal[1], /최근 7일 변경사항/);
    assert.match(signal[2], /KGLD/);

    const telegram = formatTelegramWeeklySummary(report);
    assert.match(telegram, /^Ethereum Developer Momentum Dashboard/);
    assert.match(telegram, /Momentum Top 3 themes/);
    assert.match(telegram, /KGLD Review\/PoC 후보/);
    assert.match(telegram, /HTML 파일을 첨부합니다\./);
  } finally {
    db.close();
  }
});

test("excludes change events older than seven days", () => {
  const db = openDatabase(":memory:");

  try {
    insertSnapshot(db, [makeRecord("EIP-1", "Draft", "hash-a", "Core proposal", "Core")]);
    const current = insertSnapshot(db, [
      makeRecord("EIP-1", "Final", "hash-b", "Core proposal", "Core"),
    ]);
    db.prepare("UPDATE change_events SET detected_at = ? WHERE snapshot_id = ?").run(
      "2026-06-01T00:00:00.000Z",
      current.id,
    );

    const report = buildWeeklyReport(db, new Date("2026-06-12T12:00:00.000Z"));
    assert.equal(report?.ethereumTechRadar.recentChanges.total, 0);
  } finally {
    db.close();
  }
});

test("matches KGLD keywords and assigns score and recommended action", () => {
  const candidate = matchKgldCandidate(
    makeRecord(
      "ERC-9999",
      "Review",
      "hash",
      "Smart account paymaster with passkey and session key",
      "ERC",
    ),
  );

  assert.deepEqual(candidate?.matchedKeywords, [
    "smart account",
    "paymaster",
    "passkey",
    "session key",
  ]);
  assert.equal(candidate?.relevanceScore, 83);
  assert.equal(candidate?.businessImpact, 5);
  assert.equal(candidate?.implementationEffort, 4);
  assert.equal(candidate?.urgency, 3);
  assert.equal(candidate?.recommendedAction, "review");
  assert.ok(candidate?.reasonCodes.includes("ERC_PROPOSAL"));
  assert.ok(candidate?.reasonCodes.includes("ETHEREUM_ERCS_SOURCE"));

  const withdrawn = matchKgldCandidate(
    makeRecord("EIP-2", "Withdrawn", "hash", "Oracle design", "Core"),
  );
  assert.equal(withdrawn?.recommendedAction, "ignore");

  const unmatched = matchKgldCandidate(
    makeRecord("EIP-3", "Draft", "hash", "Opcode cleanup", "Core"),
  );
  assert.equal(unmatched, null);
});

function makeRecord(
  proposalId: string,
  status: string,
  rawContentHash: string,
  title: string,
  category: string,
): ProposalRecord {
  const [kind, rawNumber] = proposalId.split("-");

  return {
    proposalId,
    kind: kind as ProposalRecord["kind"],
    number: Number(rawNumber),
    title,
    status,
    proposalType: "Standards Track",
    category,
    created: "2026-01-01",
    updated: null,
    discussionTo: proposalId === "ERC-20" ? "https://ethereum-magicians.org/t/ERC-20" : null,
    discussionLinks: proposalId === "ERC-20" ? ["https://ethereum-magicians.org/t/ERC-20"] : [],
    sourceRepo: kind === "ERC" ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: kind === "ERC" ? `ERCS/erc-${rawNumber}.md` : `EIPS/eip-${rawNumber}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash,
  };
}
