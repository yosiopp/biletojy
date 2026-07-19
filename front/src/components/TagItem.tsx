import { t } from '../i18n';
import { dueState, parseTag, stripRangeMark } from '../lib/tags';

type Props = {
  tag: string;
  color?: string | null;
  onRemove?: () => void;
  // 指定するとタグ名部分がクリック（キーボードフォーカス）できるボタンになる
  onClick?: () => void;
};

function TagItem({ tag, color, onRemove, onClick }: Props) {
  const { group, name, isDate } = parseTag(tag);
  const nameEl = onClick ? (
    <button type="button" className="hover:underline" onClick={onClick}>
      {name}
    </button>
  ) : (
    name
  );
  const due = isDate ? dueState(name) : null;
  const dueClass =
    due === 'overdue'
      ? 'bg-red-50 dark:bg-red-950 border-red-500 text-red-700 dark:text-red-300'
      : due === 'soon'
        ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-800 dark:text-amber-300'
        : 'bg-neutral-100 dark:bg-neutral-700 border-transparent';
  const style = !due && color ? { backgroundColor: `${color}20`, borderColor: color } : {};

  return (
    <span
      className={`inline-flex items-center rounded-lg border py-0.5 px-2 whitespace-nowrap ${dueClass}`}
      style={style}
      title={due === 'overdue' ? t('tagItem.overdue') : due === 'soon' ? t('tagItem.dueSoon') : undefined}
    >
      {group != null ? (
        <>
          <span className="border-r border-neutral-300 dark:border-neutral-600 pr-1 text-sm opacity-70">{stripRangeMark(group)}</span>
          <span className="pl-2">{nameEl}</span>
        </>
      ) : (
        <span>{nameEl}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

export default TagItem;
