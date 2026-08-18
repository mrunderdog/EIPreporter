import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

run("typecheck", ["run", "typecheck"]);
run("test:utc", ["test"], { TZ: "UTC" });
run("test:asia-seoul", ["test"], { TZ: "Asia/Seoul" });
run("offline-report-fixture", ["test", "--", "--test-name-pattern", "report:html renders from canonical snapshot without collecting again"], { TZ: "UTC" });

if (existsSync(process.env.EIP_OFFICIAL_REPO_PATH ?? ".sources/EIPs") && existsSync(process.env.ERC_OFFICIAL_REPO_PATH ?? ".sources/ERCs")) {
  run("ci:doctor", ["run", "ci:doctor"]);
} else {
  console.log("ci:doctor skipped: official source checkouts are not present.");
}

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
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
