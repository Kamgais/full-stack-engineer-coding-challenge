import { Test } from '@nestjs/testing';
import { JwtPayload, UserRole } from '@sandbox/types';
import { CatalogVersionStatus } from './entities/catalog-version.entity';
import { PricingCatalogsController } from './pricing-catalogs.controller';
import { PricingCatalogsService } from './pricing-catalogs.service';

// ─── Test-Daten ───────────────────────────────────────────────────────────────

const craftsmanUser: JwtPayload = {
  sub: 'user-1',
  email: 'partner@example.com',
  roles: [UserRole.CRAFTSMAN],
  craftsmanId: 'craftsman-a',
};

const now = new Date('2026-01-01T00:00:00.000Z').toISOString();

const mockVersion = {
  id: 'version-1',
  craftsmanId: 'craftsman-a',
  trade: 'HVAC',
  status: CatalogVersionStatus.DRAFT,
  effectiveFrom: now,
  publishedBy: null,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
  positions: [],
  discounts: [],
};

const mockQuoteResult = {
  lines: [],
  vatGroups: [],
  totals: {
    netMinorUnits: 30000,
    discountsTotalMinorUnits: 0,
    vatMinorUnits: 5700,
    grossMinorUnits: 35700,
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PricingCatalogsController', () => {
  let controller: PricingCatalogsController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      list: jest.fn().mockResolvedValue([mockVersion]),
      create: jest.fn().mockResolvedValue(mockVersion),
      findOne: jest.fn().mockResolvedValue(mockVersion),
      update: jest.fn().mockResolvedValue(mockVersion),
      publish: jest.fn().mockResolvedValue({
        ...mockVersion,
        status: CatalogVersionStatus.PUBLISHED,
      }),
      quote: jest.fn().mockResolvedValue(mockQuoteResult),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PricingCatalogsController],
      providers: [
        { provide: PricingCatalogsService, useValue: service },
      ],
    }).compile();

    controller = moduleRef.get(PricingCatalogsController);
  });

  // ─── GET /pricing-catalogs ─────────────────────────────────────────────────

  describe('list — GET /pricing-catalogs', () => {
    it('gibt Liste der Katalog-Versionen zurück', async () => {
      const result = await controller.list({}, craftsmanUser);

      expect(service.list).toHaveBeenCalledWith({}, craftsmanUser);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('version-1');
    });

    it('gibt leere Liste zurück wenn keine Versionen existieren', async () => {
      service.list.mockResolvedValue([]);

      const result = await controller.list({}, craftsmanUser);
      expect(result).toEqual([]);
    });

    it('filtert nach trade wenn Query-Parameter gesetzt', async () => {
      await controller.list({ trade: 'HVAC' }, craftsmanUser);
      expect(service.list).toHaveBeenCalledWith({ trade: 'HVAC' }, craftsmanUser);
    });
  });

  // ─── POST /pricing-catalogs ────────────────────────────────────────────────

  describe('create — POST /pricing-catalogs', () => {
    it('legt neuen DRAFT an und gibt ihn zurück', async () => {
      const dto = {
        trade: 'HVAC' as any,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
      };

      const result = await controller.create(dto, craftsmanUser);

      expect(service.create).toHaveBeenCalledWith(dto, craftsmanUser);
      expect(result.status).toBe(CatalogVersionStatus.DRAFT);
      expect(result.trade).toBe('HVAC');
    });
  });

  // ─── GET /pricing-catalogs/:id ─────────────────────────────────────────────

  describe('findOne — GET /pricing-catalogs/:id', () => {
    it('gibt eine Version zurück', async () => {
      const result = await controller.findOne('version-1', craftsmanUser);

      expect(service.findOne).toHaveBeenCalledWith('version-1', craftsmanUser);
      expect(result.id).toBe('version-1');
    });
  });

  // ─── PATCH /pricing-catalogs/:id ──────────────────────────────────────────

  describe('update — PATCH /pricing-catalogs/:id', () => {
    it('aktualisiert einen DRAFT und gibt ihn zurück', async () => {
      const dto = {
        positions: [
          {
            key: 'heizk-01',
            label: 'Heizkörper einbauen',
            unit: 'piece' as any,
            netPriceMinorUnits: 15000,
            vatRate: 0.19,
          },
        ],
      };

      const result = await controller.update('version-1', dto, craftsmanUser);

      expect(service.update).toHaveBeenCalledWith('version-1', dto, craftsmanUser);
      expect(result.id).toBe('version-1');
    });
  });

  // ─── POST /pricing-catalogs/:id/publish ───────────────────────────────────

  describe('publish — POST /pricing-catalogs/:id/publish', () => {
    it('publisht einen DRAFT → PUBLISHED', async () => {
      const result = await controller.publish('version-1', craftsmanUser);

      expect(service.publish).toHaveBeenCalledWith('version-1', craftsmanUser);
      expect(result.status).toBe(CatalogVersionStatus.PUBLISHED);
    });
  });

  // ─── POST /pricing-catalogs/:id/quote ─────────────────────────────────────

  describe('quote — POST /pricing-catalogs/:id/quote', () => {
    it('berechnet ein Angebot und gibt es zurück', async () => {
      const dto = {
        lines: [{ positionKey: 'heizk-01', quantity: 2 }],
      };

      const result = await controller.quote('version-1', dto, craftsmanUser);

      expect(service.quote).toHaveBeenCalledWith('version-1', dto, craftsmanUser);
      expect(result.totals.netMinorUnits).toBe(30000);
      expect(result.totals.grossMinorUnits).toBe(35700);
    });

    it('gibt leeres Ergebnis zurück bei leerer Zeilen-Liste', async () => {
      service.quote.mockResolvedValue({
        lines: [],
        vatGroups: [],
        totals: {
          netMinorUnits: 0,
          discountsTotalMinorUnits: 0,
          vatMinorUnits: 0,
          grossMinorUnits: 0,
        },
      });

      const result = await controller.quote('version-1', { lines: [] }, craftsmanUser);
      expect(result.totals.grossMinorUnits).toBe(0);
    });
  });
});