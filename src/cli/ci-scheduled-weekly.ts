import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

run("ci:doctor", ["run", "ci:doctor"]);
run("test", ["test"]);
run("typecheck", ["run", "typecheck"]);
run("collect", ["run", "collect", "--", "--trend-days", "180", "--change-days", "7"]);
run("scan:emerging", ["run", "scan:emerging", "--", "--limit", "60", "--timeout-ms", "8000", "--no-telegram"]);
run("report:html", ["run", "report:html", "--", "--trend-days", "180", "--change-days", "7"]);
validateLatestWeeklyQuality();
validatePublicReportLeakage();

function run(label: string, args: string[], env: Record<string, string> = {}): void {
  console.log(`\n> ${label}`);
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : npmCommand;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", [npmCommand, ...args].join(" ")]
    : args;
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function validateLatestWeeklyQuality(): void {
  const qualityPath = latestReportPath(/weekly-\d{4}-\d{2}-\d{2}\.quality\.json$/);
  const quality = JSON.parse(readFileSync(qualityPath, "utf8")) as {
    passed?: boolean;
    checks?: Array<{ id?: string; severity?: string; passed?: boolean }>;
  };
  const failed = (quality.checks ?? []).filter((check) => check.severity === "fail" && check.passed === false);
  if (quality.passed !== true || failed.length > 0) {
    throw new Error(`Strict quality failed for ${qualityPath}: ${failed.map((check) => check.id ?? "unknown").join(", ") || "quality.passed=false"}`);
  }
  console.log(`Strict quality passed for ${qualityPath}`);
}

function validatePublicReportLeakage(): void {
  const htmlPath = latestReportPath(/weekly-\d{4}-\d{2}-\d{2}\.html$/);
  const html = readFileSync(htmlPath, "utf8");
  const forbidden: Array<string | RegExp> = [
    ".sources/",
    ".sources\\",
    "C:\\Users\\",
    "/home/runner/work/",
    /(?:^|[^/:])EIPS\/eip-\d+\.md/i,
    /(?:^|[^/:])ERCS\/erc-\d+\.md/i,
    /(?:^|[^:])EIPS\\eip-\d+\.md/i,
    /(?:^|[^:])ERCS\\erc-\d+\.md/i,
    "file://",
    "localhost",
  ];
  const matches = forbidden.filter((pattern) => typeof pattern === "string" ? html.includes(pattern) : pattern.test(html));
  if (matches.length > 0) throw new Error(`Public report path leakage detected: ${matches.map(String).join(", ")}`);
  console.log(`Public report leakage validation passed for ${htmlPath}`);
}

function latestReportPath(pattern: RegExp): string {
  const reportsDir = resolve("reports");
  if (!existsSync(reportsDir)) throw new Error("reports directory does not exist");
  const candidates = readdirSync(reportsDir)
    .filter((name) => pattern.test(name))
    .sort();
  const latest = candidates.at(-1);
  if (!latest) throw new Error(`No report matching ${pattern} in ${reportsDir}`);
  return resolve(reportsDir, latest);
}
