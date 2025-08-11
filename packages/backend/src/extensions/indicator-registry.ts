import { Injectable, Logger } from '@nestjs/common';
import { BaseIndicator, IndicatorImplementation, IndicatorFactory, IndicatorConfig, IndicatorMetadata } from './base-indicator';

// 指标注册信息
interface IndicatorRegistration {
  type: string;
  implementation: IndicatorImplementation;
  metadata: IndicatorMetadata;
  registeredAt: Date;
  version: string;
}

@Injectable()
export class IndicatorRegistry implements IndicatorFactory {
  private readonly logger = new Logger(IndicatorRegistry.name);
  private readonly indicators = new Map<string, IndicatorRegistration>();

  /**
   * 注册指标
   */
  register(type: string, indicatorClass: IndicatorImplementation): void {
    try {
      // 创建临时实例以获取元数据
      const tempConfig: IndicatorConfig = {
        type,
        period: 14, // 默认周期
        parameters: {},
      };

      const tempInstance = new indicatorClass(tempConfig);
      const metadata = tempInstance.getIndicatorMetadata();

      // 验证元数据
      this.validateMetadata(metadata);

      const registration: IndicatorRegistration = {
        type,
        implementation: indicatorClass,
        metadata,
        registeredAt: new Date(),
        version: metadata.version || '1.0.0',
      };

      this.indicators.set(type, registration);
      this.logger.log(`Indicator registered: ${type} v${registration.version}`);
    } catch (error) {
      this.logger.error(`Failed to register indicator ${type}:`, error);
      throw new Error(`Indicator registration failed: ${error.message}`);
    }
  }

  /**
   * 取消注册指标
   */
  unregister(type: string): boolean {
    const existed = this.indicators.has(type);
    if (existed) {
      this.indicators.delete(type);
      this.logger.log(`Indicator unregistered: ${type}`);
    }
    return existed;
  }

  /**
   * 创建指标实例
   */
  createIndicator(config: IndicatorConfig): BaseIndicator {
    const registration = this.indicators.get(config.type);
    if (!registration) {
      throw new Error(`Indicator type '${config.type}' not found. Available types: ${this.getAvailableTypes().join(', ')}`);
    }

    try {
      const indicator = new registration.implementation(config);
      this.logger.debug(`Indicator instance created: ${config.type}`);
      return indicator;
    } catch (error) {
      this.logger.error(`Failed to create indicator instance for ${config.type}:`, error);
      throw new Error(`Indicator creation failed: ${error.message}`);
    }
  }

  /**
   * 获取可用指标列表
   */
  getAvailableIndicators(): IndicatorMetadata[] {
    return Array.from(this.indicators.values()).map(reg => reg.metadata);
  }

  /**
   * 获取可用指标类型列表
   */
  getAvailableTypes(): string[] {
    return Array.from(this.indicators.keys());
  }

  /**
   * 检查指标是否支持
   */
  isIndicatorSupported(type: string): boolean {
    return this.indicators.has(type);
  }

  /**
   * 获取指标元数据
   */
  getIndicatorMetadata(type: string): IndicatorMetadata | null {
    const registration = this.indicators.get(type);
    return registration ? registration.metadata : null;
  }

  /**
   * 获取指标注册信息
   */
  getIndicatorRegistration(type: string): IndicatorRegistration | null {
    return this.indicators.get(type) || null;
  }

  /**
   * 获取所有注册信息
   */
  getAllRegistrations(): IndicatorRegistration[] {
    return Array.from(this.indicators.values());
  }

  /**
   * 按类别获取指标
   */
  getIndicatorsByCategory(category: string): IndicatorMetadata[] {
    return this.getAvailableIndicators().filter(
      metadata => metadata.category === category
    );
  }

  /**
   * 按图表类型获取指标
   */
  getIndicatorsByChartType(chartType: 'overlay' | 'separate'): IndicatorMetadata[] {
    return this.getAvailableIndicators().filter(
      metadata => metadata.chartType === chartType
    );
  }

  /**
   * 按输出类型获取指标
   */
  getIndicatorsByOutputType(outputType: 'single' | 'multiple'): IndicatorMetadata[] {
    return this.getAvailableIndicators().filter(
      metadata => metadata.outputType === outputType
    );
  }

  /**
   * 验证指标参数
   */
  validateIndicatorParameters(type: string, parameters: any): boolean {
    const registration = this.indicators.get(type);
    if (!registration) {
      return false;
    }

    try {
      // 创建临时配置进行验证
      const tempConfig: IndicatorConfig = {
        type,
        period: parameters.period || 14,
        parameters,
      };

      const tempInstance = new registration.implementation(tempConfig);
      return tempInstance.validateParameters(parameters);
    } catch (error) {
      this.logger.warn(`Parameter validation failed for ${type}:`, error);
      return false;
    }
  }

  /**
   * 批量计算指标
   */
  async calculateMultipleIndicators(
    configs: IndicatorConfig[],
    data: any[]
  ): Promise<{ [type: string]: any }> {
    const results: { [type: string]: any } = {};

    for (const config of configs) {
      try {
        const indicator = this.createIndicator(config);
        const result = await indicator.calculate(data);
        results[config.type] = result;
      } catch (error) {
        this.logger.error(`Failed to calculate indicator ${config.type}:`, error);
        results[config.type] = null;
      }
    }

    return results;
  }

  /**
   * 获取指标依赖关系
   */
  getIndicatorDependencies(type: string): string[] {
    // 这里可以扩展以支持指标间的依赖关系
    // 例如，MACD依赖于EMA
    const dependencies: { [key: string]: string[] } = {
      'MACD': ['EMA'],
      'BOLLINGER_BANDS': ['SMA'],
      'STOCH_RSI': ['RSI'],
    };

    return dependencies[type] || [];
  }

  /**
   * 获取指标统计信息
   */
  getRegistryStats(): {
    totalIndicators: number;
    categoriesCount: { [category: string]: number };
    chartTypesCount: { [chartType: string]: number };
    outputTypesCount: { [outputType: string]: number };
    registrationDates: { type: string; registeredAt: Date }[];
  } {
    const indicators = this.getAvailableIndicators();
    const registrations = this.getAllRegistrations();

    const categoriesCount: { [category: string]: number } = {};
    const chartTypesCount: { [chartType: string]: number } = {};
    const outputTypesCount: { [outputType: string]: number } = {};

    indicators.forEach(metadata => {
      // 统计类别
      categoriesCount[metadata.category] = (categoriesCount[metadata.category] || 0) + 1;

      // 统计图表类型
      chartTypesCount[metadata.chartType] = (chartTypesCount[metadata.chartType] || 0) + 1;

      // 统计输出类型
      outputTypesCount[metadata.outputType] = (outputTypesCount[metadata.outputType] || 0) + 1;
    });

    return {
      totalIndicators: indicators.length,
      categoriesCount,
      chartTypesCount,
      outputTypesCount,
      registrationDates: registrations.map(reg => ({
        type: reg.type,
        registeredAt: reg.registeredAt,
      })),
    };
  }

  /**
   * 搜索指标
   */
  searchIndicators(query: {
    category?: string;
    chartType?: 'overlay' | 'separate';
    outputType?: 'single' | 'multiple';
    keyword?: string;
  }): IndicatorMetadata[] {
    let results = this.getAvailableIndicators();

    if (query.category) {
      results = results.filter(metadata => metadata.category === query.category);
    }

    if (query.chartType) {
      results = results.filter(metadata => metadata.chartType === query.chartType);
    }

    if (query.outputType) {
      results = results.filter(metadata => metadata.outputType === query.outputType);
    }

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      results = results.filter(metadata => 
        metadata.displayName.toLowerCase().includes(keyword) ||
        metadata.description.toLowerCase().includes(keyword)
      );
    }

    return results;
  }

  /**
   * 清空所有注册的指标
   */
  clear(): void {
    const count = this.indicators.size;
    this.indicators.clear();
    this.logger.log(`Cleared ${count} registered indicators`);
  }

  /**
   * 验证指标元数据
   */
  private validateMetadata(metadata: IndicatorMetadata): void {
    if (!metadata.displayName || metadata.displayName.trim().length === 0) {
      throw new Error('Indicator metadata must have a displayName');
    }

    if (!metadata.description || metadata.description.trim().length === 0) {
      throw new Error('Indicator metadata must have a description');
    }

    if (!['trend', 'momentum', 'volatility', 'volume', 'custom'].includes(metadata.category)) {
      throw new Error(`Invalid indicator category: ${metadata.category}`);
    }

    if (!['single', 'multiple'].includes(metadata.outputType)) {
      throw new Error(`Invalid indicator output type: ${metadata.outputType}`);
    }

    if (!['overlay', 'separate'].includes(metadata.chartType)) {
      throw new Error(`Invalid indicator chart type: ${metadata.chartType}`);
    }

    if (!Array.isArray(metadata.parameterSchema)) {
      throw new Error('Indicator metadata parameterSchema must be an array');
    }

    // 验证多值指标的输出名称
    if (metadata.outputType === 'multiple' && (!metadata.outputNames || metadata.outputNames.length === 0)) {
      throw new Error('Multiple output indicators must specify outputNames');
    }

    // 验证参数模式
    metadata.parameterSchema.forEach((param, index) => {
      if (!param.name || param.name.trim().length === 0) {
        throw new Error(`Parameter schema at index ${index} must have a name`);
      }

      if (!['number', 'string', 'boolean', 'array', 'object'].includes(param.type)) {
        throw new Error(`Parameter schema '${param.name}' has invalid type: ${param.type}`);
      }

      if (typeof param.required !== 'boolean') {
        throw new Error(`Parameter schema '${param.name}' must specify required as boolean`);
      }

      if (!param.description || param.description.trim().length === 0) {
        throw new Error(`Parameter schema '${param.name}' must have a description`);
      }
    });
  }
}