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
