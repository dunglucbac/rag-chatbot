import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  /**
   * The upload currently being discussed. The client receives this ID from
   * the ingestion endpoint; it is never inferred from model output.
   */
  @ValidateIf(
    (dto: SendMessageDto) =>
      dto.ingestionJobId !== undefined || dto.reviewAction !== undefined,
  )
  @IsUUID()
  ingestionJobId?: string;

  /**
   * A deliberate UI action. Keeping this separate from free-form chat text
   * prevents the model from approving or rejecting a receipt on its own.
   */
  @IsOptional()
  @IsIn(['approve', 'reject'])
  reviewAction?: 'approve' | 'reject';
}
