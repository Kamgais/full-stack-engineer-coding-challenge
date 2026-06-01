# DESIGN.md — Pricing Catalog Service

> Coding Challenge · Full-Stack Engineer · Deutsche Sanierungsberatung

---

## 1. Datenmodell

### Überblick

Der Kern der Implementierung ist ein **versionierter Preiskatalog** pro `(craftsmanId, trade)`. Das Modell wurde bewusst minimal gehalten — es löst das Problem von heute und lässt Raum für die volle Pricing Engine von morgen.

### Datenbankschema

```
┌─────────────────────────────────────────────────────────────────────┐
│                         trade_configs                               │
│  id · trade (UK) · displayName · isActive · pricingSchema (jsonb)  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ definiert Schema für
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           craftsmen                                 │
│              id · companyName · isActive · metadata                 │
└──────────────┬──────────────────────────────────────────────────────┘
               │ besitzt
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       catalog_versions                              │
│   id · craftsmanId (FK) · trade · status · effectiveFrom           │
│   publishedBy · publishedAt · createdAt · updatedAt                │
│                                                                     │
│   status: DRAFT (mutierbar) │ PUBLISHED (eingefroren, immutable)   │
└──────────────┬──────────────────────┬───────────────────────────────┘
               │ enthält              │ enthält
               ▼                      ▼
┌──────────────────────────┐  ┌──────────────────────────────────────┐
│    catalog_positions     │  │         catalog_discounts            │
│  id · versionId (FK)     │  │  id · versionId (FK)                │
│  key · label · unit      │  │  key · label · type (flat/percent)  │
│  netPriceMinorUnits      │  │  value · cap · appliesTo (jsonb)    │
│  vatRate · minQty        │  └──────────────────────────────────────┘
│  maxQty                  │
│  tradeAttributes (jsonb) │  ← validiert gegen pricingSchema
│  surcharges (jsonb)      │
└──────────────────────────┘
```

### Per-Trade-Attribut-Variabilität

Das zentrale Designproblem: Jedes Gewerk hat fundamental andere Positionsattribute.

```
HVAC:     { heatingPowerKw: 5 }
WINDOWS:  { uValue: 1.1, frameMaterial: "wood", woodTreatment: "lacquer" }
SOLAR:    { panelWatt: 400, panelCount: 10, inverterModel: "SMA-5000" }
```

**Entscheidung: jsonb für trade_attributes + Schema-Validator**

Anstatt pro Trade eine eigene Tabelle oder hartcodierte Spalten anzulegen:

```
trade_configs.pricing_schema  →  definiert die Regeln  (Admin-konfiguriert)
catalog_positions.trade_attrs →  speichert die Werte   (Handwerker-eingegeben)
```

Der Schema-Validator (`validateTradeAttributes`) ist eine **pure function** die bei jedem Draft-Write prüft ob die Daten dem Schema entsprechen. Er unterstützt:

| Feature | Beispiel |
|---|---|
| Typen | `string`, `number`, `boolean`, `enum` |
| Numerische Grenzen | `min: 1, max: 100` |
| Pflichtfelder | `required: true` |
| Enum-Wertelisten | `allowedValues: ["wood", "pvc"]` |
| Bedingte Felder | `dependsOn: { field: "frameMaterial", equals: "wood" }` |

Diese Architektur erlaubt es, neue Trade-Kategorien **ohne Datenbankmigrationen** einzuführen.

---

## 2. Money-Repräsentation

**Entscheidung: Integer in Cent (Minor Units)**

```
150,00 € → 15000  ✅
150.0    → NEIN   ❌  (Float)
"150.00" → NEIN   ❌  (String)
```

**Warum kein Float?**

```javascript
// Das passiert mit Floats:
0.1 + 0.2 === 0.30000000000000004  // true — JavaScript IEEE 754

// Mit Cents:
10 + 20 === 30  // true — immer exakt
```

Floating-Point-Fehler akkumulieren sich über Zuschläge, Rabatte und MwSt-Berechnungen. Bei einem Angebot mit 50 Positionen und mehreren Rabatten kann sich ein kleiner Rundungsfehler zu einem falschen Gesamtbetrag summieren.

Integer-Arithmetik ist exakt und deterministisch. Dieses Muster ist Industriestandard — Stripe, Adyen und Mollie arbeiten alle mit Minor Units.

**Konsequenz:** Formatierung ausschließlich am Response-Rand:
```typescript
formatCents(15000) → "150,00 €"
```

---

## 3. Quote-Calculator — Algorithmus & Denkansatz

### Warum eine pure function?

Ich habe den Calculator bewusst als **pure function** implementiert — kein Datenbankzugriff, kein State, kein Netzwerk. Das erlaubt:

- Isoliertes Testen ohne Mocks
- Horizontale Skalierung ohne Seiteneffekte
- Deterministisches Verhalten (Audit-Replay: gleiche Inputs → immer gleiche Outputs)

Der erste Entwurf war eine große monolithische Funktion. Ich habe sie in **4 klar benannte Schritte** refaktoriert, weil jeder Schritt eine eigene fachliche Bedeutung hat.

### Algorithmus — Schritt für Schritt

```
INPUT
  lines:     [{ positionKey, quantity, appliedSurchargeKeys? }]
  positions: [{ key, netPriceMinorUnits, vatRate, surcharges, ... }]
  discounts: [{ type, value, cap, appliesTo }]
       │
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCHRITT 1 — validateLines()                                        │
│                                                                     │
│  • Position bekannt?                          → 400 wenn nicht     │
│  • quantity > 0?                              → 400 wenn nicht     │
│  • quantity in [minQuantity, maxQuantity]?    → 400 wenn nicht     │
│  • Zuschlag-Keys auf der Position deklariert? → 400 wenn nicht     │
│                                                                     │
│  Alle Fehler werden VOR der Berechnung geprüft — fail fast         │
└────────────────────────────┬────────────────────────────────────────┘
                             │ ✅ alle valide
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCHRITT 2 — computeLineNets()                                      │
│                                                                     │
│  Pro Zeile:                                                         │
│    baseNet = quantity × netPriceMinorUnits                         │
│                                                                     │
│    Flat-Zuschläge:    direkt summieren                              │
│      +5.000 Cent Notfall-Aufschlag                                  │
│                                                                     │
│    Percent-Zuschläge: auf Basis-Netto                               │
│      Math.round(baseNet × 0.10) = +1.500 Cent (10% Express)       │
│                                                                     │
│    lineNet = baseNet + surchargesTotal                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCHRITT 3 — applyDiscounts()                                       │
│                                                                     │
│  Rabatte in Deklarationsreihenfolge:                                │
│                                                                     │
│    flat:    Math.min(value, subtotal)                               │
│    percent: Math.round(subtotal × rate) → dann cap anwenden        │
│                                                                     │
│  Proportionale Verteilung auf betroffene Zeilen:                   │
│    lineDiscount = Math.round(lineNet / subtotal × totalDiscount)   │
│    letzte Zeile bekommt Rundungsrest → Summe immer exakt           │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SCHRITT 4 — computeVatAndTotals()                                  │
│                                                                     │
│  Pro Zeile:                                                         │
│    vatAmount = Math.round(finalNet × vatRate)                      │
│    gross = finalNet + vatAmount                                     │
│                                                                     │
│  Gruppierung nach vatRate:                                          │
│    19%-Gruppe: { net: 38.000, vat: 7.220, gross: 45.220 }         │
│     7%-Gruppe: { net:  6.000, vat:   420, gross:  6.420 }         │
│                                                                     │
│  Invariante: Σ vatGroups.vat === totals.vat  (in Tests geprüft)   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
OUTPUT
  lines:     [{ positionKey, baseNet, surcharges, discounts, finalNet, vat, gross }]
  vatGroups: [{ vatRate, net, vat, gross }]
  totals:    { net, discountTotal, vat, gross }
```

### Rundungsregel — konkretes Beispiel

```
Netto:              333 Cent  (= 3,33 €)
Zuschlag 10%:       Math.round(333 × 0.10) = Math.round(33.3)  = 33 Cent
Nach Zuschlag:      333 + 33 = 366 Cent

Rabatt 5%:          Math.round(366 × 0.05) = Math.round(18.3)  = 18 Cent
Cap: 3.000 Cent → greift hier nicht
Nach Rabatt:        366 − 18 = 348 Cent

MwSt 19%:           Math.round(348 × 0.19) = Math.round(66.12) = 66 Cent
Brutto:             348 + 66 = 414 Cent (= 4,14 €)
```

### Warum diese Reihenfolge?

```
Zuschläge zuerst  → erhöhen die Bemessungsgrundlage des Handwerkers
Rabatte danach    → gelten auf den Subtotal nach Zuschlägen
MwSt zuletzt      → steuerrechtlich die einzig korrekte Reihenfolge
```

---

## 4. Concurrency beim Publish

**Entscheidung: `SELECT … FOR UPDATE`**

```
Request A                        Request B
    │                                │
    ├─ BEGIN TRANSACTION             ├─ BEGIN TRANSACTION
    ├─ SELECT FOR UPDATE ──────────► │  (wartet auf Lock...)
    ├─ status prüfen: DRAFT ✅       │
    ├─ UPDATE status = PUBLISHED     │
    ├─ COMMIT ───────────────────── ►│  (Lock freigegeben)
                                     ├─ SELECT FOR UPDATE
                                     ├─ status = PUBLISHED ❌
                                     ├─ throw 400 Bad Request
                                     └─ ROLLBACK
```

**Verworfene Alternative 1 — Unique Partial Index:**
Würde mehrere PUBLISHED-Versionen strukturell verhindern — bricht aber das Archivierungsmodell (alte Versionen bleiben für Audit-Zwecke erhalten).

**Verworfene Alternative 2 — Advisory Lock:**
Sessiongebunden, verhält sich unerwartet bei Connection-Pooling (PgBouncer). `SELECT FOR UPDATE` ist transaktionsgebunden und vorhersehbar.

---

## 5. Schema-Patch-Konflikt

**Entscheidung: 409 Conflict mit Positionsliste (Reject)**

```http
PATCH /api/v1/trades/HVAC
{ "pricingSchema": { "fields": [{ "name": "kw", "type": "number", "min": 10 }] } }

→ 409 Conflict
{
  "message": "Das neue Schema ist inkompatibel mit bestehenden Positionen",
  "conflictingPositions": [
    { "positionKey": "heizk-01", "versionId": "...", "errors": ["kw muss mind. 10 sein"] }
  ]
}
```

Nur DRAFT-Versionen werden geprüft. PUBLISHED-Versionen sind eingefroren.

---

## 6. AWS Cloud Architektur (§3.4.2)

```
                    ┌────────────────────────────────┐
                    │           Internet              │
                    └────────────┬───────────────────┘
                                 │ HTTP / HTTPS
                    ┌────────────▼───────────────────┐
                    │    Application Load Balancer    │
                    │        (Public Subnets)         │
                    │                                 │
                    │  api.domain/auth/*   → auth     │
                    │  api.domain/pricing/* → pricing │
                    │  app.domain   → partner-portal  │
                    │  admin.domain → admin-portal    │
                    └────────────┬───────────────────┘
                                 │
       ┌─────────────────────────▼──────────────────────────────────┐
       │                  AWS VPC  10.0.0.0/16                      │
       │                                                            │
       │  ┌──────────────────────────────────────────────────────┐  │
       │  │             Private Subnets (AZ-a + AZ-b)            │  │
       │  │                                                      │  │
       │  │  ┌─────────────┐ ┌──────────────┐                   │  │
       │  │  │ auth-service│ │pricing-service│                   │  │
       │  │  │ ECS Fargate │ │ ECS Fargate  │                   │  │
       │  │  │  Port 3001  │ │  Port 3000   │                   │  │
       │  │  └──────┬──────┘ └──────┬───────┘                   │  │
       │  │         │               │ beide lesen Secrets        │  │
       │  │  ┌──────────────┐ ┌──────────────┐                  │  │
       │  │  │partner-portal│ │ admin-portal │                  │  │
       │  │  │ ECS Fargate  │ │ ECS Fargate  │                  │  │
       │  │  │  Port 4200   │ │  Port 4201   │                  │  │
       │  │  └──────────────┘ └──────────────┘                  │  │
       │  │                                                      │  │
       │  │  ┌──────────────────────────────────────────────┐   │  │
       │  │  │           RDS PostgreSQL 16                  │   │  │
       │  │  │  SG: nur ECS Security Group → Port 5432      │   │  │
       │  │  │  Nicht öffentlich erreichbar                 │   │  │
       │  │  └──────────────────────────────────────────────┘   │  │
       │  └──────────────────────────────────────────────────────┘  │
       │                                                            │
       │  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  │
       │  │ Secrets Manager │  │  CloudWatch  │  │     ECR     │  │
       │  │  JWT_SECRET     │  │  4 Log Groups│  │ 4 Repos     │  │
       │  │  DB_PASSWORD    │  │  30d Reten.  │  │             │  │
       │  └─────────────────┘  └──────────────┘  └─────────────┘  │
       └────────────────────────────────────────────────────────────┘
```

### Sicherheits-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| RDS in Private Subnets | Kein direkter Internetzugang |
| Security Group auf RDS | Nur ECS Security Group als Quelle erlaubt |
| Secrets Manager | JWT_SECRET und DB_PASSWORD nie hardcoded |
| NAT Gateway | ECS Tasks können outbound ohne Public IP |
| Ein `ecs_service`-Modul | DRY — viermal aufgerufen statt 4× Copy-Paste |

### Terraform-Verifikation

```bash
docker compose -f infrastructure/localstack-compose.yml up -d
cd terraform && terraform init && terraform plan
# → Plan: 59 to add, 0 to change, 0 to destroy. ✅
```

---

## 7. Skalierung Richtung volle Pricing Engine

Das aktuelle Datenmodell ist bewusst als Fundament konzipiert. Der `quote-calculator` ist eine pure function ohne Datenbankabhängigkeit — er kann horizontal skaliert, gecacht und als eigenständiger Microservice extrahiert werden. Die `pricingSchema`-Architektur erlaubt neue Trade-Kategorien ohne Migrationen.

Für den späteren Offer-Generator genügt eine `offers`-Tabelle mit einer `quote_snapshot jsonb`-Spalte — damit ist Audit-Replay strukturell garantiert. Nächste Schritte: Pagination, Idempotency-Keys auf Quote-Endpoints, Read-Modell für die Planer-UI, Time-Travel-Quote `?at=<ISO>`.

---

## 8. Gekürzter Scope

| Feature | Entscheidung | Begründung |
|---|---|---|
| Surcharges UI (Partner-Portal) | Weggelassen | Backend + Calculator vollständig; UI-Aufwand unverhältnismäßig |
| Discounts UI (Partner-Portal) | Weggelassen | Gleiche Begründung — Datenmodell und Endpoints vorhanden |
| Pagination | Weggelassen | Für Challenge-Datenmenge nicht relevant |
| Time-Travel-Quote `?at=` | Weggelassen | Terraform als aussagekräftigeres optionales Signal gewählt |
| History-Ansicht Katalog | Weggelassen | Explizit Out of Scope per Challenge §4 |

---

## 9. KI-Nutzung

KI-Assistenz (Claude) wurde als Werkzeug eingesetzt — vergleichbar mit einem erfahrenen Pair-Programming-Partner, dessen Vorschläge kritisch geprüft werden.

### Wo KI genutzt wurde

| Bereich | Einsatz | Validierung |
|---|---|---|
| Entities & Migration | Ersten Entwurf generiert | Manuell gegen `Init`-Migration geprüft; `pricing_service.`-Prefix sichergestellt |
| Controller & DTOs | Scaffolding als Ausgangspunkt | Auth-Pattern manuell gegen `CraftsmenController` abgeglichen |
| i18n-Keys | Ersten Draft generiert | Zeile für Zeile gegen die laufende UI geprüft; fehlende Keys selbst nachgetragen |
| Terraform | Modulstruktur vorgeschlagen | `terraform plan` selbst ausgeführt; alle Fehler eigenständig behoben |

### Was ich selbst entworfen und implementiert habe

**Architektur-Entscheidungen** — jsonb vs. eigene Tabellen, Versionierungsmodell, Archivierungsstrategie, `ORDER BY effective_from DESC` — nach eigenem Abwägen entschieden.

**Quote-Calculator** — Auswertungsreihenfolge, Rundungsregel, proportionale Rabattverteilung mit Rundungsrest auf der letzten Zeile — eigenständig durchdacht und zweimal refaktoriert (monolithisch → 4 Schritte → mit Helpers).

**Schema-Validator** — `dependsOn`-Logik und alle Validierungsregeln von Hand implementiert. Edge-Cases (NaN, leere Strings, unbekannte Felder) eigenständig identifiziert.

**Test-Strategie** — Invariant-Tests auf dem Calculator, Integrationstest-Strategie für Frontend (pure Helper-Funktionen extrahieren), Concurrent-Publish-Test — eigenständig konzipiert.

**Debugging** — Windows CRLF bei Docker, NestJS Dependency-Injection-Fehler, TypeScript-Generics-Fehler, LocalStack-Provider-Konflikt — alle eigenständig analysiert und behoben.

---

## 10. Wie man den Stack startet

```bash
# Alles starten (inkl. Migrations + Seed)
docker compose up --build

# Tests — Backend
cd apps/services/pricing-service && yarn test

# Tests — Partner-Portal
cd apps/partner-portal && yarn test

# Tests — Admin-Portal
cd apps/admin-portal && yarn test

# Migrations manuell (lokal ohne Docker)
cd apps/services/pricing-service && yarn migration:run

# Terraform gegen LocalStack
docker compose -f infrastructure/localstack-compose.yml up -d
cd terraform && terraform init && terraform plan
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
| Pricing API | http://localhost:3000/api/v1 |
| Swagger Docs | http://localhost:3000/api/docs |
| Auth API | http://localhost:3001/api/v1 |