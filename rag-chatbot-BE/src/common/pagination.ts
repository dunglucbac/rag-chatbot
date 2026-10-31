import { BadRequestException } from '@nestjs/common';

export function pageNumber(value: string | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  ) {
    throw new BadRequestException('Invalid pagination value');
  }
  return Number(value);
}
