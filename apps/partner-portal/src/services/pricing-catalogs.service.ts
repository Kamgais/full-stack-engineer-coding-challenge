import { apiClient } from './api.service';

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface PricingSchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  min?: number;
  max?: number;
  allowedValues?: string[];
  dependsOn?: {
    field: string;
    equals: string | number | boolean;
  };
}

export interface PricingSchema {
  fields: PricingSchemaField[];
}

export interface Surcharge {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
}

export interface CatalogPosition {
  id: string;
  key: string;
  label: string;
  unit: string;
  netPriceMinorUnits: number;
  vatRate: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  tradeAttributes: Record<string, unknown>;
  surcharges: Surcharge[];
}

export interface CatalogDiscount {
  id: string;
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
  cap: number | null;
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

export interface CatalogVersion {
  id: string;
  craftsmanId: string;
  trade: string;
  status: 'DRAFT' | 'PUBLISHED';
  effectiveFrom: string;
  publishedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  positions: CatalogPosition[];
  discounts: CatalogDiscount[];
}

export interface UpsertPositionRequest {
  key: string;
  label: string;
  unit: string;
  netPriceMinorUnits: number;
  vatRate: number;
  minQuantity?: number;
  maxQuantity?: number;
  tradeAttributes?: Record<string, unknown>;
  surcharges?: Surcharge[];
}

export interface QuoteLine {
  positionKey: string;
  quantity: number;
  appliedSurchargeKeys?: string[];
}

export interface QuoteLineResult {
  positionKey: string;
  label: string;
  quantity: number;
  unit: string;
  baseNetMinorUnits: number;
  surchargesTotalMinorUnits: number;
  lineNetMinorUnits: number;
  discountsTotalMinorUnits: number;
  finalNetMinorUnits: number;
  vatRate: number;
  vatMinorUnits: number;
  grossMinorUnits: number;
}

export interface QuoteResult {
  lines: QuoteLineResult[];
  vatGroups: {
    vatRate: number;
    netMinorUnits: number;
    vatMinorUnits: number;
    grossMinorUnits: number;
  }[];
  totals: {
    netMinorUnits: number;
    discountsTotalMinorUnits: number;
    vatMinorUnits: number;
    grossMinorUnits: number;
  };
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export function listCatalogVersions(trade?: string): Promise<CatalogVersion[]> {
  const params = trade ? `?trade=${trade}` : '';
  return apiClient
    .get<CatalogVersion[]>(`/pricing-catalogs${params}`)
    .then((r) => r.data);
}

export function getCatalogVersion(id: string): Promise<CatalogVersion> {
  return apiClient
    .get<CatalogVersion>(`/pricing-catalogs/${id}`)
    .then((r) => r.data);
}

export function createCatalogVersion(
  trade: string,
  effectiveFrom: string,
): Promise<CatalogVersion> {
  return apiClient
    .post<CatalogVersion>('/pricing-catalogs', { trade, effectiveFrom })
    .then((r) => r.data);
}

export function updateCatalogVersion(
  id: string,
  positions: UpsertPositionRequest[],
): Promise<CatalogVersion> {
  return apiClient
    .patch<CatalogVersion>(`/pricing-catalogs/${id}`, { positions })
    .then((r) => r.data);
}

export function publishCatalogVersion(id: string): Promise<CatalogVersion> {
  return apiClient
    .post<CatalogVersion>(`/pricing-catalogs/${id}/publish`)
    .then((r) => r.data);
}

export function calculateQuote(
  versionId: string,
  lines: QuoteLine[],
): Promise<QuoteResult> {
  return apiClient
    .post<QuoteResult>(`/pricing-catalogs/${versionId}/quote`, { lines })
    .then((r) => r.data);
}

export function getTrade(trade: string): Promise<{ pricingSchema: PricingSchema | null }> {
  return apiClient
    .get<{ pricingSchema: PricingSchema | null }>(`/trades/${trade}`)
    .then((r) => r.data);
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/** Formatiert Cent als Euro-String. Beispiel: 15000 → "150,00 €" */
export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}