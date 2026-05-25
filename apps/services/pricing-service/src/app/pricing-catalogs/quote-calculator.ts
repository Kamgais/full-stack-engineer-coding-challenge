/**
 * Quote Calculator — Pure Function
 *
 * Berechnet ein Angebot aus Positionen, Zuschlägen und Rabatten.
 *
 * Geld: Integer in Cent. Beispiel: 150,00 € = 15000
 * Rundung: Math.round() nach jedem Prozent-Schritt.
 */

// ─── Typen ────────────────────────────────────────────────────────────────────

export interface QuoteLineInput {
  positionKey: string;
  quantity: number;
  appliedSurchargeKeys?: string[];
}

export interface QuotePosition {
  key: string;
  label: string;
  unit: string;
  netPriceMinorUnits: number;
  vatRate: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  surcharges: {
    key: string;
    label: string;
    type: 'flat' | 'percent';
    value: number;
  }[];
}

export interface QuoteDiscount {
  key: string;
  label: string;
  type: 'flat' | 'percent';
  value: number;
  cap: number | null;
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

export interface QuoteLineResult {
  positionKey: string;
  label: string;
  quantity: number;
  unit: string;
  /** Netto vor Zuschlägen in Cent */
  baseNetMinorUnits: number;
  /** Zuschläge in Cent */
  surchargesTotalMinorUnits: number;
  /** Netto nach Zuschlägen in Cent */
  lineNetMinorUnits: number;
  /** Rabatte in Cent */
  discountsTotalMinorUnits: number;
  /** Netto nach allem in Cent */
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

export class QuoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteValidationError';
  }
}

// ─── Schritt 1: Validierung ───────────────────────────────────────────────────

/**
 * Prüft ob alle Inputs gültig sind.
 * Wirft QuoteValidationError wenn etwas nicht stimmt.
 */
function validateLines(
  lines: QuoteLineInput[],
  positionMap: Map<string, QuotePosition>,
): void {
  for (const line of lines) {
    const position = positionMap.get(line.positionKey);

    // Existiert die Position?
    if (!position) {
      throw new QuoteValidationError(
        `Unbekannte Position: "${line.positionKey}"`,
      );
    }

    // Ist die Menge gültig?
    if (line.quantity <= 0) {
      throw new QuoteValidationError(
        `Menge für "${line.positionKey}" muss größer als 0 sein`,
      );
    }
    if (position.minQuantity !== null && line.quantity < position.minQuantity) {
      throw new QuoteValidationError(
        `Menge für "${line.positionKey}" muss mindestens ${position.minQuantity} sein`,
      );
    }
    if (position.maxQuantity !== null && line.quantity > position.maxQuantity) {
      throw new QuoteValidationError(
        `Menge für "${line.positionKey}" darf maximal ${position.maxQuantity} sein`,
      );
    }

    // Existieren alle Zuschläge?
    const surchargeKeys = new Set(position.surcharges.map((s) => s.key));
    for (const key of line.appliedSurchargeKeys ?? []) {
      if (!surchargeKeys.has(key)) {
        throw new QuoteValidationError(
          `Unbekannter Zuschlag "${key}" für Position "${line.positionKey}"`,
        );
      }
    }
  }
}

// ─── Schritt 2: Netto pro Zeile berechnen ─────────────────────────────────────

/**
 * Berechnet das Netto für jede Zeile inkl. Zuschläge.
 *
 * Beispiel:
 *   2x Heizkörper à 15000 Cent = 30000 Cent
 *   + Notfall-Zuschlag 5000 Cent flat
 *   = 35000 Cent
 */
function computeLineNets(
  lines: QuoteLineInput[],
  positionMap: Map<string, QuotePosition>,
): QuoteLineResult[] {
  return lines.map((line) => {
    const position = positionMap.get(line.positionKey)!;

    // Basis-Netto: Menge × Preis
    const baseNet = Math.round(line.quantity * position.netPriceMinorUnits);

    // Zuschläge berechnen
    const surchargesTotal = computeSurcharges(
      baseNet,
      position.surcharges,
      line.appliedSurchargeKeys ?? [],
    );

    const lineNet = baseNet + surchargesTotal;

    return {
      positionKey: line.positionKey,
      label: position.label,
      quantity: line.quantity,
      unit: position.unit,
      baseNetMinorUnits: baseNet,
      surchargesTotalMinorUnits: surchargesTotal,
      lineNetMinorUnits: lineNet,
      discountsTotalMinorUnits: 0,
      finalNetMinorUnits: lineNet,
      vatRate: position.vatRate,
      vatMinorUnits: 0,
      grossMinorUnits: 0,
    };
  });
}

/**
 * Berechnet die Summe aller aktiven Zuschläge.
 *
 * Flat:    direkt addieren       → +5000 Cent
 * Percent: auf Basis-Netto       → 30000 × 0.1 = 3000 Cent
 */
function computeSurcharges(
  baseNet: number,
  available: QuotePosition['surcharges'],
  activeKeys: string[],
): number {
  if (activeKeys.length === 0) return 0;

  const surchargeMap = new Map(available.map((s) => [s.key, s]));
  let total = 0;

  for (const key of activeKeys) {
    const surcharge = surchargeMap.get(key)!;
    if (surcharge.type === 'flat') {
      total += surcharge.value;
    } else {
      // percent: z.B. value = 0.1 = 10%
      total += Math.round(baseNet * surcharge.value);
    }
  }

  return total;
}

// ─── Schritt 3: Rabatte anwenden ─────────────────────────────────────────────

/**
 * Wendet alle Katalog-Rabatte auf die Zeilen an.
 * Rabatte werden in Deklarationsreihenfolge angewendet.
 *
 * Beispiel:
 *   Subtotal: 38000 Cent
 *   Rabatt: 10%, Cap 3000 Cent
 *   → 10% von 38000 = 3800 → aber Cap = 3000 → Rabatt = 3000 Cent
 *   → neuer Subtotal: 35000 Cent
 */
function applyDiscounts(
  lines: QuoteLineResult[],
  discounts: QuoteDiscount[],
): void {
  for (const discount of discounts) {

    // Welche Zeilen sind betroffen?
    const affectedLines = getAffectedLines(lines, discount);
    if (affectedLines.length === 0) continue;

    // Subtotal der betroffenen Zeilen
    const subtotal = affectedLines.reduce(
      (sum, l) => sum + l.finalNetMinorUnits,
      0,
    );

    // Rabatt-Betrag berechnen
    const discountAmount = computeDiscountAmount(discount, subtotal);
    if (discountAmount === 0) continue;

    // Rabatt proportional auf Zeilen verteilen
    distributeDiscount(affectedLines, discountAmount, discount.key, discount.label);
  }
}

/**
 * Gibt die Zeilen zurück auf die der Rabatt angewendet wird.
 */
function getAffectedLines(
  lines: QuoteLineResult[],
  discount: QuoteDiscount,
): QuoteLineResult[] {
  if (discount.appliesTo === 'subtotal') {
    return lines;
  }
  const keys = discount.appliesTo.positionKeys;
  return lines.filter((l) => keys.includes(l.positionKey));
}

/**
 * Berechnet den Rabatt-Betrag.
 *
 * Flat:    fixer Betrag, max Subtotal
 * Percent: Prozent vom Subtotal, mit optionalem Cap
 */
function computeDiscountAmount(
  discount: QuoteDiscount,
  subtotal: number,
): number {
  if (discount.type === 'flat') {
    // Flat-Rabatt: nicht mehr als Subtotal
    return Math.min(discount.value, subtotal);
  }

  // Prozent-Rabatt
  let amount = Math.round(subtotal * discount.value);

  // Cap anwenden falls vorhanden
  if (discount.cap !== null) {
    amount = Math.min(amount, discount.cap);
  }

  return amount;
}

/**
 * Verteilt einen Rabatt-Betrag proportional auf mehrere Zeilen.
 * Die letzte Zeile bekommt den Rest — verhindert Rundungsfehler.
 *
 * Beispiel:
 *   Rabatt: 3000 Cent auf 2 Zeilen (30000 und 8000 Cent)
 *   Zeile 1: 3000 × (30000/38000) = 2368 Cent
 *   Zeile 2: 3000 - 2368          =  632 Cent (Rest)
 */
function distributeDiscount(
  lines: QuoteLineResult[],
  totalDiscount: number,
  discountKey: string,
  discountLabel: string,
): void {
  const subtotal = lines.reduce((s, l) => s + l.finalNetMinorUnits, 0);
  if (subtotal === 0) return;

  let distributed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;

    const lineDiscount = isLast
      ? totalDiscount - distributed
      : Math.round((line.finalNetMinorUnits / subtotal) * totalDiscount);

    distributed += lineDiscount;
    line.discountsTotalMinorUnits += lineDiscount;
    line.finalNetMinorUnits -= lineDiscount;
  }
}

// ─── Schritt 4: MwSt und Summen berechnen ────────────────────────────────────

/**
 * Berechnet MwSt pro Zeile und gruppiert nach MwSt-Satz.
 *
 * Beispiel:
 *   Zeile 1: 30000 Cent × 0.19 = 5700 Cent MwSt
 *   Zeile 2:  8000 Cent × 0.07 =  560 Cent MwSt
 *
 *   Gruppe 19%: netto 30000, MwSt 5700, brutto 35700
 *   Gruppe  7%: netto  8000, MwSt  560, brutto  8560
 */
function computeVatAndTotals(lines: QuoteLineResult[]): Pick<QuoteResult, 'vatGroups' | 'totals'> {
  // MwSt pro Zeile berechnen
  for (const line of lines) {
    line.vatMinorUnits = Math.round(line.finalNetMinorUnits * line.vatRate);
    line.grossMinorUnits = line.finalNetMinorUnits + line.vatMinorUnits;
  }

  // Nach MwSt-Satz gruppieren
  const groupMap = new Map<number, QuoteResult['vatGroups'][0]>();
  for (const line of lines) {
    const existing = groupMap.get(line.vatRate);
    if (existing) {
      existing.netMinorUnits += line.finalNetMinorUnits;
      existing.vatMinorUnits += line.vatMinorUnits;
      existing.grossMinorUnits += line.grossMinorUnits;
    } else {
      groupMap.set(line.vatRate, {
        vatRate: line.vatRate,
        netMinorUnits: line.finalNetMinorUnits,
        vatMinorUnits: line.vatMinorUnits,
        grossMinorUnits: line.grossMinorUnits,
      });
    }
  }

  // Gesamt-Summen
  const totals = {
    netMinorUnits: lines.reduce((s, l) => s + l.finalNetMinorUnits, 0),
    discountsTotalMinorUnits: lines.reduce((s, l) => s + l.discountsTotalMinorUnits, 0),
    vatMinorUnits: lines.reduce((s, l) => s + l.vatMinorUnits, 0),
    grossMinorUnits: lines.reduce((s, l) => s + l.grossMinorUnits, 0),
  };

  return {
    vatGroups: Array.from(groupMap.values()).sort((a, b) => a.vatRate - b.vatRate),
    totals,
  };
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

/**
 * Berechnet ein vollständiges Angebot.
 *
 * @throws QuoteValidationError bei ungültigen Inputs
 */
export function calculateQuote(
  lines: QuoteLineInput[],
  positions: QuotePosition[],
  discounts: QuoteDiscount[],
): QuoteResult {

  // Leere Zeilen → leeres Ergebnis
  if (lines.length === 0) {
    return {
      lines: [],
      vatGroups: [],
      totals: { netMinorUnits: 0, discountsTotalMinorUnits: 0, vatMinorUnits: 0, grossMinorUnits: 0 },
    };
  }

  const positionMap = new Map(positions.map((p) => [p.key, p]));

  // Schritt 1: Validieren
  validateLines(lines, positionMap);

  // Schritt 2: Netto pro Zeile berechnen
  const lineResults = computeLineNets(lines, positionMap);

  // Schritt 3: Rabatte anwenden
  applyDiscounts(lineResults, discounts);

  // Schritt 4: MwSt und Summen
  const { vatGroups, totals } = computeVatAndTotals(lineResults);

  return { lines: lineResults, vatGroups, totals };
}