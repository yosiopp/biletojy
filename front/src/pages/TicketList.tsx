import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, Tag, Ticket } from '../api/client';
import TagFilter from '../components/TagFilter';
import TicketRow from '../components/TicketRow';

function TicketList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [error, setError] = useState('');

  const q = searchParams.get('q') ?? '';
  const tags = (searchParams.get('tags') ?? '').split(',').filter((t) => t.length > 0);

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

      <div className="flex text-gray-500 border-b">
        <div className="flex-none w-16 py-1 pl-4">id</div>
        <div className="w-2/4 py-1">title</div>
        <div className="flex-1 py-1">tags</div>
        <div className="flex-none w-40 py-1 pr-4">updated</div>
      </div>
      {tickets.map((ticket) => (
        <TicketRow
          key={ticket.id}
          ticket={ticket}
          catalog={catalog}
          onClick={(id) => navigate(`/tickets/${id}`)}
        />
      ))}
      {tickets.length === 0 && <p className="text-neutral-500 p-4">チケットがありません</p>}
    </>
  );
}

export default TicketList;
