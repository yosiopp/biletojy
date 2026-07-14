import { t } from '../i18n';
import Dialog from './Dialog';

// 削除・タグ名変更などの確認モーダル。誤操作を防ぐためキャンセルに初期フォーカスを置く。
// 破壊的な操作（削除など）はdangerで実行ボタンを赤系にする
function ConfirmDialog({
  title,
  message,
  actionLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  actionLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog label={title} onClose={onClose}>
      <div className="w-96 max-w-full">
        <h2 className="text-lg mb-2">{title}</h2>
        <p className="text-sm whitespace-pre-line mb-3">{message}</p>
        <div className="text-right">
          <button
            type="button"
            className="border rounded-sm px-4 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            onClick={onClose}
            autoFocus
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-sm px-4 py-1 ml-2`}
            onClick={onConfirm}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default ConfirmDialog;
