import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageQueueRoutingService {
  route(eventType: string): 'image' | 'pdf' | 'unknown' {
    if (eventType === 'ingest.image.uploaded') {
      return 'image';
    }

    if (eventType === 'ingest.pdf.uploaded') {
      return 'pdf';
    }

    return 'unknown';
  }
}
