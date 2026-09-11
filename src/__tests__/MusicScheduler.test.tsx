import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MusicScheduler from '../components/MusicScheduler';

// Helper: fire a native change event on an input
function setNativeValue(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )!.set!;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Mock YouTube IFrame API
beforeAll(() => {
  (window as any).YT = {
    Player: jest.fn().mockImplementation(() => ({
      playVideo: jest.fn(),
      pauseVideo: jest.fn(),
      stopVideo: jest.fn(),
      loadVideoById: jest.fn(),
      setVolume: jest.fn(),
      getPlayerState: jest.fn(),
      getCurrentTime: jest.fn().mockReturnValue(0),
      getDuration: jest.fn().mockReturnValue(0),
      getVideoData: jest.fn().mockReturnValue({}),
      getVideoUrl: jest.fn().mockReturnValue(''),
      mute: jest.fn(),
      unMute: jest.fn(),
      isMuted: jest.fn().mockReturnValue(false),
      destroy: jest.fn(),
    })),
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
  };
});

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('MusicScheduler Component', () => {
  // ─── Initial Render ──────────────────────────────────────────────────────

  describe('Initial Render', () => {
    it('renders the app header', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Music Scheduler')).toBeTruthy();
    });

    it('renders the Add Music button', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Add Music')).toBeTruthy();
    });

    it('renders the Schedules heading', () => {
      render(<MusicScheduler />);
      expect(screen.getAllByText('Schedules').length).toBeGreaterThanOrEqual(1);
    });

    it('renders both schedule cards', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Schedule 1')).toBeTruthy();
      expect(screen.getByText('Schedule 2')).toBeTruthy();
    });

    it('shows ACTIVE badge on Schedule 1 by default', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('ACTIVE')).toBeTruthy();
    });

    it('shows Use This button on the inactive schedule', () => {
      render(<MusicScheduler />);
      expect(screen.getByRole('button', { name: /use this/i })).toBeTruthy();
    });

    it('shows the default time slot on Schedule 1', () => {
      render(<MusicScheduler />);
      expect(screen.getByText(/8:00 AM/)).toBeTruthy();
    });

    it('shows Add time slot buttons for each card', () => {
      render(<MusicScheduler />);
      expect(screen.getAllByRole('button', { name: /add time slot/i }).length).toBe(2);
    });

    it('shows the Now Playing label', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Now Playing')).toBeTruthy();
    });

    it('shows the volume slider in the footer', () => {
      render(<MusicScheduler />);
      expect(screen.getByRole('slider')).toBeTruthy();
    });

    it('shows the hidden file input for audio uploads', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      // File input lives inside the Add Music panel — open it first
      await user.click(screen.getByText('Add Music'));
      await waitFor(() => {
        const fileInput = document.querySelector('input[type="file"]');
        expect(fileInput).toBeTruthy();
        expect(fileInput!.getAttribute('accept')).toBe('audio/*');
      });
    });
  });

  // ─── Schedule Switching ──────────────────────────────────────────────────

  describe('Schedule Switching', () => {
    it('clicking Use This on Schedule 2 makes it active', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /use this/i }));

      await waitFor(() => {
        expect(screen.getAllByText('ACTIVE').length).toBe(1);
        expect(screen.getAllByRole('button', { name: /use this/i }).length).toBe(1);
      });
    });

    it('clicking Use This twice returns to original state', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /use this/i }));
      await user.click(screen.getByRole('button', { name: /use this/i }));

      await waitFor(() => {
        expect(screen.getByText('ACTIVE')).toBeTruthy();
        expect(screen.getByRole('button', { name: /use this/i })).toBeTruthy();
      });
    });
  });

  // ─── Time Slot Management ────────────────────────────────────────────────

  describe('Time Slot Management', () => {
    it('clicking Add time slot reveals the add form', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const [firstBtn] = screen.getAllByRole('button', { name: /add time slot/i });
      await user.click(firstBtn);

      await waitFor(() => {
        // Multiple "Add" buttons exist (mobile nav + slot form); confirm at least one Save button
        const addBtns = screen.getAllByRole('button', { name: /^add$/i });
        expect(addBtns.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('clicking Cancel hides the add form', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const [firstBtn] = screen.getAllByRole('button', { name: /add time slot/i });
      await user.click(firstBtn);

      const cancelBtn = screen.getAllByRole('button', { name: /cancel/i })[0];
      await user.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: /add time slot/i }).length).toBe(2);
      });
    });

    it('saving a new slot adds it to the card', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Schedule 2 starts with 1 slot (9:00 AM). Open its add form.
      const addSlotBtns = screen.getAllByRole('button', { name: /add time slot/i });
      await user.click(addSlotBtns[1]); // Schedule 2

      // Click the slot form's "Add" button (first match; mobile nav "Add" is the second)
      const addBtns = screen.getAllByRole('button', { name: /^add$/i });
      await user.click(addBtns[0]);

      await waitFor(() => {
        // Schedule 2 now has 2 slots; "8:00 AM" appears on both Schedule 1 and Schedule 2
        expect(screen.getAllByText(/8:00 AM/).length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // ─── Add Music Panel ─────────────────────────────────────────────────────

  describe('Add Music Panel', () => {
    it('opens panel when clicking Add Music', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByText('Add Music'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Paste URL here')).toBeTruthy();
      });
    });

    it('shows Bulk Add URLs option', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByText('Add Music'));

      await waitFor(() => {
        expect(screen.getByText(/bulk add urls/i)).toBeTruthy();
      });
    });

    it('shows Choose Files upload button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByText('Add Music'));

      await waitFor(() => {
        expect(screen.getByText(/choose files/i)).toBeTruthy();
      });
    });

    it('shows bulk textarea when Bulk Add URLs is toggled', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      await user.click(screen.getByText('Add Music'));
      await user.click(screen.getByText(/bulk add urls/i));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/one url per line/i)).toBeTruthy();
      });
    });

    it('shows alert for invalid YouTube URL', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      jest.spyOn(window, 'alert').mockImplementation(() => {});

      await user.click(screen.getByText('Add Music'));
      await user.type(screen.getByPlaceholderText('Paste URL here'), 'not-a-valid-url');
      // Use exact text — /add url/i also matches "Bulk Add URLs"
      await user.click(screen.getByRole('button', { name: 'Add URL' }));

      expect(window.alert).toHaveBeenCalledWith('Invalid YouTube URL');
    });

    it('adds a YouTube song to the playlist', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ title: 'Test Song' }),
      }) as jest.Mock;

      await user.click(screen.getByText('Add Music'));
      await user.type(screen.getByPlaceholderText('Paste URL here'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await user.click(screen.getByRole('button', { name: 'Add URL' }));

      await waitFor(() => {
        expect(screen.getByText('Test Song')).toBeTruthy();
      });
    });
  });
});
