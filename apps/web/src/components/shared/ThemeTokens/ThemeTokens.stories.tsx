import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default {
  title: 'Theme/Token Reference',
  parameters: {
    layout: 'fullscreen',
  },
};

export const AllTokens = () => {
  const tokens = [
    {
      category: 'Backgrounds',
      tokens: [
        {
          name: 'background',
          class: 'bg-background',
          description: 'Page background',
        },
        {
          name: 'card',
          class: 'bg-card',
          description: 'Card/panel backgrounds',
        },
        { name: 'muted', class: 'bg-muted', description: 'Muted backgrounds' },
        {
          name: 'secondary',
          class: 'bg-secondary',
          description: 'Secondary backgrounds',
        },
      ],
    },
    {
      category: 'Text',
      tokens: [
        {
          name: 'foreground',
          class: 'text-primary',
          description: 'Primary text',
        },
        {
          name: 'muted-foreground',
          class: 'text-muted-foreground',
          description: 'Secondary text',
        },
        {
          name: 'card-foreground',
          class: 'text-card-foreground',
          description: 'Text on cards',
        },
      ],
    },
    {
      category: 'Actions',
      tokens: [
        {
          name: 'accent',
          class: 'bg-accent text-accent-foreground',
          description: 'Accent actions',
        },
        {
          name: 'secondary',
          class: 'bg-secondary text-secondary-foreground',
          description: 'Secondary actions',
        },
        {
          name: 'destructive',
          class: 'bg-destructive text-destructive-foreground',
          description: 'Destructive actions',
        },
      ],
    },
    {
      category: 'Borders',
      tokens: [
        {
          name: 'border',
          class: 'border border-border',
          description: 'Standard borders',
        },
        {
          name: 'input',
          class: 'border border-input',
          description: 'Input borders',
        },
      ],
    },
    {
      category: 'Focus',
      tokens: [
        { name: 'ring', class: 'ring-2 ring-ring', description: 'Focus rings' },
      ],
    },
  ];

  return (
    <div className="p-8 bg-background min-h-screen">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-primary mb-2">Theme Tokens</h1>
          <p className="text-muted-foreground">
            Reference for all shadcn/ui semantic color tokens used in this
            project.
          </p>
        </div>

        {tokens.map((category) => (
          <Card key={category.category}>
            <CardHeader>
              <CardTitle>{category.category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.tokens.map((token) => (
                  <div
                    key={token.name}
                    className={`p-4 rounded-md border ${token.class.includes('bg-') ? token.class : 'bg-card'} ${token.class.includes('border-') ? '' : 'border-border'}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <code className="text-xs font-mono text-primary">
                          {token.name}
                        </code>
                        {token.class.includes('bg-') && (
                          <div className={`w-6 h-6 rounded ${token.class}`} />
                        )}
                      </div>
                      <code className="text-xs font-mono text-muted-foreground block">
                        .{token.class}
                      </code>
                      <p className="text-sm text-muted-foreground">
                        {token.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
