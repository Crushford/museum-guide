import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityList } from './EntityList';
import { EmptyState } from '../EmptyState';

const meta = {
  title: 'Shared/EntityList',
  component: EntityList,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EntityList>;

export default meta;
type Story = StoryObj<typeof EntityList>;

export const WithItems: Story = {
  args: {
    title: 'Museums',
    items: [
      {
        id: 1,
        name: 'British Museum',
        subtitle: 'London, UK',
        href: '/admin/museums/1',
        typePill: 'MUSEUM',
      },
      {
        id: 2,
        name: 'Metropolitan Museum',
        subtitle: 'New York, USA',
        href: '/admin/museums/2',
        typePill: 'MUSEUM',
        status: 'draft',
      },
      {
        id: 3,
        name: 'Louvre',
        subtitle: 'Paris, France',
        href: '/admin/museums/3',
        typePill: 'MUSEUM',
        status: 'dirty',
      },
    ],
    primaryAction: {
      label: 'Add Museum',
      onClick: fn(),
    },
  },
};

export const WithEmptyState: Story = {
  args: {
    title: 'Rooms',
    items: [],
    emptyState: (
      <EmptyState
        title="No rooms yet"
        message="Create your first room to get started."
        action={{
          label: 'Add Room',
          onClick: fn(),
        }}
      />
    ),
  },
};

export const WithMixedStatuses: Story = {
  args: {
    title: 'Content Items',
    items: [
      {
        id: 1,
        name: 'Introduction',
        subtitle: 'Main introduction text',
        typePill: 'ARTIFACT',
        status: 'none',
      },
      {
        id: 2,
        name: 'Gallery Overview',
        subtitle: 'Draft content',
        typePill: 'ROOM',
        status: 'draft',
      },
      {
        id: 3,
        name: 'Artifact Details',
        subtitle: 'Has unsaved changes',
        typePill: 'ARTIFACT',
        status: 'dirty',
      },
    ],
  },
};
