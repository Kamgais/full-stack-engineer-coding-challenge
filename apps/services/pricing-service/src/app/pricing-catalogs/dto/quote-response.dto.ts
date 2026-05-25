import { ApiProperty } from '@nestjs/swagger';

export class QuoteLineResponseDto {
  @ApiProperty() positionKey: string;
  @ApiProperty() label: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unit: string;
  @ApiProperty() baseNetMinorUnits: number;
  @ApiProperty() surchargesTotalMinorUnits: number;
  @ApiProperty() lineNetMinorUnits: number;
  @ApiProperty() discountsTotalMinorUnits: number;
  @ApiProperty() finalNetMinorUnits: number;
  @ApiProperty() vatRate: number;
  @ApiProperty() vatMinorUnits: number;
  @ApiProperty() grossMinorUnits: number;
}

export class VatGroupDto {
  @ApiProperty() vatRate: number;
  @ApiProperty() netMinorUnits: number;
  @ApiProperty() vatMinorUnits: number;
  @ApiProperty() grossMinorUnits: number;
}

export class QuoteTotalsDto {
  @ApiProperty() netMinorUnits: number;
  @ApiProperty() discountsTotalMinorUnits: number;
  @ApiProperty() vatMinorUnits: number;
  @ApiProperty() grossMinorUnits: number;
}

export class QuoteResponseDto {
  @ApiProperty({ type: [QuoteLineResponseDto] }) lines: QuoteLineResponseDto[];
  @ApiProperty({ type: [VatGroupDto] }) vatGroups: VatGroupDto[];
  @ApiProperty() totals: QuoteTotalsDto;
}