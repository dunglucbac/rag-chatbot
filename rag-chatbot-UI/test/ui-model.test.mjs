import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fileType,
  inputTimestamp,
  localInput,
  MAX_FILE_BYTES,
} from '../public/ui-model.mjs';

test('receipt file validation supports phone formats and rejects empty, oversized, and unsupported files', () => {
  assert.equal(fileType({ name: 'Receipt.HEIC', size: 500 }), 'image/heic');
  assert.equal(fileType({ name: 'receipt.pdf', size: 500 }), 'application/pdf');
  assert.throws(() => fileType({ name: 'receipt.exe', size: 500 }));
  assert.throws(() => fileType({ name: 'receipt.jpg', size: 0 }));
  assert.throws(() =>
    fileType({ name: 'receipt.jpg', size: MAX_FILE_BYTES + 1 }),
  );
});

test('editing receipt dates preserves Vietnam time regardless of the browser timezone', () => {
  const instant = '2026-10-29T18:30:15.000Z';
  assert.equal(localInput(instant), '2026-10-30T01:30:15');
  assert.equal(inputTimestamp(localInput(instant)), instant);
  assert.throws(() => inputTimestamp('not a date'));
});
