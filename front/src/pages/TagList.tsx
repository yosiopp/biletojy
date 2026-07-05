import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Tag } from '../api/client';
import Dialog from '../components/Dialog';
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
  const [confirming, setConfirming] = useState<{ tag: Tag; message: string } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const reload = () => api.listTags().then(setCatalog).catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  // ctrl+shift+n（/tags?new=1）でタグ作成ダイアログを開く
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      // URLパラメータ起点でダイアログを開くため、ここでのsetStateは意図したもの
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(EMPTY);
      setSearchParams({}, { replace: true });
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

  // 削除前に使用状況を調べて確認ダイアログを開く
  const confirmRemove = async (tag: Tag) => {
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
    setConfirming({ tag, message });
  };

  // 並び替え単位（＝表示セクション）のキー。グループの値タグ（"status:OPEN" など）はグループ名、
  // 値なしのグループエントリ（"due-date@:" など）同士とグループでないタグ同士は、
  // それぞれまとめてひとつの並びとして扱う（一覧の並び順と同じ区分）
  const sectionOf = (tag: Tag): string => {
    const { group, name } = parseTag(tag.tag);
    if (group == null) return '';
    return name.length > 0 ? group : ':';
  };
  const sortMembers = (key: string) => catalog.filter((t) => sectionOf(t) === key);
  const dragTag = dragId != null ? catalog.find((t) => t.id === dragId) : undefined;
  const dragKey = dragTag ? sectionOf(dragTag) : null;

  // 同じ並び替え単位内でfromの位置のタグをtoの位置へ移動した並びを保存する
  const moveTo = async (key: string, from: number, to: number) => {
    const ids = sortMembers(key).map((t) => t.id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    try {
      await api.reorderTags(ids);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const dropOn = (target: Tag) => {
    const key = sectionOf(target);
    if (dragId == null || key !== dragKey) return;
    const ids = sortMembers(key).map((t) => t.id);
    moveTo(key, ids.indexOf(dragId), ids.indexOf(target.id));
  };

  // キーボード（↑↓）で並びを1つずつ移動する
  const moveBy = (tag: Tag, delta: number) => {
    const key = sectionOf(tag);
    const from = sortMembers(key).findIndex((t) => t.id === tag.id);
    moveTo(key, from, from + delta);
  };

  const remove = async () => {
    if (!confirming) return;
    setConfirming(null);
    try {
      await api.deleteTag(confirming.tag.id);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const editDialog = editing && (
    <Dialog label={editing.id == null ? '新規タグ' : 'タグの編集'} onClose={() => setEditing(null)}>
      <form onSubmit={submit} className="w-80 max-w-full">
        <h2 className="text-lg mb-2">{editing.id == null ? '新規タグ' : 'タグの編集'}</h2>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <label className="block text-sm text-neutral-600 mb-2">
          タグ
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            placeholder="status:OPEN / docs/design / due-date@: / estimate#:"
            value={editing.tag}
            onChange={(e) => setEditing({ ...editing, tag: e.target.value })}
            autoFocus
          />
        </label>
        <label className="block text-sm text-neutral-600 mb-2">
          説明
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            value={editing.note}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
          />
        </label>
        <label className="block text-sm text-neutral-600 mb-3">
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
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100"
            onClick={() => setEditing(null)}
          >
            キャンセル
          </button>
          <button type="submit" className="bg-blue-600 text-white rounded-sm px-4 py-1 ml-2 hover:bg-blue-700">
            {editing.id == null ? '作成' : '更新'}
          </button>
        </div>
      </form>
    </Dialog>
  );

  const confirmDialog = confirming && (
    <Dialog label="タグの削除" onClose={() => setConfirming(null)}>
      <div className="w-96 max-w-full">
        <h2 className="text-lg mb-2">タグの削除</h2>
        <p className="text-sm whitespace-pre-line mb-3">{confirming.message}</p>
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100"
            onClick={() => setConfirming(null)}
            autoFocus
          >
            キャンセル
          </button>
          <button
            type="button"
            className="bg-red-600 text-white rounded-sm px-4 py-1 ml-2 hover:bg-red-700"
            onClick={remove}
          >
            削除する
          </button>
        </div>
      </div>
    </Dialog>
  );

  return (
    <>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">タグ一覧</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          title="ctrl+shift+n"
          onClick={() => {
            setError('');
            setEditing(EMPTY);
          }}
        >
          + 新規タグ
        </button>
      </div>
      {error && !editing && <p className="text-red-600 mb-2">{error}</p>}
      {editDialog}
      {confirmDialog}

      <div className="hidden sm:flex text-neutral-500 border-b">
        <div className="w-1/3 py-1 pl-2">tag</div>
        <div className="w-1/4 py-1">説明</div>
        <div className="flex-1 py-1">属性</div>
        <div className="flex-none w-32 py-1"></div>
      </div>
      {catalog.map((tag, i) => {
        const key = sectionOf(tag);
        const sortable = sortMembers(key).length > 1;
        const next = catalog[i + 1];
        const sectionEnd = next == null || sectionOf(next) !== sectionOf(tag);
        return (
        <div
          key={tag.id}
          className={`block sm:flex sm:items-center ${
            sectionEnd ? 'border-b-2 border-b-neutral-300' : 'border-b'
          } hover:bg-neutral-100 px-2 py-2 sm:px-0 sm:py-0 ${dropId === tag.id ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => {
            if (sortable && dragKey === key && dragId !== tag.id) {
              e.preventDefault();
              setDropId(tag.id);
            }
          }}
          onDragLeave={() => setDropId((id) => (id === tag.id ? null : id))}
          onDrop={(e) => {
            e.preventDefault();
            dropOn(tag);
            setDragId(null);
            setDropId(null);
          }}
        >
          <div className="sm:w-1/3 sm:py-2 sm:pl-2">
            <span className="inline-block w-5">
              {sortable && (
                <button
                  type="button"
                  draggable
                  className="cursor-grab text-neutral-400 hover:text-neutral-700 text-sm"
                  title="ドラッグまたは↑↓キーで並び替え"
                  aria-label={`${tag.tag} を並び替え`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', tag.tag);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(tag.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      moveBy(tag, e.key === 'ArrowUp' ? -1 : 1);
                    }
                  }}
                >
                  ⋮⋮
                </button>
              )}
            </span>
            <TagItem tag={tag.tag} color={tag.color} />
          </div>
          <div className="sm:w-1/4 sm:py-2 text-sm">{tag.note}</div>
          <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0 text-sm text-neutral-500">
            {tag.is_group && <span className="mr-2">グループ</span>}
            {tag.is_range && <span className="mr-2">{parseTag(tag.tag).isNumber ? '数値' : '日時'}</span>}
            {tag.tag.includes('/') && <span className="mr-2">階層</span>}
          </div>
          <div className="sm:flex-none sm:w-32 sm:py-2 sm:pr-2 sm:text-right mt-1 sm:mt-0 text-sm">
            <button
              type="button"
              className="text-blue-700 hover:underline mr-3"
              onClick={() => {
                setError('');
                setEditing({ id: tag.id, tag: tag.tag, note: tag.note ?? '', color: tag.color ?? '' });
              }}
            >
              編集
            </button>
            <button type="button" className="text-red-600 hover:underline" onClick={() => confirmRemove(tag)}>
              削除
            </button>
          </div>
        </div>
        );
      })}
    </>
  );
}

export default TagList;
