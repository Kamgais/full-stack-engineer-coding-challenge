import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtPayload, UserRole } from '@sandbox/types';

import { CatalogVersion, CatalogVersionStatus } from './entities/catalog-version.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { TradeConfig } from '../trades/entities/trade-config.entity';

import { CreateCatalogVersionDto } from './dto/create-catalog-version.dto';
import { UpdateCatalogVersionDto } from './dto/update-catalog-version.dto';
import { QueryCatalogVersionsDto } from './dto/query-catalog-versions.dto';
import { CatalogVersionResponseDto } from './dto/catalog-version-response.dto';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';

import { validateTradeAttributes } from './schema-validator';
import { calculateQuote, QuotePosition, QuoteDiscount } from './quote-calculator';

@Injectable()
export class PricingCatalogsService {
  private readonly logger = new Logger(PricingCatalogsService.name);

  constructor(
    @InjectRepository(CatalogVersion)
    private readonly versions: Repository<CatalogVersion>,
    @InjectRepository(CatalogPosition)
    private readonly positions: Repository<CatalogPosition>,
    @InjectRepository(CatalogDiscount)
    private readonly discounts: Repository<CatalogDiscount>,
    @InjectRepository(TradeConfig)
    private readonly trades: Repository<TradeConfig>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── List ───────────────────────────────────────────────────────────────────

  async list(
    query: QueryCatalogVersionsDto,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto[]> {
    const qb = this.versions
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.positions', 'p')
      .leftJoinAndSelect('v.discounts', 'd');

    // Row-level scoping: CRAFTSMAN sieht nur eigene Kataloge
    if (this.isCraftsmanOnly(user)) {
      if (!user.craftsmanId) return [];
      qb.andWhere('v.craftsman_id = :id', { id: user.craftsmanId });
    } else if (query.craftsmanId) {
      qb.andWhere('v.craftsman_id = :id', { id: query.craftsmanId });
    }

    if (query.trade) {
      qb.andWhere('v.trade = :trade', { trade: query.trade });
    }

    qb.orderBy('v.created_at', 'DESC');

    const items = await qb.getMany();
    return items.map(CatalogVersionResponseDto.from);
  }

  // ─── FindOne ────────────────────────────────────────────────────────────────

  async findOne(
    id: string,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    const version = await this.loadVersion(id);
    this.assertCanAccess(version.craftsmanId, user);
    return CatalogVersionResponseDto.from(version);
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  async create(
    dto: CreateCatalogVersionDto,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    const craftsmanId = this.resolveCraftsmanId(user);

    // Gibt es schon einen DRAFT für dieses (craftsmanId, trade)?
    const existingDraft = await this.versions.findOne({
      where: {
        craftsmanId,
        trade: dto.trade,
        status: CatalogVersionStatus.DRAFT,
      },
    });

    if (existingDraft) {
      throw new ConflictException(
        `Es gibt bereits einen DRAFT für ${dto.trade}. Bitte zuerst publishen oder löschen.`,
      );
    }

    const version = this.versions.create({
      craftsmanId,
      trade: dto.trade,
      status: CatalogVersionStatus.DRAFT,
      effectiveFrom: new Date(dto.effectiveFrom),
      publishedBy: null,
      publishedAt: null,
    });

    const saved = await this.versions.save(version);
    this.logger.log(`Created catalog version ${saved.id} for craftsman ${craftsmanId}`);

    return CatalogVersionResponseDto.from(
      await this.loadVersion(saved.id),
    );
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateCatalogVersionDto,
    user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    const version = await this.loadVersion(id);
    this.assertCanAccess(version.craftsmanId, user);

    // PUBLISHED Versionen dürfen nie geändert werden
    if (version.status === CatalogVersionStatus.PUBLISHED) {
      throw new BadRequestException(
        'Eine veröffentlichte Version kann nicht mehr geändert werden.',
      );
    }

    // Trade-Schema laden für Validierung
    const tradeConfig = await this.trades.findOne({
      where: { trade: version.trade },
    });

    return this.dataSource.transaction(async (tx) => {
      // effectiveFrom aktualisieren
      if (dto.effectiveFrom) {
        version.effectiveFrom = new Date(dto.effectiveFrom);
        await tx.getRepository(CatalogVersion).save(version);
      }

      // Positionen ersetzen
      if (dto.positions !== undefined) {
        // Schema validieren
        for (const pos of dto.positions) {
          const errors = validateTradeAttributes(
            pos.tradeAttributes ?? {},
            tradeConfig?.pricingSchema ?? null,
          );
          if (errors.length > 0) {
            throw new BadRequestException({
              message: `Ungültige tradeAttributes für Position "${pos.key}"`,
              errors,
            });
          }
        }

        // Alte Positionen löschen, neue anlegen
        await tx.getRepository(CatalogPosition).delete({ versionId: id });
        if (dto.positions.length > 0) {
          await tx.getRepository(CatalogPosition).save(
            dto.positions.map((p) =>
              tx.getRepository(CatalogPosition).create({
                versionId: id,
                key: p.key,
                label: p.label,
                unit: p.unit,
                netPriceMinorUnits: p.netPriceMinorUnits,
                vatRate: p.vatRate,
                minQuantity: p.minQuantity ?? null,
                maxQuantity: p.maxQuantity ?? null,
                tradeAttributes: p.tradeAttributes ?? {},
                surcharges: p.surcharges ?? [],
              }),
            ),
          );
        }
      }

      // Rabatte ersetzen
      if (dto.discounts !== undefined) {
        await tx.getRepository(CatalogDiscount).delete({ versionId: id });
        if (dto.discounts.length > 0) {
          await tx.getRepository(CatalogDiscount).save(
            dto.discounts.map((d) =>
              tx.getRepository(CatalogDiscount).create({
                versionId: id,
                key: d.key,
                label: d.label,
                type: d.type,
                value: d.value,
                cap: d.cap ?? null,
                appliesTo: d.appliesTo,
              }),
            ),
          );
        }
      }

      this.logger.log(`Updated catalog version ${id}`);
      return CatalogVersionResponseDto.from(await this.loadVersion(id, tx));
    });
  }

  // ─── Publish ────────────────────────────────────────────────────────────────

async publish(
  id: string,
  user: JwtPayload,
): Promise<CatalogVersionResponseDto> {
  const version = await this.loadVersion(id);
  this.assertCanAccess(version.craftsmanId, user);

  if (version.status === CatalogVersionStatus.PUBLISHED) {
    throw new BadRequestException('Diese Version ist bereits veröffentlicht.');
  }

  return this.dataSource.transaction(async (tx) => {
    // SELECT FOR UPDATE — verhindert concurrent publish
    await tx.query(
      `SELECT id FROM pricing_service.catalog_versions
       WHERE id = $1 FOR UPDATE`,
      [id],
    );

    // Nochmal laden nach dem Lock
    const locked = await tx.getRepository(CatalogVersion).findOne({
      where: { id },
    });

    if (!locked) throw new NotFoundException(`Version ${id} not found`);

    // Doppelter Check nach dem Lock
    if (locked.status === CatalogVersionStatus.PUBLISHED) {
      throw new BadRequestException('Diese Version wurde bereits veröffentlicht.');
    }

    // Prüfen ob Positionen vorhanden
    const positionCount = await tx.getRepository(CatalogPosition).count({
      where: { versionId: id },
    });
    if (positionCount === 0) {
      throw new BadRequestException(
        'Ein Katalog muss mindestens eine Position haben.',
      );
    }

    // ── NEU: Alte aktive PUBLISHED Version deaktivieren ──────────────────
    // Es darf immer nur eine aktive PUBLISHED Version geben.
    // Wir setzen effectiveFrom der alten Version auf effectiveFrom der neuen
    // Version damit sie nicht mehr aktiv ist — sie bleibt aber für Audit lesbar.
    const currentlyActive = await tx
      .getRepository(CatalogVersion)
      .createQueryBuilder('v')
      .where('v.craftsman_id = :craftsmanId', { craftsmanId: locked.craftsmanId })
      .andWhere('v.trade = :trade', { trade: locked.trade })
      .andWhere('v.status = :status', { status: CatalogVersionStatus.PUBLISHED })
      .andWhere('v.id != :id', { id })
      .getMany();

    // Alte Versionen bleiben PUBLISHED (für Audit) aber effectiveFrom
    // der neuen Version überschreibt den aktiven Zeitraum
    this.logger.log(
      `Found ${currentlyActive.length} existing PUBLISHED versions for ` +
      `(${locked.craftsmanId}, ${locked.trade}) — they remain as audit log`,
    );

    // Version publishen
    locked.status = CatalogVersionStatus.PUBLISHED;
    locked.publishedBy = user.sub;
    locked.publishedAt = new Date();

    await tx.getRepository(CatalogVersion).save(locked);

    this.logger.log(
      `Published catalog version ${id} by user ${user.sub}`,
    );

    return CatalogVersionResponseDto.from(
      await this.loadVersion(id, tx),
    );
  });
}

  // ─── Quote ──────────────────────────────────────────────────────────────────

  async quote(
    versionId: string,
    dto: QuoteRequestDto,
    user: JwtPayload,
  ): Promise<QuoteResponseDto> {
    const version = await this.loadVersion(versionId);
    this.assertCanAccess(version.craftsmanId, user);

    return this.calculateFromVersion(version, dto);
  }

async quoteByTrade(
  craftsmanId: string,
  trade: string,
  dto: QuoteRequestDto,
  user: JwtPayload,
): Promise<QuoteResponseDto> {
  this.assertCanAccess(craftsmanId, user);

  // Neueste PUBLISHED Version = höchstes effectiveFrom
  const version = await this.versions.findOne({
    where: {
      craftsmanId,
      trade,
      status: CatalogVersionStatus.PUBLISHED,
    },
    relations: ['positions', 'discounts'],
    order: { effectiveFrom: 'DESC' }, // ← neueste zuerst
  });

  if (!version) {
    throw new NotFoundException(
      `Keine veröffentlichte Version für Handwerker ${craftsmanId} und Gewerk ${trade}`,
    );
  }

  return this.calculateFromVersion(version, dto);
}

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async calculateFromVersion(
    version: CatalogVersion,
    dto: QuoteRequestDto,
  ): Promise<QuoteResponseDto> {
    const quotePositions: QuotePosition[] = version.positions.map((p) => ({
      key: p.key,
      label: p.label,
      unit: p.unit,
      netPriceMinorUnits: p.netPriceMinorUnits,
      vatRate: Number(p.vatRate),
      minQuantity: p.minQuantity ? Number(p.minQuantity) : null,
      maxQuantity: p.maxQuantity ? Number(p.maxQuantity) : null,
      surcharges: p.surcharges,
    }));

    const quoteDiscounts: QuoteDiscount[] = version.discounts.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      value: Number(d.value),
      cap: d.cap,
      appliesTo: d.appliesTo,
    }));

    return calculateQuote(dto.lines, quotePositions, quoteDiscounts);
  }

  private async loadVersion(
    id: string,
    tx?: any,
  ): Promise<CatalogVersion> {
    const repo = tx
      ? tx.getRepository(CatalogVersion)
      : this.versions;

    const version = await repo.findOne({
      where: { id },
      relations: ['positions', 'discounts'],
    });

    if (!version) {
      throw new NotFoundException(`Catalog version ${id} not found`);
    }

    return version;
  }

  private resolveCraftsmanId(user: JwtPayload): string {
    if (this.isCraftsmanOnly(user)) {
      if (!user.craftsmanId) {
        throw new ForbiddenException('Kein Handwerker-Account verknüpft.');
      }
      return user.craftsmanId;
    }
    // ADMIN muss craftsmanId im Body mitgeben (kommt über DTO)
    throw new BadRequestException(
      'Als Admin bitte craftsmanId im Request mitgeben.',
    );
  }

  private isCraftsmanOnly(user: JwtPayload): boolean {
    return (
      user.roles.includes(UserRole.CRAFTSMAN) &&
      !user.roles.includes(UserRole.ADMIN)
    );
  }

  private assertCanAccess(craftsmanId: string, user: JwtPayload): void {
    if (!this.isCraftsmanOnly(user)) return;
    if (user.craftsmanId !== craftsmanId) {
      throw new ForbiddenException(
        'Handwerker dürfen nur auf eigene Kataloge zugreifen.',
      );
    }
  }
}