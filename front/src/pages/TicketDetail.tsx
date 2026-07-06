import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Comment, Ticket } from '../api/client';
import CommentHistory from '../components/CommentHistory';
import Markdown from '../components/Markdown';
import TagItem from '../components/TagItem';
import TicketRefTextarea from '../components/TicketRefTextarea';
import { formatDateTime } from '../lib/date';
import { dropFiles, pasteFiles, selectFiles } from '../lib/attachFiles';
import { staleGuard } from '../lib/staleGuard';
import { currentUser, splitTags, tagColor } from '../lib/tags';
import { useCatalog } from '../lib/useCatalog';

function TicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [backlinks, setBacklinks] = useState<Ticket[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const catalog = useCatalog();
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [commentError, setCommentError] = useState('');
  // 履歴を開いているコメントのID
  const [openHistories, setOpenHistories] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    // idが変わったら前のチケットの表示を消し、遅れて届いた古いレスポンスは捨てる
    // 表示のリセットが目的のため、ここでのsetStateは意図したもの
    /* eslint-disable react-hooks/set-state-in-effect */
    setTicket(null);
    setComments([]);
    setBacklinks([]);
    setTicketError('');
    setCommentError('');
    setOpenHistories({});
    /* eslint-enable react-hooks/set-state-in-effect */
    const { fresh, cancel } = staleGuard();
    api.getTicket(id).then(fresh(setTicket)).catch(fresh((e: Error) => setTicketError(e.message)));
    api.listComments(id).then(fresh(setComments)).catch(fresh((e: Error) => setCommentError(e.message)));
    // バックリンクは補助情報のため、失敗しても本文表示は妨げない
    api.listBacklinks(id).then(fresh(setBacklinks)).catch(fresh(() => setBacklinks([])));
    return cancel;
  }, [id]);

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      // 作成されたコメントが全フィールド付きで返り、一覧はcreated_at昇順のため末尾に足すだけでよい
      const created = await api.addComment(id, { content: commentText, created_by: currentUser() });
      setCommentText('');
      setCommentError('');
      setComments((prev) => [...prev, created]);
    } catch (err) {
      setCommentError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (ticketError) return <p className="text-red-600 dark:text-red-400">{ticketError}</p>;
  if (!ticket) return <p className="text-neutral-500 dark:text-neutral-400">読み込み中...</p>;

  return (
    <>
      <div className="flex items-start">
        <h2 className="text-xl flex-1">
          <span className="text-neutral-400 mr-2">#{ticket.id}</span>
          {ticket.title}
        </h2>
        <Link
          to={`/tickets/${ticket.id}/history`}
          className="border rounded-sm px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 mr-2"
          title="ctrl+h"
        >
          履歴
        </Link>
        <Link
          to={`/tickets/${ticket.id}/edit`}
          className="border rounded-sm px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="ctrl+e"
        >
          編集
        </Link>
      </div>
      <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-2">
        <span title={ticket.created_sub || undefined}>{ticket.created_by}</span> が作成 ・ 更新{' '}
        {formatDateTime(ticket.updated_at)}
      </div>
      <div className="mb-4">
        {splitTags(ticket.tags).map((tag) => (
          <TagItem key={tag} tag={tag} color={tagColor(catalog, tag)} />
        ))}
      </div>

      <div className="mb-6">
        <Markdown content={ticket.content} />
      </div>

      {backlinks.length > 0 && (
        <div className="mb-6 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
          <h3 className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">このチケットを参照しているチケット</h3>
          <ul className="text-sm">
            {backlinks.map((b) => (
              <li key={b.id}>
                <Link to={`/tickets/${b.id}`} className="text-blue-700 dark:text-blue-400 hover:underline">
                  <span className="text-neutral-400 mr-1">#{b.id}</span>
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <hr className="border-t-2 border-neutral-300 dark:border-neutral-600 mb-6" />

      <h3 className="text-lg mb-2">コメント</h3>
      {commentError && <p className="text-red-600 dark:text-red-400 mb-2">{commentError}</p>}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
        {comments.map((comment) => (
          <div key={comment.id} className="py-3">
            <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
              <span title={comment.created_sub || undefined}>{comment.created_by}</span> ・{' '}
              {formatDateTime(comment.created_at)}
              {comment.updated_at !== comment.created_at && (
                <>
                  {' ・ '}
                  <button
                    type="button"
                    className="text-blue-700 dark:text-blue-400 hover:underline"
                    onClick={() => setOpenHistories((prev) => ({ ...prev, [comment.id]: !prev[comment.id] }))}
                  >
                    編集済み（履歴）
                  </button>
                </>
              )}
            </div>
            <Markdown content={comment.content} />
            {openHistories[comment.id] && (
              <CommentHistory
                comment={comment}
                onRestored={(updated) =>
                  setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                }
              />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submitComment} className="mt-4">
        <TicketRefTextarea
          className="border rounded-sm w-full p-2 h-24"
          placeholder="コメントを追加（markdown可、画像・ファイル添付可（ペースト/ドロップ）、#でチケット参照）"
          value={commentText}
          onChange={setCommentText}
          onPaste={(e) => pasteFiles(e, setCommentText, setCommentError)}
          onDrop={(e) => dropFiles(e, setCommentText, setCommentError)}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-sm px-4 py-1 mt-1 hover:bg-blue-700 disabled:opacity-50"
          disabled={submitting}
        >
          コメント
        </button>
        <button
          type="button"
          className="text-sm text-blue-700 dark:text-blue-400 hover:underline ml-3"
          onClick={() => fileRef.current?.click()}
        >
          ファイルを添付
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => selectFiles(e, setCommentText, setCommentError)}
        />
      </form>
    </>
  );
}

export default TicketDetail;
