/**
 * Two-page spreads, as the reader shows them: pages pair up in order, but a wide page (a
 * spread printed as one image) stands alone, and pairing starts again after it. Each spread
 * lists its pages, left to right in reading order.
 */
export function buildSpreads(
  pageCount: number,
  widePages: ReadonlySet<number>,
): number[][] {
  const spreads: number[][] = []
  let page = 1
  while (page <= pageCount) {
    const next = page + 1
    if (widePages.has(page) || next > pageCount || widePages.has(next)) {
      spreads.push([page])
      page += 1
    } else {
      spreads.push([page, next])
      page += 2
    }
  }
  return spreads
}

/** The index of the spread showing `page`, or -1 when no spread does. */
export function findSpread(spreads: number[][], page: number): number {
  let lo = 0
  let hi = spreads.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const spread = spreads[mid]
    if (page < spread[0]) hi = mid - 1
    else if (page > spread[spread.length - 1]) lo = mid + 1
    else return mid
  }
  return -1
}
