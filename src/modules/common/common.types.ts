export type ApiResponse<TData> = {
  status: 'success' | 'error';
  message: string;
  data: TData;
};

export type DispatchEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  schemaVersion: number;
  eventId: string;
  eventType: string;
  correlationId: string;
  attempt: number;
  createdAt: string;
  payload: TPayload;
};
