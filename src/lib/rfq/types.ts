export type Currency = "USD" | "EUR" | "BRL";

export interface ExtractedQuote {
  supplier_name: string | null;
  quote_id: string | null;
  quote_date: string | null;
  validity_end_date: string | null;
  part_number: string | null;
  revision: string | null;
  unit_price: number | null;
  currency: Currency | null;
  quantity_basis: number | null;
  price_breaks: { min_qty: number; unit_price: number }[];
  incoterm: string | null;
  incoterm_place: string | null;
  lead_time_days: number | null;
  payment_terms_days: number | null;
  one_time_costs: { type: string; amount: number; currency: Currency | null }[];
  certifications: string[];
  fai_included: boolean | null;
  eccn: string | null;
  warranty_months: number | null;
  new_supplier_requires_qualification: boolean | null;
  surcharge_clause: string | null;
  notes: string | null;
  moq?: number | null;
  freight?: number | null; // Annual quoted freight, in quote currency
  insurance?: number | null; // Annual quoted insurance, in quote currency
  duties?: number | null;
  other_adders?: number | null;
  country_of_origin?: string | null;
  delivery_location?: string | null;
  commercial_exceptions?: string | null;
  confidence?: Record<string, number | null>;
}

export interface RfqReference {
  rfqNumber: string;
  partNumber: string;
  revision: string;
  annualVolume: number;
  requiredCertification: string;
  usdBrl: number;
  eurBrl: number;
  incotermAdders: Record<string, number>; // percent, keyed by group
  today: string; // ISO yyyy-mm-dd
  description?: string;
  category?: string;
  requiredDeliveryDate?: string;
  deliveryLocation?: string;
  currency?: Currency;
  incumbentSupplier?: string;
  targetCost?: number | null; // Annual target in RFQ currency
}

export type Severity = "HIGH" | "MEDIUM" | "INFO";
export type RiskLevel = "Low" | "Medium" | "High";

export interface Alert {
  code: string;
  severity: Severity;
  message: string;
}

export interface QuoteAnalysis {
  index: number;
  quote: ExtractedQuote;
  applicableUnitPrice: number | null;
  unitPriceUsd: number | null;
  annualGoodsUsd: number | null;
  oneTimeUsd: number;
  freightPct: number | null;
  freightUsd: number | null;
  annualTotalUsd: number | null;
  alerts: Alert[];
  risk: RiskLevel;
  awardable: boolean;
  rank: number;
}
