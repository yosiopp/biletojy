import { FormEvent, useEffect, useState } from 'react';
import { api, Template } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import Dialog from '../components/Dialog';
import RowIconButton from '../components/RowIconButton';
import TagInput from '../components/TagInput';
import TagItem from '../components/TagItem';
import TicketRefTextarea from '../components/TicketRefTextarea';
import { t } from '../i18n';
import { joinTags, splitTags, tagColor } from '../lib/tags';
import { useCatalog, useTagColors } from '../lib/useCatalog';
import { usePendingTagGuard } from '../lib/usePendingTagGuard';

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
  const colors = useTagColors(catalog);
  // タグ入力欄の未確定テキストが残ったまま保存すると失われるため、保存前に確認する
  const tagGuard = usePendingTagGuard();

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    // タグ入力欄に未確定のテキストが残っている場合は、失われることを確認してから保存する
    if (tagGuard.guard(() => void save())) {
      return;
    }
    void save();
  };

  const save = async () => {
    if (!editing) return;
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
      label={editing.id == null ? t('templateList.newTitle') : t('templateList.editTitle')}
      onClose={() => setEditing(null)}
    >
      <form onSubmit={submit} className="w-[36rem] max-w-full">
        <h2 className="text-lg mb-2">{editing.id == null ? t('templateList.newTitle') : t('templateList.editTitle')}</h2>
        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          {t('templateList.fieldName')}
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            placeholder={t('templateList.namePlaceholder')}
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            autoFocus
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          {t('templateList.fieldTitle')}
          <input
            type="text"
            className="border rounded-sm px-2 py-1 block w-full"
            placeholder={t('templateList.titlePlaceholder')}
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
        </label>
        <label className="block text-sm text-neutral-600 dark:text-neutral-300 mb-2">
          {t('templateList.fieldContent')}
          <TicketRefTextarea
            className="border rounded-sm w-full p-2 h-40 font-mono text-sm"
            placeholder={t('templateList.contentPlaceholder')}
            value={editing.content}
            onChange={(content) => setEditing({ ...editing, content })}
          />
        </label>
        <div className="text-sm text-neutral-600 dark:text-neutral-300 mb-3">
          {t('templateList.fieldTags')}
          <TagInput
            value={editing.tags}
            onChange={(tags) => setEditing({ ...editing, tags })}
            catalog={catalog}
            onTextChange={tagGuard.onTextChange}
          />
        </div>
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={() => setEditing(null)}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" className="bg-blue-600 text-white rounded-sm px-4 py-1 ml-2 hover:bg-blue-700">
            {editing.id == null ? t('common.create') : t('common.update')}
          </button>
        </div>
      </form>
    </Dialog>
  );

  const confirmDialog = confirming && (
    <ConfirmDialog
      title={t('templateList.deleteTitle')}
      message={t('templateList.deleteMessage', { name: confirming.name })}
      actionLabel={t('common.deleteAction')}
      danger
      onConfirm={remove}
      onClose={() => setConfirming(null)}
    />
  );

  return (
    <>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">{t('templateList.title')}</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          onClick={() => {
            setError('');
            setEditing(EMPTY);
          }}
        >
          {t('templateList.new')}
        </button>
      </div>
      {error && !editing && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {editDialog}
      {confirmDialog}
      {tagGuard.dialog}

      <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
        <div className="w-1/4 py-1 pl-2">{t('templateList.fieldName')}</div>
        <div className="w-1/4 py-1">{t('templateList.fieldTitle')}</div>
        <div className="flex-1 py-1">{t('templateList.fieldTags')}</div>
        <div className="flex-none w-24 py-1"></div>
      </div>
      {loaded && templates.length === 0 && (
        <p className="text-neutral-500 dark:text-neutral-400 p-4">
          {t('templateList.empty')}
        </p>
      )}
      {templates.map((tpl) => (
        <div key={tpl.id} className="block sm:flex sm:items-center border-b hover:bg-neutral-100 dark:hover:bg-neutral-800 px-2 py-2 sm:px-0 sm:py-0">
          <div className="sm:w-1/4 sm:py-2 sm:pl-2">{tpl.name}</div>
          <div className="sm:w-1/4 sm:py-2 text-sm truncate">{tpl.title}</div>
          <div className="sm:flex-1 sm:py-2 mt-1 sm:mt-0">
            {splitTags(tpl.tags).map((tag) => (
              <TagItem key={tag} tag={tag} color={tagColor(colors, tag)} />
            ))}
          </div>
          <div className="sm:flex-none sm:w-24 sm:pr-2 mt-1 sm:mt-0 flex items-center sm:justify-end gap-1">
            <RowIconButton
              icon="edit"
              action="edit"
              aria-label={t('templateList.editAria', { name: tpl.name })}
              title={t('common.edit')}
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
            />
            <RowIconButton
              icon="delete"
              action="delete"
              aria-label={t('templateList.deleteAria', { name: tpl.name })}
              title={t('common.delete')}
              onClick={() => setConfirming(tpl)}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export default TemplateList;
