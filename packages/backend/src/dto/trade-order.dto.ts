import { IsString, IsNumber, IsPositive, IsEnum, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderSide, OrderType, OrderStatus, OrderMarginType } from '../schemas';

export class CreateTradeOrderDto {
  @IsString()
  accountId: string;

  @IsString()
  symbol: string;

  @IsEnum(OrderSide)
  side: OrderSide;

  @IsEnum(OrderType)
  type: OrderType;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  quantity: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  price?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  leverage?: number = 1;

  @IsOptional()
  @IsEnum(OrderMarginType)
  marginType?: OrderMarginType;
}

export class UpdateTradeOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  filledQuantity?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  filledPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  commission?: number;

  @IsOptional()
  @IsString()
  commissionAsset?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class QueryTradeOrderDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  startTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  endTime?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 100;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;
}