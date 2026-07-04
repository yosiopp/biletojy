import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Tag } from '../api/client';
import Markdown from '../components/Markdown';
import TagInput from '../components/TagInput';
import { currentUser, joinTags, setCurrentUser, splitTags } from '../lib/tags';

// チケット作成（/tickets/new）と編集（/tickets/:id/edit）を兼ねるフォーム
function TicketForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id != null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [user, setUser] = useState(currentUser());
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listTags().then(setCatalog).catch((e: Error) => setError(e.message));
    if (isEdit) {
      api
        .getTicket(id)
        .then((ticket) => {
          setTitle(ticket.title);
          setContent(ticket.content);
          setTags(splitTags(ticket.tags));
        })
        .catch((e: Error) => setError(e.message));
    }
  }, [id, isEdit]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }
    setCurrentUser(user);
    try {
      const data = { title, content, tags: joinTags(tags) };
      const ticket = isEdit
        ? await api.updateTicket(id, data)
        : await api.createTicket({ ...data, created_by: user });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit}>
      <h2 className="text-xl mb-2">{isEdit ? `チケット編集 #${id}` : 'チケット作成'}</h2>
      {error && <p className="text-red-600 mb-2">{error}</p>}

      <input
        type="text"
        className="border rounded-sm w-full px-2 py-1 mb-2 text-lg"
        placeholder="タイトル"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div className="mb-1">
        <button
          type="button"
          className={`text-sm border rounded-l px-3 py-0.5 ${!preview ? 'bg-neutral-200' : ''}`}
          onClick={() => setPreview(false)}
        >
          編集
        </button>
        <button
          type="button"
          className={`text-sm border rounded-r px-3 py-0.5 ${preview ? 'bg-neutral-200' : ''}`}
          onClick={() => setPreview(true)}
        >
          プレビュー
        </button>
      </div>
      {preview ? (
        <div className="border rounded-sm p-4 mb-2 min-h-64">
          <Markdown content={content} />
        </div>
      ) : (
        <textarea
          className="border rounded-sm w-full p-2 h-64 mb-2 font-mono text-sm"
          placeholder={'本文（markdown / mermaid可）\n\n```mermaid\ngraph TD; A-->B;\n```'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      <div className="border rounded-sm p-2 mb-2">
        <div className="text-sm text-neutral-500 mb-1">タグ</div>
        <TagInput value={tags} onChange={setTags} catalog={catalog} />
      </div>

      {!isEdit && (
        <label className="block mb-2 text-sm text-neutral-600">
          作成者
          <input
            type="text"
            className="border rounded-sm px-2 py-1 ml-2"
            value={user}
            onChange={(e) => setUser(e.target.value)}
          />
        </label>
      )}

      <button type="submit" className="bg-blue-600 text-white rounded-sm px-4 py-1 hover:bg-blue-700">
        {isEdit ? '更新' : '作成'}
      </button>
      <button
        type="button"
        className="border rounded-sm px-4 py-1 ml-2 hover:bg-neutral-100"
        onClick={() => navigate(-1)}
      >
        キャンセル
      </button>
    </form>
  );
}

export default TicketForm;
