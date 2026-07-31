# EIPreporter Design References

This file is the visual source of truth for the Phase 13 HTML presentation rebuild. The report should feel like an institutional technology intelligence product: editorial, evidence-led, calm, and high-signal.

## 1. GitHub Insights

URL:
- https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository
- https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-pulse-to-view-a-summary-of-repository-activity

Page / screenshot reference:
- GitHub repository Insights traffic graphs and Pulse summary pages.

What works:
- Repository activity is presented as dated evidence, not decoration.
- Traffic and Pulse use simple graphs plus ordered lists so readers can scan both trend and source.
- Tables and lists emphasize exact values, source order, and update cadence.

Spacing:
- Moderate row height, clear gutters, and restrained section spacing.
- Dense enough for technical review, but not cramped.

Typography:
- Small, legible UI text with clear section labels.
- Stronger hierarchy comes from grouping and labels rather than oversized display type.

Information hierarchy:
- Summary first, then graph/list detail.
- Period and scope are always visible near the data.

Tables:
- Minimal borders, readable rows, left-aligned labels, numeric columns easy to compare.

Cards:
- Cards are not decorative. They frame useful activity or metric groups.

Dashboard philosophy:
- Show the facts, period, and source context. Avoid speculative interpretation in the chart itself.

Copy:
- Evidence tables, ordered source lists, compact metric summaries, clear periods.

Do not copy:
- Developer-product chrome, repo navigation density, orange screenshot highlights, GitHub-specific issue terminology as visual ornament.

## 2. GitHub Projects

URL:
- https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-table-layout
- https://github.blog/news-insights/product-news/planning-next-to-your-code-github-projects-is-now-generally-available/

Page / screenshot reference:
- GitHub Projects table, board, grouped fields, saved views, and charts.

What works:
- Structured datasets are tables first, with custom fields and grouping.
- Metadata is visible enough to sort and scan without opening every item.
- Board/card layouts are secondary to tables for operational data.

Spacing:
- Rows breathe more than spreadsheets, but stay aligned and compact.

Typography:
- Labels, field names, and item titles are differentiated through weight and position.

Information hierarchy:
- Current view, grouping, fields, and item rows create a predictable scanning path.

Tables:
- Good model for implementation tracking, evidence summary, release watch, and client matrices.

Cards:
- Use only where a board-style status comparison is appropriate.

Dashboard philosophy:
- Give analysts multiple perspectives on the same data without changing the underlying facts.

Copy:
- Group headers, field-style columns, row-level metadata, optional detail disclosure.

Do not copy:
- Spreadsheet heaviness, excessive custom-field controls, drag handles, project management interaction affordances.

## 3. Linear

URL:
- https://linear.app/now/how-we-redesigned-the-linear-ui
- https://linear.app/now/behind-the-latest-design-refresh
- https://linear.app/docs/board-layout

Page / screenshot reference:
- Linear redesigned issue lists, board layout, calmer header system, and swimlanes.

What works:
- Calm interface, reduced visual noise, strong alignment, consistent headers.
- Landscape cards and rows feel purpose-built, not generic.
- UI density is achieved through rhythm and pruning, not tiny text.

Spacing:
- Consistent gutters, compact headers, controlled card padding.

Typography:
- Medium weights, quiet metadata, strong but not loud titles.

Information hierarchy:
- Location/header, view controls, then content. Sections are predictable.

Tables:
- List views are clear alternatives to board views when detail matters.

Cards:
- Landscape cards with title, status, and secondary metadata. Cards do not become tall mobile tiles on desktop.

Dashboard philosophy:
- Remove anything that does not help the current decision.

Copy:
- Calm cards, aligned rows, subtle dividers, predictable headers.

Do not copy:
- Purple brand accent, dark-first product chrome, command-palette affordances, issue-tracker-specific keyboard hints.

## 4. Coinbase

URL:
- https://help.coinbase.com/coinbase/trading-and-funding/advanced-trade/dashboard-overview
- https://www.coinbase.com/ADVANCED-TRADE

Page / screenshot reference:
- Coinbase Advanced dashboard overview, order book, portfolio and market panels.

What works:
- KPI and trading panels lead with the number, then a short label and useful context.
- Panels communicate speed and market state through alignment, not decoration.
- Dense financial data remains readable because numeric columns are disciplined.

Spacing:
- Comfortable panel padding, clear separation between number, label, and explanation.

Typography:
- Large numbers, small labels, tabular numeric alignment.

Information hierarchy:
- At-a-glance metrics, then order book / table detail, then secondary history.

Tables:
- Strong reference for client/release/activation matrices: status and numeric fields must align.

Cards:
- Best used for KPIs only. Equal width. No colorful cards.

Dashboard philosophy:
- Executives should understand state and risk immediately.

Copy:
- KPI cards with large numeric value, small label, and tiny explanation.

Do not copy:
- Trading visuals, crypto-exchange mood, order entry controls, high-frequency market color intensity.

## 5. Mintlify

URL:
- https://mintlify.com/docs/components/cards
- https://www.mintlify.com/mintlify/docs/components/index
- https://mintlify.com/docs/themes

Page / screenshot reference:
- Documentation cards, horizontal cards, accordions, panels, and page structure.

What works:
- Documentation pages separate overview from detail.
- Cards can be horizontal and compact, but are not the only layout.
- Details/accordions support progressive disclosure without hiding primary facts.

Spacing:
- Comfortable paragraph spacing and wide reading measure.

Typography:
- Documentation headings are readable and calm.

Information hierarchy:
- Page title, short description, then structured components.

Tables:
- Use for API-like field definitions and evidence metadata.

Cards:
- Use horizontal cards for concise summaries; avoid icon-heavy card grids.

Dashboard philosophy:
- Keep technical detail accessible, but do not force it into the first viewport.

Copy:
- Details blocks, appendix sections, score breakdowns, source metadata.

Do not copy:
- Decorative icon cards, marketing doc themes, excessive component showcase style.

## 6. Stripe Dashboard

URL:
- https://docs.stripe.com/stripe-apps/design

Page / screenshot reference:
- Stripe app design guidance and dashboard UI extension principles.

What works:
- Platform consistency, restrained color use, and high accessibility expectations.
- Custom styling is intentionally limited to preserve trust and clarity.

Spacing:
- UI components have reliable padding and clear edges.

Typography:
- Conservative hierarchy with strong labels and accessible contrast.

Information hierarchy:
- Core status first; brand and custom treatment are secondary.

Tables:
- Tables should support business action and source audit.

Cards:
- Cards support focused task panels, not decorative containers.

Dashboard philosophy:
- Trust comes from consistency, accessibility, and restrained customization.

Copy:
- Consistent component rules, limited palette, accessibility-driven status treatment.

Do not copy:
- Stripe brand gradients, payment-specific UI, app marketplace patterns.

## 7. Plausible Analytics

URL:
- https://plausible.io/docs/guided-tour

Page / screenshot reference:
- Plausible dashboard overview with top graph and essential metrics.

What works:
- One dashboard with essential stats and no unnecessary menu depth.
- Top-level metrics switch context for the chart without requiring explanation.
- Simplicity improves confidence.

Spacing:
- Open but efficient. Controls are not visually dominant.

Typography:
- Metrics are clearly distinguished from labels.

Information hierarchy:
- Top graph and metric row first, then supporting breakdowns.

Tables:
- Use tables/lists for ranked sources and content.

Cards:
- Metric cards work when they are uniform and comparable.

Dashboard philosophy:
- Avoid custom reports and nested navigation when one clear view can answer the question.

Copy:
- Essential metrics above the fold, no sub-menu complexity.

Do not copy:
- Consumer web analytics labels or playful simplicity that would weaken institutional tone.

## 8. PostHog

URL:
- https://www.mintlify.com/PostHog/posthog/products/product-analytics
- https://www.mintlify.com/PostHog/posthog/products/web-analytics

Page / screenshot reference:
- Product and web analytics documentation describing trends, funnels, retention, paths, and lifecycle insights.

What works:
- Different visualizations match different analytical questions.
- Trends, funnels, retention, and lifecycle are explicitly separated.
- Dashboards can be stakeholder-specific.

Spacing:
- Documentation sections are clear and digestible.

Typography:
- Analytical concepts use strong headings and explanatory paragraphs.

Information hierarchy:
- Explain what a visualization answers before showing the data.

Tables:
- Use event definitions and schema-like tables for evidence detail.

Cards:
- Useful for insight type summaries only.

Dashboard philosophy:
- Choose visualization by question, not by aesthetics.

Copy:
- Section summaries that say what the view is for.

Do not copy:
- Product-growth vocabulary, playful brand style, mascot-like tone.

## 9. Grafana

URL:
- https://grafana.com/docs/grafana/latest/visualizations/dashboards/
- https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
- https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/create-dashboard/

Page / screenshot reference:
- Dashboard panels, rows/tabs, panel layout, and best-practice guidance.

What works:
- A dashboard should tell a story or answer a question.
- Panels should reduce cognitive load.
- Empty or irrelevant panels can be hidden by rule.
- Auto-grid concepts inform responsive panel sizing.

Spacing:
- Panel grouping creates larger story blocks.

Typography:
- Panel titles should be clear and functional.

Information hierarchy:
- General-to-specific progression.

Tables:
- Use where exact status comparison matters.

Cards:
- Panels are useful when they answer a concrete question.

Dashboard philosophy:
- Do not show every possible metric. Show what answers the report objective.

Copy:
- Hide empty panels, group by story, reduce cognitive load.

Do not copy:
- Dark ops-dashboard feel, dense monitoring chrome, alert-wall aesthetics.

## 10. Vercel Documentation

URL:
- https://vercel.com/design/guidelines
- https://vercel.com/geist/introduction

Page / screenshot reference:
- Vercel web interface guidelines and Geist design system.

What works:
- Crisp borders, visible focus, tabular numbers, redundant status cues, and accessible chart guidance.
- Clear content rules: concise labels, no dead ends, all states designed.
- Geist’s neutral high-contrast system is useful for an executive report.

Spacing:
- Grid-based, controlled, and consistent.

Typography:
- Strong type hierarchy with careful numeric alignment.

Information hierarchy:
- Page titles and section labels must reflect context accurately.

Tables:
- Use tabular numbers and redundant status cues.

Cards:
- Cards need crisp edges and a job to do.

Dashboard philosophy:
- Interface quality comes from many small decisions that reduce ambiguity.

Copy:
- Focus states, tabular numbers, redundant status labels, empty/error state discipline.

Do not copy:
- Marketing hero patterns, black product-launch visuals, decorative brand moments.

## Source Summary

The EIPreporter report should borrow:
- GitHub’s evidence tables and activity summaries.
- Linear’s calm rhythm, pruning, and landscape cards.
- Coinbase’s KPI hierarchy.
- Mintlify’s readable details and progressive disclosure.
- Stripe/Vercel’s accessibility and consistency discipline.
- Plausible/PostHog/Grafana’s visualization-by-question philosophy.

The report must reject:
- Decorative gradients, blobs, floating shapes, mystery icon controls.
- Bootstrap/admin-dashboard visual language.
- Crypto-exchange color intensity.
- Marketing hero composition.
- Cards as the default answer for every section.
