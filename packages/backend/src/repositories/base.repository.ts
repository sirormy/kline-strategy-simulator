import { Document, Model, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sort?: { [key: string]: 1 | -1 };
}

export abstract class BaseRepository<T extends Document> {
  constructor(protected readonly model: Model<T>) {}

  async create(createDto: Partial<T>): Promise<T> {
    const entity = new this.model(createDto);
    return entity.save();
  }

  async createMany(createDtos: Partial<T>[]): Promise<T[]> {
    return this.model.insertMany(createDtos) as unknown as Promise<T[]>;
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async find(filter: FilterQuery<T> = {}): Promise<T[]> {
    return this.model.find(filter).exec();
  }

  async findWithPagination(
    filter: FilterQuery<T> = {},
    options: PaginationOptions
  ): Promise<PaginationResult<T>> {
    const { page, limit, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, updateDto: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async updateOne(
    filter: FilterQuery<T>,
    updateDto: UpdateQuery<T>,
    options?: QueryOptions
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(filter, updateDto, { new: true, ...options })
      .exec();
  }

  async updateMany(
    filter: FilterQuery<T>,
    updateDto: UpdateQuery<T>
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const result = await this.model.updateMany(filter, updateDto).exec();
    return {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  async delete(id: string): Promise<T | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  async deleteOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOneAndDelete(filter).exec() as unknown as Promise<T | null>;
  }

  async deleteMany(filter: FilterQuery<T>): Promise<{ deletedCount: number }> {
    const result = await this.model.deleteMany(filter).exec();
    return { deletedCount: result.deletedCount };
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const count = await this.model.countDocuments(filter).limit(1).exec();
    return count > 0;
  }

  async aggregate(pipeline: any[]): Promise<any[]> {
    return this.model.aggregate(pipeline).exec();
  }

  async bulkWrite(operations: any[]): Promise<any> {
    return this.model.bulkWrite(operations);
  }

  // 创建索引的辅助方法
  async createIndex(index: any, options: any = {}): Promise<void> {
    await this.model.collection.createIndex(index, options);
  }

  // 获取集合统计信息
  async getStats(): Promise<any> {
    return this.model.db.db.stats();
  }
}