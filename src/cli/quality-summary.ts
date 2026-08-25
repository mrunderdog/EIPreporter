import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { exit } from "node:process";
import { fileURLToPath } from "node:url";

type QualityCheck = {
  id?: string;
  passed?: boolean | null;
  severity?: string;
  observed?: unknown;
  expected?: unknown;
  failureReason?: string;
  affectedIds?: string[];
};

type QualityJson = {
  passed?: boolean;
  checks?: QualityCheck[];
};

function main(argv = process.argv.slice(2)): number {
  const options = parseArgs(argv);
  const file = options.file ? resolve(options.file) : latestQualityFile();
  if (!file) {
    console.error("Quality file: not found");
    return 1;
  }

  let parsed: QualityJson;
  try {
    parsed = parseQualityJson(file);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
  const actualFailures = checks.filter((check) => check.severity === "fail" && check.passed === false);
  const dashboardV2Failures = actualFailures.filter((check) => String(check.id ?? "").startsWith("dashboard-v2-"));
  const failedIds = actualFailures.map((check) => check.id).filter(Boolean);

  console.log(`Quality file: ${file}`);
  console.log(`Passed: ${parsed.passed === true}`);
  console.log(`Actual failures: ${actualFailures.length}`);
  console.log(`Dashboard V2 failures: ${dashboardV2Failures.length}`);
  console.log(`Failed IDs: ${failedIds.length ? failedIds.join(", ") : "none"}`);
  if (actualFailures.length) {
    for (const check of actualFailures) {
      console.error("");
      console.error(`[${check.id ?? "unknown"}]`);
      console.error(`observed: ${JSON.stringify(check.observed ?? "")}`);
      console.error(`expected: ${JSON.stringify(check.expected ?? "")}`);
      console.error(`failureReason: ${check.failureReason ?? ""}`);
      console.error(`affectedIds: ${JSON.stringify(check.affectedIds ?? [])}`);
    }
  }

  return options.strict && (parsed.passed !== true || actualFailures.length > 0) ? 1 : 0;
}

function parseArgs(argv: string[]) {
  const options: { file?: string; strict: boolean } = { strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") {
      options.strict = true;
    } else if (arg === "--file") {
      const file = argv[index + 1];
      if (!file) throw new Error("--file requires a path");
      options.file = file;
      index += 1;
    } else if (!options.file) {
      options.file = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function latestQualityFile(): string | undefined {
  const reports = resolve("reports");
  if (!existsSync(reports)) return undefined;
  const files = readdirSync(reports)
    .filter((name) => /^weekly-\d{4}-\d{2}-\d{2}\.quality\.json$/.test(name))
    .sort();
  const latest = files.at(-1);
  return latest ? resolve(reports, latest) : undefined;
}

function parseQualityJson(file: string): QualityJson {
  const text = readFileSync(file, "utf8");
  try {
    return JSON.parse(text) as QualityJson;
  } catch (error) {
    const message = error instanceof SyntaxError ? error.message : String(error);
    const position = parsePosition(message);
    throw new Error(`Quality JSON parse failed: ${file}${position == null ? "" : ` at position ${position}`}\n${message}`);
  }
}

function parsePosition(message: string): number | undefined {
  const match = message.match(/position (\d+)/i);
  return match ? Number(match[1]) : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exit(main());
}

export const __qualitySummaryTestHooks = {
  latestQualityFile,
  main,
  parseArgs,
  parseQualityJson,
};
