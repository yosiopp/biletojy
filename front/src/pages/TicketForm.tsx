import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate, useParams } from 'react-router-dom';
import { api, Template } from '../api/client';
import AttachFileButton from '../components/AttachFileButton';
import ConfirmDialog from '../components/ConfirmDialog';
import Markdown from '../components/Markdown';
import TagInput from '../components/TagInput';
import TicketRefTextarea from '../components/TicketRefTextarea';
import { dropFiles, pasteFiles, useFileDrag } from '../lib/attachFiles';
import { staleGuard } from '../lib/staleGuard';
import { currentUser, joinTags, splitTags } from '../lib/tags';
import { useCatalog } from '../lib/useCatalog';

type Draft = { title: string; content: string; tags: string };

// チケット作成（/tickets/new）と編集（/tickets/:id/edit）を兼ねるフォーム
function TicketForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = id != null;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const catalog = useCatalog();
  const [preview, setPreview] = useState(false);
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError('タイトルを入力してください');
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      // 作成者・更新者は常にlocalStorageのユーザ名（ヘッダーの設定ダイアログで変更できる）
      const data = { title, content, tags: joinTags(tags) };
      const ticket = isEdit
        ? await api.updateTicket(id, { ...data, updated_by: currentUser() })
        : await api.createTicket({ ...data, created_by: currentUser() });
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
        <h2 className="text-xl flex-1">{isEdit ? `チケット編集 #${id}` : 'チケット作成'}</h2>
        {!isEdit && templates.length > 0 && (
          <label className="text-sm text-neutral-500 dark:text-neutral-400">
            テンプレート
            <select
              className="border rounded-sm px-2 py-1 ml-1"
              value={templateId}
              onChange={(e) => selectTemplate(e.target.value)}
            >
              <option value="">選択なし</option>
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
        placeholder="タイトル"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (e.target.value.trim()) setTitleError(false);
        }}
        autoFocus
      />

      <div className="mb-1 flex items-center">
        <div className="flex-1">
          <button
            type="button"
            className={`text-sm border rounded-l-sm px-3 py-0.5 ${!preview ? 'bg-neutral-200 dark:bg-neutral-600' : ''}`}
            onClick={() => setPreview(false)}
          >
            編集
          </button>
          <button
            type="button"
            className={`text-sm border rounded-r-sm px-3 py-0.5 ${preview ? 'bg-neutral-200 dark:bg-neutral-600' : ''}`}
            onClick={() => setPreview(true)}
          >
            プレビュー
          </button>
        </div>
        <AttachFileButton setValue={setContent} onError={setError} />
      </div>
      {preview ? (
        <div className="border rounded-sm p-4 mb-2 min-h-64">
          <Markdown content={content} />
        </div>
      ) : (
        <TicketRefTextarea
          className={`border rounded-sm w-full p-2 h-64 mb-2 font-mono text-sm ${fileDrag.dragClass}`}
          placeholder={'本文（markdown / mermaid可、画像・ファイル添付可（ペースト/ドロップ）、#でチケット参照）\n\n```mermaid\ngraph TD; A-->B;\n```'}
          value={content}
          onChange={setContent}
          onPaste={(e) => pasteFiles(e, setContent, setError)}
          {...fileDrag.dragProps}
        />
      )}

      <div className="border rounded-sm p-2 mb-2">
        <div className="text-sm text-neutral-500 dark:text-neutral-400 mb-1">タグ</div>
        <TagInput value={tags} onChange={setTags} catalog={catalog} />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white rounded-sm px-4 py-1 hover:bg-blue-700 disabled:opacity-50"
        disabled={submitting}
      >
        {isEdit ? '更新' : '作成'}
      </button>
      <button
        type="button"
        className="border rounded-sm px-4 py-1 ml-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        onClick={() => navigate(-1)}
      >
        キャンセル
      </button>

      {pendingTemplate && (
        <ConfirmDialog
          title="テンプレートの適用"
          message={`入力中の内容をテンプレート「${pendingTemplate.name}」の内容で置き換えます。よろしいですか？`}
          actionLabel="置き換える"
          onConfirm={() => {
            applyTemplate(pendingTemplate);
            setPendingTemplate(null);
          }}
          onClose={() => setPendingTemplate(null)}
        />
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="ページ離脱の確認"
          message="編集中の内容は保存されていません。このページを離れますか？"
          actionLabel="離れる"
          onConfirm={() => blocker.proceed()}
          onClose={() => blocker.reset()}
        />
      )}
    </form>
  );
}

export default TicketForm;
