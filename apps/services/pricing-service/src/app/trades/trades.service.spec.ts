import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ObjectLiteral, Repository } from 'typeorm';
import { TradeConfig } from './entities/trade-config.entity';
import { CatalogVersion, CatalogVersionStatus } from '../pricing-catalogs/entities/catalog-version.entity';
import { CatalogPosition } from '../pricing-catalogs/entities/catalog-position.entity';
import { TradesService } from './trades.service';

type Repo<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

describe('TradesService', () => {
  let service: TradesService;
  let repo: Repo<TradeConfig>;
  let versionsRepo: Repo<CatalogVersion>;
  let positionsRepo: Repo<CatalogPosition>;
  let qb: Record<string, jest.Mock>;

  const tradeConfig = {
    id: '1',
    trade: 'HVAC',
    displayName: 'Heating',
    isActive: true,
    metadata: {},
    pricingSchema: null,
  };

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((x) => Promise.resolve(x)),
    };

    versionsRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    positionsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TradesService,
        { provide: getRepositoryToken(TradeConfig), useValue: repo },
        { provide: getRepositoryToken(CatalogVersion), useValue: versionsRepo },
        { provide: getRepositoryToken(CatalogPosition), useValue: positionsRepo },
      ],
    }).compile();

    service = moduleRef.get(TradesService);
  });

  // ─── list ────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('gibt gemappte Trade-Configs zurück', async () => {
      repo.find!.mockResolvedValue([tradeConfig]);
      const result = await service.list();
      expect(repo.find).toHaveBeenCalledWith({ order: { trade: 'ASC' } });
      expect(result[0].trade).toBe('HVAC');
    });
  });

  // ─── findByCode ───────────────────────────────────────────────────────────

  describe('findByCode', () => {
    it('gibt eine Trade-Config zurück', async () => {
      repo.findOne!.mockResolvedValue(tradeConfig);
      const result = await service.findByCode('HVAC');
      expect(result.trade).toBe('HVAC');
    });

    it('wirft NotFoundException bei unbekanntem Trade', async () => {
      repo.findOne!.mockResolvedValue(null);
      await expect(service.findByCode('UNKNOWN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('aktualisiert displayName', async () => {
      repo.findOne!.mockResolvedValue({ ...tradeConfig });
      const result = await service.update('HVAC', { displayName: 'Neuer Name' });
      expect(repo.save).toHaveBeenCalled();
      expect(result.displayName).toBe('Neuer Name');
    });

    it('aktualisiert pricingSchema wenn keine DRAFT-Positionen existieren', async () => {
      repo.findOne!.mockResolvedValue({ ...tradeConfig });
      versionsRepo.find!.mockResolvedValue([]); // keine DRAFTs

      const result = await service.update('HVAC', {
        pricingSchema: {
          fields: [{ name: 'kw', type: 'number', required: true, min: 1 }],
        },
      });

      expect(result.pricingSchema).toBeDefined();
    });

    it('wirft ConflictException wenn neues Schema DRAFT-Positionen invalidiert', async () => {
      repo.findOne!.mockResolvedValue({ ...tradeConfig });

      // DRAFT Version existiert
      versionsRepo.find!.mockResolvedValue([
        {
          id: 'version-1',
          trade: 'HVAC',
          status: CatalogVersionStatus.DRAFT,
        },
      ]);

      // Position mit ungültigem Attribut für das neue Schema
      qb.getMany!.mockResolvedValue([
        {
          id: 'pos-1',
          versionId: 'version-1',
          key: 'heizk-01',
          tradeAttributes: { kw: 'kein-number' }, // verletzt type: 'number'
        },
      ]);

      await expect(
        service.update('HVAC', {
          pricingSchema: {
            fields: [{ name: 'kw', type: 'number', required: true }],
          },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409-Response enthält Liste der konfliktierenden Positionen', async () => {
      repo.findOne!.mockResolvedValue({ ...tradeConfig });
      versionsRepo.find!.mockResolvedValue([
        { id: 'version-1', trade: 'HVAC', status: CatalogVersionStatus.DRAFT },
      ]);
      qb.getMany!.mockResolvedValue([
        {
          id: 'pos-1',
          versionId: 'version-1',
          key: 'heizk-01',
          tradeAttributes: { kw: 'falsch' },
        },
      ]);

      try {
        await service.update('HVAC', {
          pricingSchema: {
            fields: [{ name: 'kw', type: 'number', required: true }],
          },
        });
        fail('Hätte ConflictException werfen sollen');
      } catch (e: any) {
        expect(e).toBeInstanceOf(ConflictException);
        expect(e.response.conflictingPositions).toHaveLength(1);
        expect(e.response.conflictingPositions[0].positionKey).toBe('heizk-01');
      }
    });

    it('wirft NotFoundException wenn Trade nicht existiert', async () => {
      repo.findOne!.mockResolvedValue(null);
      await expect(
        service.update('UNKNOWN', { displayName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});