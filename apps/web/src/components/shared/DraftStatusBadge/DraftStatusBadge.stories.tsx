import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DraftStatusBadge } from './DraftStatusBadge';

const meta = {
  title: 'Shared/DraftStatusBadge',
  component: DraftStatusBadge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DraftStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {
  args: {
    status: 'draft',
    tooltip: 'This item is a draft',
  },
};

export const Dirty: Story = {
  args: {
    status: 'dirty',
    tooltip: 'This item has unsaved changes',
  },
};

export const None: Story = {
  args: {
    status: 'none',
    tooltip: 'No draft status',
  },
};
