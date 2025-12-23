import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SectionCard } from './SectionCard';

const meta = {
  title: 'Shared/SectionCard',
  component: SectionCard,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SectionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Museum Information',
    children: (
      <p className="text-fg">
        This section contains information about the museum.
      </p>
    ),
  },
};

export const WithSubtitle: Story = {
  args: {
    title: 'Content Items',
    subtitle: 'Manage content associated with this node',
    children: (
      <div className="space-y-2">
        <p className="text-fg">Content items will appear here.</p>
      </div>
    ),
  },
};

export const WithActions: Story = {
  args: {
    title: 'Nodes',
    subtitle: 'Child nodes of this museum',
    actions: (
      <button className="px-3 py-1 text-sm bg-accent text-white rounded-md hover:bg-accent-2 transition-colors">
        Add Node
      </button>
    ),
    children: (
      <div className="space-y-2">
        <p className="text-fg">Node list will appear here.</p>
      </div>
    ),
  },
};
