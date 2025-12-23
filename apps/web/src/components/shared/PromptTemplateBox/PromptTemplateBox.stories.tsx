import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PromptTemplateBox } from './PromptTemplateBox';

const meta = {
  title: 'Shared/PromptTemplateBox',
  component: PromptTemplateBox,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PromptTemplateBox>;

export default meta;
type Story = StoryObj<typeof PromptTemplateBox>;

export const MuseumTemplate: Story = {
  args: {
    title: 'Museum Prompt Template',
    template: `Create a museum entry for the British Museum.

Include:
- Historical background
- Notable collections
- Visitor information`,
    helperText: 'Use this template to generate museum content using AI.',
  },
};

export const RoomTemplate: Story = {
  args: {
    title: 'Room Prompt Template',
    template: `Describe the Ancient Egypt Gallery at the British Museum.

Cover:
- Thematic focus
- Key artifacts on display
- Historical context`,
    helperText: 'This template helps generate room descriptions.',
  },
};

export const ArtifactTemplate: Story = {
  args: {
    title: 'Artifact Prompt Template',
    template: `Provide detailed information about the Rosetta Stone.

Include:
- Physical description
- Historical significance
- Discovery and acquisition
- Current location and display`,
    helperText: 'Use this to generate comprehensive artifact descriptions.',
  },
};
