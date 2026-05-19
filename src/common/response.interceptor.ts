import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponseEnvelope<T> {
  status: 'success';
  message: string;
  data: T;
}

function isAlreadyWrapped(data: unknown): data is ApiResponseEnvelope<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    'data' in data
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponseEnvelope<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseEnvelope<T>> {
    return next.handle().pipe(
      map((data) => {
        if (isAlreadyWrapped(data)) {
          return data as ApiResponseEnvelope<T>;
        }
        return {
          status: 'success' as const,
          message: 'Success',
          data: data as T,
        };
      }),
    );
  }
}
