import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCatalogVersionsDto {
  @ApiProperty({ required: false, description: 'Filter nach Handwerker ID' })
  @IsOptional()
  @IsString()
  craftsmanId?: string;

  @ApiProperty({ required: false, description: 'Filter nach Trade z.B. HVAC' })
  @IsOptional()
  @IsString()
  trade?: string;
}