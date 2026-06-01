import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TRADE_CODES, TradeCode } from '@sandbox/types';

export class CreateCatalogVersionDto {
  @ApiProperty({
    description: 'Trade-Kategorie für diesen Katalog',
    enum: TRADE_CODES,
    example: 'HVAC',
  })
  @IsString()
  @IsIn(TRADE_CODES)
  trade: TradeCode;

  @ApiProperty({
    description: 'Ab wann diese Version gültig ist',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsDateString()
  effectiveFrom: string;

  @ApiProperty({
    required: false,
    description: 'Optional: ID einer bestehenden Version deren Positionen kopiert werden',
  })
  @IsOptional()
  @IsUUID()
  sourceVersionId?: string;
}