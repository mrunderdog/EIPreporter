import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubActionsRunUrl,
  getGitHubActionsContext,
} from "../src/github-actions.ts";

test("builds a GitHub Actions run URL", () => {
  assert.equal(
    buildGitHubActionsRunUrl(
      "https://github.com/",
      "kgld/EIPreporter",
      "123456789",
    ),
    "https://github.com/kgld/EIPreporter/actions/runs/123456789",
  );
});

test("reads GitHub Actions context from environment values", () => {
  assert.deepEqual(
    getGitHubActionsContext({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "kgld/EIPreporter",
      GITHUB_RUN_ID: "123456789",
      GITHUB_SERVER_URL: "https://github.example.com",
    }),
    {
      repository: "kgld/EIPreporter",
      runId: "123456789",
      runUrl:
        "https://github.example.com/kgld/EIPreporter/actions/runs/123456789",
    },
  );
});

test("ignores incomplete or non-Actions environments", () => {
  assert.equal(getGitHubActionsContext({ GITHUB_ACTIONS: "false" }), undefined);
  assert.equal(
    getGitHubActionsContext({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "kgld/EIPreporter",
    }),
    undefined,
  );
});
