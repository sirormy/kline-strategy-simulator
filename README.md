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
│   ├── backend/          # NestJS 后端服务
│   │   ├── src/
│   │   │   ├── modules/  # 业务模块
│   │   │   ├── common/   # 通用组件
│   │   │   └── config/   # 配置文件
│   │   └── package.json
│   └── frontend/         # React 前端应用
│       ├── src/
│       │   ├── components/  # React 组件
│       │   ├── pages/      # 页面组件
│       │   ├── hooks/      # 自定义 Hooks
│       │   ├── services/   # API 服务
│       │   ├── stores/     # 状态管理
│       │   └── types/      # TypeScript 类型
│       └── package.json
├── package.json          # 根包配置
├── pnpm-workspace.yaml   # pnpm 工作空间配置
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
```

## 功能特性

- ✅ 项目基础架构搭建
- 🚧 Binance API集成和市场数据服务
- 🚧 交易策略回测引擎
- 🚧 手动交易模拟功能
- 🚧 技术指标计算和显示
- 🚧 AI智能分析服务
- 🚧 策略和指标扩展系统
- 🚧 KLineCharts图表集成

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。