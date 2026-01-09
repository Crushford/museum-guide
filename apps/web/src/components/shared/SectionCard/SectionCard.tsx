import { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: SectionCardProps) {
  return (
    <Card>
      {(title || subtitle || actions) && (
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <div>
            {title && (
              <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
            )}
            {subtitle && (
              <CardDescription className="mt-1">{subtitle}</CardDescription>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
