# AeroQuote Compass

**AI extracts. Code calculates. You decide.**

AeroQuote Compass is an aerospace procurement workspace that takes supplier quotations from RFQ to a released purchase order, with every calculation deterministic and every decision traceable.

**Live demo:** https://aeroquote-compass.lovable.app

> All demo data (suppliers, quotes, drawings, purchase orders, investigations, people) is synthetic and fictitious. It does not represent real companies, prices or parts.

## Principles

- **AI extracts. Code calculates. You decide.** The AI only turns documents into a fixed schema; missing values stay empty and are never guessed.
- **Nothing enters a calculation before buyer confirmation.** Extracted quotes must be reviewed and confirmed before comparison, scoring or recommendation.
- **Deterministic rules live outside components.** Currency conversion, landed cost, eligibility, scoring, alerts, PO checks and revision gates are pure, unit-tested TypeScript modules.

## Features

Navigation is ERP-style, grouped as **Operate / Decide / Trace**.

- **Dashboard** — KPIs, items requiring attention, notifications and a weekly chart of recommendations after buyer confirmation (period selector and comparison with the previous interval).
- **RFQ Setup** — part, revision, volume, certification, currency, exchange rates and freight/insurance adders, with field-level validation.
- **Quotations** — AI extraction from text or PDF (sign-in required) plus demo samples: **Classic** (4 quotes) and **Extended** (20 quotes).
- **Buyer Validation** — pending-items panel, field-level confirmation of critical fields, flags and filters, and bulk confirmation limited by confidence thresholds with preview and undo.
- **Supplier Comparison & Decisions** — landed-cost breakdown with sources and formulas, eligibility with reasons, recommendation explanation, what-if scenarios, and overrides that require a written justification.
- **Purchase Orders & Release Control** — PO lifecycle (draft → issued → verified → released), PO Check against the approved decision with configurable tolerances, mandatory controls that block release, supplier acknowledgement, and PO document/PDF.
- **Configuration** — drawing/specification revision control, immutable check snapshots, revision impact assessment and a configuration gate on release.
- **Audit Trail** — human-readable timeline and an exportable **auditable decision summary** (PDF, Excel, CSV).
- **Investigations** — failure investigation linked to the revisions and checks in force at manufacture.
- **RFQ History** — private saved analyses (sign-in required), reopened with full state.
- **Draft autosave** — the current workspace (RFQ setup, quotes, reviews, decision, PO, audit) is autosaved to this browser as a versioned draft and restored on return ("Draft restored · Discard"). The draft is cleared after saving to history or starting a New RFQ.
- **Addressable screens** — every screen has its own URL (`/?view=quotations`, `/?view=decisions`, `/?view=purchase-orders`, …), so Back/Forward, refresh and deep links work. A link to a screen that is not available yet falls back to the nearest allowed screen with a short explanation.
- **Consistent progress** — the page eyebrow and the RFQ status are both derived from the eight-stage process tracker; a manually chosen status that is ahead of the evidence shows an inline note.

## Tech stack

TanStack Start (React 19, TypeScript, Vite) · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres with Row Level Security, auth) via Lovable Cloud · Vitest · Playwright browser checks.

## Run locally

```bash
bun install
bun run dev        # start the app
bun run test       # run the unit test suite (vitest run)
```

AI extraction and saved history need the backend environment variables provided by Lovable Cloud.

## Project structure

```text
src/lib/rfq/          Domain modules: rules, landed cost, eligibility, recommendation,
                      review issues, PO check & lifecycle, revisions, audit, exports (+ tests)
src/components/rfq/   Workspace UI (ERP shell, review, comparison, PO, configuration, audit)
src/routes/           App routes (single workspace route)
drizzle/migrations/   Database schema migrations
tests/browser/        Playwright end-to-end checks
```

## Security

- RFQ history is protected by Row Level Security: each user can read and change only their own saved RFQs.
- AI extraction runs server-side and requires an authenticated user; inputs are validated with size limits (text, PDF size, output tokens).
- Dashboard telemetry stores only random IDs and a demo flag; real (non-demo) milestones are accepted only from signed-in users.
- CSV exports neutralise spreadsheet formula injection (cells starting with `=`, `+`, `-`, `@`).

## Accessibility & responsiveness

Designed for keyboard and screen-reader use (labelled landmarks, form errors linked to their fields, focusable scroll regions, status always paired with a word, WCAG AA contrast) and responsive from 320 px phones to wide desktops without horizontal page scrolling. The app warns before leaving a page only when work could be lost (the browser draft could not be stored, or a PO form has unsaved edits).

## Author

Stephany Alves — *Complexity, made clear.*
