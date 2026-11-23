import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MagicImportModal } from './MagicImportModal';
import type { Extraction } from '../import/extract';

const extraction: Extraction = {
  source: 'local',
  agent: null,
  events: [{
    title: 'Practice',
    date: '2026-11-21',
    allDay: false,
    startTime: '15:00',
    endTime: null,
    location: null,
    notes: null,
  }],
  items: [{ title: 'milk', list: 'grocery' }],
};

function openReview() {
  fireEvent.change(screen.getByLabelText('Paste a message'), { target: { value: 'Practice tomorrow' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
  return screen.findByDisplayValue('Practice');
}

function renderModal(members: { pin?: string }[]) {
  const onCreateEvent = vi.fn(async () => {});
  const onAddListItem = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <MagicImportModal
      calendars={[{ id: 'cal-1', name: 'Family' }]}
      lists={[
        { id: 'beacon-shopping', name: 'Shopping' },
        { id: 'beacon-todo', name: 'To-Do' },
      ]}
      members={members}
      defaultCalendarId="cal-1"
      defaultGroceryListId="beacon-shopping"
      defaultTodoListId="beacon-todo"
      defaultDurationMinutes={60}
      locale="en-US"
      grocyEnabled={false}
      useHaAgent={false}
      getClient={() => null}
      now={new Date('2026-11-20T18:00:00-07:00')}
      timeZone="America/Phoenix"
      onCreateEvent={onCreateEvent}
      onAddListItem={onAddListItem}
      onClose={onClose}
      extract={async () => extraction}
    />,
  );
  return { onCreateEvent, onAddListItem, onClose };
}

describe('Magic Import review PIN gate', () => {
  it('does not write drafts until a family PIN is accepted', async () => {
    const { onCreateEvent, onAddListItem, onClose } = renderModal([{ pin: '1234' }]);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onCreateEvent).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Enter PIN' })).toHaveTextContent('family PIN');

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That PIN is not recognized.');
    expect(onCreateEvent).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onCreateEvent).toHaveBeenCalledWith('cal-1', expect.objectContaining({
      summary: 'Practice',
      start_date_time: '2026-11-21T15:00:00',
      end_date_time: '2026-11-21T16:00:00',
    })));
    expect(onAddListItem).toHaveBeenCalledWith('beacon-shopping', 'milk');
    expect(onClose).toHaveBeenCalled();
  });

  it('discards drafts on reject only after the PIN, without writing them', async () => {
    const { onCreateEvent, onAddListItem, onClose } = renderModal([{ pin: '1234' }]);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onClose).toHaveBeenCalled();
    expect(onCreateEvent).not.toHaveBeenCalled();
    expect(onAddListItem).not.toHaveBeenCalled();
  });

  it('approves immediately when the household has no PIN', async () => {
    const { onCreateEvent, onClose } = renderModal([]);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onCreateEvent).toHaveBeenCalled());
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('names a cloud conversation agent before and after review', async () => {
    render(
      <MagicImportModal
        calendars={[{ id: 'cal-1', name: 'Family' }]}
        lists={[{ id: 'beacon-shopping', name: 'Shopping' }]}
        members={[]}
        defaultCalendarId="cal-1"
        defaultGroceryListId="beacon-shopping"
        defaultTodoListId="beacon-todo"
        defaultDurationMinutes={60}
        locale="en-US"
        grocyEnabled={false}
        useHaAgent
        getClient={() => null}
        onCreateEvent={vi.fn()}
        onClose={vi.fn()}
        planRoute={async () => ({
          source: 'home-assistant',
          agent: {
            id: 'conversation.openai_conversation',
            name: 'OpenAI Conversation',
            locality: 'cloud',
          },
        })}
        extract={async () => ({
          ...extraction,
          source: 'home-assistant',
          agent: {
            id: 'conversation.openai_conversation',
            name: 'OpenAI Conversation',
            locality: 'cloud',
          },
        })}
      />,
    );

    expect(await screen.findByText(
      'This will be processed by OpenAI Conversation (conversation.openai_conversation), a cloud Home Assistant conversation agent.',
    )).toBeInTheDocument();
    expect(screen.getByText(/Beacon itself sends the text nowhere/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Paste a message'), { target: { value: 'Picture day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
    expect(await screen.findByText(
      'Processed by OpenAI Conversation (conversation.openai_conversation), a cloud Home Assistant conversation agent.',
    )).toBeInTheDocument();
  });

  it('says the local parser will read the text when Home Assistant is off', async () => {
    renderModal([]);
    expect(await screen.findByText('A local parser on this device will read this.')).toBeInTheDocument();
    expect(screen.queryByText(/Beacon itself sends the text nowhere/)).not.toBeInTheDocument();

    await openReview();
    expect(screen.getByText('Read by a local parser on this device.')).toBeInTheDocument();
  });

  it('labels an unnamed Home Assistant agent as may be cloud', async () => {
    render(
      <MagicImportModal
        calendars={[{ id: 'cal-1', name: 'Family' }]}
        lists={[{ id: 'beacon-shopping', name: 'Shopping' }]}
        members={[]}
        defaultCalendarId="cal-1"
        defaultGroceryListId="beacon-shopping"
        defaultTodoListId="beacon-todo"
        defaultDurationMinutes={60}
        locale="en-US"
        grocyEnabled={false}
        useHaAgent
        getClient={() => null}
        onCreateEvent={vi.fn()}
        onClose={vi.fn()}
        planRoute={async () => ({
          source: 'home-assistant',
          agent: { id: '', name: '', locality: 'maybe-cloud' },
        })}
        extract={async () => ({
          ...extraction,
          source: 'home-assistant',
          agent: {
            id: 'conversation.my_helper',
            name: 'My Helper',
            locality: 'maybe-cloud',
          },
        })}
      />,
    );
    expect(await screen.findByText(
      'This will be processed by your Home Assistant conversation agent, which may be cloud.',
    )).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Paste a message'), { target: { value: 'Picture day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
    expect(await screen.findByText(
      'Processed by My Helper (conversation.my_helper). This Home Assistant conversation agent may be cloud.',
    )).toBeInTheDocument();
  });
});
