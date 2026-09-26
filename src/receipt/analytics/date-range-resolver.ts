import { Injectable } from '@nestjs/common';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const UTC_OFFSET_MS = 7 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export class InvalidDateRangeError extends Error {
  readonly code = 'INVALID_DATE_RANGE';

  constructor(message: string) {
    super(message);
    this.name = InvalidDateRangeError.name;
  }
}

export enum DateRangeType {
  RELATIVE = 'relative',
  ABSOLUTE = 'absolute',
}

export enum RelativePeriod {
  LAST_WEEK = 'last_week',
  LAST_MONTH = 'last_month',
}

export type DateRangeInput =
  | {
      rangeType: DateRangeType.RELATIVE;
      period: RelativePeriod;
    }
  | {
      rangeType: DateRangeType.ABSOLUTE;
      startDate: string;
      endDate: string;
    };

export interface ResolvedDateRange {
  start: Date;
  end: Date;
  timeZone: typeof TIME_ZONE;
}

@Injectable()
export class DateRangeResolver {
  resolve(input: DateRangeInput, now = new Date()): ResolvedDateRange {
    if (input.rangeType === DateRangeType.ABSOLUTE) {
      const start = this.parseLocalDate(input.startDate);
      const end = this.parseLocalDate(input.endDate);
      if (end <= start) {
        throw new InvalidDateRangeError('End date must be after start date');
      }
      if (end - start > 366 * DAY_MS) {
        throw new InvalidDateRangeError('Date range cannot exceed 366 days');
      }

      return {
        start: new Date(start - UTC_OFFSET_MS),
        end: new Date(end - UTC_OFFSET_MS),
        timeZone: TIME_ZONE,
      };
    }

    const localNow = new Date(now.getTime() + UTC_OFFSET_MS);
    if (input.period === RelativePeriod.LAST_MONTH) {
      const currentMonth = Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        1,
      );
      const previousMonth = Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth() - 1,
        1,
      );
      return {
        start: new Date(previousMonth - UTC_OFFSET_MS),
        end: new Date(currentMonth - UTC_OFFSET_MS),
        timeZone: TIME_ZONE,
      };
    }

    if (input.period !== RelativePeriod.LAST_WEEK) {
      throw new InvalidDateRangeError(
        `Unsupported relative period: ${String(input.period)}`,
      );
    }

    const localDate = Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
    );
    const daysSinceMonday = (localNow.getUTCDay() + 6) % 7;
    const currentMonday = localDate - daysSinceMonday * DAY_MS;
    const previousMonday = currentMonday - 7 * DAY_MS;

    return {
      start: new Date(previousMonday - UTC_OFFSET_MS),
      end: new Date(currentMonday - UTC_OFFSET_MS),
      timeZone: TIME_ZONE,
    };
  }

  private parseLocalDate(value: string): number {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new InvalidDateRangeError(`Invalid date: ${value}`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new InvalidDateRangeError(`Invalid date: ${value}`);
    }

    return timestamp;
  }
}
