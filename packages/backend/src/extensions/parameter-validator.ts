import { ParameterSchema } from '../schemas/strategy.schema';

// 参数验证错误
export class ParameterValidationError extends Error {
  constructor(
    public parameterName: string,
    public expectedType: string,
    public actualValue: any,
    message: string
  ) {
    super(message);
    this.name = 'ParameterValidationError';
  }
}

// 参数验证结果
export interface ValidationResult {
  isValid: boolean;
  errors: ParameterValidationError[];
  warnings: string[];
}

// 参数验证器
export class ParameterValidator {
  /**
   * 验证参数对象
   */
  static validate(
    parameters: { [key: string]: any },
    schema: ParameterSchema[]
  ): ValidationResult {
    const errors: ParameterValidationError[] = [];
    const warnings: string[] = [];

    // 验证必需参数
    for (const paramSchema of schema) {
      const paramValue = parameters[paramSchema.name];

      // 检查必需参数是否存在
      if (paramSchema.required && (paramValue === undefined || paramValue === null)) {
        errors.push(
          new ParameterValidationError(
            paramSchema.name,
            paramSchema.type,
            paramValue,
            `Required parameter '${paramSchema.name}' is missing`
          )
        );
        continue;
      }

      // 如果参数不存在且不是必需的，跳过验证
      if (paramValue === undefined || paramValue === null) {
        continue;
      }

      // 验证参数类型和值
      const typeValidation = this.validateParameterType(paramValue, paramSchema);
      if (!typeValidation.isValid) {
        errors.push(...typeValidation.errors);
      }
      warnings.push(...typeValidation.warnings);
    }

    // 检查未定义的参数
    for (const paramName in parameters) {
      const isDefined = schema.some(s => s.name === paramName);
      if (!isDefined) {
        warnings.push(`Parameter '${paramName}' is not defined in schema`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证单个参数的类型和值
   */
  private static validateParameterType(
    value: any,
    schema: ParameterSchema
  ): ValidationResult {
    const errors: ParameterValidationError[] = [];
    const warnings: string[] = [];

    // 类型验证
    const actualType = this.getActualType(value);
    if (actualType !== schema.type) {
      errors.push(
        new ParameterValidationError(
          schema.name,
          schema.type,
          value,
          `Parameter '${schema.name}' expected type ${schema.type}, got ${actualType}`
        )
      );
      return { isValid: false, errors, warnings };
    }

    // 数值范围验证
    if (schema.type === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must be >= ${schema.min}, got ${value}`
          )
        );
      }

      if (schema.max !== undefined && value > schema.max) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must be <= ${schema.max}, got ${value}`
          )
        );
      }

      // 检查是否为有效数字
      if (!Number.isFinite(value)) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must be a finite number`
          )
        );
      }
    }

    // 字符串长度验证
    if (schema.type === 'string') {
      if (schema.min !== undefined && value.length < schema.min) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must have at least ${schema.min} characters`
          )
        );
      }

      if (schema.max !== undefined && value.length > schema.max) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must have at most ${schema.max} characters`
          )
        );
      }
    }

    // 数组长度验证
    if (schema.type === 'array') {
      if (schema.min !== undefined && value.length < schema.min) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must have at least ${schema.min} elements`
          )
        );
      }

      if (schema.max !== undefined && value.length > schema.max) {
        errors.push(
          new ParameterValidationError(
            schema.name,
            schema.type,
            value,
            `Parameter '${schema.name}' must have at most ${schema.max} elements`
          )
        );
      }
    }

    // 选项值验证
    if (schema.options && schema.options.length > 0) {
      if (schema.type === 'array') {
        // 验证数组中的每个元素都在选项中
        const invalidValues = value.filter((v: any) => !schema.options!.includes(String(v)));
        if (invalidValues.length > 0) {
          errors.push(
            new ParameterValidationError(
              schema.name,
              schema.type,
              value,
              `Parameter '${schema.name}' contains invalid values: ${invalidValues.join(', ')}. Valid options: ${schema.options.join(', ')}`
            )
          );
        }
      } else {
        // 验证单个值是否在选项中
        if (!schema.options.includes(String(value))) {
          errors.push(
            new ParameterValidationError(
              schema.name,
              schema.type,
              value,
              `Parameter '${schema.name}' must be one of: ${schema.options.join(', ')}, got ${value}`
            )
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 获取值的实际类型
   */
  private static getActualType(value: any): string {
    if (Array.isArray(value)) {
      return 'array';
    }
    
    if (value === null) {
      return 'null';
    }
    
    return typeof value;
  }

  /**
   * 应用默认值
   */
  static applyDefaults(
    parameters: { [key: string]: any },
    schema: ParameterSchema[]
  ): { [key: string]: any } {
    const result = { ...parameters };

    for (const paramSchema of schema) {
      if (
        paramSchema.defaultValue !== undefined &&
        (result[paramSchema.name] === undefined || result[paramSchema.name] === null)
      ) {
        result[paramSchema.name] = paramSchema.defaultValue;
      }
    }

    return result;
  }

  /**
   * 清理参数（移除未定义的参数）
   */
  static sanitize(
    parameters: { [key: string]: any },
    schema: ParameterSchema[]
  ): { [key: string]: any } {
    const result: { [key: string]: any } = {};
    const definedParams = new Set(schema.map(s => s.name));

    for (const [key, value] of Object.entries(parameters)) {
      if (definedParams.has(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 转换参数类型
   */
  static coerceTypes(
    parameters: { [key: string]: any },
    schema: ParameterSchema[]
  ): { [key: string]: any } {
    const result = { ...parameters };

    for (const paramSchema of schema) {
      const value = result[paramSchema.name];
      if (value === undefined || value === null) {
        continue;
      }

      try {
        switch (paramSchema.type) {
          case 'number':
            if (typeof value === 'string') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                result[paramSchema.name] = numValue;
              }
            }
            break;

          case 'boolean':
            if (typeof value === 'string') {
              result[paramSchema.name] = value.toLowerCase() === 'true';
            } else if (typeof value === 'number') {
              result[paramSchema.name] = value !== 0;
            }
            break;

          case 'string':
            if (typeof value !== 'string') {
              result[paramSchema.name] = String(value);
            }
            break;

          case 'array':
            if (!Array.isArray(value)) {
              // 尝试从字符串解析JSON数组
              if (typeof value === 'string') {
                try {
                  const parsed = JSON.parse(value);
                  if (Array.isArray(parsed)) {
                    result[paramSchema.name] = parsed;
                  }
                } catch {
                  // 如果解析失败，将单个值包装成数组
                  result[paramSchema.name] = [value];
                }
              } else {
                result[paramSchema.name] = [value];
              }
            }
            break;

          case 'object':
            if (typeof value === 'string') {
              try {
                const parsed = JSON.parse(value);
                if (typeof parsed === 'object' && parsed !== null) {
                  result[paramSchema.name] = parsed;
                }
              } catch {
                // 解析失败时保持原值
              }
            }
            break;
        }
      } catch (error) {
        // 类型转换失败时保持原值
        console.warn(`Failed to coerce parameter '${paramSchema.name}':`, error);
      }
    }

    return result;
  }

  /**
   * 完整的参数处理流程
   */
  static processParameters(
    parameters: { [key: string]: any },
    schema: ParameterSchema[]
  ): {
    processedParameters: { [key: string]: any };
    validation: ValidationResult;
  } {
    // 1. 类型转换
    let processed = this.coerceTypes(parameters, schema);

    // 2. 应用默认值
    processed = this.applyDefaults(processed, schema);

    // 3. 清理未定义的参数
    processed = this.sanitize(processed, schema);

    // 4. 验证
    const validation = this.validate(processed, schema);

    return {
      processedParameters: processed,
      validation,
    };
  }
}