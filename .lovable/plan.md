# AeroQuote Compass: navigation, mobile and UX overhaul

This brief is large: 17 sections, touching nearly every screen. I'll deliver it in three rounds so each one ships stable and fully tested. All calculations, rules.ts, eligibility, PO gates, audit and exports stay exactly as they are. The visual identity stays too: deep forest, ivory, IBM Plex, no shadows or gradients.

## Round 1 (this turn): navigation, progress, mobile shell, safety
- **Six main steps:** RFQ Setup, Quotes, Buyer Validation, Compare, Decision, PO & Release. Each step holds the existing panels as sub-sections, so nothing is removed:
  - Quotes: upload, extraction and results.
  - Buyer Validation: the review screen and the pending-items panel.
  - Compare: the explorer, comparison, landed cost and score/risk.
  - Decision: the recommendation, alternatives, risks and approval.
  - PO & Release: the PO form, checks, the revision gate and release.
- **Traceability menu:** a secondary menu holding Configuration and revisions, Audit trail and Investigation, styled more quietly than the main steps.
- **Compact progress (desktop):** one six-step stepper plus a status line showing the current step, overall status, next step and blockers. The eleven-state row is removed; those detailed states move inside their own step as a small checklist.
- **Compact progress (mobile, under 768px):**
  - The top shows "Step X of 6", the step name, a progress bar and an "All steps" sheet.
  - The header shrinks, and a menu holds History, New RFQ, Demo data and Traceability.
  - A fixed bottom bar holds Back and Continue (Continue is disabled with a reason when blocked).
- **One Demo data area:** replaces the repeated "Load sample quotes" buttons. It offers Classic 4-quote and Extended 20-quote sets and says these replace current data. If any data exists, it asks for confirmation first.
- **Bulk "Confirm reliable fields" dialog:**
  - It shows the quotes affected, the fields that will be confirmed and the fields excluded. Supplier, part number, revision, currency, price, certifications and fields with divergences are never auto-confirmed.
  - It also shows the critical fields still pending and the confidence rule applied.
  - It has an explicit confirm, a processing state and a double-click guard, then shows success with Undo and writes an audit entry.
- **Save RFQ status:** Saving, Saved, Unsaved changes or Save failed, announced to screen readers.
- **Unsaved text in dialogs:** a warning before closing a decision or justification dialog that has unsaved text.
- **Shared formatting:** one set of en-US helpers for currency, numbers, percentages, dates and lead times, used across the UI. The export formatting stays unchanged.
- **Monospace font:** limited to IDs, part numbers, revisions, technical values and metadata.
- **Contrast:** secondary text gets a darker tone.
- **"Edit with Lovable" badge:** hidden on the published app.
- **Responsive basics:** no page-level horizontal scroll from 320px up, controls at least 44px tall on touch screens, and layout that holds at 200% zoom.

## Round 2: mobile tables and filtering
- **Card views on phones:**
  - Buyer Validation fields become cards with field, original value, reviewed value, confidence, status and action, using full-width inputs.
  - PO Check and Configuration rows become cards with expected, found, status, reason and action.
- **Supplier comparison on phones:** summary cards with View details, a 2 to 4 supplier shortlist and a full table you can switch to, which scrolls sideways.
- **Pending panel:**
  - Priority order: critical blockers, missing fields, low confidence, divergences, then ready for comparison.
  - Clickable count filters, search, severity sort, a result count, active-filter chips, Clear filters and View all.
- **20-quote comparison:**
  - It starts with five highlights: recommended, best eligible alternative, incumbent, lowest unit price and blocked suppliers.
  - It adds Show all, column selection, a sticky header and a sticky first column.
- **Recommendation sections:** Why this supplier won, Risks, Why others did not win, Calculation details and Alternatives.
- **PO & Release:** a seven-stage tracker running from Awaiting PO to Released.

## Round 3: new capabilities
- **Scenario analysis:** test quantity, exchange rate, freight, one-time cost spread and score weights. It reuses the existing scenario inputs and shows when and why the recommended supplier changes.
- **Revision diff:** shows changed fields, the old and new revision, impact, affected documents and the checks that need to be repeated.
- **Operational dashboard:** shows attention items, blocked POs, new revisions, expiring quotes, open investigations and next actions.

## Technical notes
- Step grouping and the status summary live in a pure `navigation.ts` with unit tests. It is built on the existing workflow-stage logic, and no later step is ever shown as complete before an earlier one.
- The bulk-confirm preview and the excluded-field rule are a pure function with tests, built on the review-issues helpers.
- Formatting goes in `src/lib/format.ts`, with tests.
- After each round:
  - Run all existing tests (249) plus new ones.
  - Browser checks at 320, 360, 390, 430, 768 and 1024px and desktop, plus 200% zoom.
  - A keyboard pass.
  - Re-run the PO acceptance browser test.
