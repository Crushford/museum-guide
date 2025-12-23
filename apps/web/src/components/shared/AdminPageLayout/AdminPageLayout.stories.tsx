import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminPageLayout } from './AdminPageLayout';

const meta = {
  title: 'Shared/AdminPageLayout',
  component: AdminPageLayout,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AdminPageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Museum Management',
    children: (
      <div className="bg-panel border border-border rounded-lg p-6">
        <p className="text-fg">Admin content goes here.</p>
      </div>
    ),
  },
};

export const WithBreadcrumbsAndActions: Story = {
  args: {
    title: 'Edit Museum',
    breadcrumbs: [
      { label: 'Admin', href: '/admin' },
      { label: 'Museums', href: '/admin/museums' },
      { label: 'British Museum' },
    ],
    actions: (
      <button className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-2 transition-colors">
        Save Changes
      </button>
    ),
    children: (
      <div className="space-y-6">
        <div className="bg-panel border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold text-fg mb-4">Museum Details</h2>
          <p className="text-muted">Form content goes here.</p>
        </div>
      </div>
    ),
  },
};
