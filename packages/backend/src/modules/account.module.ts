import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { AccountController } from '../controllers/account.controller';

// Services
import { AccountService } from '../services/account.service';
import { TradingService } from '../services/trading.service';
import { PNLCalculatorService } from '../services/pnl-calculator.service';
import { PNLMonitorService } from '../services/pnl-monitor.service';

// Repositories
import { AccountRepository } from '../repositories/account.repository';
import { PositionRepository } from '../repositories/position.repository';
import { TradeOrderRepository } from '../repositories/trade-order.repository';

// Schemas
import { Account, AccountSchema } from '../schemas/account.schema';
import { Position, PositionSchema } from '../schemas/position.schema';
import { TradeOrder, TradeOrderSchema } from '../schemas/trade-order.schema';

// Import other required modules
import { MarketDataModule } from './market-data.module';

@Module({
  imports: [
    // MongoDB schemas
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: Position.name, schema: PositionSchema },
      { name: TradeOrder.name, schema: TradeOrderSchema },
    ]),
    
    // Schedule module for PNL monitoring
    ScheduleModule.forRoot(),
    
    // Market data module for price information
    MarketDataModule,
  ],
  controllers: [
    AccountController,
  ],
  providers: [
    // Services
    AccountService,
    TradingService,
    PNLCalculatorService,
    PNLMonitorService,
    
    // Repositories
    AccountRepository,
    PositionRepository,
    TradeOrderRepository,
  ],
  exports: [
    // Export services for use in other modules
    AccountService,
    TradingService,
    PNLCalculatorService,
    PNLMonitorService,
    
    // Export repositories for use in other modules
    AccountRepository,
    PositionRepository,
    TradeOrderRepository,
  ],
})
export class AccountModule {}