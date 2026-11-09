import type { Currency, ExtractedQuote } from "./types";
import type { QuoteDocument } from "./workflow";
import { REVIEW_FIELDS } from "./workflow";
import { SAMPLE_QUOTES } from "./samples";
import { CRITICAL_FIELDS } from "./review-types";

/** Synthetic demo catalog: one record per sample quotation (same ExtractedQuote format the AI produces). */
export interface SampleQuote {
  id: string; fileName: string; rfq: string; scenario: string;
  /** Demo validation state: "validated" quotes may be buyer-confirmed in bulk; "awaiting" ones stay held for individual buyer validation. */
  demoState: "validated" | "awaiting";
  /** Drawing revision the supplier states it quoted against (traceability). */
  drawingRevision: string | null;
  quote: ExtractedQuote;
}
type Q = Partial<ExtractedQuote> & { supplier_name: string | null };
const conf = (n: number, low: Partial<Record<keyof ExtractedQuote, number>> = {}) => Object.fromEntries(REVIEW_FIELDS.map((f) => [f.key, low[f.key] ?? n]));
function q(p: Q, confidence = 95, low: Partial<Record<keyof ExtractedQuote, number>> = {}): ExtractedQuote {
  return { quote_id: null, quote_date: null, validity_end_date: "2027-01-31", part_number: "PN-45Y1258", revision: "C", unit_price: null, currency: "USD", quantity_basis: 12,
    price_breaks: [], incoterm: "FCA", incoterm_place: null, lead_time_days: 100, payment_terms_days: 60, one_time_costs: [], certifications: ["AS9100D"], fai_included: true,
    eccn: "9A991", warranty_months: 24, new_supplier_requires_qualification: false, surcharge_clause: null, notes: null, moq: 4, freight: null, insurance: null, duties: null,
    other_adders: null, country_of_origin: "USA", delivery_location: "São José dos Campos, Brazil", commercial_exceptions: null, ...p, confidence: conf(confidence, low) };
}
const s = (n: number, id: string, fileName: string, scenario: string, quote: ExtractedQuote, demoState: SampleQuote["demoState"] = "validated", drawingRevision: string | null = quote.revision): SampleQuote =>
  ({ id: `sample-${String(n).padStart(2, "0")}`, fileName, rfq: "RFQ-24410", scenario, demoState, drawingRevision, quote: { ...quote, quote_id: id } });
const usd = (amount: number, type: string, currency: Currency = "USD") => ({ type, amount, currency });

export const SAMPLE_CATALOG: SampleQuote[] = [
  s(1, "Q-77812", "atlas-quote.txt", "Expiring soon with surcharge clause; recommended-risk candidate (moderate risk).", q({ supplier_name: "ATLAS CONTROLS INC (FICTITIOUS)", quote_date: "2026-09-08", validity_end_date: "2026-11-07", unit_price: 18450, price_breaks: [{ min_qty: 24, unit_price: 17900 }], incoterm_place: "Miami, FL", lead_time_days: 120, surcharge_clause: "Raw material surcharge if aluminum index rises more than 8%." })),
  s(2, "PC-2026-0915", "helix-quote.txt", "Foreign currency (EUR); expired quotation; low confidence on validity and ECCN.", q({ supplier_name: "Helix Precision SA (FICTÍCIO)", quote_date: "2026-09-15", validity_end_date: "2026-10-15", unit_price: 16300, currency: "EUR", incoterm: "DAP", incoterm_place: "São José dos Campos", lead_time_days: 150, payment_terms_days: 90, one_time_costs: [usd(2800, "FAI", "EUR")], fai_included: false, eccn: null, warranty_months: 18, new_supplier_requires_qualification: true, moq: null, country_of_origin: "France" }, 92, { validity_end_date: 55, eccn: 50 })),
  s(3, "PA-55021", "polar-quote.txt", "Incompatible revision (Rev B vs Rev C) and tooling; quoted against superseded drawing.", q({ supplier_name: "POLAR AEROSPACE INC (FICTITIOUS)", quote_date: "2026-09-20", validity_end_date: "2026-11-04", revision: "B", unit_price: 17250, price_breaks: [{ min_qty: 30, unit_price: 16800 }], incoterm: "EXW", incoterm_place: "Wichita, KS", lead_time_days: 90, payment_terms_days: 30, one_time_costs: [usd(6500, "Tooling")], warranty_months: 12, moq: null })),
  s(4, "MFC-1042", "meridian-quote.txt", "Current (incumbent) supplier with quoted freight, insurance and NRE.", q({ supplier_name: "MERIDIAN FLIGHT COMPONENTS LLC (FICTITIOUS)", quote_date: "2026-10-20", validity_end_date: "2027-01-31", unit_price: 16900, incoterm: "EXW", incoterm_place: "Tulsa, OK", freight: 24000, insurance: 3000, duties: 0, other_adders: 0, one_time_costs: [usd(8000, "NRE")] })),
  s(5, "BD-Q-2026-311", "boreal-dynamics-angebot.txt", "Foreign currency (EUR) with quoted freight, insurance and import taxes.", q({ supplier_name: "BOREAL DYNAMICS GMBH (FICTITIOUS)", quote_date: "2026-10-02", validity_end_date: "2027-02-28", unit_price: 15200, currency: "EUR", incoterm_place: "Hamburg", lead_time_days: 110, freight: 6000, insurance: 900, duties: 4200, country_of_origin: "Germany" })),
  s(6, "CH-90417", "cascade-hydraulics-quote.txt", "Confirmed quotation; lowest unit price, but EXW freight makes landed cost higher.", q({ supplier_name: "CASCADE HYDRAULICS LLC (FICTITIOUS)", quote_date: "2026-10-05", unit_price: 15950, incoterm: "EXW", incoterm_place: "Seattle, WA", lead_time_days: 105, freight: 38000, insurance: 2500 })),
  s(7, "DFP-7730", "delta-fluid-power-quote.txt", "Most expensive option with the fastest lead time.", q({ supplier_name: "DELTA FLUID POWER INC (FICTITIOUS)", quote_date: "2026-10-06", unit_price: 18900, incoterm: "DAP", incoterm_place: "São José dos Campos", lead_time_days: 60, payment_terms_days: 30 })),
  s(8, "EAP-2026/118", "equinox-proposta.txt", "BRL quotation; 120-day payment terms lift the score; long lead time.", q({ supplier_name: "EQUINOX AERO PARTS LTDA (FICTÍCIO)", quote_date: "2026-10-08", validity_end_date: "2027-01-15", unit_price: 98000, currency: "BRL", incoterm: "CIP", incoterm_place: "São José dos Campos", lead_time_days: 140, payment_terms_days: 120, country_of_origin: "Brazil" })),
  s(9, "FM-3381", "falcon-machining-quote.txt", "Lowest landed cost, blocked: required AS9100D certification missing.", q({ supplier_name: "FALCON MACHINING INC (FICTITIOUS)", quote_date: "2026-10-09", unit_price: 16500, incoterm_place: "Dallas, TX", lead_time_days: 95, certifications: ["ISO 9001:2015"] })),
  s(10, "GA-55-0192", "granite-aerostructures-cotizacion.txt", "Wrong part number (PN-45Y1285) quoted.", q({ supplier_name: "GRANITE AEROSTRUCTURES SA (FICTITIOUS)", quote_date: "2026-10-10", part_number: "PN-45Y1285", unit_price: 17800, incoterm_place: "Querétaro", lead_time_days: 100, country_of_origin: "Mexico" })),
  s(11, "HP-2026-0447", "horizon-precision-quote.txt", "Correct revision; expires within 30 days — moderate-risk candidate.", q({ supplier_name: "HORIZON PRECISION LLC (FICTITIOUS)", quote_date: "2026-10-11", validity_end_date: "2026-11-20", unit_price: 17400, incoterm_place: "Phoenix, AZ", lead_time_days: 95 })),
  s(12, "IA-60023", "ionic-actuation-quote.txt", "MOQ (24 units) above annual volume (12 units).", q({ supplier_name: "IONIC ACTUATION INC (FICTITIOUS)", quote_date: "2026-10-12", unit_price: 18100, incoterm_place: "Denver, CO", lead_time_days: 100, moq: 24 })),
  s(13, "JC-1150", "jetstream-components-quote.txt", "Quotation without revision — held for buyer validation.", q({ supplier_name: "JETSTREAM COMPONENTS LLC (FICTITIOUS)", quote_date: "2026-10-13", revision: null, unit_price: 17650, incoterm_place: "Charlotte, NC" }, 90, { revision: 0 }), "awaiting", null),
  s(14, "KFS-8802", "kestrel-flight-systems-quote.txt", "Incomplete proposal: unit price not stated.", q({ supplier_name: "KESTREL FLIGHT SYSTEMS INC (FICTITIOUS)", quote_date: "2026-10-14", unit_price: null, incoterm_place: "Atlanta, GA", lead_time_days: null }, 88, { unit_price: 0, lead_time_days: 0 }), "awaiting"),
  s(15, "LA-2026-74", "lumen-aerospace-oferta.txt", "Critical field (unit price) extracted with low confidence.", q({ supplier_name: "LUMEN AEROSPACE SA (FICTITIOUS)", quote_date: "2026-10-15", unit_price: 17300, incoterm_place: "Lisbon", country_of_origin: "Portugal" }, 85, { unit_price: 42, quantity_basis: 60 }), "awaiting"),
  s(16, "MH-24410-R1", "monarch-hydraulics-angebot.txt", "Currency missing; supplier quoted against drawing Rev C before Rev D was announced.", q({ supplier_name: "MONARCH HYDRAULICS GMBH (FICTITIOUS)", quote_date: "2026-10-16", unit_price: 16200, currency: null, incoterm_place: "Munich", country_of_origin: "Germany" }, 86, { currency: 30 }), "awaiting"),
  s(17, "NAS-4471", "nimbus-aero-systems-quote.txt", "Within 0.5% of another proposal on landed cost.", q({ supplier_name: "NIMBUS AERO SYSTEMS INC (FICTITIOUS)", quote_date: "2026-10-17", unit_price: 18420, incoterm_place: "Orlando, FL", lead_time_days: 110 })),
  s(18, "OC-2026-903", "orion-controls-quote.txt", "One-time NRE moves the proposal down the cost ranking.", q({ supplier_name: "ORION CONTROLS LLC (FICTITIOUS)", quote_date: "2026-10-18", unit_price: 17700, incoterm_place: "Houston, TX", lead_time_days: 100, one_time_costs: [usd(15000, "NRE")] })),
  s(19, "PF-61208", "pegasus-fluidics-quote.txt", "High score with higher cost: fast delivery and 90-day payment terms.", q({ supplier_name: "PEGASUS FLUIDICS INC (FICTITIOUS)", quote_date: "2026-10-19", unit_price: 19600, incoterm: "DAP", incoterm_place: "São José dos Campos", lead_time_days: 70, payment_terms_days: 90 })),
  s(20, "QM-77-140", "quantum-motion-cotacao.txt", "Quoted EXW freight changes the winner versus the Incoterm estimate; ECCN to confirm.", q({ supplier_name: "QUANTUM MOTION SA (FICTITIOUS)", quote_date: "2026-10-20", unit_price: 16800, incoterm: "EXW", incoterm_place: "Curitiba", lead_time_days: 100, freight: 30000, insurance: 1800, eccn: null, country_of_origin: "Brazil" }, 90, { eccn: 60 })),
];

const money = (n: number | null, c: Currency | null) => n == null ? "not stated" : `${c ?? ""} ${n.toLocaleString("en-US")}`.trim();
/** Readable synthetic source document; layouts vary moderately by sample. */
export function sampleText(sample: SampleQuote, index = Number(sample.id.slice(-2)) - 1): string {
  if (index < SAMPLE_QUOTES.length) return SAMPLE_QUOTES[index]!;
  const x = sample.quote, rev = x.revision ? `Rev ${x.revision}` : "revision not indicated";
  const extras = [x.freight != null && `Annual freight: ${money(x.freight, x.currency)}`, x.insurance != null && `Annual insurance: ${money(x.insurance, x.currency)}`, x.duties != null && `Import taxes/duties (annual): ${money(x.duties, x.currency)}`, ...x.one_time_costs.map((c) => `${c.type} (one-time): ${money(c.amount, c.currency)}`)].filter(Boolean).join("\n");
  const lines = [
    `${x.supplier_name} — ${["QUOTATION", "Commercial offer", "Quote"][index % 3]} ${x.quote_id}`,
    index % 2 ? `Issued ${x.quote_date}; valid until ${x.validity_end_date}` : `Date: ${x.quote_date} | Validity: ${x.validity_end_date}`,
    `Ref ${sample.rfq} · ${x.part_number} ${rev} · Hydraulic actuator Y8 · Drawing DWG-45210 ${sample.drawingRevision ? `Rev ${sample.drawingRevision}` : "(revision not indicated)"}`,
    `Unit price: ${money(x.unit_price, x.currency)} for ${x.quantity_basis} units/year${x.moq ? ` · MOQ ${x.moq}` : ""}`,
    `Incoterm ${x.incoterm} ${x.incoterm_place ?? ""} · Lead time ${x.lead_time_days ?? "TBD"} days ARO · Payment net ${x.payment_terms_days} days`,
    extras,
    `Certifications: ${x.certifications.join(", ")} · ECCN: ${x.eccn ?? "to be confirmed"} · Origin: ${x.country_of_origin}`,
    x.new_supplier_requires_qualification ? "New source for this PN: qualification (sample + FAI) required." : "",
    `Warranty ${x.warranty_months} months. Synthetic demonstration document.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Builds the 20 demo documents already extracted (deterministic, no AI call). IDs are stable and position-independent. */
export function extendedSampleDocuments(): QuoteDocument[] {
  return SAMPLE_CATALOG.map((sample) => ({ id: sample.id, text: sampleText(sample), fileName: sample.fileName, fileType: "txt", status: "Needs Review", confirmed: false,
    original: structuredClone(sample.quote), reviewed: structuredClone(sample.quote), fieldStatus: {} }));
}

/** Demo-only bulk buyer validation: confirms every field of quotes marked "validated"; "awaiting" quotes are excluded until validated individually. */
export function confirmValidatedSamples(documents: QuoteDocument[]): QuoteDocument[] {
  return documents.map((d) => {
    const sample = SAMPLE_CATALOG.find((x) => x.id === d.id);
    if (!sample || !d.reviewed) return d;
    if (sample.demoState === "awaiting") return { ...d, excluded: true };
    const fieldStatus = Object.fromEntries([...REVIEW_FIELDS.map((f) => f.key), ...CRITICAL_FIELDS].map((k) => [k, { confirmed: true }]));
    return { ...d, fieldStatus, confirmed: true, status: "Extracted", excluded: false };
  });
}
