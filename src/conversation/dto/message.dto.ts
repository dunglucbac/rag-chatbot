import type { Message } from '../entities/message.entity';

export class MessageDto {
  declare id: string;
  declare userId: string;
  declare threadId: string;
  declare content: string;
  declare role: 'human' | 'ai';
  declare toolsUsed: string | null;
  declare createdAt: Date;

  static fromEntity(entity: Message): MessageDto {
    const dto = new MessageDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.threadId = entity.threadId;
    dto.content = entity.content;
    dto.role = entity.role;
    dto.toolsUsed = entity.toolsUsed ?? null;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
