import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { IsString, IsNumber, IsObject, IsOptional, Min } from 'class-validator';

export interface AccountMethods {
  getBalance(asset: string): Balance | null;
  updateBalance(asset: string, freeChange: number, lockedChange?: number): void;
  calculateTotalEquity(prices: { [asset: string]: number }): number;
  updateStats(tradeResult: { pnl: number; isWin: boolean; commission: number; fundingFee?: number }): void;
}

export type AccountDocument = Account & Document & AccountMethods;

// 账户余额信息
export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

// 账户配置
export interface AccountConfig {
  defaultLeverage: number;
  maxPositions: number;
  riskPerTrade: number;
  autoStopLoss: boolean;
  autoTakeProfit: boolean;
  [key: string]: any;
}

@Schema({
  collection: 'accounts',
  timestamps: true,
})
export class Account {
  @Prop({ required: true, unique: true, index: true })
  @IsString()
  accountId: string;

  @Prop({ required: true })
  @IsString()
  name: string;

  @Prop({ required: true, type: [{ asset: String, free: Number, locked: Number }] })
  balances: Balance[];

  @Prop({ required: true, default: 0 })
  @IsNumber()
  @Min(0)
  totalEquity: number;

  @Prop({ required: true, default: 0 })
  @IsNumber()
  @Min(0)
  availableMargin: number;

  @Prop({ required: true, default: 0 })
  @IsNumber()
  @Min(0)
  usedMargin: number;

  @Prop({ required: true, default: 0 })
  @IsNumber()
  unrealizedPnl: number;

  @Prop({ required: true, default: 0 })
  @IsNumber()
  realizedPnl: number;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @IsObject()
  config?: AccountConfig;

  // 账户统计信息
  @Prop({ required: false, type: MongooseSchema.Types.Mixed })
  @IsOptional()
  @IsObject()
  stats?: {
    totalTrades: number;
    winningTrades: number;
    totalCommission: number;
    totalFundingFee: number;
    maxDrawdown: number;
    maxEquity: number;
    createdAt: number;
    [key: string]: any;
  };
}

export const AccountSchema = SchemaFactory.createForClass(Account);

// 创建索引
AccountSchema.index({ accountId: 1 }, { unique: true });
AccountSchema.index({ isActive: 1 });

// 添加数据验证中间件
AccountSchema.pre('save', function(next) {
  // 验证账户ID不能为空
  if (!this.accountId || this.accountId.trim().length === 0) {
    next(new Error('Account ID cannot be empty'));
    return;
  }
  
  // 验证余额数据
  if (!this.balances || this.balances.length === 0) {
    next(new Error('Account must have at least one balance entry'));
    return;
  }
  
  // 验证每个余额项
  for (const balance of this.balances) {
    if (!balance.asset || balance.asset.trim().length === 0) {
      next(new Error('Balance asset cannot be empty'));
      return;
    }
    
    if (balance.free < 0 || balance.locked < 0) {
      next(new Error('Balance amounts cannot be negative'));
      return;
    }
  }
  
  // 验证保证金逻辑
  if (this.usedMargin > this.totalEquity) {
    next(new Error('Used margin cannot exceed total equity'));
    return;
  }
  
  if (this.availableMargin < 0) {
    next(new Error('Available margin cannot be negative'));
    return;
  }
  
  next();
});

// 添加获取资产余额的方法
AccountSchema.methods.getBalance = function(asset: string): Balance | null {
  return this.balances.find(b => b.asset === asset) || null;
};

// 添加更新余额的方法
AccountSchema.methods.updateBalance = function(asset: string, freeChange: number, lockedChange: number = 0) {
  let balance = this.balances.find(b => b.asset === asset);
  
  if (!balance) {
    balance = { asset, free: 0, locked: 0 };
    this.balances.push(balance);
  }
  
  balance.free += freeChange;
  balance.locked += lockedChange;
  
  // 确保余额不为负数
  if (balance.free < 0) {
    throw new Error(`Insufficient ${asset} balance`);
  }
  
  if (balance.locked < 0) {
    throw new Error(`Locked ${asset} balance cannot be negative`);
  }
};

// 添加计算总权益的方法
AccountSchema.methods.calculateTotalEquity = function(prices: { [asset: string]: number }) {
  let totalEquity = 0;
  
  for (const balance of this.balances) {
    const price = prices[balance.asset] || (balance.asset === 'USDT' ? 1 : 0);
    totalEquity += (balance.free + balance.locked) * price;
  }
  
  this.totalEquity = totalEquity + this.unrealizedPnl;
  this.availableMargin = this.totalEquity - this.usedMargin;
  
  return this.totalEquity;
};

// 添加更新统计信息的方法
AccountSchema.methods.updateStats = function(tradeResult: { 
  pnl: number; 
  isWin: boolean; 
  commission: number; 
  fundingFee?: number 
}) {
  if (!this.stats) {
    this.stats = {
      totalTrades: 0,
      winningTrades: 0,
      totalCommission: 0,
      totalFundingFee: 0,
      maxDrawdown: 0,
      maxEquity: this.totalEquity,
      createdAt: Date.now(),
    };
  }
  
  this.stats.totalTrades += 1;
  this.stats.totalCommission += tradeResult.commission;
  this.stats.totalFundingFee += tradeResult.fundingFee || 0;
  
  if (tradeResult.isWin) {
    this.stats.winningTrades += 1;
  }
  
  // 更新最大权益
  if (this.totalEquity > this.stats.maxEquity) {
    this.stats.maxEquity = this.totalEquity;
  }
  
  // 计算最大回撤
  const drawdown = (this.stats.maxEquity - this.totalEquity) / this.stats.maxEquity;
  if (drawdown > this.stats.maxDrawdown) {
    this.stats.maxDrawdown = drawdown;
  }
};