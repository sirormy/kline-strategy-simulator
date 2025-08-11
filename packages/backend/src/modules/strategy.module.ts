import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StrategyService } from '../services/strategy.service';
import { StrategyController } from '../controllers/strategy.controller';
import { StrategyRegistry } from '../extensions/strategy-registry';
import { PluginLoader } from '../extensions/plugin-loader';
import { Strategy, StrategySchema } from '../schemas/strategy.schema';
import { KlineData, KlineDataSchema } from '../schemas/kline-data.schema';
import { StrategyRepository } from '../repositories/strategy.repository';
import { KlineDataRepository } from '../repositories/kline-data.repository';
import { DCAStrategy } from '../extensions/strategies/dca-strategy';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Strategy.name, schema: StrategySchema },
      { name: KlineData.name, schema: KlineDataSchema },
    ]),
  ],
  controllers: [StrategyController],
  providers: [
    StrategyService,
    StrategyRegistry,
    PluginLoader,
    StrategyRepository,
    KlineDataRepository,
  ],
  exports: [
    StrategyService,
    StrategyRegistry,
    PluginLoader,
  ],
})
export class StrategyModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly pluginLoader: PluginLoader,
  ) {}

  async onModuleInit(): Promise<void> {
    // 注册内置策略
    await this.registerBuiltinStrategies();

    // 初始化插件加载器
    await this.pluginLoader.initialize({
      pluginDirectories: [
        'plugins',
        'src/plugins',
        'dist/plugins',
      ],
      enableHotReload: process.env.NODE_ENV === 'development',
      allowedFileExtensions: ['.js', '.mjs'],
      securityPolicy: {
        allowFileSystemAccess: false,
        allowNetworkAccess: false,
        allowNativeModules: false,
        allowedModules: [],
        blockedModules: ['fs', 'child_process', 'cluster'],
        maxExecutionTime: 5000,
        maxMemoryUsage: 50 * 1024 * 1024, // 50MB
        enableSandbox: true,
        trustedPlugins: [],
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    // 清理插件加载器
    await this.pluginLoader.destroy();
  }

  /**
   * 注册内置策略
   */
  private async registerBuiltinStrategies(): Promise<void> {
    try {
      // 注册DCA策略
      this.strategyRegistry.register('DCA', DCAStrategy);
      
      console.log('Built-in strategies registered successfully');
    } catch (error) {
      console.error('Failed to register built-in strategies:', error);
    }
  }
}