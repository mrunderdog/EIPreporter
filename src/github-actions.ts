export type GitHubActionsEnvironment = {
  GITHUB_ACTIONS?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_SERVER_URL?: string;
};

export type GitHubActionsContext = {
  repository: string;
  runId: string;
  runUrl: string;
};

export function getGitHubActionsContext(
  environment: GitHubActionsEnvironment = process.env,
): GitHubActionsContext | undefined {
  if (environment.GITHUB_ACTIONS !== "true") return undefined;

  const repository = environment.GITHUB_REPOSITORY?.trim();
  const runId = environment.GITHUB_RUN_ID?.trim();
  if (!repository || !runId) return undefined;

  const serverUrl = environment.GITHUB_SERVER_URL?.trim() || "https://github.com";
  return {
    repository,
    runId,
    runUrl: buildGitHubActionsRunUrl(serverUrl, repository, runId),
  };
}

export function buildGitHubActionsRunUrl(
  serverUrl: string,
  repository: string,
  runId: string,
): string {
  return `${serverUrl.replace(/\/+$/, "")}/${repository}/actions/runs/${runId}`;
}
