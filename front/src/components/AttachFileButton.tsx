import { Dispatch, SetStateAction, useRef } from 'react';
import { selectFiles } from '../lib/attachFiles';

// 「ファイルを添付」リンクボタンと隠しファイル選択input。
// 選択したファイルをアップロードし、setValueの本文末尾へmarkdownリンクを追記する
function AttachFileButton({
  setValue,
  onError,
  className = '',
}: {
  setValue: Dispatch<SetStateAction<string>>;
  onError: (message: string) => void;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={`text-sm text-blue-700 dark:text-blue-400 hover:underline ${className}`}
        onClick={() => fileRef.current?.click()}
      >
        ファイルを添付
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => selectFiles(e, setValue, onError)}
      />
    </>
  );
}

export default AttachFileButton;
