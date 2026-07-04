import type { Tag, Ticket } from '../api/client';
import { splitTags, tagColor } from '../lib/tags';
import TagItem from './TagItem';

type Props = {
  ticket: Ticket;
  catalog: Tag[];
  onClick: (id: number) => void;
};

function TicketRow({ ticket, catalog, onClick }: Props) {
  const { id, title, tags, updated_at } = ticket;
  return (
    <div className="flex items-center hover:bg-slate-100 cursor-pointer border-b" onClick={() => onClick(id)}>
      <div className="flex-none w-16 py-2 pl-4 text-neutral-500">{id}</div>
      <div className="w-2/4 py-2">{title}</div>
      <div className="flex-1 py-2">
        {splitTags(tags).map((tag) => (
          <TagItem key={tag} tag={tag} color={tagColor(catalog, tag)} />
        ))}
      </div>
      <div className="flex-none w-40 py-2 pr-4 text-sm text-neutral-500">
        {new Date(updated_at).toLocaleString()}
      </div>
    </div>
  );
}

export default TicketRow;
