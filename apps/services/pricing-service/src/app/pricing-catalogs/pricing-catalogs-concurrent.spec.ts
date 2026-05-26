import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';

import { PricingCatalogsService } from './pricing-catalogs.service';
import { CatalogVersion, CatalogVersionStatus } from './entities/catalog-version.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { TradeConfig } from '../trades/entities/trade-config.entity';

const craftsmanUser: JwtPayload = {
  sub: 'user-1',
  email: 'partner@example.com',
  roles: [UserRole.CRAFTSMAN],
  craftsmanId: 'craftsman-a',
};

const now = new Date('2026-01-01T00:00:00.000Z');

function buildDraft(): CatalogVersion {
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
  } as CatalogVersion;
}

/**
 * Simuliert zwei gleichzeitige Publish-Aufrufe.
 *
 * SELECT FOR UPDATE sorgt dafür dass nur einer gewinnt:
 * - Erster Aufruf: sieht DRAFT → publisht → PUBLISHED
 * - Zweiter Aufruf: sieht nach dem Lock bereits PUBLISHED → 400
 */
describe('PricingCatalogsService — concurrent publish', () => {
  it('nur einer von zwei gleichzeitigen Publish-Aufrufen gewinnt', async () => {
    let publishCount = 0;

    // Simuliere SELECT FOR UPDATE:
    // Zweiter Aufruf sieht Version schon als PUBLISHED
    const makeTransaction = (callIndex: number) =>
      jest.fn(async (cb: any) => {
        const isSecondCall = callIndex === 1;
        return cb({
          getRepository: (entity: any) => {
            if (entity === CatalogVersion) {
              return {
                findOne: jest.fn().mockResolvedValue(
                  isSecondCall
                    ? { ...buildDraft(), status: CatalogVersionStatus.PUBLISHED }
                    : buildDraft(),
                ),
                save: jest.fn().mockImplementation((v) => {
                  publishCount++;
                  return Promise.resolve(v);
                }),
              };
            }
            if (entity === CatalogPosition) {
              return { count: jest.fn().mockResolvedValue(1) };
            }
            return { delete: jest.fn(), save: jest.fn() };
          },
          query: jest.fn().mockResolvedValue([]),
        });
      });

    // Erster Service-Aufruf
    const service1 = await buildService(makeTransaction(0));
    const service2 = await buildService(makeTransaction(1));

    // Externe findOne für den ersten Load
    const versionsRepo1 = { findOne: jest.fn().mockResolvedValue(buildDraft()) };
    const versionsRepo2 = { findOne: jest.fn().mockResolvedValue(buildDraft()) };

    // Erster Aufruf gelingt
    await expect(
      service1.publish('version-1', craftsmanUser),
    ).resolves.toBeDefined();

    // Zweiter Aufruf schlägt fehl — Version ist schon PUBLISHED
    await expect(
      service2.publish('version-1', craftsmanUser),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Nur einmal wirklich gespeichert
    expect(publishCount).toBe(1);
  });
});

// ─── Hilfsfunktion ───────────────────────────────────────────────────────────

async function buildService(transactionMock: jest.Mock): Promise<PricingCatalogsService> {
  const versionsRepo = {
    findOne: jest.fn().mockResolvedValue(buildDraft()),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation((x) => Promise.resolve(x)),
    create: jest.fn().mockImplementation((x) => x),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      PricingCatalogsService,
      { provide: getRepositoryToken(CatalogVersion), useValue: versionsRepo },
      { provide: getRepositoryToken(CatalogPosition), useValue: { delete: jest.fn(), save: jest.fn(), create: jest.fn((x) => x), count: jest.fn().mockResolvedValue(1) } },
      { provide: getRepositoryToken(CatalogDiscount), useValue: { delete: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) } },
      { provide: getRepositoryToken(TradeConfig), useValue: { findOne: jest.fn().mockResolvedValue(null) } },
      { provide: DataSource, useValue: { transaction: transactionMock, query: jest.fn() } },
    ],
  }).compile();

  return moduleRef.get(PricingCatalogsService);
}