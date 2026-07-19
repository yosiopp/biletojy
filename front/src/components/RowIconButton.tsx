import { ButtonHTMLAttributes } from 'react';
import Icon, { IconName } from './Icon';

// 一覧行のアイコンアクション（編集・削除）。デザインシステムの
// 「既定 text-neutral-500、hoverで編集=blue / 破壊的操作=red」の色規則をここで一元管理する
const ACTION_CLASS = {
  edit: 'hover:text-blue-700 dark:hover:text-blue-400',
  delete: 'hover:text-red-600 dark:hover:text-red-400',
} as const;

type Props = {
  icon: IconName;
  action: keyof typeof ACTION_CLASS;
} & ButtonHTMLAttributes<HTMLButtonElement>;

function RowIconButton({ icon, action, ...props }: Props) {
  return (
    <button
      type="button"
      className={`flex items-center justify-center p-2 rounded-sm text-neutral-500 dark:text-neutral-400 ${ACTION_CLASS[action]}`}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}

export default RowIconButton;
