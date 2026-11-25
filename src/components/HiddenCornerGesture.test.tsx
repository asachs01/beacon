import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef, type ComponentProps } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HiddenCornerGesture, type HiddenCornerGestureHandle } from './HiddenCornerGesture';
import { HIDDEN_GESTURE_IDLE_MS } from '../display/hidden-gesture';

function setup(props: Partial<ComponentProps<typeof HiddenCornerGesture>> = {}) {
  const onGrantedChange = vi.fn();
  const ref = createRef<HiddenCornerGestureHandle>();
  render(
    <HiddenCornerGesture
      ref={ref}
      purpose="kiosk"
      corner="left"
      members={[]}
      onGrantedChange={onGrantedChange}
      {...props}
    />,
  );
  return { onGrantedChange, ref };
}

function hotZone() {
  return screen.getByRole('button', { name: 'Hidden controls' });
}

describe('HiddenCornerGesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps kiosk navigation hidden until a 2 second press in the top corner', () => {
    const { onGrantedChange } = setup();
    expect(onGrantedChange).toHaveBeenLastCalledWith(false);
    fireEvent.pointerDown(hotZone(), { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(1999); });
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reveals kiosk navigation after 3 quick taps', () => {
    const { onGrantedChange } = setup();
    const zone = hotZone();
    for (let i = 0; i < 3; i += 1) {
      fireEvent.pointerDown(zone, { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
      fireEvent.pointerUp(zone, { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
      act(() => { vi.advanceTimersByTime(120); });
    }
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('ignores a swipe that leaves the corner', () => {
    const { onGrantedChange } = setup();
    const zone = hotZone();
    fireEvent.pointerDown(zone, { button: 0, clientX: 4, clientY: 4, pointerId: 1 });
    fireEvent.pointerMove(zone, { clientX: 90, clientY: 4, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(2500); });
    fireEvent.pointerUp(zone, { clientX: 90, clientY: 4, pointerId: 1 });
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
  });

  it('grants from a keyboard long-press of Escape, not a short tap', () => {
    const { onGrantedChange } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(1500); });
    fireEvent.keyUp(window, { key: 'Escape' });
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('grants from holding Enter on the focused hot zone, and from 3 quick presses', () => {
    const { onGrantedChange } = setup();
    const zone = hotZone();
    zone.focus();
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyUp(zone, { key: 'Enter' });
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyUp(zone, { key: 'Enter' });
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyUp(zone, { key: 'Enter' });
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('asks for a family PIN before revealing navigation', () => {
    const { onGrantedChange } = setup({ members: [{ pin: '1234' }, { pin: '' }] });
    fireEvent.pointerDown(hotZone(), { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
    const input = screen.getByLabelText('PIN');
    fireEvent.change(input, { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show navigation' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That PIN is not recognized.');
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show navigation' }));
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('starts guest mode from the guest PIN without granting kiosk navigation', () => {
    const onEnterGuest = vi.fn();
    const { onGrantedChange } = setup({
      members: [{ pin: '1234' }],
      guestPin: '9876',
      onEnterGuest,
    });
    fireEvent.pointerDown(hotZone(), { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9876' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onEnterGuest).toHaveBeenCalledOnce();
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
  });

  it('leaves guest mode on a family PIN and does not exit kiosk', () => {
    const onExitGuest = vi.fn();
    const { onGrantedChange } = setup({
      members: [{ pin: '1234' }],
      guestPin: '9876',
      guestActive: true,
      onExitGuest,
    });
    fireEvent.pointerDown(hotZone(), { button: 0, clientX: 8, clientY: 8, pointerId: 1 });
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9876' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leave guest mode' }));
    expect(onExitGuest).not.toHaveBeenCalled();
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leave guest mode' }));
    expect(onExitGuest).toHaveBeenCalledOnce();
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
  });

  it('hides revealed navigation after 15 seconds of inactivity', () => {
    const { onGrantedChange } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
    act(() => { vi.advanceTimersByTime(HIDDEN_GESTURE_IDLE_MS); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(false);
  });

  it('resets the hide timer while the navigation is being used', () => {
    const { onGrantedChange } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { vi.advanceTimersByTime(10_000); });
    fireEvent.pointerDown(document.body, { button: 0, clientX: 200, clientY: 200, pointerId: 2 });
    act(() => { vi.advanceTimersByTime(HIDDEN_GESTURE_IDLE_MS - 1); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onGrantedChange).toHaveBeenLastCalledWith(false);
  });

  it('puts the hot zone on the right when the sidebar is on the right', () => {
    setup({ corner: 'right' });
    expect(hotZone().className).toContain('kiosk-reveal-hotzone--right');
  });

  it('confirms before leaving Kid Display when no PIN is set', () => {
    const { onGrantedChange, ref } = setup({
      purpose: 'kid-display',
      memberName: 'Sam',
      members: [],
    });
    act(() => { ref.current?.request(); });
    expect(screen.getByRole('dialog')).toHaveTextContent('Exit Sam’s display and return to Beacon?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onGrantedChange).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => { ref.current?.request(); });
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('requires a PIN to leave Kid Display when one is configured', () => {
    const { onGrantedChange, ref } = setup({
      purpose: 'kid-display',
      memberName: 'Sam',
      members: [{ pin: '4321' }],
    });
    act(() => { ref.current?.request(); });
    expect(screen.queryByText(/Exit Sam/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onGrantedChange).toHaveBeenLastCalledWith(true);
  });

  it('dismisses an abandoned confirm with Escape', () => {
    const { ref } = setup({ purpose: 'kid-display', memberName: 'Sam', members: [] });
    act(() => { ref.current?.request(); });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
