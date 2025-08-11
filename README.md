# K线策略模拟器

K线策略模拟器是一个纯API方式的交易策略回测和手动交易模拟系统。系统支持从Binance获取K线数据，实现多种预设交易策略的回测，以及手动交易模拟功能。

## 技术栈

### 后端
- **框架**: NestJS + TypeScript
- **数据库**: MongoDB (主数据存储)
- **缓存**: Redis (实时数据缓存)
- **API集成**: binance-connector-js
- **AI分析**: OpenAI API + MCP (Model Context Protocol)

### 前端
- **框架**: React + TypeScript + Hooks
- **构建工具**: Vite
- **UI组件**: Ant Design
- **图表**: KLineCharts
- **状态管理**: Zustand
- **数据获取**: TanStack Query

### 包管理
- **工具**: pnpm (工作空间管理)

## 项目结构

```
kline-strategy-simulator/
├── packages/
│   ├── backend/                    # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── controllers/        # API 控制器
│   │   │   │   ├── account.controller.ts
│   │   │   │   ├── market-data.controller.ts
│   │   │   │   └── strategy.controller.ts
│   │   │   ├── services/           # 业务服务层
│   │   │   │   ├── trading.service.ts
│   │   │   │   ├── account.service.ts
│   │   │   │   ├── pnl-calculator.service.ts
│   │   │   │   ├── pnl-monitor.service.ts
│   │   │   │   └── market-data.service.ts
│   │   │   ├── repositories/       # 数据访问层
│   │   │   │   ├── account.repository.ts
│   │   │   │   ├── position.repository.ts
│   │   │   │   ├── trade-order.repository.ts
│   │   │   │   └── kline-data.repository.ts
│   │   │   ├── schemas/            # MongoDB 数据模型
│   │   │   │   ├── account.schema.ts
│   │   │   │   ├── position.schema.ts
│   │   │   │   ├── trade-order.schema.ts
│   │   │   │   └── kline-data.schema.ts
│   │   │   ├── modules/            # NestJS 模块
│   │   │   │   ├── account.module.ts
│   │   │   │   ├── market-data.module.ts
│   │   │   │   └── strategy.module.ts
│   │   │   ├── extensions/         # 策略和指标扩展
│   │   │   │   ├── strategies/     # 交易策略实现
│   │   │   │   ├── indicators/     # 技术指标实现
│   │   │   │   └── plugin-loader.ts
│   │   │   ├── dto/                # 数据传输对象
│   │   │   ├── common/             # 通用组件
│   │   │   └── config/             # 配置文件
│   │   ├── plugins/                # 外部插件目录
│   │   ├── scripts/                # 工具脚本
│   │   └── package.json
│   └── frontend/                   # React 前端应用
│       ├── src/
│       │   ├── components/         # React 组件
│       │   ├── pages/              # 页面组件
│       │   ├── hooks/              # 自定义 Hooks
│       │   ├── services/           # API 服务
│       │   ├── stores/             # 状态管理
│       │   └── types/              # TypeScript 类型
│       └── package.json
├── .kiro/                          # Kiro IDE 配置
│   └── specs/                      # 项目规格文档
├── package.json                    # 根包配置
├── pnpm-workspace.yaml             # pnpm 工作空间配置
└── README.md
```

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- MongoDB >= 5.0
- Redis >= 6.0

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 环境配置

1. 复制环境变量模板：
```bash
cp .env.example .env
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

2. 配置环境变量：
   - 设置 MongoDB 连接字符串
   - 设置 Redis 连接字符串
   - 配置 Binance API 密钥（可选，用于实时数据）
   - 配置 OpenAI API 密钥（可选，用于AI分析）

### 启动服务

```bash
# 启动开发环境（前后端同时启动）
pnpm dev

# 或者分别启动
pnpm --filter @kline-simulator/backend dev
pnpm --filter @kline-simulator/frontend dev
```

### 访问应用

- 前端应用: http://localhost:3001
- 后端API: http://localhost:3000
- API健康检查: http://localhost:3000/health
- Swagger文档: http://localhost:3000/api

## API 接口

### 账户管理
```bash
# 创建账户
POST /accounts
{
  "name": "Test Account",
  "initialBalance": 10000,
  "initialAsset": "USDT"
}

# 获取账户信息
GET /accounts/{accountId}

# 获取账户余额
GET /accounts/{accountId}/balances

# 获取账户持仓
GET /accounts/{accountId}/positions

# 获取账户交易历史
GET /accounts/{accountId}/trades

# 获取账户风险评估
GET /accounts/{accountId}/risk

# 获取账户性能统计
GET /accounts/{accountId}/performance
```

### 交易执行
```bash
# 执行交易
POST /accounts/{accountId}/trades
{
  "symbol": "BTCUSDT",
  "side": "BUY",
  "type": "MARKET",
  "quantity": 0.001,
  "leverage": 1
}

# 取消所有订单
DELETE /accounts/{accountId}/orders
```

### 市场数据
```bash
# 获取K线数据
GET /market-data/klines?symbol=BTCUSDT&interval=1h&limit=100

# 获取最新价格
GET /market-data/ticker/price?symbol=BTCUSDT

# 获取24小时统计
GET /market-data/ticker/24hr?symbol=BTCUSDT
```

## 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发环境
pnpm dev

# 构建项目
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 清理构建文件
pnpm clean

# TypeScript 类型检查
pnpm type-check

# 后端专用命令
pnpm --filter @kline-simulator/backend dev
pnpm --filter @kline-simulator/backend test
pnpm --filter @kline-simulator/backend build

# 前端专用命令
pnpm --filter @kline-simulator/frontend dev
pnpm --filter @kline-simulator/frontend test
pnpm --filter @kline-simulator/frontend build
```

## 测试

项目包含完整的测试套件：

```bash
# 运行所有测试
pnpm test

# 运行后端测试
pnpm --filter @kline-simulator/backend test

# 运行测试并生成覆盖率报告
pnpm --filter @kline-simulator/backend test:cov

# 监听模式运行测试
pnpm --filter @kline-simulator/backend test:watch
```

### 测试覆盖范围
- **单元测试**: 服务层、仓储层、工具函数
- **集成测试**: API端点、数据库操作
- **模拟测试**: 外部API调用、WebSocket连接

## 部署

### Docker 部署
```bash
# 构建镜像
docker build -t kline-simulator .

# 运行容器
docker-compose up -d
```

### 生产环境配置
1. 设置生产环境变量
2. 配置数据库连接
3. 设置Redis缓存
4. 配置API密钥
5. 启用HTTPS

## 功能特性

### 已完成功能 ✅
- **项目基础架构搭建** - 完整的 NestJS + React 架构
- **数据存储系统** - MongoDB 数据模型和仓储层
- **Binance API集成** - 市场数据获取和WebSocket实时数据
- **交易执行引擎** - 现货和合约交易支持，风险控制
- **PNL计算系统** - 实时盈亏计算，保证金管理，风险监控
- **账户管理服务** - 多资产余额管理，权益计算，性能统计
- **技术指标系统** - KDJ、MACD、RSI等多种指标实现
- **策略扩展框架** - 插件化策略开发和管理

### 开发中功能 🚧
- **交易策略回测引擎** - 历史数据回测和性能分析
- **手动交易模拟功能** - 实时交易模拟界面
- **AI智能分析服务** - OpenAI集成的智能分析
- **KLineCharts图表集成** - 专业K线图表显示

## 核心模块

### 交易系统
- **TradingService**: 交易执行引擎，支持现货和合约交易
- **PNLCalculatorService**: 实时盈亏计算和风险评估
- **PNLMonitorService**: 定时监控和事件驱动的PNL更新
- **AccountService**: 账户管理和资金控制

### 数据管理
- **MarketDataService**: 市场数据获取和缓存
- **KlineDataRepository**: K线数据存储和查询
- **AccountRepository**: 账户数据管理
- **PositionRepository**: 持仓数据管理
- **TradeOrderRepository**: 交易订单管理

### 策略系统
- **StrategyRegistry**: 策略注册和管理
- **IndicatorRegistry**: 技术指标注册
- **PluginLoader**: 动态插件加载和热重载

## 架构设计

### 设计模式
- **仓储模式 (Repository Pattern)**: 数据访问层抽象
- **服务层模式 (Service Layer)**: 业务逻辑封装
- **观察者模式 (Observer Pattern)**: 实时数据更新
- **策略模式 (Strategy Pattern)**: 交易策略实现
- **工厂模式 (Factory Pattern)**: 指标和策略创建

### 核心特性
- **类型安全**: 完整的 TypeScript 类型定义
- **模块化**: 清晰的模块边界和依赖关系
- **可扩展**: 插件化的策略和指标系统
- **高性能**: Redis缓存和数据库优化
- **实时性**: WebSocket实时数据推送
- **容错性**: 完善的错误处理和重试机制

### 数据流
```
Binance API → MarketDataService → Redis Cache → WebSocket → Frontend
                     ↓
              KlineDataRepository → MongoDB
                     ↓
              TradingService → PNLCalculator → AccountService
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。