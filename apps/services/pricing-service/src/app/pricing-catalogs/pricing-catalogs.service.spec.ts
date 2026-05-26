import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';

import { PricingCatalogsService } from './pricing-catalogs.service';
import { CatalogVersion, CatalogVersionStatus } from './entities/catalog-version.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { TradeConfig } from '../trades/entities/trade-config.entity';

type Repo<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

// ─── Test-Daten ───────────────────────────────────────────────────────────────

const adminUser: JwtPayload = {
  sub: 'admin-id',
  email: 'admin@example.com',
  roles: [UserRole.ADMIN],
  craftsmanId: null,
};

const craftsmanUser: JwtPayload = {
  sub: 'partner-user-id',
  email: 'partner@example.com',
  roles: [UserRole.CRAFTSMAN],
  craftsmanId: 'craftsman-a',
};

const otherCraftsmanUser: JwtPayload = {
  ...craftsmanUser,
  craftsmanId: 'craftsman-b',
};

const now = new Date('2026-01-01T00:00:00.000Z');

function buildVersion(overrides: Partial<CatalogVersion> = {}): CatalogVersion {
  return {
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
    ...overrides,
  } as CatalogVersion;
}

function buildPosition(overrides: Partial<CatalogPosition> = {}): CatalogPosition {
  return {
    id: 'pos-1',
    versionId: 'version-1',
    key: 'heizk-01',
    label: 'Heizkörper einbauen',
    unit: 'piece' as any,
    netPriceMinorUnits: 15000,
    vatRate: 0.19,
    minQuantity: 1,
    maxQuantity: 20,
    tradeAttributes: {},
    surcharges: [],
    createdAt: now,
    updatedAt: now,
    version: null as any,
    ...overrides,
  } as CatalogPosition;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PricingCatalogsService', () => {
  let service: PricingCatalogsService;
  let versionsRepo: Repo<CatalogVersion>;
  let positionsRepo: Repo<CatalogPosition>;
  let discountsRepo: Repo<CatalogDiscount>;
  let tradesRepo: Repo<TradeConfig>;
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    versionsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((x) => Promise.resolve(x)),
      create: jest.fn().mockImplementation((x) => x),
      count: jest.fn().mockResolvedValue(0),
    };

    positionsRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((x) => x),
      count: jest.fn().mockResolvedValue(1),
    };

    discountsRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((x) => x),
    };

    tradesRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === CatalogVersion) return versionsRepo;
            if (entity === CatalogPosition) return positionsRepo;
            if (entity === CatalogDiscount) return discountsRepo;
            return versionsRepo;
          },
          query: jest.fn().mockResolvedValue([]),
        }),
      ),
      query: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PricingCatalogsService,
        { provide: getRepositoryToken(CatalogVersion), useValue: versionsRepo },
        { provide: getRepositoryToken(CatalogPosition), useValue: positionsRepo },
        { provide: getRepositoryToken(CatalogDiscount), useValue: discountsRepo },
        { provide: getRepositoryToken(TradeConfig), useValue: tradesRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(PricingCatalogsService);
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('legt einen neuen DRAFT an für Craftsman', async () => {
      versionsRepo.findOne!
        .mockResolvedValueOnce(null)           // kein bestehender DRAFT
        .mockResolvedValueOnce(buildVersion()); // nach dem Save laden

      const result = await service.create(
        { trade: 'HVAC' as any, effectiveFrom: '2026-01-01T00:00:00.000Z' },
        craftsmanUser,
      );

      expect(versionsRepo.save).toHaveBeenCalled();
      expect(result.status).toBe(CatalogVersionStatus.DRAFT);
    });

    it('wirft ConflictException wenn DRAFT bereits existiert', async () => {
      versionsRepo.findOne!.mockResolvedValueOnce(buildVersion());

      await expect(
        service.create(
          { trade: 'HVAC' as any, effectiveFrom: '2026-01-01T00:00:00.000Z' },
          craftsmanUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('gibt Version zurück für den eigenen Craftsman', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion());

      const result = await service.findOne('version-1', craftsmanUser);
      expect(result.id).toBe('version-1');
    });

    it('wirft NotFoundException wenn Version nicht existiert', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.findOne('nicht-vorhanden', craftsmanUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('wirft ForbiddenException wenn Craftsman fremde Version liest', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ craftsmanId: 'craftsman-a' }),
      );

      await expect(
        service.findOne('version-1', otherCraftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('Admin kann jede Version lesen', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ craftsmanId: 'craftsman-a' }),
      );

      const result = await service.findOne('version-1', adminUser);
      expect(result.id).toBe('version-1');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('aktualisiert Positionen eines DRAFTs', async () => {
      versionsRepo.findOne!
        .mockResolvedValueOnce(buildVersion())  // erster load
        .mockResolvedValueOnce(buildVersion()); // nach update

      await service.update(
        'version-1',
        {
          positions: [
            {
              key: 'heizk-01',
              label: 'Heizkörper',
              unit: 'piece' as any,
              netPriceMinorUnits: 15000,
              vatRate: 0.19,
            },
          ],
        },
        craftsmanUser,
      );

      expect(positionsRepo.delete).toHaveBeenCalledWith({ versionId: 'version-1' });
      expect(positionsRepo.save).toHaveBeenCalled();
    });

    it('wirft BadRequestException wenn Version PUBLISHED ist', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
      );

      await expect(
        service.update('version-1', { positions: [] }, craftsmanUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('wirft ForbiddenException wenn Craftsman fremde Version editiert', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ craftsmanId: 'craftsman-a' }),
      );

      await expect(
        service.update('version-1', {}, otherCraftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── publish ───────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('publisht einen DRAFT erfolgreich', async () => {
      const draft = buildVersion();
      versionsRepo.findOne!
        .mockResolvedValueOnce(draft)  // erster load
        .mockResolvedValueOnce(        // nach publish laden
          buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
        );

      // Transaktion mit Positionen und Lock simulieren
      dataSource.transaction = jest.fn(async (cb) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === CatalogVersion) return {
              ...versionsRepo,
              findOne: jest.fn().mockResolvedValue(draft),
              save: jest.fn().mockResolvedValue({
                ...draft,
                status: CatalogVersionStatus.PUBLISHED,
              }),
            };
            if (entity === CatalogPosition) return {
              ...positionsRepo,
              count: jest.fn().mockResolvedValue(1),
            };
            return discountsRepo;
          },
          query: jest.fn().mockResolvedValue([]),
        }),
      );

      const result = await service.publish('version-1', craftsmanUser);
      expect(result.status).toBe(CatalogVersionStatus.PUBLISHED);
    });

    it('wirft BadRequestException wenn Version bereits PUBLISHED ist', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ status: CatalogVersionStatus.PUBLISHED }),
      );

      await expect(
        service.publish('version-1', craftsmanUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('wirft BadRequestException wenn keine Positionen vorhanden', async () => {
      versionsRepo.findOne!.mockResolvedValue(buildVersion());

      dataSource.transaction = jest.fn(async (cb) =>
        cb({
          getRepository: (entity: any) => {
            if (entity === CatalogVersion) return {
              ...versionsRepo,
              findOne: jest.fn().mockResolvedValue(buildVersion()),
              save: jest.fn(),
            };
            if (entity === CatalogPosition) return {
              ...positionsRepo,
              count: jest.fn().mockResolvedValue(0), // keine Positionen!
            };
            return discountsRepo;
          },
          query: jest.fn().mockResolvedValue([]),
        }),
      );

      await expect(
        service.publish('version-1', craftsmanUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('Craftsman A kann Version von Craftsman B nicht publishen', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ craftsmanId: 'craftsman-a' }),
      );

      await expect(
        service.publish('version-1', otherCraftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── quote ─────────────────────────────────────────────────────────────────

  describe('quote', () => {
    it('berechnet ein Angebot korrekt', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({
          positions: [buildPosition()],
          discounts: [],
        }),
      );

      const result = await service.quote(
        'version-1',
        { lines: [{ positionKey: 'heizk-01', quantity: 2 }] },
        craftsmanUser,
      );

      // 2 × 15000 = 30000 netto
      expect(result.totals.netMinorUnits).toBe(30000);
      // 30000 × 0.19 = 5700 MwSt
      expect(result.totals.vatMinorUnits).toBe(5700);
      // 30000 + 5700 = 35700 brutto
      expect(result.totals.grossMinorUnits).toBe(35700);
    });

    it('wirft BadRequestException bei unbekannter Position', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ positions: [], discounts: [] }),
      );

      await expect(
        service.quote(
          'version-1',
          { lines: [{ positionKey: 'existiert-nicht', quantity: 1 }] },
          craftsmanUser,
        ),
      ).rejects.toThrow();
    });

    it('wirft ForbiddenException wenn Craftsman fremde Version quotet', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({ craftsmanId: 'craftsman-a' }),
      );

      await expect(
        service.quote(
          'version-1',
          { lines: [{ positionKey: 'heizk-01', quantity: 1 }] },
          otherCraftsmanUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─── quoteByTrade ──────────────────────────────────────────────────────────

  describe('quoteByTrade', () => {
    it('wirft NotFoundException wenn keine PUBLISHED Version existiert', async () => {
      versionsRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.quoteByTrade(
          'craftsman-a',
          'HVAC',
          { lines: [{ positionKey: 'heizk-01', quantity: 1 }] },
          craftsmanUser,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('berechnet Angebot auf aktiver PUBLISHED Version', async () => {
      versionsRepo.findOne!.mockResolvedValue(
        buildVersion({
          status: CatalogVersionStatus.PUBLISHED,
          positions: [buildPosition()],
          discounts: [],
        }),
      );

      const result = await service.quoteByTrade(
        'craftsman-a',
        'HVAC',
        { lines: [{ positionKey: 'heizk-01', quantity: 1 }] },
        craftsmanUser,
      );

      expect(result.totals.netMinorUnits).toBe(15000);
    });
  });
});