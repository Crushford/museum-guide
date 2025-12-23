import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Breadcrumbs } from './Breadcrumbs';

const meta = {
  title: 'Shared/Breadcrumbs',
  component: Breadcrumbs,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoLevels: Story = {
  args: {
    items: [{ label: 'Admin', href: '/admin' }, { label: 'Nodes' }],
  },
};

export const ThreeLevels: Story = {
  args: {
    items: [
      { label: 'Admin', href: '/admin' },
      { label: 'Museums', href: '/admin/museums' },
      { label: 'British Museum' },
    ],
  },
};

export const FourLevels: Story = {
  args: {
    items: [
      { label: 'Admin', href: '/admin' },
      { label: 'Museums', href: '/admin/museums' },
      { label: 'British Museum', href: '/admin/museums/1' },
      { label: 'Ancient Egypt Gallery' },
    ],
  },
};
