import { PricingSchema, PricingSchemaField } from '../trades/entities/trade-config.entity';

/**
 * Ein Validierungsfehler vom Schema-Validator.
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validiert ein tradeAttributes-Objekt gegen ein pricingSchema.
 *
 * Pure Function — kein State, keine Seiteneffekte, kein DB-Zugriff.
 * Wird bei jedem Draft-Write aufgerufen.
 *
 * @param attributes  - die eingegebenen Werte (z.B. { uValue: 1.1, frameMaterial: 'wood' })
 * @param schema      - das Schema des Trades (aus trade_configs.pricing_schema)
 * @returns           - leeres Array wenn alles ok, sonst Liste der Fehler
 */
export function validateTradeAttributes(
  attributes: Record<string, unknown>,
  schema: PricingSchema | null,
): ValidationError[] {
  // Kein Schema → nichts zu validieren
  if (!schema || schema.fields.length === 0) {
    return [];
  }

  const errors: ValidationError[] = [];

  // Unbekannte Felder prüfen
  const knownFieldNames = new Set(schema.fields.map((f) => f.name));
  for (const key of Object.keys(attributes)) {
    if (!knownFieldNames.has(key)) {
      errors.push({
        field: key,
        message: `Unbekanntes Feld: "${key}" ist nicht im Schema definiert`,
      });
    }
  }

  // Jedes Schema-Feld prüfen
  for (const field of schema.fields) {
    const value = attributes[field.name];
    const isDependencySatisfied = checkDependsOn(field, attributes);

    // Wenn dependsOn nicht erfüllt ist → Feld überspringen
    if (!isDependencySatisfied) {
      continue;
    }

    // Pflichtfeld prüfen
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: field.name,
        message: `"${field.name}" ist ein Pflichtfeld`,
      });
      continue;
    }

    // Wenn kein Wert und nicht Pflicht → ok
    if (value === undefined || value === null) {
      continue;
    }

    // Typ-Validierung
    const typeErrors = validateType(field, value);
    errors.push(...typeErrors);
  }

  return errors;
}

/**
 * Prüft ob die dependsOn-Bedingung eines Feldes erfüllt ist.
 * Wenn kein dependsOn → immer true (Feld ist aktiv).
 */
function checkDependsOn(
  field: PricingSchemaField,
  attributes: Record<string, unknown>,
): boolean {
  if (!field.dependsOn) {
    return true;
  }

  const { field: depField, equals: depValue } = field.dependsOn;
  return attributes[depField] === depValue;
}

/**
 * Validiert den Typ und die Constraints eines Feldes.
 */
function validateType(
  field: PricingSchemaField,
  value: unknown,
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss ein Text sein`,
        });
      }
      break;
    }

    case 'number': {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss eine Zahl sein`,
        });
        break;
      }
      if (field.min !== undefined && value < field.min) {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss mindestens ${field.min} sein`,
        });
      }
      if (field.max !== undefined && value > field.max) {
        errors.push({
          field: field.name,
          message: `"${field.name}" darf maximal ${field.max} sein`,
        });
      }
      break;
    }

    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss true oder false sein`,
        });
      }
      break;
    }

    case 'enum': {
      if (!field.allowedValues || field.allowedValues.length === 0) {
        errors.push({
          field: field.name,
          message: `"${field.name}": keine erlaubten Werte im Schema definiert`,
        });
        break;
      }
      if (!field.allowedValues.includes(String(value))) {
        errors.push({
          field: field.name,
          message: `"${field.name}" muss einer der folgenden Werte sein: ${field.allowedValues.join(', ')}`,
        });
      }
      break;
    }

    default: {
      errors.push({
        field: field.name,
        message: `"${field.name}": unbekannter Typ "${(field as PricingSchemaField).type}"`,
      });
    }
  }

  return errors;
}