import { ObjectStorageController } from './object-storage.controller';
import { ObjectStorageService } from './object-storage.service';

describe('ObjectStorageController', () => {
  it('returns a direct upload target scoped to the authenticated user', async () => {
    const createUploadTarget = jest.fn().mockResolvedValue({
      storageKey: 'raw/user-123/file-123.pdf',
      uploadUrl: 'https://storage.example.test/upload',
      uploadHeaders: {
        'Content-Type': 'application/pdf',
        'x-amz-meta-original-filename': 'statement.pdf',
      },
      expiresInSeconds: 900,
    });
    const controller = new ObjectStorageController({
      createUploadTarget,
    } as unknown as ObjectStorageService);

    const result = await controller.createUploadTarget(
      { originalFilename: 'statement.pdf', mimeType: 'application/pdf' },
      { id: 'user-123', email: 'user@example.com' },
    );

    expect(createUploadTarget).toHaveBeenCalledWith(
      'user-123',
      'statement.pdf',
      'application/pdf',
    );
    expect(result.data.storageKey).toBe('raw/user-123/file-123.pdf');
    expect(result.data.uploadHeaders).toEqual({
      'Content-Type': 'application/pdf',
      'x-amz-meta-original-filename': 'statement.pdf',
    });
  });
});
