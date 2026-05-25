import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteLineDto {
  @ApiProperty({ example: 'heizk-01' })
  @IsString()
  positionKey: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ required: false, example: ['notfall'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  appliedSurchargeKeys?: string[];
}

export class QuoteRequestDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
}