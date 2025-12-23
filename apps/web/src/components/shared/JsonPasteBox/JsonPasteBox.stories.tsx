import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { JsonPasteBox } from './JsonPasteBox';

const meta = {
  title: 'Shared/JsonPasteBox',
  component: JsonPasteBox,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof JsonPasteBox>;

export default meta;
type Story = StoryObj<typeof JsonPasteBox>;

export const ValidJson: Story = {
  render: (args) => {
    const [value, setValue] = useState(
      JSON.stringify(
        {
          name: 'British Museum',
          type: 'MUSEUM',
          knowledgeText: 'A world-renowned museum.',
        },
        null,
        2
      )
    );
    return <JsonPasteBox {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Import JSON',
    onChange: fn(),
  },
};

export const InvalidJson: Story = {
  render: (args) => {
    const [value, setValue] = useState('{ name: "British Museum" }');
    return <JsonPasteBox {...args} value={value} onChange={setValue} />;
  },
  args: {
    label: 'Import JSON',
    onChange: fn(),
  },
};

export const WithErrors: Story = {
  args: {
    label: 'Import JSON',
    value: JSON.stringify({ name: 'Test' }, null, 2),
    errors: ['Missing required field: type', 'Invalid format'],
    onChange: fn(),
  },
};

export const Empty: Story = {
  args: {
    label: 'Import JSON',
    value: '',
    onChange: fn(),
  },
};
