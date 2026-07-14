import { FormEvent, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { api, Template } from '../api/client';
import AttachFileButton from '../components/AttachFileButton';
import ConfirmDialog from '../components/ConfirmDialog';
import Markdown from '../components/Markdown';
import TagInput from '../components/TagInput';
import TicketRefTextarea from '../components/TicketRefTextarea';
import { t } from '../i18n';
import { dropFiles, pasteFiles, useFileDrag } from '../lib/attachFiles';
import { EditorMode, EDITOR_MODES, loadEditorMode, saveEditorMode } from '../lib/editorMode';
import { staleGuard } from '../lib/staleGuard';
import { currentUser, joinTags, splitTags } from '../lib/tags';
import { invalidateCatalog, useCatalog } from '../lib/useCatalog';
import { usePendingTagGuard } from '../lib/usePendingTagGuard';

type Draft = { title: string; content: string; tags: string };

const CONTENT_PLACEHOLDER = t('ticketForm.contentPlaceholder');

// チケット作成（/tickets/new）と編集（/tickets/:id/edit）を兼ねるフォーム
function TicketForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id != null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const catalog = useCatalog();
  // 表示モード（編集 / 両方 / プレビュー）は前回選択をlocalStorageから復元する
  const [mode, setMode] = useState(loadEditorMode);
  // Markdown内のmermaidはcode変更のたびに非同期描画するため、プレビューへ渡す本文は遅延させる
  const deferredContent = useDeferredValue(content);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [titleError, setTitleError] = useState(false);
  // 未保存判定の基準値（編集時はロードしたチケットの内容）
  const [initial, setInitial] = useState<Draft>({ title: '', content: '', tags: '' });
  // 新規作成時に選択できるテンプレート
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  // 入力済みの内容がある状態でテンプレートを選んだときの確認対象
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  // タグ入力欄の未確定テキストが残ったまま保存すると失われるため、保存前に確認する
  const tagGuard = usePendingTagGuard();
  const titleRef = useRef<HTMLInputElement>(null);
  const fileDrag = useFileDrag((e) => dropFiles(e, setContent, setError));
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!isEdit) {
      // テンプレートは新規作成時の適用にしか使わないため、取得に失敗しても画面表示は妨げない
      api.listTemplates().then(setTemplates).catch(() => {});
    }
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    // 編集画面間を素早く遷移したときに古いレスポンスでフォームを上書きしないようにする
    const { fresh, cancel } = staleGuard();
    api
      .getTicket(id)
      .then(fresh((ticket) => {
        setTitle(ticket.title);
        setContent(ticket.content);
        setTags(splitTags(ticket.tags));
        setInitial({ title: ticket.title, content: ticket.content, tags: ticket.tags });
      }))
      .catch(fresh((e: Error) => setError(e.message)));
    return cancel;
  }, [id, isEdit]);

  const dirty =
    title !== initial.title || content !== initial.content || joinTags(tags) !== initial.tags;

  // モード切替時に選択を永続化する
  const selectMode = (next: EditorMode) => {
    setMode(next);
    saveEditorMode(next);
  };

  // 選択したテンプレートのタイトル・本文・タグをフォームへ適用する
  const applyTemplate = (template: Template) => {
    setTemplateId(String(template.id));
    setTitle(template.title);
    setContent(template.content);
    setTags(splitTags(template.tags));
    if (template.title.trim()) setTitleError(false);
  };

  // テンプレート選択時の入口。入力済みの内容がある場合は確認の上で置き換える
  const selectTemplate = (value: string) => {
    const template = templates.find((t) => t.id === Number(value));
    if (!template) {
      setTemplateId('');
      return;
    }
    if (dirty) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template);
  };

  // ルーター内の遷移（キャンセル・ブラウザバック・ショートカット遷移）を確認付きにする。
  // blocked の間 ConfirmDialog を表示し、確定で proceed・キャンセルで reset する
  const blocker = useBlocker(
    useCallback(() => dirty && !submittedRef.current, [dirty]),
  );

  // リロード・タブを閉じる操作にも警告を出す
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError(t('ticketForm.titleRequired'));
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    // タグ入力欄に未確定のテキストが残っている場合は、失われることを確認してから保存する
    if (tagGuard.guard(() => void save())) {
      return;
    }
    void save();
  };

  const save = async () => {
    setSubmitting(true);
    try {
      // 作成者・更新者は常にlocalStorageのユーザ名（ヘッダーの設定ダイアログで変更できる）
      const data = { title, content, tags: joinTags(tags) };
      const ticket = isEdit
        ? await api.updateTicket(id, { ...data, updated_by: currentUser() })
        : await api.createTicket({ ...data, created_by: currentUser() });
      // 未定義タグはサーバー側でカタログへ自動登録されるため、共有キャッシュを取得し直させる
      invalidateCatalog();
      submittedRef.current = true;
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">{isEdit ? t('ticketForm.editTitle', { id }) : t('ticketForm.newTitle')}</h2>
        {!isEdit && templates.length > 0 && (
          <label className="text-sm text-neutral-500 dark:text-neutral-400">
            {t('ticketForm.template')}
            <select
              className="border rounded-sm px-2 py-1 ml-1"
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">{t('ticketForm.noTemplate')}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}

      <input
        ref={titleRef}
        type="text"
        className={`border rounded-sm w-full px-2 py-1 mb-2 text-lg ${
          titleError ? 'border-red-500' : ''
        }`}
        placeholder={t('ticketForm.titlePlaceholder')}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) setTitleError(false);
        }}
        autoFocus
      />

      <div className="mb-1 flex items-center">
        <div className="flex-1">
          {EDITOR_MODES.map(({ value, label }, i) => (
            <button
              key={value}
              type="button"
              // 編集=左端(左角丸)、両方=中央(角丸なし・sm未満は非表示)、プレビュー=右端(右角丸)。
              // 「両方」を復元したモバイルでは編集のみ表示になるため、編集ボタンをハイライトする
              className={`text-sm border px-3 py-0.5 ${
                i === 0 ? 'rounded-l-sm' : i === EDITOR_MODES.length - 1 ? 'rounded-r-sm' : 'hidden sm:inline-block'
              } ${
                mode === value
                  ? 'bg-neutral-200 dark:bg-neutral-600'
                  : value === 'edit' && mode === 'split'
                    ? 'bg-neutral-200 dark:bg-neutral-600 sm:bg-transparent sm:dark:bg-transparent'
                    : ''
              }`}
              onClick={() => selectMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <AttachFileButton setValue={setContent} onError={setError} />
      </div>
      {mode === 'split' ? (
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <TicketRefTextarea
            className={`border rounded-sm w-full p-2 h-96 font-mono text-sm ${fileDrag.dragClass}`}
            placeholder={CONTENT_PLACEHOLDER}
            value={content}
            onChange={setContent}
            onPaste={(e) => pasteFiles(e, setContent, setError)}
            {...fileDrag.dragProps}
          />
          {/* モバイルでは「両方」ボタンを隠しているため、復元時も編集のみの表示に落とす */}
          <div className="hidden sm:block border rounded-sm p-4 h-96 overflow-y-auto">
            <Markdown content={deferredContent} />
          </div>
        </div>
      ) : mode === 'preview' ? (
        <div className="border rounded-sm p-4 mb-2 min-h-64">
          <Markdown content={deferredContent} />
        </div>
      ) : (
        <TicketRefTextarea
          className={`border rounded-sm w-full p-2 h-64 mb-2 font-mono text-sm ${fileDrag.dragClass}`}
          placeholder={CONTENT_PLACEHOLDER}
          value={content}
          onChange={setContent}
          onPaste={(e) => pasteFiles(e, setContent, setError)}
          {...fileDrag.dragProps}
        />
      )}

      <div className="border rounded-sm p-2 mb-2">
        <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">{t('ticketForm.tags')}</div>
        <TagInput value={tags} onChange={setTags} catalog={catalog} onTextChange={tagGuard.onTextChange} />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white rounded-sm px-4 py-1 hover:bg-blue-700 disabled:opacity-50"
        disabled={submitting}
      >
        {isEdit ? t('common.update') : t('common.create')}
      </button>
      <button
        type="button"
        className="border rounded-sm px-4 py-1 ml-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => navigate(-1)}
      >
        {t('common.cancel')}
      </button>

      {pendingTemplate && (
        <ConfirmDialog
          title={t('ticketForm.applyTemplateTitle')}
          message={t('ticketForm.applyTemplateMessage', { name: pendingTemplate.name })}
          actionLabel={t('ticketForm.applyTemplateAction')}
          onConfirm={() => {
            applyTemplate(pendingTemplate);
            setPendingTemplate(null);
          }}
          onClose={() => setPendingTemplate(null)}
        />
      )}
      {tagGuard.dialog}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title={t('ticketForm.leaveTitle')}
          message={t('ticketForm.leaveMessage')}
          actionLabel={t('ticketForm.leaveAction')}
          onConfirm={() => blocker.proceed()}
          onClose={() => blocker.reset()}
        />
      )}
    </form>
  );
}

export default TicketForm;
