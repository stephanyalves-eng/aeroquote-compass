# AeroQuote Compass: Supplier Quotation Intelligence

**Live demo:** https://aeroquote-compass.lovable.app

A strategic procurement tool that turns a stack of supplier quotations into an auditable sourcing decision. Buyers upload quotes in any format, AI extracts the commercial terms, the buyer reviews and confirms every field, and deterministic code calculates the total annual landed cost, supplier scores, risks, anomalies and a recommendation that can be exported as PDF, Excel or CSV.

> **AI extracts. Buyers validate. Code calculates. You decide.**

All data in this project is synthetic and created for portfolio purposes. Supplier names are fictitious. No real company data, licenses or technical manuals were used.

## The problem

Quotes for the same RFQ rarely compare like for like: different currencies, Incoterms, price breaks, freight and insurance treatment, one-time charges, revisions and validity dates. Choosing on unit price picks the wrong supplier and misses compliance gaps. AeroQuote Compass normalizes every quote to **Total Annual Landed Cost** and makes the trade-offs explicit.

## User journey

| Step | What happens |
|---|---|
| 01 RFQ Setup | RFQ number, part number, revision, annual volume, required certification, FX rates, Incoterm adders, delivery date and location, incumbent supplier and target cost. Required fields are validated before analysis starts. |
| 02 Upload Quotes | Drag and drop up to 20 files per RFQ (PDF, XLSX, XLS, CSV, TXT) or paste text. Each file shows status, confidence and actions (reprocess, remove). |
| 03 Review Data | AI extraction with a confidence score per field (High ≥ 90%, Medium 70 to 89%, Review Required < 70%). The buyer edits, resets to the extracted value and confirms each quotation. Nothing is calculated before confirmation. |
| 04 Compare & Decide | KPI cards, supplier comparison table, landed cost and cost breakdown charts, configurable supplier scoring, risk and anomaly review, procurement recommendation, decision impact and exports. |

RFQ analyses can be saved to a private history (sign-in required) with status Draft, Analyzing, Completed, Under Negotiation or Awarded.

## Sample result (RFQ-24410, PN-45Y1258 Rev C, 12 units/year, today = 2026-10-25)

| Supplier (fictitious) | Quote | Annual landed cost (USD) | Risk | Outcome |
|---|---|---|---|---|
| Polar Aerospace | USD 17,250 EXW + tooling 6,500 | 225,920 | High | Not awardable: quoted Rev B, requested Rev C |
| Helix Precision | EUR 16,300 DAP + FAI EUR 2,800 | 228,245 | High | Not awardable: quote expired; lead time exceeds required delivery |
| **Atlas Controls** | USD 18,450 FCA | **230,256** | Medium | **Recommended** |
| Meridian Flight Components (incumbent) | USD 16,900 EXW + freight, insurance, NRE | 237,800 | Low | Lowest unit price, highest landed cost |

**Insight:** the incumbent has the lowest unit price but the highest annual landed cost once freight, insurance and NRE are included. The two cheapest landed offers cannot be awarded until their compliance issues are resolved. Recommending Atlas saves about **USD 7,544 per year (3.2%) versus the incumbent**.

## How the numbers are calculated

| Item | Rule |
|---|---|
| FX | EUR to USD = EUR/BRL ÷ USD/BRL; BRL to USD = amount ÷ USD/BRL (rates editable) |
| Material | Applicable price break for the annual volume × volume, in USD |
| Logistics | Quoted freight and insurance when provided; otherwise a combined Incoterm adder, flagged as **Estimated** (EXW 6%, FCA 4%, FOB 3%, CPT/CIP 1.5%, DAP/DDP 0% of goods value) |
| Annual landed cost | Material + freight + insurance (or estimated adder) + duties and other adders + one-time costs (tooling, NRE, FAI) |
| Savings | Recommended supplier versus incumbent quote, or versus annual target cost when no incumbent exists. Never invented when neither is available |

Original quote values, normalized values and calculated values are stored and displayed separately. Missing information is shown as "Not provided"; estimates are labelled "Estimated".

## Supplier scoring

Default weights, editable by the buyer (must total 100%):

| Criterion | Weight | Method |
|---|---|---|
| Total cost | 40% | Min-max across suppliers: lowest annual landed cost = 100, highest = 0 |
| Lead time | 20% | Min-max: shortest = 100, longest = 0 |
| Supplier risk | 15% | 100 minus risk score (Low 0, Medium 50, High 100) |
| Payment terms | 10% | Min-max: longest payment days = 100 |
| Certification / compliance | 10% | 100 when certification, revision and part number comply |
| Commercial conditions | 5% | 100 minus penalties for escalation clauses, commercial exceptions and separate one-time charges |

Every score shows its contributions and formulas. Suppliers with critical findings (revision or part number mismatch, missing required certification, expired quote) are shown as "Not awardable until resolved" and are excluded from the recommendation.

## Risk and anomaly detection

Risk is assessed from certification, lead time versus required delivery date, quote validity, commercial exceptions, missing information, country of origin and extraction confidence. When data is insufficient the tool says "Insufficient data" instead of guessing.

Anomalies are warnings unless they are critical: price far from the peer average, currency, Incoterm or payment terms different from most suppliers, revision or part number mismatch, missing certification, unusually long lead time, missing freight or insurance, expired quote, MOQ far from peers, and tooling or NRE charged outside the unit price.

## Exports

- **PDF:** RFQ information, supplier comparison, annual landed cost chart, scoring with formulas, risk and anomalies, recommendation, key trade-offs and savings.
- **Excel:** RFQ data, supplier data (original and reviewed extraction), normalized cost data, scoring, risk assessment and recommendation.
- **CSV:** normalized comparison table.

## Design decisions

- **The LLM only extracts.** Every number that drives an award decision is calculated by tested TypeScript code.
- **Human in the loop.** AI confidence is self-reported, so the buyer must confirm each quotation before any calculation.
- **Transparency over black-box scoring.** Weights, formulas and contributions are visible and exported.
- **Data integrity.** No invented values, no silent replacement of extracted values, clear "Estimated" and "Not provided" labels.

## Quality

- 78 automated tests covering FX, price breaks, landed cost, alerts, scoring, anomalies, incumbent matching, supplier name normalization and the sample scenario.
- End-to-end browser check of the full flow: load samples, extract, confirm, compare, export CSV, Excel and PDF.

## Stack

- Lovable: TanStack Start, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- Lovable AI gateway for structured extraction (JSON schema with per-field confidence)
- Lovable Cloud (Supabase) for private RFQ history
- SheetJS, jsPDF and jsPDF-AutoTable for file reading and exports
- Visual identity: Stephany Alves Design System (SIGNAL & STRUCTURE)

## Limitations

- Freight adders are simplified percentages, not carrier quotes.
- Duties are only included when stated in the quote; import taxes are not modelled, so a domestic quote with taxes included is not directly comparable with an imported quote.
- PDF extraction depends on the file having a text layer.
- The confidence score is reported by the model and is a review aid, not a guarantee.

## Author

Stephany Alves · Procurement, supply chain and data · SIGNAL & STRUCTURE
