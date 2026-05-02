import { NotFoundException } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

type UploadResult = { job: { id: string }; event: { eventType: string } };

describe('IngestionController', () => {
  it('returns the upload service result without transforming it', async () => {
    const uploadResult: UploadResult = {
      job: {
        id: 'job-1',
      },
      event: {
        eventType: 'doc.pdf.parse.requested',
      },
    };
    const createJobFromUpload = jest.fn().mockResolvedValue(uploadResult);
    const ingestionService = {
      createJobFromUpload,
    } as unknown as IngestionService;

    const controller = new IngestionController(ingestionService);
    const response = await controller.uploadFile(
      {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
      } as Express.Multer.File,
      'corr-123',
    );

    expect(createJobFromUpload).toHaveBeenCalledWith(
      expect.any(Object),
      'anonymous',
      'corr-123',
    );
    expect(response).toBe(uploadResult);
  });

  it('returns the job service result without transforming it', async () => {
    const job = {
      id: 'job-1',
      status: 'pending',
    };
    const getJobById = jest.fn().mockResolvedValue(job);
    const ingestionService = {
      getJobById,
    } as unknown as IngestionService;
    const controller = new IngestionController(ingestionService);

    const response = await controller.getJob('job-1');

    expect(getJobById).toHaveBeenCalledWith('job-1');
    expect(response).toBe(job);
  });

  it('throws when a job does not exist', async () => {
    const controller = new IngestionController({
      getJobById: jest.fn().mockRejectedValue(new NotFoundException()),
    } as unknown as IngestionService);

    await expect(controller.getJob('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
