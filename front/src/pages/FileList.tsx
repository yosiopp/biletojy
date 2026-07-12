import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { api, FileInfo } from '../api/client';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDateTime } from '../lib/date';

// サイズはバイト数を1024区切りの単位（B / KB / MB）で表示する
function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// 参照状況のラベル（現役のチケット・コメントから / 履歴のみから / 参照なし）
function refLabel(file: FileInfo): string {
  if (file.referenced) return '参照あり';
  if (file.history_referenced) return '履歴のみ';
  return '参照なし';
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
    const selected = Array.from(e.currentTarget.files ?? []);
    // 同じファイルを続けて選択してもchangeが発火するようにリセットする
    e.currentTarget.value = '';
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
      title="ファイルの削除"
      message={
        confirming.referenced || confirming.history_referenced
          ? `ファイル「${confirming.name || `id:${confirming.id}`}」は` +
            `チケット・コメント${confirming.referenced ? '' : 'の履歴'}から参照されています。\n` +
            '削除するとチケットからの参照（リンク・画像）が切れます。\n削除しますか？'
          : `ファイル「${confirming.name || `id:${confirming.id}`}」を削除しますか？`
      }
      actionLabel="削除する"
      danger
      onConfirm={remove}
      onClose={() => setConfirming(null)}
    />
  );

  return (
    <>
      <div className="flex items-center mb-2">
        <h2 className="text-xl flex-1">ファイル一覧</h2>
        <button
          type="button"
          className="bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700"
          onClick={() => inputRef.current?.click()}
        >
          + ファイル追加
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={upload} />
      </div>
      {error && <p className="text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {confirmDialog}

      <div className="hidden sm:flex text-neutral-500 dark:text-neutral-400 border-b">
        <div className="w-14 py-1 pl-2">id</div>
        <div className="flex-1 py-1">ファイル名</div>
        <div className="w-44 py-1">MIME-Type</div>
        <div className="w-24 py-1 text-right">サイズ</div>
        <div className="w-40 py-1 pl-4">追加日時</div>
        <div className="w-20 py-1">参照</div>
        <div className="flex-none w-16 py-1"></div>
      </div>
      {loaded && files.length === 0 && (
        <p className="text-neutral-500 dark:text-neutral-400 p-4">
          添付ファイルはまだありません。「+ ファイル追加」のほか、チケット・コメントの編集エリアへの貼り付け・ドロップでも追加できます。
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
              {file.name || <span className="text-neutral-400">(名前なし)</span>}
            </div>
            <div className="sm:w-44 sm:py-2 text-sm text-neutral-500 dark:text-neutral-400 truncate">{file.mime}</div>
            <div className="sm:w-24 sm:py-2 sm:text-right text-sm">{formatSize(file.size)}</div>
            <div className="sm:w-40 sm:py-2 sm:pl-4 text-sm text-neutral-500 dark:text-neutral-400">
              {formatDateTime(file.created_at)}
            </div>
            <div className="sm:w-20 sm:py-2 text-sm text-neutral-500 dark:text-neutral-400">{refLabel(file)}</div>
          </a>
          <div className="sm:flex-none sm:w-16 sm:pt-2 sm:pl-0 sm:pr-2 sm:text-right px-2 pb-2 mt-1 sm:mt-0 text-sm">
            <button
              type="button"
              className="text-red-600 dark:text-red-400 hover:underline"
              onClick={() => setConfirming(file)}
            >
              削除
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export default FileList;
