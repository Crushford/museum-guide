import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImportPreviewTable } from './ImportPreviewTable';

const meta = {
  title: 'Shared/ImportPreviewTable',
  component: ImportPreviewTable,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ImportPreviewTable>;

export default meta;
type Story = StoryObj<typeof ImportPreviewTable>;

export const MixedOkWarnError: Story = {
  args: {
    rows: [
      {
        type: 'MUSEUM',
        name: 'British Museum',
        status: 'ok',
      },
      {
        type: 'ROOM',
        name: 'Ancient Egypt Gallery',
        parent: 'British Museum',
        status: 'ok',
      },
      {
        type: 'ARTIFACT',
        name: 'Rosetta Stone',
        parent: 'Ancient Egypt Gallery',
        status: 'warning',
        message: 'Parent room not found, will be created',
      },
      {
        type: 'MUSEUM',
        name: '',
        status: 'error',
        message: 'Name is required',
      },
      {
        type: 'ROOM',
        name: 'Greek Gallery',
        parent: 'Non-existent Museum',
        status: 'error',
        message: 'Parent museum does not exist',
      },
    ],
  },
};

export const AllOk: Story = {
  args: {
    rows: [
      {
        type: 'MUSEUM',
        name: 'British Museum',
        status: 'ok',
      },
      {
        type: 'ROOM',
        name: 'Ancient Egypt Gallery',
        parent: 'British Museum',
        status: 'ok',
      },
      {
        type: 'ARTIFACT',
        name: 'Rosetta Stone',
        parent: 'Ancient Egypt Gallery',
        status: 'ok',
      },
    ],
  },
};

export const AllErrors: Story = {
  args: {
    rows: [
      {
        type: 'MUSEUM',
        name: '',
        status: 'error',
        message: 'Name is required',
      },
      {
        type: 'ROOM',
        name: 'Test Room',
        parent: 'Invalid Parent',
        status: 'error',
        message: 'Parent does not exist',
      },
    ],
  },
};
