# EIPreporter Design System

This document governs every HTML report UI change. EIPreporter is an executive technology intelligence report, not a SaaS landing page, admin dashboard, ERP screen, Bootstrap template, or marketing site.

## Product Position

EIPreporter should feel closer to Bloomberg Intelligence, Morningstar Direct, GitHub Insights, Stripe editorial surfaces, Linear, and Coinbase Institutional.

Why:
- The reader is an executive, analyst, or institutional reviewer.
- Evidence quality, uncertainty, and timing matter more than visual novelty.
- The interface must remain trustworthy when source collection is incomplete.

## Report Philosophy

The page is designed around reading flow, not dashboard widgets. Typography, whitespace, tables, and concise editorial structure are the primary design tools.

The finalized main report structure is:
1. Executive Summary
2. Report at a Glance
3. Weekly Developments
4. Technology Landscape
5. Implementation and Lifecycle
6. Business Relevance
7. Evidence and Limitations
8. Appendix

Rules:
- Do not add, remove, or reorder main sections without a product decision.
- Do not reintroduce dashboard-style widgets as primary structure.
- Preserve raw evidence and traceability in the Appendix.
- Keep visible UI Korean-first, with English only for official names, stable technical terms, and section titles already intentionally English.
- Section numbering is visual only and must be applied with styling, not new structural sections.

Why:
- The report must be readable in about five minutes.
- The main body should contain decision-relevant information only.
- Audit detail belongs in collapsed supporting sections.

## Layout

Global rules:
- Maximum width: `1400px`.
- Desktop first.
- Use large outer margins and calm whitespace.
- Each major section should feel like a chapter in a research report.
- Use whitespace before borders; use borders only to aid scanning.

Rhythm:
- Cover
- Editorial summary
- Numeric strip
- Timeline or empty-week state
- Analyst narrative
- Matrix/table
- Evidence bibliography
- Appendix

Why:
- Adjacent sections should not all look like cards.
- A research report needs pacing: cover, interpretation, numbers, evidence, then audit data.

## Grid and Spacing

Use an 8pt spacing system:
- `4px`: optical adjustment
- `8px`: compact inline gap
- `12px`: metadata-to-heading gap
- `16px`: dense row or small block padding
- `24px`: standard content gap
- `32px`: section heading gap
- `48px`: cover or summary spacing
- `64px`: major chapter separation
- `96px`: terminal report break or footer separation

Desktop:
- Main content width: `min(1400px, calc(100% - 88px))`.
- Executive summary uses a 70/30 editorial split.
- Report at a Glance uses five equal horizontal blocks.
- Implementation and evidence comparisons use full-width tables.

Tablet:
- Collapse editorial splits to one column when the sidebar/fact panel would crowd text.
- Tables may scroll horizontally.

Mobile:
- One-column content.
- Tables scroll horizontally.
- Minimum touch target: about `44px`.

Why:
- Density should come from alignment and grouping, not tiny fonts or packed boxes.

## Typography

Font stack:

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Noto Sans KR", sans-serif
```

Scale:
- Cover display: `60-66px` desktop
- Section title: `28-34px`
- Subsection title: `18-24px`
- Body: `15-19px` depending on editorial prominence
- Caption: `13px`
- Meta: `11-12px`

Rules:
- Use tabular numbers for confidence, counts, and table values.
- Use weight sparingly; avoid oversized badges.
- Do not use negative letter spacing.
- Body line-height should stay around `1.6-1.75`.
- Cover titles may use uppercase for report identity only.
- Section numbers use metadata typography: small, muted, and secondary.

Why:
- Typography carries the institutional tone.
- Strong number rendering improves executive scanning.

## Color

Palette:
- Background: `#ffffff`
- Subtle surface: `#f6f8fa`
- Text: `#111318`
- Strong text: `#090a0d`
- Secondary text: `#3d4551`
- Muted text: `#68717f`
- Border: `#d6dce5`
- Soft border: `#eceff3`
- Strong border: `#aeb7c4`
- Information blue: `#1f6feb`
- Success green: `#16794c`
- Risk red: `#b42318`
- Warning amber: `#8f5800`

Rules:
- 95% monochrome.
- Blue is for links, information, selected states, and important numbers.
- Green, red, and amber are semantic only.
- No decorative gradients, purple, neon, glassmorphism, floating shapes, or abstract backgrounds.

Why:
- Institutional reports should feel calm and analytical.
- Semantic color must communicate status, not decoration.

## Design Tokens

Core token groups:
- Surface: `--bg`, `--paper`, `--surface`, `--surface-subtle`, `--surface-muted`
- Text: `--ink`, `--text`, `--text-secondary`, `--text-muted`
- Borders: `--line`, `--line-soft`, `--line-strong`
- Semantic color: `--blue`, `--green`, `--red`, `--amber` plus soft variants
- Spacing: `--space-1` through `--space-9`
- System: `--container`, `--line-height-body`, `--line-height-reading`, `--duration`, `--shadow-subtle`

Rules:
- Prefer tokens over repeated hardcoded values.
- New visual components must reuse the token groups above.
- Motion must use `--duration` and remain functional, not decorative.

Why:
- A frozen design needs durable primitives, not one-off CSS values.

## Borders, Radius, and Elevation

Rules:
- Default border: `1px solid var(--line)`.
- Strong borders only for table headers, cover facts, or section boundaries.
- Radius: `10px` maximum for neutral utility boxes.
- Pills may use `999px`.
- Shadows are rare and subtle: `0 1px 2px rgba(16,24,40,.04)`.
- Print removes visual effects.

Why:
- Crisp, quiet boundaries resemble GitHub and Stripe more than Bootstrap panels.

## Executive Cover

The cover contains only:
- Report identity
- Weekly conclusion
- Reporting period
- Generated time
- Confidence
- Executive rating or degraded collection status

Rules:
- White background.
- No KPI cards.
- No blobs, gradients, floating icons, or marketing copy.
- The title should dominate through typography, not color.
- The cover kicker is a restrained product label, currently `Weekly Executive Report`.

Why:
- The first viewport should establish report authority and evidence posture.

## Executive Summary

Rules:
- Do not place the summary in a card.
- Use a 70/30 split on desktop.
- Prose must visually dominate the page.
- The right panel is factual and compact: confidence, risk, signals, EIPs covered, evidence count.

Why:
- Executives need the interpretation first and the supporting facts nearby.

## Report at a Glance

Rules:
- Use a five-block horizontal numeric strip.
- Large value, small label, one concise sentence.
- No shadows.
- No colorful card backgrounds.
- Do not call this section a dashboard in visible UI.

Why:
- The section exists for quick comparison, not decoration.

## Tables and Matrices

Inspired by GitHub Insights.

Rules:
- Use tables for implementation, lifecycle comparisons, client status, evidence summaries, and appendix data.
- Headers use small uppercase metadata styling.
- Rows should be tall enough to read without becoming spreadsheet-like.
- Use subtle alternating row backgrounds and a restrained hover state.
- Align text left; center only true matrix cells.
- Use tabular numbers for numeric columns.
- Mobile tables scroll horizontally.
- Table borders should be mostly horizontal; avoid boxed Bootstrap-like grids.

Why:
- Analysts compare rows faster than card grids when assessing evidence.

## Cards

Rules:
- Use cards sparingly.
- Never use tall narrow portrait cards on desktop.
- Avoid nested cards and repeated boxed layouts.
- Prefer prose sections, tables, timelines, and citation lists.

Why:
- Too many cards make the report feel like an admin dashboard.

## Evidence

Rules:
- Direct evidence must be visually stronger than cluster references.
- Cluster references must never appear as verified implementation.
- Evidence items should resemble publication citations: title, source, date, confidence, summary.
- Long details belong in `details`.

Why:
- Evidence quality is the central trust signal.

## Details and Appendix

Inspired by Mintlify.

Rules:
- Use `details` for source metadata, score breakdowns, traceability, and long excerpts.
- Keep summary labels clear.
- Maximum two nesting levels.
- Appendix groups are collapsed by default.

Why:
- Experts need auditability, while executives need the main report to stay concise.

## Brand Header and Footer

Rules:
- Branding must be small, textual, and restrained.
- Footer copy should identify generation, weekly intelligence purpose, version, traceability, and source coverage.
- Branding must never become a marketing hero or product homepage treatment.

Why:
- Research products need provenance and version confidence more than visual decoration.

## Empty and Degraded States

Rules:
- Empty states must say what was not collected, not what does not exist.
- Do not show empty release or activation sections.
- Do not render empty radar quadrants in the main report.
- Degraded mode is calm and factual, never a red alert.

Why:
- Absence of collected evidence is not evidence of absence.

## Status Chips

Rules:
- Chips always include text.
- Do not rely on color alone.
- Use Korean labels such as:
  - `구현 추적`
  - `검증된 구현 없음`
  - `참조 근거`
  - `직접 근거`
  - `클러스터 참조`
  - `릴리스 근거 없음`
  - `활성화 근거 없음`
  - `운영 채택 근거 없음`
- Chips are small and secondary.

Why:
- Status is a factual claim and must remain explicit.

## Responsive and Print

Responsive:
- Desktop is the primary review mode.
- Tablet layouts collapse before text becomes cramped.
- Mobile tables scroll instead of clipping.

Print:
- White background.
- Hide sticky navigation and scripts.
- Remove shadows.
- Avoid cutting tables, lifecycle rails, timeline entries, and evidence items across pages.

Why:
- The report must work as both an interactive HTML review and a printable institutional briefing.

## Accessibility

Rules:
- Use semantic headings.
- Preserve visible focus states.
- Keep `details/summary` keyboard accessible.
- Do not use icon-only controls.
- Ensure adequate contrast.

Why:
- Accessibility and executive clarity both require explicit labels and predictable structure.

## Prohibited

Never add:
- Bootstrap-like panels
- Admin dashboard widget grids
- ERP-style dense forms
- Material Design surfaces
- Floating controls
- Mystery buttons
- Decorative icons
- Blob backgrounds
- Floating circles
- Decorative gradients
- Conic gradients
- Oversized badges
- Crypto-exchange visual intensity
