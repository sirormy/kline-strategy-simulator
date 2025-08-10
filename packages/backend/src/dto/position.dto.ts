import { IsString, IsNumber, IsPositive, IsEnum, IsOptional, Min, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PositionSide, PositionMarginType } from '../schemas';

export class CreatePositionDto {
  @IsString()
  accountId: string;

  @IsString()
  symbol: string;

  @IsEnum(PositionSide)
  side: PositionSide;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  size: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  entryPrice: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  markPrice: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  leverage?: number = 1;

  @IsOptional()
  @IsEnum(PositionMarginType)
  marginType?: PositionMarginType = PositionMarginType.CROSS;
}

export class UpdatePositionDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  size?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  markPrice?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  unrealizedPnl?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  totalCommission?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  totalFundingFee?: number;
}

export class ClosePositionDto {
  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  closePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  closeTime?: number = Date.now();
}

export class QueryPositionDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsEnum(PositionSide)
  side?: PositionSide;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isClosed?: boolean;

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