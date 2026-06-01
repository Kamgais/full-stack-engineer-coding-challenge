import { describe, expect, it } from 'vitest';
import {
  schemaFieldToFormState,
  formStateToSchemaField,
  validateSchemaFieldFormState,
  applyTypeChange,
  SchemaFieldFormState,
} from './SchemaEditor.helpers';
import { PricingSchemaField } from '../services/trades.service';

// ─── Test-Daten ───────────────────────────────────────────────────────────────

const numberField: PricingSchemaField = {
  name: 'heatingPowerKw',
  type: 'number',
  required: true,
  min: 1,
  max: 100,
};

const enumField: PricingSchemaField = {
  name: 'frameMaterial',
  type: 'enum',
  required: true,
  allowedValues: ['wood', 'pvc', 'aluminum'],
};

const fieldWithDependsOn: PricingSchemaField = {
  name: 'woodTreatment',
  type: 'string',
  required: false,
  dependsOn: { field: 'frameMaterial', equals: 'wood' },
};

const emptyFormState: SchemaFieldFormState = {
  name: '',
  type: 'string',
  required: false,
  min: '',
  max: '',
  allowedValues: '',
  dependsOnField: '',
  dependsOnValue: '',
};

// ─── schemaFieldToFormState ───────────────────────────────────────────────────

describe('schemaFieldToFormState', () => {
  it('mappt number-Feld korrekt', () => {
    const state = schemaFieldToFormState(numberField);
    expect(state.name).toBe('heatingPowerKw');
    expect(state.type).toBe('number');
    expect(state.required).toBe(true);
    expect(state.min).toBe('1');
    expect(state.max).toBe('100');
    expect(state.allowedValues).toBe('');
  });

  it('mappt enum-Feld korrekt', () => {
    const state = schemaFieldToFormState(enumField);
    expect(state.type).toBe('enum');
    expect(state.allowedValues).toBe('wood, pvc, aluminum');
    expect(state.min).toBe('');
    expect(state.max).toBe('');
  });

  it('mappt dependsOn korrekt', () => {
    const state = schemaFieldToFormState(fieldWithDependsOn);
    expect(state.dependsOnField).toBe('frameMaterial');
    expect(state.dependsOnValue).toBe('wood');
  });

  it('gibt leere Strings zurück wenn min/max nicht gesetzt', () => {
    const field: PricingSchemaField = {
      name: 'test',
      type: 'number',
      required: false,
    };
    const state = schemaFieldToFormState(field);
    expect(state.min).toBe('');
    expect(state.max).toBe('');
  });

  it('gibt leere Strings zurück wenn kein dependsOn', () => {
    const state = schemaFieldToFormState(numberField);
    expect(state.dependsOnField).toBe('');
    expect(state.dependsOnValue).toBe('');
  });
});

// ─── formStateToSchemaField ───────────────────────────────────────────────────

describe('formStateToSchemaField', () => {
  it('mappt number FormState zurück zu SchemaField', () => {
    const state = schemaFieldToFormState(numberField);
    const field = formStateToSchemaField(state);
    expect(field.name).toBe('heatingPowerKw');
    expect(field.type).toBe('number');
    expect(field.min).toBe(1);
    expect(field.max).toBe(100);
    expect(field.allowedValues).toBeUndefined();
  });

  it('mappt enum FormState zurück zu SchemaField', () => {
    const state = schemaFieldToFormState(enumField);
    const field = formStateToSchemaField(state);
    expect(field.allowedValues).toEqual(['wood', 'pvc', 'aluminum']);
    expect(field.min).toBeUndefined();
    expect(field.max).toBeUndefined();
  });

  it('mappt dependsOn zurück korrekt', () => {
    const state = schemaFieldToFormState(fieldWithDependsOn);
    const field = formStateToSchemaField(state);
    expect(field.dependsOn?.field).toBe('frameMaterial');
    expect(field.dependsOn?.equals).toBe('wood');
  });

  it('ignoriert dependsOn wenn dependsOnField leer', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'string',
    };
    const field = formStateToSchemaField(state);
    expect(field.dependsOn).toBeUndefined();
  });

  it('Round-Trip: schemaField → formState → schemaField ist identisch', () => {
    const original = enumField;
    const roundTripped = formStateToSchemaField(
      schemaFieldToFormState(original),
    );
    expect(roundTripped).toEqual(original);
  });
});

// ─── validateSchemaFieldFormState ────────────────────────────────────────────

describe('validateSchemaFieldFormState', () => {
  it('gibt keine Fehler für gültiges Feld zurück', () => {
    const state = schemaFieldToFormState(numberField);
    const errors = validateSchemaFieldFormState(state, [], true);
    expect(errors).toHaveLength(0);
  });

  it('gibt Fehler wenn Name leer', () => {
    const errors = validateSchemaFieldFormState(emptyFormState, [], true);
    const nameError = errors.find((e) => e.field === 'name');
    expect(nameError).toBeDefined();
    expect(nameError?.message).toContain('Pflicht');
  });

  it('gibt Fehler bei doppeltem Namen', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'heatingPowerKw',
    };
    const errors = validateSchemaFieldFormState(
      state,
      ['heatingPowerKw'],
      true,
    );
    const nameError = errors.find((e) => e.field === 'name');
    expect(nameError).toBeDefined();
    expect(nameError?.message).toContain('existiert bereits');
  });

  it('kein Fehler bei doppeltem Namen wenn editiert (isNew = false)', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'heatingPowerKw',
    };
    const errors = validateSchemaFieldFormState(
      state,
      ['heatingPowerKw'],
      false,
    );
    const nameError = errors.find((e) => e.field === 'name');
    expect(nameError).toBeUndefined();
  });

  it('gibt Fehler wenn min > max bei number', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'number',
      min: '100',
      max: '10',
    };
    const errors = validateSchemaFieldFormState(state, [], true);
    const maxError = errors.find((e) => e.field === 'max');
    expect(maxError).toBeDefined();
    expect(maxError?.message).toContain('größer');
  });

  it('kein Fehler wenn nur min gesetzt', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'number',
      min: '1',
      max: '',
    };
    const errors = validateSchemaFieldFormState(state, [], true);
    expect(errors.find((e) => e.field === 'max')).toBeUndefined();
  });

  it('gibt Fehler bei leerer Enum-Liste', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'enum',
      allowedValues: '',
    };
    const errors = validateSchemaFieldFormState(state, [], true);
    const enumError = errors.find((e) => e.field === 'allowedValues');
    expect(enumError).toBeDefined();
    expect(enumError?.message).toContain('Mindestens');
  });

  it('gibt Fehler bei dependsOn auf unbekanntes Feld', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'woodTreatment',
      type: 'string',
      dependsOnField: 'nichtExistierendesFeld',
      dependsOnValue: 'wood',
    };
    const errors = validateSchemaFieldFormState(
      state,
      ['frameMaterial'],
      true,
    );
    const depError = errors.find((e) => e.field === 'dependsOnField');
    expect(depError).toBeDefined();
    expect(depError?.message).toContain('nichtExistierendesFeld');
  });

  it('kein Fehler bei dependsOn auf bekanntes Feld', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'woodTreatment',
      type: 'string',
      dependsOnField: 'frameMaterial',
      dependsOnValue: 'wood',
    };
    const errors = validateSchemaFieldFormState(
      state,
      ['frameMaterial'],
      true,
    );
    expect(errors.find((e) => e.field === 'dependsOnField')).toBeUndefined();
  });
});

// ─── applyTypeChange ─────────────────────────────────────────────────────────

describe('applyTypeChange', () => {
  it('number → enum löscht min/max und behält allowedValues', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'number',
      min: '1',
      max: '100',
      allowedValues: '',
    };
    const result = applyTypeChange(state, 'enum');
    expect(result.type).toBe('enum');
    expect(result.min).toBe('');
    expect(result.max).toBe('');
  });

  it('enum → number löscht allowedValues', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'enum',
      allowedValues: 'wood, pvc',
    };
    const result = applyTypeChange(state, 'number');
    expect(result.type).toBe('number');
    expect(result.allowedValues).toBe('');
  });

  it('string → number löscht allowedValues', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'string',
      allowedValues: 'sollte-weg',
    };
    const result = applyTypeChange(state, 'number');
    expect(result.allowedValues).toBe('');
  });

  it('boolean → enum löscht min/max', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'test',
      type: 'boolean',
      min: '1',
      max: '10',
    };
    const result = applyTypeChange(state, 'enum');
    expect(result.min).toBe('');
    expect(result.max).toBe('');
  });

  it('behält name, required, dependsOn beim Typ-Wechsel', () => {
    const state: SchemaFieldFormState = {
      ...emptyFormState,
      name: 'myField',
      type: 'number',
      required: true,
      dependsOnField: 'otherField',
      dependsOnValue: 'someValue',
      min: '1',
    };
    const result = applyTypeChange(state, 'enum');
    expect(result.name).toBe('myField');
    expect(result.required).toBe(true);
    expect(result.dependsOnField).toBe('otherField');
    expect(result.dependsOnValue).toBe('someValue');
  });
});