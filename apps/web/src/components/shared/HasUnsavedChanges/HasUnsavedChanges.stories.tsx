import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HasUnsavedChanges } from './HasUnsavedChanges';

const meta = {
  title: 'Shared/HasUnsavedChanges',
  component: HasUnsavedChanges,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HasUnsavedChanges>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    tooltip: 'This item has unsaved changes',
  },
};

export const CustomTooltip: Story = {
  args: {
    tooltip: 'You have unsaved edits',
  },
};
