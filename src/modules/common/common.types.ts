export type DispatchEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  schemaVersion: 1;
  eventId: string;
  eventType: string;
  correlationId: string;
  attempt: number;
  createdAt: string;
  payload: TPayload;
};
