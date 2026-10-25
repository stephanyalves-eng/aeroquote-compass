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
