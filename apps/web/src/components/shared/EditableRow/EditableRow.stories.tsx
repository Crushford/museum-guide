import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { EditableRow } from './EditableRow';

const meta = {
  title: 'Shared/EditableRow',
  component: EditableRow,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EditableRow>;

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
  render: function EditableStory(args) {
    const [isEditing, setIsEditing] = useState(false);
    return (
      <EditableRow
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

export const TextareaReadOnly: Story = {
  args: {
    label: 'Knowledge Text',
    type: 'textarea',
    value:
      'The British Museum houses a vast collection of artifacts from around the world.',
    editable: false,
  },
};

export const TextareaEditable: Story = {
  render: function TextareaEditableStory(args) {
    const [isEditing, setIsEditing] = useState(false);
    return (
      <EditableRow
        {...args}
        isEditing={isEditing}
        onEditToggle={() => setIsEditing(!isEditing)}
      />
    );
  },
  args: {
    label: 'Knowledge Text',
    type: 'textarea',
    value:
      'The British Museum houses a vast collection of artifacts from around the world.',
    editable: true,
    onEditToggle: fn(),
  },
};

export const TextareaEmpty: Story = {
  args: {
    label: 'Notes',
    type: 'textarea',
    value: '',
    editable: true,
    onEditToggle: fn(),
  },
};
