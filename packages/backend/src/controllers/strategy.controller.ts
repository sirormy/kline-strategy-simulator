import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { StrategyService } from '../services/strategy.service';
import { PluginLoader } from '../extensions/plugin-loader';
import {
  CreateStrategyDto,
  UpdateStrategyDto,
  QueryStrategyDto,
  BacktestStrategyDto,
} from '../dto/strategy.dto';

@Controller('api/strategies')
export class StrategyController {
  private readonly logger = new Logger(StrategyController.name);

  constructor(
    private readonly strategyService: StrategyService,
    private readonly pluginLoader: PluginLoader,
  ) {}

  /**
   * 创建策略
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createStrategy(@Body() createStrategyDto: CreateStrategyDto) {
    try {
      const strategy = await this.strategyService.createStrategy(createStrategyDto);
      return {
        success: true,
        data: strategy,
        message: 'Strategy created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create strategy:', error);
      throw error;
    }
  }

  /**
   * 获取策略列表
   */
  @Get()
  async getStrategies(@Query() query: QueryStrategyDto) {
    try {
      const result = await this.strategyService.getStrategies(query);
      return {
        success: true,
        data: result.strategies,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
        message: 'Strategies retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to get strategies:', error);
      throw error;
    }
  }

  /**
   * 获取单个策略
   */
  @Get(':id')
  async getStrategy(@Param('id') id: string) {
    try {
      const strategy = await this.strategyService.getStrategy(id);
      return {
        success: true,
        data: strategy,
        message: 'Strategy retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get strategy ${id}:`, error);
      throw error;
    }
  }

  /**
   * 更新策略
   */
  @Put(':id')
  async updateStrategy(
    @Param('id') id: string,
    @Body() updateStrategyDto: UpdateStrategyDto,
  ) {
    try {
      const strategy = await this.strategyService.updateStrategy(id, updateStrategyDto);
      return {
        success: true,
        data: strategy,
        message: 'Strategy updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update strategy ${id}:`, error);
      throw error;
    }
  }

  /**
   * 删除策略
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStrategy(@Param('id') id: string) {
    try {
      await this.strategyService.deleteStrategy(id);
      return {
        success: true,
        message: 'Strategy deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to delete strategy ${id}:`, error);
      throw error;
    }
  }

  /**
   * 获取可用策略类型
   */
  @Get('types/available')
  async getAvailableStrategyTypes() {
    try {
      const types = this.strategyService.getAvailableStrategyTypes();
      return {
        success: true,
        data: types,
        message: 'Available strategy types retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to get available strategy types:', error);
      throw error;
    }
  }

  /**
   * 获取策略元数据
   */
  @Get('types/:type/metadata')
  async getStrategyMetadata(@Param('type') type: string) {
    try {
      const metadata = this.strategyService.getStrategyMetadata(type);
      if (!metadata) {
        return {
          success: false,
          message: `Strategy type '${type}' not found`,
        };
      }

      return {
        success: true,
        data: metadata,
        message: 'Strategy metadata retrieved successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to get metadata for strategy type ${type}:`, error);
      throw error;
    }
  }

  /**
   * 验证策略参数
   */
  @Post('types/:type/validate')
  async validateStrategyParameters(
    @Param('type') type: string,
    @Body() parameters: any,
  ) {
    try {
      const validation = this.strategyService.validateStrategyParameters(type, parameters);
      return {
        success: validation.isValid,
        data: {
          isValid: validation.isValid,
          errors: validation.errors.map(error => ({
            parameter: error.parameterName,
            message: error.message,
            expectedType: error.expectedType,
            actualValue: error.actualValue,
          })),
          warnings: validation.warnings,
        },
        message: validation.isValid ? 'Parameters are valid' : 'Parameter validation failed',
      };
    } catch (error) {
      this.logger.error(`Failed to validate parameters for strategy type ${type}:`, error);
      throw error;
    }
  }

  /**
   * 执行策略回测
   */
  @Post(':id/backtest')
  async runBacktest(
    @Param('id') id: string,
    @Body() backtestDto: Omit<BacktestStrategyDto, 'strategyId'>,
  ) {
    try {
      const result = await this.strategyService.runBacktest({
        ...backtestDto,
        strategyId: id,
      });

      return {
        success: true,
        data: result,
        message: 'Backtest completed successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to run backtest for strategy ${id}:`, error);
      throw error;
    }
  }

  /**
   * 获取插件信息
   */
  @Get('plugins/info')
  async getPluginInfo() {
    try {
      const plugins = this.pluginLoader.getLoadedPlugins();
      const stats = this.pluginLoader.getStats();

      return {
        success: true,
        data: {
          plugins,
          stats,
        },
        message: 'Plugin information retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to get plugin info:', error);
      throw error;
    }
  }

  /**
   * 重新加载插件
   */
  @Post('plugins/reload')
  async reloadPlugins() {
    try {
      await this.pluginLoader.loadAllPlugins();
      const stats = this.pluginLoader.getStats();

      return {
        success: true,
        data: stats,
        message: 'Plugins reloaded successfully',
      };
    } catch (error) {
      this.logger.error('Failed to reload plugins:', error);
      throw error;
    }
  }

  /**
   * 重新加载特定插件
   */
  @Post('plugins/:path/reload')
  async reloadPlugin(@Param('path') pluginPath: string) {
    try {
      // URL解码路径
      const decodedPath = decodeURIComponent(pluginPath);
      const success = await this.pluginLoader.reloadPlugin(decodedPath);

      return {
        success,
        message: success 
          ? 'Plugin reloaded successfully' 
          : 'Failed to reload plugin',
      };
    } catch (error) {
      this.logger.error(`Failed to reload plugin ${pluginPath}:`, error);
      throw error;
    }
  }

  /**
   * 获取策略统计信息
   */
  @Get('stats/overview')
  async getStrategyStats() {
    try {
      // 这里可以添加更多统计信息的逻辑
      const availableTypes = this.strategyService.getAvailableStrategyTypes();
      const pluginStats = this.pluginLoader.getStats();

      const stats = {
        totalStrategyTypes: availableTypes.length,
        strategiesByCategory: availableTypes.reduce((acc, type) => {
          acc[type.category] = (acc[type.category] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number }),
        pluginStats,
      };

      return {
        success: true,
        data: stats,
        message: 'Strategy statistics retrieved successfully',
      };
    } catch (error) {
      this.logger.error('Failed to get strategy stats:', error);
      throw error;
    }
  }
}