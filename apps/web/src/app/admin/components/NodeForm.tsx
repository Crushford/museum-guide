import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type NodeFormProps = {
  initialName?: string;
  initialKnowledgeText?: string | null;
  initialFurtherReading?: string[];
  submitLabel: string;
  action: (formData: FormData) => Promise<void>;
};

export function NodeForm({
  initialName = '',
  initialKnowledgeText = '',
  initialFurtherReading = [],
  submitLabel,
  action,
}: NodeFormProps) {
  const furtherReadingText = initialFurtherReading.join('\n');

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          type="text"
          id="name"
          name="name"
          required
          defaultValue={initialName}
        />
      </div>

      <div>
        <Label htmlFor="knowledgeText">Knowledge Text</Label>
        <Textarea
          id="knowledgeText"
          name="knowledgeText"
          rows={4}
          defaultValue={initialKnowledgeText || ''}
        />
      </div>

      <div>
        <Label htmlFor="furtherReading">
          Further Reading (one URL per line)
        </Label>
        <Textarea
          id="furtherReading"
          name="furtherReading"
          rows={4}
          defaultValue={furtherReadingText}
          placeholder="https://example.com/article1&#10;https://example.com/article2"
          className="font-mono text-sm"
        />
      </div>

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
