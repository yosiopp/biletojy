import { ClipboardEvent, Dispatch, SetStateAction } from 'react';
import { api } from '../api/client';

// プレースホルダの一意性確保用（同時ペーストでも重複しないよう連番を振る）
let seq = 0;

// 編集エリアへの画像ペーストを処理する。クリップボードに画像がなければ何もしない。
// カーソル位置にプレースホルダを挿入してアップロードし、完了したらmarkdownの画像リンクに置き換える
export function pasteImages(
  e: ClipboardEvent<HTMLTextAreaElement>,
  setValue: Dispatch<SetStateAction<string>>,
  onError: (message: string) => void,
) {
  const files = Array.from(e.clipboardData.items)
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
  if (files.length === 0) return;
  e.preventDefault();

  const { selectionStart, selectionEnd } = e.currentTarget;
  const placeholders = files.map(() => `![アップロード中...${++seq}]()`);
  setValue((v) => v.slice(0, selectionStart) + placeholders.join('\n') + v.slice(selectionEnd));

  files.forEach((file, i) => {
    api
      .uploadImage(file)
      .then((image) => {
        setValue((v) => v.replace(placeholders[i], `![image](${api.imageUrl(image.id)})`));
      })
      .catch((err: Error) => {
        setValue((v) => v.replace(placeholders[i], ''));
        onError(err.message);
      });
  });
}
