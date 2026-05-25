import { validateTradeAttributes } from './schema-validator';
import { PricingSchema } from '../trades/entities/trade-config.entity';

// ─── Hilfsfunktionen ────────────────────────────────────────────────────────

const hvacSchema: PricingSchema = {
  fields: [
    {
      name: 'heatingPowerKw',
      type: 'number',
      required: true,
      min: 1,
      max: 100,
    },
  ],
};

const windowsSchema: PricingSchema = {
  fields: [
    {
      name: 'uValue',
      type: 'number',
      required: true,
      min: 0.5,
      max: 3.0,
    },
    {
      name: 'frameMaterial',
      type: 'enum',
      required: true,
      allowedValues: ['wood', 'pvc', 'aluminum'],
    },
    {
      name: 'woodTreatment',
      type: 'string',
      required: false,
      dependsOn: {
        field: 'frameMaterial',
        equals: 'wood',
      },
    },
  ],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('validateTradeAttributes', () => {

  // ── Kein Schema ────────────────────────────────────────────────────────────

  describe('kein Schema', () => {
    it('gibt leeres Array zurück wenn Schema null ist', () => {
      const result = validateTradeAttributes({ anyField: 'value' }, null);
      expect(result).toEqual([]);
    });

    it('gibt leeres Array zurück wenn Schema keine Felder hat', () => {
      const result = validateTradeAttributes({ anyField: 'value' }, { fields: [] });
      expect(result).toEqual([]);
    });
  });

  // ── Happy Path ─────────────────────────────────────────────────────────────

  describe('Happy Path', () => {
    it('validiert HVAC Attribute korrekt', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 5 },
        hvacSchema,
      );
      expect(result).toEqual([]);
    });

    it('validiert WINDOWS Attribute korrekt', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'pvc' },
        windowsSchema,
      );
      expect(result).toEqual([]);
    });

    it('validiert WINDOWS mit woodTreatment wenn frameMaterial = wood', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'wood', woodTreatment: 'lacquer' },
        windowsSchema,
      );
      expect(result).toEqual([]);
    });
  });

  // ── Pflichtfelder ──────────────────────────────────────────────────────────

  describe('Pflichtfelder', () => {
    it('gibt Fehler zurück wenn Pflichtfeld fehlt', () => {
      const result = validateTradeAttributes({}, hvacSchema);
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('heatingPowerKw');
      expect(result[0].message).toContain('Pflichtfeld');
    });

    it('gibt Fehler zurück wenn Pflichtfeld null ist', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: null },
        hvacSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('heatingPowerKw');
    });

    it('gibt Fehler zurück wenn Pflichtfeld leerer String ist', () => {
      const schema: PricingSchema = {
        fields: [{ name: 'label', type: 'string', required: true }],
      };
      const result = validateTradeAttributes({ label: '' }, schema);
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('label');
    });
  });

  // ── Typ-Validierung ────────────────────────────────────────────────────────

  describe('Typ-Validierung', () => {
    it('gibt Fehler zurück wenn number-Feld ein String ist', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 'fünf' },
        hvacSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('heatingPowerKw');
      expect(result[0].message).toContain('Zahl');
    });

    it('gibt Fehler zurück wenn boolean-Feld ein String ist', () => {
      const schema: PricingSchema = {
        fields: [{ name: 'isDouble', type: 'boolean', required: true }],
      };
      const result = validateTradeAttributes({ isDouble: 'true' }, schema);
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('true oder false');
    });

    it('gibt Fehler zurück wenn string-Feld eine Zahl ist', () => {
      const schema: PricingSchema = {
        fields: [{ name: 'color', type: 'string', required: true }],
      };
      const result = validateTradeAttributes({ color: 123 }, schema);
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('Text');
    });
  });

  // ── Numerische Grenzen ─────────────────────────────────────────────────────

  describe('numerische min/max Grenzen', () => {
    it('gibt Fehler zurück wenn Wert unter min liegt', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 0.5 },
        hvacSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('mindestens 1');
    });

    it('gibt Fehler zurück wenn Wert über max liegt', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 150 },
        hvacSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].message).toContain('maximal 100');
    });

    it('akzeptiert Wert genau auf min', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 1 },
        hvacSchema,
      );
      expect(result).toEqual([]);
    });

    it('akzeptiert Wert genau auf max', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 100 },
        hvacSchema,
      );
      expect(result).toEqual([]);
    });
  });

  // ── Enum-Validierung ───────────────────────────────────────────────────────

  describe('enum Validierung', () => {
    it('akzeptiert erlaubten Enum-Wert', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'wood' },
        windowsSchema,
      );
      expect(result).toEqual([]);
    });

    it('gibt Fehler zurück bei unerlaubtem Enum-Wert', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'steel' },
        windowsSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('frameMaterial');
      expect(result[0].message).toContain('wood, pvc, aluminum');
    });
  });

  // ── dependsOn ──────────────────────────────────────────────────────────────

  describe('dependsOn Regel', () => {
    it('woodTreatment ist Pflicht wenn frameMaterial = wood — fehlt → Fehler', () => {
      const schemaWithRequired: PricingSchema = {
        fields: [
          ...windowsSchema.fields.slice(0, 2),
          {
            name: 'woodTreatment',
            type: 'string',
            required: true,
            dependsOn: { field: 'frameMaterial', equals: 'wood' },
          },
        ],
      };
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'wood' },
        schemaWithRequired,
      );
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('woodTreatment');
    });

    it('woodTreatment wird ignoriert wenn frameMaterial = pvc', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'pvc' },
        windowsSchema,
      );
      expect(result).toEqual([]);
    });

    it('woodTreatment wird ignoriert auch wenn es übergeben wird und frameMaterial != wood', () => {
      const result = validateTradeAttributes(
        { uValue: 1.1, frameMaterial: 'pvc', woodTreatment: 'lacquer' },
        windowsSchema,
      );
      expect(result).toEqual([]);
    });
  });

  // ── Unbekannte Felder ──────────────────────────────────────────────────────

  describe('unbekannte Felder', () => {
    it('gibt Fehler zurück für Felder die nicht im Schema sind', () => {
      const result = validateTradeAttributes(
        { heatingPowerKw: 5, unknownField: 'test' },
        hvacSchema,
      );
      expect(result).toHaveLength(1);
      expect(result[0].field).toBe('unknownField');
      expect(result[0].message).toContain('Unbekanntes Feld');
    });
  });

  // ── Mehrere Fehler gleichzeitig ────────────────────────────────────────────

  describe('mehrere Fehler gleichzeitig', () => {
    it('gibt alle Fehler auf einmal zurück', () => {
      const result = validateTradeAttributes(
        { uValue: 10, frameMaterial: 'steel' },
        windowsSchema,
      );
      // uValue > max, frameMaterial ungültiger Enum-Wert
      expect(result).toHaveLength(2);
      const fields = result.map((e) => e.field);
      expect(fields).toContain('uValue');
      expect(fields).toContain('frameMaterial');
    });
  });
});