#!/usr/bin/env node

/**
 * 插件开发CLI工具
 * 用于创建、测试和管理插件
 */

const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');

// 插件模板
const TEMPLATES = {
  basic: {
    name: 'Basic Strategy',
    description: '基础策略模板',
    file: 'basic-strategy-template.js',
  },
  advanced: {
    name: 'Advanced Strategy',
    description: '高级策略模板（包含状态管理）',
    file: 'advanced-strategy-template.js',
  },
  indicator: {
    name: 'Technical Indicator',
    description: '技术指标模板',
    file: 'indicator-template.js',
  },
};

// 配置
const CONFIG = {
  pluginDir: path.join(process.cwd(), 'plugins'),
  templateDir: path.join(__dirname, '..', 'templates'),
  apiUrl: 'http://localhost:3000/api',
};

class PluginCLI {
  constructor() {
    this.setupCommands();
  }

  setupCommands() {
    program
      .name('plugin-cli')
      .description('K线策略模拟器插件开发工具')
      .version('1.0.0');

    // 创建插件命令
    program
      .command('create')
      .description('创建新插件')
      .option('-n, --name <name>', '插件名称')
      .option('-t, --template <template>', '模板类型 (basic|advanced|indicator)')
      .option('-a, --author <author>', '作者名称')
      .action(this.createPlugin.bind(this));

    // 验证插件命令
    program
      .command('validate <plugin>')
      .description('验证插件语法和结构')
      .action(this.validatePlugin.bind(this));

    // 测试插件命令
    program
      .command('test <plugin>')
      .description('测试插件功能')
      .option('-d, --data <file>', '测试数据文件')
      .option('-p, --params <params>', '测试参数 (JSON格式)')
      .action(this.testPlugin.bind(this));

    // 列出插件命令
    program
      .command('list')
      .description('列出所有插件')
      .option('-r, --remote', '从服务器获取插件列表')
      .action(this.listPlugins.bind(this));

    // 安装插件命令
    program
      .command('install <source>')
      .description('安装插件')
      .option('-t, --trusted', '标记为受信任插件')
      .action(this.installPlugin.bind(this));

    // 发布插件命令
    program
      .command('publish <plugin>')
      .description('发布插件到服务器')
      .option('-t, --trusted', '请求受信任状态')
      .action(this.publishPlugin.bind(this));

    // 生成文档命令
    program
      .command('docs <plugin>')
      .description('生成插件文档')
      .option('-o, --output <file>', '输出文件')
      .action(this.generateDocs.bind(this));

    // 初始化开发环境命令
    program
      .command('init')
      .description('初始化插件开发环境')
      .action(this.initEnvironment.bind(this));
  }

  async createPlugin(options) {
    try {
      console.log(chalk.blue('🚀 创建新插件'));

      // 收集插件信息
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: '插件名称:',
          default: options.name,
          validate: (input) => input.trim().length > 0 || '请输入插件名称',
        },
        {
          type: 'list',
          name: 'template',
          message: '选择模板:',
          choices: Object.entries(TEMPLATES).map(([key, template]) => ({
            name: `${template.name} - ${template.description}`,
            value: key,
          })),
          default: options.template || 'basic',
        },
        {
          type: 'input',
          name: 'author',
          message: '作者名称:',
          default: options.author || 'Plugin Developer',
        },
        {
          type: 'input',
          name: 'description',
          message: '插件描述:',
          default: '自定义策略插件',
        },
        {
          type: 'input',
          name: 'version',
          message: '版本号:',
          default: '1.0.0',
        },
      ]);

      // 生成插件文件
      const pluginName = this.sanitizeFileName(answers.name);
      const pluginFile = `${pluginName}.plugin.js`;
      const pluginPath = path.join(CONFIG.pluginDir, pluginFile);

      // 确保插件目录存在
      await fs.mkdir(CONFIG.pluginDir, { recursive: true });

      // 生成插件内容
      const pluginContent = await this.generatePluginContent(answers);

      // 写入插件文件
      await fs.writeFile(pluginPath, pluginContent, 'utf8');

      console.log(chalk.green(`✅ 插件创建成功: ${pluginFile}`));
      console.log(chalk.gray(`   路径: ${pluginPath}`));
      console.log(chalk.gray(`   模板: ${TEMPLATES[answers.template].name}`));
      
      // 提供下一步建议
      console.log(chalk.yellow('\n📝 下一步:'));
      console.log(`   1. 编辑插件文件: ${pluginFile}`);
      console.log(`   2. 验证插件: plugin-cli validate ${pluginFile}`);
      console.log(`   3. 测试插件: plugin-cli test ${pluginFile}`);

    } catch (error) {
      console.error(chalk.red('❌ 创建插件失败:'), error.message);
      process.exit(1);
    }
  }

  async validatePlugin(pluginFile) {
    try {
      console.log(chalk.blue(`🔍 验证插件: ${pluginFile}`));

      const pluginPath = path.resolve(CONFIG.pluginDir, pluginFile);
      
      // 检查文件是否存在
      try {
        await fs.access(pluginPath);
      } catch {
        throw new Error(`插件文件不存在: ${pluginPath}`);
      }

      // 读取插件内容
      const pluginContent = await fs.readFile(pluginPath, 'utf8');

      // 基础语法检查
      try {
        // 使用VM模块进行语法检查
        const vm = require('vm');
        new vm.Script(pluginContent);
      } catch (syntaxError) {
        throw new Error(`语法错误: ${syntaxError.message}`);
      }

      // 结构验证
      const validationResults = await this.validatePluginStructure(pluginPath);

      if (validationResults.errors.length > 0) {
        console.log(chalk.red('❌ 验证失败:'));
        validationResults.errors.forEach(error => {
          console.log(chalk.red(`   • ${error}`));
        });
      }

      if (validationResults.warnings.length > 0) {
        console.log(chalk.yellow('⚠️  警告:'));
        validationResults.warnings.forEach(warning => {
          console.log(chalk.yellow(`   • ${warning}`));
        });
      }

      if (validationResults.errors.length === 0) {
        console.log(chalk.green('✅ 插件验证通过'));
        
        if (validationResults.info) {
          console.log(chalk.gray('\n📊 插件信息:'));
          console.log(chalk.gray(`   名称: ${validationResults.info.name}`));
          console.log(chalk.gray(`   版本: ${validationResults.info.version}`));
          console.log(chalk.gray(`   作者: ${validationResults.info.author}`));
          console.log(chalk.gray(`   策略数量: ${validationResults.info.strategiesCount}`));
          console.log(chalk.gray(`   指标数量: ${validationResults.info.indicatorsCount}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ 验证失败:'), error.message);
      process.exit(1);
    }
  }

  async testPlugin(pluginFile, options) {
    try {
      console.log(chalk.blue(`🧪 测试插件: ${pluginFile}`));

      const pluginPath = path.resolve(CONFIG.pluginDir, pluginFile);
      
      // 加载插件
      delete require.cache[require.resolve(pluginPath)];
      const plugin = require(pluginPath);

      // 准备测试数据
      let testData;
      if (options.data) {
        const dataPath = path.resolve(options.data);
        const dataContent = await fs.readFile(dataPath, 'utf8');
        testData = JSON.parse(dataContent);
      } else {
        testData = this.generateMockData();
      }

      // 准备测试参数
      let testParams = {};
      if (options.params) {
        testParams = JSON.parse(options.params);
      }

      // 测试策略
      if (plugin.strategies) {
        console.log(chalk.cyan('\n📈 测试策略:'));
        
        for (const [strategyType, StrategyClass] of Object.entries(plugin.strategies)) {
          console.log(chalk.gray(`   测试策略: ${strategyType}`));
          
          try {
            // 创建策略实例
            const config = {
              id: 'test',
              accountId: 'test',
              name: 'Test Strategy',
              type: strategyType,
              version: '1.0.0',
              parameters: testParams,
              symbols: ['BTCUSDT'],
              timeframe: '1h',
              enabled: true,
            };

            const strategy = new StrategyClass(config);
            
            // 测试元数据
            const metadata = strategy.getMetadata();
            console.log(chalk.green(`     ✅ 元数据: ${metadata.displayName}`));
            
            // 测试参数验证
            const isValid = strategy.validateParameters(testParams);
            console.log(chalk.green(`     ✅ 参数验证: ${isValid ? '通过' : '失败'}`));
            
            // 测试信号生成
            const signals = await strategy.generateSignals(testData, []);
            console.log(chalk.green(`     ✅ 信号生成: ${signals.length} 个信号`));
            
            if (signals.length > 0) {
              console.log(chalk.gray(`       示例信号: ${signals[0].type} ${signals[0].symbol} @ ${signals[0].confidence}`));
            }

          } catch (error) {
            console.log(chalk.red(`     ❌ 测试失败: ${error.message}`));
          }
        }
      }

      // 测试指标
      if (plugin.indicators) {
        console.log(chalk.cyan('\n📊 测试指标:'));
        
        for (const [indicatorType, IndicatorClass] of Object.entries(plugin.indicators)) {
          console.log(chalk.gray(`   测试指标: ${indicatorType}`));
          
          try {
            const config = {
              type: indicatorType,
              period: 14,
              parameters: testParams,
            };

            const indicator = new IndicatorClass(config);
            
            // 测试元数据
            const metadata = indicator.getMetadata();
            console.log(chalk.green(`     ✅ 元数据: ${metadata.displayName}`));
            
            // 测试计算
            const result = await indicator.calculate(testData);
            console.log(chalk.green(`     ✅ 计算结果: ${Array.isArray(result.values) ? result.values.length : Object.keys(result.values).length} 个值`));

          } catch (error) {
            console.log(chalk.red(`     ❌ 测试失败: ${error.message}`));
          }
        }
      }

      console.log(chalk.green('\n✅ 插件测试完成'));

    } catch (error) {
      console.error(chalk.red('❌ 测试失败:'), error.message);
      process.exit(1);
    }
  }

  async listPlugins(options) {
    try {
      if (options.remote) {
        console.log(chalk.blue('📡 从服务器获取插件列表...'));
        // 这里可以实现从服务器获取插件列表的逻辑
        console.log(chalk.yellow('⚠️  远程插件列表功能尚未实现'));
        return;
      }

      console.log(chalk.blue('📋 本地插件列表:'));

      const pluginFiles = await fs.readdir(CONFIG.pluginDir);
      const plugins = pluginFiles.filter(file => file.endsWith('.plugin.js'));

      if (plugins.length === 0) {
        console.log(chalk.gray('   没有找到插件文件'));
        return;
      }

      for (const pluginFile of plugins) {
        try {
          const pluginPath = path.join(CONFIG.pluginDir, pluginFile);
          delete require.cache[require.resolve(pluginPath)];
          const plugin = require(pluginPath);

          const name = plugin.metadata?.name || pluginFile;
          const version = plugin.metadata?.version || 'unknown';
          const author = plugin.metadata?.author || 'unknown';
          const strategiesCount = plugin.strategies ? Object.keys(plugin.strategies).length : 0;
          const indicatorsCount = plugin.indicators ? Object.keys(plugin.indicators).length : 0;

          console.log(chalk.green(`   📦 ${name} v${version}`));
          console.log(chalk.gray(`      作者: ${author}`));
          console.log(chalk.gray(`      文件: ${pluginFile}`));
          console.log(chalk.gray(`      策略: ${strategiesCount}, 指标: ${indicatorsCount}`));
          console.log();

        } catch (error) {
          console.log(chalk.red(`   ❌ ${pluginFile} (加载失败: ${error.message})`));
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ 获取插件列表失败:'), error.message);
      process.exit(1);
    }
  }

  async initEnvironment() {
    try {
      console.log(chalk.blue('🔧 初始化插件开发环境'));

      // 创建插件目录
      await fs.mkdir(CONFIG.pluginDir, { recursive: true });
      console.log(chalk.green(`✅ 创建插件目录: ${CONFIG.pluginDir}`));

      // 创建示例插件（如果不存在）
      const examplePlugin = path.join(CONFIG.pluginDir, 'example-strategy.plugin.js');
      try {
        await fs.access(examplePlugin);
        console.log(chalk.gray('   示例插件已存在'));
      } catch {
        // 复制示例插件
        const exampleContent = await this.getExamplePluginContent();
        await fs.writeFile(examplePlugin, exampleContent, 'utf8');
        console.log(chalk.green('✅ 创建示例插件'));
      }

      // 创建开发配置文件
      const configFile = path.join(CONFIG.pluginDir, 'plugin-config.json');
      const config = {
        development: {
          hotReload: true,
          debugMode: true,
          testDataPath: './test-data.json',
        },
        security: {
          allowedModules: ['util', 'crypto'],
          maxExecutionTime: 10000,
          maxMemoryUsage: 100 * 1024 * 1024,
        },
      };

      await fs.writeFile(configFile, JSON.stringify(config, null, 2), 'utf8');
      console.log(chalk.green('✅ 创建配置文件'));

      // 创建测试数据文件
      const testDataFile = path.join(CONFIG.pluginDir, 'test-data.json');
      const testData = this.generateMockData();
      await fs.writeFile(testDataFile, JSON.stringify(testData, null, 2), 'utf8');
      console.log(chalk.green('✅ 创建测试数据'));

      console.log(chalk.green('\n🎉 插件开发环境初始化完成!'));
      console.log(chalk.yellow('\n📝 下一步:'));
      console.log('   1. 创建新插件: plugin-cli create');
      console.log('   2. 查看示例插件: cat plugins/example-strategy.plugin.js');
      console.log('   3. 阅读开发文档: cat plugins/README.md');

    } catch (error) {
      console.error(chalk.red('❌ 初始化失败:'), error.message);
      process.exit(1);
    }
  }

  // 辅助方法
  sanitizeFileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async generatePluginContent(answers) {
    const { name, template, author, description, version } = answers;
    const className = this.toPascalCase(name);
    const strategyType = this.toConstantCase(name);

    // 根据模板生成不同的内容
    switch (template) {
      case 'basic':
        return this.getBasicStrategyTemplate(className, strategyType, author, description, version);
      case 'advanced':
        return this.getAdvancedStrategyTemplate(className, strategyType, author, description, version);
      case 'indicator':
        return this.getIndicatorTemplate(className, strategyType, author, description, version);
      default:
        throw new Error(`未知模板类型: ${template}`);
    }
  }

  toPascalCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  toConstantCase(str) {
    return str
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .toUpperCase();
  }

  async validatePluginStructure(pluginPath) {
    const errors = [];
    const warnings = [];
    let info = null;

    try {
      delete require.cache[require.resolve(pluginPath)];
      const plugin = require(pluginPath);

      // 检查基本结构
      if (!plugin || typeof plugin !== 'object') {
        errors.push('插件必须导出一个对象');
        return { errors, warnings, info };
      }

      // 检查元数据
      if (!plugin.metadata) {
        warnings.push('缺少插件元数据');
      } else {
        if (!plugin.metadata.name) warnings.push('缺少插件名称');
        if (!plugin.metadata.version) warnings.push('缺少插件版本');
        if (!plugin.metadata.author) warnings.push('缺少插件作者');
      }

      // 检查策略和指标
      if (!plugin.strategies && !plugin.indicators) {
        errors.push('插件必须导出至少一个策略或指标');
      }

      let strategiesCount = 0;
      let indicatorsCount = 0;

      // 验证策略
      if (plugin.strategies) {
        if (typeof plugin.strategies !== 'object') {
          errors.push('strategies 必须是一个对象');
        } else {
          strategiesCount = Object.keys(plugin.strategies).length;
          for (const [type, StrategyClass] of Object.entries(plugin.strategies)) {
            if (typeof StrategyClass !== 'function') {
              errors.push(`策略 '${type}' 必须是一个构造函数`);
            }
          }
        }
      }

      // 验证指标
      if (plugin.indicators) {
        if (typeof plugin.indicators !== 'object') {
          errors.push('indicators 必须是一个对象');
        } else {
          indicatorsCount = Object.keys(plugin.indicators).length;
          for (const [type, IndicatorClass] of Object.entries(plugin.indicators)) {
            if (typeof IndicatorClass !== 'function') {
              errors.push(`指标 '${type}' 必须是一个构造函数`);
            }
          }
        }
      }

      info = {
        name: plugin.metadata?.name || 'Unknown',
        version: plugin.metadata?.version || 'Unknown',
        author: plugin.metadata?.author || 'Unknown',
        strategiesCount,
        indicatorsCount,
      };

    } catch (error) {
      errors.push(`加载插件失败: ${error.message}`);
    }

    return { errors, warnings, info };
  }

  generateMockData() {
    const data = [];
    const basePrice = 50000;
    const baseTime = Date.now() - (100 * 60 * 60 * 1000); // 100小时前

    for (let i = 0; i < 100; i++) {
      const time = baseTime + (i * 60 * 60 * 1000); // 每小时一个数据点
      const price = basePrice + (Math.random() - 0.5) * 1000 * (i / 10);
      const high = price + Math.random() * 500;
      const low = price - Math.random() * 500;
      const volume = 100 + Math.random() * 1000;

      data.push({
        symbol: 'BTCUSDT',
        interval: '1h',
        openTime: time,
        closeTime: time + 60 * 60 * 1000 - 1,
        open: price,
        high: Math.max(price, high),
        low: Math.min(price, low),
        close: price + (Math.random() - 0.5) * 200,
        volume: volume,
        quoteVolume: volume * price,
        trades: Math.floor(Math.random() * 1000),
        takerBuyBaseVolume: volume * 0.6,
        takerBuyQuoteVolume: volume * price * 0.6,
      });
    }

    return data;
  }

  getBasicStrategyTemplate(className, strategyType, author, description, version) {
    return `/**
 * ${description}
 * 作者: ${author}
 * 版本: ${version}
 */

const { BaseStrategy } = require('../src/extensions/base-strategy');

class ${className} extends BaseStrategy {
  getMetadata() {
    return {
      displayName: '${description}',
      description: '${description}的详细说明',
      author: '${author}',
      version: '${version}',
      category: 'custom',
      tags: ['custom', 'template'],
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: true,
          min: 1,
          max: 100,
          defaultValue: 20,
          description: '计算周期',
        },
      ],
    };
  }

  async generateSignals(marketData, indicators) {
    const signals = [];
    const { period } = this.config.parameters;

    if (marketData.length < period) {
      return signals;
    }

    // 在这里实现你的策略逻辑
    const currentKline = marketData[marketData.length - 1];
    
    // 示例：简单的移动平均策略
    const prices = marketData.slice(-period).map(k => k.close);
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    if (currentKline.close > average * 1.02) {
      const signal = this.createSignal(
        'BUY',
        currentKline.symbol,
        100 / currentKline.close,
        0.8,
        \`价格突破移动平均线，买入信号\`,
        { price: currentKline.close }
      );
      signals.push(signal);
    }

    return signals;
  }

  validateParameters(parameters) {
    const { period } = parameters;
    return period && period > 0 && period <= 100;
  }

  getMinDataLength() {
    return this.config.parameters.period;
  }
}

module.exports = {
  metadata: {
    name: '${description}',
    version: '${version}',
    author: '${author}',
    description: '${description}插件',
  },
  strategies: {
    '${strategyType}': ${className},
  },
};`;
  }

  getAdvancedStrategyTemplate(className, strategyType, author, description, version) {
    // 返回高级策略模板（简化版本）
    return this.getBasicStrategyTemplate(className, strategyType, author, description, version)
      .replace('// 在这里实现你的策略逻辑', `// 高级策略逻辑
    // 包含状态管理、风险控制等功能
    
    // 初始化状态
    if (!this.state) {
      this.state = {
        lastSignalTime: 0,
        position: 0,
      };
    }`);
  }

  getIndicatorTemplate(className, strategyType, author, description, version) {
    return `/**
 * ${description}
 * 作者: ${author}
 * 版本: ${version}
 */

class ${className} {
  constructor(config) {
    this.config = config;
  }

  getMetadata() {
    return {
      displayName: '${description}',
      description: '${description}的详细说明',
      category: 'custom',
      outputType: 'single',
      chartType: 'overlay',
      parameterSchema: [
        {
          name: 'period',
          type: 'number',
          required: true,
          min: 1,
          max: 100,
          defaultValue: 14,
          description: '计算周期',
        },
      ],
    };
  }

  async calculate(data) {
    const { period } = this.config.parameters;
    
    if (data.length < period) {
      return {
        type: '${strategyType}',
        values: [],
        metadata: this.getMetadata(),
      };
    }

    // 在这里实现你的指标计算逻辑
    const values = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const average = slice.reduce((sum, k) => sum + k.close, 0) / period;
      values.push(average);
    }

    return {
      type: '${strategyType}',
      values,
      metadata: this.getMetadata(),
    };
  }

  validateParameters(parameters) {
    const { period } = parameters;
    return period && period > 0 && period <= 100;
  }
}

module.exports = {
  metadata: {
    name: '${description}',
    version: '${version}',
    author: '${author}',
    description: '${description}插件',
  },
  indicators: {
    '${strategyType}': ${className},
  },
};`;
  }

  async getExamplePluginContent() {
    // 返回示例插件内容
    return this.getBasicStrategyTemplate(
      'ExampleStrategy',
      'EXAMPLE_STRATEGY',
      'Plugin Developer',
      '示例策略',
      '1.0.0'
    );
  }

  run() {
    program.parse();
  }
}

// 运行CLI
if (require.main === module) {
  const cli = new PluginCLI();
  cli.run();
}

module.exports = PluginCLI;