import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AccountService, CreateAccountRequest, BalanceUpdate } from '../services/account.service';
import { TradingService } from '../services/trading.service';
import { PNLCalculatorService } from '../services/pnl-calculator.service';
import { Account, AccountDocument, AccountConfig } from '../schemas/account.schema';
import { CreateTradeOrderDto, QueryTradeOrderDto } from '../dto/trade-order.dto';
import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, ValidateNested, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

// DTOs for account management
class CreateAccountDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  initialBalance: number;

  @IsOptional()
  @IsString()
  initialAsset?: string;

  @IsOptional()
  config?: Partial<AccountConfig>;
}

class UpdateBalanceDto {
  @IsString()
  asset: string;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  freeChange: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  lockedChange?: number;

  @IsString()
  reason: string;
}

class BulkUpdateBalanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBalanceDto)
  updates: UpdateBalanceDto[];
}

class UpdateAccountConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseFloat(value))
  defaultLeverage?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  maxPositions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Transform(({ value }) => parseFloat(value))
  riskPerTrade?: number;

  @IsOptional()
  @IsBoolean()
  autoStopLoss?: boolean;

  @IsOptional()
  @IsBoolean()
  autoTakeProfit?: boolean;
}

class ResetAccountDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Transform(({ value }) => parseFloat(value))
  initialBalance?: number;

  @IsOptional()
  @IsString()
  initialAsset?: string;
}

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly accountService: AccountService,
    private readonly tradingService: TradingService,
    private readonly pnlCalculatorService: PNLCalculatorService,
  ) {}

  /**
   * 创建新账户
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAccount(@Body(ValidationPipe) createAccountDto: CreateAccountDto): Promise<AccountDocument> {
    return this.accountService.createAccount(createAccountDto);
  }

  /**
   * 初始化默认账户
   */
  @Post('default')
  @HttpCode(HttpStatus.CREATED)
  async initializeDefaultAccount(): Promise<AccountDocument> {
    return this.accountService.initializeDefaultAccount();
  }

  /**
   * 获取账户信息
   */
  @Get(':accountId')
  async getAccountInfo(@Param('accountId') accountId: string) {
    return this.accountService.getAccountInfo(accountId);
  }

  /**
   * 获取账户余额
   */
  @Get(':accountId/balances')
  async getAccountBalances(
    @Param('accountId') accountId: string,
    @Query('asset') asset?: string
  ) {
    return this.accountService.getAccountBalance(accountId, asset);
  }

  /**
   * 更新账户余额
   */
  @Put(':accountId/balances')
  async updateAccountBalance(
    @Param('accountId') accountId: string,
    @Body(ValidationPipe) updateBalanceDto: BulkUpdateBalanceDto
  ): Promise<AccountDocument> {
    return this.accountService.updateBalance(accountId, updateBalanceDto.updates);
  }

  /**
   * 获取账户持仓
   */
  @Get(':accountId/positions')
  async getAccountPositions(
    @Param('accountId') accountId: string,
    @Query('closed') closed?: string
  ) {
    const isClosed = closed === 'true';
    return this.tradingService.getPositions(accountId, isClosed);
  }

  /**
   * 获取账户交易历史
   */
  @Get(':accountId/trades')
  async getAccountTrades(
    @Param('accountId') accountId: string,
    @Query(ValidationPipe) query: QueryTradeOrderDto
  ) {
    return this.tradingService.getTradeHistory(accountId, {
      symbol: query.symbol,
      startTime: query.startTime,
      endTime: query.endTime,
      limit: query.limit,
      page: query.page,
    });
  }

  /**
   * 执行交易
   */
  @Post(':accountId/trades')
  @HttpCode(HttpStatus.CREATED)
  async executeTrade(
    @Param('accountId') accountId: string,
    @Body(ValidationPipe) createTradeOrderDto: CreateTradeOrderDto
  ) {
    return this.tradingService.executeTrade({
      accountId,
      symbol: createTradeOrderDto.symbol,
      side: createTradeOrderDto.side,
      type: createTradeOrderDto.type,
      quantity: createTradeOrderDto.quantity,
      price: createTradeOrderDto.price,
      leverage: createTradeOrderDto.leverage,
      marginType: createTradeOrderDto.marginType,
    });
  }

  /**
   * 获取账户风险评估
   */
  @Get(':accountId/risk')
  async getAccountRisk(@Param('accountId') accountId: string) {
    return this.accountService.assessRisk(accountId);
  }

  /**
   * 获取账户性能统计
   */
  @Get(':accountId/performance')
  async getAccountPerformance(@Param('accountId') accountId: string) {
    return this.accountService.getAccountPerformance(accountId);
  }

  /**
   * 获取账户PNL详情
   */
  @Get(':accountId/pnl')
  async getAccountPNL(@Param('accountId') accountId: string) {
    const positions = await this.tradingService.getPositions(accountId, false);
    
    if (positions.length === 0) {
      return {
        totalUnrealizedPnl: 0,
        totalRealizedPnl: 0,
        totalPnl: 0,
        totalCommission: 0,
        totalFundingFee: 0,
        totalNetPnl: 0,
        positionPnls: {},
      };
    }

    return this.pnlCalculatorService.calculatePortfolioPNL(positions);
  }

  /**
   * 更新账户权益信息
   */
  @Put(':accountId/equity')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateAccountEquity(@Param('accountId') accountId: string): Promise<void> {
    await this.accountService.updateAccountEquity(accountId);
  }

  /**
   * 激活/停用账户
   */
  @Patch(':accountId/status')
  async toggleAccountStatus(
    @Param('accountId') accountId: string,
    @Body('isActive') isActive: boolean
  ): Promise<AccountDocument> {
    return this.accountService.toggleAccountStatus(accountId, isActive);
  }

  /**
   * 更新账户配置
   */
  @Put(':accountId/config')
  async updateAccountConfig(
    @Param('accountId') accountId: string,
    @Body(ValidationPipe) updateConfigDto: UpdateAccountConfigDto
  ): Promise<AccountDocument> {
    return this.accountService.updateAccountConfig(accountId, updateConfigDto);
  }

  /**
   * 重置账户（用于模拟测试）
   */
  @Post(':accountId/reset')
  async resetAccount(
    @Param('accountId') accountId: string,
    @Body(ValidationPipe) resetAccountDto: ResetAccountDto
  ): Promise<AccountDocument> {
    return this.accountService.resetAccount(
      accountId,
      resetAccountDto.initialBalance,
      resetAccountDto.initialAsset
    );
  }

  /**
   * 取消账户的所有待处理订单
   */
  @Delete(':accountId/orders')
  async cancelAllOrders(
    @Param('accountId') accountId: string,
    @Query('symbol') symbol?: string
  ): Promise<{ cancelledCount: number }> {
    const cancelledCount = await this.tradingService.cancelAllOrders(accountId, symbol);
    return { cancelledCount };
  }

  /**
   * 获取账户统计概览
   */
  @Get(':accountId/stats')
  async getAccountStats(@Param('accountId') accountId: string) {
    const [accountInfo, performance, risk, pnl] = await Promise.all([
      this.accountService.getAccountInfo(accountId),
      this.accountService.getAccountPerformance(accountId),
      this.accountService.assessRisk(accountId),
      this.getAccountPNL(accountId),
    ]);

    return {
      account: {
        accountId: accountInfo.accountId,
        name: accountInfo.name,
        totalEquity: accountInfo.totalEquity,
        availableMargin: accountInfo.availableMargin,
        usedMargin: accountInfo.usedMargin,
        isActive: accountInfo.isActive,
      },
      performance,
      risk,
      pnl: {
        totalUnrealizedPnl: pnl.totalUnrealizedPnl,
        totalRealizedPnl: pnl.totalRealizedPnl,
        totalNetPnl: pnl.totalNetPnl,
      },
    };
  }

  /**
   * 获取所有活跃账户列表
   */
  @Get()
  async getActiveAccounts() {
    const accounts = await this.accountService['accountRepository'].findActiveAccounts();
    
    return accounts.map(account => ({
      accountId: account.accountId,
      name: account.name,
      totalEquity: account.totalEquity,
      availableMargin: account.availableMargin,
      usedMargin: account.usedMargin,
      unrealizedPnl: account.unrealizedPnl,
      realizedPnl: account.realizedPnl,
      isActive: account.isActive,
      createdAt: (account as any).createdAt,
    }));
  }

  /**
   * 健康检查 - 验证账户数据一致性
   */
  @Get(':accountId/health')
  async checkAccountHealth(@Param('accountId') accountId: string) {
    const accountInfo = await this.accountService.getAccountInfo(accountId);
    const positions = await this.tradingService.getPositions(accountId, false);
    
    // 验证保证金计算
    const calculatedUsedMargin = positions.reduce((sum, pos) => sum + pos.margin, 0);
    const marginDiscrepancy = Math.abs(accountInfo.usedMargin - calculatedUsedMargin);
    
    // 验证未实现盈亏
    const pnlResult = await this.pnlCalculatorService.calculatePortfolioPNL(positions);
    const pnlDiscrepancy = Math.abs(accountInfo.unrealizedPnl - pnlResult.totalUnrealizedPnl);
    
    const isHealthy = marginDiscrepancy < 0.01 && pnlDiscrepancy < 0.01;
    
    return {
      isHealthy,
      checks: {
        marginCalculation: {
          expected: calculatedUsedMargin,
          actual: accountInfo.usedMargin,
          discrepancy: marginDiscrepancy,
          passed: marginDiscrepancy < 0.01,
        },
        pnlCalculation: {
          expected: pnlResult.totalUnrealizedPnl,
          actual: accountInfo.unrealizedPnl,
          discrepancy: pnlDiscrepancy,
          passed: pnlDiscrepancy < 0.01,
        },
      },
      recommendations: isHealthy ? [] : [
        'Consider updating account equity to fix discrepancies',
        'Check for stale position data',
      ],
    };
  }
}