import {
  CatalogVersion,
  PricingSchemaField,
  QuoteResult,
} from '../services/pricing-catalogs.service';

// ─── Helper 1: Backend-Response → Tabellenzeilen ─────────────────────────────

export interface PositionTableRow {
  key: string;
  label: string;
  unit: string;
  netPriceMinorUnits: number;
  vatRate: number;
  attributesSummary: string;
}

export function mapVersionToTableRows(
  version: CatalogVersion,
): PositionTableRow[] {
  return version.positions.map((pos) => ({
    key: pos.key,
    label: pos.label,
    unit: pos.unit,
    netPriceMinorUnits: pos.netPriceMinorUnits,
    vatRate: pos.vatRate,
    attributesSummary:
      Object.entries(pos.tradeAttributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ') || '—',
  }));
}

// ─── Helper 2: dependsOn Sichtbarkeit ────────────────────────────────────────

export function isFieldVisible(
  field: PricingSchemaField,
  currentValues: Record<string, string>,
): boolean {
  if (!field.dependsOn) return true;
  const depValue = currentValues[field.dependsOn.field];
  return depValue === String(field.dependsOn.equals);
}

// ─── Helper 3: Quote-Response → Breakdown ────────────────────────────────────

export interface BreakdownLine {
  label: string;
  quantity: number;
  netMinorUnits: number;
  vatMinorUnits: number;
  grossMinorUnits: number;
}

export interface QuoteBreakdown {
  lines: BreakdownLine[];
  vatGroups: { vatRate: number; vatMinorUnits: number }[];
  discountsTotalMinorUnits: number;
  totalGrossMinorUnits: number;
}

export function mapQuoteToBreakdown(result: QuoteResult): QuoteBreakdown {
  return {
    lines: result.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      netMinorUnits: line.finalNetMinorUnits,
      vatMinorUnits: line.vatMinorUnits,
      grossMinorUnits: line.grossMinorUnits,
    })),
    vatGroups: result.vatGroups.map((g) => ({
      vatRate: g.vatRate,
      vatMinorUnits: g.vatMinorUnits,
    })),
    discountsTotalMinorUnits: result.totals.discountsTotalMinorUnits,
    totalGrossMinorUnits: result.totals.grossMinorUnits,
  };
}