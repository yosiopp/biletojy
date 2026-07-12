import { Link } from 'react-router-dom';
import type { Ticket } from '../api/client';
import { formatDateTime } from '../lib/date';
import { splitTags, tagColor, TagColorMap } from '../lib/tags';
import TagItem from './TagItem';

// デスクトップではテーブル風の1行、モバイル（sm未満）ではカード型に組み替える
function TicketRow({ ticket, colors }: { ticket: Ticket; colors: TagColorMap }) {
  const { id, title, tags, updated_at } = ticket;
  return (
    <Link
      to={`/tickets/${id}`}
      className="block sm:flex sm:items-center hover:bg-neutral-100 dark:hover:bg-neutral-800 border-b px-2 py-2 sm:px-0 sm:py-0"
    >
      <div className="hidden sm:block flex-none w-16 sm:py-2 sm:pl-4 text-neutral-500 dark:text-neutral-400">{id}</div>
      <div className="sm:w-2/4 sm:py-2">
        <span className="sm:hidden text-neutral-500 dark:text-neutral-400 mr-2">#{id}</span>
        {title}
      </div>
      <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0">
        {splitTags(tags).map((tag) => (
          <TagItem key={tag} tag={tag} color={tagColor(colors, tag)} />
        ))}
      </div>
      <div className="sm:flex-none sm:w-40 sm:py-2 sm:pr-4 text-sm text-neutral-500 dark:text-neutral-400">
        {formatDateTime(updated_at)}
      </div>
    </Link>
  );
}

export default TicketRow;
