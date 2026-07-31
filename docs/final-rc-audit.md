# Final RC Architecture Audit

Generated for the release-candidate closure pass.

## Public Proposal Surface

All public proposal identifiers must be represented in `intelligenceSnapshot.monitoringUniverse.subjectRegistry`.

Public sections checked:
- Executive Pulse
- Technology Landscape
- Focus & Progress
- Developer Activity
- AA Radar
- KGLD Watch
- Appendix

## Canonical Fact Inventory

Canonical fact roots:
- `facts.specificationEvidence`
- `facts.discussionPosts`
- `facts.developmentEvents`
- `facts.logicalDevelopmentEvents`
- `facts.topicMembershipFacts`

Every aggregate, signal, and editorial claim must reference only IDs present in these roots.

## Aggregate Reference Contract

Aggregate fact references are owned by:
- `aggregates.domainActivity`
- `aggregates.discussion`
- `aggregates.weeklyQuality`
- `aggregates.aa`
- `aggregates.kgld`

No aggregate may contain a post ID, event ID, or specification fact ID that is absent from `facts`.

## Signal And Claim Lineage

Signals must carry:
- `metricIds`
- `evidenceFactIds`
- `subjectId`

Editorial claims must carry:
- `signalIds`
- `evidenceFactIds`
- source URLs derived from referenced facts

Bottom Line must include long-term focus, discussion activity, KGLD relevance, and weekly-quality lineage.

## Discussion Window

The release candidate uses a single rolling 7-day UTC window:

`windowStart <= createdAt < windowEnd`

The same window must be used for:
- Developer Activity
- detailed analysis set
- technology map set
- domain discussion aggregates
- topic discussion aggregates
- AA discussion aggregates
- Data Quality recent post counts
- Executive Magicians Activity

## Logical Event Normalization

`proposal_created_metadata`, `git_commit`, and `fallback_detected_at` observations for the same proposal introduction are normalized into at most one public `proposal_published` logical event per proposal.

Fallback and unknown events remain audit facts but are not weekly meaningful events.

## Legacy Access Audit

Public rendering must use:

`intelligenceSnapshot.views`

Compatibility fields such as `dashboard`, `technologyDomains`, `topicClusters`, and atlas chart payloads must not be embedded in public HTML.

