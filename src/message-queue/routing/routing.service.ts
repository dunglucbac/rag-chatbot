import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageQueueRoutingService {
  route(eventType: string): 'image' | 'pdf' | 'status' | 'results' | 'unknown' {
    if (eventType === 'image.classify.requested') {
      return 'image';
    }

    if (eventType === 'doc.pdf.parse.requested') {
      return 'pdf';
    }

    if (
      eventType === 'job.processing.started' ||
      eventType === 'doc.pdf.parse.completed' ||
      eventType === 'image.classify.completed' ||
      eventType === 'job.failed'
    ) {
      return 'status';
    }

    if (
      eventType === 'receipt.parsed' ||
      eventType === 'payment.detected' ||
      eventType === 'doc.chunks.embed.requested' ||
      eventType === 'receipt.needs_review'
    ) {
      return 'results';
    }

    return 'unknown';
  }
}
