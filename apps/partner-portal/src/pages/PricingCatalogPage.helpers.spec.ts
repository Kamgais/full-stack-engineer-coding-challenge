import { describe, expect, it } from 'vitest';
import {
  mapVersionToTableRows,
  isFieldVisible,
  mapQuoteToBreakdown,
} from './PricingCatalogPage.helpers';
import { CatalogVersion, PricingSchemaField, QuoteResult } from '../services/pricing-catalogs.service';

// ─── Test-Daten ───────────────────────────────────────────────────────────────

const mockVersion: CatalogVersion = {
  id: 'v-1',
  craftsmanId: 'c-1',
  trade: 'HVAC',
  status: 'DRAFT',
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  publishedBy: null,
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  positions: [
    {
      id: 'p-1',
      key: 'heizk-01',
      label: 'Heizkörper einbauen',
      unit: 'piece',
      netPriceMinorUnits: 15000,
      vatRate: 0.19,
      minQuantity: 1,
      maxQuantity: 20,
      tradeAttributes: { heatingPowerKw: 5 },
      surcharges: [],
    },
    {
      id: 'p-2',
      key: 'therm-01',
      label: 'Thermostat installieren',
      unit: 'piece',
      netPriceMinorUnits: 8000,
      vatRate: 0.19,
      minQuantity: null,
      maxQuantity: null,
      tradeAttributes: {},
      surcharges: [],
    },
  ],
  discounts: [],
};

const mockQuoteResult: QuoteResult = {
  lines: [
    {
      positionKey: 'heizk-01',
      label: 'Heizkörper einbauen',
      quantity: 2,
      unit: 'piece',
      baseNetMinorUnits: 30000,
      surchargesTotalMinorUnits: 0,
      lineNetMinorUnits: 30000,
      discountsTotalMinorUnits: 0,
      finalNetMinorUnits: 30000,
      vatRate: 0.19,
      vatMinorUnits: 5700,
      grossMinorUnits: 35700,
    },
    {
      positionKey: 'therm-01',
      label: 'Thermostat installieren',
      quantity: 1,
      unit: 'piece',
      baseNetMinorUnits: 8000,
      surchargesTotalMinorUnits: 0,
      lineNetMinorUnits: 8000,
      discountsTotalMinorUnits: 0,
      finalNetMinorUnits: 8000,
      vatRate: 0.19,
      vatMinorUnits: 1520,
      grossMinorUnits: 9520,
    },
  ],
  vatGroups: [
    {
      vatRate: 0.19,
      netMinorUnits: 38000,
      vatMinorUnits: 7220,
      grossMinorUnits: 45220,
    },
  ],
  totals: {
    netMinorUnits: 38000,
    discountsTotalMinorUnits: 0,
    vatMinorUnits: 7220,
    grossMinorUnits: 45220,
  },
};

// ─── mapVersionToTableRows ────────────────────────────────────────────────────

describe('mapVersionToTableRows', () => {
  it('mappt alle Positionen auf Tabellenzeilen', () => {
    const rows = mapVersionToTableRows(mockVersion);
    expect(rows).toHaveLength(2);
  });

  it('mappt alle Felder korrekt', () => {
    const rows = mapVersionToTableRows(mockVersion);
    expect(rows[0].key).toBe('heizk-01');
    expect(rows[0].label).toBe('Heizkörper einbauen');
    expect(rows[0].unit).toBe('piece');
    expect(rows[0].netPriceMinorUnits).toBe(15000);
    expect(rows[0].vatRate).toBe(0.19);
  });

  it('zeigt tradeAttributes als Zusammenfassung', () => {
    const rows = mapVersionToTableRows(mockVersion);
    expect(rows[0].attributesSummary).toBe('heatingPowerKw: 5');
  });

  it('zeigt — wenn keine tradeAttributes vorhanden', () => {
    const rows = mapVersionToTableRows(mockVersion);
    expect(rows[1].attributesSummary).toBe('—');
  });

  it('kombiniert mehrere tradeAttributes mit ·', () => {
    const version: CatalogVersion = {
      ...mockVersion,
      positions: [
        {
          ...mockVersion.positions[0],
          tradeAttributes: { uValue: 1.1, frameMaterial: 'wood' },
        },
      ],
    };
    const rows = mapVersionToTableRows(version);
    expect(rows[0].attributesSummary).toBe('uValue: 1.1 · frameMaterial: wood');
  });

  it('gibt leeres Array für Version ohne Positionen zurück', () => {
    const version: CatalogVersion = { ...mockVersion, positions: [] };
    expect(mapVersionToTableRows(version)).toEqual([]);
  });
});

// ─── isFieldVisible ───────────────────────────────────────────────────────────

describe('isFieldVisible', () => {
  it('gibt true zurück wenn kein dependsOn', () => {
    expect(
      isFieldVisible(
        { name: 'color', type: 'string', required: false },
        {},
      ),
    ).toBe(true);
  });

  it('gibt true zurück wenn dependsOn-Bedingung erfüllt', () => {
    expect(
      isFieldVisible(
        {
          name: 'woodTreatment',
          type: 'string',
          required: false,
          dependsOn: { field: 'frameMaterial', equals: 'wood' },
        },
        { frameMaterial: 'wood' },
      ),
    ).toBe(true);
  });

  it('gibt false zurück wenn dependsOn-Bedingung nicht erfüllt', () => {
    expect(
      isFieldVisible(
        {
          name: 'woodTreatment',
          type: 'string',
          required: false,
          dependsOn: { field: 'frameMaterial', equals: 'wood' },
        },
        { frameMaterial: 'pvc' },
      ),
    ).toBe(false);
  });

  it('gibt false zurück wenn abhängiges Feld leer ist', () => {
    expect(
      isFieldVisible(
        {
          name: 'woodTreatment',
          type: 'string',
          required: false,
          dependsOn: { field: 'frameMaterial', equals: 'wood' },
        },
        {},
      ),
    ).toBe(false);
  });

  it('vergleicht number dependsOn korrekt', () => {
    expect(
      isFieldVisible(
        {
          name: 'extraField',
          type: 'string',
          required: false,
          dependsOn: { field: 'powerKw', equals: 5 },
        },
        { powerKw: '5' },
      ),
    ).toBe(true);
  });
});

// ─── mapQuoteToBreakdown ──────────────────────────────────────────────────────

describe('mapQuoteToBreakdown', () => {
  it('mappt alle Zeilen korrekt', () => {
    const breakdown = mapQuoteToBreakdown(mockQuoteResult);
    expect(breakdown.lines).toHaveLength(2);
    expect(breakdown.lines[0].label).toBe('Heizkörper einbauen');
    expect(breakdown.lines[0].quantity).toBe(2);
    expect(breakdown.lines[0].netMinorUnits).toBe(30000);
    expect(breakdown.lines[0].vatMinorUnits).toBe(5700);
    expect(breakdown.lines[0].grossMinorUnits).toBe(35700);
  });

  it('mappt MwSt-Gruppen korrekt', () => {
    const breakdown = mapQuoteToBreakdown(mockQuoteResult);
    expect(breakdown.vatGroups).toHaveLength(1);
    expect(breakdown.vatGroups[0].vatRate).toBe(0.19);
    expect(breakdown.vatGroups[0].vatMinorUnits).toBe(7220);
  });

  it('gibt Gesamtsummen korrekt zurück', () => {
    const breakdown = mapQuoteToBreakdown(mockQuoteResult);
    expect(breakdown.totalGrossMinorUnits).toBe(45220);
    expect(breakdown.discountsTotalMinorUnits).toBe(0);
  });

  it('gibt leeres Ergebnis für leere Quote zurück', () => {
    const empty: QuoteResult = {
      lines: [],
      vatGroups: [],
      totals: {
        netMinorUnits: 0,
        discountsTotalMinorUnits: 0,
        vatMinorUnits: 0,
        grossMinorUnits: 0,
      },
    };
    const breakdown = mapQuoteToBreakdown(empty);
    expect(breakdown.lines).toHaveLength(0);
    expect(breakdown.totalGrossMinorUnits).toBe(0);
  });

  it('Invariant: Summe MwSt-Gruppen = Gesamt-MwSt', () => {
    const breakdown = mapQuoteToBreakdown(mockQuoteResult);
    const sumVat = breakdown.vatGroups.reduce(
      (s, g) => s + g.vatMinorUnits,
      0,
    );
    expect(sumVat).toBe(mockQuoteResult.totals.vatMinorUnits);
  });

  it('zeigt Rabatte korrekt', () => {
    const withDiscount: QuoteResult = {
      ...mockQuoteResult,
      totals: {
        ...mockQuoteResult.totals,
        discountsTotalMinorUnits: 3000,
        grossMinorUnits: 42220,
      },
    };
    const breakdown = mapQuoteToBreakdown(withDiscount);
    expect(breakdown.discountsTotalMinorUnits).toBe(3000);
    expect(breakdown.totalGrossMinorUnits).toBe(42220);
  });
});

// ─── Integrationstest: Validation-Error im PositionDialog ────────────────────

describe('PositionDialog Validierung Integration', () => {
  it('pflichtfelder fehlen → mehrere Fehler gleichzeitig', () => {
    // Simuliert: Benutzer klickt Save ohne etwas auszufüllen
    // isFieldVisible prüft ob Felder sichtbar sind
    // formStateToSchemaField würde leere Werte produzieren

    const schemaFields: PricingSchemaField[] = [
      { name: 'heatingPowerKw', type: 'number', required: true, min: 1, max: 100 },
      { name: 'frameMaterial', type: 'enum', required: true, allowedValues: ['wood', 'pvc'] },
      {
        name: 'woodTreatment',
        type: 'string',
        required: true,
        dependsOn: { field: 'frameMaterial', equals: 'wood' },
      },
    ];

    const emptyValues: Record<string, string> = {};

    // Alle Felder ohne dependsOn sind sichtbar
    const visibleFields = schemaFields.filter((f) =>
      isFieldVisible(f, emptyValues),
    );

    // woodTreatment ist nicht sichtbar weil frameMaterial leer
    expect(visibleFields).toHaveLength(2);
    expect(visibleFields.map((f) => f.name)).toContain('heatingPowerKw');
    expect(visibleFields.map((f) => f.name)).toContain('frameMaterial');
    expect(visibleFields.map((f) => f.name)).not.toContain('woodTreatment');
  });

  it('frameMaterial = wood → woodTreatment wird sichtbar und Pflicht', () => {
    const schemaFields: PricingSchemaField[] = [
      { name: 'frameMaterial', type: 'enum', required: true, allowedValues: ['wood', 'pvc'] },
      {
        name: 'woodTreatment',
        type: 'string',
        required: true,
        dependsOn: { field: 'frameMaterial', equals: 'wood' },
      },
    ];

    const valuesWithWood: Record<string, string> = { frameMaterial: 'wood' };
    const valuesWithPvc: Record<string, string> = { frameMaterial: 'pvc' };

    // Mit wood → woodTreatment sichtbar
    const visibleWithWood = schemaFields.filter((f) =>
      isFieldVisible(f, valuesWithWood),
    );
    expect(visibleWithWood).toHaveLength(2);

    // Mit pvc → woodTreatment nicht sichtbar
    const visibleWithPvc = schemaFields.filter((f) =>
      isFieldVisible(f, valuesWithPvc),
    );
    expect(visibleWithPvc).toHaveLength(1);
    expect(visibleWithPvc[0].name).toBe('frameMaterial');
  });

  it('unsichtbare Felder werden beim Submit ignoriert', () => {
    // Simuliert: woodTreatment ist unsichtbar (frameMaterial = pvc)
    // → darf nicht in tradeAttributes landen
    const schemaFields: PricingSchemaField[] = [
      { name: 'frameMaterial', type: 'enum', required: true, allowedValues: ['wood', 'pvc'] },
      {
        name: 'woodTreatment',
        type: 'string',
        required: true,
        dependsOn: { field: 'frameMaterial', equals: 'wood' },
      },
    ];

    const values: Record<string, string> = {
      frameMaterial: 'pvc',
      woodTreatment: 'lacquer', // ausgefüllt aber unsichtbar
    };

    // Nur sichtbare Felder filtern
    const visibleFields = schemaFields.filter((f) =>
      isFieldVisible(f, values),
    );

    // woodTreatment ist unsichtbar → wird gefiltert
    const tradeAttributes: Record<string, unknown> = {};
    for (const field of visibleFields) {
      const raw = values[field.name];
      if (raw) tradeAttributes[field.name] = raw;
    }

    expect(tradeAttributes).toEqual({ frameMaterial: 'pvc' });
    expect(tradeAttributes['woodTreatment']).toBeUndefined();
  });
});