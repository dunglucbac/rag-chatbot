import { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';
import { BaseRepositoryInterface } from '@repositories/base/base.interface.repository';

export abstract class BaseRepository<
  T extends { id: string },
> implements BaseRepositoryInterface<T> {
  protected constructor(protected readonly repository: Repository<T>) {}

  create(data: DeepPartial<T>): Promise<T> {
    return this.repository.save(this.repository.create(data));
  }

  findById(id: string): Promise<T | null> {
    return this.repository.findOneBy({ id } as FindOptionsWhere<T>);
  }

  save(entity: T): Promise<T> {
    return this.repository.save(entity);
  }
}
