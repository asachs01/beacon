import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_FONT, DEFAULT_HEADING_FONT } from '../fonts/selection';
import { FontSettings } from './FontSettings';

describe('FontSettings notice', () => {
  it('shows a non-blocking status when a face falls back', () => {
    render(
      <FontSettings
        headingFont={DEFAULT_HEADING_FONT}
        bodyFont={DEFAULT_BODY_FONT}
        status={{ headingFellBack: true, bodyFellBack: false }}
        onUpdate={() => {}}
      />,
    );

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/heading font could not be loaded/i);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByLabelText('Heading font')).toBeInTheDocument();
    expect(screen.getByLabelText('Body font')).toBeInTheDocument();
  });
});
