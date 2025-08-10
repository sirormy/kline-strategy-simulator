import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IsString, IsNumber, IsPositive, IsEnum, Min } from 'class-validator';

export type PositionDocument = Position & Document;

export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum MarginType {
  ISOLATED = 'ISOLATED',
  CROSS = 'CROSS',
}

@Schema({
  collection: 'positions',
  timestamps: true,
})
export class Position {
  @Prop({ required: true })
  @IsString()
  id: string;

  @Prop({ required: true, index: true })
  @IsString()
  accountId: string;

  @Prop({ required: true, index: true })
  @IsString()
  symbol: string;

  @Prop({ required: true, enum: PositionSide })
  @IsEnum(PositionSide)
  side: PositionSide;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  size: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  entryPrice: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  markPrice: number;

  @Prop({ required: true, default: 1 })
  @IsNumber()
  @IsPositive()
  leverage: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  margin: number;

  @Prop({ required: true })
  @IsNumber()
  unrealizedPnl: number;

  @Prop({ required: true, enum: MarginType, default: MarginType.CROSS })
  @IsEnum(MarginType)
  marginType: MarginType;

  @Prop({ required: true, index: true })
  @IsNumber()
  @Min(0)
  openTime: number;

  @Prop({ required: false })
  @IsNumber()
  @Min(0)
  closeTime?: number;

  @Prop({ required: false })
  @IsNumber()
  closePrice?: number;

  @Prop({ required: false })
  @IsNumber()
  realizedPnl?: number;

  @Prop({ required: false, default: false })
  isClosed: boolean;

  // 累计手续费
  @Prop({ required: false, default: 0 })
  @IsNumber()
  @Min(0)
  totalCommission: number;

  // 累计资金费率
  @Prop({ required: false, default: 0 })
  @IsNumber()
  totalFundingFee: number;
}

export const PositionSchema = SchemaFactory.createForClass(Position);

// 创建复合索引
PositionSchema.index({ accountId: 1, symbol: 1 }, { unique: true, partialFilterExpression: { isClosed: false } });
PositionSchema.index({ accountId: 1, openTime: -1 });
PositionSchema.index({ symbol: 1, side: 1 });
PositionSchema.index({ accountId: 1, isClosed: 1, openTime: -1 });

// 添加数据验证中间件
PositionSchema.pre('save', function(next) {
  // 验证杠杆倍数
  if (this.leverage < 1 || this.leverage > 125) {
    next(new Error('Leverage must be between 1 and 125'));
    return;
  }
  
  // 验证保证金计算
  const expectedMargin = (this.size * this.entryPrice) / this.leverage;
  const marginTolerance = expectedMargin * 0.01; // 1% 容差
  
  if (Math.abs(this.margin - expectedMargin) > marginTolerance) {
    next(new Error('Margin calculation is incorrect'));
    return;
  }
  
  // 如果仓位已关闭，必须有关闭时间和价格
  if (this.isClosed && (!this.closeTime || !this.closePrice)) {
    next(new Error('Closed positions must have close time and price'));
    return;
  }
  
  // 验证时间逻辑
  if (this.closeTime && this.closeTime <= this.openTime) {
    next(new Error('Close time must be after open time'));
    return;
  }
  
  next();
});

// 添加计算未实现盈亏的方法
PositionSchema.methods.calculateUnrealizedPnl = function(currentPrice: number): number {
  const priceDiff = this.side === PositionSide.LONG 
    ? currentPrice - this.entryPrice 
    : this.entryPrice - currentPrice;
  
  return (priceDiff * this.size * this.leverage) - this.totalCommission - this.totalFundingFee;
};

// 添加计算已实现盈亏的方法
PositionSchema.methods.calculateRealizedPnl = function(): number {
  if (!this.isClosed || !this.closePrice) {
    return 0;
  }
  
  const priceDiff = this.side === PositionSide.LONG 
    ? this.closePrice - this.entryPrice 
    : this.entryPrice - this.closePrice;
  
  return (priceDiff * this.size * this.leverage) - this.totalCommission - this.totalFundingFee;
};