import { parseTag } from '../lib/tags';

type Props = {
  tag: string;
  color?: string | null;
  onRemove?: () => void;
};

function TagItem({ tag, color, onRemove }: Props) {
  const { group, name } = parseTag(tag);
  const style = color ? { backgroundColor: `${color}20`, borderColor: color } : {};

  return (
    <span
      className="inline-flex items-center rounded-lg bg-neutral-100 border border-transparent py-0.5 px-2 mr-1 mb-1 whitespace-nowrap"
      style={style}
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
