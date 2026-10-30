import { IsUUID } from 'class-validator';

export class AttachUploadDto {
  @IsUUID()
  ingestionJobId: string;
}
