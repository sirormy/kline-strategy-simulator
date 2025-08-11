// 导出基础类和接口
export { BaseStrategy, TradingSignal, IndicatorResult, StrategyImplementation, StrategyFactory } from './base-strategy';
export { BaseIndicator, IndicatorConfig, IndicatorMetadata, IndicatorImplementation, IndicatorFactory } from './base-indicator';

// 导出注册器
export { StrategyRegistry } from './strategy-registry';
export { IndicatorRegistry } from './indicator-registry';

// 导出参数验证器
export { ParameterValidator, ParameterValidationError, ValidationResult } from './parameter-validator';

// 导出插件加载器
export { PluginLoader, PluginInfo, PluginExports, PluginLoaderConfig } from './plugin-loader';

// 导出内置策略
export { DCAStrategy } from './strategies/dca-strategy';
export { SmallCapStrategy } from './strategies/small-cap-strategy';
export { TrendFollowingStrategy } from './strategies/trend-following-strategy';

// 导出内置指标
export { MAIndicator } from './indicators/ma-indicator';
export { MACDIndicator } from './indicators/macd-indicator';
export { RSIIndicator } from './indicators/rsi-indicator';
export { KDJIndicator } from './indicators/kdj-indicator';

// 重新导出Schema类型以便插件开发使用
export { StrategyConfig, StrategyMetadata, ParameterSchema } from '../schemas/strategy.schema';
export { KlineData } from '../schemas/kline-data.schema';