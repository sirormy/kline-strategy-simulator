import { BadRequestException } from '@nestjs/common';

/**
 * 验证交易对格式
 */
export function validateSymbol(symbol: string): boolean {
  const symbolRegex = /^[A-Z0-9]+[A-Z]{3,}$/;
  return symbolRegex.test(symbol);
}

/**
 * 验证时间间隔格式
 */
export function validateInterval(interval: string): boolean {
  const validIntervals = [
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d', '1w', '1M'
  ];
  return validIntervals.includes(interval);
}

/**
 * 验证价格数据的逻辑关系
 */
export function validatePriceData(open: number, high: number, low: number, close: number): void {
  if (high < low) {
    throw new BadRequestException('High price cannot be lower than low price');
  }
  
  if (open < low || open > high) {
    throw new BadRequestException('Open price must be between low and high prices');
  }
  
  if (close < low || close > high) {
    throw new BadRequestException('Close price must be between low and high prices');
  }
}

/**
 * 验证时间范围
 */
export function validateTimeRange(startTime: number, endTime: number): void {
  if (startTime >= endTime) {
    throw new BadRequestException('Start time must be before end time');
  }
  
  const now = Date.now();
  if (endTime > now) {
    throw new BadRequestException('End time cannot be in the future');
  }
}

/**
 * 验证杠杆倍数
 */
export function validateLeverage(leverage: number): void {
  if (leverage < 1 || leverage > 125) {
    throw new BadRequestException('Leverage must be between 1 and 125');
  }
}

/**
 * 验证分页参数
 */
export function validatePagination(page: number, limit: number): void {
  if (page < 1) {
    throw new BadRequestException('Page must be greater than 0');
  }
  
  if (limit < 1 || limit > 1000) {
    throw new BadRequestException('Limit must be between 1 and 1000');
  }
}

/**
 * 验证账户余额是否足够
 */
export function validateSufficientBalance(available: number, required: number): void {
  if (available < required) {
    throw new BadRequestException('Insufficient balance');
  }
}

/**
 * 验证策略参数
 */
export function validateStrategyParameters(parameters: any, schema: any[]): void {
  for (const paramSchema of schema) {
    const value = parameters[paramSchema.name];
    
    // 检查必需参数
    if (paramSchema.required && (value === undefined || value === null)) {
      throw new BadRequestException(`Required parameter '${paramSchema.name}' is missing`);
    }
    
    if (value !== undefined && value !== null) {
      // 检查参数类型
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== paramSchema.type) {
        throw new BadRequestException(
          `Parameter '${paramSchema.name}' must be of type ${paramSchema.type}, got ${actualType}`
        );
      }
      
      // 检查数值范围
      if (paramSchema.type === 'number') {
        if (paramSchema.min !== undefined && value < paramSchema.min) {
          throw new BadRequestException(
            `Parameter '${paramSchema.name}' must be >= ${paramSchema.min}`
          );
        }
        if (paramSchema.max !== undefined && value > paramSchema.max) {
          throw new BadRequestException(
            `Parameter '${paramSchema.name}' must be <= ${paramSchema.max}`
          );
        }
      }
      
      // 检查选项值
      if (paramSchema.options && !paramSchema.options.includes(value)) {
        throw new BadRequestException(
          `Parameter '${paramSchema.name}' must be one of: ${paramSchema.options.join(', ')}`
        );
      }
    }
  }
}

/**
 * 清理和标准化交易对名称
 */
export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

/**
 * 清理和标准化时间间隔
 */
export function normalizeInterval(interval: string): string {
  return interval.toLowerCase().trim();
}

/**
 * 生成唯一ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `${prefix}${timestamp}${random}`;
}

/**
 * 计算分页偏移量
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * 格式化价格精度
 */
export function formatPrice(price: number, precision: number = 8): number {
  return parseFloat(price.toFixed(precision));
}

/**
 * 格式化数量精度
 */
export function formatQuantity(quantity: number, precision: number = 8): number {
  return parseFloat(quantity.toFixed(precision));
}