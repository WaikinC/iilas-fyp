import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function usePagination<T>(items: T[], pageSize = 25) {
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = items.length ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(page * pageSize, items.length);
  return { pageItems: items.slice((page - 1) * pageSize, page * pageSize), page, pageCount, start, end, total: items.length, setPage };
}

type Props = { page: number; pageCount: number; start: number; end: number; total: number; setPage: (page: number) => void; label: string };
export default function Pagination({ page, pageCount, start, end, total, setPage, label }: Props) {
  return <footer className="pagination">
    <span role="status">{total ? `${start}–${end} of ${total.toLocaleString()} ${label}` : `0 ${label}`}</span>
    {pageCount > 1 && <nav aria-label={`${label} pages`}>
      <button type="button" aria-label={`Previous ${label} page`} disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" aria-label={`Next ${label} page`} disabled={page === pageCount} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></button>
    </nav>}
  </footer>;
}
