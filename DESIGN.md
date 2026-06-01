# DESIGN.md — Pricing Catalog Service

> Coding Challenge · Full-Stack Engineer · Deutsche Sanierungsberatung

---

## 1. Datenmodell

### Ausgangsproblem

Die Plattform verwaltet Handwerksbetriebe aus völlig unterschiedlichen Gewerken — HVAC, Solar, Fenster, Wärmepumpen. Jedes Gewerk hat fundamental andere Positionsattribute. Ein Heizungsbauer braucht `heatingPowerKw`, ein Fensterbauer `uValue`, `frameMaterial` und optional `woodTreatment`. Diese Variabilität strukturell sauber abzubilden war die zentrale Designherausforderung.

### Datenbankschema

```
┌───────────────────────────────────────────────────────────────────────┐
│                          trade_configs                                │
│                                                                       │
│  id              UUID          PK                                    │
│  trade           VARCHAR(32)   UNIQUE  z.B. "HVAC", "WINDOWS"       │
│  display_name    VARCHAR(100)                                         │
│  is_active       BOOLEAN       DEFAULT true                          │
│  pricing_schema  JSONB         NULL    ← Admin-konfiguriert          │
│  metadata        JSONB         DEFAULT {}                            │
│  created_at      TIMESTAMPTZ                                          │
│  updated_at      TIMESTAMPTZ                                          │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ definiert Attribut-Schema für
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                            craftsmen                                  │
│                                                                       │
│  id              UUID          PK                                    │
│  company_name    VARCHAR(255)                                         │
│  is_active       BOOLEAN       DEFAULT true                          │
│  metadata        JSONB         DEFAULT {}                            │
└──────────────────┬────────────────────────────────────────────────────┘
                   │ 1:N — ein Craftsman besitzt viele Versionen
                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        catalog_versions                               │
│                                                                       │
│  id              UUID          PK                                    │
│  craftsman_id    UUID          FK → craftsmen.id  ON DELETE CASCADE  │
│  trade           VARCHAR(32)                                         │
│  status          VARCHAR(16)   "DRAFT" | "PUBLISHED"                │
│  effective_from  TIMESTAMPTZ   ab wann diese Version gilt            │
│  published_by    VARCHAR(255)  NULL  Email des publizierenden Users  │
│  published_at    TIMESTAMPTZ   NULL                                  │
│  created_at      TIMESTAMPTZ                                          │
│  updated_at      TIMESTAMPTZ                                          │
│                                                                       │
│  INDEX: (craftsman_id, trade)     ← häufigste Abfrage               │
│  INDEX: (status)                  ← PUBLISHED-Lookup                │
└──────────┬────────────────────────────────┬───────────────────────────┘
           │ 1:N                            │ 1:N
           ▼                               ▼
┌──────────────────────────┐   ┌──────────────────────────────────────┐
│    catalog_positions     │   │         catalog_discounts            │
│                          │   │                                      │
│  id              UUID PK │   │  id              UUID  PK            │
│  version_id      UUID FK │   │  version_id      UUID  FK            │
│  key        VARCHAR(100) │   │  key        VARCHAR(100)             │
│  label      VARCHAR(255) │   │  label      VARCHAR(255)             │
│  unit        VARCHAR(16) │   │  type        VARCHAR(16)             │
│  net_price_minor_units   │   │    "flat" | "percent"                │
│              INTEGER     │   │  discount_value  NUMERIC(12,4)       │
│  vat_rate   NUMERIC(5,4) │   │  cap             INTEGER  NULL       │
│  min_quantity  NUMERIC   │   │  applies_to      JSONB               │
│  max_quantity  NUMERIC   │   │    "subtotal" |                      │
│  trade_attributes  JSONB │   │    { positionKeys: string[] }        │
│  surcharges        JSONB │   │  created_at      TIMESTAMPTZ         │
│  created_at  TIMESTAMPTZ │   │  updated_at      TIMESTAMPTZ         │
│  updated_at  TIMESTAMPTZ │   │                                      │
│                          │   │  UNIQUE: (version_id, key)           │
│  UNIQUE: (version_id,key)│   └──────────────────────────────────────┘
└──────────────────────────┘
```

### Per-Trade-Attribut-Variabilität — Lösungsansatz

**Option A — Eigene Tabelle pro Trade:** `hvac_position_attributes`, `windows_position_attributes` etc.
→ Abgelehnt. Jede neue Trade-Kategorie erfordert eine Migration. Nicht skalierbar.

**Option B — EAV (Entity-Attribute-Value):** Generische `attribute_values`-Tabelle mit `(position_id, key, value_string, value_number, ...)`
→ Abgelehnt. Komplexe Abfragen, schwierige Validierung, kein Schema-Enforcement.

**Option C — jsonb mit Schema-Validator** ← gewählt

```
trade_configs.pricing_schema  →  beschreibt die Regeln   (Admin-konfiguriert)
catalog_positions.trade_attrs →  enthält die Werte        (Handwerker-eingegeben)
```

**Warum jsonb?**
- PostgreSQL jsonb hat GIN-Index-Support für schnelle Abfragen
- Validierung zur Schreibzeit durch den Schema-Validator
- Neue Trade-Kategorien ohne Migrationen einführbar
- Das Partner-Portal rendert Formularfelder dynamisch aus dem Schema — keine Hardcodierung

**Schema-Validator** ist eine **pure function** (`validateTradeAttributes`) mit eigenem Spec-File. Sie wird bei jedem Draft-Write aufgerufen — nicht nur beim Publish. Unterstützte Constraints:

| Constraint | Beschreibung | Beispiel |
|---|---|---|
| `type: string` | Beliebiger Text | `{ name: "color", type: "string" }` |
| `type: number` | Zahlenfeld | `{ name: "kw", type: "number" }` |
| `type: boolean` | Ja/Nein | `{ name: "isDouble", type: "boolean" }` |
| `type: enum` | Werteliste | `{ name: "material", allowedValues: ["wood", "pvc"] }` |
| `min` / `max` | Numerische Grenzen | `{ min: 1, max: 100 }` |
| `required` | Pflichtfeld | `{ required: true }` |
| `dependsOn` | Bedingte Sichtbarkeit | `{ dependsOn: { field: "material", equals: "wood" } }` |

**End-to-End-Datenfluss:**

```
Admin konfiguriert Schema:
  PATCH /trades/WINDOWS
  { fields: [
    { name: "uValue",       type: "number", min: 0.5, max: 3.0, required: true },
    { name: "frameMaterial",type: "enum",   allowedValues: ["wood","pvc"], required: true },
    { name: "woodTreatment",type: "string", required: false,
      dependsOn: { field: "frameMaterial", equals: "wood" } }
  ]}
        ↓
Partner-Portal lädt Schema:
  GET /trades/WINDOWS → pricingSchema
  → Dialog rendert dynamisch 2–3 Felder je nach frameMaterial-Wahl
        ↓
Handwerker speichert Position:
  PATCH /pricing-catalogs/:id
  { tradeAttributes: { uValue: 1.1, frameMaterial: "wood", woodTreatment: "lacquer" } }
        ↓
Backend validiert:
  validateTradeAttributes(attrs, schema) → [] (leer = valid)
  → gespeichert
```

---

## 2. Katalog-Versionierung

### Zustandsmodell

```
                    ┌─────────────────────────┐
                    │                         │
         POST       │         DRAFT           │  PATCH positions
     /pricing-catalogs         (mutierbar)    │  PATCH discounts
                    │                         │  PATCH effectiveFrom
                    └──────────┬──────────────┘
                               │
                    POST /:id/publish
                    (SELECT FOR UPDATE)
                               │
                               ▼
                    ┌─────────────────────────┐
                    │                         │
                    │       PUBLISHED         │  READ-ONLY
                    │       (immutable)       │  für immer
                    │                         │
                    └─────────────────────────┘
```

### Versionierungs-Invarianten

- Pro `(craftsmanId, trade)` maximal **ein DRAFT** gleichzeitig
- Beliebig viele PUBLISHED-Versionen (Archiv-Zwecke)
- Aktive Version = `ORDER BY effective_from DESC LIMIT 1` auf PUBLISHED
- Alte Versionen: vollständig lesbar, niemals löschbar
- Eine PUBLISHED-Version kann niemals editiert werden — `400` bei Versuch

### Draft aus aktiver Version starten

Wenn bereits eine PUBLISHED-Version existiert, kann ein neuer Draft mit kopierten Positionen gestartet werden:

```
POST /pricing-catalogs
{ trade: "HVAC", effectiveFrom: "...", sourceVersionId: "uuid-der-aktiven-version" }
```

Der Service kopiert alle Positionen der Quell-Version in den neuen Draft. Der Handwerker muss nicht von null anfangen — er aktualisiert nur die geänderten Preise.

---

## 3. Money-Repräsentation

**Entscheidung: Integer in Cent (Minor Units)**

```
Preis      Storage (DB)    Arithmetik     Formatierung
150,00 €   15000 INTEGER   15000 + 500    formatCents(15500) = "155,00 €"
  0,99 €      99 INTEGER      99 × 3      formatCents(297)   =   "2,97 €"
```

**Warum kein Float?**

```javascript
// IEEE 754 Floating-Point — das passiert wirklich:
0.1 + 0.2          === 0.30000000000000004  // true
1.005.toFixed(2)   === "1.00"               // nicht "1.01"
19.99 * 3          === 59.97000000000001    // nicht 59.97

// Mit Cent-Integers:
10 + 20            === 30                   // immer
Math.round(1005 * 0.02) === 20              // korrekt
1999 * 3           === 5997                 // exakt
```

Floating-Point-Fehler akkumulieren sich bei Zuschlägen, Rabatten und MwSt. Bei einem Angebot mit 50 Positionen und mehreren Rabatten kann die Summe der Zeilen-Brutto um mehrere Cent vom ausgewiesenen Gesamtbrutto abweichen — nicht akzeptabel für ein System das Rechnungsgrundlage sein soll.

**Integer-Arithmetik ist exakt und deterministisch.** Dieses Muster ist Industriestandard: Stripe, Adyen, Mollie und Braintree arbeiten alle mit Minor Units in ihren APIs.

**Konsistenz-Regel:** Formatierung (`/ 100`) ausschließlich am Response-Rand. Niemals im Service, niemals in der Datenbank, niemals in der Berechnungslogik.

---

## 4. Quote-Calculator — Algorithmus & Denkansatz

### Designprinzipien

**Pure Function:** Kein Datenbankzugriff, kein State, kein Netzwerk. Gleiche Inputs → immer gleiche Outputs. Das ist die Grundlage für Audit-Replay: eine Quote gegen eine archivierte Version liefert in 5 Jahren dieselben Zahlen wie heute.

**Fail Fast:** Alle Validierungen laufen in Schritt 1 — bevor eine einzige Berechnung stattfindet. Entweder das gesamte Input ist valide, oder es gibt einen präzisen 400-Fehler.

**Refaktorierung:** Der erste Entwurf war eine monolithische Funktion (~150 Zeilen). Ich habe sie in 4 klar benannte Schritte refaktoriert, weil jeder Schritt eine eigene fachliche Bedeutung hat und separat getestet werden kann.

### Algorithmus

```
INPUT
────────────────────────────────────────────────────────────────────────
  lines:     [{ positionKey, quantity, appliedSurchargeKeys? }]
  positions: [{ key, netPriceMinorUnits, vatRate, surcharges,
                minQuantity, maxQuantity }]
  discounts: [{ type, value, cap, appliesTo }]

────────────────────────────────────────────────────────────────────────
SCHRITT 1 — validateLines()
────────────────────────────────────────────────────────────────────────

  Für jede Zeile:
  ┌─ positionKey in positions-Map?  NEIN → 400 "Unbekannte Position: X"
  ├─ quantity > 0?                  NEIN → 400 "Menge muss > 0 sein"
  ├─ quantity >= minQuantity?       NEIN → 400 "Menge muss mind. N sein"
  ├─ quantity <= maxQuantity?       NEIN → 400 "Menge darf max. N sein"
  └─ alle surchargeKeys bekannt?    NEIN → 400 "Unbekannter Zuschlag: X"

  → Kein Fehler: weiter zu Schritt 2
  → Fehler:      QuoteValidationError (wird zu HTTP 400)

────────────────────────────────────────────────────────────────────────
SCHRITT 2 — computeLineNets()
────────────────────────────────────────────────────────────────────────

  Für jede Zeile:

  baseNet = Math.round(quantity × netPriceMinorUnits)
              └── Math.round() für nicht-ganzzahlige Mengen

  Zuschläge:
  ┌─ flat:    surchargesFlat += surcharge.value
  └─ percent: surchargesPct += Math.round(baseNet × surcharge.value)
               └── Prozent wird auf Basis-Netto angewendet (nicht kumulativ)

  lineNet = baseNet + surchargesFlat + surchargesPct

  Ergebnis pro Zeile:
  { positionKey, baseNetMinorUnits, surchargesTotalMinorUnits, lineNetMinorUnits }

────────────────────────────────────────────────────────────────────────
SCHRITT 3 — applyDiscounts()
────────────────────────────────────────────────────────────────────────

  Für jeden Rabatt (in Deklarationsreihenfolge):

  1. Betroffene Zeilen bestimmen:
     appliesTo = "subtotal"          → alle Zeilen
     appliesTo = { positionKeys: [] } → nur diese Schlüssel

  2. Subtotal der betroffenen Zeilen berechnen:
     subtotal = Σ line.finalNetMinorUnits

  3. Rabattbetrag berechnen:
     flat:    discountAmount = Math.min(value, subtotal)
     percent: discountAmount = Math.round(subtotal × value)
              if cap: discountAmount = Math.min(discountAmount, cap)
                      └── Cap greift VOR dem nächsten Rabatt

  4. Proportionale Verteilung auf betroffene Zeilen:
     für i in 0..n-2:
       lineDiscount[i] = Math.round(line.finalNet / subtotal × discount)
     lineDiscount[n-1] = totalDiscount - Σ(lineDiscount[0..n-2])
                         └── letzte Zeile bekommt Rundungsrest
                             → Summe aller Zeilenrabatte === Gesamtrabatt

  5. finalNetMinorUnits -= lineDiscount

────────────────────────────────────────────────────────────────────────
SCHRITT 4 — computeVatAndTotals()
────────────────────────────────────────────────────────────────────────

  Für jede Zeile:
  vatMinorUnits   = Math.round(finalNetMinorUnits × vatRate)
  grossMinorUnits = finalNetMinorUnits + vatMinorUnits

  Gruppierung nach vatRate:
  groups[0.19] = { netMinorUnits: Σ, vatMinorUnits: Σ, grossMinorUnits: Σ }
  groups[0.07] = { netMinorUnits: Σ, vatMinorUnits: Σ, grossMinorUnits: Σ }

  Totals:
  netMinorUnits           = Σ line.finalNetMinorUnits
  discountsTotalMinorUnits = Σ line.discountsTotalMinorUnits
  vatMinorUnits           = Σ line.vatMinorUnits
  grossMinorUnits         = Σ line.grossMinorUnits

  Invariante (in Tests geprüft):
  Σ vatGroups[*].vatMinorUnits === totals.vatMinorUnits

────────────────────────────────────────────────────────────────────────
OUTPUT
────────────────────────────────────────────────────────────────────────
  lines: [{
    positionKey, label, quantity, unit,
    baseNetMinorUnits,
    surchargesTotalMinorUnits,
    lineNetMinorUnits,
    discountsTotalMinorUnits,
    finalNetMinorUnits,
    vatRate, vatMinorUnits, grossMinorUnits
  }]
  vatGroups: [{ vatRate, netMinorUnits, vatMinorUnits, grossMinorUnits }]
  totals:    { netMinorUnits, discountsTotalMinorUnits, vatMinorUnits, grossMinorUnits }
```

### Rundungsregel — konkretes Beispiel

```
Ausgangswert:   333 Cent  (= 3,33 €)

Schritt 2 — Zuschläge:
  Flat +200:      333 + 200 = 533 Cent
  Percent 10%:    Math.round(533 × 0.10) = Math.round(53.3)  = 53 Cent
  lineNet:        533 + 53 = 586 Cent

Schritt 3 — Rabatt 5% mit Cap 25 Cent:
  raw:            Math.round(586 × 0.05) = Math.round(29.3)  = 29 Cent
  cap greift:     Math.min(29, 25)                           = 25 Cent
  finalNet:       586 − 25 = 561 Cent

Schritt 4 — MwSt 19%:
  vat:            Math.round(561 × 0.19) = Math.round(106.59) = 107 Cent
  gross:          561 + 107 = 668 Cent (= 6,68 €)
```

### Warum diese Reihenfolge?

```
Zuschläge zuerst   Erhöhen die Bemessungsgrundlage — Teil des vereinbarten Preises
Rabatte danach     Gelten auf den Subtotal nach Zuschlägen — Nachlass auf Gesamtpreis
MwSt zuletzt       Steuerrechtlich zwingend: auf den finalen Nettobetrag nach Rabatten
```

### Test-Strategie

Der Calculator ist mit **26 Tests** abgedeckt:
- Happy Paths: einfache Berechnungen, mehrere Positionen, gemischte MwSt-Sätze
- Edge Cases: leere Zeilen-Liste, Zero-Quantity, Qty außerhalb min/max
- Surcharge-Tests: flat, percent, kombiniert, 0%-Zuschlag als No-Op
- Discount-Tests: flat, percent mit Cap, gestapelte Rabatte, positionsspezifisch
- Invariant-Tests: `Σ vatGroups.vat === totals.vat`, Mengen verdoppeln verdoppeln Netto exakt

---

## 5. Concurrency beim Publish

### Das Problem

Zwei gleichzeitige `POST /:id/publish`-Calls auf denselben Draft dürfen nicht beide gewinnen — das würde zu inkonsistenten Daten führen.

### Lösung: `SELECT … FOR UPDATE`

```
Zeit →

Request A                           Request B
──────────────────────────────────────────────────────────────────────
BEGIN TRANSACTION                   BEGIN TRANSACTION
                                    │
SELECT id FROM catalog_versions     │  SELECT id FROM catalog_versions
WHERE id = $1 FOR UPDATE            │  WHERE id = $1 FOR UPDATE
→ Lock erworben ✅                  │  → wartet auf Lock...
│                                   │
│ Version laden: status = DRAFT ✅  │
│ Positionen prüfen: > 0 ✅         │
│ status = PUBLISHED                │
│ publishedBy = user.email          │
│ publishedAt = NOW()               │
│ UPDATE catalog_versions           │
COMMIT                              │
→ Lock freigegeben ──────────────── ►│ Lock erworben
                                    │ Version laden: status = PUBLISHED ❌
                                    │ throw BadRequestException(400)
                                    ROLLBACK
```

**Verworfene Alternative 1 — Unique Partial Index:**
```sql
CREATE UNIQUE INDEX ON catalog_versions (craftsman_id, trade)
WHERE status = 'PUBLISHED';
```
Würde das Archivierungsmodell brechen. Wir behalten alte PUBLISHED-Versionen dauerhaft für Audit-Zwecke. Ein solcher Index würde nur eine PUBLISHED-Version pro `(craftsman_id, trade)` erlauben.

**Verworfene Alternative 2 — PostgreSQL Advisory Lock:**
```sql
SELECT pg_advisory_xact_lock(hashtext(craftsman_id || ':' || trade));
```
Advisory Locks sind sessiongebunden. Bei Connection-Pooling (PgBouncer, RDS Proxy) können sie unerwartet verhalten — ein Lock aus Session A ist in Session B nicht sichtbar. `SELECT FOR UPDATE` ist transaktionsgebunden und verhält sich bei Pooling korrekt.

---

## 6. Schema-Patch-Konflikt

### Entscheidung: 409 Conflict mit Positionsliste (Reject-Strategie)

Wenn `PATCH /trades/:trade` ein neues `pricingSchema` setzt, das bestehende DRAFT-Positionen invalidieren würde:

```http
PATCH /api/v1/trades/HVAC
Content-Type: application/json

{
  "pricingSchema": {
    "fields": [{ "name": "kw", "type": "number", "min": 10, "required": true }]
  }
}

───────────────────────────────────
HTTP/1.1 409 Conflict

{
  "message": "Das neue Schema ist inkompatibel mit bestehenden Positionen in aktiven DRAFTs.",
  "conflictingPositions": [
    {
      "positionKey": "heizk-01",
      "versionId": "3f8a...",
      "errors": ["kw muss mindestens 10 sein (aktuell: 5)"]
    },
    {
      "positionKey": "heizk-02",
      "versionId": "3f8a...",
      "errors": ["kw ist Pflichtfeld"]
    }
  ]
}
```

**Warum Reject statt Drift-Markierung?**
- Stille Inkonsistenzen (`SCHEMA_DRIFTED`) sind schwerer zu debuggen
- Der Admin sieht sofort welche Positionen betroffen sind
- Handwerker können gezielt informiert werden
- Keine zusätzliche Komplexität im Datenmodell

**Scope:** Nur DRAFT-Versionen werden geprüft. PUBLISHED-Versionen sind eingefroren — das neue Schema betrifft ausschließlich zukünftige Positionen.

---

## 7. Aktive Version — Overlap-Auflösung

Pro `(craftsmanId, trade)` darf zu einem Zeitpunkt nur eine PUBLISHED-Version aktiv sein. Alte Versionen bleiben archiviert.

**Entscheidung: `ORDER BY effective_from DESC LIMIT 1`**

```sql
SELECT * FROM catalog_versions
WHERE craftsman_id = $1
  AND trade = $2
  AND status = 'PUBLISHED'
ORDER BY effective_from DESC
LIMIT 1;
```

Die neueste PUBLISHED-Version gewinnt. Keine explizite Deaktivierung alter Versionen — sie bleiben vollständig erhalten für Audit-Zwecke.

**Warum kein `isActive`-Flag?**
Ein Flag müsste beim Publish atomar gesetzt/gelöscht werden — das ist ein weiteres Concurrency-Problem. `ORDER BY effective_from DESC` ist deterministisch und race-condition-frei.

---

## 8. AWS Cloud Architektur (§3.4.2)

### Infrastruktur-Überblick

```
                    ┌──────────────────────────────────────┐
                    │              Internet                 │
                    └─────────────────┬────────────────────┘
                                      │ HTTP / HTTPS (Port 80/443)
                    ┌─────────────────▼────────────────────┐
                    │      Application Load Balancer        │
                    │          (Public Subnets)             │
                    │                                       │
                    │  Host: api.domain                     │
                    │    Path /auth/*    → auth-service     │
                    │    Path /pricing/* → pricing-service  │
                    │                                       │
                    │  Host: app.domain                     │
                    │    → partner-portal                   │
                    │                                       │
                    │  Host: admin.domain                   │
                    │    → admin-portal                     │
                    └─────────────────┬────────────────────┘
                                      │
       ┌──────────────────────────────▼───────────────────────────────┐
       │                    AWS VPC  10.0.0.0/16                      │
       │                                                              │
       │  ┌─────────────────────────────────────────────────────────┐ │
       │  │           Public Subnets (AZ-a  +  AZ-b)               │ │
       │  │                                                         │ │
       │  │   ALB ──── NAT Gateway ────────────────────────────    │ │
       │  │                  │ Outbound für ECS Tasks               │ │
       │  └──────────────────┼──────────────────────────────────────┘ │
       │                     │                                        │
       │  ┌──────────────────┼──────────────────────────────────────┐ │
       │  │        Private Subnets (AZ-a  +  AZ-b)                 │ │
       │  │                  │                                      │ │
       │  │  ┌───────────────┴────────────────────────────────┐    │ │
       │  │  │              ECS Cluster (Fargate)             │    │ │
       │  │  │                                                │    │ │
       │  │  │  ┌─────────────┐   ┌──────────────────────┐   │    │ │
       │  │  │  │ auth-service│   │   pricing-service    │   │    │ │
       │  │  │  │  CPU: 256   │   │     CPU: 256         │   │    │ │
       │  │  │  │  MEM: 512MB │   │     MEM: 512MB       │   │    │ │
       │  │  │  │  Port: 3001 │   │     Port: 3000       │   │    │ │
       │  │  │  └──────┬──────┘   └──────────┬───────────┘   │    │ │
       │  │  │         │ lesen Secrets        │               │    │ │
       │  │  │  ┌──────────────┐   ┌──────────────────────┐   │    │ │
       │  │  │  │partner-portal│   │    admin-portal      │   │    │ │
       │  │  │  │  Port: 4200  │   │     Port: 4201       │   │    │ │
       │  │  │  └──────────────┘   └──────────────────────┘   │    │ │
       │  │  └────────────────────────────────────────────────┘    │ │
       │  │                                                         │ │
       │  │  ┌──────────────────────────────────────────────────┐   │ │
       │  │  │               RDS PostgreSQL 16                  │   │ │
       │  │  │   db.t3.micro · 20GB gp3 · Multi-AZ optional     │   │ │
       │  │  │   Security Group: ONLY from ECS-SG on Port 5432  │   │ │
       │  │  │   publicly_accessible = false                     │   │ │
       │  │  └──────────────────────────────────────────────────┘   │ │
       │  │                                                         │ │
       │  │  ┌──────────────┐  ┌─────────────────┐  ┌──────────┐  │ │
       │  │  │   Secrets    │  │   CloudWatch    │  │   ECR    │  │ │
       │  │  │   Manager    │  │     Logs        │  │ 4 Repos  │  │ │
       │  │  │  JWT_SECRET  │  │  4 Log Groups   │  │          │  │ │
       │  │  │  DB_PASSWORD │  │  30d Retention  │  │          │  │ │
       │  │  └──────────────┘  └─────────────────┘  └──────────┘  │ │
       │  └─────────────────────────────────────────────────────────┘ │
       └──────────────────────────────────────────────────────────────┘
```

### Infrastruktur-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| ECS Fargate statt EC2 | Kein Patch-Management, Billing per Task-Sekunde, kein Over-Provisioning |
| RDS in Private Subnets | Kein direkter Internetzugang — Angriffsfläche minimal |
| Security Group auf RDS | Nur ECS-SG als Quelle → Principle of Least Privilege |
| Secrets Manager | JWT_SECRET und DB_PASSWORD nie in Task Definitions hardcoded |
| Ein `ecs_service`-Modul | DRY — viermal aufgerufen; Änderungen propagieren automatisch |
| NAT Gateway (1 AZ) | Kostengünstig für Sandbox; Produktion: 2 AZs für HA |
| CloudWatch 30d Retention | Ausreichend für operatives Debugging; reduziert Kosten |

### Terraform-Verifikation

```bash
# LocalStack starten (kein AWS-Account nötig)
docker compose -f infrastructure/localstack-compose.yml up -d

# Plan ausführen
cd terraform
terraform init
terraform plan -var="domain=example.com" -var="image_tag=latest" -var="db_password=changeme"

# Ergebnis:
# Plan: 59 to add, 0 to change, 0 to destroy. ✅
```

---

## 9. Skalierung Richtung volle Pricing Engine

Das aktuelle Datenmodell ist bewusst als Fundament konzipiert, das den späteren Offer-Generator tragen kann.

**Quote-Calculator als Microservice:** Der Calculator ist bereits eine pure function ohne Datenbankabhängigkeit. Er kann als Lambda-Funktion oder dedizierter Service extrahiert werden, der horizontal skaliert und gecacht wird.

**Offer-Generator:** Für den vollständigen Offer-Generator genügt eine `offers`-Tabelle:
```sql
CREATE TABLE offers (
  id              UUID PRIMARY KEY,
  catalog_version_id UUID REFERENCES catalog_versions(id),
  quote_snapshot  JSONB,  -- eingefroren zum Zeitpunkt der Erstellung
  created_by      VARCHAR(255),
  created_at      TIMESTAMPTZ
);
```
Die `quote_snapshot`-Spalte stellt Audit-Replay sicher: ein Angebot von vor 6 Monaten liefert dieselben Zahlen wie damals.

**Neue Trade-Kategorien:** Durch die `pricingSchema`-Architektur einführbar ohne Datenbankmigrationen — nur ein Admin-Klick.

**Nächste Schritte:**
- Pagination auf `GET /pricing-catalogs` (Cursor-basiert)
- Idempotency-Keys auf Quote-Endpoints (§3.4.1)
- Read-Modell für die Planer-UI (CQRS mit separater Projektion)
- Time-Travel-Quote `?at=<ISO>` (§3.4.3) — Infrastruktur bereits vorhanden

---

## 10. Gekürzter Scope

| Feature | Entscheidung | Begründung |
|---|---|---|
| Surcharges UI (Partner-Portal) | Weggelassen | Backend + Calculator vollständig; Verwaltungs-UI kostet unverhältnismäßig viel Zeit |
| Discounts UI (Partner-Portal) | Weggelassen | Gleiche Begründung — Datenmodell, Endpoints und Calculator-Support vorhanden |
| Pagination `GET /pricing-catalogs` | Weggelassen | Für Challenge-Datenmenge nicht relevant |
| Time-Travel-Quote `?at=` | Weggelassen | Terraform als aussagekräftigeres optionales Signal gewählt |
| History-Ansicht Katalog | Weggelassen | Explizit Out of Scope per Challenge §4 |
| Drag-and-Drop Schema-Editor | Weggelassen | Out of Scope per Challenge §4; Up/Down-Buttons implementiert |

---

## 11. KI-Nutzung

KI-Assistenz (Claude) wurde als Werkzeug eingesetzt — vergleichbar mit einem erfahrenen Pair-Programming-Partner, dessen Vorschläge denselben kritischen Review-Prozess durchlaufen wie Code von einem Junior.

### Wo KI genutzt wurde

| Bereich | Einsatz | Wie ich validiert habe |
|---|---|---|
| Entities & Migration | Ersten Entwurf generiert | Manuell gegen bestehende `Init`-Migration geprüft; `pricing_service.`-Prefix und TypeORM-API-Konventionen sichergestellt |
| Controller & DTOs | Scaffolding als Ausgangspunkt | Auth-Pattern manuell gegen `CraftsmenController` abgeglichen; `@sandbox/auth`-Import-Pfad korrigiert; Swagger-Annotationen überprüft |
| i18n-Keys | Ersten Draft generiert | Jeden Key gegen die laufende UI geprüft; fehlende Keys (`common.*`, `minQuantity`, `maxQuantity`, `tradeAttributes`) selbst identifiziert und nachgetragen |
| Terraform | Modulstruktur vorgeschlagen | `terraform plan` gegen LocalStack selbst ausgeführt und Fehler eigenständig behoben: duplicate provider (versions.tf + localstack-provider.tf), HCL-Semikolons in variables.tf |

### Was ich selbst entworfen und implementiert habe

**Architektur-Entscheidungen:** Die Wahl von jsonb vs. eigene Tabellen vs. EAV, das Versionierungsmodell mit DRAFT/PUBLISHED, die Archivierungsstrategie mit `ORDER BY effective_from DESC` — eigenständig abgewogen und entschieden.

**Quote-Calculator:** Die Auswertungsreihenfolge (Zuschläge → Rabatte → MwSt), die Rundungsregel mit `Math.round()` nach jedem Schritt, die proportionale Rabattverteilung mit Rundungsrest auf der letzten Zeile — eigenständig durchdacht. Der Calculator wurde zweimal refaktoriert: zuerst von einer monolithischen Funktion in 4 benannte Schritte, dann mit extrahierten Helper-Funktionen für Testbarkeit. Die erste KI-Version wurde verworfen und neu geschrieben.

**Schema-Validator:** Die `dependsOn`-Logik und alle Validierungsregeln von Hand implementiert und alle Edge-Cases (NaN, leere Strings, unbekannte Felder, `null`) eigenständig identifiziert.

**Test-Strategie:** Invariant-Tests auf dem Calculator (`Σ vatGroups.vat === totals.vat`, Mengen verdoppeln verdoppeln Netto exakt), Integrationstest-Strategie für Frontend-Komponenten (pure Helper-Funktionen extrahieren und isoliert testen), Concurrent-Publish-Test — alle eigenständig konzipiert.

**Debugging:** Windows CRLF-Problem bei Docker (`exec ./docker-entrypoint.sh: no such file or directory` — Ursache: `\r\n` in Shell-Skripten), NestJS Dependency-Injection-Fehler (`CraftsmenModule` kennt `PricingCatalogsService` nicht), TypeScript-Generics-Fehler im Frontend (`useState<Record<...>>`), LocalStack-Provider-Konflikt (`duplicate provider`) — alle eigenständig analysiert und behoben.

---

## 12. Wie man den Stack startet

```bash
# Alles starten (inkl. Migrations + Seed)
docker compose up --build

# Tests — Backend (87 Tests)
cd apps/services/pricing-service && yarn test

# Tests — Partner-Portal (20 Tests)
cd apps/partner-portal && yarn test

# Tests — Admin-Portal (33 Tests)
cd apps/admin-portal && yarn test

# Migrations manuell (lokal ohne Docker)
cd apps/services/pricing-service && yarn migration:run

# Terraform gegen LocalStack
docker compose -f infrastructure/localstack-compose.yml up -d
cd terraform && terraform init
terraform plan -var="domain=example.com" -var="image_tag=latest" -var="db_password=changeme"
```

**Test-Accounts:**

| Role | Email | Passwort |
|---|---|---|
| Admin | `admin@example.com` | `admin123` |
| Partner | `partner@example.com` | `partner123` |

**URLs (lokal):**

| Service | URL |
|---|---|
| Partner-Portal | http://localhost:4200 |
| Admin-Portal | http://localhost:4201 |
| Pricing API + Swagger | http://localhost:3000/api/docs |
| Auth API | http://localhost:3001/api/v1 |