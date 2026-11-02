export const PAGE_SIZE = 25;

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);

  if (!Number.isInteger(page) || page < 1 || page > 10_000) {
    return 1;
  }

  return page;
}

export function pageCountFor(total: number, pageSize = PAGE_SIZE): number {
  if (total <= 0) {
    return 1;
  }

  return Math.ceil(total / pageSize);
}

export function pageBounds(
  page: number,
  pageSize = PAGE_SIZE,
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
