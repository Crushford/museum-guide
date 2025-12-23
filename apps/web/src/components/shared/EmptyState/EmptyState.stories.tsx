import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Shared/EmptyState',
  component: EmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'No items found',
    message: 'There are no items to display at this time.',
  },
};

export const WithAction: Story = {
  args: {
    title: 'No museums yet',
    message: 'Create your first museum to get started.',
    action: {
      label: 'Create Museum',
      onClick: fn(),
    },
  },
};

export const WithHref: Story = {
  args: {
    title: 'No rooms found',
    message: 'This museum has no rooms yet.',
    action: {
      label: 'Add Room',
      href: '/admin/museums/1/rooms/new',
    },
  },
};
