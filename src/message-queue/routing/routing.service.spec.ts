import { MessageQueueRoutingService } from './routing.service';

describe('MessageQueueRoutingService', () => {
  it('routes requested-work events and future status events', () => {
    const routing = new MessageQueueRoutingService();

    expect(routing.route('doc.pdf.parse.requested')).toBe('pdf');
    expect(routing.route('image.classify.requested')).toBe('image');
    expect(routing.route('job.processing.started')).toBe('status');
    expect(routing.route('other.event')).toBe('unknown');
  });
});
