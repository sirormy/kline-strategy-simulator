import { Module } from '@nestjs/common';
import { PluginController } from '../controllers/plugin.controller';
import { PluginService } from '../services/plugin.service';
import { StrategyRegistry } from '../extensions/strategy-registry';
import { IndicatorRegistry } from '../extensions/indicator-registry';

@Module({
  controllers: [PluginController],
  providers: [
    PluginService,
    StrategyRegistry,
    IndicatorRegistry,
  ],
  exports: [
    PluginService,
    StrategyRegistry,
    IndicatorRegistry,
  ],
})
export class PluginModule {}