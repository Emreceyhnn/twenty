import { type Meta, type StoryObj } from '@storybook/react-vite';
import { graphql, HttpResponse } from 'msw';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ComponentDecorator } from 'twenty-ui/testing';

import { DirectMessageFlowExample } from '@/ai/components/__stories__/DirectMessageFlowExample';
import { DIRECT_MESSAGE_FLOW_FIXTURE } from '@/ai/components/__stories__/directMessageFlowFixture';
import { MemoryRouterDecorator } from '~/testing/decorators/MemoryRouterDecorator';
import { RootDecorator } from '~/testing/decorators/RootDecorator';
import { ToastDecorator } from '~/testing/decorators/ToastDecorator';

const lookup = fn();

const meta = {
  title: 'Modules/AI/DirectMessageFlow',
  component: DirectMessageFlowExample,
  decorators: [
    ComponentDecorator,
    RootDecorator,
    ToastDecorator,
    MemoryRouterDecorator,
  ],
  args: { onCanonicalSelection: fn() },
  beforeEach: () => {
    lookup.mockClear();
  },
  parameters: {
    msw: {
      handlers: [
        graphql.query('DirectMessageThread', ({ variables }) => {
          lookup(variables.peerWorkspaceMemberId);
          return HttpResponse.json({ data: { directMessageThread: null } });
        }),
      ],
    },
  },
} satisfies Meta<typeof DirectMessageFlowExample>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecipientDraftsAndCanonicalHandoff: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open Anna' }));
    await canvas.findByText('Anna');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Message draft' }),
      'For Anna',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Attach notes' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Open Felix' }));
    await canvas.findByText('Felix');
    await expect(
      canvas.getByRole('textbox', { name: 'Message draft' }),
    ).toHaveValue('');
    await expect(canvas.queryByText('notes.txt')).not.toBeInTheDocument();
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Message draft' }),
      'For Felix',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Open Anna' }));
    await canvas.findByText('Anna');
    await expect(
      canvas.getByRole('textbox', { name: 'Message draft' }),
    ).toHaveValue('For Anna');
    await expect(canvas.getByText('notes.txt')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Start upload' }));
    await userEvent.click(
      canvas.getByRole('button', { name: 'Open saved conversation' }),
    );
    await waitFor(() =>
      expect(args.onCanonicalSelection).toHaveBeenCalledWith(
        DIRECT_MESSAGE_FLOW_FIXTURE.canonicalThreadId,
      ),
    );
    await expect(args.onCanonicalSelection).toHaveBeenCalledTimes(1);
    await expect(
      canvas.getByRole('textbox', { name: 'Message draft' }),
    ).toHaveValue('For Anna');
    await expect(canvas.getByText('notes.txt')).toBeVisible();
    await expect(canvas.getByText('uploading.txt')).toBeVisible();
    await expect(lookup).toHaveBeenCalledTimes(3);
  },
};
