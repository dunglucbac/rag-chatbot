import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateIngestionJobDto {
  @IsString()
  @Matches(/^raw\/[^/]+\/[^/]+$/)
  storageKey: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  checksumSha256?: string;
}
