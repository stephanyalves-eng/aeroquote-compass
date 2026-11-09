# Phase 4 — 20 sample quotes, revision control, PO pre-manufacturing barrier and failure investigation

UI stays in English, Signal & Structure identity unchanged, legacy `rules.ts` untouched, all existing 162 tests must still pass. Colors: red blockers, amber review/re-evaluation, green confirmed/current, gray superseded history.

## Key decisions
1. **Two sample sets, one data format.** "Load sample quotes" keeps today's 4-quote RFQ-24410 set (Atlas recommended, $7,544 savings — existing tests stay valid). A new "Load extended sample (20 quotes)" adds 16 more quotes in the same `SAMPLE_QUOTES` text format, same RFQ, PN-45Y1258, 12 units/year, USD base. With 20 quotes the recommendation is whatever the system calculates — never hard-coded; the final report states the computed winner.
2. **Demo extraction without 20 AI calls.** Each sample gets a deterministic pre-extracted record (values + per-field confidence) used only for sample files, so the 20-quote demo loads instantly and reproducibly. Real uploads still use AI extraction. Samples still enter as "Needs buyer validation" — no shortcut around confirmation, but a demo-only "Confirm all sample quotes" action records audit events per quote.
3. **Revisions are entities, not text.** Current revision is chosen by effective/superseded dates and status, never array position or string order.
4. **Snapshots are immutable.** Every check freezes the references it used; later document changes create new records and alerts, never rewrite old ones.

## 1. 20-quote demo base (`samples.ts` + new `sample-catalog.ts`)
Existing 4 + 16 new fictitious suppliers (unique supplier, quote ID, file name). Coverage of all 20 required scenarios, e.g.:
- lowest unit price but highest landed cost (EXW + high freight); lowest landed cost blocked (missing AS9100D); NRE flipping rank; freight changing the winner; two quotes within 0.5%; payment terms swinging score; faster but more expensive; recommended with medium risk; incumbent Meridian not recommended
- foreign currency (EUR, GBP, BRL with synthetic rate + rate date + converted value shown); expired; wrong PN; Rev B; no revision; low-confidence critical field; incomplete quote; MOQ > annual volume; taxes, insurance, tooling
- quote on Rev C before Rev D published; PO raised on previous revision
Target distribution (computed, asserted in tests): >=8 eligible, >=4 eligible with caveats, >=4 not eligible, >=4 awaiting validation/incomplete.

## 2. Comparison usable with 20 suppliers
- Search (supplier, quote ID, RFQ, PN); filters (revision, eligibility, risk, currency, status); sort (landed cost, unit price, score, lead time, confidence) — stable, non-mutating, ID-based.
- Result counter, active-filter chips, Clear filters, empty state, sticky table headers, horizontal scroll on mobile.
- Views: All · Eligible only · Recommendation + top alternatives · Blocked · Awaiting validation · Selected (checkbox selection).
- Charts show top 6 relevant suppliers by default with "Show all / selected".

## 3. Configuration and revision control (new step "Configuration")
- Registry of documents: part, drawing DWG-45210, specification, RFQ version — each with revision, effective date, superseded date, source, status (Current, Superseded, Awaiting confirmation, Divergent, Not provided), fictional owner, change reason, previous/next links.
- Demo timeline: drawing Rev C current at RFQ issue → Rev D published after a PO check (scenario controls let the buyer "Publish new revision" to trigger detection).
- New-revision detection: lists affected stages and checks done against the old revision, shows alert like "PO Check was completed against revision C. Revision D became current afterwards. Re-evaluate the quote and PO before manufacturing.", and requires an impact assessment (No known impact / Requires analysis / Requires new quote / Requires recalculation / Requires new PO Check / Blocks release) with justification.
- Revision matrix per stage (RFQ, Quote, Decision, PO, Inspection): expected vs found, check date, status, with the first broken link highlighted.
- Every relevant screen shows: current revision, revision used in last check, check date, documentation state. Labels distinguish Drawing revision, Buyer validation, PO verification, Configuration review (tooltips for each).

## 4. PO Check as last barrier before manufacturing (extends Phase 3)
- Adds checks for quote number, RFQ version, description, unit, taxes, NRE, tooling, delivery and billing address, certifications, technical clauses, quality requirements, applicable document references; outcome Confirmed / Requires review / Blocker / Not applicable.
- Blockers: revision missing/outdated, wrong supplier/PN, quote on incompatible revision, RFQ superseded, current drawing not assessed, critical qty/price/currency gap, untraceable mandatory document, missing certification. Tolerances only for rounding, qty variation, FX, small lead-time and accessory-cost gaps (applied tolerance shown); never for the listed critical fields.
- Discrepancy rows: field, approved, found, absolute and % difference, annual impact, reference source, severity, recommended action.
- Statuses from the spec (Awaiting PO … PO verified and released), and the statement "PO verified against drawing DWG-45210 revision C and RFQ-24410 version 2 on 9 November 2026." Nothing is auto-corrected.
- New PO demos: PO corrected before release; PO on previous revision.

## 5. Audit timeline (new step "Audit trail")
Builds on the existing audit list: RFQ created/versioned, drawing received, revision published, quote received/validated, recommendation, approval, PO created, PO Check, release, later change detected, inspection failure, investigation closed. Each event: time, document, revision, fictional actor, stage, result, impact, related events. Filters by supplier, PN, document, revision, PO, event type.

## 6. Failure investigation
Record failure (part, lot, supplier, PO, date, type, description, revision found vs current at manufacture, synthetic evidence, impact, status). Compared to snapshots, the system suggests one of: Documentation changed after verification · Existing divergence not detected · Process correct, non-documentary failure · Insufficient evidence — showing evidence used; the buyer must confirm; no automatic blame. Three demo failures cover the first three cases.

## 7. Flow indicator
Stage indicator expands to 11 stages (received → … → release before manufacturing → revision monitoring → failure investigation); tabs add Configuration, Audit trail and Investigation after PO Check, without breaking existing navigation, history reopen or exports.

## Technical details
- New pure modules in `src/lib/rfq/`: `sample-catalog.ts` (pre-extracted demo records), `quote-explorer.ts` (search/filter/sort/views), `revisions.ts` (DocumentRevision, current-revision selection, comparison, new-revision detection, impact assessment, matrix), `snapshots.ts` (ConfigurationSnapshot / VerificationCheck, frozen with `Object.freeze` + fingerprint), extended `po-check.ts` / `po-types.ts` (PODiscrepancy, new statuses, revision blockers), `audit-timeline.ts`, `investigation.ts` (InspectionFailure, FailureInvestigation, classification). Components only render.
- Upload limit of 20 files already matches; extended sample is 20 documents.
- Snapshot (history save) gains optional `revisions`, `snapshots`, `impactAssessments`, `failures` fields; old history still opens.
- Tests: exactly 20 samples, unique IDs/file names, status distribution, landed cost recomputed for all 20 with component sums, blocked never recommended, recommended = best eligible, search/filter/sort stability and non-mutation, snapshot immutability after revision change, new-revision alert, outdated PO blocked, correct PO released, post-check change vs undetected divergence vs unrelated failure classification, matrix break point.
- Verification: full test suite, Playwright run of the 20-quote flow (load → confirm → filter/sort → approve → PO block → correct → release → publish Rev D → alert → impact → failure investigation) at 1280px and 390px; update roadmap.md and AGENTS.md.
- Because this is large, it will be built in the order above and the final report lists anything not completed.
