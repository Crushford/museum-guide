import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { EditableTextareaRow } from './EditableTextareaRow';

const meta = {
  title: 'Shared/EditableTextareaRow',
  component: EditableTextareaRow,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EditableTextareaRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
  args: {
    label: 'Knowledge Text',
    value:
      'The British Museum houses a vast collection of artifacts from around the world.',
    editable: false,
  },
};

export const Editable: Story = {
  render: (args) => {
    const [isEditing, setIsEditing] = useState(false);
    return (
      <EditableTextareaRow
        {...args}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
      />
    );
  },
  args: {
    label: 'Knowledge Text',
    value:
      'The British Museum houses a vast collection of artifacts from around the world.',
    editable: true,
    onEditToggle: fn(),
  },
};

export const LongText: Story = {
  render: (args) => {
    const [isEditing, setIsEditing] = useState(false);
    return (
      <EditableTextareaRow
        {...args}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
      />
    );
  },
  args: {
    label: 'Description',
    value: `The British Museum, located in London, is one of the world's oldest and most comprehensive museums. Founded in 1753, it houses a collection of over 8 million works spanning human history, culture, and art.

The museum's collection includes artifacts from ancient civilizations, including Egyptian mummies, Greek sculptures, Roman artifacts, and treasures from Asia, Africa, and the Americas.`,
    editable: true,
    rows: 8,
    onEditToggle: fn(),
  },
};

export const Empty: Story = {
  args: {
    label: 'Notes',
    value: '',
    editable: true,
    onEditToggle: fn(),
  },
};
