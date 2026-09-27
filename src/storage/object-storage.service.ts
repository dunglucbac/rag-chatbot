import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';

@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.required('objectStorage.endpoint');
    const accessKeyId = this.required('objectStorage.accessKeyId');
    const secretAccessKey = this.required('objectStorage.secretAccessKey');
    this.bucket = this.required('objectStorage.bucket');

    this.client = new S3Client({
      endpoint,
      region: this.configService.get<string>('objectStorage.region') ?? 'us-east-1',
      forcePathStyle:
        this.configService.get<string>('objectStorage.forcePathStyle') === 'true',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async upload(
    key: string,
    filePath: string,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private required(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }
}
