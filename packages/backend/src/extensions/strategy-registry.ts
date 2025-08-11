import { Injectable, Logger } from '@nestjs/common';
import { BaseStrategy, StrategyImplementation, StrategyFactory } from './base-strategy';
import { StrategyConfig, StrategyMetadata } from '../schemas/strategy.schema';

// 策略注册信息
interface StrategyRegistration {
  type: string;
  implementation: StrategyImplementation;
  metadata: StrategyMetadata;
  registeredAt: Date;
  version: string;
}

@Injectable()
export class StrategyRegistry implements StrategyFactory {
  private readonly logger = new Logger(StrategyRegistry.name);
  private readonly strategies = new Map<string, StrategyRegistration>();

  /**
   * 注册策略
   */
  register(type: string, strategyClass: StrategyImplementation): void {
    try {
      // 创建临时实例以获取元数据
      const tempConfig: StrategyConfig = {
        id: 'temp',
        accountId: 'temp',
        name: 'temp',
        type,
        version: '1.0.0',
        parameters: {},
        symbols: ['BTCUSDT'],
        timeframe: '1h',
        enabled: true,
      };

      const tempInstance = new strategyClass(tempConfig);
      const metadata = tempInstance.getStrategyMetadata();

      // 验证元数据
      this.validateMetadata(metadata);

      const registration: StrategyRegistration = {
        type,
        implementation: strategyClass,
        metadata,
        registeredAt: new Date(),
        version: metadata.version,
      };

      this.strategies.set(type, registration);
      this.logger.log(`Strategy registered: ${type} v${metadata.version}`);
    } catch (error) {
      this.logger.error(`Failed to register strategy ${type}:`, error);
      throw new Error(`Strategy registration failed: ${error.message}`);
    }
  }

  /**
   * 取消注册策略
   */
  unregister(type: string): boolean {
    const existed = this.strategies.has(type);
    if (existed) {
      this.strategies.delete(type);
      this.logger.log(`Strategy unregistered: ${type}`);
    }
    return existed;
  }

  /**
   * 创建策略实例
   */
  createStrategy(config: StrategyConfig): BaseStrategy {
    const registration = this.strategies.get(config.type);
    if (!registration) {
      throw new Error(`Strategy type '${config.type}' not found. Available types: ${this.getAvailableTypes().join(', ')}`);
    }

    try {
      const strategy = new registration.implementation(config);
      this.logger.debug(`Strategy instance created: ${config.type} for ${config.name}`);
      return strategy;
    } catch (error) {
      this.logger.error(`Failed to create strategy instance for ${config.type}:`, error);
      throw new Error(`Strategy creation failed: ${error.message}`);
    }
  }

  /**
   * 获取可用策略列表
   */
  getAvailableStrategies(): StrategyMetadata[] {
    return Array.from(this.strategies.values()).map(reg => reg.metadata);
  }

  /**
   * 获取可用策略类型列表
   */
  getAvailableTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * 检查策略是否支持
   */
  isStrategySupported(type: string): boolean {
    return this.strategies.has(type);
  }

  /**
   * 获取策略元数据
   */
  getStrategyMetadata(type: string): StrategyMetadata | null {
    const registration = this.strategies.get(type);
    return registration ? registration.metadata : null;
  }

  /**
   * 获取策略注册信息
   */
  getStrategyRegistration(type: string): StrategyRegistration | null {
    return this.strategies.get(type) || null;
  }

  /**
   * 获取所有注册信息
   */
  getAllRegistrations(): StrategyRegistration[] {
    return Array.from(this.strategies.values());
  }

  /**
   * 按类别获取策略
   */
  getStrategiesByCategory(category: string): StrategyMetadata[] {
    return this.getAvailableStrategies().filter(
      metadata => metadata.category === category
    );
  }

  /**
   * 按标签搜索策略
   */
  searchStrategiesByTag(tag: string): StrategyMetadata[] {
    return this.getAvailableStrategies().filter(
      metadata => metadata.tags.includes(tag)
    );
  }

  /**
   * 验证策略参数
   */
  validateStrategyParameters(type: string, parameters: any): boolean {
    const registration = this.strategies.get(type);
    if (!registration) {
      return false;
    }

    try {
      // 创建临时配置进行验证
      const tempConfig: StrategyConfig = {
        id: 'temp',
        accountId: 'temp',
        name: 'temp',
        type,
        version: registration.version,
        parameters,
        symbols: ['BTCUSDT'],
        timeframe: '1h',
        enabled: true,
      };

      const tempInstance = new registration.implementation(tempConfig);
      return tempInstance.validateParameters(parameters);
    } catch (error) {
      this.logger.warn(`Parameter validation failed for ${type}:`, error);
      return false;
    }
  }

  /**
   * 获取策略统计信息
   */
  getRegistryStats(): {
    totalStrategies: number;
    categoriesCount: { [category: string]: number };
    tagsCount: { [tag: string]: number };
    registrationDates: { type: string; registeredAt: Date }[];
  } {
    const strategies = this.getAvailableStrategies();
    const registrations = this.getAllRegistrations();

    const categoriesCount: { [category: string]: number } = {};
    const tagsCount: { [tag: string]: number } = {};

    strategies.forEach(metadata => {
      // 统计类别
      categoriesCount[metadata.category] = (categoriesCount[metadata.category] || 0) + 1;

      // 统计标签
      metadata.tags.forEach(tag => {
        tagsCount[tag] = (tagsCount[tag] || 0) + 1;
      });
    });

    return {
      totalStrategies: strategies.length,
      categoriesCount,
      tagsCount,
      registrationDates: registrations.map(reg => ({
        type: reg.type,
        registeredAt: reg.registeredAt,
      })),
    };
  }

  /**
   * 清空所有注册的策略
   */
  clear(): void {
    const count = this.strategies.size;
    this.strategies.clear();
    this.logger.log(`Cleared ${count} registered strategies`);
  }

  /**
   * 验证策略元数据
   */
  private validateMetadata(metadata: StrategyMetadata): void {
    if (!metadata.displayName || metadata.displayName.trim().length === 0) {
      throw new Error('Strategy metadata must have a displayName');
    }

    if (!metadata.description || metadata.description.trim().length === 0) {
      throw new Error('Strategy metadata must have a description');
    }

    if (!metadata.author || metadata.author.trim().length === 0) {
      throw new Error('Strategy metadata must have an author');
    }

    if (!metadata.version || metadata.version.trim().length === 0) {
      throw new Error('Strategy metadata must have a version');
    }

    if (!metadata.category || metadata.category.trim().length === 0) {
      throw new Error('Strategy metadata must have a category');
    }

    if (!Array.isArray(metadata.tags)) {
      throw new Error('Strategy metadata tags must be an array');
    }

    if (!Array.isArray(metadata.parameterSchema)) {
      throw new Error('Strategy metadata parameterSchema must be an array');
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