import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Tag } from '../api/client';
import TagItem from '../components/TagItem';

type Editing = {
  id: number | null; // nullは新規作成
  tag: string;
  note: string;
  color: string;
};

const EMPTY: Editing = { id: null, tag: '', note: '', color: '' };

function TagList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Tag[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  const reload = () => api.listTags().then(setCatalog).catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  // ctrl+shift+n（/tags?new=1）でタグ作成フォームを開く
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(EMPTY);
      setSearchParams({}, { replace: true });
      setTimeout(() => tagInputRef.current?.focus(), 0);
    }
  }, [searchParams, setSearchParams]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.tag.trim()) return;
    const data = {
      tag: editing.tag.trim(),
      note: editing.note || null,
      color: editing.color || null,
    };
    try {
      if (editing.id == null) {
        await api.createTag(data);
      } else {
        await api.updateTag(editing.id, data);
      }
      setEditing(null);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (tag: Tag) => {
    if (!confirm(`タグ「${tag.tag}」を削除しますか？`)) return;
    try {
      await api.deleteTag(tag.id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const form = editing && (
    <form onSubmit={submit} className="border rounded p-3 mb-4 bg-neutral-50 flex flex-wrap gap-2 items-end">
      <label className="text-sm text-neutral-600">
        タグ
        <input
          ref={tagInputRef}
          type="text"
          className="border rounded px-2 py-1 block w-64"
          placeholder="status:OPEN / docs/design / due-date@:"
          value={editing.tag}
          onChange={(e) => setEditing({ ...editing, tag: e.target.value })}
          autoFocus
        />
      </label>
      <label className="text-sm text-neutral-600">
        説明
        <input
          type="text"
          className="border rounded px-2 py-1 block w-48"
          value={editing.note}
          onChange={(e) => setEditing({ ...editing, note: e.target.value })}
        />
      </label>
      <label className="text-sm text-neutral-600">
        色
        <span className="flex items-center gap-1">
          <input
            type="color"
            className="border rounded h-8 w-10"
            value={editing.color || '#a3a3a3'}
            onChange={(e) => setEditing({ ...editing, color: e.target.value })}
          />
          {editing.color && (
            <button
              type="button"
              className="text-xs text-neutral-500 underline"
              onClick={() => setEditing({ ...editing, color: '' })}
            >
              色なし
            </button>
          )}
        </span>
      </label>
      <button type="submit" className="bg-blue-600 text-white rounded px-4 py-1 hover:bg-blue-700">
        {editing.id == null ? '作成' : '更新'}
      </button>
      <button
        type="button"
        className="border rounded px-4 py-1 hover:bg-neutral-100"
        onClick={() => setEditing(null)}
      >
        キャンセル
      </button>
    </form>
  );

  return (
    <>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">タグ一覧</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700"
          title="ctrl+shift+n"
          onClick={() => setEditing(EMPTY)}
        >
          + 新規タグ
        </button>
      </div>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      {form}

      <div className="flex text-gray-500 border-b">
        <div className="w-1/3 py-1 pl-2">tag</div>
        <div className="w-1/4 py-1">説明</div>
        <div className="flex-1 py-1">属性</div>
        <div className="flex-none w-32 py-1"></div>
      </div>
      {catalog.map((tag) => (
        <div key={tag.id} className="flex items-center border-b hover:bg-slate-50">
          <div className="w-1/3 py-2 pl-2">
            <TagItem tag={tag.tag} color={tag.color} />
          </div>
          <div className="w-1/4 py-2 text-sm">{tag.note}</div>
          <div className="flex-1 py-2 text-sm text-neutral-500">
            {tag.is_group && <span className="mr-2">グループ</span>}
            {tag.is_range && <span className="mr-2">日時</span>}
            {tag.tag.includes('/') && <span className="mr-2">階層</span>}
          </div>
          <div className="flex-none w-32 py-2 text-sm">
            <button
              type="button"
              className="text-blue-700 hover:underline mr-3"
              onClick={() =>
                setEditing({ id: tag.id, tag: tag.tag, note: tag.note ?? '', color: tag.color ?? '' })
              }
            >
              編集
            </button>
            <button type="button" className="text-red-600 hover:underline" onClick={() => remove(tag)}>
              削除
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export default TagList;
