import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, Tag, Ticket } from '../api/client';
import TagFilter from '../components/TagFilter';
import TicketRow from '../components/TicketRow';

function TicketList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // null はロード中（初回フェッチ完了前に空表示を出さないため）
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [error, setError] = useState('');

  const q = searchParams.get('q') ?? '';
  const tags = (searchParams.get('tags') ?? '').split(',').filter((t) => t.length > 0);
  const hasFilter = q.length > 0 || tags.length > 0;

  useEffect(() => {
    api.listTags().then(setCatalog).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    api
      .listTickets(q, tags)
      .then(setTickets)
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateParams = (nextQ: string, nextTags: string[]) => {
    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    if (nextTags.length > 0) params.set('tags', nextTags.join(','));
    setSearchParams(params);
  };

  return (
    <>
      <TagFilter
        selected={tags}
        onChange={(next) => updateParams(q, next)}
        query={q}
        onQueryChange={(next) => updateParams(next, tags)}
        catalog={catalog}
      />

      {error && <p className="text-red-600 mb-2">{error}</p>}

      <div className="hidden sm:flex text-gray-500 border-b">
        <div className="flex-none w-16 py-1 pl-4">id</div>
        <div className="w-2/4 py-1">title</div>
        <div className="flex-1 py-1">tags</div>
        <div className="flex-none w-40 py-1 pr-4">updated</div>
      </div>
      {tickets == null && !error && <p className="text-neutral-500 p-4">読み込み中...</p>}
      {tickets?.map((ticket) => (
        <TicketRow key={ticket.id} ticket={ticket} catalog={catalog} />
      ))}
      {tickets != null && tickets.length === 0 && (
        <div className="text-neutral-500 p-4">
          {hasFilter ? (
            <>
              条件に一致するチケットがありません
              <button
                type="button"
                className="text-blue-700 hover:underline ml-2"
                onClick={() => updateParams('', [])}
              >
                条件をクリア
              </button>
            </>
          ) : (
            <>
              チケットがありません
              <Link to="/tickets/new" className="text-blue-700 hover:underline ml-2">
                新規チケットを作成
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default TicketList;
