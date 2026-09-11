'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  Plus,
  Volume2,
  VolumeX,
  Volume1,
  Clock,
  Link,
  Upload,
  Shuffle,
  Edit2,
  X,
  Check,
  Home,
} from 'lucide-react';

// Types
interface Song {
  id: string;
  title: string;
  type: 'youtube' | 'audio';
  url: string;
  videoId?: string;
}

interface TimeSlot {
  id: string;
  startTime: string;
  stopTime: string;
}

interface Schedule {
  id: string;
  timeSlots: TimeSlot[];
  isPlaying: boolean;
}

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  loadVideoById: (videoId: string) => void;
  setVolume: (volume: number) => void;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
  // Additional methods for ad detection
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getVideoData: () => { video_id?: string; title?: string };
  getVideoUrl: () => string;
}

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          height: string;
          width: string;
          videoId: string;
          playerVars: Record<string, number>;
          events: {
            onReady: (event: { target: YouTubePlayer }) => void;
            onStateChange: (event: { data: number }) => void;
          };
        }
      ) => YouTubePlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

const STORAGE_KEY = 'musicscheduler_playlist';
const SCHEDULES_STORAGE_KEY = 'musicscheduler_schedules';
const ACTIVE_SCHEDULE_KEY = 'musicscheduler_active_schedule';

const DEFAULT_SCHEDULES: Schedule[] = [
  { id: 'schedule-1', timeSlots: [{ id: 'slot-1a', startTime: '08:00', stopTime: '08:30' }], isPlaying: false },
  { id: 'schedule-2', timeSlots: [{ id: 'slot-2a', startTime: '09:00', stopTime: '09:30' }], isPlaying: false },
];

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function extractVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = trimmedUrl.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export default function MusicScheduler() {
  // State
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<Song[]>([]);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(DEFAULT_SCHEDULES);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState<0 | 1>(0);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [showAddMusic, setShowAddMusic] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ scheduleId: string; slotId: string } | null>(null);
  const [editSlotStart, setEditSlotStart] = useState('');
  const [editSlotStop, setEditSlotStop] = useState('');
  const [addingToScheduleId, setAddingToScheduleId] = useState<string | null>(null);
  const [newSlotStart, setNewSlotStart] = useState('08:00');
  const [newSlotStop, setNewSlotStop] = useState('08:30');
  const [ytApiReady, setYtApiReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // Ad muting and skipping state
  const [isAdMuted, setIsAdMuted] = useState(false);
  const expectedVideoIdRef = useRef<string | null>(null);
  const adSkipAttemptRef = useRef<number>(0); // Track skip attempts to avoid loops
  const lastAdDetectedTimeRef = useRef<number>(0); // Debounce ad detection

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playlistRef = useRef<Song[]>([]); // Keep current playlist in ref for schedule checker
  const activeScheduleIndexRef = useRef<0 | 1>(0); // Keep active schedule index in ref for schedule checker

  const activePlaylist = isShuffleEnabled ? shuffledPlaylist : playlist;
  const currentSong = currentSongIndex >= 0 && currentSongIndex < activePlaylist.length
    ? activePlaylist[currentSongIndex]
    : null;

  // Load playlist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const songs = JSON.parse(saved) as Song[];
        setPlaylist(songs);
        setShuffledPlaylist(shuffleArray(songs));
      } catch (e) {
        console.error('Failed to load playlist:', e);
      }
    }
  }, []);

  // Save playlist to localStorage and keep ref in sync
  useEffect(() => {
    playlistRef.current = playlist;
    if (playlist.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [playlist]);

  // Load schedules + active index from localStorage (migrates old startTime/stopTime format)
  useEffect(() => {
    const saved = localStorage.getItem(SCHEDULES_STORAGE_KEY);
    if (saved) {
      try {
        const savedSchedules = JSON.parse(saved) as any[];
        const two: Schedule[] = [0, 1].map((i) => {
          const s = savedSchedules[i];
          if (!s) return DEFAULT_SCHEDULES[i];
          // Migrate old single-slot format
          if (s.startTime && !s.timeSlots) {
            return { id: s.id || DEFAULT_SCHEDULES[i].id, timeSlots: [{ id: generateId(), startTime: s.startTime, stopTime: s.stopTime }], isPlaying: false };
          }
          return { ...DEFAULT_SCHEDULES[i], ...s, isPlaying: false };
        });
        setSchedules(two);
      } catch (e) {
        console.error('Failed to load schedules:', e);
      }
    }
    const savedIdx = localStorage.getItem(ACTIVE_SCHEDULE_KEY);
    if (savedIdx === '1') {
      setActiveScheduleIndex(1);
      activeScheduleIndexRef.current = 1;
    }
  }, []);

  // Save schedules to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(SCHEDULES_STORAGE_KEY, JSON.stringify(schedules));
  }, [schedules]);

  // Sync activeScheduleIndex to ref and persist
  useEffect(() => {
    activeScheduleIndexRef.current = activeScheduleIndex;
    localStorage.setItem(ACTIVE_SCHEDULE_KEY, String(activeScheduleIndex));
  }, [activeScheduleIndex]);

  // Update current time display every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours() % 12 || 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      const period = now.getHours() >= 12 ? 'PM' : 'AM';
      setCurrentTime(`${hours}:${minutes}:${seconds} ${period}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => setYtApiReady(true);
    } else if (window.YT) {
      setYtApiReady(true);
    }
  }, []);

  // Track audio progress
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleTimeUpdate);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleTimeUpdate);
    };
  }, []);

  // Track YouTube video progress and detect ads
  useEffect(() => {
    if (!isPlaying || currentSong?.type !== 'youtube') return;

    const updateYoutubeProgress = () => {
      if (ytPlayerRef.current) {
        try {
          const currentTime = ytPlayerRef.current.getCurrentTime();
          const totalDuration = ytPlayerRef.current.getDuration();
          if (currentTime !== undefined && totalDuration !== undefined) {
            setProgress(currentTime);
            setDuration(totalDuration);
          }
        } catch (e) {
          // Player not ready yet
        }
      }
    };

    // Ad detection: Check if currently playing video matches expected video
    const checkForAds = () => {
      if (!ytPlayerRef.current || !expectedVideoIdRef.current) return;

      try {
        // Method 1: Check video data for mismatched video ID
        const videoData = ytPlayerRef.current.getVideoData();
        const currentVideoId = videoData?.video_id;

        // Method 2: Check the video URL for ad indicators
        const videoUrl = ytPlayerRef.current.getVideoUrl();
        const isAdUrl = videoUrl?.includes('&ad_') || videoUrl?.includes('googlevideo.com');

        // Method 3: Check if duration is suspiciously short (ads are typically < 30 seconds)
        // But only use this if we've already loaded the expected video once
        const currentDuration = ytPlayerRef.current.getDuration();
        const isSuspiciouslyShort = currentDuration > 0 && currentDuration < 30;

        // Determine if an ad is playing
        const adDetected =
          (currentVideoId && currentVideoId !== expectedVideoIdRef.current) ||
          isAdUrl ||
          (isSuspiciouslyShort && currentVideoId !== expectedVideoIdRef.current);

        const now = Date.now();

        if (adDetected && !isAdMuted) {
          // Ad detected - mute the player immediately
          ytPlayerRef.current.mute();
          setIsAdMuted(true);
          console.log('[Ad Handler] Ad detected, muting audio');

          // Attempt to skip the ad by reloading the video
          // Only try if we haven't attempted recently (debounce 3 seconds)
          // and haven't exceeded max attempts (3 per song)
          if (
            now - lastAdDetectedTimeRef.current > 3000 &&
            adSkipAttemptRef.current < 3
          ) {
            lastAdDetectedTimeRef.current = now;
            adSkipAttemptRef.current += 1;
            console.log(`[Ad Handler] Attempting to skip ad (attempt ${adSkipAttemptRef.current}/3)`);

            // Wait a moment then try to reload the video to skip the ad
            setTimeout(() => {
              if (ytPlayerRef.current && expectedVideoIdRef.current) {
                ytPlayerRef.current.loadVideoById(expectedVideoIdRef.current);
                ytPlayerRef.current.playVideo();
              }
            }, 500);
          }
        } else if (!adDetected && isAdMuted) {
          // Ad ended - unmute the player and restore volume
          ytPlayerRef.current.unMute();
          ytPlayerRef.current.setVolume(volume);
          setIsAdMuted(false);
          // Reset skip attempts when ad ends successfully
          adSkipAttemptRef.current = 0;
          console.log('[Ad Handler] Ad ended, unmuting audio');
        } else if (!adDetected && !isAdMuted) {
          // No ad playing, reset attempts counter
          adSkipAttemptRef.current = 0;
        }
      } catch (e) {
        // Player not ready or method not available
      }
    };

    // Poll every 500ms for YouTube progress and ad detection
    const interval = setInterval(() => {
      updateYoutubeProgress();
      checkForAds();
    }, 500);

    updateYoutubeProgress(); // Initial call

    return () => clearInterval(interval);
  }, [isPlaying, currentSong, isAdMuted, volume]);

  // Schedule checker - runs every 10 seconds, only fires for the active schedule
  useEffect(() => {
    const checkSchedules = () => {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentPlaylist = playlistRef.current;
      const activeIdx = activeScheduleIndexRef.current;

      console.log(`[Scheduler] Checking at ${currentTimeStr}, active: Schedule ${activeIdx + 1}`);

      setSchedules((prevSchedules) => {
        let shouldStartPlaying = false;
        let shouldStopPlaying = false;

        const updatedSchedules = prevSchedules.map((schedule, idx) => {
          const isActive = idx === activeIdx;
          const shouldPlay = isActive && schedule.timeSlots.some(
            (slot) => currentTimeStr >= slot.startTime && currentTimeStr < slot.stopTime
          );

          if (shouldPlay && !schedule.isPlaying && currentPlaylist.length > 0) {
            console.log(`[Scheduler] TRIGGER START: Schedule ${idx + 1}`);
            shouldStartPlaying = true;
            return { ...schedule, isPlaying: true };
          } else if (schedule.isPlaying && (!isActive || !shouldPlay)) {
            console.log(`[Scheduler] TRIGGER STOP: Schedule ${idx + 1}`);
            shouldStopPlaying = true;
            return { ...schedule, isPlaying: false };
          }
          return schedule;
        });

        if (shouldStartPlaying) {
          ytPlayerRef.current?.pauseVideo();
          audioRef.current?.pause();
          setTimeout(() => {
            const freshShuffle = shuffleArray(currentPlaylist);
            setShuffledPlaylist(freshShuffle);
            setIsShuffleEnabled(true);
            setCurrentSongIndex(0);
            setProgress(0);
            setDuration(0);
            setTimeout(() => setIsPlaying(true), 200);
          }, 100);
        }

        if (shouldStopPlaying) {
          setTimeout(() => {
            setIsPlaying(false);
            ytPlayerRef.current?.pauseVideo();
            audioRef.current?.pause();
          }, 100);
        }

        return updatedSchedules;
      });
    };

    scheduleCheckIntervalRef.current = setInterval(checkSchedules, 10000);
    setTimeout(checkSchedules, 1000);

    return () => {
      if (scheduleCheckIntervalRef.current) clearInterval(scheduleCheckIntervalRef.current);
    };
  }, []); // Runs once; uses refs for live values

  // Play current song
  useEffect(() => {
    if (!currentSong || !isPlaying) return;

    if (currentSong.type === 'youtube' && currentSong.videoId) {
      audioRef.current?.pause();

      // Store the expected video ID for ad detection
      expectedVideoIdRef.current = currentSong.videoId;

      // Reset ad muted state and skip attempts when changing songs
      setIsAdMuted(false);
      adSkipAttemptRef.current = 0;
      lastAdDetectedTimeRef.current = 0;

      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(currentSong.videoId);
        ytPlayerRef.current.unMute(); // Ensure unmuted when starting new song
        ytPlayerRef.current.setVolume(volume);
        ytPlayerRef.current.playVideo();
      } else if (ytApiReady && ytContainerRef.current) {
        ytPlayerRef.current = new window.YT.Player('youtube-player', {
          height: '0',
          width: '0',
          videoId: currentSong.videoId,
          playerVars: { autoplay: 1, controls: 0 },
          events: {
            onReady: (event) => {
              event.target.setVolume(volume);
              event.target.playVideo();
            },
            onStateChange: (event) => {
              if (event.data === window.YT.PlayerState.ENDED) playNextSong();
            },
          },
        });
      }
    } else if (currentSong.type === 'audio') {
      ytPlayerRef.current?.pauseVideo();
      expectedVideoIdRef.current = null; // Clear expected video ID for audio files
      setIsAdMuted(false);
      if (audioRef.current) {
        audioRef.current.src = currentSong.url;
        audioRef.current.volume = volume / 100;
        audioRef.current.play();
      }
    }
  }, [currentSong, isPlaying, ytApiReady]);

  // Update volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
    if (ytPlayerRef.current) ytPlayerRef.current.setVolume(volume);
  }, [volume]);

  const playNextSong = useCallback(() => {
    if (activePlaylist.length === 0) return;
    setCurrentSongIndex((prev) => (prev + 1) % activePlaylist.length);
  }, [activePlaylist.length]);

  const playPrevSong = useCallback(() => {
    if (activePlaylist.length === 0) return;
    setCurrentSongIndex((prev) => prev <= 0 ? activePlaylist.length - 1 : prev - 1);
  }, [activePlaylist.length]);

  const handleAudioEnded = useCallback(() => playNextSong(), [playNextSong]);

  const togglePlayPause = () => {
    if (activePlaylist.length === 0) return;

    if (currentSongIndex === -1) {
      setCurrentSongIndex(0);
      setIsPlaying(true);
      return;
    }

    if (isPlaying) {
      currentSong?.type === 'youtube' ? ytPlayerRef.current?.pauseVideo() : audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      currentSong?.type === 'youtube' ? ytPlayerRef.current?.playVideo() : audioRef.current?.play();
      setIsPlaying(true);
    }
  };

  const playSong = (index: number) => {
    setCurrentSongIndex(index);
    setIsPlaying(true);
  };

  const toggleShuffle = () => {
    if (!isShuffleEnabled) {
      const freshShuffle = shuffleArray(playlist);
      setShuffledPlaylist(freshShuffle);
      if (currentSong) {
        const newIndex = freshShuffle.findIndex((s) => s.id === currentSong.id);
        if (newIndex !== -1) setCurrentSongIndex(newIndex);
      }
    } else {
      if (currentSong) {
        const newIndex = playlist.findIndex((s) => s.id === currentSong.id);
        if (newIndex !== -1) setCurrentSongIndex(newIndex);
      }
    }
    setIsShuffleEnabled(!isShuffleEnabled);
  };

  // Fetch YouTube video title using noembed (CORS-friendly)
  const fetchYoutubeTitle = async (videoId: string): Promise<string> => {
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          return data.title;
        }
      }
    } catch (error) {
      console.error('Failed to fetch YouTube title:', error);
    }
    return `YouTube Video (${videoId})`;
  };

  const addYoutubeUrl = async () => {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      alert('Invalid YouTube URL');
      return;
    }

    setIsAddingUrl(true);
    const title = await fetchYoutubeTitle(videoId);

    const newSong: Song = {
      id: generateId(),
      title,
      type: 'youtube',
      url: youtubeUrl,
      videoId,
    };
    setPlaylist((prev) => [...prev, newSong]);
    setShuffledPlaylist((prev) => [...prev, newSong]);
    setYoutubeUrl('');
    setIsAddingUrl(false);
  };

  const addBulkUrls = async () => {
    const urls = bulkUrls.split('\n').filter((url) => url.trim());
    const validUrls = urls.map((url) => {
      const videoId = extractVideoId(url.trim());
      return videoId ? { url: url.trim(), videoId } : null;
    }).filter(Boolean) as { url: string; videoId: string }[];

    if (validUrls.length === 0) {
      alert('No valid YouTube URLs found');
      return;
    }

    setIsAddingUrl(true);

    // Fetch all titles in parallel
    const newSongs: Song[] = await Promise.all(
      validUrls.map(async ({ url, videoId }) => {
        const title = await fetchYoutubeTitle(videoId);
        return {
          id: generateId(),
          title,
          type: 'youtube' as const,
          url,
          videoId,
        };
      })
    );

    setPlaylist((prev) => [...prev, ...newSongs]);
    setShuffledPlaylist((prev) => shuffleArray([...prev, ...newSongs]));
    setBulkUrls('');
    setShowBulkInput(false);
    setIsAddingUrl(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newSongs: Song[] = Array.from(files)
      .filter((file) => file.type.startsWith('audio/'))
      .map((file) => ({
        id: generateId(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        type: 'audio' as const,
        url: URL.createObjectURL(file),
      }));

    if (newSongs.length > 0) {
      setPlaylist((prev) => [...prev, ...newSongs]);
      setShuffledPlaylist((prev) => shuffleArray([...prev, ...newSongs]));
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeSong = (songId: string) => {
    const songToRemove = playlist.find((s) => s.id === songId);

    if (currentSong?.id === songId) {
      setIsPlaying(false);
      ytPlayerRef.current?.pauseVideo();
      audioRef.current?.pause();
      setCurrentSongIndex(-1);
    }

    setPlaylist((prev) => prev.filter((s) => s.id !== songId));
    setShuffledPlaylist((prev) => prev.filter((s) => s.id !== songId));

    if (songToRemove?.type === 'audio' && songToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(songToRemove.url);
    }
  };

  // Slot CRUD
  const startEditSlot = (scheduleId: string, slot: TimeSlot) => {
    setEditingSlot({ scheduleId, slotId: slot.id });
    setEditSlotStart(slot.startTime);
    setEditSlotStop(slot.stopTime);
    setAddingToScheduleId(null);
  };

  const saveEditSlot = () => {
    if (!editingSlot) return;
    if (editSlotStart >= editSlotStop) { alert('Stop time must be after start time'); return; }
    setSchedules((prev) => prev.map((s) =>
      s.id === editingSlot.scheduleId
        ? { ...s, timeSlots: s.timeSlots.map((slot) =>
            slot.id === editingSlot.slotId ? { ...slot, startTime: editSlotStart, stopTime: editSlotStop } : slot
          )}
        : s
    ));
    setEditingSlot(null);
  };

  const deleteSlot = (scheduleId: string, slotId: string) => {
    setSchedules((prev) => prev.map((s) =>
      s.id === scheduleId ? { ...s, timeSlots: s.timeSlots.filter((slot) => slot.id !== slotId) } : s
    ));
  };

  const startAddSlot = (scheduleId: string) => {
    setAddingToScheduleId(scheduleId);
    setNewSlotStart('08:00');
    setNewSlotStop('08:30');
    setEditingSlot(null);
  };

  const saveNewSlot = () => {
    if (!addingToScheduleId) return;
    if (newSlotStart >= newSlotStop) { alert('Stop time must be after start time'); return; }
    setSchedules((prev) => prev.map((s) =>
      s.id === addingToScheduleId
        ? { ...s, timeSlots: [...s.timeSlots, { id: generateId(), startTime: newSlotStart, stopTime: newSlotStop }] }
        : s
    ));
    setAddingToScheduleId(null);
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <VolumeX className="w-4 h-4" />;
    if (volume < 50) return <Volume1 className="w-4 h-4" />;
    return <Volume2 className="w-4 h-4" />;
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const to12Hour = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * duration;
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
      <div ref={ytContainerRef} id="youtube-player" className="hidden" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="sidebar-desktop w-[240px] bg-black flex flex-col flex-shrink-0 border-r border-[#262626]">
          {/* Header */}
          <div className="p-6 pb-4">
            <h1 className="text-xl font-semibold text-white tracking-tight">Music Scheduler</h1>
            <p className="text-[#666] text-sm mt-1">{playlist.length} tracks</p>
          </div>

          {/* Add Music button */}
          <div className="px-4 mb-4">
            <button
              onClick={() => setShowAddMusic(!showAddMusic)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                showAddMusic
                  ? 'bg-white text-black'
                  : 'bg-[#111] border border-[#262626] text-[#a1a1a1] hover:text-white hover:border-[#404040]'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Add Music</span>
            </button>
          </div>

          <div className="w-full h-px bg-[#262626]" />

          {/* Song list */}
          <div className="flex-1 overflow-y-auto px-2 py-3">
            {playlist.map((song, i) => (
              <div
                key={song.id}
                className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all mb-1 cursor-pointer ${
                  currentSong?.id === song.id
                    ? 'bg-[#171717] text-white'
                    : 'text-[#888] hover:text-white hover:bg-[#111]'
                }`}
                onClick={() => playSong(i)}
              >
                <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 overflow-hidden ${
                  currentSong?.id === song.id ? 'bg-[#0070f3]' : 'bg-[#1a1a1a]'
                }`}>
                  {song.type === 'youtube' && song.videoId ? (
                    <img
                      src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className="w-4 h-4" />
                  )}
                </div>
                <span className="text-sm truncate flex-1 text-left">{song.title}</span>
                {currentSong?.id === song.id && isPlaying ? (
                  <div className="flex items-end gap-0.5 h-3">
                    <div className="w-0.5 bg-[#0070f3] equalizer-bar" />
                    <div className="w-0.5 bg-[#0070f3] equalizer-bar" />
                    <div className="w-0.5 bg-[#0070f3] equalizer-bar" />
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSong(song.id); }}
                    className="p-1 text-[#666] hover:text-[#f31260] opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Add Music Panel */}
        {showAddMusic && (
          <div className="w-[320px] bg-[#0a0a0a] border-r border-[#262626] flex flex-col flex-shrink-0">
            <div className="p-6 border-b border-[#262626] flex items-center justify-between">
              <h3 className="text-white font-semibold">Add Music</h3>
              <button onClick={() => setShowAddMusic(false)} className="text-[#666] hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* YouTube URL */}
              <div>
                <label className="text-[#888] text-xs uppercase tracking-wider block mb-3">YouTube URL</label>
                <div className="relative">
                  <Link className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addYoutubeUrl()}
                    placeholder="Paste URL here"
                    className="w-full pl-11 pr-4 py-3 bg-[#111] border border-[#262626] text-white text-sm placeholder-[#666] rounded-lg focus:outline-none focus:border-[#0070f3] transition-colors"
                  />
                </div>
                <button
                  onClick={addYoutubeUrl}
                  disabled={isAddingUrl}
                  className="w-full mt-3 py-3 bg-white hover:bg-[#e5e5e5] disabled:bg-[#333] disabled:text-[#666] text-black font-medium text-sm rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {isAddingUrl ? 'Adding...' : 'Add URL'}
                </button>
              </div>

              {/* Bulk */}
              <button
                onClick={() => setShowBulkInput(!showBulkInput)}
                className="w-full py-2 text-[#666] hover:text-white text-sm transition-colors text-left flex items-center gap-2"
              >
                <span className="text-lg">{showBulkInput ? '−' : '+'}</span>
                Bulk Add URLs
              </button>

              {showBulkInput && (
                <div className="space-y-3">
                  <textarea
                    value={bulkUrls}
                    onChange={(e) => setBulkUrls(e.target.value)}
                    placeholder="One URL per line"
                    rows={4}
                    className="w-full p-4 bg-[#111] border border-[#262626] text-white text-sm placeholder-[#666] rounded-lg focus:outline-none focus:border-[#0070f3] resize-none transition-colors"
                  />
                  <button
                    onClick={addBulkUrls}
                    disabled={isAddingUrl}
                    className="w-full py-3 bg-[#1a1a1a] border border-[#262626] hover:border-[#404040] disabled:opacity-50 text-white text-sm rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {isAddingUrl ? 'Adding...' : 'Add All URLs'}
                  </button>
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="text-[#888] text-xs uppercase tracking-wider block mb-3">Upload Files</label>
                <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 flex items-center justify-center gap-2 bg-[#111] border border-[#262626] border-dashed hover:border-[#404040] text-[#888] hover:text-white text-sm rounded-lg transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choose Files
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 bg-[#0a0a0a] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* Hero Section */}
            <div className="relative border-b border-[#262626]">
              <div className="absolute inset-0 bg-gradient-to-b from-[#111] to-[#0a0a0a]" />

              <div className="relative p-8 pt-12">
                <div className="flex items-start gap-8">
                  {/* Album Art */}
                  <div className="w-[180px] h-[180px] bg-[#111] border border-[#262626] rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden group">
                    {currentSong?.type === 'youtube' && currentSong.videoId ? (
                      <img
                        src={`https://img.youtube.com/vi/${currentSong.videoId}/mqdefault.jpg`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#0070f3] to-[#00a2ff] flex items-center justify-center">
                        <Music className="w-16 h-16 text-white/80" />
                      </div>
                    )}
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="flex items-end gap-1 h-8">
                          <div className="w-1 bg-white equalizer-bar rounded-full" />
                          <div className="w-1 bg-white equalizer-bar rounded-full" />
                          <div className="w-1 bg-white equalizer-bar rounded-full" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pt-4">
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-xs font-medium text-[#0070f3] uppercase tracking-wider">Now Playing</p>
                      {/* Ad muted indicator */}
                      {isAdMuted && (
                        <span className="px-2 py-0.5 bg-[#f31260] text-white text-xs font-medium rounded-full flex items-center gap-1 animate-pulse">
                          <VolumeX className="w-3 h-3" />
                          Ad Muted
                        </span>
                      )}
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 truncate">
                      {currentSong?.title || 'Select a track'}
                    </h1>
                    <p className="text-[#666] text-sm mb-6">
                      {currentSong ? (currentSong.type === 'youtube' ? 'YouTube' : 'Audio File') : 'No track selected'}
                    </p>

                    {/* Controls */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlayPause}
                        className="w-12 h-12 bg-white hover:bg-[#e5e5e5] rounded-full flex items-center justify-center transition-all hover:scale-105"
                      >
                        {isPlaying ? (
                          <Pause className="w-5 h-5 text-black" fill="black" />
                        ) : (
                          <Play className="w-5 h-5 text-black ml-0.5" fill="black" />
                        )}
                      </button>

                      <button
                        onClick={playPrevSong}
                        className="w-10 h-10 bg-[#1a1a1a] border border-[#262626] hover:border-[#404040] rounded-full flex items-center justify-center transition-colors"
                      >
                        <SkipBack className="w-4 h-4 text-white" fill="white" />
                      </button>

                      <button
                        onClick={playNextSong}
                        className="w-10 h-10 bg-[#1a1a1a] border border-[#262626] hover:border-[#404040] rounded-full flex items-center justify-center transition-colors"
                      >
                        <SkipForward className="w-4 h-4 text-white" fill="white" />
                      </button>

                      <button
                        onClick={toggleShuffle}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          isShuffleEnabled
                            ? 'bg-[#0070f3] text-white'
                            : 'bg-[#1a1a1a] border border-[#262626] hover:border-[#404040] text-[#888]'
                        }`}
                      >
                        <Shuffle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-8 flex items-center gap-3">
                  <span className="text-[#666] text-xs w-10 text-right font-mono">{formatTime(progress)}</span>
                  <div
                    className="flex-1 h-1 bg-[#262626] rounded-full relative group cursor-pointer"
                    onClick={handleSeek}
                  >
                    <div className="absolute inset-y-0 left-0 bg-white rounded-full transition-colors" style={{ width: `${progressPercent}%` }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" style={{ left: `calc(${progressPercent}% - 6px)` }} />
                  </div>
                  <span className="text-[#666] text-xs w-10 font-mono">{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Schedules Section */}
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-semibold text-white">Schedules</h2>
                  <span className="px-3 py-1 bg-[#0070f3] text-white text-sm font-mono rounded-lg">
                    {currentTime}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {schedules.map((schedule, idx) => {
                  const isActive = idx === activeScheduleIndex;
                  const isAddingHere = addingToScheduleId === schedule.id;

                  return (
                    <div
                      key={schedule.id}
                      className={`vercel-card p-5 transition-all ${
                        isActive ? 'ring-2 ring-[#0070f3] ring-offset-2 ring-offset-[#0a0a0a]' : ''
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[#666] text-xs uppercase tracking-wider font-medium">
                            Schedule {idx + 1}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 bg-[#0070f3] text-white text-xs font-medium rounded-full">
                              ACTIVE
                            </span>
                          )}
                          {schedule.isPlaying && (
                            <span className="px-2 py-0.5 bg-[#00d68f] text-black text-xs font-medium rounded-full">
                              LIVE
                            </span>
                          )}
                        </div>
                        {!isActive && (
                          <button
                            onClick={() => setActiveScheduleIndex(idx as 0 | 1)}
                            className="px-3 py-1 bg-[#0070f3] hover:bg-[#005fd4] rounded-full text-white text-xs font-medium transition-colors"
                          >
                            Use This
                          </button>
                        )}
                      </div>

                      {/* Time slots list */}
                      <div className="space-y-2 mb-3">
                        {schedule.timeSlots.length === 0 && (
                          <p className="text-[#444] text-sm text-center py-2">No time slots</p>
                        )}
                        {schedule.timeSlots.map((slot) => {
                          const isEditingSlot = editingSlot?.scheduleId === schedule.id && editingSlot?.slotId === slot.id;
                          if (isEditingSlot) {
                            return (
                              <div key={slot.id} className="p-3 bg-[#111] border border-[#262626] rounded-lg space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="time"
                                    value={editSlotStart}
                                    onChange={(e) => setEditSlotStart(e.target.value)}
                                    className="flex-1 px-2 py-1.5 bg-[#0a0a0a] border border-[#262626] text-white text-sm rounded-lg focus:outline-none focus:border-[#0070f3]"
                                  />
                                  <span className="text-[#666] text-xs">to</span>
                                  <input
                                    type="time"
                                    value={editSlotStop}
                                    onChange={(e) => setEditSlotStop(e.target.value)}
                                    className="flex-1 px-2 py-1.5 bg-[#0a0a0a] border border-[#262626] text-white text-sm rounded-lg focus:outline-none focus:border-[#0070f3]"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={saveEditSlot} className="flex-1 py-1.5 bg-white text-black text-sm rounded-lg hover:bg-[#e5e5e5] transition-colors">Save</button>
                                  <button onClick={() => setEditingSlot(null)} className="flex-1 py-1.5 bg-[#262626] text-white text-sm rounded-lg hover:bg-[#333] transition-colors">Cancel</button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div key={slot.id} className="group flex items-center justify-between px-3 py-2.5 bg-[#111] border border-[#262626] rounded-lg">
                              <span className="text-white text-sm font-medium">
                                {to12Hour(slot.startTime)} – {to12Hour(slot.stopTime)}
                              </span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => startEditSlot(schedule.id, slot)}
                                  className="p-1.5 text-[#666] hover:text-white transition-colors rounded"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteSlot(schedule.id, slot.id)}
                                  className="p-1.5 text-[#666] hover:text-[#f31260] transition-colors rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add slot form or button */}
                      {isAddingHere ? (
                        <div className="p-3 bg-[#111] border border-[#262626] rounded-lg space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={newSlotStart}
                              onChange={(e) => setNewSlotStart(e.target.value)}
                              className="flex-1 px-2 py-1.5 bg-[#0a0a0a] border border-[#262626] text-white text-sm rounded-lg focus:outline-none focus:border-[#0070f3]"
                            />
                            <span className="text-[#666] text-xs">to</span>
                            <input
                              type="time"
                              value={newSlotStop}
                              onChange={(e) => setNewSlotStop(e.target.value)}
                              className="flex-1 px-2 py-1.5 bg-[#0a0a0a] border border-[#262626] text-white text-sm rounded-lg focus:outline-none focus:border-[#0070f3]"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveNewSlot} className="flex-1 py-1.5 bg-white text-black text-sm rounded-lg hover:bg-[#e5e5e5] transition-colors">Add</button>
                            <button onClick={() => setAddingToScheduleId(null)} className="flex-1 py-1.5 bg-[#262626] text-white text-sm rounded-lg hover:bg-[#333] transition-colors">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startAddSlot(schedule.id)}
                          className="w-full py-2 border border-dashed border-[#262626] hover:border-[#404040] text-[#666] hover:text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add time slot
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-24" />
          </div>
        </main>
      </div>

      {/* Bottom Player Bar */}
      <footer className="h-[72px] bg-black border-t border-[#262626] flex items-center px-6 flex-shrink-0">
        {/* Left: Now playing */}
        <div className="w-[30%] min-w-[180px] flex items-center gap-3">
          {currentSong ? (
            <>
              <div className="w-12 h-12 bg-[#111] border border-[#262626] rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                {currentSong.type === 'youtube' && currentSong.videoId ? (
                  <img
                    src={`https://img.youtube.com/vi/${currentSong.videoId}/mqdefault.jpg`}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-5 h-5 text-[#666]" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
                  {isAdMuted && (
                    <span className="px-1.5 py-0.5 bg-[#f31260] text-white text-[10px] font-medium rounded flex items-center gap-1">
                      <VolumeX className="w-2.5 h-2.5" />
                      AD
                    </span>
                  )}
                </div>
                <p className="text-[#666] text-xs truncate">{currentSong.type === 'youtube' ? 'YouTube' : 'Audio File'}</p>
              </div>
            </>
          ) : (
            <div className="text-[#666] text-sm">No track selected</div>
          )}
        </div>

        {/* Center: Mini Controls */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <button onClick={playPrevSong} className="p-2 text-[#666] hover:text-white transition-colors">
            <SkipBack className="w-4 h-4" fill="currentColor" />
          </button>
          <button onClick={togglePlayPause} className="w-10 h-10 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform">
            {isPlaying ? <Pause className="w-4 h-4 text-black" fill="black" /> : <Play className="w-4 h-4 text-black ml-0.5" fill="black" />}
          </button>
          <button onClick={playNextSong} className="p-2 text-[#666] hover:text-white transition-colors">
            <SkipForward className="w-4 h-4" fill="currentColor" />
          </button>
        </div>

        {/* Right: Volume */}
        <div className="w-[30%] min-w-[180px] flex items-center justify-end gap-3">
          <button onClick={() => setVolume(volume === 0 ? 70 : 0)} className="p-2 text-[#666] hover:text-white transition-colors">
            {getVolumeIcon()}
          </button>
          <div className="w-24 h-1 bg-[#262626] rounded-full relative group cursor-pointer">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="absolute inset-y-0 left-0 bg-white rounded-full pointer-events-none transition-colors" style={{ width: `${volume}%` }} />
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-xl z-50 border-t border-[#262626]">
        <div className="flex justify-around py-3">
          <button className="flex flex-col items-center gap-1 text-white">
            <Home className="w-5 h-5" />
            <span className="text-xs">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-[#666]" onClick={() => setShowAddMusic(true)}>
            <Plus className="w-5 h-5" />
            <span className="text-xs">Add</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-[#666]">
            <Clock className="w-5 h-5" />
            <span className="text-xs">Schedules</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
