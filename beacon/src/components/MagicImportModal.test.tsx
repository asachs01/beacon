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

function renderModal(members: { pin?: string }[], guestMode = false) {
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
      guestMode={guestMode}
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

  it('blocks approve and reject in guest mode', async () => {
    const { onCreateEvent, onClose } = renderModal([], true);
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Guests can.t do that on this screen/);
    expect(onCreateEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onClose).not.toHaveBeenCalled();
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

const HEIC_ERROR = "This photo format (HEIC) can't be read on this device. Try a JPEG or PNG, or change your camera to Most Compatible.";

function renderFileModal(options: {
  useHaAgent?: boolean;
  aiTaskEntityId?: string;
  aiTaskEntityName?: string;
  members?: { pin?: string }[];
  convertHeic?: (file: Blob) => Promise<Blob>;
  readPdf?: (data: ArrayBuffer) => Promise<{
    pageTexts: string[];
    route: 'text' | 'scan';
    text: string;
    renderFirstPage: () => Promise<Blob>;
  }>;
  extract?: (text: string) => Promise<Extraction>;
  extractImage?: (image: { blob: Blob; mime: string; filename: string }) => Promise<Extraction & { mediaLeftBehind?: boolean }>;
  showCamera?: boolean;
} = {}) {
  const onCreateEvent = vi.fn(async () => {});
  const onClose = vi.fn();
  const extract = options.extract ?? vi.fn(async () => extraction);
  const extractImage = options.extractImage ?? vi.fn(async () => ({
    ...extraction,
    source: 'home-assistant' as const,
    agent: {
      id: 'ai_task.openai_ai_task',
      name: 'OpenAI',
      locality: 'cloud' as const,
    },
  }));
  render(
    <MagicImportModal
      calendars={[{ id: 'cal-1', name: 'Family' }]}
      lists={[{ id: 'beacon-shopping', name: 'Shopping' }]}
      members={options.members ?? []}
      defaultCalendarId="cal-1"
      defaultGroceryListId="beacon-shopping"
      defaultTodoListId="beacon-todo"
      defaultDurationMinutes={60}
      locale="en-US"
      grocyEnabled={false}
      useHaAgent={options.useHaAgent ?? true}
      aiTaskEntityId={options.aiTaskEntityId ?? ''}
      aiTaskEntityName={options.aiTaskEntityName ?? (options.aiTaskEntityId ? 'OpenAI' : undefined)}
      getClient={() => null}
      onCreateEvent={onCreateEvent}
      onClose={onClose}
      planRoute={async () => ({ source: 'local', agent: null })}
      extract={extract}
      extractImage={extractImage}
      convertHeic={options.convertHeic}
      readPdf={options.readPdf}
      showCamera={options.showCamera}
    />,
  );
  return { onCreateEvent, onClose, extract, extractImage };
}

function pickFile(name: string, type: string, bytes = 32) {
  const file = new File([new Uint8Array(bytes)], name, { type });
  fireEvent.change(screen.getByLabelText('Add a photo or PDF'), { target: { files: [file] } });
  return file;
}

describe('Magic Import photos and PDFs', () => {
  it('shows a plain HEIC error and does not continue', async () => {
    const { extract, extractImage } = renderFileModal({
      aiTaskEntityId: 'ai_task.openai_ai_task',
      convertHeic: async () => {
        throw new Error('The source image cannot be decoded.');
      },
    });
    pickFile('IMG_1.heic', 'image/heic');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HEIC_ERROR);
    expect(alert).not.toHaveTextContent('cannot be decoded');
    expect(screen.queryByText('A local parser on this device will read this.')).not.toBeInTheDocument();
    expect(screen.queryByText('Read by a local parser on this device.')).not.toBeInTheDocument();
    expect(screen.queryByText(/never leaves your device/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find items' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
    expect(extract).not.toHaveBeenCalled();
    expect(extractImage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('names a cloud AI Task entity and still requires the family PIN', async () => {
    const { onCreateEvent, extract, extractImage } = renderFileModal({
      aiTaskEntityId: 'ai_task.openai_ai_task',
      members: [{ pin: '1234' }],
    });
    pickFile('flyer.jpg', 'image/jpeg');
    expect(await screen.findByText(
      'This will be processed by OpenAI (ai_task.openai_ai_task), a cloud Home Assistant AI Task entity.',
    )).toBeInTheDocument();
    expect(screen.getByText(/processed by your Home Assistant AI Task entity/)).toBeInTheDocument();
    expect(screen.getByText(/Beacon itself sends the file nowhere else/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
    expect(await screen.findByText(
      'Processed by OpenAI (ai_task.openai_ai_task), a cloud Home Assistant AI Task entity.',
    )).toBeInTheDocument();
    expect(extract).not.toHaveBeenCalled();
    expect(extractImage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onCreateEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onCreateEvent).toHaveBeenCalled());
  });

  it('explains that photos are unavailable when no AI Task entity is set', async () => {
    const { extractImage } = renderFileModal({ useHaAgent: true, aiTaskEntityId: '' });
    pickFile('flyer.png', 'image/png');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo and scanned-PDF import needs an AI Task entity.',
    );
    expect(screen.queryByText(/local parser will read this/)).not.toBeInTheDocument();
    expect(extractImage).not.toHaveBeenCalled();
  });

  it('explains that photos are unavailable when the local parser is forced', async () => {
    const { extractImage } = renderFileModal({
      useHaAgent: false,
      aiTaskEntityId: 'ai_task.ollama_ai_task',
    });
    pickFile('flyer.jpg', 'image/jpeg');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The local parser reads text, not photos.',
    );
    expect(screen.queryByText(/Read by a local parser/)).not.toBeInTheDocument();
    expect(extractImage).not.toHaveBeenCalled();
  });

  it('rejects more than one file, files over 10 MB, and other formats', async () => {
    const { extractImage } = renderFileModal({ aiTaskEntityId: 'ai_task.openai_ai_task' });
    const big = new File([new Uint8Array(8)], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('Add a photo or PDF'), { target: { files: [big] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 10 MB');

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
    fireEvent.change(screen.getByLabelText('Add a photo or PDF'), {
      target: { files: [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('one file at a time');

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
    pickFile('notes.gif', 'image/gif');
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG, PNG, HEIC, or PDF.');
    expect(extractImage).not.toHaveBeenCalled();
  });

  it('sends a text PDF through the text pipeline and a scan through the image path', async () => {
    const text = 'Field trip Friday December 5 at 9am at the museum. Please bring lunch.';
    const renderFirstPage = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    const extract = vi.fn(async () => extraction);
    const { extractImage } = renderFileModal({
      useHaAgent: false,
      aiTaskEntityId: '',
      readPdf: async () => ({ pageTexts: [text], route: 'text', text, renderFirstPage }),
      extract,
    });
    pickFile('notice.pdf', 'application/pdf');
    expect(await screen.findByText('notice.pdf is ready. Remove it to use pasted text instead.')).toBeInTheDocument();
    expect(await screen.findByText('A local parser on this device will read this.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Find items' }));
    await screen.findByDisplayValue('Practice');
    expect(extract).toHaveBeenCalledWith(text);
    expect(extractImage).not.toHaveBeenCalled();
    expect(renderFirstPage).not.toHaveBeenCalled();
  });

  it('renders page 1 of a scan only when an AI Task entity is available', async () => {
    const renderFirstPage = vi.fn(async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    const blocked = renderFileModal({
      useHaAgent: true,
      aiTaskEntityId: '',
      readPdf: async () => ({ pageTexts: [''], route: 'scan', text: '', renderFirstPage }),
    });
    pickFile('scan.pdf', 'application/pdf');
    expect(await screen.findByRole('alert')).toHaveTextContent('needs an AI Task entity');
    expect(renderFirstPage).not.toHaveBeenCalled();
    expect(blocked.extractImage).not.toHaveBeenCalled();

    const ready = renderFileModal({
      aiTaskEntityId: 'ai_task.ollama_ai_task',
      aiTaskEntityName: 'Ollama',
      readPdf: async () => ({ pageTexts: ['Page'], route: 'scan', text: 'Page', renderFirstPage }),
    });
    const inputs = screen.getAllByLabelText('Add a photo or PDF');
    fireEvent.change(inputs[1], {
      target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText(
      'This will be processed by Ollama (ai_task.ollama_ai_task), a local Home Assistant AI Task entity.',
    )).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Find items' })[1]);
    await waitFor(() => expect(ready.extractImage).toHaveBeenCalledOnce());
    expect(renderFirstPage).toHaveBeenCalledOnce();
    expect(ready.extract).not.toHaveBeenCalled();
  });

  it('offers the camera capture control on mobile', async () => {
    renderFileModal({ showCamera: true, aiTaskEntityId: 'ai_task.openai_ai_task' });
    expect(screen.getByLabelText('Take a photo')).toHaveAttribute('capture', 'environment');
    await screen.findByText('A local parser on this device will read this.');
  });
});
