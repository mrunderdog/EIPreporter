import { collectVitalikBlogSource, buildVitalikBlogView, vitalikBlogEditorialOverrides } from "../sources/vitalik-blog.ts";

async function main(): Promise<void> {
  const started = Date.now();
  const now = new Date();
  const source = await collectVitalikBlogSource(now);
  const view = buildVitalikBlogView(source, now.toISOString(), vitalikBlogEditorialOverrides);
  const output = {
    sourceState: source.sourceState,
    discoveryMethod: source.discoveryMethod,
    feedUrl: source.diagnostics.feedUrl ?? "none",
    discoveredPosts: source.diagnostics.articleStatuses.length,
    parsedPosts: source.posts.filter((post) => post.parseState === "body_parsed").length,
    latestPublishedAt: source.latestPublishedAt,
    selectedPosts: view.selectedPosts.map((post) => ({
      title: post.title,
      url: post.sourceUrl,
      publishedAt: post.publishedAtLabel,
      summaryState: post.summaryState,
      interpretationState: post.interpretationState,
    })),
    parseFailures: source.diagnostics.articleStatuses.filter((item) => item.parseState === "parse_failed"),
    diagnostics: {
      indexStatus: source.diagnostics.indexStatus,
      feedCandidateCount: source.diagnostics.feedCandidateCount,
      feedPreview: source.diagnostics.feedPreview,
      errors: source.diagnostics.errors,
    },
    articleFacts: source.posts.slice(0, 4).map((post) => ({
      title: post.title,
      sourceUrl: post.sourceUrl,
      canonicalUrl: post.canonicalUrl,
      publishedAt: post.publishedAt,
      precision: post.publicationDatePrecision,
      parseState: post.parseState,
      contentHash: post.contentHash,
      evidenceParagraphIds: post.evidenceParagraphs.slice(0, 3).map((paragraph) => paragraph.paragraphId),
      excerpt: post.sourceExcerpt.slice(0, 240),
    })),
    durationMs: Date.now() - started,
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
