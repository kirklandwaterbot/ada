export function assertCompleteDataset(
  expectedRowCount: number | null,
  loadedRowCount: number,
  source: string,
) {
  if (loadedRowCount <= 0) {
    throw new Error(`Refusing to replace ${source} with an empty dataset.`);
  }

  if (
    expectedRowCount !== null &&
    expectedRowCount !== loadedRowCount
  ) {
    throw new Error(
      `Refusing to replace ${source}: expected ${expectedRowCount} rows but loaded ${loadedRowCount}.`,
    );
  }
}

export function getActualRowCountMatch(
  expectedRowCount: number | null,
  loadedRowCount: number,
) {
  return expectedRowCount === null
    ? null
    : expectedRowCount === loadedRowCount;
}

export function assertPersistedRowCount(
  intendedRowCount: number,
  persistedRowCount: number,
) {
  if (intendedRowCount !== persistedRowCount) {
    throw new Error(
      `MTA asset database validation failed: intended ${intendedRowCount} rows but persisted ${persistedRowCount}.`,
    );
  }
}
