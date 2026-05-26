import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradeConfig } from './entities/trade-config.entity';
import { TradeConfigResponseDto } from './dto/trade-config-response.dto';
import { UpdateTradeConfigDto } from './dto/update-trade-config.dto';
import { CatalogPosition } from '../pricing-catalogs/entities/catalog-position.entity';
import { CatalogVersion, CatalogVersionStatus } from '../pricing-catalogs/entities/catalog-version.entity';
import { validateTradeAttributes } from '../pricing-catalogs/schema-validator';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    @InjectRepository(TradeConfig)
    private readonly repo: Repository<TradeConfig>,
    @InjectRepository(CatalogPosition)
    private readonly positions: Repository<CatalogPosition>,
    @InjectRepository(CatalogVersion)
    private readonly versions: Repository<CatalogVersion>,
  ) {}

  async list(): Promise<TradeConfigResponseDto[]> {
    const items = await this.repo.find({ order: { trade: 'ASC' } });
    return items.map(TradeConfigResponseDto.from);
  }

  async findByCode(trade: string): Promise<TradeConfigResponseDto> {
    const found = await this.repo.findOne({ where: { trade } });
    if (!found) {
      throw new NotFoundException(`Trade ${trade} not found`);
    }
    return TradeConfigResponseDto.from(found);
  }

  async update(
    trade: string,
    dto: UpdateTradeConfigDto,
  ): Promise<TradeConfigResponseDto> {
    const config = await this.repo.findOne({ where: { trade } });
    if (!config) {
      throw new NotFoundException(`Trade ${trade} not found`);
    }

    // Wenn pricingSchema geändert wird:
    // Prüfen ob bestehende DRAFT-Positionen das neue Schema verletzen
    if (dto.pricingSchema !== undefined) {
      const conflictingPositions = await this.findConflictingPositions(
        trade,
        dto,
      );

      if (conflictingPositions.length > 0) {
        throw new ConflictException({
          message:
            'Das neue Schema ist inkompatibel mit bestehenden Positionen in aktiven DRAFTs.',
          conflictingPositions,
        });
      }
    }

    // Felder aktualisieren
    if (dto.displayName !== undefined) {
      config.displayName = dto.displayName;
    }
    if (dto.pricingSchema !== undefined) {
      config.pricingSchema = dto.pricingSchema;
    }

    await this.repo.save(config);
    this.logger.log(`Updated trade config for ${trade}`);

    return TradeConfigResponseDto.from(config);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Findet alle DRAFT-Positionen die das neue Schema verletzen würden.
   * Nur DRAFTs werden geprüft — PUBLISHED Versionen sind eingefroren.
   */
  private async findConflictingPositions(
    trade: string,
    dto: UpdateTradeConfigDto,
  ): Promise<{ positionKey: string; versionId: string; errors: string[] }[]> {
    // Alle DRAFT Versionen für dieses Trade finden
    const draftVersions = await this.versions.find({
      where: { trade, status: CatalogVersionStatus.DRAFT },
    });

    if (draftVersions.length === 0) return [];

    const draftVersionIds = draftVersions.map((v) => v.id);

    // Alle Positionen dieser DRAFTs laden
    const allPositions = await this.positions
      .createQueryBuilder('p')
      .where('p.version_id IN (:...ids)', { ids: draftVersionIds })
      .getMany();

    if (allPositions.length === 0) return [];

    // Jede Position gegen das neue Schema validieren
    const conflicts: { positionKey: string; versionId: string; errors: string[] }[] = [];

    for (const position of allPositions) {
      const errors = validateTradeAttributes(
        position.tradeAttributes,
        dto.pricingSchema ?? null,
      );
      if (errors.length > 0) {
        conflicts.push({
          positionKey: position.key,
          versionId: position.versionId,
          errors: errors.map((e) => e.message),
        });
      }
    }

    return conflicts;
  }
}