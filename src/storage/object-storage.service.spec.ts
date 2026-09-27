import { ConfigService } from '@nestjs/config';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageService', () => {
  it('requires S3-compatible object storage configuration', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new ObjectStorageService(configService)).toThrow(
      'Missing required configuration: objectStorage.endpoint',
    );
  });
});
