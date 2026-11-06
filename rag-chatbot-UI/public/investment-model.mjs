export function formatInvestmentVnd(value) {
  if (value === null || value === undefined) return 'Unknown';
  const [whole, decimals = ''] = String(value).split('.');
  const fraction = decimals.replace(/0+$/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''} VND`;
}

export function investmentInput(fields, requestId) {
  const { symbol, type, occurredOn, note } = fields;
  if (!/^[A-Z0-9]{3,10}$/.test(symbol.trim().toUpperCase()))
    throw new Error('Enter a valid stock symbol.');
  if (!occurredOn) throw new Error('Choose a date.');
  const input = {
    requestId,
    type,
    occurredOn,
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  if (type === 'interest') input.level = fields.level;
  if (type === 'decision') input.decision = fields.decision;
  if (['buy', 'sell', 'position'].includes(type)) {
    if (!/^\d+$/.test(fields.shares))
      throw new Error('Enter a whole number of shares.');
    input.shares = Number(fields.shares);
    if (
      !Number.isSafeInteger(input.shares) ||
      input.shares > 1000000000 ||
      (type !== 'position' && input.shares === 0)
    )
      throw new Error('Enter a valid number of shares.');
  }
  if (['buy', 'sell'].includes(type)) {
    input.priceVnd = fields.priceVnd.trim();
    if (
      !/^\d{1,12}(?:\.\d{1,4})?$/.test(input.priceVnd) ||
      !/[1-9]/.test(input.priceVnd)
    )
      throw new Error('Enter a valid price per share in VND.');
    if (fields.feesVnd.trim()) input.feesVnd = fields.feesVnd.trim();
  }
  if (type === 'position' && fields.averageCostVnd.trim())
    input.averageCostVnd = fields.averageCostVnd.trim();
  return { symbol: symbol.trim().toUpperCase(), input };
}
