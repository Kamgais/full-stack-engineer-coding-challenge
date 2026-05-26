import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeConfig } from './entities/trade-config.entity';
import { CatalogPosition } from '../pricing-catalogs/entities/catalog-position.entity';
import { CatalogVersion } from '../pricing-catalogs/entities/catalog-version.entity';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TradeConfig,
      CatalogPosition,
      CatalogVersion,
    ]),
  ],
  providers: [TradesService],
  controllers: [TradesController],
  exports: [TradesService],
})
export class TradesModule {}