import type { Currency, RfqReference, ExtractedQuote } from "./types";
import type { ApprovedDecision } from "./recommendation";
import type { LandedCostBreakdown } from "./review-types";
export interface PurchaseOrder {
  poNumber: string;
  supplier: string;
  quoteNumber: string;
  rfqReference: string;
  approvalReference: string;
  partNumber: string;
  revision: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  currency: Currency | null;
  totalValue: number | null;
  incoterm: string;
  incotermPlace: string;
  freight: number | null;
  insurance: number | null;
  logisticsEstimate: number | null;
  nre: number | null;
  tooling: number | null;
  inspectionFai: number | null;
  otherCosts: number | null;
  taxesAndFees: number | null;
  leadTimeDays: number | null;
  deliveryDate: string;
  paymentTermsDays: number | null;
  deliveryAddress: string;
  billingAddress: string;
  quoteValidityDate: string;
  certifications: string[];
  mandatoryClauses: string[];
  issueDate: string;
  buyer: string;
  usdBrl?: number;
  eurBrl?: number;
  synthetic?: boolean;
}
export interface PoTolerances {
  roundingUsd: number;
  unitPricePercent: number;
  quantityUnits: number;
  fxUpdatePercent: number;
  logisticsPercent: number;
  leadTimeDays: number;
}
export interface ApprovedPoContext {
  reference: RfqReference;
  quote: ExtractedQuote;
  decision: ApprovedDecision;
  breakdown: LandedCostBreakdown;
  expected: PurchaseOrder;
  approvalReference: string;
}
export type PoItemStatus = "confirmed" | "requires_review" | "blocker" | "not_applicable";
export interface PoCheckItem {
  id: string;
  fieldLabel: string;
  approvedValue: unknown;
  poValue: unknown;
  absoluteDifference: number | null;
  percentDifference: number | null;
  financialImpactUsd: number | null;
  referenceSource: "RFQ" | "Reviewed quotation" | "Approved decision" | "Landed-cost calculation";
  status: PoItemStatus;
  severity: "Blocker" | "Review" | "Informational";
  recommendedAction: string;
  note: string;
  missing: boolean;
  fingerprint: string;
}
export type PoStatus =
  | "Awaiting PO"
  | "PO awaiting check"
  | "PO with discrepancies"
  | "PO blocked"
  | "PO checked, awaiting release"
  | "PO checked and released";
export interface PoCheckResult {
  items: PoCheckItem[];
  tolerances: PoTolerances;
  validationErrors: string[];
  financialTotalUsd: number | null;
}
export interface PoResolution {
  itemId: string;
  fingerprint: string;
  action: "accepted" | "correction_requested";
  justification: string;
  timestamp: string;
  actor: string;
}
export interface PoState {
  supplierConfirmations?: import("./po-confirmation").SupplierConfirmation[] | undefined;
  po?: PurchaseOrder | undefined;
  result?: PoCheckResult | undefined;
  tolerances: PoTolerances;
  resolutions: PoResolution[];
  released: boolean;
  lifecycle?: import("./po-lifecycle").PoLifecycle | undefined;
}
