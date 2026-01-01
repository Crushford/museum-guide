import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TypePillProps = {
  type: 'MUSEUM' | 'ROOM' | 'ARTIFACT' | string;
};

const typeColors: Record<string, string> = {
  MUSEUM: 'border-accent text-primary',
  ROOM: 'border-accent-2 text-primary',
  ARTIFACT: 'border-muted-foreground text-muted-foreground',
};

export function TypePill({ type }: TypePillProps) {
  const colorClass = typeColors[type] || 'border-subtle text-subtle';

  return (
    <Badge className={cn('text-xs font-medium', colorClass)}>{type}</Badge>
  );
}
