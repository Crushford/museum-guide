type ImportRow = {
  type: string;
  name: string;
  parent?: string;
  status: 'ok' | 'warning' | 'error';
  message?: string;
};

type ImportPreviewTableProps = {
  rows: ImportRow[];
};

const statusConfig = {
  ok: {
    className: 'bg-success/20 text-success border-success/30',
    label: 'OK',
  },
  warning: {
    className: 'bg-warning/20 text-warning border-warning/30',
    label: 'Warning',
  },
  error: {
    className: 'bg-danger/20 text-danger border-danger/30',
    label: 'Error',
  },
};

export function ImportPreviewTable({ rows }: ImportPreviewTableProps) {
  return (
    <div className="border border-line rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-raised border-b border-line">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-primary">
              Status
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-primary">
              Type
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-primary">
              Name
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-primary">
              Parent
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-primary">
              Message
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const config = statusConfig[row.status];
            return (
              <tr
                key={index}
                className="border-b border-line last:border-b-0 hover:bg-raised/50 transition-colors"
              >
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-md ${config.className}`}
                  >
                    {config.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-primary">{row.type}</td>
                <td className="px-4 py-2 text-sm text-primary font-medium">
                  {row.name}
                </td>
                <td className="px-4 py-2 text-sm text-muted-foreground">
                  {row.parent || '-'}
                </td>
                <td className="px-4 py-2 text-sm text-muted-foreground">
                  {row.message || '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
