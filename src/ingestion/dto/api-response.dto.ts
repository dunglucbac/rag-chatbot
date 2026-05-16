export type ApiResponse<TData> = {
  status: 'success' | 'error';
  message: string;
  data: TData;
};
