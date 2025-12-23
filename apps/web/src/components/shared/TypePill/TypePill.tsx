type TypePillProps = {
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT' | string;
};

const typeColors: Record<string, string> = {
  MUSEUM: 'border-accent text-accent',
  ROOM: 'border-accent-2 text-accent-2',
  ARTIFACT: 'border-muted text-muted',
};

export function TypePill({ type }: TypePillProps) {
  const colorClass = typeColors[type] || 'border-subtle text-subtle';

  return (
    <span
      className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-md ${colorClass}`}
    >
      {type}
    </span>
  );
}
