import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/weekly-report.yml", "utf8");

test("weekly workflow deploys only the validated report through Pages", () => {
  assert.match(workflow, /^\s{2}weekly-report:\n/m);
  assert.match(workflow, /^\s{2}deploy-pages:\n/m);
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
