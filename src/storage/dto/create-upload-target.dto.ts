import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUploadTargetDto {
  @IsString()
  @IsNotEmpty()
  originalFilename: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;
}
