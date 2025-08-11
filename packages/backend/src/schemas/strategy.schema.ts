import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { IsString, IsBoolean, IsArray, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type StrategyDocument = Strategy & Document;

// 参数模式定义
export class ParameterSchema {
  @IsString()
  name: string;

  @IsString()
  type: 'number' | 'string' | 'boolean' | 'array' | 'object';

  @IsBoolean()
  required: boolean;

  @IsOptional()
  defaultValue?: any;

  @IsOptional()
  min?: number;

  @IsOptional()
  max?: number;

  @IsOptional()
  @IsArray()
  options?: string[];

  @IsString()
  description: string;
}

// 策略元数据
export class StrategyMetadata {
  @IsString()
  displayName: string;

  @IsString()
  description: string;

  @IsString()
  author: string;

  @IsString()
  version: string;

  @IsString()
  category: string;

  @IsArray()
  @IsString({ each: true })
  tags: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParameterSchema)
  parameterSchema: ParameterSchema[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredIndicators?: string[];
}

@Schema({
  collection: 'strategies',
  timestamps: true,
})
export class Strategy {
  @Prop({ required: true })
  @IsString()
  id: string;

  @Prop({ required: true, index: true })
  @IsString()
  accountId: string;

  @Prop({ required: true, index: true })
  @IsString()
  name: string;

  @Prop({ required: true, index: true })
  @IsString()
  type: string;

  @Prop({ required: true })
  @IsString()
  version: string;

  @Prop({ required: true, type: MongooseSchema.Types.Mixed })
  @IsObject()
  parameters: { [key: string]: any };

  @Prop({ required: true })
  @IsArray()
  @IsString({ each: true })
  symbols: string[];

  @Prop({ required: true })
  @IsString()
  timeframe: string;

  @Prop({ required: true, default: true })
  @IsBoolean()
  enabled: boolean;

  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyMetadata)
  metadata?: StrategyMetadata;

  // 策略配置
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @IsObject()
  config?: {
    maxPositions?: number;
    riskPerTrade?: number;
    stopLoss?: number;
    takeProfit?: number;
    [key: string]: any;
  };

  // 策略状态
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @IsObject()
  state?: {
    lastExecutionTime?: number;
    totalTrades?: number;
    winningTrades?: number;
    totalPnl?: number;
    [key: string]: any;
  };

  // 回测结果
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @IsObject()
  backtestResults?: {
    startTime: number;
    endTime: number;
    totalReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    winRate: number;
    totalTrades: number;
    profitFactor: number;
    [key: string]: any;
  };
}

export const StrategySchema = SchemaFactory.createForClass(Strategy);

// 策略配置接口（用于策略实现）
export interface StrategyConfig {
  id: string;
  accountId: string;
  name: string;
  type: string;
  version: string;
  parameters: { [key: string]: any };
  symbols: string[];
  timeframe: string;
  enabled: boolean;
  metadata?: StrategyMetadata;
  config?: {
    maxPositions?: number;
    riskPerTrade?: number;
    stopLoss?: number;
    takeProfit?: number;
    [key: string]: any;
  };
  state?: {
    lastExecutionTime?: number;
    totalTrades?: number;
    winningTrades?: number;
    totalPnl?: number;
    [key: string]: any;
  };
}

// 创建复合索引
StrategySchema.index({ accountId: 1, enabled: 1 });
StrategySchema.index({ type: 1, enabled: 1 });
StrategySchema.index({ accountId: 1, name: 1 }, { unique: true });

// 添加数据验证中间件
StrategySchema.pre('save', function(next) {
  // 验证策略名称不能为空
  if (!this.name || this.name.trim().length === 0) {
    next(new Error('Strategy name cannot be empty'));
    return;
  }
  
  // 验证至少有一个交易对
  if (!this.symbols || this.symbols.length === 0) {
    next(new Error('Strategy must have at least one symbol'));
    return;
  }
  
  // 验证时间框架格式
  const validTimeframes = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
  if (!validTimeframes.includes(this.timeframe)) {
    next(new Error('Invalid timeframe'));
    return;
  }
  
  // 验证参数是否符合元数据定义
  if (this.metadata && this.metadata.parameterSchema) {
    for (const paramSchema of this.metadata.parameterSchema) {
      if (paramSchema.required && !(paramSchema.name in this.parameters)) {
        next(new Error(`Required parameter '${paramSchema.name}' is missing`));
        return;
      }
      
      const paramValue = this.parameters[paramSchema.name];
      if (paramValue !== undefined) {
        // 验证参数类型
        const actualType = typeof paramValue;
        if (paramSchema.type === 'array' && !Array.isArray(paramValue)) {
          next(new Error(`Parameter '${paramSchema.name}' must be an array`));
          return;
        } else if (paramSchema.type !== 'array' && actualType !== paramSchema.type) {
          next(new Error(`Parameter '${paramSchema.name}' must be of type ${paramSchema.type}`));
          return;
        }
        
        // 验证数值范围
        if (paramSchema.type === 'number') {
          if (paramSchema.min !== undefined && paramValue < paramSchema.min) {
            next(new Error(`Parameter '${paramSchema.name}' must be >= ${paramSchema.min}`));
            return;
          }
          if (paramSchema.max !== undefined && paramValue > paramSchema.max) {
            next(new Error(`Parameter '${paramSchema.name}' must be <= ${paramSchema.max}`));
            return;
          }
        }
        
        // 验证选项值
        if (paramSchema.options && !paramSchema.options.includes(paramValue)) {
          next(new Error(`Parameter '${paramSchema.name}' must be one of: ${paramSchema.options.join(', ')}`));
          return;
        }
      }
    }
  }
  
  next();
});

// 添加策略统计方法
StrategySchema.methods.updateStats = function(tradeResult: { pnl: number; isWin: boolean }) {
  if (!this.state) {
    this.state = {};
  }
  
  this.state.totalTrades = (this.state.totalTrades || 0) + 1;
  this.state.totalPnl = (this.state.totalPnl || 0) + tradeResult.pnl;
  
  if (tradeResult.isWin) {
    this.state.winningTrades = (this.state.winningTrades || 0) + 1;
  }
  
  this.state.lastExecutionTime = Date.now();
};

// 添加获取胜率方法
StrategySchema.methods.getWinRate = function(): number {
  if (!this.state || !this.state.totalTrades || this.state.totalTrades === 0) {
    return 0;
  }
  
  return (this.state.winningTrades || 0) / this.state.totalTrades;
};