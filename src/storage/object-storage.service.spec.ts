import { ConfigService } from '@nestjs/config';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService', () => {
  afterEach(() => jest.restoreAllMocks());

  function configuredService() {
    const values: Record<string, string> = {
      'objectStorage.endpoint': 'https://storage.example.test',
      'objectStorage.accessKeyId': 'test-access-key',
      'objectStorage.secretAccessKey': 'test-secret-key',
      'objectStorage.bucket': 'test-bucket',
      'objectStorage.region': 'us-east-1',
      'objectStorage.forcePathStyle': 'true',
    };
    return new ObjectStorageService({
      get: (key: string) => values[key],
    } as ConfigService);
  }

  it.each(['IMG_0961.HEIC', 'Hóa đơn 100% tháng 10.pdf'])(
    'includes the original filename %s in the signed upload metadata',
    async (filename) => {
      const target = await configuredService().createUploadTarget(
        'user-123',
        filename,
        'application/pdf',
      );
      const url = new URL(target.uploadUrl);
      expect(target.uploadHeaders).toEqual({
        'Content-Type': 'application/pdf',
        'x-amz-meta-original-filename': encodeURIComponent(filename),
      });
      expect(url.searchParams.has('x-amz-meta-original-filename')).toBe(false);
      expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual([
        'content-type',
        'host',
        'x-amz-meta-original-filename',
      ]);
      expect(target.storageKey).toMatch(/^raw\/user-123\/[^/]+\.(pdf|heic)$/);
    },
  );

  it('reads and decodes the original filename from object metadata', async () => {
    const filename = 'Hóa đơn 100% tháng 10.pdf';
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentType: 'application/pdf',
      ContentLength: 1234,
      Metadata: { 'original-filename': encodeURIComponent(filename) },
    } as never);

    await expect(
      configuredService().getObjectMetadata('raw/user-123/file.pdf'),
    ).resolves.toEqual({
      contentType: 'application/pdf',
      size: 1234,
      originalFilename: filename,
    });
    expect(send).toHaveBeenCalledWith(expect.any(HeadObjectCommand));
  });

  it('returns no filename when older objects have no filename metadata', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      ContentType: 'application/pdf',
      Metadata: {},
    } as never);
    await expect(
      configuredService().getObjectMetadata('raw/user-123/file.pdf'),
    ).resolves.toMatchObject({ originalFilename: undefined });
  });

  it('rejects malformed encoded filename metadata', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Metadata: { 'original-filename': '%invalid' },
    } as never);
    await expect(
      configuredService().getObjectMetadata('raw/user-123/file.pdf'),
    ).rejects.toThrow('Uploaded object has invalid original filename metadata');
  });

  it('requires S3-compatible object storage configuration', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new ObjectStorageService(configService)).toThrow(
      'Missing required configuration: objectStorage.endpoint',
    );
  });
});
