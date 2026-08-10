import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import type { ProposalRecord } from "../src/types.ts";

test("weekly report CLI prints Korean text and JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-weekly-"));
  const databasePath = join(directory, "report.sqlite");
  const db = openDatabase(databasePath);

  try {
    insertSnapshot(db, [makeRecord()]);
  } finally {
    db.close();
  }

  try {
    const textResult = runCli(databasePath);
    assertCliSucceeded(textResult);
    assert.match(textResult.stdout, /Ethereum Developer Momentum Dashboard/);
    assert.match(textResult.stdout, /개발자 모멘텀 상세/);
    assert.match(textResult.stdout, /KGLD Opportunity Radar/);
    assert.match(textResult.stdout, /ERC-20/);
    assert.doesNotMatch(textResult.stdout, /[湲蹂理]|쨌|�/);

    const jsonResult = runCli(databasePath, "--json");
    assertCliSucceeded(jsonResult);
    const report = JSON.parse(jsonResult.stdout) as {
      ethereumTechRadar: { totalProposals: number; themeInsights: Array<{ momentumScore: number }> };
      kgldOpportunityRadar: { candidates: unknown[] };
    };
    assert.equal(report.ethereumTechRadar.totalProposals, 1);
    assert.equal(report.kgldOpportunityRadar.candidates.length, 1);
    assert.ok(report.ethereumTechRadar.themeInsights[0]?.momentumScore >= 0);

    const customWindowResult = runCli(databasePath, "--json", "--trend-days", "30", "--change-days", "3");
    assertCliSucceeded(customWindowResult);
    const customReport = JSON.parse(customWindowResult.stdout) as {
      trendPeriod: { days: number };
      changePeriod: { days: number };
    };
    assert.equal(customReport.trendPeriod.days, 30);
    assert.equal(customReport.changePeriod.days, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runCli(databasePath: string, ...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      resolve("src/cli/weekly-report.ts"),
      "--db",
      databasePath,
      "--no-enrichment",
      ...args,
    ],
    { cwd: resolve("."), encoding: "utf8" },
  );
}

function assertCliSucceeded(result: ReturnType<typeof runCli>) {
  assert.equal(result.status, 0, cliFailureMessage(result));
}

function cliFailureMessage(result: ReturnType<typeof runCli>): string {
  return JSON.stringify({
    status: result.status,
    signal: result.signal,
    errorCode: result.error && "code" in result.error ? result.error.code : undefined,
    errorMessage: result.error?.message,
    stdoutLength: result.stdout?.length ?? 0,
    stderrLength: result.stderr?.length ?? 0,
    stderr: result.stderr,
  }, null, 2);
}

function makeRecord(): ProposalRecord {
  return {
    proposalId: "ERC-20",
    kind: "ERC",
    number: 20,
    title: "Token permit",
    status: "Final",
    proposalType: "Standards Track",
    category: "ERC",
    created: "2026-06-01",
    updated: null,
    discussionTo: null,
    sourceRepo: "ethereum/ercs",
    sourcePath: "ERCS/erc-20.md",
    canonicalUrl: "https://example.test/ERC-20",
    rawContentHash: "hash",
  };
}
