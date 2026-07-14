import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { api, FileInfo } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import RowIconButton from '../components/RowIconButton';
import { t } from '../i18n';
import { readFileInput } from '../lib/attachFiles';
import { formatDateTime } from '../lib/date';

// サイズはバイト数を1024区切りの単位（B / KB / MB）で表示する
function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// 参照状況のラベル（現役のチケット・コメントから / 履歴のみから / 参照なし）
function refLabel(file: FileInfo): string {
  if (file.referenced) return t('fileList.referenced');
  if (file.history_referenced) return t('fileList.historyOnly');
  return t('fileList.noReference');
}

// 確認ダイアログ等での表示名（名前が無ければ id:n 形式）
function fileLabel(file: FileInfo): string {
  return file.name || `id:${file.id}`;
}

// 添付ファイルの管理（一覧・アップロード・削除）。
// ファイルはチケット・コメント本文に /api/files/{id} のmarkdownリンクとして埋め込まれるため、
// 参照が残っているファイルの削除はリンク切れの警告を挟む
function FileList() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState<FileInfo | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = () =>
    api
      .listFiles()
      .then((list) => {
        setFiles(list);
        setLoaded(true);
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    reload();
  }, []);

  // ファイル選択でアップロードし、完了後に一覧を取得し直す（本文への添付と同じアップロードAPI）
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const selected = readFileInput(e);
    if (selected.length === 0) return;
    try {
      for (const file of selected) {
        await api.uploadFile(file);
      }
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
    await reload();
  };

  const remove = async () => {
    if (!confirming) return;
    setConfirming(null);
    try {
      await api.deleteFile(confirming.id);
      setError('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const confirmDialog = confirming && (
    <ConfirmDialog
      title={t('fileList.deleteTitle')}
      message={
        confirming.referenced
          ? t('fileList.deleteReferencedMessage', { name: fileLabel(confirming) })
          : confirming.history_referenced
            ? t('fileList.deleteHistoryReferencedMessage', { name: fileLabel(confirming) })
            : t('fileList.deleteMessage', { name: fileLabel(confirming) })
      }
      actionLabel={t('common.deleteAction')}
      danger
      onConfirm={remove}
      onClose={() => setConfirming(null)}
    />
  );

  return (
    <>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">{t('fileList.title')}</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          onClick={() => inputRef.current?.click()}
        >
          {t('fileList.add')}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={upload} />
      </div>
      {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {confirmDialog}

      <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
        <div className="w-14 py-1 pl-2">id</div>
        <div className="flex-1 py-1">{t('fileList.headerName')}</div>
        <div className="w-44 py-1">MIME-Type</div>
        <div className="w-24 py-1 text-right">{t('fileList.headerSize')}</div>
        <div className="w-40 py-1 pl-4">{t('fileList.headerCreated')}</div>
        <div className="w-20 py-1">{t('fileList.headerRef')}</div>
        <div className="flex-none w-16 py-1"></div>
      </div>
      {loaded && files.length === 0 && (
        <p className="text-neutral-500 dark:text-neutral-400 p-4">
          {t('fileList.empty')}
        </p>
      )}
      {files.map((file) => (
        <div
          key={file.id}
          className="sm:flex sm:items-center border-b hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <a
            href={api.fileUrl(file.id)}
            target="_blank"
            rel="noreferrer"
            className="block sm:flex sm:items-center sm:flex-1 sm:min-w-0 px-2 pt-2 sm:px-0 sm:pt-0"
          >
            <div className="hidden sm:block sm:w-14 sm:py-2 sm:pl-2 text-sm text-neutral-500 dark:text-neutral-400">
              {file.id}
            </div>
            <div className="sm:flex-1 sm:py-2 truncate">
              <span className="sm:hidden text-neutral-500 dark:text-neutral-400 mr-2">{file.id}</span>
              {file.name || <span className="text-neutral-400">{t('fileList.noName')}</span>}
            </div>
            <div className="sm:w-44 sm:py-2 text-sm text-neutral-500 dark:text-neutral-400 truncate">{file.mime}</div>
            <div className="sm:w-24 sm:py-2 sm:text-right text-sm">{formatSize(file.size)}</div>
            <div className="sm:w-40 sm:py-2 sm:pl-4 text-sm text-neutral-500 dark:text-neutral-400">
              {formatDateTime(file.created_at)}
            </div>
            <div className="sm:w-20 sm:py-2 text-sm text-neutral-500 dark:text-neutral-400">{refLabel(file)}</div>
          </a>
          <div className="sm:flex-none sm:w-16 sm:pr-2 px-2 pb-2 sm:pb-0 mt-1 sm:mt-0 flex sm:justify-end">
            <RowIconButton
              icon="delete"
              action="delete"
              aria-label={t('fileList.deleteAria', { name: fileLabel(file) })}
              title={t('common.delete')}
              onClick={() => setConfirming(file)}
            />
          </div>
        </div>
      ))}
    </>
  );
}

export default FileList;
