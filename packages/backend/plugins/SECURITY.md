# 插件安全指南

本文档描述了插件系统的安全机制和开发安全插件的最佳实践。

## 安全架构概述

插件系统采用多层安全防护机制：

1. **沙箱隔离**: 不受信任的插件在VM2沙箱中运行
2. **权限控制**: 基于插件信任级别的细粒度权限管理
3. **资源限制**: 执行时间和内存使用限制
4. **模块白名单**: 限制插件可以访问的Node.js模块
5. **完整性验证**: 插件文件哈希验证防止篡改

## 插件信任级别

### 受信任插件 (Trusted Plugins)

- **权限**: 完整的系统访问权限
- **沙箱**: 不在沙箱中运行
- **资源限制**: 宽松的时间和内存限制
- **模块访问**: 可以访问所有允许的Node.js模块
- **适用场景**: 官方插件、经过审核的第三方插件

### 沙箱插件 (Sandboxed Plugins)

- **权限**: 受限的系统访问权限
- **沙箱**: 在VM2沙箱中运行
- **资源限制**: 严格的时间和内存限制
- **模块访问**: 仅能访问白名单中的安全模块
- **适用场景**: 用户自定义插件、未经审核的第三方插件

## 安全配置

### 默认安全策略

```javascript
const defaultSecurityPolicy = {
  allowFileSystemAccess: false,      // 禁止文件系统访问
  allowNetworkAccess: false,         // 禁止网络访问
  allowNativeModules: false,         // 禁止原生模块
  allowedModules: [                  // 允许的模块白名单
    'util', 'events', 'buffer', 'string_decoder',
    'crypto', // 仅加密功能，不包含文件操作
  ],
  blockedModules: [                  // 明确禁止的模块
    'child_process', 'cluster', 'fs', 'net', 'http', 'https',
    'dgram', 'dns', 'os', 'repl', 'vm', 'v8'
  ],
  maxExecutionTime: 5000,            // 最大执行时间 5秒
  maxMemoryUsage: 50 * 1024 * 1024,  // 最大内存使用 50MB
  enableSandbox: true,               // 启用沙箱
  trustedPlugins: [],                // 受信任插件列表
};
```

### 受信任插件配置

```javascript
const trustedPluginPolicy = {
  allowFileSystemAccess: true,
  allowNetworkAccess: true,
  allowNativeModules: true,
  allowedModules: ['*'],             // 允许所有模块
  blockedModules: [],                // 无禁止模块
  maxExecutionTime: 30000,           // 30秒
  maxMemoryUsage: 100 * 1024 * 1024, // 100MB
  enableSandbox: false,              // 不使用沙箱
};
```

## 插件开发安全最佳实践

### 1. 输入验证

```javascript
validateParameters(parameters) {
  // 严格验证所有输入参数
  if (typeof parameters.period !== 'number' || parameters.period < 1 || parameters.period > 1000) {
    throw new Error('Invalid period parameter');
  }
  
  // 防止注入攻击
  if (typeof parameters.symbol !== 'string' || !/^[A-Z0-9]+$/.test(parameters.symbol)) {
    throw new Error('Invalid symbol parameter');
  }
  
  return true;
}
```

### 2. 错误处理

```javascript
async generateSignals(marketData, indicators) {
  try {
    // 策略逻辑
    return signals;
  } catch (error) {
    // 不要泄露敏感信息
    console.error('Strategy execution error:', error.message);
    return []; // 返回安全的默认值
  }
}
```

### 3. 资源管理

```javascript
async onInit() {
  // 避免创建过多的定时器或事件监听器
  this.cleanup = [];
  
  // 如果需要定时器，确保在销毁时清理
  const timer = setInterval(() => {
    // 定时任务
  }, 60000);
  
  this.cleanup.push(() => clearInterval(timer));
}

async onDestroy() {
  // 清理所有资源
  this.cleanup.forEach(fn => fn());
  this.cleanup = [];
}
```

### 4. 数据安全

```javascript
// 不要在插件中硬编码敏感信息
const API_KEY = process.env.API_KEY; // ❌ 错误：沙箱插件无法访问环境变量

// 使用参数传递敏感信息
const apiKey = this.config.parameters.apiKey; // ✅ 正确：通过配置传递

// 不要记录敏感信息
console.log('API Key:', apiKey); // ❌ 错误：可能泄露敏感信息
console.log('Processing trade signal'); // ✅ 正确：记录非敏感信息
```

### 5. 防止代码注入

```javascript
// 不要使用eval或类似函数
eval(userInput); // ❌ 危险：代码注入风险

// 不要动态创建函数
new Function(userInput)(); // ❌ 危险：代码注入风险

// 使用安全的数据处理方式
const result = JSON.parse(userInput); // ✅ 相对安全：但仍需验证
```

## 沙箱限制

### 被阻止的操作

1. **文件系统访问**
   ```javascript
   const fs = require('fs'); // ❌ 被阻止
   fs.readFile('file.txt'); // ❌ 被阻止
   ```

2. **网络访问**
   ```javascript
   const http = require('http'); // ❌ 被阻止
   const https = require('https'); // ❌ 被阻止
   ```

3. **进程操作**
   ```javascript
   const { exec } = require('child_process'); // ❌ 被阻止
   process.exit(0); // ❌ 被阻止
   ```

4. **原生模块**
   ```javascript
   const addon = require('./native-addon.node'); // ❌ 被阻止
   ```

### 允许的操作

1. **基础计算**
   ```javascript
   const result = Math.sqrt(value); // ✅ 允许
   const date = new Date(); // ✅ 允许
   ```

2. **数据处理**
   ```javascript
   const data = JSON.parse(jsonString); // ✅ 允许
   const buffer = Buffer.from(string); // ✅ 允许
   ```

3. **加密功能**
   ```javascript
   const crypto = require('crypto');
   const hash = crypto.createHash('sha256'); // ✅ 允许（仅哈希功能）
   ```

## 安全审计

### 插件审计清单

- [ ] 输入验证是否完整
- [ ] 是否存在代码注入风险
- [ ] 错误处理是否安全
- [ ] 是否泄露敏感信息
- [ ] 资源使用是否合理
- [ ] 是否正确清理资源
- [ ] 是否遵循最小权限原则

### 自动安全检查

系统会自动执行以下安全检查：

1. **静态分析**: 检查插件代码中的危险模式
2. **运行时监控**: 监控插件的资源使用情况
3. **完整性验证**: 验证插件文件是否被篡改
4. **权限检查**: 确保插件不超出其权限范围

## 报告安全问题

如果发现插件系统的安全漏洞，请通过以下方式报告：

1. **内部报告**: 联系开发团队
2. **日志记录**: 查看系统日志中的安全警告
3. **监控面板**: 使用插件管理界面查看安全报告

## 安全更新

- 定期更新插件系统以获得最新的安全修复
- 监控插件的行为异常
- 及时移除有安全风险的插件
- 保持插件的最小权限原则

## 常见安全问题

### Q: 为什么我的插件无法访问文件系统？
A: 出于安全考虑，沙箱插件默认无法访问文件系统。如果确实需要，请申请将插件标记为受信任。

### Q: 如何安全地处理用户输入？
A: 始终验证和清理用户输入，使用类型检查和范围验证，避免直接使用用户输入构造代码。

### Q: 插件执行超时怎么办？
A: 优化插件代码，减少计算复杂度，或申请增加执行时间限制。

### Q: 如何调试沙箱中的插件？
A: 使用console.log输出调试信息，或在开发环境中临时将插件标记为受信任。

记住：安全是一个持续的过程，不是一次性的任务。始终保持警惕，遵循最佳实践。