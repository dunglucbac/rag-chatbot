export enum SortType {
  DESC = 'desc',
  ASC = 'asc',
}

export type FindAllResponse<T> = {
  count: number;
  items: T[];
};

export type SortParams = {
  sortBy: string;
  sortType: SortType;
};

export type SearchParams = {
  keyword: string;
  field: string;
};

export type PaginateParams = {
  offset: number;
  limit: number;
};

export type DispatchEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  eventId: string;
  eventType: string;
  createdAt: string;
  payload?: TPayload;
};
