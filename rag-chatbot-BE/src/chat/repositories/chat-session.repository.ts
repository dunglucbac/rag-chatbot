import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { BaseRepository } from '../../repositories/base/base.repository';
import { ChatSession } from '../entities/chat-session.entity';
import { ChatMessage } from '../entities/chat-message.entity';
import { IngestionJob } from '../../ingestion/entities/ingestion-job.entity';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class ChatSessionRepository extends BaseRepository<ChatSession> {
  constructor(
    @InjectRepository(ChatSession)
    repository: Repository<ChatSession>,
  ) {
    super(repository);
  }

  createForUser(
    id: string,
    userId: string,
    title = 'New conversation',
  ): Promise<ChatSession> {
    return this.create({ id, userId, title });
  }

  async listForUser(userId: string, offset: number) {
    const sessions = await this.repository.find({
      where: { userId },
      order: { updatedAt: 'DESC', id: 'DESC' },
      skip: offset,
      take: 31,
    });
    return {
      sessions: sessions.slice(0, 30),
      nextOffset: sessions.length > 30 ? offset + 30 : null,
    };
  }

  async messages(sessionId: string, before?: number) {
    const query = this.repository.manager
      .getRepository(ChatMessage)
      .createQueryBuilder('message')
      .where('message.sessionId = :sessionId', { sessionId });
    if (before) query.andWhere('message.id < :before', { before });
    const rows = await query.orderBy('message.id', 'DESC').take(101).getMany();
    const messages = rows.slice(0, 100).reverse();
    return { messages, nextBefore: rows.length > 100 ? messages[0].id : null };
  }

  async saveTurn(
    sessionId: string,
    userId: string,
    message: string,
    reply: string,
  ) {
    await this.repository.manager.transaction(async (manager) => {
      const sessions = manager.getRepository(ChatSession);
      if (!(await sessions.findOneBy({ id: sessionId, userId })))
        throw new NotFoundException('Chat session not found');
      await manager.getRepository(ChatMessage).save([
        { sessionId, role: 'user' as const, content: message },
        { sessionId, role: 'assistant' as const, content: reply },
      ]);
      await sessions.update(
        { id: sessionId, userId, title: 'New conversation' },
        { title: message.slice(0, 80) },
      );
      await sessions.update(
        { id: sessionId, userId },
        { updatedAt: new Date() },
      );
    });
  }

  async attachUpload(sessionId: string, userId: string, jobId: string) {
    return this.repository.manager.transaction(async (manager) => {
      const session = await manager
        .getRepository(ChatSession)
        .findOneBy({ id: sessionId, userId });
      const job = await manager
        .getRepository(IngestionJob)
        .findOneBy({ id: jobId, userId });
      if (!session || !job)
        throw new NotFoundException('Chat session or upload not found');
      const messages = manager.getRepository(ChatMessage);
      await messages
        .createQueryBuilder()
        .insert()
        .values({
          sessionId,
          role: 'upload',
          content: job.originalFilename,
          ingestionJobId: jobId,
        })
        .orIgnore()
        .execute();
      await manager
        .getRepository(ChatSession)
        .update(
          { id: sessionId, userId, title: 'New conversation' },
          { title: job.originalFilename.slice(0, 80) },
        );
      await manager
        .getRepository(ChatSession)
        .update({ id: sessionId, userId }, { updatedAt: new Date() });
      return messages.findOneByOrFail({ sessionId, ingestionJobId: jobId });
    });
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
