import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Comment, Tag, Ticket } from '../api/client';
import Markdown from '../components/Markdown';
import TagItem from '../components/TagItem';
import { currentUser, splitTags, tagColor } from '../lib/tags';

function TicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getTicket(id).then(setTicket).catch((e: Error) => setError(e.message));
    api.listComments(id).then(setComments).catch((e: Error) => setError(e.message));
    api.listTags().then(setCatalog).catch((e: Error) => setError(e.message));
  }, [id]);

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !commentText.trim()) return;
    try {
      await api.addComment(id, { content: commentText, created_by: currentUser() });
      setCommentText('');
      setComments(await api.listComments(id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!ticket) return <p className="text-neutral-500">読み込み中...</p>;

  return (
    <>
      <div className="flex items-start">
        <h2 className="text-xl flex-1">
          <span className="text-neutral-400 mr-2">#{ticket.id}</span>
          {ticket.title}
        </h2>
        <Link
          to={`/tickets/${ticket.id}/edit`}
          className="border rounded-sm px-3 py-1 text-sm hover:bg-neutral-100"
          title="ctrl+e"
        >
          編集
        </Link>
      </div>
      <div className="text-sm text-neutral-500 mb-2">
        {ticket.created_by} が作成 ・ 更新 {new Date(ticket.updated_at).toLocaleString()}
      </div>
      <div className="mb-4">
        {splitTags(ticket.tags).map((tag) => (
          <TagItem key={tag} tag={tag} color={tagColor(catalog, tag)} />
        ))}
      </div>

      <div className="border rounded-sm p-4 mb-6">
        <Markdown content={ticket.content} />
      </div>

      <h3 className="text-lg mb-2">コメント</h3>
      {comments.map((comment) => (
        <div key={comment.id} className="border rounded-sm p-3 mb-2">
          <div className="text-sm text-neutral-500 mb-1">
            {comment.created_by} ・ {new Date(comment.created_at).toLocaleString()}
          </div>
          <Markdown content={comment.content} />
        </div>
      ))}

      <form onSubmit={submitComment} className="mt-4">
        <textarea
          className="border rounded-sm w-full p-2 h-24"
          placeholder="コメントを追加（markdown可）"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
        <button type="submit" className="bg-blue-600 text-white rounded-sm px-4 py-1 mt-1 hover:bg-blue-700">
          コメント
        </button>
      </form>
    </>
  );
}

export default TicketDetail;
