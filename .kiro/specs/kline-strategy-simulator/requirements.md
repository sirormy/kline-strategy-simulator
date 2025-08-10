# Requirements Document

## Introduction

K线策略模拟器是一个纯API方式的交易策略回测和手动交易模拟系统。系统支持从Binance获取K线数据，实现多种预设交易策略的回测，以及手动交易模拟功能。用户可以在本地环境中进行现货和合约交易的策略测试，实时计算PNL，并支持交易记录的存储和重现。

## Requirements

### Requirement 1

**User Story:** 作为交易策略研究者，我希望能够从Binance获取并存储K线数据，以便为策略回测提供数据基础。

#### Acceptance Criteria

1. WHEN 用户指定币种和时间间隔 THEN 系统 SHALL 从Binance API获取对应的K线数据
2. WHEN K线数据获取成功 THEN 系统 SHALL 将数据存储到MongoDB数据库中
3. WHEN 系统启动实时数据录入 THEN 系统 SHALL 通过WebSocket连接持续获取最新K线数据
4. IF 数据获取失败 THEN 系统 SHALL 记录错误日志并提供重试机制

### Requirement 2

**User Story:** 作为用户，我希望能够查询指定币种和时间间隔的K线数据，以便进行数据分析和策略测试。

#### Acceptance Criteria

1. WHEN 用户请求特定币种的K线数据 THEN 系统 SHALL 返回该币种在指定时间范围内的完整K线数据
2. WHEN 用户指定时间间隔参数 THEN 系统 SHALL 返回对应间隔的K线数据（1m, 5m, 15m, 1h, 4h, 1d等）
3. WHEN 查询请求包含分页参数 THEN 系统 SHALL 支持分页返回大量数据
4. IF 请求的数据不存在 THEN 系统 SHALL 返回适当的错误信息

### Requirement 3

**User Story:** 作为策略开发者，我希望能够设置交易策略并在指定时间范围内进行回测，以便评估策略的有效性。

#### Acceptance Criteria

1. WHEN 用户配置交易策略参数 THEN 系统 SHALL 保存策略配置并准备执行回测
2. WHEN 用户启动回测 THEN 系统 SHALL 在指定时间范围内模拟策略执行
3. WHEN 回测完成 THEN 系统 SHALL 返回详细的测试结果包括收益率、最大回撤、胜率等指标
4. WHEN 策略包含技术指标 THEN 系统 SHALL 计算相应的技术指标值用于策略判断

### Requirement 4

**User Story:** 作为交易者，我希望系统支持现货和合约交易数据计算，以便进行真实的交易成本分析。

#### Acceptance Criteria

1. WHEN 进行现货交易计算 THEN 系统 SHALL 考虑交易手续费对收益的影响
2. WHEN 进行合约交易计算 THEN 系统 SHALL 计算资金费率、交易手续费和杠杆效应
3. WHEN 计算合约PNL THEN 系统 SHALL 根据开仓价格、当前价格和杠杆倍数计算未实现盈亏
4. WHEN 交易发生 THEN 系统 SHALL 实时更新账户余额和持仓信息

### Requirement 5

**User Story:** 作为用户，我希望能够获取K线数据进行手动交易操作，以便练习交易技能和验证策略想法。

#### Acceptance Criteria

1. WHEN 用户请求K线数据展示 THEN 系统 SHALL 返回指定时间段的K线数据用于前端显示
2. WHEN 用户执行买入卖出操作 THEN 系统 SHALL 实时计算并更新PNL
3. WHEN 用户进行开多开空操作 THEN 系统 SHALL 记录合约持仓并计算保证金占用
4. WHEN 用户点击获取下一段数据 THEN 系统 SHALL 基于当前时间间隔返回下一个时间段的K线数据
5. WHEN 交易操作执行 THEN 系统 SHALL 实时更新账户资金和持仓状态

### Requirement 6

**User Story:** 作为本地用户，我希望系统无需登录即可使用，以便快速开始交易模拟。

#### Acceptance Criteria

1. WHEN 用户访问系统 THEN 系统 SHALL 直接提供所有功能而无需身份验证
2. WHEN 系统启动 THEN 系统 SHALL 自动初始化默认账户和配置
3. WHEN 用户进行操作 THEN 系统 SHALL 将所有数据存储在本地数据库中

### Requirement 7

**User Story:** 作为用户，我希望交易记录能够被保存，以便进行K线重现和继续之前的交易。

#### Acceptance Criteria

1. WHEN 用户进行交易操作 THEN 系统 SHALL 将交易记录存储到数据库
2. WHEN 用户选择K线重现 THEN 系统 SHALL 能够回放历史交易过程
3. WHEN 用户选择继续交易 THEN 系统 SHALL 从上次停止的位置恢复交易状态
4. WHEN 交易记录查询 THEN 系统 SHALL 支持按时间、币种、策略等条件筛选交易历史

### Requirement 8

**User Story:** 作为策略研究者，我希望系统提供定投策略，以便测试定期投资的效果。

#### Acceptance Criteria

1. WHEN 用户配置定投策略 THEN 系统 SHALL 允许设置投资币种、投资金额和投资频率
2. WHEN 定投策略执行 THEN 系统 SHALL 按照设定的时间间隔自动执行买入操作
3. WHEN 定投完成 THEN 系统 SHALL 计算总投资成本和当前价值

### Requirement 9

**User Story:** 作为投资者，我希望使用小盘股策略，以便捕捉小市值币种的投资机会。

#### Acceptance Criteria

1. WHEN 用户启用小盘股策略 THEN 系统 SHALL 定期筛选市值排名50-100的币种
2. WHEN 新一轮筛选完成 THEN 系统 SHALL 卖出被踢出榜单的币种
3. WHEN 发现新进榜单币种 THEN 系统 SHALL 自动买入新币种
4. WHEN 策略执行 THEN 系统 SHALL 记录每次调仓的详细信息

### Requirement 10

**User Story:** 作为趋势交易者，我希望使用趋势跟随策略，以便在市场趋势中获利。

#### Acceptance Criteria

1. WHEN 币种价格上涨 THEN 系统 SHALL 执行做多操作
2. WHEN 币种价格下跌 THEN 系统 SHALL 执行做空操作
3. WHEN 趋势发生变化 THEN 系统 SHALL 及时调整持仓方向
4. WHEN 策略执行 THEN 系统 SHALL 基于价格变化幅度确定交易量

### Requirement 11

**User Story:** 作为技术分析师，我希望基于技术指标进行交易，以便利用技术分析方法制定交易策略。

#### Acceptance Criteria

1. WHEN 系统计算技术指标 THEN 系统 SHALL 支持MACD、EMA、KDJ、RSI、MA等多种指标
2. WHEN 币种跌破MA30 THEN 系统 SHALL 执行卖出信号
3. WHEN 币种突破关键技术位 THEN 系统 SHALL 执行买入信号
4. WHEN 指标发出交易信号 THEN 系统 SHALL 根据信号强度确定交易量
5. WHEN 多个指标同时发出信号 THEN 系统 SHALL 综合判断并执行相应操作

### Requirement 12

**User Story:** 作为交易分析师，我希望通过AI对市场数据进行智能分析，以便获得专业的交易洞察和建议。

#### Acceptance Criteria

1. WHEN 用户请求市场分析 THEN 系统 SHALL 使用OpenAI API对K线数据进行趋势分析和解读
2. WHEN 用户查看策略表现 THEN 系统 SHALL 通过AI分析策略的优劣势并提供改进建议
3. WHEN 用户需要交易建议 THEN 系统 SHALL 基于当前市场数据和技术指标生成AI交易建议
4. WHEN 系统进行AI分析 THEN 系统 SHALL 通过MCP协议调用外部分析工具增强分析能力
5. WHEN AI分析完成 THEN 系统 SHALL 将分析结果以结构化格式返回并存储历史记录
6. WHEN 用户查看风险评估 THEN 系统 SHALL 使用AI对当前持仓和市场环境进行风险分析

### Requirement 13

**User Story:** 作为策略开发者，我希望系统支持策略和指标的扩展，以便能够添加自定义的交易策略和技术指标。

#### Acceptance Criteria

1. WHEN 开发者创建新策略 THEN 系统 SHALL 提供策略基类和标准接口供继承实现
2. WHEN 开发者创建新指标 THEN 系统 SHALL 提供指标基类和计算框架供扩展
3. WHEN 系统启动 THEN 系统 SHALL 自动发现并加载插件目录中的策略和指标扩展
4. WHEN 策略或指标注册 THEN 系统 SHALL 验证扩展的元数据和参数模式
5. WHEN 用户查看可用策略 THEN 系统 SHALL 动态返回所有已注册的策略列表包括扩展策略
6. WHEN 用户查看可用指标 THEN 系统 SHALL 动态返回所有已注册的指标列表包括扩展指标
7. WHEN 开发模式启用 THEN 系统 SHALL 支持插件热重载功能
8. WHEN 扩展执行 THEN 系统 SHALL 提供安全沙箱环境防止恶意代码执行

### Requirement 14

**User Story:** 作为开发者，我希望系统使用指定的技术栈，以便确保系统的可维护性和扩展性。

#### Acceptance Criteria

1. WHEN 系统开发 THEN 后端 SHALL 使用NestJS框架、MongoDB数据库和Redis缓存
2. WHEN 前端开发 THEN 系统 SHALL 使用React Hooks和TradingView图表组件
3. WHEN 包管理 THEN 系统 SHALL 使用pnpm进行前后端分离的包管理
4. WHEN 集成Binance API THEN 系统 SHALL 使用binance-connector-js SDK
5. WHEN 实时数据获取 THEN 系统 SHALL 使用Binance WebSocket API
6. WHEN AI分析集成 THEN 系统 SHALL 使用OpenAI API和MCP协议进行智能分析
7. WHEN 配置管理 THEN 系统 SHALL 将所有API配置存储在.env文件中