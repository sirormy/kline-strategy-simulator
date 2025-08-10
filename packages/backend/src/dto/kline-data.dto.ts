import { IsString, IsNumber, IsPositive, Min, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateKlineDataDto {
  @IsString()
  symbol: string;

  @IsString()
  interval: string;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  openTime: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  closeTime: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  open: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  high: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  low: number;

  @IsNumber()
  @IsPositive()
  @Transform(({ value }) => parseFloat(value))
  close: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  volume: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  quoteVolume: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  trades: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  takerBuyBaseVolume: number;

  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  takerBuyQuoteVolume: number;
}

export class QueryKlineDataDto {
  @IsString()
  symbol: string;

  @IsString()
  interval: string;

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
  limit?: number = 500;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;
}

export class BulkCreateKlineDataDto {
  @IsString()
  symbol: string;

  @IsString()
  interval: string;

  klines: CreateKlineDataDto[];
}