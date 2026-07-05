import { ChangeEvent, ClipboardEvent, Dispatch, DragEvent, SetStateAction } from 'react';
import { api } from '../api/client';

type SetValue = Dispatch<SetStateAction<string>>;
type OnError = (message: string) => void;

// プレースホルダの一意性確保用（同時アップロードでも重複しないよう連番を振る）
let seq = 0;

// アップロード完了時に挿入するmarkdownリンク。
// 画像は従来どおりインライン表示（![名前](url)）、それ以外はファイル名のダウンロードリンク（[名前](url)）にする
function fileMarkdown(file: File, id: number): string {
  // ファイル名のうちリンク文法と衝突する文字はエスケープする
  const name = (file.name || 'file').replace(/([\\[\]])/g, '\\$1');
  const link = `[${name}](${api.fileUrl(id)})`;
  return file.type.startsWith('image/') ? `!${link}` : link;
}

// プレースホルダを挿入してアップロードし、完了したらmarkdownリンクに置き換える。
// atは挿入位置（テキストエリアの選択範囲）。nullの場合は末尾に改行区切りで追記する
function uploadFiles(
  files: File[],
  at: { start: number; end: number } | null,
  setValue: SetValue,
  onError: OnError,
): boolean {
  if (files.length === 0) return false;
  const placeholders = files.map(() => `[アップロード中...${++seq}]()`);
  const joined = placeholders.join('\n');
  setValue((v) => {
    if (at) return v.slice(0, at.start) + joined + v.slice(at.end);
    return v === '' || v.endsWith('\n') ? v + joined : `${v}\n${joined}`;
  });

  files.forEach((file, i) => {
    api
      .uploadFile(file)
      .then((uploaded) => {
        setValue((v) => v.replace(placeholders[i], fileMarkdown(file, uploaded.id)));
      })
      .catch((err: Error) => {
        setValue((v) => v.replace(placeholders[i], ''));
        onError(err.message);
      });
  });
  return true;
}

// 編集エリアへのファイル（画像を含む）ペーストを処理する。クリップボードにファイルがなければ何もしない
export function pasteFiles(e: ClipboardEvent<HTMLTextAreaElement>, setValue: SetValue, onError: OnError) {
  const files = Array.from(e.clipboardData.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
  const { selectionStart, selectionEnd } = e.currentTarget;
  if (uploadFiles(files, { start: selectionStart, end: selectionEnd }, setValue, onError)) {
    e.preventDefault();
  }
}

// 編集エリアへのファイルドロップを処理する。ファイル以外のドロップ（テキスト等）はブラウザ既定の動作に任せる
export function dropFiles(e: DragEvent<HTMLTextAreaElement>, setValue: SetValue, onError: OnError) {
  const files = Array.from(e.dataTransfer.files);
  const { selectionStart, selectionEnd } = e.currentTarget;
  if (uploadFiles(files, { start: selectionStart, end: selectionEnd }, setValue, onError)) {
    e.preventDefault();
  }
}

// ファイル選択（input[type=file]）でのアップロードを処理し、本文の末尾へリンクを追記する
export function selectFiles(e: ChangeEvent<HTMLInputElement>, setValue: SetValue, onError: OnError) {
  const files = Array.from(e.currentTarget.files ?? []);
  // 同じファイルを続けて選択してもchangeが発火するようにリセットする
  e.currentTarget.value = '';
  uploadFiles(files, null, setValue, onError);
}
