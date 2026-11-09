# Phase 1 — Review pending items

Implement only the review extension; PO checks, release and the visible audit trail remain inactive.

## Changes
- Preserve the four navigation tabs, label RFQ Setup as step 0, and add a compact eight-stage indicator with future stages visibly unavailable.
- Add a review summary, counted filters, expandable pending items, field-level confirmation/follow-up and reliable-field bulk confirmation previews. Item actions focus the existing editable field.
- Require individual confirmation of all eight critical fields before quotation confirmation. Invalid quotation values block comparison; accurately confirmed RFQ mismatches and expired quotes can enter comparison but remain award blockers.
- Record extraction and review actions under a fictional demo buyer; persist optional field state and audit events in existing history snapshots.
- Keep legacy calculations, eligibility, exports, sample text and visual identity unchanged.

## Decisions
- Missing confidence stays unknown, never fabricated. Helix's missing ECCN and relative validity remain reviewable even without confidence.
- Confirming an accurate missing non-required field resolves its review task; award blockers remain visible after confirmation.
- Existing confirmed history snapshots without field state retain their confirmed status. New extractions require individual critical-field review.
- The existing pure landed-cost/scoring modules remain authoritative; Phase 1 adds shared future-facing types, not new formulas or PO behavior.

## Technical details
- Add `review-types.ts`, `review-issues.ts`, `audit.ts` and focused unit tests; extend optional `QuoteDocument.fieldStatus` and `Snapshot.auditEvents`.
- Centralize detection, sorting, summaries, confirmation guards, immutable field actions and bulk selection in pure helpers.
- Map validation errors to human field labels; keep `rules.ts` and its tests untouched.
- Wire actions and audit state in `index.tsx`, with presentation in the review panel and a compact stage indicator.

## Verification
Run all existing and new tests; exercise real sample extraction, review actions, four quotation confirmations and comparison in Playwright. Check desktop/mobile review layouts, focus targeting and no page overflow. Verify unchanged sample landed costs and recommendation at 2026-10-25.