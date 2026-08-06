import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir, cwd } from "node:process";
import test from "node:test";
import { __qualitySummaryTestHooks } from "../src/cli/quality-summary.ts";

test("quality summary reads UTF-8 Korean JSON and passed true", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-quality-summary-"));
  try {
    const file = join(directory, "weekly-2026-08-04.quality.json");
    writeFileSync(file, JSON.stringify({ passed: true, checks: [{ id: "한국어-check", severity: "fail", passed: true }] }), "utf8");

    const parsed = __qualitySummaryTestHooks.parseQualityJson(file);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.checks?.[0]?.id, "한국어-check");
    assert.equal(JSON.parse(readFileSync(file, "utf8")).checks[0].id, "한국어-check");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("quality summary reports failed checks and strict exit only when requested", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-quality-summary-"));
  const originalCwd = cwd();
  try {
    chdir(directory);
    writeFileSync("weekly-2026-08-04.quality.json", JSON.stringify({
      passed: false,
      checks: [
        { id: "dashboard-v2-example", severity: "fail", passed: false },
        { id: "legacy-warning", severity: "warning", passed: false },
      ],
    }), "utf8");

    assert.equal(__qualitySummaryTestHooks.main(["--file", "weekly-2026-08-04.quality.json"]), 0);
    assert.equal(__qualitySummaryTestHooks.main(["--file", "weekly-2026-08-04.quality.json", "--strict"]), 1);
  } finally {
    chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("quality summary selects latest reports quality file", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-quality-summary-"));
  const originalCwd = cwd();
  try {
    chdir(directory);
    mkdirSync("reports");
    writeFileSync(join("reports", "weekly-2026-08-03.quality.json"), JSON.stringify({ passed: true, checks: [] }), "utf8");
    writeFileSync(join("reports", "weekly-2026-08-04.quality.json"), JSON.stringify({ passed: true, checks: [] }), "utf8");
    assert.match(__qualitySummaryTestHooks.latestQualityFile() ?? "", /weekly-2026-08-04\.quality\.json$/);
  } finally {
    chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("quality summary reports malformed JSON parse position", () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-quality-summary-"));
  try {
    const file = join(directory, "bad.quality.json");
    writeFileSync(file, "{\"passed\": true,\n", "utf8");
    assert.throws(
      () => __qualitySummaryTestHooks.parseQualityJson(file),
      /Quality JSON parse failed: .*bad\.quality\.json/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
