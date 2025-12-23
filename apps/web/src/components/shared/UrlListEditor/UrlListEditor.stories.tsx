import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { UrlListEditor } from './UrlListEditor';

const meta = {
  title: 'Shared/UrlListEditor',
  component: UrlListEditor,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof UrlListEditor>;

export default meta;
type Story = StoryObj<typeof UrlListEditor>;

export const EmptyListEditable: Story = {
  render: (args) => {
    const [urls, setUrls] = useState<string[]>([]);
    return <UrlListEditor {...args} value={urls} onChange={setUrls} />;
  },
  args: {
    editable: true,
    onChange: fn(),
  },
};

export const FilledListEditable: Story = {
  render: (args) => {
    const [urls, setUrls] = useState<string[]>([
      'https://example.com/article1',
      'https://example.com/article2',
      'https://britishmuseum.org/collection',
    ]);
    return <UrlListEditor {...args} value={urls} onChange={setUrls} />;
  },
  args: {
    editable: true,
    onChange: fn(),
  },
};

export const ReadOnlyList: Story = {
  args: {
    value: [
      'https://example.com/article1',
      'https://example.com/article2',
      'https://britishmuseum.org/collection',
    ],
    editable: false,
  },
};

export const WithInvalidUrls: Story = {
  render: (args) => {
    const [urls, setUrls] = useState<string[]>([
      'https://example.com/article1',
      'not-a-url',
      'https://britishmuseum.org/collection',
    ]);
    return <UrlListEditor {...args} value={urls} onChange={setUrls} />;
  },
  args: {
    editable: true,
    onChange: fn(),
  },
};
