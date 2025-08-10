import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IsString, IsNumber, IsPositive, IsEnum, IsOptional, Min } from 'class-validator';

export type TradeOrderDocument = TradeOrder & Document;

export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

export enum MarginType {
  ISOLATED = 'ISOLATED',
  CROSS = 'CROSS',
}

@Schema({
  collection: 'trade_orders',
  timestamps: true,
})
export class TradeOrder {
  @Prop({ required: true })
  @IsString()
  id: string;

  @Prop({ required: true, index: true })
  @IsString()
  accountId: string;

  @Prop({ required: true, index: true })
  @IsString()
  symbol: string;

  @Prop({ required: true, enum: OrderSide })
  @IsEnum(OrderSide)
  side: OrderSide;

  @Prop({ required: true, enum: OrderType })
  @IsEnum(OrderType)
  type: OrderType;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @Prop({ required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @Prop({ required: false, default: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  leverage?: number;

  @Prop({ required: false, enum: MarginType })
  @IsOptional()
  @IsEnum(MarginType)
  marginType?: MarginType;

  @Prop({ required: true, index: true })
  @IsNumber()
  @Min(0)
  timestamp: number;

  @Prop({ required: true, enum: OrderStatus, default: OrderStatus.PENDING })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @Prop({ required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  filledQuantity?: number;

  @Prop({ required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  filledPrice?: number;

  @Prop({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  commission?: number;

  @Prop({ required: false })
  @IsOptional()
  @IsString()
  commissionAsset?: string;

  @Prop({ required: false })
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export const TradeOrderSchema = SchemaFactory.createForClass(TradeOrder);

// 创建复合索引
TradeOrderSchema.index({ accountId: 1, timestamp: -1 });
TradeOrderSchema.index({ symbol: 1, timestamp: -1 });
TradeOrderSchema.index({ status: 1, timestamp: -1 });
TradeOrderSchema.index({ accountId: 1, symbol: 1, timestamp: -1 });

// 添加数据验证中间件
TradeOrderSchema.pre('save', function(next) {
  // 限价单必须有价格
  if (this.type === OrderType.LIMIT && !this.price) {
    next(new Error('Limit orders must have a price'));
    return;
  }
  
  // 验证杠杆倍数
  if (this.leverage && (this.leverage < 1 || this.leverage > 125)) {
    next(new Error('Leverage must be between 1 and 125'));
    return;
  }
  
  // 验证已成交数量不能超过订单数量
  if (this.filledQuantity && this.filledQuantity > this.quantity) {
    next(new Error('Filled quantity cannot exceed order quantity'));
    return;
  }
  
  next();
});