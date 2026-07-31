type HealthResult = {
  collector: string;
  endpoint: string;
  ok: boolean;
  status?: number;
  errorName?: string;
  errorMessage?: string;
  errorCause?: string;
  bodyPreview?: string;
};

const token = process.env.GITHUB_TOKEN;

const checks = [
  ["github_repo_metadata", "https://api.github.com/repos/ethereum/EIPs"],
  ["github_tree", "https://api.github.com/repos/ethereum/EIPs/git/trees/master?recursive=0"],
  ["github_raw", "https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-1.md"],
  ["github_search_issues", "https://api.github.com/search/issues?q=%22EIP-1%22%20repo:ethereum/EIPs%20is:issue&per_page=1"],
  ["github_search_prs", "https://api.github.com/search/issues?q=%22EIP-1%22%20repo:ethereum/EIPs%20is:pull-request&per_page=1"],
  ["github_search_code", "https://api.github.com/search/code?q=%22EIP-1%22%20repo:ethereum/EIPs&per_page=1"],
] as const;

async function run(): Promise<void> {
  const results: HealthResult[] = [];
  for (const [collector, endpoint] of checks) {
    results.push(await check(collector, endpoint));
  }

  for (const result of results) {
    const state = result.ok ? "PASS" : "FAIL";
    console.log(`${state} ${result.collector}`);
    console.log(`  endpoint: ${result.endpoint}`);
    if (result.status !== undefined) console.log(`  status: ${result.status}`);
    if (result.errorName) console.log(`  error: ${result.errorName}: ${result.errorMessage}`);
    if (result.errorCause) console.log(`  cause: ${result.errorCause}`);
    if (result.bodyPreview) console.log(`  body: ${result.bodyPreview}`);
  }

  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

async function check(collector: string, endpoint: string): Promise<HealthResult> {
  try {
    const response = await fetch(endpoint, { headers: requestHeaders() });
    const body = await response.text();
    return {
      collector,
      endpoint,
      ok: response.ok,
      status: response.status,
      bodyPreview: response.ok ? undefined : body.slice(0, 300),
    };
  } catch (error) {
    return {
      collector,
      endpoint,
      ok: false,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCause: formatCause(error),
    };
  }
}

function requestHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "EIPreporter",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function formatCause(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("cause" in error) || !error.cause) return undefined;
  const cause = error.cause as { code?: unknown; errno?: unknown; syscall?: unknown; hostname?: unknown; message?: unknown };
  return [
    typeof cause.message === "string" ? cause.message : "",
    cause.code ? `code=${String(cause.code)}` : "",
    cause.errno ? `errno=${String(cause.errno)}` : "",
    cause.syscall ? `syscall=${String(cause.syscall)}` : "",
    cause.hostname ? `hostname=${String(cause.hostname)}` : "",
  ].filter(Boolean).join(" ");
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
