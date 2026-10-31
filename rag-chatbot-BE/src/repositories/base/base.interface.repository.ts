import { DeepPartial } from 'typeorm';

export interface BaseRepositoryInterface<T extends { id: string }> {
  create(data: DeepPartial<T>): Promise<T>;
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
}
