# Weekly RFQ recommendation metrics

## After buyer confirmation of quotations (north-star metric)

- Event: `project.rfq_recommended_after_buyer_confirmation`.
- Counts the first successful individual or demo quotation-confirmation action that yields an eligible recommendation from the complete buyer-confirmed comparison set, with valid RFQ inputs and scoring weights. Held quotations are excluded using the existing comparison gate.
- Does not wait for decision approval, PO issue or supplier acknowledgement. Partial confirmation, field-only/bulk acknowledgement and a comparison with no eligible supplier do not count.
- A distinct milestone in the retained RFQ audit prevents recounting edits/reconfirmation and saved/reopened analyses. Reopening alone never emits an event; pre-instrumentation history is not backfilled.
- Weeks start Monday in America/Sao_Paulo using actual event recording time, not the synthetic analysis date. Only `synthetic: boolean` is sent; no commercial or personal identifiers.
- Deduplication is scoped to the retained audit, not globally across independent unsaved/concurrent copies or replaced samples. Localhost verification uses a stub, not real traffic.

```sql
SELECT
  toStartOfWeek(event_time, 1, 'America/Sao_Paulo') AS week_start,
  countIf(JSONExtractBool(properties_json, 'synthetic') = false) AS real_rfqs,
  countIf(JSONExtractBool(properties_json, 'synthetic') = true) AS demo_rfqs
FROM custom_events
WHERE is_bot = false
  AND event_name = 'project.rfq_recommended_after_buyer_confirmation'
GROUP BY week_start
ORDER BY week_start ASC
```

Request complete local weeks (up to 168 hours per query). Preview/published use is required for real ingestion.

## After supplier confirmation

- Event: `project.rfq_recommended_after_supplier_confirmation`.
- Count the first successful supplier acknowledgement recorded while a current eligible recommendation exists from buyer-confirmed quotations.
- Delivery-date corrections, PO amendments and reopening a saved RFQ do not recount the persisted RFQ audit.
- Weeks begin Monday in America/Sao_Paulo, based on the actual analytics event recording time, not the entered supplier date or synthetic analysis date.
- Real RFQs exclude `synthetic: true`; report demo RFQs separately.
- No RFQ numbers, supplier names, acknowledgement references, dates or user identities are sent.
- Deduplication is scoped to the RFQ's retained audit. Independent unsaved copies, cleared/replaced demos or concurrent copies are separate analyses, not globally deduplicated commercial RFQs.
- Historical milestones before instrumentation are not backfilled. Real ingestion requires use of the preview/published app; localhost checks use a stub and are not traffic.
- This is distinct from the north-star metric of recommendations after buyer confirmation of quotations: it waits for the later supplier acknowledgement.

Weekly aggregate (request a window containing complete local weeks, up to 168 hours per query):

```sql
SELECT
  toStartOfWeek(event_time, 1, 'America/Sao_Paulo') AS week_start,
  countIf(JSONExtractBool(properties_json, 'synthetic') = false) AS real_rfqs,
  countIf(JSONExtractBool(properties_json, 'synthetic') = true) AS demo_rfqs
FROM custom_events
WHERE is_bot = false
  AND event_name = 'project.rfq_recommended_after_supplier_confirmation'
GROUP BY week_start
ORDER BY week_start ASC
```