import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '@sandbox/auth';
import { JwtPayload, UserRole } from '@sandbox/types';

import { PricingCatalogsService } from './pricing-catalogs.service';
import { CreateCatalogVersionDto } from './dto/create-catalog-version.dto';
import { UpdateCatalogVersionDto } from './dto/update-catalog-version.dto';
import { QueryCatalogVersionsDto } from './dto/query-catalog-versions.dto';
import { CatalogVersionResponseDto } from './dto/catalog-version-response.dto';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';

@ApiTags('Pricing Catalogs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing-catalogs')
export class PricingCatalogsController {
  constructor(private readonly service: PricingCatalogsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Alle Katalog-Versionen auflisten' })
  @ApiResponse({ status: 200, type: [CatalogVersionResponseDto] })
  list(
    @Query() query: QueryCatalogVersionsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto[]> {
    return this.service.list(query, user);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Neuen DRAFT anlegen' })
  @ApiResponse({ status: 201, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 409, description: 'DRAFT existiert bereits' })
  create(
    @Body() dto: CreateCatalogVersionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Eine Katalog-Version laden' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 404, description: 'Version nicht gefunden' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'DRAFT bearbeiten (Positionen + Rabatte)' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Version ist bereits PUBLISHED' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogVersionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.update(id, dto, user);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'DRAFT veröffentlichen → PUBLISHED' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: CatalogVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Bereits veröffentlicht oder keine Positionen' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CatalogVersionResponseDto> {
    return this.service.publish(id, user);
  }

  @Post(':id/quote')
  @Roles(UserRole.ADMIN, UserRole.CRAFTSMAN)
  @ApiOperation({ summary: 'Angebot auf einer bestimmten Version berechnen' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, type: QuoteResponseDto })
  @ApiResponse({ status: 400, description: 'Ungültige Positionen oder Mengen' })
  quote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuoteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<QuoteResponseDto> {
    return this.service.quote(id, dto, user);
  }
}