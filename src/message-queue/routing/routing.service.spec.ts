import { MessageQueueRoutingService } from './routing.service';

describe('MessageQueueRoutingService', () => {
  it('routes image and pdf events', () => {
    const routing = new MessageQueueRoutingService();

    expect(routing.route('ingest.image.uploaded')).toBe('image');
    expect(routing.route('ingest.pdf.uploaded')).toBe('pdf');
    expect(routing.route('other.event')).toBe('unknown');
  });
});
