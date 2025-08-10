import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BinanceApiService } from '../services/binance-api.service';
import { BinanceWebSocketService } from '../services/binance-websocket.service';
import { MarketDataService } from '../services/market-data.service';
import { KlineDataRepository } from '../repositories/kline-data.repository';
import { KlineData, KlineDataSchema } from '../schemas/kline-data.schema';
import { MarketDataController } from '../controllers/market-data.controller';
import binanceConfig from '../config/binance.config';

@Module({
  imports: [
    ConfigModule.forFeature(binanceConfig),
    MongooseModule.forFeature([
      { name: KlineData.name, schema: KlineDataSchema },
    ]),
  ],
  controllers: [MarketDataController],
  providers: [
    BinanceApiService,
    BinanceWebSocketService,
    MarketDataService,
    KlineDataRepository,
  ],
  exports: [
    BinanceApiService,
    BinanceWebSocketService,
    MarketDataService,
  ],
})
export class MarketDataModule {}