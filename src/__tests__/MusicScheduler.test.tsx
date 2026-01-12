import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MusicScheduler from '../components/MusicScheduler';

// Mock the YouTube IFrame API
beforeAll(() => {
  (window as any).YT = {
    Player: jest.fn().mockImplementation(() => ({
      playVideo: jest.fn(),
      pauseVideo: jest.fn(),
      stopVideo: jest.fn(),
      loadVideoById: jest.fn(),
      setVolume: jest.fn(),
      getPlayerState: jest.fn(),
      destroy: jest.fn(),
    })),
    PlayerState: {
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
    },
  };
});

describe('MusicScheduler Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the header', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Music Scheduler')).toBeInTheDocument();
    });

    it('should render pre-loaded sample tracks', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Acoustic Breeze - Bensound')).toBeInTheDocument();
      expect(screen.getByText('Creative Minds - Bensound')).toBeInTheDocument();
      expect(screen.getByText('Happy Rock - Bensound')).toBeInTheDocument();
      expect(screen.getByText('Sunny - Bensound')).toBeInTheDocument();
    });

    it('should show 4 songs in playlist initially', () => {
      render(<MusicScheduler />);
      expect(screen.getByText(/Playlist \(4 songs\)/)).toBeInTheDocument();
    });

    it('should render Add Music section', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Add Music')).toBeInTheDocument();
    });

    it('should render Schedules section', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Schedules')).toBeInTheDocument();
    });

    it('should render Bluetooth Speaker Setup section', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Bluetooth Speaker Setup')).toBeInTheDocument();
    });
  });

  describe('YouTube URL Input', () => {
    it('should have a single YouTube URL input field', () => {
      render(<MusicScheduler />);
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');
      expect(input).toBeInTheDocument();
    });

    it('should update input value when typing', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(input).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('should add YouTube song when clicking Add button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      const addButton = screen.getAllByRole('button', { name: /add/i })[0];
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText(/Playlist \(5 songs\)/)).toBeInTheDocument();
      });
    });

    it('should add YouTube song when pressing Enter', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ{enter}');

      await waitFor(() => {
        expect(screen.getByText(/Playlist \(5 songs\)/)).toBeInTheDocument();
      });
    });

    it('should clear input after adding song', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ{enter}');

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('should show alert for invalid YouTube URL', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'not-a-valid-youtube-url');

      // Find and click the Add button in the form
      const form = input.closest('form');
      const addButton = form?.querySelector('button[type="submit"]');

      if (addButton) {
        await user.click(addButton);
      }

      await waitFor(() => {
        expect(global.alert).toHaveBeenCalledWith('Invalid YouTube URL');
      });
    });

    it('should display YouTube type badge for added YouTube songs', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('https://youtube.com/watch?v=...');

      await user.type(input, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ{enter}');

      await waitFor(() => {
        expect(screen.getByText('YouTube Video (dQw4w9WgXcQ)')).toBeInTheDocument();
      });
    });
  });

  describe('Bulk URL Input', () => {
    it('should have a bulk URL textarea', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Bulk YouTube URLs (one per line)')).toBeInTheDocument();
    });

    it('should add multiple songs from bulk input', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Find the textarea by placeholder text
      const bulkTextarea = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(bulkTextarea).toBeInTheDocument();

      await user.type(
        bulkTextarea,
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/9bZkp7q19f0'
      );

      const addAllButton = screen.getByRole('button', { name: /add all urls/i });
      await user.click(addAllButton);

      await waitFor(() => {
        expect(screen.getByText(/Playlist \(6 songs\)/)).toBeInTheDocument();
      });
    });
  });

  describe('Song Removal', () => {
    it('should remove song when clicking delete button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Verify we start with 4 songs
      expect(screen.getByText(/Playlist \(4 songs\)/)).toBeInTheDocument();

      // Find delete buttons by their parent containers
      const songItems = screen.getAllByText(/Bensound/).map(el => el.closest('[class*="rounded-lg cursor-pointer"]'));
      const deleteButton = songItems[0]?.querySelector('button');

      if (deleteButton) {
        await user.click(deleteButton);

        await waitFor(() => {
          expect(screen.getByText(/Playlist \(3 songs\)/)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Shuffle Functionality', () => {
    it('should have shuffle button', () => {
      render(<MusicScheduler />);
      expect(screen.getByRole('button', { name: /shuffle/i })).toBeInTheDocument();
    });

    it('should toggle shuffle state when clicking button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const shuffleButton = screen.getByRole('button', { name: /shuffle/i });

      await user.click(shuffleButton);

      expect(screen.getByRole('button', { name: /shuffled/i })).toBeInTheDocument();
    });

    it('should toggle back to unshuffled state', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();
      const shuffleButton = screen.getByRole('button', { name: /shuffle/i });

      await user.click(shuffleButton);
      const shuffledButton = screen.getByRole('button', { name: /shuffled/i });
      await user.click(shuffledButton);

      expect(screen.getByRole('button', { name: /shuffle/i })).toBeInTheDocument();
    });
  });

  describe('Schedule Creation', () => {
    it('should have schedule creation form', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Create New Schedule')).toBeInTheDocument();
    });

    it('should have start and stop time inputs', () => {
      render(<MusicScheduler />);
      expect(screen.getByText('Start Time')).toBeInTheDocument();
      expect(screen.getByText('Stop Time')).toBeInTheDocument();
    });

    it('should have repeat daily checkbox checked by default', () => {
      render(<MusicScheduler />);
      const checkbox = screen.getAllByRole('checkbox')[0];
      expect(checkbox).toBeChecked();
    });

    it('should create schedule when clicking Add Schedule button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByText('08:00 - 08:30')).toBeInTheDocument();
      });
    });

    it('should show Repeats Daily badge for repeating schedules', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByText(/Repeats Daily/)).toBeInTheDocument();
      });
    });

    it('should show song count in schedule', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByText(/Plays all 4 songs \(shuffled randomly\)/)).toBeInTheDocument();
      });
    });

    it('should show alert for invalid schedule times', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Get time inputs
      const timeInputs = screen.getAllByDisplayValue('08:00');
      const startInput = timeInputs[0];
      const stopInput = screen.getByDisplayValue('08:30');

      // Set stop time before start time
      await user.clear(stopInput);
      await user.type(stopInput, '07:00');

      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      expect(global.alert).toHaveBeenCalledWith('Stop time must be after start time');
    });
  });

  describe('Schedule Management', () => {
    it('should delete schedule when clicking delete button', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Create a schedule first
      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByText('08:00 - 08:30')).toBeInTheDocument();
      });

      // Find the schedule row and its delete button
      const scheduleTimeElement = screen.getByText('08:00 - 08:30');
      const scheduleRow = scheduleTimeElement.closest('[class*="bg-white/5 rounded-lg"]');
      const deleteButton = scheduleRow?.querySelector('button:last-of-type');

      if (deleteButton) {
        await user.click(deleteButton);

        await waitFor(() => {
          expect(screen.queryByText('08:00 - 08:30')).not.toBeInTheDocument();
        });
      }
    });

    it('should have Test Now button for each schedule', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Create a schedule
      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test now/i })).toBeInTheDocument();
      });
    });

    it('should start playing when clicking Test Now', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Create a schedule
      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test now/i })).toBeInTheDocument();
      });

      // Click Test Now
      const testNowButton = screen.getByRole('button', { name: /test now/i });
      await user.click(testNowButton);

      await waitFor(() => {
        // Should show Now Playing bar
        expect(screen.getByText('Now Playing')).toBeInTheDocument();
        // Should show Stop button instead of Test Now
        expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
      });
    });

    it('should stop playing when clicking Stop', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // Create a schedule
      const addScheduleButton = screen.getByRole('button', { name: /add schedule/i });
      await user.click(addScheduleButton);

      // Click Test Now
      const testNowButton = await screen.findByRole('button', { name: /test now/i });
      await user.click(testNowButton);

      // Wait for Stop button to appear
      const stopButton = await screen.findByRole('button', { name: /stop/i });
      await user.click(stopButton);

      await waitFor(() => {
        // Should show Test Now button again
        expect(screen.getByRole('button', { name: /test now/i })).toBeInTheDocument();
      });
    });
  });

  describe('Playback Controls', () => {
    it('should play song when clicking on it in playlist', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const song = screen.getByText('Acoustic Breeze - Bensound');
      await user.click(song);

      await waitFor(() => {
        expect(screen.getByText('Now Playing')).toBeInTheDocument();
      });
    });

    it('should show currently playing song title', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const song = screen.getByText('Acoustic Breeze - Bensound');
      await user.click(song);

      await waitFor(() => {
        // The title should appear in the now playing bar
        const nowPlayingSection = screen.getByText('Now Playing').parentElement;
        expect(nowPlayingSection).toHaveTextContent('Acoustic Breeze - Bensound');
      });
    });

    it('should have volume slider', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      // First click a song to show the now playing bar
      const song = screen.getByText('Acoustic Breeze - Bensound');
      await user.click(song);

      await waitFor(() => {
        const volumeSlider = screen.getByRole('slider');
        expect(volumeSlider).toBeInTheDocument();
        expect(volumeSlider).toHaveValue('70'); // Default volume
      });
    });
  });

  describe('Bluetooth Help Section', () => {
    it('should expand when clicking the header', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const bluetoothHeader = screen.getByText('Bluetooth Speaker Setup');
      await user.click(bluetoothHeader);

      await waitFor(() => {
        expect(screen.getByText('Windows')).toBeInTheDocument();
        expect(screen.getByText('Mac')).toBeInTheDocument();
        expect(screen.getByText('Mobile (iOS/Android)')).toBeInTheDocument();
      });
    });

    it('should have Test Audio button when expanded', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const bluetoothHeader = screen.getByText('Bluetooth Speaker Setup');
      await user.click(bluetoothHeader);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test audio/i })).toBeInTheDocument();
      });
    });

    it('should collapse when clicking header again', async () => {
      render(<MusicScheduler />);
      const user = userEvent.setup();

      const bluetoothHeader = screen.getByText('Bluetooth Speaker Setup');
      await user.click(bluetoothHeader);

      await waitFor(() => {
        expect(screen.getByText('Windows')).toBeInTheDocument();
      });

      await user.click(bluetoothHeader);

      await waitFor(() => {
        expect(screen.queryByText('Windows')).not.toBeInTheDocument();
      });
    });
  });

  describe('File Upload', () => {
    it('should have file upload button', () => {
      render(<MusicScheduler />);
      expect(screen.getByText(/Click to upload MP3, WAV/)).toBeInTheDocument();
    });

    it('should have hidden file input', () => {
      render(<MusicScheduler />);
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', 'audio/*');
    });
  });
});
