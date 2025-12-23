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
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-bg-2 border-b border-border">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-fg">
              Status
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-fg">
              Type
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-fg">
              Name
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-fg">
              Parent
            </th>
            <th className="px-4 py-2 text-left text-sm font-medium text-fg">
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
                className="border-b border-divider last:border-b-0 hover:bg-bg-2/50 transition-colors"
              >
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium border rounded-md ${config.className}`}
                  >
                    {config.label}
                  </span>
                </td>
                <td className="px-4 py-2 text-sm text-fg">{row.type}</td>
                <td className="px-4 py-2 text-sm text-fg font-medium">
                  {row.name}
                </td>
                <td className="px-4 py-2 text-sm text-muted">
                  {row.parent || '-'}
                </td>
                <td className="px-4 py-2 text-sm text-muted">
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
