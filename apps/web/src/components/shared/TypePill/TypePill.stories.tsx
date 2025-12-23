import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TypePill } from './TypePill';

const meta = {
  title: 'Shared/TypePill',
  component: TypePill,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TypePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Museum: Story = {
  args: {
    type: 'MUSEUM',
  },
};

export const Room: Story = {
  args: {
    type: 'ROOM',
  },
};

export const Artifact: Story = {
  args: {
    type: 'ARTIFACT',
  },
};

export const CustomType: Story = {
  args: {
    type: 'CUSTOM',
  },
};
