import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { EditableFieldRow } from './EditableFieldRow';

const meta = {
  title: 'Shared/EditableFieldRow',
  component: EditableFieldRow,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EditableFieldRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
  args: {
    label: 'Museum Name',
    value: 'British Museum',
    editable: false,
  },
};

export const Editable: Story = {
  render: (args) => {
    const [isEditing, setIsEditing] = useState(false);
    return (
      <EditableFieldRow
        {...args}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
      />
    );
  },
  args: {
    label: 'Museum Name',
    value: 'British Museum',
    editable: true,
    onEditToggle: fn(),
  },
};

export const WithTypeBadgeAndHint: Story = {
  args: {
    label: 'Node Type',
    hint: 'The type of node determines its behavior',
    typeBadge: 'MUSEUM',
    value: 'MUSEUM',
    editable: false,
  },
};

export const Editing: Story = {
  args: {
    label: 'Museum Name',
    value: 'British Museum',
    editable: true,
    isEditing: true,
    onEditToggle: fn(),
  },
};
