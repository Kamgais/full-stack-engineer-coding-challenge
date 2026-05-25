import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PositionUnit } from '../entities/catalog-position.entity';
import { DiscountType } from '../entities/catalog-discount.entity';

// ─── Surcharge DTO ────────────────────────────────────────────────────────────

export class SurchargeDto {
  @ApiProperty({ example: 'notfall' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Notfall-Aufschlag' })
  @IsString()
  label: string;

  @ApiProperty({ enum: ['flat', 'percent'] })
  @IsEnum(['flat', 'percent'])
  type: 'flat' | 'percent';

  @ApiProperty({ example: 5000, description: 'Cent bei flat, Dezimalzahl bei percent' })
  @IsNumber()
  value: number;
}

// ─── Position DTO ─────────────────────────────────────────────────────────────

export class UpsertPositionDto {
  @ApiProperty({ example: 'heizk-01' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Heizkörper einbauen' })
  @IsString()
  label: string;

  @ApiProperty({ enum: PositionUnit, example: PositionUnit.PIECE })
  @IsEnum(PositionUnit)
  unit: PositionUnit;

  @ApiProperty({ example: 15000, description: 'Nettopreis in Cent' })
  @IsInt()
  @Min(0)
  netPriceMinorUnits: number;

  @ApiProperty({ example: 0.19, description: 'MwSt-Satz z.B. 0.19 = 19%' })
  @IsNumber()
  vatRate: number;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsNumber()
  minQuantity?: number;

  @ApiProperty({ required: false, example: 20 })
  @IsOptional()
  @IsNumber()
  maxQuantity?: number;

  @ApiProperty({
    required: false,
    example: { heatingPowerKw: 5 },
    description: 'Trade-spezifische Attribute — werden gegen pricingSchema validiert',
  })
  @IsOptional()
  @IsObject()
  tradeAttributes?: Record<string, unknown>;

  @ApiProperty({ required: false, type: [SurchargeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurchargeDto)
  surcharges?: SurchargeDto[];
}

// ─── Discount DTO ─────────────────────────────────────────────────────────────

export class UpsertDiscountDto {
  @ApiProperty({ example: 'bulk-10' })
  @IsString()
  key: string;

  @ApiProperty({ example: '10% Mengenrabatt' })
  @IsString()
  label: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type: DiscountType;

  @ApiProperty({ example: 0.1, description: 'Cent bei flat, Dezimalzahl bei percent' })
  @IsNumber()
  value: number;

  @ApiProperty({ required: false, example: 5000, description: 'Max. Rabatt in Cent' })
  @IsOptional()
  @IsInt()
  cap?: number;

  @ApiProperty({
    example: 'subtotal',
    description: '"subtotal" oder { positionKeys: ["key1"] }',
  })
  appliesTo: 'subtotal' | { positionKeys: string[] };
}

// ─── Update DTO ───────────────────────────────────────────────────────────────

export class UpdateCatalogVersionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ required: false, type: [UpsertPositionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPositionDto)
  positions?: UpsertPositionDto[];

  @ApiProperty({ required: false, type: [UpsertDiscountDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertDiscountDto)
  discounts?: UpsertDiscountDto[];
}