import { describe, expect, it } from 'vitest';
import { computeOverlapLayout, type OverlapEvent } from './overlap-layout';

const d = (time: string) => `2026-09-08T${time}:00`;

function ev(id: string, start: string, end: string): OverlapEvent {
  return { id, start: d(start), end: d(end) };
}

describe('computeOverlapLayout', () => {
  it('returns an empty map when there are no events', () => {
    expect(computeOverlapLayout([]).size).toBe(0);
  });

  it('emits no layout for non-overlapping events', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '10:00'),
      ev('b', '10:00', '11:00'),
      ev('c', '13:00', '14:00'),
    ]);
    expect(layout.size).toBe(0);
  });

  it('spans the first of two overlaps full-width behind the second', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '11:00'),
      ev('b', '10:00', '12:00'),
    ]);
    // a doubles to full width → omitted (CSS default already means full width)
    expect(layout.get('a')).toBeUndefined();
    // b doubles onto the right half
    expect(layout.get('b')!.left).toBeCloseTo(0.5);
    expect(layout.get('b')!.width).toBeCloseTo(0.5);
    expect(layout.get('b')!.level).toBe(1);
  });

  it('extends the first two of three overlapping events behind', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '11:00'),
      ev('b', '09:30', '10:30'),
      ev('c', '10:00', '11:00'),
    ]);
    // raw thirds a(0,1/3) b(1/3,2/3) c(2/3,1); doubled → a,b 2/3, c 1/3
    expect(layout.get('a')!.left).toBeCloseTo(0);
    expect(layout.get('a')!.width).toBeCloseTo(2 / 3);
    expect(layout.get('b')!.left).toBeCloseTo(1 / 3);
    expect(layout.get('b')!.width).toBeCloseTo(2 / 3);
    expect(layout.get('c')!.left).toBeCloseTo(2 / 3);
    expect(layout.get('c')!.width).toBeCloseTo(1 / 3);
  });

  it('lets a long event span full width while two short events sit right', () => {
    const layout = computeOverlapLayout([
      ev('long', '09:00', '17:00'),
      ev('s1', '10:00', '11:00'),
      ev('s2', '12:00', '13:00'),
    ]);
    expect(layout.get('long')).toBeUndefined();
    expect(layout.get('s1')!.left).toBeCloseTo(0.5);
    expect(layout.get('s1')!.width).toBeCloseTo(0.5);
    expect(layout.get('s2')!.left).toBeCloseTo(0.5);
    expect(layout.get('s2')!.width).toBeCloseTo(0.5);
  });

  it('keeps a low-competition event wider than the cluster it joins', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '17:00'),
      ev('b', '10:00', '12:00'),
      ev('c', '11:00', '13:00'),
      ev('d', '14:00', '15:00'),
    ]);
    // d only overlaps a, so it spans the two right columns
    expect(layout.get('a')!.left).toBeCloseTo(0);
    expect(layout.get('b')!.left).toBeCloseTo(1 / 3);
    expect(layout.get('c')!.left).toBeCloseTo(2 / 3);
    expect(layout.get('d')!.left).toBeCloseTo(1 / 3);
    expect(layout.get('d')!.width).toBeCloseTo(2 / 3);
  });

  it('keeps all layout fractions within the day column', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '18:00'),
      ev('b', '09:30', '10:30'),
      ev('c', '10:00', '12:00'),
      ev('d', '11:30', '13:00'),
      ev('e', '12:30', '14:30'),
      ev('f', '14:00', '16:00'),
    ]);
    for (const [id, l] of layout) {
      expect(l.left, id).toBeGreaterThanOrEqual(0);
      expect(l.width, id).toBeGreaterThan(0);
      expect(l.left + l.width, id).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('assigns increasing levels for stacked columns', () => {
    const layout = computeOverlapLayout([
      ev('a', '09:00', '12:00'),
      ev('b', '09:30', '11:30'),
      ev('c', '10:00', '11:00'),
    ]);
    const levels = [layout.get('a')!.level, layout.get('b')!.level, layout.get('c')!.level];
    expect(levels).toEqual([0, 1, 2]);
  });
});