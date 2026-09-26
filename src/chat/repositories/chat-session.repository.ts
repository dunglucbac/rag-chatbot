import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { BaseRepository } from '../../repositories/base/base.repository';
import { ChatSession } from '../entities/chat-session.entity';

@Injectable()
export class ChatSessionRepository extends BaseRepository<ChatSession> {
  constructor(
    @InjectRepository(ChatSession)
    repository: Repository<ChatSession>,
  ) {
    super(repository);
  }

  createForUser(id: string, userId: string): Promise<ChatSession> {
    return this.create({ id, userId });
  }

  findOwnedById(id: string, userId: string): Promise<ChatSession | null> {
    return this.repository.findOneBy({ id, userId });
  }

  async deleteOwnedById(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return result.affected === 1;
  }

  findUpdatedBefore(before: Date, limit: number): Promise<ChatSession[]> {
    return this.repository.find({
      where: { updatedAt: LessThan(before) },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
  }

  async touchOwnedById(id: string, userId: string): Promise<void> {
    await this.repository.update({ id, userId }, { updatedAt: new Date() });
  }
}
