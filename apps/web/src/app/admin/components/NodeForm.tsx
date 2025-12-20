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
        <label htmlFor="name" className="block text-sm font-medium mb-1">
          Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          required
          defaultValue={initialName}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>

      <div>
        <label
          htmlFor="knowledgeText"
          className="block text-sm font-medium mb-1"
        >
          Knowledge Text
        </label>
        <textarea
          id="knowledgeText"
          name="knowledgeText"
          rows={4}
          defaultValue={initialKnowledgeText || ''}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>

      <div>
        <label
          htmlFor="furtherReading"
          className="block text-sm font-medium mb-1"
        >
          Further Reading (one URL per line)
        </label>
        <textarea
          id="furtherReading"
          name="furtherReading"
          rows={4}
          defaultValue={furtherReadingText}
          placeholder="https://example.com/article1&#10;https://example.com/article2"
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
        />
      </div>

      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        {submitLabel}
      </button>
    </form>
  );
}
