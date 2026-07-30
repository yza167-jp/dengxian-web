export function normalizeSeed(seed: number): number {
  const value = seed >>> 0;
  return value === 0 ? 0x6d2b79f5 : value;
}

export function nextRandom(state: number): { value: number; state: number } {
  let next = normalizeSeed(state);
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  next >>>= 0;
  return { value: next / 0x1_0000_0000, state: next };
}

export function randomInt(
  state: number,
  maximumExclusive: number,
): { value: number; state: number } {
  if (!Number.isInteger(maximumExclusive) || maximumExclusive <= 0) {
    throw new Error('maximumExclusive must be a positive integer');
  }
  const next = nextRandom(state);
  return {
    value: Math.floor(next.value * maximumExclusive),
    state: next.state,
  };
}

export function shuffleSeeded<T>(
  input: readonly T[],
  state: number,
): { value: T[]; state: number } {
  const value = [...input];
  let cursorState = normalizeSeed(state);
  for (let index = value.length - 1; index > 0; index -= 1) {
    const next = randomInt(cursorState, index + 1);
    cursorState = next.state;
    [value[index], value[next.value]] = [value[next.value]!, value[index]!];
  }
  return { value, state: cursorState };
}
