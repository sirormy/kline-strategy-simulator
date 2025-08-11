import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { TradeOrderRepository } from '../repositories/trade-order.repository';
import { AccountRepository } from '../repositories/account.repository';
import { PositionRepository } from '../repositories/position.repository';
import { MarketDataService } from './market-data.service';
import { 
  TradeOrder, 
  OrderSide, 
  OrderType, 
  OrderStatus, 
  MarginType 
} from '../schemas/trade-order.schema';
import { 
  Position, 
  PositionSide, 
  MarginType as PositionMarginType 
} from '../schemas/position.schema';
import { Account, AccountDocument } from '../schemas/account.schema';
import { v4 as uuidv4 } from 'uuid';

export interface TradeResult {
  orderId: string;
  status: OrderStatus;
  filledQuantity: number;
  filledPrice: number;
  commission: number;
  commissionAsset: string;
  timestamp: number;
  errorMessage?: string;
}

export interface RiskCheckResult {
  isValid: boolean;
  errorMessage?: string;
  requiredMargin?: number;
  availableMargin?: number;
}

export interface TradingFees {
  makerFee: number;
  takerFee: number;
  fundingRate?: number;
}

@Injectable()
export class TradingService {
  // 默认交易手续费配置
  private readonly defaultFees: TradingFees = {
    makerFee: 0.001,  // 0.1%
    takerFee: 0.001,  // 0.1%
    fundingRate: 0.0001, // 0.01% 每8小时
  };

  constructor(
    private readonly tradeOrderRepository: TradeOrderRepository,
    private readonly accountRepository: AccountRepository,
    private readonly positionRepository: PositionRepository,
    private readonly marketDataService: MarketDataService,
  ) {}

  /**
   * 执行交易订单
   */
  async executeTrade(orderData: {
    accountId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    leverage?: number;
    marginType?: MarginType;
  }): Promise<TradeResult> {
    const orderId = uuidv4();
    const timestamp = Date.now();

    try {
      // 1. 创建订单记录
      const order = await this.createTradeOrder({
        ...orderData,
        id: orderId,
        timestamp,
        status: OrderStatus.PENDING,
      });

      // 2. 风险检查
      const riskCheck = await this.checkRisk(order);
      if (!riskCheck.isValid) {
        await this.updateOrderStatus(orderId, OrderStatus.REJECTED, 0, 0, 0, 'USDT', riskCheck.errorMessage);
        return {
          orderId,
          status: OrderStatus.REJECTED,
          filledQuantity: 0,
          filledPrice: 0,
          commission: 0,
          commissionAsset: 'USDT',
          timestamp,
          errorMessage: riskCheck.errorMessage,
        };
      }

      // 3. 获取执行价格
      const executionPrice = await this.getExecutionPrice(order);
      if (!executionPrice) {
        await this.updateOrderStatus(orderId, OrderStatus.REJECTED, 0, 0, 0, 'USDT', 'Unable to get market price');
        return {
          orderId,
          status: OrderStatus.REJECTED,
          filledQuantity: 0,
          filledPrice: 0,
          commission: 0,
          commissionAsset: 'USDT',
          timestamp,
          errorMessage: 'Unable to get market price',
        };
      }

      // 4. 计算手续费
      const commission = this.calculateCommission(order.quantity, executionPrice, order.type);
      const commissionAsset = this.getCommissionAsset(order.symbol);

      // 5. 执行不同类型的交易
      let result: TradeResult;
      if (order.leverage && order.leverage > 1) {
        // 合约交易
        result = await this.executeFuturesTrade(order, executionPrice, commission, commissionAsset);
      } else {
        // 现货交易
        result = await this.executeSpotTrade(order, executionPrice, commission, commissionAsset);
      }

      return result;

    } catch (error) {
      // 更新订单状态为失败
      await this.updateOrderStatus(orderId, OrderStatus.REJECTED, 0, 0, 0, 'USDT', error.message);
      
      return {
        orderId,
        status: OrderStatus.REJECTED,
        filledQuantity: 0,
        filledPrice: 0,
        commission: 0,
        commissionAsset: 'USDT',
        timestamp,
        errorMessage: error.message,
      };
    }
  }

  /**
   * 执行现货交易
   */
  private async executeSpotTrade(
    order: TradeOrder,
    executionPrice: number,
    commission: number,
    commissionAsset: string
  ): Promise<TradeResult> {
    const account = await this.accountRepository.findByAccountId(order.accountId);
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const [baseAsset, quoteAsset] = order.symbol.split('USDT');
    const quoteAssetSymbol = quoteAsset || 'USDT';

    try {
      if (order.side === OrderSide.BUY) {
        // 买入：扣除报价资产，增加基础资产
        const totalCost = order.quantity * executionPrice + commission;
        
        // 检查余额
        const quoteBalance = account.getBalance(quoteAssetSymbol);
        if (!quoteBalance || quoteBalance.free < totalCost) {
          throw new BadRequestException(`Insufficient ${quoteAssetSymbol} balance`);
        }

        // 更新余额
        await this.accountRepository.updateAccountBalance(
          order.accountId,
          quoteAssetSymbol,
          -totalCost,
          0
        );
        
        await this.accountRepository.updateAccountBalance(
          order.accountId,
          baseAsset,
          order.quantity,
          0
        );

      } else {
        // 卖出：扣除基础资产，增加报价资产
        const baseBalance = account.getBalance(baseAsset);
        if (!baseBalance || baseBalance.free < order.quantity) {
          throw new BadRequestException(`Insufficient ${baseAsset} balance`);
        }

        const totalReceived = order.quantity * executionPrice - commission;

        // 更新余额
        await this.accountRepository.updateAccountBalance(
          order.accountId,
          baseAsset,
          -order.quantity,
          0
        );
        
        await this.accountRepository.updateAccountBalance(
          order.accountId,
          quoteAssetSymbol,
          totalReceived,
          0
        );
      }

      // 更新订单状态
      await this.updateOrderStatus(
        order.id,
        OrderStatus.FILLED,
        order.quantity,
        executionPrice,
        commission,
        commissionAsset
      );

      // 更新账户统计
      await this.updateAccountStats(order.accountId, {
        pnl: 0, // 现货交易没有直接的PNL
        isWin: true,
        commission,
      });

      return {
        orderId: order.id,
        status: OrderStatus.FILLED,
        filledQuantity: order.quantity,
        filledPrice: executionPrice,
        commission,
        commissionAsset,
        timestamp: order.timestamp,
      };

    } catch (error) {
      throw new InternalServerErrorException(`Spot trade execution failed: ${error.message}`);
    }
  }

  /**
   * 执行合约交易
   */
  private async executeFuturesTrade(
    order: TradeOrder,
    executionPrice: number,
    commission: number,
    commissionAsset: string
  ): Promise<TradeResult> {
    const account = await this.accountRepository.findByAccountId(order.accountId);
    if (!account) {
      throw new BadRequestException('Account not found');
    }

    try {
      // 检查是否已有该交易对的持仓
      const existingPosition = await this.positionRepository.findByAccountAndSymbol(
        order.accountId,
        order.symbol,
        false
      );

      const positionSide = order.side === OrderSide.BUY ? PositionSide.LONG : PositionSide.SHORT;
      const leverage = order.leverage || 1;
      const requiredMargin = (order.quantity * executionPrice) / leverage;

      if (existingPosition) {
        // 更新现有持仓
        await this.updateExistingPosition(existingPosition, order, executionPrice, commission);
      } else {
        // 创建新持仓
        await this.createNewPosition(order, executionPrice, commission, positionSide, leverage, requiredMargin);
      }

      // 扣除保证金和手续费
      await this.accountRepository.updateAccountBalance(
        order.accountId,
        'USDT',
        -(requiredMargin + commission),
        requiredMargin // 锁定保证金
      );

      // 更新账户保证金信息
      await this.updateAccountMargin(order.accountId);

      // 更新订单状态
      await this.updateOrderStatus(
        order.id,
        OrderStatus.FILLED,
        order.quantity,
        executionPrice,
        commission,
        commissionAsset
      );

      return {
        orderId: order.id,
        status: OrderStatus.FILLED,
        filledQuantity: order.quantity,
        filledPrice: executionPrice,
        commission,
        commissionAsset,
        timestamp: order.timestamp,
      };

    } catch (error) {
      throw new InternalServerErrorException(`Futures trade execution failed: ${error.message}`);
    }
  }

  /**
   * 创建新持仓
   */
  private async createNewPosition(
    order: TradeOrder,
    executionPrice: number,
    commission: number,
    positionSide: PositionSide,
    leverage: number,
    requiredMargin: number
  ): Promise<void> {
    const positionId = uuidv4();
    
    const position: Partial<Position> = {
      id: positionId,
      accountId: order.accountId,
      symbol: order.symbol,
      side: positionSide,
      size: order.quantity,
      entryPrice: executionPrice,
      markPrice: executionPrice,
      leverage,
      margin: requiredMargin,
      unrealizedPnl: 0,
      marginType: order.marginType === MarginType.ISOLATED ? 
        PositionMarginType.ISOLATED : PositionMarginType.CROSS,
      openTime: order.timestamp,
      totalCommission: commission,
      totalFundingFee: 0,
      isClosed: false,
    };

    await this.positionRepository.create(position);
  }

  /**
   * 更新现有持仓
   */
  private async updateExistingPosition(
    existingPosition: Position,
    order: TradeOrder,
    executionPrice: number,
    commission: number
  ): Promise<void> {
    const orderSide = order.side === OrderSide.BUY ? PositionSide.LONG : PositionSide.SHORT;
    
    if (existingPosition.side === orderSide) {
      // 同方向：增加持仓
      const newSize = existingPosition.size + order.quantity;
      const newEntryPrice = (
        (existingPosition.size * existingPosition.entryPrice) + 
        (order.quantity * executionPrice)
      ) / newSize;
      
      await this.positionRepository.update(existingPosition.id, {
        size: newSize,
        entryPrice: newEntryPrice,
        totalCommission: existingPosition.totalCommission + commission,
      });
    } else {
      // 反方向：减少或反转持仓
      if (order.quantity < existingPosition.size) {
        // 部分平仓
        const newSize = existingPosition.size - order.quantity;
        await this.positionRepository.update(existingPosition.id, {
          size: newSize,
          totalCommission: existingPosition.totalCommission + commission,
        });
      } else if (order.quantity === existingPosition.size) {
        // 完全平仓
        await this.positionRepository.closePosition(
          existingPosition.id,
          executionPrice,
          order.timestamp
        );
      } else {
        // 反转持仓：先平仓再开新仓
        await this.positionRepository.closePosition(
          existingPosition.id,
          executionPrice,
          order.timestamp
        );
        
        const remainingQuantity = order.quantity - existingPosition.size;
        await this.createNewPosition(
          { ...order, quantity: remainingQuantity },
          executionPrice,
          commission,
          orderSide,
          order.leverage || 1,
          (remainingQuantity * executionPrice) / (order.leverage || 1)
        );
      }
    }
  }

  /**
   * 风险检查
   */
  async checkRisk(order: TradeOrder): Promise<RiskCheckResult> {
    const account: AccountDocument | null = await this.accountRepository.findByAccountId(order.accountId);
    if (!account) {
      return {
        isValid: false,
        errorMessage: 'Account not found',
      };
    }

    if (!account.isActive) {
      return {
        isValid: false,
        errorMessage: 'Account is not active',
      };
    }

    // 检查订单参数
    if (order.quantity <= 0) {
      return {
        isValid: false,
        errorMessage: 'Order quantity must be positive',
      };
    }

    if (order.type === OrderType.LIMIT && (!order.price || order.price <= 0)) {
      return {
        isValid: false,
        errorMessage: 'Limit orders must have a valid price',
      };
    }

    // 检查杠杆
    if (order.leverage && (order.leverage < 1 || order.leverage > 125)) {
      return {
        isValid: false,
        errorMessage: 'Leverage must be between 1 and 125',
      };
    }

    // 获取当前价格用于计算
    const currentPrice = await this.getCurrentPrice(order.symbol);
    if (!currentPrice) {
      return {
        isValid: false,
        errorMessage: 'Unable to get current market price',
      };
    }

    const executionPrice = order.type === OrderType.LIMIT ? order.price! : currentPrice;
    
    if (order.leverage && order.leverage > 1) {
      // 合约交易风险检查
      return this.checkFuturesRisk(order, account, executionPrice);
    } else {
      // 现货交易风险检查
      return this.checkSpotRisk(order, account, executionPrice);
    }
  }

  /**
   * 现货交易风险检查
   */
  private checkSpotRisk(order: TradeOrder, account: AccountDocument, executionPrice: number): RiskCheckResult {
    const [baseAsset, quoteAsset] = order.symbol.split('USDT');
    const quoteAssetSymbol = quoteAsset || 'USDT';
    
    const commission = this.calculateCommission(order.quantity, executionPrice, order.type);

    if (order.side === OrderSide.BUY) {
      // 买入检查：需要足够的报价资产
      const totalCost = order.quantity * executionPrice + commission;
      const quoteBalance = account.getBalance(quoteAssetSymbol);
      
      if (!quoteBalance || quoteBalance.free < totalCost) {
        return {
          isValid: false,
          errorMessage: `Insufficient ${quoteAssetSymbol} balance. Required: ${totalCost.toFixed(8)}, Available: ${quoteBalance?.free || 0}`,
        };
      }
    } else {
      // 卖出检查：需要足够的基础资产
      const baseBalance = account.getBalance(baseAsset);
      
      if (!baseBalance || baseBalance.free < order.quantity) {
        return {
          isValid: false,
          errorMessage: `Insufficient ${baseAsset} balance. Required: ${order.quantity}, Available: ${baseBalance?.free || 0}`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * 合约交易风险检查
   */
  private checkFuturesRisk(order: TradeOrder, account: AccountDocument, executionPrice: number): RiskCheckResult {
    const leverage = order.leverage || 1;
    const requiredMargin = (order.quantity * executionPrice) / leverage;
    const commission = this.calculateCommission(order.quantity, executionPrice, order.type);
    const totalRequired = requiredMargin + commission;

    // 检查可用保证金
    if (account.availableMargin < totalRequired) {
      return {
        isValid: false,
        errorMessage: `Insufficient margin. Required: ${totalRequired.toFixed(8)} USDT, Available: ${account.availableMargin.toFixed(8)} USDT`,
        requiredMargin: totalRequired,
        availableMargin: account.availableMargin,
      };
    }

    // 检查最大持仓限制
    const maxPositionValue = account.totalEquity * 0.8; // 最大80%的权益用于持仓
    const currentPositionValue = account.usedMargin * leverage;
    const newPositionValue = requiredMargin * leverage;

    if (currentPositionValue + newPositionValue > maxPositionValue) {
      return {
        isValid: false,
        errorMessage: `Position size exceeds maximum allowed. Max: ${maxPositionValue.toFixed(8)} USDT`,
      };
    }

    return { 
      isValid: true,
      requiredMargin: totalRequired,
      availableMargin: account.availableMargin,
    };
  }

  /**
   * 获取执行价格
   */
  private async getExecutionPrice(order: TradeOrder): Promise<number | null> {
    if (order.type === OrderType.LIMIT && order.price) {
      return order.price;
    }

    // 市价单获取当前市场价格
    return this.getCurrentPrice(order.symbol);
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // 从市场数据服务获取最新价格
      const tickerPrice = await this.marketDataService.getTickerPrice(symbol);
      if (Array.isArray(tickerPrice)) {
        const symbolTicker = tickerPrice.find(t => t.symbol === symbol);
        return symbolTicker ? parseFloat(symbolTicker.price) : null;
      } else if (tickerPrice && typeof tickerPrice === 'object' && 'price' in tickerPrice) {
        return parseFloat(tickerPrice.price);
      }
      
      // 备用方案：获取最近的K线数据
      const recentKlines = await this.marketDataService.getHistoricalKlines({
        symbol,
        interval: '1m',
        limit: 1
      });
      
      return recentKlines.length > 0 ? recentKlines[0].close : null;
    } catch (error) {
      console.error(`Failed to get current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * 计算手续费
   */
  private calculateCommission(quantity: number, price: number, orderType: OrderType): number {
    const notionalValue = quantity * price;
    const feeRate = orderType === OrderType.LIMIT ? this.defaultFees.makerFee : this.defaultFees.takerFee;
    return notionalValue * feeRate;
  }

  /**
   * 获取手续费资产
   */
  private getCommissionAsset(symbol: string): string {
    // 简化处理，统一使用USDT作为手续费资产
    return 'USDT';
  }

  /**
   * 创建交易订单记录
   */
  private async createTradeOrder(orderData: Partial<TradeOrder>): Promise<TradeOrder> {
    return this.tradeOrderRepository.create(orderData);
  }

  /**
   * 更新订单状态
   */
  private async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    filledQuantity: number,
    filledPrice: number,
    commission: number,
    commissionAsset: string,
    errorMessage?: string
  ): Promise<void> {
    await this.tradeOrderRepository.updateOrderStatus(
      orderId,
      status,
      filledQuantity,
      filledPrice,
      commission,
      commissionAsset,
      errorMessage
    );
  }

  /**
   * 更新账户保证金信息
   */
  private async updateAccountMargin(accountId: string): Promise<void> {
    // 获取所有活跃持仓
    const activePositions = await this.positionRepository.findActivePositions(accountId);
    
    // 计算总的已用保证金和未实现盈亏
    let totalUsedMargin = 0;
    let totalUnrealizedPnl = 0;

    for (const position of activePositions) {
      totalUsedMargin += position.margin;
      
      // 重新计算未实现盈亏
      const currentPrice = await this.getCurrentPrice(position.symbol);
      if (currentPrice) {
        const unrealizedPnl = this.calculateUnrealizedPnl(position, currentPrice);
        totalUnrealizedPnl += unrealizedPnl;
        
        // 更新持仓的标记价格和未实现盈亏
        await this.positionRepository.updateMarkPriceAndPnl(
          position.id,
          currentPrice,
          unrealizedPnl
        );
      }
    }

    // 更新账户保证金信息
    const account = await this.accountRepository.findByAccountId(accountId);
    if (account) {
      const totalEquity = account.totalEquity + totalUnrealizedPnl;
      const availableMargin = totalEquity - totalUsedMargin;

      await this.accountRepository.updateAccountEquity(
        accountId,
        totalEquity,
        availableMargin,
        totalUsedMargin,
        totalUnrealizedPnl
      );
    }
  }

  /**
   * 计算未实现盈亏
   */
  private calculateUnrealizedPnl(position: Position, currentPrice: number): number {
    const priceDiff = position.side === PositionSide.LONG 
      ? currentPrice - position.entryPrice 
      : position.entryPrice - currentPrice;
    
    return (priceDiff * position.size * position.leverage) - 
           position.totalCommission - position.totalFundingFee;
  }

  /**
   * 更新账户统计信息
   */
  private async updateAccountStats(accountId: string, tradeResult: {
    pnl: number;
    isWin: boolean;
    commission: number;
    fundingFee?: number;
  }): Promise<void> {
    await this.accountRepository.updateAccountStats(accountId, tradeResult);
  }

  /**
   * 获取交易历史
   */
  async getTradeHistory(accountId: string, filters?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    page?: number;
  }): Promise<any> {
    return this.tradeOrderRepository.findWithFiltersAndPagination({
      accountId,
      ...filters,
    });
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo(accountId: string): Promise<AccountDocument | null> {
    return this.accountRepository.findByAccountId(accountId);
  }

  /**
   * 获取持仓信息
   */
  async getPositions(accountId: string, isClosed: boolean = false): Promise<Position[]> {
    return this.positionRepository.findByAccountId(accountId, isClosed);
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = await this.tradeOrderRepository.findById(orderId);
    if (!order || order.status !== OrderStatus.PENDING) {
      return false;
    }

    await this.updateOrderStatus(
      orderId,
      OrderStatus.CANCELLED,
      0,
      0,
      0,
      'USDT',
      'Order cancelled by user'
    );

    return true;
  }

  /**
   * 批量取消订单
   */
  async cancelAllOrders(accountId: string, symbol?: string): Promise<number> {
    const filter: any = { accountId, status: OrderStatus.PENDING };
    if (symbol) filter.symbol = symbol;

    const pendingOrders = await this.tradeOrderRepository.find(filter);
    const orderIds = pendingOrders.map(order => order.id);

    if (orderIds.length > 0) {
      await this.tradeOrderRepository.bulkUpdateStatus(
        orderIds,
        OrderStatus.CANCELLED,
        'Bulk cancellation'
      );
    }

    return orderIds.length;
  }
}