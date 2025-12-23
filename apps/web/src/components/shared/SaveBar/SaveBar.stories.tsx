import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SaveBar } from './SaveBar';

const meta = {
  title: 'Shared/SaveBar',
  component: SaveBar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SaveBar>;

export default meta;
type Story = StoryObj<typeof SaveBar>;

export const VisibleDirty: Story = {
  args: {
    isDirty: true,
    onSave: fn(),
    onDiscard: fn(),
    lastSavedAt: '2 minutes ago',
  },
};

export const HiddenClean: Story = {
  args: {
    isDirty: false,
    onSave: fn(),
    onDiscard: fn(),
  },
};

export const WithoutLastSaved: Story = {
  args: {
    isDirty: true,
    onSave: fn(),
    onDiscard: fn(),
  },
};
