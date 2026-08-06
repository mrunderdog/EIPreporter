import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { insertSnapshot, openDatabase } from "../src/db.ts";
import { buildWeeklyReport, buildWeeklyReportWithDiscussionPosts } from "../src/report.ts";
import type { ProposalRecord } from "../src/types.ts";

test("local full-history backfill is primary and does not call GitHub API", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-local-backfill-"));
  const originalEip = process.env.EIP_OFFICIAL_REPO_PATH;
  const originalErc = process.env.ERC_OFFICIAL_REPO_PATH;
  t.after(() => {
    restoreEnv("EIP_OFFICIAL_REPO_PATH", originalEip);
    restoreEnv("ERC_OFFICIAL_REPO_PATH", originalErc);
    rmSync(directory, { recursive: true, force: true });
  });

  const eipRepo = initOfficialRepo(join(directory, "EIPs"), "EIPS", "eip", 8141);
  const ercRepo = initOfficialRepo(join(directory, "ERCs"), "ERCS", "erc", 8286);
  process.env.EIP_OFFICIAL_REPO_PATH = eipRepo;
  process.env.ERC_OFFICIAL_REPO_PATH = ercRepo;

  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [
      makeRecord("EIP-8141", "EIP", 8141),
      makeRecord("ERC-8286", "ERC", 8286),
    ]);
    const report = await buildWeeklyReportWithDiscussionPosts(db, new Date("2026-08-01T00:00:00.000Z"), {
      trendWindowDays: 180,
      changeWindowDays: 7,
      fetchImpl: async () => {
        throw new Error("GitHub API must not be called when official local repositories are healthy");
      },
    });

    const diagnostics = report?.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics;
    assert.ok(diagnostics);
    assert.equal(diagnostics.sourceMode, "local_git");
    assert.equal(diagnostics.apiHistoryRequested, 0);
    assert.equal(diagnostics.rateLimitedCount, 0);
    assert.equal(diagnostics.localHistoryRequested, 2);
    assert.equal(diagnostics.localHistorySucceeded, 2);
    assert.ok((diagnostics.successRate ?? 0) >= 0.9);
  } finally {
    db.close();
  }
});

test("report:html renders from canonical snapshot without collecting again", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-render-snapshot-"));
  const db = openDatabase(":memory:");
  try {
    insertSnapshot(db, [makeRecord("ERC-4626", "ERC", 4626)]);
    const report = buildMinimalReport(db);
    const snapshotPath = join(directory, "weekly-current.snapshot.json");
    writeFileSync(snapshotPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        resolve("src/cli/html-report.ts"),
        "--snapshot",
        snapshotPath,
        "--output",
        directory,
        "--skip-preflight",
      ],
      { cwd: resolve("."), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Render source: canonical snapshot/);
    assert.match(result.stdout, /networkRequests=0/);
    assert.match(result.stdout, /inputSnapshotHash=/);
    assert.ok(readFileSync(join(directory, "weekly-2026-08-01.html"), "utf8").includes("Ethereum Standards Weekly - 2026-08-01"));
    assert.ok(readFileSync(join(directory, "weekly-2026-08-01.compact.json"), "utf8").includes("intelligenceSnapshot"));
    assert.ok(readFileSync(join(directory, "weekly-2026-08-01.quality.json"), "utf8").includes("passed"));
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function buildMinimalReport(db: ReturnType<typeof openDatabase>) {
  const report = {
    ...assertReportShape(db),
    generatedAt: "2026-08-01T00:00:00.000Z",
  };
  report.ethereumTechRadar.historicalInputDiagnostics = {
    inputEventCount: 0,
    earliestEventAt: null,
    latestEventAt: null,
    eventsWithTimestamp: 0,
    eventsWithoutTimestamp: 0,
    eventsCurrent7d: 0,
    eventsCurrent180d: 0,
    uniqueEventDates: 0,
    uniqueWeeks: 0,
    sourceTablesOrFiles: ["test"],
    timestampFieldUsed: "test",
    trendAndCurrentUseSameEvents: true,
    validHistoricalCoverage: true,
    gitBackfillDiagnostics: {
      sourceMode: "local_git",
      localHistoryRequested: 0,
      localHistorySucceeded: 0,
      localHistoryFailed: 0,
      apiHistoryRequested: 0,
      apiHistorySucceeded: 0,
      apiHistoryFailed: 0,
      pathCaseFailures: 0,
      shallowRepositoryDetected: 0,
      requestedTargets: 0,
      successfulTargets: 0,
      failedTargets: 0,
      successRate: 1,
      failedProposalIds: [],
      failureCodes: [],
      retryCount: 0,
      rateLimitedCount: 0,
      notFoundCount: 0,
    },
  };
  return report;
}

function assertReportShape(db: ReturnType<typeof openDatabase>) {
  const report = buildWeeklyReport(db, new Date("2026-08-01T00:00:00.000Z"));
  assert.ok(report);
  return report;
}

function initOfficialRepo(root: string, directoryName: "EIPS" | "ERCS", prefix: "eip" | "erc", number: number): string {
  mkdirSync(join(root, directoryName), { recursive: true });
  git(root, "init");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  const path = join(root, directoryName, `${prefix}-${number}.md`);
  writeFileSync(path, `---\n${prefix}: ${number}\ntitle: Test ${number}\nstatus: Draft\ncreated: 2026-01-01\n---\n\n## Abstract\nInitial body.\n`, "utf8");
  git(root, "add", ".");
  gitWithDate(root, "2026-01-01T00:00:00Z", "commit", "-m", `add ${prefix}-${number}`);
  writeFileSync(path, `---\n${prefix}: ${number}\ntitle: Test ${number}\nstatus: Review\ncreated: 2026-01-01\n---\n\n## Abstract\nUpdated body.\n\n## Specification\nThe specification changed.\n`, "utf8");
  git(root, "add", ".");
  gitWithDate(root, "2026-07-20T00:00:00Z", "commit", "-m", `update ${prefix}-${number}`);
  return root;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function gitWithDate(cwd: string, date: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

function makeRecord(proposalId: string, kind: "EIP" | "ERC", number: number): ProposalRecord {
  return {
    proposalId,
    kind,
    number,
    title: `Test ${number}`,
    status: "Review",
    proposalType: "Standards Track",
    category: kind === "EIP" ? "Core" : "ERC",
    created: "2026-07-01",
    updated: null,
    discussionTo: null,
    discussionLinks: [],
    sourceRepo: kind === "EIP" ? "ethereum/EIPs" : "ethereum/ercs",
    sourcePath: kind === "EIP" ? `EIPS/eip-${number}.md` : `ERCS/erc-${number}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash: `hash-${proposalId}`,
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
