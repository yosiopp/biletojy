import { FormEvent, useEffect, useState } from 'react';
import { api, Template } from '../api/client';
import Dialog from '../components/Dialog';
import TagInput from '../components/TagInput';
import TagItem from '../components/TagItem';
import TicketRefTextarea from '../components/TicketRefTextarea';
import { joinTags, splitTags, tagColor } from '../lib/tags';
import { useCatalog } from '../lib/useCatalog';

type Editing = {
  id: number | null; // nullは新規作成
  name: string;
  title: string;
  content: string;
  tags: string[];
};

const EMPTY: Editing = { id: null, name: '', title: '', content: '', tags: [] };

// チケットテンプレートの管理（登録・編集・削除）。
// テンプレートはチケット作成画面で選択してタイトル・本文・タグへ適用する
function TemplateList() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirming, setConfirming] = useState<Template | null>(null);
  const [error, setError] = useState('');
  const catalog = useCatalog();

  const reload = () =>
    api
      .listTemplates()
      .then((list) => {
        setTemplates(list);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    const data = {
      name: editing.name.trim(),
      title: editing.title,
      content: editing.content,
      tags: joinTags(editing.tags),
    };
    try {
      if (editing.id == null) {
        await api.createTemplate(data);
      } else {
        await api.updateTemplate(editing.id, data);
      }
      setEditing(null);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async () => {
    if (!confirming) return;
    setConfirming(null);
    try {
      await api.deleteTemplate(confirming.id);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const editDialog = editing && (
    <Dialog
      label={editing.id == null ? '新規テンプレート' : 'テンプレートの編集'}
      onClose={() => setEditing(null)}
    >
      <form onSubmit={submit} className="w-[36rem] max-w-full">
        <h2 className="text-lg mb-2">{editing.id == null ? '新規テンプレート' : 'テンプレートの編集'}</h2>
        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          テンプレート名
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            placeholder="バグ報告"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            autoFocus
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          タイトル
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            placeholder="【バグ】"
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          本文
          <TicketRefTextarea
            className="border rounded-sm w-full p-2 h-40 font-mono text-sm"
            placeholder={'## 再現手順\n\n## 期待する結果\n\n## 実際の結果'}
            value={editing.content}
            onChange={(content) => setEditing({ ...editing, content })}
          />
        </label>
        <div className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
          タグ
          <TagInput value={editing.tags} onChange={(tags) => setEditing({ ...editing, tags })} catalog={catalog} />
        </div>
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

  const confirmDialog = confirming && (
    <Dialog label="テンプレートの削除" onClose={() => setConfirming(null)}>
      <div className="w-96 max-w-full">
        <h2 className="text-lg mb-2">テンプレートの削除</h2>
        <p className="text-sm mb-3">テンプレート「{confirming.name}」を削除しますか？</p>
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
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
        <h2 className="text-xl flex-1">テンプレート一覧</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          onClick={() => {
            setError('');
            setEditing(EMPTY);
          }}
        >
          + 新規テンプレート
        </button>
      </div>
      {error && !editing && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {editDialog}
      {confirmDialog}

      <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
        <div className="w-1/4 py-1 pl-2">テンプレート名</div>
        <div className="w-1/4 py-1">タイトル</div>
        <div className="flex-1 py-1">タグ</div>
        <div className="flex-none w-32 py-1"></div>
      </div>
      {loaded && templates.length === 0 && (
        <p className="text-neutral-500 dark:text-neutral-400 p-4">
          テンプレートはまだありません。「+ 新規テンプレート」から登録すると、チケット作成時に選択して適用できます。
        </p>
      )}
      {templates.map((tpl) => (
        <div key={tpl.id} className="block sm:flex sm:items-center border-b hover:bg-neutral-100 dark:hover:bg-neutral-800 px-2 py-2 sm:px-0 sm:py-0">
          <div className="sm:w-1/4 sm:py-2 sm:pl-2">{tpl.name}</div>
          <div className="sm:w-1/4 sm:py-2 text-sm truncate">{tpl.title}</div>
          <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0">
            {splitTags(tpl.tags).map((tag) => (
              <TagItem key={tag} tag={tag} color={tagColor(catalog, tag)} />
            ))}
          </div>
          <div className="sm:flex-none sm:w-32 sm:py-2 sm:pr-2 sm:text-right mt-1 sm:mt-0 text-sm">
            <button
              type="button"
              className="text-blue-700 dark:text-blue-400 hover:underline mr-3"
              onClick={() => {
                setError('');
                setEditing({
                  id: tpl.id,
                  name: tpl.name,
                  title: tpl.title,
                  content: tpl.content,
                  tags: splitTags(tpl.tags),
                });
              }}
            >
              編集
            </button>
            <button type="button" className="text-red-600 dark:text-red-400 hover:underline" onClick={() => setConfirming(tpl)}>
              削除
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export default TemplateList;
