import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path from 'path';

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
      region:
        this.configService.get<string>('objectStorage.region') ?? 'us-east-1',
      forcePathStyle:
        this.configService.get<string>('objectStorage.forcePathStyle') ===
        'true',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async createUploadTarget(
    userId: string,
    originalFilename: string,
    contentType: string,
  ): Promise<{
    storageKey: string;
    uploadUrl: string;
    expiresInSeconds: number;
  }> {
    const storageKey = this.createStorageKey(userId, originalFilename);
    const expiresInSeconds = 15 * 60;
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );

    return { storageKey, uploadUrl, expiresInSeconds };
  }

  async getObjectMetadata(
    key: string,
  ): Promise<{ contentType?: string; size?: number }> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return { contentType: result.ContentType, size: result.ContentLength };
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

  private createStorageKey(userId: string, originalFilename: string): string {
    const extension = path.extname(originalFilename).toLowerCase();
    return `raw/${encodeURIComponent(userId)}/${crypto.randomUUID()}${extension}`;
  }
}
