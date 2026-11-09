import { buildLandedCostBreakdown } from "./landed-cost";
import { toUsd, daysBetween } from "./rules";
import { normalizeSupplierName } from "./supplier-name";
import { DEMO_BUYER } from "./audit";
import type { Intelligence } from "./intelligence";
import type { RfqReference, ExtractedQuote } from "./types";
import type { ApprovedDecision } from "./recommendation";
import type { PurchaseOrder, ApprovedPoContext, PoTolerances, PoCheckItem, PoCheckResult, PoResolution, PoState, PoStatus } from "./po-types";
export const DEFAULT_PO_TOLERANCES: PoTolerances = { roundingUsd: 1, unitPricePercent: 0.5, quantityUnits: 0, fxUpdatePercent: 2, logisticsPercent: 5, leadTimeDays: 0 };
export const PO_TOLERANCE_FIELDS: { key: keyof PoTolerances; label: string; explanation: string }[] = [
  { key: "roundingUsd", label: "Total rounding (USD)", explanation: "Absolute USD allowance on total comparison and PO arithmetic consistency; never permits an invalid or missing total." },
  { key: "unitPricePercent", label: "Unit price tolerance (%)", explanation: "Beyond this percentage, unit price blocks release. Currency must still match exactly." },
  { key: "quantityUnits", label: "Quantity tolerance (units)", explanation: "Absolute quantity allowance; zero means exact. Beyond it, quantity blocks release." },
  { key: "fxUpdatePercent", label: "FX update tolerance (%)", explanation: "Permitted FX rate movement for converted USD values. Does not tolerate a quotation currency mismatch or override total arithmetic." },
  { key: "logisticsPercent", label: "Freight / insurance tolerance (%)", explanation: "Allowance versus approved annual logistics charges, including a separately identified combined system estimate. Beyond it requires buyer review." },
  { key: "leadTimeDays", label: "Lead time tolerance (days)", explanation: "Absolute day difference from the approved lead time. Missing dates are never auto-confirmed." },
];
export function toleranceErrors(t: PoTolerances): string[] {
  return PO_TOLERANCE_FIELDS.flatMap((f) => Number.isFinite(t[f.key]) && t[f.key] >= 0 && (f.key !== "quantityUnits" && f.key !== "leadTimeDays" || Number.isInteger(t[f.key])) && (!f.key.endsWith("Percent") || t[f.key] <= 100) ? [] : [`${f.label} must be a non-negative ${f.key === "quantityUnits" || f.key === "leadTimeDays" ? "whole number" : f.key.endsWith("Percent") ? "number no greater than 100" : "number"}.`]);
}
export function emptyPoState(): PoState { return { tolerances: { ...DEFAULT_PO_TOLERANCES }, resolutions: [], released: false }; }
export function invalidatePoState(state: PoState): PoState { return { ...emptyPoState(), tolerances: { ...state.tolerances } }; }
export const approvalReferenceFor = (d: ApprovedDecision, r: RfqReference) => `${r.rfqNumber} / ${d.supplier} / ${d.timestamp}`;
/** All financial values in the PO use the selected quotation currency. Unknown quoted logistics remain null, not quoted zero. */
export function buildApprovedPoContext(reference: RfqReference, supplier: Intelligence, decision: ApprovedDecision): ApprovedPoContext {
  if (!supplier.eligible || !supplier.document.confirmed || supplier.document.id !== decision.supplierId) throw new Error("An approved, buyer-confirmed eligible supplier is required.");
  const b = buildLandedCostBreakdown(supplier, { reference });
  if (b.validationErrors.length || b.annualTotal == null || !b.inputs.currency || !b.inputs.fxRate) throw new Error(b.validationErrors.join(" ") || "Approved landed cost is unavailable.");
  const q = supplier.baseline.quote, rate = b.inputs.fxRate;
  const sum = (test: (key: string, label: string) => boolean) => { const matches = b.components.filter((c) => test(c.key, c.label)); return matches.length ? matches.reduce((n, c) => n + c.amountUsd, 0) / rate : null; };
  const otherOneTime = sum((k, l) => k.startsWith("one-time-") && !/nre|non.recurring|tool|fai|first.article|inspection/i.test(l));
  const otherAnnual = sum((k) => k === "other_adders");
  const approvalReference = approvalReferenceFor(decision, reference);
  const expected: PurchaseOrder = {
    poNumber: "", supplier: supplier.name, quoteNumber: q.quote_id ?? "", rfqReference: reference.rfqNumber, approvalReference,
    partNumber: reference.partNumber, revision: reference.revision, description: reference.description ?? "", quantity: reference.annualVolume,
    unitPrice: b.inputs.unitPrice, currency: b.inputs.currency, totalValue: b.annualTotal / rate,
    incoterm: q.incoterm ?? "", incotermPlace: q.incoterm_place ?? "", freight: sum((k) => k === "freight"), insurance: sum((k) => k === "insurance"), logisticsEstimate: sum((k) => k === "estimate"),
    nre: sum((k, l) => k.startsWith("one-time-") && /nre|non.recurring/i.test(l)), tooling: sum((k, l) => k.startsWith("one-time-") && !/nre|non.recurring/i.test(l) && /tool/i.test(l)),
    inspectionFai: sum((k, l) => k.startsWith("one-time-") && !/nre|non.recurring|tool/i.test(l) && /fai|first.article|inspection/i.test(l)),
    otherCosts: otherOneTime == null && otherAnnual == null ? null : (otherOneTime ?? 0) + (otherAnnual ?? 0), taxesAndFees: sum((k) => k === "duties"),
    leadTimeDays: q.lead_time_days, deliveryDate: "", paymentTermsDays: q.payment_terms_days,
    deliveryAddress: reference.deliveryLocation ?? q.delivery_location ?? "", billingAddress: "", quoteValidityDate: q.validity_end_date ?? "",
    certifications: [reference.requiredCertification],
    // Explicit buyer policy controls; never pretend these clauses were extracted from the supplier quotation.
    mandatoryClauses: [reference.requiredCertification + " quality clause", "FAI / AS9102", `Export control / ECCN ${q.eccn ?? "confirmation required"}`, "Conflict minerals", "Counterfeit parts prevention"],
    issueDate: reference.today, buyer: DEMO_BUYER, usdBrl: reference.usdBrl, eurBrl: reference.eurBrl,
  };
  return { reference, quote: q, decision, breakdown: b, expected, approvalReference };
}
export const PO_FIELDS: { key: keyof PurchaseOrder; label: string; kind: "text" | "number" | "date" | "list" | "currency" }[] = [
  ...([['poNumber','PO number'],['supplier','Supplier'],['quoteNumber','Quote number'],['rfqReference','RFQ reference'],['approvalReference','Approval reference'],['partNumber','Part number'],['revision','Revision'],['description','Description']] as const).map(([key,label])=>({key,label,kind:"text" as const})),
  ...([['quantity','Quantity (units)'],['unitPrice','Unit price'],['totalValue','Total PO value'],['freight','Freight'],['insurance','Insurance'],['logisticsEstimate','Combined logistics estimate (system assumption)'],['nre','NRE'],['tooling','Tooling'],['inspectionFai','Inspection / FAI'],['taxesAndFees','Taxes and fees'],['otherCosts','Other costs'],['leadTimeDays','Lead time (days)'],['paymentTermsDays','Payment terms (days)']] as const).map(([key,label])=>({key,label,kind:"number" as const})),
  { key:"currency", label:"Currency", kind:"currency" },
  ...([['incoterm','Incoterm'],['incotermPlace','Incoterm place'],['deliveryAddress','Delivery address'],['billingAddress','Billing address'],['buyer','Buyer']] as const).map(([key,label])=>({key,label,kind:"text" as const})),
  ...([['deliveryDate','Delivery date'],['quoteValidityDate','Quote validity date'],['issueDate','PO issue date']] as const).map(([key,label])=>({key,label,kind:"date" as const})),
  {key:"certifications", label:"Certifications (semicolon-separated)",kind:"list"}, {key:"mandatoryClauses",label:"Mandatory clauses (semicolon-separated)",kind:"list"},
  {key:"usdBrl",label:"PO USD/BRL rate",kind:"number"}, {key:"eurBrl",label:"PO EUR/BRL rate",kind:"number"},
];
const normalize = (v: unknown) => String(v ?? "").trim().replace(/\s+/g," ").toUpperCase();
const absent = (v: unknown) => v == null || v === "" || Array.isArray(v) && !v.length;
const validNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
export function checkPurchaseOrder(po: PurchaseOrder, c: ApprovedPoContext, tolerances: PoTolerances = DEFAULT_PO_TOLERANCES): PoCheckResult {
  const items: PoCheckItem[] = [], validationErrors = toleranceErrors(tolerances), e = c.expected;
  const ref = { ...c.reference, usdBrl: po.usdBrl ?? c.reference.usdBrl, eurBrl: po.eurBrl ?? c.reference.eurBrl };
  const usd = (n: number) => { const v = toUsd(n, po.currency, ref); return v != null && Number.isFinite(v) ? v : null; };
  const push = (id: string, label: string, approvedValue: unknown, poValue: unknown, source: PoCheckItem["referenceSource"], status: PoCheckItem["status"], note: string, impact: number | null = null) => {
    const numeric = validNum(approvedValue) && validNum(poValue), diff = numeric ? Math.abs(poValue - approvedValue) : null;
    items.push({ id, fieldLabel: label, approvedValue, poValue, absoluteDifference: diff, percentDifference: numeric && approvedValue !== 0 ? Math.abs((poValue - approvedValue) / approvedValue * 100) : null, financialImpactUsd: impact, referenceSource: source, status,
      severity: status === "blocker" ? "Blocker" : status === "requires_review" ? "Review" : "Informational", recommendedAction: status === "blocker" ? "Request a corrected PO; this control cannot be accepted as an exception." : status === "requires_review" ? "Verify the source; accept with written justification or request a corrected PO." : status === "not_applicable" ? "No approved value is stated; no quoted zero assumed." : "No action required.", note, missing: absent(poValue) && status !== "not_applicable", fingerprint: JSON.stringify([id,approvedValue,poValue,status, tolerances]) });
  };
  if (validationErrors.length) { push("tolerances","Tolerance settings","Valid settings",validationErrors.join(" "),"Approved decision","blocker","Correct tolerance settings before checking."); return { items, tolerances:{...tolerances}, validationErrors, financialTotalUsd:null }; }
  const text = (key: keyof PurchaseOrder, label: string, source: PoCheckItem["referenceSource"], mandatory = false, match?: boolean) => {
    const approved = e[key], value = po[key];
    const ok = match ?? normalize(approved) === normalize(value);
    push(String(key), label, approved, value, source, absent(approved) && absent(value) && !mandatory ? "not_applicable" : !absent(value) && ok ? "confirmed" : mandatory ? "blocker" : "requires_review", ok && !absent(value) ? "Matches approved reference." : "Missing or different from the approved reference.");
  };
  const num = (key: keyof PurchaseOrder, label: string, source: PoCheckItem["referenceSource"], absolute: number, percent: number, mandatory = false, multiplier = 1) => {
    const a = e[key], v = po[key];
    if (absent(a) && absent(v)) { push(String(key),label,a,v,source,mandatory ? "blocker" : "not_applicable","No approved charge stated."); return; }
    if (!validNum(a) || !validNum(v)) { push(String(key),label,a,v,source,mandatory ? "blocker" : "requires_review","Missing, invalid, or unapproved amount."); return; }
    const allowance = Math.max(absolute, a * percent / 100), delta = Math.abs(v-a), within = delta <= allowance + 1e-8;
    push(String(key),label,a,v,source,within ? "confirmed" : mandatory ? "blocker" : "requires_review", delta < 1e-8 ? "Matches approved reference." : within ? `Within tolerance (±${percent ? `${percent}%` : absolute}): allowance ${allowance.toFixed(4)}.` : `Beyond tolerance (±${percent ? `${percent}%` : absolute}).`, usd((v-a)*multiplier));
  };
  text("supplier","Supplier","Approved decision",true, normalize(normalizeSupplierName(po.supplier).name) === normalize(normalizeSupplierName(e.supplier).name));
  text("partNumber","Part number","RFQ",true); text("revision","Revision","RFQ",true); text("currency","Currency","Reviewed quotation",true);
  for (const [key,label,source] of [["quoteNumber","Quote number","Reviewed quotation"],["rfqReference","RFQ reference","RFQ"],["approvalReference","Approval reference","Approved decision"],["description","Description","RFQ"],["incoterm","Incoterm","Reviewed quotation"],["incotermPlace","Incoterm place","Reviewed quotation"],["deliveryAddress","Delivery address","RFQ"]] as const) text(key,label,source);
  num("quantity","Quantity","RFQ",tolerances.quantityUnits,0,true,e.unitPrice ?? 0);
  num("unitPrice","Unit price","Landed-cost calculation",0,tolerances.unitPricePercent,true,c.reference.annualVolume);
  const approvedRate = c.breakdown.inputs.fxRate ?? 1;
  num("totalValue","Total PO value","Landed-cost calculation",tolerances.roundingUsd/approvedRate,0,true);
  for (const [key,label] of [["freight","Freight"],["insurance","Insurance"],["logisticsEstimate","Combined logistics estimate (system assumption)"]] as const) num(key,label,"Landed-cost calculation",0,tolerances.logisticsPercent);
  for (const [key,label] of [["nre","NRE"],["tooling","Tooling"],["inspectionFai","Inspection / FAI"],["taxesAndFees","Taxes and fees"],["otherCosts","Other costs"]] as const) num(key,label,"Landed-cost calculation",tolerances.roundingUsd/approvedRate,0);
  num("paymentTermsDays","Payment terms","Reviewed quotation",0,0);
  if (po.deliveryDate) {
    const deadline = c.reference.requiredDeliveryDate;
    push("deliveryDate","Delivery date",deadline || "Required date not specified",po.deliveryDate,"RFQ",!validDate(po.deliveryDate) ? "requires_review" : !deadline ? "requires_review" : daysBetween(deadline,po.deliveryDate) <= tolerances.leadTimeDays ? "confirmed" : "requires_review", deadline ? `Required delivery date ${deadline}; allowance ±${tolerances.leadTimeDays} days.` : "No approved delivery deadline is available.");
  } else {
    num("leadTimeDays","Lead time","Reviewed quotation",tolerances.leadTimeDays,0);
    if (c.reference.requiredDeliveryDate) push("deliveryDeadline","Lead time vs required delivery date",c.reference.requiredDeliveryDate,po.leadTimeDays,"RFQ",validDate(po.issueDate) && validNum(po.leadTimeDays) && daysBetween(po.issueDate,c.reference.requiredDeliveryDate)+tolerances.leadTimeDays >= po.leadTimeDays ? "confirmed" : "requires_review", `Delivery must fit the required date ${c.reference.requiredDeliveryDate}.`);
  }
  for (const [key,label] of [["billingAddress","Billing address"],["poNumber","PO number"],["buyer","Buyer"]] as const) push(key,label,"Required",po[key],"RFQ",String(po[key]).trim() ? "confirmed" : "requires_review","Required PO administration field.");
  text("quoteValidityDate","Quote validity date","Reviewed quotation");
  push("validity","PO issued within quote validity",e.quoteValidityDate,po.issueDate,"Reviewed quotation",validDate(e.quoteValidityDate) && validDate(po.issueDate) && daysBetween(po.issueDate,e.quoteValidityDate)>=0 ? "confirmed" : "blocker","PO issue date must not exceed the approved quotation validity; request renewed approval if expired.");
  for (const [key,label] of [["certifications","Certifications"],["mandatoryClauses","Mandatory clauses"]] as const) {
    const missing = e[key].filter((s)=>!po[key].some((v)=>normalize(v)===normalize(s)));
    push(key,label,e[key],po[key],key === "certifications" ? "RFQ" : "Approved decision",missing.length ? "requires_review" : "confirmed",missing.length ? `Missing requirements: ${missing.join("; ")}.` : "All required entries are present. Mandatory clause list is buyer policy, not supplier-extracted text.");
  }
  for (const [key,label] of [["usdBrl","USD/BRL exchange rate"],["eurBrl","EUR/BRL exchange rate"]] as const) {
    if (!validNum(ref[key]) || ref[key] <= 0) push(key,label,c.reference[key],ref[key],"RFQ","blocker","A positive exchange rate is required.");
    else if (po.currency === "USD" || key === "eurBrl" && po.currency === "BRL") push(key,label,c.reference[key],ref[key],"RFQ","not_applicable","This rate does not convert the PO currency.");
    else { const difference = Math.abs(ref[key]/c.reference[key]-1)*100; push(key,label,c.reference[key],ref[key],"RFQ",difference<=tolerances.fxUpdatePercent+1e-8 ? "confirmed" : "requires_review",difference === 0 ? "Matches approved FX." : difference<=tolerances.fxUpdatePercent+1e-8 ? `Within tolerance (±${tolerances.fxUpdatePercent}%).` : `FX movement exceeds ±${tolerances.fxUpdatePercent}%.`,null); }
  }
  // Reuse Phase 2 for PO arithmetic and USD conversion, with explicit PO adders; never auto-correct PO fields.
  const adders = [po.freight,po.insurance,po.logisticsEstimate,po.nre,po.tooling,po.inspectionFai,po.taxesAndFees,po.otherCosts];
  const validAmounts = adders.every((v)=>v==null || validNum(v));
  const poQuote: ExtractedQuote = { ...c.quote, currency:po.currency, unit_price:po.unitPrice, price_breaks:[], freight:po.freight ?? 0, insurance:po.insurance ?? 0, duties:po.taxesAndFees, other_adders:(po.otherCosts??0)+(po.logisticsEstimate??0), one_time_costs:[{type:"NRE",amount:po.nre??0,currency:po.currency},{type:"Tooling",amount:po.tooling??0,currency:po.currency},{type:"Inspection / FAI",amount:po.inspectionFai??0,currency:po.currency}] };
  const calculated = buildLandedCostBreakdown(poQuote,{reference:ref,annualVolume:po.quantity ?? 0});
  const totalUsd = validAmounts && !calculated.validationErrors.length ? calculated.annualTotal : null;
  const statedUsd = validNum(po.totalValue) ? usd(po.totalValue) : null;
  const consistent = totalUsd != null && statedUsd != null && Math.abs(statedUsd-totalUsd)<=tolerances.roundingUsd+1e-8;
  push("arithmetic","Total arithmetic consistency (USD)",totalUsd,statedUsd,"Landed-cost calculation",consistent ? "confirmed" : "blocker",consistent ? Math.abs((statedUsd??0)-(totalUsd??0))>1e-8 ? `Within tolerance (±USD ${tolerances.roundingUsd.toFixed(2)}).` : "Quantity × unit price + all PO adders equals stated total." : "Stated total must equal quantity × unit price + all PO adders within the USD rounding allowance.",totalUsd != null && statedUsd != null ? statedUsd-totalUsd : null);
  items.sort((a,b)=>({blocker:0,requires_review:1,confirmed:2,not_applicable:3}[a.status]-{blocker:0,requires_review:1,confirmed:2,not_applicable:3}[b.status]));
  return {items,tolerances:{...tolerances},validationErrors,financialTotalUsd:totalUsd};
}
export function poSummary(result?: PoCheckResult, resolutions: PoResolution[] = []) {
  const items = result?.items ?? [];
  const resolved = (i: PoCheckItem) => resolutions.some((r)=>r.itemId===i.id && r.fingerprint===i.fingerprint && r.action==="accepted" && r.justification.trim().length>0);
  return { confirmed:items.filter((i)=>i.status==="confirmed").length, discrepancies:items.filter((i)=>i.status==="requires_review" && !resolved(i)).length, missing:items.filter((i)=>i.missing).length, blockers:items.filter((i)=>i.status==="blocker").length, resolved, canRelease: Boolean(result && !result.validationErrors.length && items.length && items.every((i)=>i.status!=="blocker" && (i.status!=="requires_review" || resolved(i)))) };
}
export function purchaseOrderStatus(state: PoState, approved = true): PoStatus {
  if (!approved || !state.po) return "Awaiting PO";
  if (!state.result) return "PO awaiting check";
  const s = poSummary(state.result,state.resolutions);
  return s.blockers || state.result.validationErrors.length ? "PO blocked" : s.discrepancies ? "PO with discrepancies" : state.released && s.canRelease ? "PO checked and released" : "PO awaiting check";
}
export function resolvePoItem(result: PoCheckResult, resolutions: PoResolution[], itemId: string, action: PoResolution["action"], justification: string, timestamp: string): PoResolution[] {
  const item=result.items.find((i)=>i.id===itemId);
  if (!item || !["blocker","requires_review"].includes(item.status)) throw new Error("Select an open discrepancy.");
  if (action==="accepted" && item.status==="blocker") throw new Error("Blockers require correction and cannot be accepted.");
  if (action==="accepted" && !justification.trim()) throw new Error("A written justification is required.");
  return [...resolutions.filter((r)=>r.itemId!==itemId),{itemId,fingerprint:item.fingerprint,action,justification:justification.trim(),timestamp,actor:DEMO_BUYER}];
}
export function releasePurchase(state: PoState, approved: boolean): PoState {
  if (!approved || !state.po || !poSummary(state.result,state.resolutions).canRelease) throw new Error("Resolve every blocker and review discrepancy before release.");
  return {...state,released:true};
}
export function loadAndCheckPo(po: PurchaseOrder,c: ApprovedPoContext,tolerances:PoTolerances):PoState { return {po:structuredClone(po),result:checkPurchaseOrder(po,c,tolerances),tolerances:{...tolerances},resolutions:[],released:false}; }