import type { ExtractedQuote, Currency } from "./types";

export type ReviewField = keyof ExtractedQuote;
export const CRITICAL_FIELDS: ReviewField[] = ["supplier_name", "part_number", "revision", "currency", "unit_price", "quantity_basis", "validity_end_date", "certifications"];
export interface FieldReviewState { confirmed: boolean; followUp?: boolean; editedAt?: string }
export type FieldReviewStatus = Partial<Record<ReviewField, FieldReviewState>>;
export interface ReviewIssue {
  id: string; documentId: string; supplier: string; fileName: string;
  field: { key: ReviewField; label: string }; originalValue: unknown; reviewedValue: unknown;
  confidence: number | null; kind: "critical" | "missing" | "low_confidence" | "divergence" | "unconfirmed";
  reason: string; expectedAction: string; followUp: boolean;
}
export type EligibilityStatus = "eligible" | "eligible_with_caveats" | "not_eligible" | "awaiting_review";
export interface CostComponent { label: string; amount: number | null; currency: Currency; estimated: boolean }
export interface LandedCostBreakdown { components: CostComponent[]; annualTotal: number | null; unitTotal: number | null }
export interface PoCheck { documentId: string; field: ReviewField; expectedValue: unknown; actualValue: unknown }
export interface PoCheckResult { checks: PoCheck[]; status: "pending" | "review" | "blocked" | "passed" }
export interface AuditEvent {
  id: string; timestamp: string; actor: string; action: string; documentId?: string; field?: ReviewField;
  previousValue?: unknown; newValue?: unknown; justification?: string; details?: Record<string, unknown>;
}