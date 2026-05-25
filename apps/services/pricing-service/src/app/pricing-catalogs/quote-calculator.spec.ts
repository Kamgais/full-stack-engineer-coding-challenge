import {
  calculateQuote,
  QuoteDiscount,
  QuoteLineInput,
  QuotePosition,
  QuoteValidationError,
} from './quote-calculator';

// ─── Test-Daten ───────────────────────────────────────────────────────────────

const heizkoerper: QuotePosition = {
  key: 'heizk-01',
  label: 'Heizkörper einbauen',
  unit: 'piece',
  netPriceMinorUnits: 15000, // 150,00 €
  vatRate: 0.19,
  minQuantity: 1,
  maxQuantity: 20,
  surcharges: [
    { key: 'notfall', label: 'Notfall-Aufschlag', type: 'flat', value: 5000 },
    { key: 'express', label: 'Express 10%', type: 'percent', value: 0.1 },
  ],
};

const thermostat: QuotePosition = {
  key: 'therm-01',
  label: 'Thermostat installieren',
  unit: 'piece',
  netPriceMinorUnits: 8000, // 80,00 €
  vatRate: 0.19,
  minQuantity: null,
  maxQuantity: null,
  surcharges: [],
};

// Position mit anderem MwSt-Satz (7%)
const wartung: QuotePosition = {
  key: 'wart-01',
  label: 'Wartung',
  unit: 'hour',
  netPriceMinorUnits: 6000, // 60,00 €
  vatRate: 0.07,
  minQuantity: null,
  maxQuantity: null,
  surcharges: [],
};

const positions = [heizkoerper, thermostat, wartung];

// ─── Happy Path ───────────────────────────────────────────────────────────────

describe('calculateQuote', () => {
  describe('Happy Path', () => {
    it('berechnet einfaches Angebot ohne Zuschläge und Rabatte', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 2 },
      ];

      const result = calculateQuote(lines, positions, []);

      // 2 × 15000 = 30000 Cent netto
      expect(result.lines[0].baseNetMinorUnits).toBe(30000);
      expect(result.lines[0].finalNetMinorUnits).toBe(30000);
      // MwSt: 30000 × 0.19 = 5700
      expect(result.lines[0].vatMinorUnits).toBe(5700);
      // Brutto: 30000 + 5700 = 35700
      expect(result.lines[0].grossMinorUnits).toBe(35700);
    });

    it('berechnet Angebot mit mehreren Positionen', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 2 },
        { positionKey: 'therm-01', quantity: 1 },
      ];

      const result = calculateQuote(lines, positions, []);

      // Gesamt netto: 30000 + 8000 = 38000
      expect(result.totals.netMinorUnits).toBe(38000);
      // MwSt: 38000 × 0.19 = 7220
      expect(result.totals.vatMinorUnits).toBe(7220);
      // Brutto: 38000 + 7220 = 45220
      expect(result.totals.grossMinorUnits).toBe(45220);
    });

    it('gibt leeres Ergebnis für leere Zeilen-Liste', () => {
      const result = calculateQuote([], positions, []);

      expect(result.lines).toHaveLength(0);
      expect(result.vatGroups).toHaveLength(0);
      expect(result.totals.netMinorUnits).toBe(0);
      expect(result.totals.grossMinorUnits).toBe(0);
    });
  });

  // ─── Zuschläge ────────────────────────────────────────────────────────────

  describe('Zuschläge', () => {
    it('wendet flat Zuschlag korrekt an', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 1, appliedSurchargeKeys: ['notfall'] },
      ];

      const result = calculateQuote(lines, positions, []);

      // Basis: 15000, Notfall: +5000
      expect(result.lines[0].baseNetMinorUnits).toBe(15000);
      expect(result.lines[0].surchargesTotalMinorUnits).toBe(5000);
      expect(result.lines[0].lineNetMinorUnits).toBe(20000);
    });

    it('wendet percent Zuschlag korrekt an', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 1, appliedSurchargeKeys: ['express'] },
      ];

      const result = calculateQuote(lines, positions, []);

      // Basis: 15000, Express 10%: 15000 × 0.1 = 1500
      expect(result.lines[0].surchargesTotalMinorUnits).toBe(1500);
      expect(result.lines[0].lineNetMinorUnits).toBe(16500);
    });

    it('wendet flat und percent Zuschlag zusammen an', () => {
      const lines: QuoteLineInput[] = [
        {
          positionKey: 'heizk-01',
          quantity: 1,
          appliedSurchargeKeys: ['notfall', 'express'],
        },
      ];

      const result = calculateQuote(lines, positions, []);

      // Basis: 15000
      // Notfall flat: +5000
      // Express 10% auf Basis: 15000 × 0.1 = 1500
      // Total Zuschläge: 6500
      expect(result.lines[0].surchargesTotalMinorUnits).toBe(6500);
      expect(result.lines[0].lineNetMinorUnits).toBe(21500);
    });

    it('ein 0% Zuschlag ist ein No-Op', () => {
      const positionWithZeroSurcharge: QuotePosition = {
        ...heizkoerper,
        surcharges: [
          { key: 'zero', label: 'Kein Aufschlag', type: 'percent', value: 0 },
        ],
      };

      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1, appliedSurchargeKeys: ['zero'] }],
        [positionWithZeroSurcharge],
        [],
      );

      expect(result.lines[0].surchargesTotalMinorUnits).toBe(0);
      expect(result.lines[0].lineNetMinorUnits).toBe(15000);
    });
  });

  // ─── Rabatte ──────────────────────────────────────────────────────────────

  describe('Rabatte', () => {
    it('wendet flat Rabatt auf Subtotal an', () => {
      const discount: QuoteDiscount = {
        key: 'flat-20',
        label: '20€ Rabatt',
        type: 'flat',
        value: 2000, // 20,00 €
        cap: null,
        appliesTo: 'subtotal',
      };

      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1 }],
        positions,
        [discount],
      );

      // 15000 - 2000 = 13000
      expect(result.lines[0].discountsTotalMinorUnits).toBe(2000);
      expect(result.lines[0].finalNetMinorUnits).toBe(13000);
      expect(result.totals.discountsTotalMinorUnits).toBe(2000);
    });

    it('wendet percent Rabatt ohne Cap an', () => {
      const discount: QuoteDiscount = {
        key: 'pct-10',
        label: '10% Rabatt',
        type: 'percent',
        value: 0.1,
        cap: null,
        appliesTo: 'subtotal',
      };

      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1 }],
        positions,
        [discount],
      );

      // 15000 × 10% = 1500 Rabatt
      expect(result.lines[0].discountsTotalMinorUnits).toBe(1500);
      expect(result.lines[0].finalNetMinorUnits).toBe(13500);
    });

    it('wendet percent Rabatt mit Cap an', () => {
      const discount: QuoteDiscount = {
        key: 'pct-cap',
        label: '10% max 10€',
        type: 'percent',
        value: 0.1,
        cap: 1000, // max 10,00 €
        appliesTo: 'subtotal',
      };

      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 2 }], // 30000 Cent
        positions,
        [discount],
      );

      // 30000 × 10% = 3000, aber Cap = 1000
      expect(result.lines[0].discountsTotalMinorUnits).toBe(1000);
      expect(result.lines[0].finalNetMinorUnits).toBe(29000);
    });

    it('wendet Rabatt nur auf bestimmte Positionen an', () => {
      const discount: QuoteDiscount = {
        key: 'pos-discount',
        label: 'Rabatt nur auf Heizkörper',
        type: 'flat',
        value: 1000,
        cap: null,
        appliesTo: { positionKeys: ['heizk-01'] },
      };

      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 1 },
        { positionKey: 'therm-01', quantity: 1 },
      ];

      const result = calculateQuote(lines, positions, [discount]);

      // Heizkörper: 15000 - 1000 = 14000
      expect(result.lines[0].discountsTotalMinorUnits).toBe(1000);
      expect(result.lines[0].finalNetMinorUnits).toBe(14000);

      // Thermostat: unverändert
      expect(result.lines[1].discountsTotalMinorUnits).toBe(0);
      expect(result.lines[1].finalNetMinorUnits).toBe(8000);
    });

    it('wendet mehrere gestapelte Rabatte in Reihenfolge an', () => {
      const discounts: QuoteDiscount[] = [
        {
          key: 'first',
          label: 'Erster Rabatt 10%',
          type: 'percent',
          value: 0.1,
          cap: null,
          appliesTo: 'subtotal',
        },
        {
          key: 'second',
          label: 'Zweiter Rabatt 5%',
          type: 'percent',
          value: 0.05,
          cap: null,
          appliesTo: 'subtotal',
        },
      ];

      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1 }], // 15000
        positions,
        discounts,
      );

      // Erster Rabatt:  15000 × 10% = 1500 → 13500
      // Zweiter Rabatt: 13500 × 5%  =  675 → 12825
      expect(result.lines[0].finalNetMinorUnits).toBe(12825);
      expect(result.totals.discountsTotalMinorUnits).toBe(2175);
    });
  });

  // ─── MwSt-Gruppen ─────────────────────────────────────────────────────────

  describe('MwSt-Gruppen', () => {
    it('gruppiert nach MwSt-Satz', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 1 }, // 19%
        { positionKey: 'wart-01',  quantity: 1 }, // 7%
      ];

      const result = calculateQuote(lines, positions, []);

      expect(result.vatGroups).toHaveLength(2);

      const group19 = result.vatGroups.find((g) => g.vatRate === 0.19)!;
      const group7  = result.vatGroups.find((g) => g.vatRate === 0.07)!;

      expect(group19.netMinorUnits).toBe(15000);
      expect(group19.vatMinorUnits).toBe(2850);

      expect(group7.netMinorUnits).toBe(6000);
      expect(group7.vatMinorUnits).toBe(420);
    });

    it('summiert MwSt-Gruppen korrekt zum Gesamt', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 1 }, // 19%
        { positionKey: 'wart-01',  quantity: 1 }, // 7%
      ];

      const result = calculateQuote(lines, positions, []);

      const sumVatGroups = result.vatGroups.reduce(
        (s, g) => s + g.vatMinorUnits,
        0,
      );

      // Summe der Gruppen muss gleich Gesamt-MwSt sein
      expect(sumVatGroups).toBe(result.totals.vatMinorUnits);
    });
  });

  // ─── Fehler-Cases ─────────────────────────────────────────────────────────

  describe('Fehler-Cases', () => {
    it('wirft Fehler bei unbekannter Position', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'existiert-nicht', quantity: 1 },
      ];

      expect(() => calculateQuote(lines, positions, [])).toThrow(
        QuoteValidationError,
      );
      expect(() => calculateQuote(lines, positions, [])).toThrow(
        'existiert-nicht',
      );
    });

    it('wirft Fehler bei Menge unter minQuantity', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 0.5 }, // min ist 1
      ];

      expect(() => calculateQuote(lines, positions, [])).toThrow(
        QuoteValidationError,
      );
      expect(() => calculateQuote(lines, positions, [])).toThrow('mindestens 1');
    });

    it('wirft Fehler bei Menge über maxQuantity', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 99 }, // max ist 20
      ];

      expect(() => calculateQuote(lines, positions, [])).toThrow(
        QuoteValidationError,
      );
      expect(() => calculateQuote(lines, positions, [])).toThrow('maximal 20');
    });

    it('wirft Fehler bei Menge 0', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 0 },
      ];

      expect(() => calculateQuote(lines, positions, [])).toThrow(
        QuoteValidationError,
      );
    });

    it('wirft Fehler bei unbekanntem Zuschlag', () => {
      const lines: QuoteLineInput[] = [
        {
          positionKey: 'heizk-01',
          quantity: 1,
          appliedSurchargeKeys: ['existiert-nicht'],
        },
      ];

      expect(() => calculateQuote(lines, positions, [])).toThrow(
        QuoteValidationError,
      );
      expect(() => calculateQuote(lines, positions, [])).toThrow(
        'existiert-nicht',
      );
    });
  });

  // ─── Invariant-Tests ──────────────────────────────────────────────────────

  describe('Invarianten', () => {
    it('Brutto ist immer >= Netto bei nicht-negativen Inputs', () => {
      const result = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 3 }],
        positions,
        [],
      );

      for (const line of result.lines) {
        expect(line.grossMinorUnits).toBeGreaterThanOrEqual(
          line.finalNetMinorUnits,
        );
      }
      expect(result.totals.grossMinorUnits).toBeGreaterThanOrEqual(
        result.totals.netMinorUnits,
      );
    });

    it('Summe der MwSt-Gruppen = Gesamt-MwSt', () => {
      const lines: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 2 },
        { positionKey: 'wart-01',  quantity: 3 },
      ];

      const result = calculateQuote(lines, positions, []);

      const sumFromGroups = result.vatGroups.reduce(
        (s, g) => s + g.vatMinorUnits,
        0,
      );

      expect(sumFromGroups).toBe(result.totals.vatMinorUnits);
    });

    it('Mengen verdoppeln verdoppelt das Netto exakt', () => {
      const lines1: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 2 },
      ];
      const lines2: QuoteLineInput[] = [
        { positionKey: 'heizk-01', quantity: 4 },
      ];

      const result1 = calculateQuote(lines1, positions, []);
      const result2 = calculateQuote(lines2, positions, []);

      expect(result2.totals.netMinorUnits).toBe(
        result1.totals.netMinorUnits * 2,
      );
    });

    it('ein 0 flat Rabatt ist ein No-Op', () => {
      const discount: QuoteDiscount = {
        key: 'zero',
        label: 'Kein Rabatt',
        type: 'flat',
        value: 0,
        cap: null,
        appliesTo: 'subtotal',
      };

      const withDiscount = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1 }],
        positions,
        [discount],
      );
      const withoutDiscount = calculateQuote(
        [{ positionKey: 'heizk-01', quantity: 1 }],
        positions,
        [],
      );

      expect(withDiscount.totals.netMinorUnits).toBe(
        withoutDiscount.totals.netMinorUnits,
      );
    });
  });
});