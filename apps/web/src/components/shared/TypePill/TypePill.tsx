import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TypePillProps = {
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT' | string;
};

const typeColors: Record<string, string> = {
  MUSEUM: 'border-accent text-fg',
  ROOM: 'border-line text-fg',
  ARTIFACT: 'border-line text-fg-subtle',
};

export function TypePill({ type }: TypePillProps) {
  const colorClass = typeColors[type] || 'border-line text-fg-subtle';

  return (
    <Badge className={cn('text-xs font-medium', colorClass)}>{type}</Badge>
  );
}
