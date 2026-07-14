import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, Tag } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import Icon from '../components/Icon';
import RowIconButton from '../components/RowIconButton';
import TagCatalogMenu from '../components/TagCatalogMenu';
import TagItem from '../components/TagItem';
import { currentUser, parseTag } from '../lib/tags';
import { invalidateCatalog } from '../lib/useCatalog';

type Editing = {
  id: number | null; // nullは新規作成
  tag: string;
  note: string;
  color: string;
};

const EMPTY: Editing = { id: null, tag: '', note: '', color: '' };

// 並び替え単位（＝表示セクション）のキー。グループの値タグ（"status:OPEN" など）はグループ名、
// 値なしのグループエントリ（"due-date@:" など）同士とグループでないタグ同士は、
// それぞれまとめてひとつの並びとして扱う（一覧の並び順と同じ区分）
const sectionOf = (tag: Tag): string => {
  const { group, name } = parseTag(tag.tag);
  if (group == null) return '';
  return name.length > 0 ? group : ':';
};

function TagList() {
  const [searchParams, setSearchParams] = useSearchParams();
  // カタログ。nullはロード未完了（初回表示・取得失敗時に「0件」と区別する）
  const [catalog, setCatalog] = useState<Tag[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirming, setConfirming] = useState<{ tag: Tag; message: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // タグ名変更の確認メッセージ
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  // 画面上部のメッセージ。エラーと完了通知（エクスポート/インポート等）は同時に片方だけ表示する
  const [status, setStatus] = useState<{ kind: 'error' | 'notice'; text: string } | null>(null);
  const setError = (text: string) => setStatus({ kind: 'error', text });
  // タグ名・説明での絞り込みワード。他画面から戻っても保てるようURLクエリで保持する（チケット一覧と同じ流儀）
  const filter = searchParams.get('filter') ?? '';
  const setFilter = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('filter', value);
    else params.delete('filter');
    setSearchParams(params, { replace: true });
  };

  // setStatusを直接使う（安定なsetStateのみ参照させ、useEffectの依存に載せずに済ませる）
  const reload = () =>
    api
      .listTags()
      .then(setCatalog)
      .catch((e: Error) => setStatus({ kind: 'error', text: e.message }));

  // タグを変更したら、useCatalogの共有キャッシュを無効化した上で一覧を取得し直す
  const reloadAfterChange = () => {
    invalidateCatalog();
    setStatus(null);
    return reload();
  };

  useEffect(() => {
    reload();
  }, []);

  // ctrl+shift+n（/tags?new=1）でタグ作成ダイアログを開く
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      // URLパラメータ起点でダイアログを開くため、ここでのsetStateは意図したもの
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(EMPTY);
      const params = new URLSearchParams(searchParams);
      params.delete('new');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // タグを使用しているチケット数を件数専用APIで取得する（削除・タグ名変更の確認ダイアログ用）。
  // 判定はサーバー側で行われる（完全一致。グループエントリ "status:" 等はそのグループの値を持つチケットを数える）
  const countUsage = async (tag: Tag): Promise<number> => (await api.countTagUsage(tag.id)).count;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.tag.trim()) return;
    // タグ名の変更は使用中チケットの一括書き換えを伴うため、使用状況を調べて警告ダイアログを挟む
    const original = editing.id != null ? catalog?.find((t) => t.id === editing.id) : undefined;
    const name = editing.tag.trim();
    if (original && original.tag !== name) {
      let count = 0;
      try {
        count = await countUsage(original);
      } catch {
        // 件数の取得に失敗した場合は件数なしの確認にフォールバック
      }
      const message =
        `タグ名を「${original.tag}」から「${name}」へ変更します。\n` +
        (count > 0
          ? `このタグを使用している ${count} 件のチケットのタグも一括で変更されます。\n`
          : '') +
        '変更しますか？';
      setRenaming(message);
      return;
    }
    const data = {
      tag: name,
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
      await reloadAfterChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // タグ名変更の確認後、カタログと使用中チケットのタグを一括で変更する
  const rename = async () => {
    if (renaming == null || !editing || editing.id == null) return;
    setRenaming(null);
    try {
      await api.renameTag(editing.id, {
        tag: editing.tag.trim(),
        note: editing.note || null,
        color: editing.color || null,
        updated_by: currentUser(),
      });
      setEditing(null);
      await reloadAfterChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // 削除前に使用状況を調べて確認ダイアログを開く
  const confirmRemove = async (tag: Tag) => {
    let message = `タグ「${tag.tag}」を削除しますか？`;
    try {
      const used = await countUsage(tag);
      if (used > 0) {
        message =
          `タグ「${tag.tag}」は ${used} 件のチケットで使用されています。\n` +
          '削除してもチケット側のタグ表記は残りますが、色やグループなどの機能は失われます。\n' +
          '削除しますか？';
      }
    } catch {
      // 件数の取得に失敗した場合は通常の確認にフォールバック
    }
    setConfirming({ tag, message });
  };

  // 並び替え単位ごとのタグ一覧。ドラッグ中などの再レンダーのたびに全タグを解析し直さないよう、
  // カタログの変化時にまとめて構築する
  const sections = useMemo(() => {
    const m = new Map<string, Tag[]>();
    for (const t of catalog ?? []) {
      const key = sectionOf(t);
      const members = m.get(key);
      if (members) members.push(t);
      else m.set(key, [t]);
    }
    return m;
  }, [catalog]);
  const sortMembers = (key: string) => sections.get(key) ?? [];
  const dragTag = dragId != null ? catalog?.find((t) => t.id === dragId) : undefined;
  const dragKey = dragTag ? sectionOf(dragTag) : null;

  // タグ名・説明の部分一致（大文字小文字を無視）で表示を絞り込む
  const visible = useMemo(() => {
    const list = catalog ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.tag.toLowerCase().includes(q) || (t.note ?? '').toLowerCase().includes(q));
  }, [catalog, filter]);

  // 同じ並び替え単位内でfromの位置のタグをtoの位置へ移動した並びを保存する
  const moveTo = async (key: string, from: number, to: number) => {
    const ids = sortMembers(key).map((t) => t.id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    try {
      await api.reorderTags(ids);
      await reloadAfterChange();
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
      await reloadAfterChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const editDialog = editing && (
    <Dialog label={editing.id == null ? '新規タグ' : 'タグの編集'} onClose={() => setEditing(null)}>
      <form onSubmit={submit} className="w-80 max-w-full">
        <h2 className="text-lg mb-2">{editing.id == null ? '新規タグ' : 'タグの編集'}</h2>
        {status?.kind === 'error' && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{status.text}</p>}
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
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
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          説明
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            value={editing.note}
            onChange={(e) => setEditing({ ...editing, note: e.target.value })}
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-3">
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
                className="text-xs text-neutral-500 dark:text-neutral-400 underline"
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
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
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

  // タグ名変更の警告。編集ダイアログの上に重ねて表示する
  const renameDialog = renaming != null && (
    <ConfirmDialog
      title="タグ名の変更"
      message={renaming}
      actionLabel="変更する"
      onConfirm={rename}
      onClose={() => setRenaming(null)}
    />
  );

  const confirmDialog = confirming && (
    <ConfirmDialog
      title="タグの削除"
      message={confirming.message}
      actionLabel="削除する"
      danger
      onConfirm={remove}
      onClose={() => setConfirming(null)}
    />
  );

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-xl flex-1">タグ一覧</h2>
        <TagCatalogMenu
          onDone={(message) => {
            setStatus({ kind: 'notice', text: message });
            reload();
          }}
          onError={setError}
        />
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          title="ctrl+shift+n"
          onClick={() => {
            setStatus(null);
            setEditing(EMPTY);
          }}
        >
          + 新規タグ
        </button>
      </div>
      {status?.kind === 'error' && !editing && <p className="text-red-600 dark:text-red-400 mb-2">{status.text}</p>}
      {status?.kind === 'notice' && <p className="text-blue-700 dark:text-blue-400 mb-2">{status.text}</p>}
      {editDialog}
      {renameDialog}
      {confirmDialog}

      <input
        type="search"
        className="border rounded-sm px-2 py-1 w-full sm:w-64 mb-2"
        placeholder="タグ名・説明で絞り込み"
        aria-label="タグ名・説明で絞り込み"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
        <div className="w-1/3 py-1 pl-2">tag</div>
        <div className="w-1/4 py-1">説明</div>
        <div className="flex-1 py-1">属性</div>
        <div className="flex-none w-24 py-1"></div>
      </div>
      {visible.map((tag, i) => {
        const key = sectionOf(tag);
        // 絞り込み中は並びが部分的になるためドラッグ・キー操作での並び替えは無効化する
        const sortable = filter === '' && sortMembers(key).length > 1;
        const next = visible[i + 1];
        const sectionEnd = next == null || sectionOf(next) !== sectionOf(tag);
        return (
        <div
          key={tag.id}
          className={`block sm:flex sm:items-center ${
            sectionEnd ? 'border-b-2 border-b-neutral-300 dark:border-b-neutral-600' : 'border-b'
          } hover:bg-neutral-100 dark:hover:bg-neutral-800 px-2 py-2 sm:px-0 sm:py-0 ${dropId === tag.id ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
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
                  className="cursor-grab text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
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
                  <Icon name="drag_indicator" />
                </button>
              )}
            </span>
            <TagItem tag={tag.tag} color={tag.color} />
          </div>
          <div className="sm:w-1/4 sm:py-2 text-sm">{tag.note}</div>
          <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0 text-sm text-neutral-500 dark:text-neutral-400">
            {tag.is_group && <span className="mr-2">グループ</span>}
            {tag.is_range && <span className="mr-2">{parseTag(tag.tag).isNumber ? '数値' : '日時'}</span>}
            {tag.tag.includes('/') && <span className="mr-2">階層</span>}
          </div>
          <div className="sm:flex-none sm:w-24 sm:pr-2 mt-1 sm:mt-0 flex items-center sm:justify-end gap-1">
            <RowIconButton
              icon="edit"
              action="edit"
              aria-label={`${tag.tag} を編集`}
              title="編集"
              onClick={() => {
                setStatus(null);
                setEditing({ id: tag.id, tag: tag.tag, note: tag.note ?? '', color: tag.color ?? '' });
              }}
            />
            <RowIconButton
              icon="delete"
              action="delete"
              aria-label={`${tag.tag} を削除`}
              title="削除"
              onClick={() => confirmRemove(tag)}
            />
          </div>
        </div>
        );
      })}
      {catalog != null && visible.length === 0 && (
        <p className="text-neutral-500 dark:text-neutral-400 p-4">一致するタグがありません</p>
      )}
    </>
  );
}

export default TagList;
