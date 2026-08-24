import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/weekly-report.yml", "utf8");
const emergingWorkflow = readFileSync(".github/workflows/emerging-scan.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

test("weekly workflow deploys only the validated report through Pages", () => {
  assert.match(workflow, /^\s{2}weekly-report:\r?\n/m);
  assert.match(workflow, /^\s{2}deploy-pages:\r?\n/m);
  assert.match(workflow, /^\s{4}needs: weekly-report$/m);
  assert.match(workflow, /if: \$\{\{ github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request' \}\}/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v4[\s\S]*?path: _site/);
  assert.match(workflow, /id: deployment[\s\S]*?uses: actions\/deploy-pages@v4/);
});

test("Pages site is prepared after strict quality and deploy job does not rebuild", () => {
  const qualityIndex = workflow.indexOf("Validate weekly report quality");
  const prepareIndex = workflow.indexOf("Prepare GitHub Pages site");
  const deployJobIndex = workflow.indexOf("deploy-pages:");
  const deployJob = workflow.slice(deployJobIndex);

  assert.ok(qualityIndex >= 0, "strict quality step is present");
  assert.ok(prepareIndex > qualityIndex, "_site is prepared after strict quality");
  assert.match(workflow, /cp "\$report_path" _site\/index\.html/);
  assert.match(workflow, /test -s "_site\/index\.html"/);
  assert.doesNotMatch(deployJob, /actions\/checkout|npm ci|npm run collect|npm run report:html|quality|send:weekly/i);
});

test("weekly workflow runs emerging scan before weekly report generation using shared state", () => {
  const collectIndex = workflow.indexOf("Collect EIP and ERC proposals");
  const emergingIndex = workflow.indexOf("Run emerging scan");
  const reportIndex = workflow.indexOf("Generate weekly HTML report");
  const saveIndex = workflow.indexOf("Save persistent report state");
  const sendIndex = workflow.indexOf("Send weekly report to Telegram");

  assert.ok(collectIndex >= 0, "official collection step is present");
  assert.ok(emergingIndex > collectIndex, "emerging scan runs after official collection");
  assert.ok(reportIndex > emergingIndex, "weekly report is generated after emerging scan");
  assert.ok(saveIndex > reportIndex, "shared DB/cache state is saved after report generation");
  assert.ok(sendIndex > saveIndex, "only the completed weekly report is sent to Telegram");
  assert.match(workflow, /npm run scan:emerging -- --limit 60 --timeout-ms 8000 --no-telegram/);
  assert.match(workflow, /key: eipreporter-data-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /data\/eipreporter\.sqlite/);
});

test("weekly workflow schedule and manual dispatch share strict report pipeline semantics", () => {
  const qualityIndex = workflow.indexOf("Validate weekly report quality");
  const telegramIndex = workflow.indexOf("Send weekly report to Telegram");
  const pagesIndex = workflow.indexOf("Prepare GitHub Pages site");

  assert.match(workflow, /^\s{2}schedule:\r?\n\s{4}- cron: "17 0 \* \* 1"/m);
  assert.match(workflow, /^\s{2}workflow_dispatch:\r?\n/m);
  assert.match(workflow, /^\s{2}pull_request:\r?\n/m);
  assert.match(workflow, /^\s{2}weekly-report:\r?\n/m);
  assert.doesNotMatch(workflow, /if: \$\{\{ github\.event_name == 'workflow_dispatch' \}\}[\s\S]*?weekly-report:/);
  assert.ok(qualityIndex > workflow.indexOf("Generate weekly HTML report"), "quality runs after report generation");
  assert.ok(telegramIndex > qualityIndex, "Telegram send runs after quality");
  assert.ok(pagesIndex > qualityIndex, "Pages preparation runs after quality");
  assert.match(workflow, /if: \$\{\{ github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request' \}\}/);
  assert.match(packageJson.scripts["ci:scheduled-weekly"], /ci-scheduled-weekly\.ts/);
});

test("manual emerging workflow has no schedule and defaults to no Telegram", () => {
  assert.doesNotMatch(emergingWorkflow, /^\s{2}schedule:/m);
  assert.match(emergingWorkflow, /^\s{2}workflow_dispatch:/m);
  assert.match(emergingWorkflow, /npm run scan:emerging -- --limit 60 --timeout-ms 8000 --no-telegram/);
  assert.match(emergingWorkflow, /key: eipreporter-data-\$\{\{ runner\.os \}\}-\$\{\{ github\.run_id \}\}/);
});
