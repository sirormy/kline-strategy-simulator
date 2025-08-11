import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PluginLoader, PluginInfo, PluginLoaderConfig } from '../extensions/plugin-loader';
import { StrategyRegistry } from '../extensions/strategy-registry';
import { IndicatorRegistry } from '../extensions/indicator-registry';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class PluginService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginService.name);
  private pluginLoader: PluginLoader;

  constructor(
    private readonly strategyRegistry: StrategyRegistry,
    private readonly indicatorRegistry: IndicatorRegistry,
  ) {
    this.pluginLoader = new PluginLoader(this.strategyRegistry, this.indicatorRegistry);
  }

  async onModuleInit() {
    try {
      await this.pluginLoader.initialize();
      this.logger.log('Plugin service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize plugin service:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.pluginLoader.destroy();
      this.logger.log('Plugin service destroyed');
    } catch (error) {
      this.logger.error('Failed to destroy plugin service:', error);
    }
  }

  /**
   * 获取所有已加载的插件
   */
  async getLoadedPlugins(): Promise<PluginInfo[]> {
    return this.pluginLoader.getLoadedPlugins();
  }

  /**
   * 获取特定插件信息
   */
  async getPluginInfo(pluginPath: string): Promise<PluginInfo | null> {
    return this.pluginLoader.getPluginInfo(pluginPath);
  }

  /**
   * 加载插件
   */
  async loadPlugin(pluginPath: string): Promise<boolean> {
    return await this.pluginLoader.loadPlugin(pluginPath);
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginPath: string): Promise<boolean> {
    return await this.pluginLoader.unloadPlugin(pluginPath);
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(pluginPath: string): Promise<boolean> {
    return await this.pluginLoader.reloadPlugin(pluginPath);
  }

  /**
   * 重新加载所有插件
   */
  async reloadAllPlugins(): Promise<Array<{ plugin: string; success: boolean; error?: string }>> {
    const plugins = await this.getLoadedPlugins();
    const results: Array<{ plugin: string; success: boolean; error?: string }> = [];

    for (const plugin of plugins) {
      try {
        const success = await this.reloadPlugin(plugin.path);
        results.push({
          plugin: plugin.name,
          success,
          error: success ? undefined : 'Unknown error',
        });
      } catch (error) {
        results.push({
          plugin: plugin.name,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * 上传并加载插件
   */
  async uploadPlugin(name: string, content: string, trusted: boolean = false): Promise<{ pluginPath: string }> {
    try {
      // 解码Base64内容
      const pluginContent = Buffer.from(content, 'base64').toString('utf-8');
      
      // 验证插件名称
      if (!name.endsWith('.plugin.js')) {
        name = `${name}.plugin.js`;
      }

      // 确保插件目录存在
      const pluginDir = path.join(process.cwd(), 'plugins');
      await fs.mkdir(pluginDir, { recursive: true });

      // 写入插件文件
      const pluginPath = path.join(pluginDir, name);
      await fs.writeFile(pluginPath, pluginContent, 'utf-8');

      // 如果标记为受信任，添加到受信任列表
      if (trusted) {
        this.pluginLoader.addTrustedPlugin(pluginPath);
      }

      // 加载插件
      const success = await this.loadPlugin(pluginPath);
      if (!success) {
        // 如果加载失败，删除文件
        await fs.unlink(pluginPath);
        throw new Error('Plugin loading failed after upload');
      }

      return { pluginPath };
    } catch (error) {
      this.logger.error('Failed to upload plugin:', error);
      throw error;
    }
  }

  /**
   * 获取插件统计信息
   */
  async getStats(): Promise<{
    totalPlugins: number;
    totalStrategies: number;
    totalIndicators: number;
    pluginsByAuthor: { [author: string]: number };
  }> {
    return this.pluginLoader.getStats();
  }

  /**
   * 获取安全报告
   */
  async getSecurityReport(): Promise<{
    totalPlugins: number;
    trustedPlugins: number;
    sandboxedPlugins: number;
    securityViolations: Array<{
      plugin: string;
      violation: string;
      timestamp: Date;
    }>;
  }> {
    return this.pluginLoader.getSecurityReport();
  }

  /**
   * 获取插件加载器配置
   */
  async getConfig(): Promise<Partial<PluginLoaderConfig>> {
    // 返回当前配置的副本（不包含敏感信息）
    const plugins = await this.getLoadedPlugins();
    return {
      pluginDirectories: ['plugins', 'src/plugins'],
      enableHotReload: process.env.NODE_ENV === 'development',
      allowedFileExtensions: ['.js', '.mjs'],
      // 不返回完整的安全策略以避免泄露敏感信息
    };
  }

  /**
   * 更新插件加载器配置
   */
  async updateConfig(configDto: any): Promise<void> {
    // 重新初始化插件加载器（如果需要）
    if (configDto.pluginDirectories || configDto.enableHotReload) {
      this.logger.warn('Configuration changes require service restart to take effect');
    }

    // 更新安全策略
    if (configDto.securityPolicy) {
      if (configDto.securityPolicy.trustedPlugins) {
        // 更新受信任插件列表
        for (const plugin of configDto.securityPolicy.trustedPlugins) {
          this.pluginLoader.addTrustedPlugin(plugin);
        }
      }
    }
  }

  /**
   * 添加受信任插件
   */
  async addTrustedPlugin(pluginPathOrHash: string): Promise<void> {
    this.pluginLoader.addTrustedPlugin(pluginPathOrHash);
  }

  /**
   * 移除受信任插件
   */
  async removeTrustedPlugin(pluginPathOrHash: string): Promise<void> {
    this.pluginLoader.removeTrustedPlugin(pluginPathOrHash);
  }

  /**
   * 验证插件完整性
   */
  async validatePluginIntegrity(pluginPath: string): Promise<boolean> {
    return await this.pluginLoader.validatePluginIntegrity(pluginPath);
  }

  /**
   * 获取插件开发模板
   */
  async getPluginTemplates(): Promise<Array<{ name: string; description: string; content: string }>> {
    const templates = [
      {
        name: 'Basic Strategy Template',
        description: '基础策略模板，包含必要的方法实现',
        content: await this.getBasicStrategyTemplate(),
      },
      {
        name: 'Advanced Strategy Template',
        description: '高级策略模板，包含状态管理和复杂逻辑',
        content: await this.getAdvancedStrategyTemplate(),
      },
      {
        name: 'Indicator Template',
        description: '技术指标模板（将在后续任务中实现）',
        content: await this.getIndicatorTemplate(),
      },
    ];

    return templates;
  }

  /**
   * 获取插件系统健康状态
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    pluginLoader: boolean;
    hotReload: boolean;
    securitySandbox: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let pluginLoader = true;
    let hotReload = true;
    let securitySandbox = true;

    try {
      // 检查插件加载器状态
      const plugins = await this.getLoadedPlugins();
      if (plugins.length === 0) {
        issues.push('No plugins loaded');
      }
    } catch (error) {
      pluginLoader = false;
      issues.push(`Plugin loader error: ${error.message}`);
    }

    try {
      // 检查热重载状态
      if (process.env.NODE_ENV === 'development') {
        // 热重载应该在开发环境中启用
        // 这里可以添加更具体的检查逻辑
      }
    } catch (error) {
      hotReload = false;
      issues.push(`Hot reload error: ${error.message}`);
    }

    try {
      // 检查安全沙箱状态
      const securityReport = await this.getSecurityReport();
      if (securityReport.securityViolations.length > 0) {
        issues.push(`${securityReport.securityViolations.length} security violations detected`);
      }
    } catch (error) {
      securitySandbox = false;
      issues.push(`Security sandbox error: ${error.message}`);
    }

    const healthy = pluginLoader && hotReload && securitySandbox && issues.length === 0;

    return {
      healthy,
      pluginLoader,
      hotReload,
      securitySandbox,
      issues,
    };
  }

  /**
   * 获取基础策略模板
   */
  private async getBasicStrategyTemplate(): Promise<string> {
    return `/**
 * 基础策略模板
 * 请根据你的需求修改此模板
 */

const { BaseStrategy } = require('../src/extensions/base-strategy');

class MyCustomStrategy extends BaseStrategy {
  getMetadata() {
    return {
      displayName: '我的自定义策略',
      description: '策略描述',
      author: '你的名字',
      version: '1.0.0',
      category: 'custom',
      tags: ['custom', 'template'],
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: true,
          min: 1,
          max: 100,
          defaultValue: 20,
          description: '周期参数',
        },
        {
          name: 'threshold',
          type: 'number',
          required: false,
          min: 0,
          max: 1,
          defaultValue: 0.5,
          description: '阈值参数',
        },
      ],
    };
  }

  async generateSignals(marketData, indicators) {
    const signals = [];
    const { period, threshold } = this.config.parameters;

    if (marketData.length < period) {
      return signals;
    }

    // 在这里实现你的策略逻辑
    const currentKline = marketData[marketData.length - 1];
    const currentPrice = currentKline.close;

    // 示例：简单的价格变化策略
    if (marketData.length >= 2) {
      const previousPrice = marketData[marketData.length - 2].close;
      const priceChange = (currentPrice - previousPrice) / previousPrice;

      if (priceChange > threshold) {
        // 买入信号
        const signal = this.createSignal(
          'BUY',
          currentKline.symbol,
          100 / currentPrice, // 固定100 USDT
          0.8,
          \`价格上涨 \${(priceChange * 100).toFixed(2)}%\`,
          { price: currentPrice }
        );
        signals.push(signal);
      } else if (priceChange < -threshold) {
        // 卖出信号
        const signal = this.createSignal(
          'SELL',
          currentKline.symbol,
          100 / currentPrice, // 固定100 USDT
          0.8,
          \`价格下跌 \${(Math.abs(priceChange) * 100).toFixed(2)}%\`,
          { price: currentPrice }
        );
        signals.push(signal);
      }
    }

    return signals;
  }

  validateParameters(parameters) {
    const { period, threshold } = parameters;

    if (!period || period < 1 || period > 100) {
      return false;
    }

    if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
      return false;
    }

    return true;
  }

  getMinDataLength() {
    return this.config.parameters.period + 1;
  }

  async onInit() {
    console.log(\`MyCustomStrategy initialized with period: \${this.config.parameters.period}\`);
  }
}

// 导出插件
module.exports = {
  metadata: {
    name: 'My Custom Strategy Plugin',
    version: '1.0.0',
    author: '你的名字',
    description: '我的自定义策略插件',
  },
  strategies: {
    'MY_CUSTOM_STRATEGY': MyCustomStrategy,
  },
};`;
  }

  /**
   * 获取高级策略模板
   */
  private async getAdvancedStrategyTemplate(): Promise<string> {
    return `/**
 * 高级策略模板
 * 包含状态管理、多时间框架分析等高级功能
 */

const { BaseStrategy } = require('../src/extensions/base-strategy');

class AdvancedStrategy extends BaseStrategy {
  constructor(config) {
    super(config);
    this.state = {
      lastSignalTime: 0,
      positionSize: 0,
      entryPrice: 0,
      signals: [],
    };
  }

  getMetadata() {
    return {
      displayName: '高级策略模板',
      description: '包含状态管理和复杂逻辑的高级策略模板',
      author: '你的名字',
      version: '1.0.0',
      category: 'advanced',
      tags: ['advanced', 'stateful', 'multi-timeframe'],
      parameterSchema: [
        {
          name: 'shortPeriod',
          type: 'number',
          required: true,
          min: 5,
          max: 50,
          defaultValue: 12,
          description: '短周期',
        },
        {
          name: 'longPeriod',
          type: 'number',
          required: true,
          min: 20,
          max: 200,
          defaultValue: 26,
          description: '长周期',
        },
        {
          name: 'signalCooldown',
          type: 'number',
          required: false,
          min: 0,
          max: 3600000,
          defaultValue: 300000, // 5分钟
          description: '信号冷却时间（毫秒）',
        },
        {
          name: 'maxPositionSize',
          type: 'number',
          required: false,
          min: 0,
          defaultValue: 1000,
          description: '最大持仓金额（USDT）',
        },
        {
          name: 'riskManagement',
          type: 'object',
          required: false,
          defaultValue: {
            stopLoss: 0.05,
            takeProfit: 0.1,
            maxDrawdown: 0.2,
          },
          description: '风险管理参数',
        },
      ],
    };
  }

  async generateSignals(marketData, indicators) {
    const signals = [];
    const { shortPeriod, longPeriod, signalCooldown, maxPositionSize, riskManagement } = this.config.parameters;

    if (marketData.length < Math.max(shortPeriod, longPeriod)) {
      return signals;
    }

    const currentTime = Date.now();
    const currentKline = marketData[marketData.length - 1];
    const currentPrice = currentKline.close;

    // 检查信号冷却时间
    if (currentTime - this.state.lastSignalTime < signalCooldown) {
      return signals;
    }

    // 计算技术指标
    const prices = marketData.map(k => k.close);
    const shortMA = this.calculateEMA(prices, shortPeriod);
    const longMA = this.calculateEMA(prices, longPeriod);

    if (shortMA.length < 2 || longMA.length < 2) {
      return signals;
    }

    const currentShortMA = shortMA[shortMA.length - 1];
    const currentLongMA = longMA[longMA.length - 1];
    const previousShortMA = shortMA[shortMA.length - 2];
    const previousLongMA = longMA[longMA.length - 2];

    // 检查趋势变化
    const bullishCrossover = previousShortMA <= previousLongMA && currentShortMA > currentLongMA;
    const bearishCrossover = previousShortMA >= previousLongMA && currentShortMA < currentLongMA;

    // 风险管理检查
    const riskCheck = this.performRiskCheck(currentPrice, riskManagement);
    if (!riskCheck.allowed) {
      console.log(\`Risk check failed: \${riskCheck.reason}\`);
      return signals;
    }

    let signal = null;

    if (bullishCrossover && this.state.positionSize <= 0) {
      // 买入信号
      const quantity = Math.min(maxPositionSize, 500) / currentPrice;
      signal = this.createSignal(
        'BUY',
        currentKline.symbol,
        quantity,
        0.85,
        \`EMA金叉买入信号 (短期:\${currentShortMA.toFixed(2)}, 长期:\${currentLongMA.toFixed(2)})\`,
        {
          price: currentPrice,
          stopLoss: currentPrice * (1 - riskManagement.stopLoss),
          takeProfit: currentPrice * (1 + riskManagement.takeProfit),
        }
      );

      // 更新状态
      this.state.positionSize = quantity * currentPrice;
      this.state.entryPrice = currentPrice;
      this.state.lastSignalTime = currentTime;

    } else if (bearishCrossover && this.state.positionSize > 0) {
      // 卖出信号
      const quantity = this.state.positionSize / currentPrice;
      signal = this.createSignal(
        'SELL',
        currentKline.symbol,
        quantity,
        0.85,
        \`EMA死叉卖出信号 (短期:\${currentShortMA.toFixed(2)}, 长期:\${currentLongMA.toFixed(2)})\`,
        {
          price: currentPrice,
        }
      );

      // 计算盈亏
      const pnl = (currentPrice - this.state.entryPrice) * (this.state.positionSize / this.state.entryPrice);
      console.log(\`Position closed with P&L: \${pnl.toFixed(2)} USDT\`);

      // 重置状态
      this.state.positionSize = 0;
      this.state.entryPrice = 0;
      this.state.lastSignalTime = currentTime;
    }

    if (signal) {
      signals.push(signal);
      this.state.signals.push({
        ...signal,
        timestamp: currentTime,
      });
    }

    return signals;
  }

  validateParameters(parameters) {
    const { shortPeriod, longPeriod, signalCooldown, maxPositionSize, riskManagement } = parameters;

    if (!shortPeriod || !longPeriod || shortPeriod >= longPeriod) {
      return false;
    }

    if (signalCooldown !== undefined && signalCooldown < 0) {
      return false;
    }

    if (maxPositionSize !== undefined && maxPositionSize <= 0) {
      return false;
    }

    if (riskManagement) {
      if (riskManagement.stopLoss && (riskManagement.stopLoss <= 0 || riskManagement.stopLoss >= 1)) {
        return false;
      }
      if (riskManagement.takeProfit && (riskManagement.takeProfit <= 0 || riskManagement.takeProfit >= 2)) {
        return false;
      }
    }

    return true;
  }

  performRiskCheck(currentPrice, riskManagement) {
    // 检查止损
    if (this.state.positionSize > 0 && this.state.entryPrice > 0) {
      const currentLoss = (this.state.entryPrice - currentPrice) / this.state.entryPrice;
      if (currentLoss > riskManagement.stopLoss) {
        return {
          allowed: false,
          reason: \`Stop loss triggered: \${(currentLoss * 100).toFixed(2)}%\`,
        };
      }
    }

    // 检查最大回撤
    if (riskManagement.maxDrawdown) {
      const totalPnL = this.calculateTotalPnL();
      if (totalPnL < -riskManagement.maxDrawdown * this.config.parameters.maxPositionSize) {
        return {
          allowed: false,
          reason: \`Max drawdown exceeded: \${totalPnL.toFixed(2)} USDT\`,
        };
      }
    }

    return { allowed: true };
  }

  calculateTotalPnL() {
    // 简化的PnL计算
    return this.state.signals.reduce((total, signal) => {
      // 这里应该根据实际交易结果计算PnL
      return total;
    }, 0);
  }

  getMinDataLength() {
    return Math.max(this.config.parameters.shortPeriod, this.config.parameters.longPeriod) + 5;
  }

  async onInit() {
    // 从持久化状态恢复（如果有）
    if (this.config.state) {
      this.state = { ...this.state, ...this.config.state };
    }
    console.log('AdvancedStrategy initialized with state:', this.state);
  }

  async onDestroy() {
    // 保存状态
    this.config.state = this.state;
    console.log('AdvancedStrategy destroyed, state saved');
  }

  async onTradeExecuted(signal, result) {
    // 交易执行后的回调
    console.log(\`Trade executed: \${signal.type} \${signal.quantity} \${signal.symbol} @ \${result.price}\`);
    
    // 更新状态
    if (signal.type === 'BUY') {
      this.state.positionSize += result.quantity * result.price;
    } else if (signal.type === 'SELL') {
      this.state.positionSize -= result.quantity * result.price;
    }
  }
}

// 导出插件
module.exports = {
  metadata: {
    name: 'Advanced Strategy Plugin',
    version: '1.0.0',
    author: '你的名字',
    description: '高级策略插件模板',
  },
  strategies: {
    'ADVANCED_STRATEGY': AdvancedStrategy,
  },
};`;
  }

  /**
   * 获取指标模板
   */
  private async getIndicatorTemplate(): Promise<string> {
    return `/**
 * 技术指标模板
 * 注意：指标功能将在后续任务中完整实现
 */

// const { BaseIndicator } = require('../src/extensions/base-indicator');

class CustomIndicator {
  constructor(config) {
    this.config = config;
  }

  getMetadata() {
    return {
      displayName: '自定义指标',
      description: '自定义技术指标模板',
      category: 'custom',
      outputType: 'single',
      chartType: 'overlay',
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: true,
          min: 1,
          max: 100,
          defaultValue: 14,
          description: '计算周期',
        },
      ],
    };
  }

  async calculate(data) {
    const { period } = this.config.parameters;
    
    if (data.length < period) {
      return {
        type: 'CUSTOM_INDICATOR',
        values: [],
        metadata: this.getMetadata(),
      };
    }

    // 在这里实现你的指标计算逻辑
    const values = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const average = slice.reduce((sum, k) => sum + k.close, 0) / period;
      values.push(average);
    }

    return {
      type: 'CUSTOM_INDICATOR',
      values,
      metadata: this.getMetadata(),
    };
  }

  validateParameters(parameters) {
    const { period } = parameters;
    return period && period > 0 && period <= 100;
  }
}

// 导出插件
module.exports = {
  metadata: {
    name: 'Custom Indicator Plugin',
    version: '1.0.0',
    author: '你的名字',
    description: '自定义指标插件模板',
  },
  indicators: {
    'CUSTOM_INDICATOR': CustomIndicator,
  },
};`;
  }
}