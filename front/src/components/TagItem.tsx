import { dueState, parseTag } from '../lib/tags';

type Props = {
  tag: string;
  color?: string | null;
  onRemove?: () => void;
};

function TagItem({ tag, color, onRemove }: Props) {
  const { group, name, isDate } = parseTag(tag);
  const due = isDate ? dueState(name) : null;
  const dueClass =
    due === 'overdue'
      ? 'bg-red-50 border-red-500 text-red-700'
      : due === 'soon'
        ? 'bg-amber-50 border-amber-500 text-amber-800'
        : 'bg-neutral-100 border-transparent';
  const style = !due && color ? { backgroundColor: `${color}20`, borderColor: color } : {};

  return (
    <span
      className={`inline-flex items-center rounded-lg border py-0.5 px-2 mr-1 mb-1 whitespace-nowrap ${dueClass}`}
      style={style}
      title={due === 'overdue' ? '期限超過' : due === 'soon' ? '期限まで3日以内' : undefined}
    >
      {group != null ? (
        <>
          <span className="border-r border-neutral-300 pr-1 text-sm opacity-70">{group.replace(/@$/, '')}</span>
          <span className="pl-2">{name}</span>
        </>
      ) : (
        <span>{name}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="ml-1 text-neutral-400 hover:text-neutral-700"
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
