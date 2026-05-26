import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, Length } from 'class-validator';
import { PricingSchema } from '../entities/trade-config.entity';

export class UpdateTradeConfigDto {
  @ApiProperty({ required: false, example: 'Heizung & Sanitär' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @ApiProperty({
    required: false,
    description: 'Schema für trade-spezifische Positionsfelder',
    example: {
      fields: [
        { name: 'heatingPowerKw', type: 'number', required: true, min: 1, max: 100 },
      ],
    },
  })
  @IsOptional()
  @IsObject()
  pricingSchema?: PricingSchema;
}