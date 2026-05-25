import { ApiProperty } from '@nestjs/swagger';
import { CatalogVersion, CatalogVersionStatus } from '../entities/catalog-version.entity';
import { CatalogPosition } from '../entities/catalog-position.entity';
import { CatalogDiscount } from '../entities/catalog-discount.entity';

export class CatalogPositionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() unit: string;
  @ApiProperty() netPriceMinorUnits: number;
  @ApiProperty() vatRate: number;
  @ApiProperty({ nullable: true }) minQuantity: number | null;
  @ApiProperty({ nullable: true }) maxQuantity: number | null;
  @ApiProperty() tradeAttributes: Record<string, unknown>;
  @ApiProperty() surcharges: unknown[];

  static from(p: CatalogPosition): CatalogPositionResponseDto {
    return {
      id: p.id,
      key: p.key,
      label: p.label,
      unit: p.unit,
      netPriceMinorUnits: p.netPriceMinorUnits,
      vatRate: Number(p.vatRate),
      minQuantity: p.minQuantity ? Number(p.minQuantity) : null,
      maxQuantity: p.maxQuantity ? Number(p.maxQuantity) : null,
      tradeAttributes: p.tradeAttributes,
      surcharges: p.surcharges,
    };
  }
}

export class CatalogDiscountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() key: string;
  @ApiProperty() label: string;
  @ApiProperty() type: string;
  @ApiProperty() value: number;
  @ApiProperty({ nullable: true }) cap: number | null;
  @ApiProperty() appliesTo: unknown;

  static from(d: CatalogDiscount): CatalogDiscountResponseDto {
    return {
      id: d.id,
      key: d.key,
      label: d.label,
      type: d.type,
      value: Number(d.value),
      cap: d.cap,
      appliesTo: d.appliesTo,
    };
  }
}

export class CatalogVersionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() craftsmanId: string;
  @ApiProperty() trade: string;
  @ApiProperty({ enum: CatalogVersionStatus }) status: CatalogVersionStatus;
  @ApiProperty() effectiveFrom: string;
  @ApiProperty({ nullable: true }) publishedBy: string | null;
  @ApiProperty({ nullable: true }) publishedAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
  @ApiProperty({ type: [CatalogPositionResponseDto] }) positions: CatalogPositionResponseDto[];
  @ApiProperty({ type: [CatalogDiscountResponseDto] }) discounts: CatalogDiscountResponseDto[];

  static from(v: CatalogVersion): CatalogVersionResponseDto {
    return {
      id: v.id,
      craftsmanId: v.craftsmanId,
      trade: v.trade,
      status: v.status,
      effectiveFrom: v.effectiveFrom.toISOString(),
      publishedBy: v.publishedBy,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
      positions: (v.positions ?? []).map(CatalogPositionResponseDto.from),
      discounts: (v.discounts ?? []).map(CatalogDiscountResponseDto.from),
    };
  }
}