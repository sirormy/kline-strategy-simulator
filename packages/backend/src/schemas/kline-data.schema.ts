import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { IsString, IsNumber, IsPositive, Min } from 'class-validator';

export type KlineDataDocument = KlineData & Document;

@Schema({
  collection: 'klines',
  timestamps: true,
})
export class KlineData {
  @Prop({ required: true, index: true })
  @IsString()
  symbol: string;

  @Prop({ required: true, index: true })
  @IsString()
  interval: string;

  @Prop({ required: true, index: true })
  @IsNumber()
  @Min(0)
  openTime: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  closeTime: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  open: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  high: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  low: number;

  @Prop({ required: true })
  @IsNumber()
  @IsPositive()
  close: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  volume: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  quoteVolume: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  trades: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  takerBuyBaseVolume: number;

  @Prop({ required: true })
  @IsNumber()
  @Min(0)
  takerBuyQuoteVolume: number;
}

export const KlineDataSchema = SchemaFactory.createForClass(KlineData);

// 创建复合索引
KlineDataSchema.index({ symbol: 1, interval: 1, openTime: 1 }, { unique: true });
KlineDataSchema.index({ symbol: 1, interval: 1, openTime: -1 });
KlineDataSchema.index({ symbol: 1, interval: 1, closeTime: 1 });

// 添加数据验证中间件
KlineDataSchema.pre('save', function(next) {
  // 验证价格逻辑关系
  if (this.high < this.low) {
    next(new Error('High price cannot be lower than low price'));
    return;
  }
  
  if (this.open < this.low || this.open > this.high) {
    next(new Error('Open price must be between low and high prices'));
    return;
  }
  
  if (this.close < this.low || this.close > this.high) {
    next(new Error('Close price must be between low and high prices'));
    return;
  }
  
  if (this.openTime >= this.closeTime) {
    next(new Error('Open time must be before close time'));
    return;
  }
  
  next();
});