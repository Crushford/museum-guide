import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { NodeForm } from './NodeForm';

const meta = {
  title: 'Admin/NodeForm',
  component: NodeForm,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    submitLabel: {
      control: 'text',
      description: 'Label for the submit button',
    },
    initialName: {
      control: 'text',
      description: 'Initial value for the name field',
    },
    initialKnowledgeText: {
      control: 'text',
      description: 'Initial value for the knowledge text field',
    },
    initialFurtherReading: {
      control: 'object',
      description: 'Initial array of URLs for further reading',
    },
  },
  args: {
    action: fn(),
  },
} satisfies Meta<typeof NodeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    submitLabel: 'Create Node',
    initialName: '',
    initialKnowledgeText: '',
    initialFurtherReading: [],
  },
};

export const WithInitialValues: Story = {
  args: {
    submitLabel: 'Update Node',
    initialName: 'Ancient Artifacts Gallery',
    initialKnowledgeText:
      'This gallery showcases artifacts from ancient civilizations, including pottery, tools, and ceremonial objects.',
    initialFurtherReading: [
      'https://example.com/ancient-artifacts',
      'https://example.com/archaeology-basics',
    ],
  },
};

export const WithLongText: Story = {
  args: {
    submitLabel: 'Save Changes',
    initialName: 'Renaissance Art Collection',
    initialKnowledgeText:
      'The Renaissance period marked a significant shift in European art, characterized by a renewed interest in classical antiquity, humanism, and naturalism. Artists like Leonardo da Vinci, Michelangelo, and Raphael created works that emphasized perspective, anatomy, and emotional expression. This collection features paintings, sculptures, and drawings from the 14th to 17th centuries, showcasing the evolution of artistic techniques and themes during this transformative era.',
    initialFurtherReading: [
      'https://example.com/renaissance-art',
      'https://example.com/renaissance-artists',
      'https://example.com/art-history-renaissance',
    ],
  },
};

export const CreateMode: Story = {
  args: {
    submitLabel: 'Create New Node',
    initialName: '',
    initialKnowledgeText: '',
    initialFurtherReading: [],
  },
};

export const EditMode: Story = {
  args: {
    submitLabel: 'Update Node',
    initialName: 'Medieval Manuscripts',
    initialKnowledgeText:
      'A collection of illuminated manuscripts from the medieval period, featuring intricate illustrations and calligraphy.',
    initialFurtherReading: ['https://example.com/medieval-manuscripts'],
  },
};
