import { PricingSchemaField } from '../services/trades.service';

// ─── Helper 1: Schema → FormState Mapping ────────────────────────────────────

export interface SchemaFieldFormState {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  min: string;
  max: string;
  allowedValues: string;
  dependsOnField: string;
  dependsOnValue: string;
}

export function schemaFieldToFormState(
  field: PricingSchemaField,
): SchemaFieldFormState {
  return {
    name: field.name,
    type: field.type,
    required: field.required,
    min: field.min !== undefined ? String(field.min) : '',
    max: field.max !== undefined ? String(field.max) : '',
    allowedValues: field.allowedValues?.join(', ') ?? '',
    dependsOnField: field.dependsOn?.field ?? '',
    dependsOnValue: field.dependsOn
      ? String(field.dependsOn.equals)
      : '',
  };
}

export function formStateToSchemaField(
  state: SchemaFieldFormState,
): PricingSchemaField {
  const field: PricingSchemaField = {
    name: state.name.trim(),
    type: state.type,
    required: state.required,
  };

  if (state.type === 'number') {
    if (state.min !== '') field.min = Number(state.min);
    if (state.max !== '') field.max = Number(state.max);
  }

  if (state.type === 'enum') {
    field.allowedValues = state.allowedValues
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (state.dependsOnField.trim()) {
    field.dependsOn = {
      field: state.dependsOnField.trim(),
      equals: state.dependsOnValue.trim(),
    };
  }

  return field;
}

// ─── Helper 2: Validierung ───────────────────────────────────────────────────

export interface SchemaFieldValidationError {
  field: keyof SchemaFieldFormState;
  message: string;
}

export function validateSchemaFieldFormState(
  state: SchemaFieldFormState,
  existingFieldNames: string[],
  isNew: boolean,
): SchemaFieldValidationError[] {
  const errors: SchemaFieldValidationError[] = [];

  // Name Pflicht
  if (!state.name.trim()) {
    errors.push({ field: 'name', message: 'Name ist Pflicht' });
  }

  // Doppelter Name
  if (isNew && existingFieldNames.includes(state.name.trim())) {
    errors.push({ field: 'name', message: 'Dieser Name existiert bereits' });
  }

  // min > max bei number
  if (state.type === 'number') {
    const min = state.min !== '' ? Number(state.min) : null;
    const max = state.max !== '' ? Number(state.max) : null;
    if (min !== null && max !== null && min > max) {
      errors.push({ field: 'max', message: 'Max muss größer als Min sein' });
    }
  }

  // Leere Enum-Liste
  if (state.type === 'enum') {
    const values = state.allowedValues
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      errors.push({
        field: 'allowedValues',
        message: 'Mindestens ein Wert ist Pflicht',
      });
    }
  }

  // dependsOn auf unbekanntes Feld
  if (
    state.dependsOnField.trim() &&
    !existingFieldNames.includes(state.dependsOnField.trim())
  ) {
    errors.push({
      field: 'dependsOnField',
      message: `Feld "${state.dependsOnField}" existiert nicht im Schema`,
    });
  }

  return errors;
}

// ─── Helper 3: Typ-Wechsel ───────────────────────────────────────────────────

/**
 * Wenn der Typ gewechselt wird, irrelevante Felder zurücksetzen.
 * number → enum: min/max löschen
 * enum → number: allowedValues löschen
 * andere → number/enum: entsprechend löschen
 */
export function applyTypeChange(
  state: SchemaFieldFormState,
  newType: PricingSchemaField['type'],
): SchemaFieldFormState {
  return {
    ...state,
    type: newType,
    // min/max nur bei number relevant
    min: newType === 'number' ? state.min : '',
    max: newType === 'number' ? state.max : '',
    // allowedValues nur bei enum relevant
    allowedValues: newType === 'enum' ? state.allowedValues : '',
  };
}