import { IsString, IsNumber, IsBoolean, IsArray, IsObject, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class BalanceDto {
  @IsString()
  asset: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  free: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  locked: number;
}

export class CreateAccountDto {
  @IsString()
  accountId: string;

  @IsString()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BalanceDto)
  balances: BalanceDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  totalEquity?: number = 0;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean = true;

  @IsOptional()
  @IsObject()
  config?: {
    defaultLeverage?: number;
    maxPositions?: number;
    riskPerTrade?: number;
    autoStopLoss?: boolean;
    autoTakeProfit?: boolean;
    [key: string]: any;
  };
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BalanceDto)
  balances?: BalanceDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  totalEquity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  availableMargin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  usedMargin?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  unrealizedPnl?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  realizedPnl?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: {
    defaultLeverage?: number;
    maxPositions?: number;
    riskPerTrade?: number;
    autoStopLoss?: boolean;
    autoTakeProfit?: boolean;
    [key: string]: any;
  };
}

export class UpdateBalanceDto {
  @IsString()
  asset: string;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  freeChange: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  lockedChange?: number = 0;
}

export class QueryAccountDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

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