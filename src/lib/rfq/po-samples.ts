import type { ApprovedPoContext, PurchaseOrder } from "./po-types";
import { DEMO_BUYER } from "./audit";
export const PO_SCENARIOS = ["Correct PO", "Within tolerance", "Non-critical discrepancy", "Blocked PO", "Wrong supplier"] as const;
export type PoScenario = typeof PO_SCENARIOS[number];
export function createPoFromApprovedDecision(c:ApprovedPoContext):PurchaseOrder {
  return {...structuredClone(c.expected),poNumber:`DEMO-PO-${c.reference.rfqNumber}`,billingAddress:"Demo Aerospace Procurement, Fictional Billing Office",buyer:DEMO_BUYER,synthetic:true};
}
export function demoPurchaseOrder(c:ApprovedPoContext,scenario:PoScenario):PurchaseOrder {
  const po=createPoFromApprovedDecision(c);
  if(scenario==="Within tolerance") {
    // USD 0.40 rounding; quoted native charges unchanged, no logistics split invented.
    po.totalValue=(po.totalValue??0)+0.4/(c.breakdown.inputs.fxRate??1);
    if(po.currency!=="USD") po.usdBrl=c.reference.usdBrl*1.01;
  }
  if(scenario==="Non-critical discrepancy") {po.paymentTermsDays=po.paymentTermsDays===45?30:45;po.billingAddress="";}
  if(scenario==="Blocked PO") {po.revision=po.revision==="B"?"C":"B";po.unitPrice=(po.unitPrice??0)*1.03;}
  if(scenario==="Wrong supplier") po.supplier="Northstar Demo Parts LLC (FICTITIOUS)";
  return po;
}