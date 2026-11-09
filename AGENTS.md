<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- RFQ business rules (FX, costs, alerts, ranking) live in src/lib/rfq/rules.ts with tests in rules.test.ts; the AI only extracts JSON in extract.functions.ts. Why: calculations must be deterministic and testable.
- Supplier display names and fictitious-marker detection use the shared deterministic supplier-name helper, without mutating extracted quotes. Why: tables, ranking cards, and email drafts must agree without affecting business rules.
- Procurement intelligence extends legacy rules in separate deterministic modules; buyer-confirmed documents preserve original extraction and reviewed values. Why: new landed costs, scoring and anomalies must not silently change legacy totals or alerts.
- Quoted annual logistics replace the combined Incoterm estimate only in the extended landed-cost analysis; missing freight/insurance are never split or presented as quoted zero. Why: avoid double counting and invented costs.
- RFQ history is Cloud-persisted with authenticated owner-only access; analysis and exports remain public without sign-in. Why: protect commercial data while retaining the portfolio demo workflow.
- Spreadsheet reading and PDF/Excel downloads are dynamically loaded in browser event handlers. Why: avoid browser-only library evaluation during Worker SSR.
- Review issues and field transitions live in pure review-issues helpers, separate from confirmed-only intelligence; optional field state and demo audit events persist in snapshots. Why: review acknowledgements must not alter calculations or award eligibility, and old history must reopen.
- Landed-cost provenance, scenario inputs, eligibility explanation and decision validation live in pure domain modules; optional approved decisions persist alongside audit events and are invalidated on analysis changes. Why: later scenario / PO phases must reuse deterministic calculations without stale approvals.
- PO references reuse the approved supplier's landed breakdown, preserving combined estimates separately; pure PO checks, fingerprint-bound buyer resolutions and explicit release state persist in optional snapshots. Why: corrections and changed approvals must never retain stale exception acceptance or release.
- Configuration control lives in pure revisions.ts (current revision chosen by effective/superseded dates, deep-frozen snapshots, configuration gate layered on top of po-check), with investigation.ts and audit-timeline.ts deriving from snapshots. Why: later document changes must never rewrite past checks and release must stay blocked until revision impact is assessed.
- Extended demo quotes are pre-extracted records in sample-catalog.ts; held quotes use the optional `excluded` flag so comparison can proceed without them. Why: reproducible 20-quote demo without AI calls while the classic 4-quote sample and its tests stay unchanged.
- The auditable decision summary is assembled by pure decision-summary.ts (sections of human-labelled strings) and rendered by exports.ts; audit-describe.ts turns audit events into readable text. Why: exports and the timeline must never expose internal field keys or raw JSON, and must state "Not yet recorded" instead of failing.
