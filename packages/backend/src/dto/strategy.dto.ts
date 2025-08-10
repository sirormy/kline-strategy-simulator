import { IsString, IsBoolean, IsArray, IsObject, IsOptional, ValidateNested, IsNumber, Min, IsPositive } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { StrategyMetadata } from '../schemas/strategy.schema';

export class CreateStrategyDto {
  @IsString()
  accountId: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  version: string;

  @IsObject()
  parameters: { [key: string]: any };

  @IsArray()
  @IsString({ each: true })
  symbols: string[];

  @IsString()
  timeframe: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enabled?: boolean = true;

  @IsOptional()
  @ValidateNested()
  @Type(() => StrategyMetadata)
  metadata?: StrategyMetadata;

  @IsOptional()
  @IsObject()
  config?: {
    maxPositions?: number;
    riskPerTrade?: number;
    stopLoss?: number;
    takeProfit?: number;
    [key: string]: any;
  };
}

export class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  parameters?: { [key: string]: any };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symbols?: string[];

  @IsOptional()
  @IsString()
  timeframe?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: {
    maxPositions?: number;
    riskPerTrade?: number;
    stopLoss?: number;
    takeProfit?: number;
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  state?: {
    lastExecutionTime?: number;
    totalTrades?: number;
    winningTrades?: number;
    totalPnl?: number;
    [key: string]: any;
  };
}

export class QueryStrategyDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enabled?: boolean;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsString()
  timeframe?: string;

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

export class BacktestStrategyDto {
  @IsString()
  strategyId: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  startTime: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  endTime: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  initialBalance?: number = 10000;

  @IsOptional()
  @IsObject()
  backtestConfig?: {
    commission?: number;
    slippage?: number;
    [key: string]: any;
  };
}