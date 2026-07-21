import { fetchMarkdownDocuments, REPOSITORIES } from "./github.ts";
import { normalizeProposal } from "./normalize.ts";
import type { ProposalRecord } from "./types.ts";

export async function collectProposals(githubToken?: string): Promise<ProposalRecord[]> {
  const records: ProposalRecord[] = [];

  for (const repository of REPOSITORIES) {
    const documents = await fetchMarkdownDocuments(repository, githubToken);
    for (const document of documents) {
      const record = normalizeProposal({
        kind: repository.kind,
        sourceRepo: repository.sourceRepo,
        sourcePath: document.path,
        branch: document.branch,
        markdown: document.markdown,
      });

      if (record) records.push(record);
    }
  }

  return records.sort((a, b) => a.proposalId.localeCompare(b.proposalId, undefined, { numeric: true }));
}
