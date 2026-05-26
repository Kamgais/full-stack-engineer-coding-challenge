import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogVersion } from './entities/catalog-version.entity';
import { CatalogPosition } from './entities/catalog-position.entity';
import { CatalogDiscount } from './entities/catalog-discount.entity';
import { TradeConfig } from '../trades/entities/trade-config.entity';

import { PricingCatalogsService } from './pricing-catalogs.service';
import { PricingCatalogsController } from './pricing-catalogs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogVersion,
      CatalogPosition,
      CatalogDiscount,
      TradeConfig,
    ]),
  ],
  providers: [PricingCatalogsService],
  controllers: [PricingCatalogsController],
  exports: [PricingCatalogsService],
})
export class PricingCatalogsModule {}