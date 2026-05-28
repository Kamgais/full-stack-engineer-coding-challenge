import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';

import { Craftsman } from './entities/craftsman.entity';
import { CraftsmanTradeAssignment } from './entities/craftsman-trade-assignment.entity';
import { CraftsmenService } from './craftsmen.service';

type Repo<T extends ObjectLiteral> = Partial<Record<keyof Repository<T>, jest.Mock>>;

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
  craftsmanId: 'partner-craftsman-id',
};

const otherCraftsmanUser: JwtPayload = {
  ...craftsmanUser,
  craftsmanId: 'other-craftsman-id',
};

function buildCraftsman(overrides: Partial<Craftsman> = {}): Craftsman {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'partner-craftsman-id',
    companyName: 'Test GmbH',
    email: null,
    phone: null,
    vatNumber: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    country: 'Germany',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    tradeAssignments: [],
    ...overrides,
  } as Craftsman;
}

describe('CraftsmenService', () => {
  let service: CraftsmenService;
  let repo: Repo<Craftsman>;
  let assignments: Repo<CraftsmanTradeAssignment>;
  let qb: { [key: string]: jest.Mock };

  beforeEach(async () => {
    qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[buildCraftsman()], 1]),
    };
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      create: jest.fn().mockImplementation((x: Craftsman) => x),
    };
    assignments = {
      save: jest.fn(),
      create: jest.fn().mockImplementation((x: CraftsmanTradeAssignment) => x),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb({
          getRepository: (entity: unknown) =>
            entity === Craftsman ? (repo as unknown as Repository<Craftsman>) : (assignments as unknown as Repository<CraftsmanTradeAssignment>),
        }),
      ),
    } as unknown as DataSource;

    const moduleRef = await Test.createTestingModule({
      providers: [
        CraftsmenService,
        { provide: getRepositoryToken(Craftsman), useValue: repo },
        { provide: getRepositoryToken(CraftsmanTradeAssignment), useValue: assignments },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(CraftsmenService);
  });

  describe('list', () => {
    it('returns paginated results for admin', async () => {
      const result = await service.list({ page: 1, pageSize: 20 }, adminUser);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('filters list by company name when q is set', async () => {
      await service.list({ q: 'Müller', page: 1, pageSize: 20 }, adminUser);
      expect(qb.andWhere).toHaveBeenCalledWith('c.companyName ILIKE :q', { q: '%Müller%' });
    });

    it('scopes list to own craftsmanId for CRAFTSMAN role', async () => {
      await service.list({ page: 1, pageSize: 20 }, craftsmanUser);
      expect(qb.andWhere).toHaveBeenCalledWith('c.id = :id', { id: 'partner-craftsman-id' });
    });

    it('returns empty list when CRAFTSMAN has no craftsmanId', async () => {
      const result = await service.list({}, { ...craftsmanUser, craftsmanId: null });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns a craftsman for admin', async () => {
      repo.findOne!.mockResolvedValue(buildCraftsman());
      const result = await service.findOne('partner-craftsman-id', adminUser);
      expect(result.id).toBe('partner-craftsman-id');
    });

    it('throws NotFoundException when craftsman does not exist', async () => {
      repo.findOne!.mockResolvedValue(null);
      await expect(service.findOne('partner-craftsman-id', adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when CRAFTSMAN reads another craftsman', async () => {
      await expect(
        service.findOne('partner-craftsman-id', otherCraftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows CRAFTSMAN to read their own record', async () => {
      repo.findOne!.mockResolvedValue(buildCraftsman());
      const result = await service.findOne('partner-craftsman-id', craftsmanUser);
      expect(result.id).toBe('partner-craftsman-id');
    });
  });

  describe('create', () => {
    it('rejects create for CRAFTSMAN role', async () => {
      await expect(
        service.create({ companyName: 'New' }, craftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('persists a craftsman and its trade assignments inside a transaction', async () => {
      repo.findOne!.mockResolvedValue(buildCraftsman({ id: 'new-id' }));
      repo.save!.mockImplementation((x: Craftsman) => Promise.resolve({ ...x, id: 'new-id' }));

      const result = await service.create(
        { companyName: 'New', trades: ['HVAC', 'WINDOWS'] },
        adminUser,
      );

      expect(repo.save).toHaveBeenCalled();
      expect(assignments.save).toHaveBeenCalledWith([
        expect.objectContaining({ trade: 'HVAC', isActive: true }),
        expect.objectContaining({ trade: 'WINDOWS', isActive: true }),
      ]);
      expect(result.id).toBe('new-id');
    });

    it('rejects duplicate trade codes in payload', async () => {
      repo.save!.mockImplementation((x: Craftsman) => Promise.resolve({ ...x, id: 'new-id' }));
      await expect(
        service.create(
          { companyName: 'New', trades: ['HVAC', 'HVAC'] },
          adminUser,
        ),
      ).rejects.toThrow(/Duplicate trade codes/);
    });
  });

  describe('update', () => {
    it('updates a single field', async () => {
      repo.findOne!.mockResolvedValueOnce(buildCraftsman()).mockResolvedValueOnce(
        buildCraftsman({ companyName: 'Renamed' }),
      );
      repo.save!.mockResolvedValue(undefined);
      const result = await service.update(
        'partner-craftsman-id',
        { companyName: 'Renamed' },
        adminUser,
      );
      expect(result.companyName).toBe('Renamed');
    });

    it('throws ForbiddenException when CRAFTSMAN updates another craftsman', async () => {
      await expect(
        service.update('partner-craftsman-id', { companyName: 'X' }, otherCraftsmanUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('rejects delete for CRAFTSMAN role', async () => {
      await expect(service.remove('any', craftsmanUser)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when delete affects 0 rows', async () => {
      repo.delete!.mockResolvedValue({ affected: 0 });
      await expect(service.remove('missing', adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
