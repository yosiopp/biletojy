import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Tag } from '../api/client';
import TagItem from '../components/TagItem';
import { parseTag, splitTags } from '../lib/tags';

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
      // URLパラメータ起点でフォームを開くため、ここでのsetStateは意図したもの
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    let message = `タグ「${tag.tag}」を削除しますか？`;
    try {
      // 検索APIは前方一致や日時の範囲解釈をするため、件数は取得結果から文字列一致で数える
      // グループエントリ（"status:" 等）はそのグループの値を持つチケットを数える
      // 単純なタグならタグ検索は完全一致の上位集合を返すため、事前絞り込みで取得量を減らせる
      // （過去に作られたタグは , | 空白 などの検索メタ文字を含み得るため、その場合は全件取得する）
      const canPrefilter =
        !tag.tag.endsWith(':') && !tag.tag.startsWith('-') && !/[,|\s]/.test(tag.tag);
      const all = await api.listTickets('', canPrefilter ? [tag.tag] : []);
      const used = all.filter((ticket) => {
        const tags = splitTags(ticket.tags);
        if (tag.tag.endsWith(':')) return tags.some((t) => t.startsWith(tag.tag));
        return tags.includes(tag.tag);
      });
      if (used.length > 0) {
        message =
          `タグ「${tag.tag}」は ${used.length} 件のチケットで使用されています。\n` +
          '削除してもチケット側のタグ表記は残りますが、色やグループなどの機能は失われます。\n' +
          '削除しますか？';
      }
    } catch {
      // 件数の取得に失敗した場合は通常の確認にフォールバック
    }
    if (!confirm(message)) return;
    try {
      await api.deleteTag(tag.id);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const form = editing && (
    <form onSubmit={submit} className="border rounded-sm p-3 mb-4 bg-neutral-50 flex flex-wrap gap-2 items-end">
      <label className="text-sm text-neutral-600">
        タグ
        <input
          ref={tagInputRef}
          type="text"
          className="border rounded-sm px-2 py-1 block w-64"
          placeholder="status:OPEN / docs/design / due-date@: / estimate#:"
          value={editing.tag}
          onChange={(e) => setEditing({ ...editing, tag: e.target.value })}
          autoFocus
        />
      </label>
      <label className="text-sm text-neutral-600">
        説明
        <input
          type="text"
          className="border rounded-sm px-2 py-1 block w-48"
          value={editing.note}
          onChange={(e) => setEditing({ ...editing, note: e.target.value })}
        />
      </label>
      <label className="text-sm text-neutral-600">
        色
        <span className="flex items-center gap-1">
          <input
            type="color"
            className="border rounded-sm h-8 w-10"
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
      <button type="submit" className="bg-blue-600 text-white rounded-sm px-4 py-1 hover:bg-blue-700">
        {editing.id == null ? '作成' : '更新'}
      </button>
      <button
        type="button"
        className="border rounded-sm px-4 py-1 hover:bg-neutral-100"
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
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          title="ctrl+shift+n"
          onClick={() => setEditing(EMPTY)}
        >
          + 新規タグ
        </button>
      </div>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      {form}

      <div className="hidden sm:flex text-neutral-500 border-b">
        <div className="w-1/3 py-1 pl-2">tag</div>
        <div className="w-1/4 py-1">説明</div>
        <div className="flex-1 py-1">属性</div>
        <div className="flex-none w-32 py-1"></div>
      </div>
      {catalog.map((tag) => (
        <div
          key={tag.id}
          className="block sm:flex sm:items-center border-b hover:bg-neutral-100 px-2 py-2 sm:px-0 sm:py-0"
        >
          <div className="sm:w-1/3 sm:py-2 sm:pl-2">
            <TagItem tag={tag.tag} color={tag.color} />
          </div>
          <div className="sm:w-1/4 sm:py-2 text-sm">{tag.note}</div>
          <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0 text-sm text-neutral-500">
            {tag.is_group && <span className="mr-2">グループ</span>}
            {tag.is_range && <span className="mr-2">{parseTag(tag.tag).isNumber ? '数値' : '日時'}</span>}
            {tag.tag.includes('/') && <span className="mr-2">階層</span>}
          </div>
          <div className="sm:flex-none sm:w-32 sm:py-2 mt-1 sm:mt-0 text-sm">
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
