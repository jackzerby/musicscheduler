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
  Search,
  Library,
  Repeat,
  Heart,
} from 'lucide-react';

// Types
interface Song {
  id: string;
  title: string;
  type: 'youtube' | 'audio';
  url: string;
  videoId?: string;
}

interface Schedule {
  id: string;
  startTime: string;
  stopTime: string;
  repeatDaily: boolean;
  isPlaying: boolean;
  previewVideoId?: string; // Thumbnail preview for the schedule
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

// Pre-loaded sample tracks
const SAMPLE_TRACKS: Omit<Song, 'id'>[] = [
  { title: 'Acoustic Breeze', type: 'audio', url: 'https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3' },
  { title: 'Creative Minds', type: 'audio', url: 'https://www.bensound.com/bensound-music/bensound-creativeminds.mp3' },
  { title: 'Happy Rock', type: 'audio', url: 'https://www.bensound.com/bensound-music/bensound-happyrock.mp3' },
  { title: 'Sunny', type: 'audio', url: 'https://www.bensound.com/bensound-music/bensound-sunny.mp3' },
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(70);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [showAddMusic, setShowAddMusic] = useState(false);
  const [newScheduleStart, setNewScheduleStart] = useState('08:00');
  const [newScheduleStop, setNewScheduleStop] = useState('08:30');
  const [newScheduleRepeat, setNewScheduleRepeat] = useState(true);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editScheduleStart, setEditScheduleStart] = useState('');
  const [editScheduleStop, setEditScheduleStop] = useState('');
  const [editScheduleRepeat, setEditScheduleRepeat] = useState(true);
  const [ytApiReady, setYtApiReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isAddingUrl, setIsAddingUrl] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scheduleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activePlaylist = isShuffleEnabled ? shuffledPlaylist : playlist;
  const currentSong = currentSongIndex >= 0 && currentSongIndex < activePlaylist.length
    ? activePlaylist[currentSongIndex]
    : null;

  // Initialize with sample tracks
  useEffect(() => {
    const initialSongs = SAMPLE_TRACKS.map((track) => ({ ...track, id: generateId() }));
    setPlaylist(initialSongs);
    setShuffledPlaylist(shuffleArray(initialSongs));
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

  // Track YouTube video progress
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

    // Poll every 500ms for YouTube progress
    const interval = setInterval(updateYoutubeProgress, 500);
    updateYoutubeProgress(); // Initial call

    return () => clearInterval(interval);
  }, [isPlaying, currentSong]);

  // Schedule checker
  useEffect(() => {
    const checkSchedules = () => {
      const now = new Date();
      const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      setSchedules((prevSchedules) => {
        return prevSchedules.map((schedule) => {
          const shouldPlay = currentTimeStr >= schedule.startTime && currentTimeStr < schedule.stopTime;

          if (shouldPlay && !schedule.isPlaying && playlist.length > 0) {
            // Stop current playback first
            ytPlayerRef.current?.pauseVideo();
            audioRef.current?.pause();

            // Reset and start fresh
            setProgress(0);
            setDuration(0);
            const freshShuffle = shuffleArray(playlist);
            setShuffledPlaylist(freshShuffle);
            setIsShuffleEnabled(true);
            setCurrentSongIndex(0);

            // Small delay then play
            setTimeout(() => setIsPlaying(true), 100);
            return { ...schedule, isPlaying: true };
          } else if (!shouldPlay && schedule.isPlaying) {
            setIsPlaying(false);
            ytPlayerRef.current?.pauseVideo();
            audioRef.current?.pause();
            return { ...schedule, isPlaying: false };
          }
          return schedule;
        });
      });
    };

    scheduleCheckIntervalRef.current = setInterval(checkSchedules, 60000);
    checkSchedules();

    return () => {
      if (scheduleCheckIntervalRef.current) clearInterval(scheduleCheckIntervalRef.current);
    };
  }, [playlist]);

  // Update schedules without preview thumbnails when YouTube videos are added
  useEffect(() => {
    const youtubeVideos = playlist.filter(s => s.type === 'youtube' && s.videoId);
    if (youtubeVideos.length === 0) return;

    setSchedules(prev => prev.map(schedule => {
      if (!schedule.previewVideoId) {
        const randomVideo = youtubeVideos[Math.floor(Math.random() * youtubeVideos.length)];
        return { ...schedule, previewVideoId: randomVideo.videoId };
      }
      return schedule;
    }));
  }, [playlist]);

  // Play current song
  useEffect(() => {
    if (!currentSong || !isPlaying) return;

    if (currentSong.type === 'youtube' && currentSong.videoId) {
      audioRef.current?.pause();

      if (ytPlayerRef.current) {
        ytPlayerRef.current.loadVideoById(currentSong.videoId);
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

  const addSchedule = () => {
    if (newScheduleStart >= newScheduleStop) {
      alert('Stop time must be after start time');
      return;
    }

    // Pick a random YouTube video for the preview thumbnail
    const youtubeVideos = playlist.filter(s => s.type === 'youtube' && s.videoId);
    const randomVideo = youtubeVideos.length > 0
      ? youtubeVideos[Math.floor(Math.random() * youtubeVideos.length)]
      : null;

    setSchedules((prev) => [...prev, {
      id: generateId(),
      startTime: newScheduleStart,
      stopTime: newScheduleStop,
      repeatDaily: newScheduleRepeat,
      isPlaying: false,
      previewVideoId: randomVideo?.videoId,
    }]);
    setNewScheduleStart('08:00');
    setNewScheduleStop('08:30');
    setNewScheduleRepeat(true);
  };

  const startEditSchedule = (schedule: Schedule) => {
    setEditingScheduleId(schedule.id);
    setEditScheduleStart(schedule.startTime);
    setEditScheduleStop(schedule.stopTime);
    setEditScheduleRepeat(schedule.repeatDaily);
  };

  const saveEditSchedule = () => {
    if (editScheduleStart >= editScheduleStop) {
      alert('Stop time must be after start time');
      return;
    }
    setSchedules((prev) => prev.map((s) =>
      s.id === editingScheduleId ? { ...s, startTime: editScheduleStart, stopTime: editScheduleStop, repeatDaily: editScheduleRepeat } : s
    ));
    setEditingScheduleId(null);
  };

  const deleteSchedule = (scheduleId: string) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (schedule?.isPlaying) {
      setIsPlaying(false);
      ytPlayerRef.current?.pauseVideo();
      audioRef.current?.pause();
    }
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
  };

  const testSchedule = (scheduleId: string) => {
    if (playlist.length === 0) {
      alert('No songs in playlist');
      return;
    }

    // Stop current playback first
    ytPlayerRef.current?.pauseVideo();
    audioRef.current?.pause();
    setIsPlaying(false);

    // Reset progress
    setProgress(0);
    setDuration(0);

    // Mark this schedule as playing
    setSchedules((prev) => prev.map((s) => ({ ...s, isPlaying: s.id === scheduleId })));

    // Create fresh shuffle and start from beginning
    const freshShuffle = shuffleArray(playlist);
    setShuffledPlaylist(freshShuffle);
    setIsShuffleEnabled(true);
    setCurrentSongIndex(0);

    // Small delay to ensure state updates, then play
    setTimeout(() => {
      setIsPlaying(true);
    }, 100);
  };

  const stopScheduleTest = (scheduleId: string) => {
    setSchedules((prev) => prev.map((s) => (s.id === scheduleId ? { ...s, isPlaying: false } : s)));
    setIsPlaying(false);
    ytPlayerRef.current?.pauseVideo();
    audioRef.current?.pause();
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

  const getScheduleStatus = (schedule: Schedule) => {
    if (schedule.isPlaying) return { label: 'ACTIVE', className: 'bg-[#FFAB91] text-black' };
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (currentTimeStr < schedule.startTime) return { label: 'SCHEDULED', className: 'bg-[#B3B3B3] text-black' };
    return { label: 'INACTIVE', className: 'bg-[#535353] text-white' };
  };

  // Get current playing song's thumbnail (for schedule cards)
  const getCurrentSongThumbnail = () => {
    if (currentSong?.type === 'youtube' && currentSong.videoId) {
      return `https://img.youtube.com/vi/${currentSong.videoId}/mqdefault.jpg`;
    }
    return null;
  };

  const currentSongThumbnail = getCurrentSongThumbnail();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = percent * duration;
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="h-screen flex flex-col bg-black font-spotify overflow-hidden">
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
      <div ref={ytContainerRef} id="youtube-player" className="hidden" />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="sidebar-desktop w-[72px] bg-black flex flex-col items-center py-2 flex-shrink-0 border-r border-[#282828]">
          {/* Add Music button */}
          <button
            onClick={() => setShowAddMusic(!showAddMusic)}
            className={`w-12 h-12 flex items-center justify-center rounded-md mb-2 transition-colors ${showAddMusic ? 'bg-[#282828] text-white' : 'text-[#B3B3B3] hover:text-white'}`}
            title="Add Music"
          >
            <Plus className="w-6 h-6" />
          </button>

          {/* Playlist icon */}
          <button className="w-12 h-12 flex items-center justify-center mb-1">
            <div className="w-12 h-12 bg-gradient-to-br from-[#450af5] to-[#c4efd9] rounded flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" fill="white" />
            </div>
          </button>

          <div className="w-8 h-px bg-[#282828] my-2" />

          {/* Song thumbnails */}
          <div className="flex-1 overflow-y-auto w-full px-2 space-y-2">
            {playlist.slice(0, 8).map((song, i) => (
              <button
                key={song.id}
                onClick={() => playSong(i)}
                className={`w-12 h-12 rounded flex items-center justify-center transition-colors mx-auto ${
                  currentSong?.id === song.id ? 'bg-[#FFAB91]' : 'bg-[#282828] hover:bg-[#3E3E3E]'
                }`}
                title={song.title}
              >
                <Music className={`w-5 h-5 ${currentSong?.id === song.id ? 'text-black' : 'text-[#B3B3B3]'}`} />
              </button>
            ))}
          </div>

          {/* Song count */}
          <div className="py-3 text-[#B3B3B3] text-xs text-center">
            {playlist.length}
          </div>
        </aside>

        {/* Add Music Panel */}
        {showAddMusic && (
          <div className="w-[280px] bg-[#121212] border-r border-[#282828] flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-[#282828] flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Add Music</h3>
              <button onClick={() => setShowAddMusic(false)} className="text-[#B3B3B3] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* YouTube URL */}
              <div>
                <label className="text-[#B3B3B3] text-xs uppercase tracking-wider block mb-2">YouTube URL</label>
                <div className="relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B3B3B3]" />
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addYoutubeUrl()}
                    placeholder="Paste URL here"
                    className="w-full pl-10 pr-3 py-2.5 bg-[#242424] text-white text-sm placeholder-[#B3B3B3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#FFAB91]"
                  />
                </div>
                <button
                  onClick={addYoutubeUrl}
                  disabled={isAddingUrl}
                  className="w-full mt-2 py-2.5 bg-[#FFAB91] hover:bg-[#FFCCBC] disabled:bg-[#FFAB91]/50 text-black font-semibold text-sm rounded-full transition-colors disabled:cursor-not-allowed"
                >
                  {isAddingUrl ? 'Adding...' : 'Add URL'}
                </button>
              </div>

              {/* Bulk */}
              <button
                onClick={() => setShowBulkInput(!showBulkInput)}
                className="w-full py-2 text-[#B3B3B3] hover:text-white text-sm transition-colors text-left"
              >
                {showBulkInput ? '- Hide Bulk Add' : '+ Bulk Add URLs'}
              </button>

              {showBulkInput && (
                <div className="space-y-2">
                  <textarea
                    value={bulkUrls}
                    onChange={(e) => setBulkUrls(e.target.value)}
                    placeholder="One URL per line"
                    rows={4}
                    className="w-full p-3 bg-[#242424] text-white text-sm placeholder-[#B3B3B3] rounded-md focus:outline-none focus:ring-2 focus:ring-[#FFAB91] resize-none"
                  />
                  <button
                    onClick={addBulkUrls}
                    disabled={isAddingUrl}
                    className="w-full py-2 bg-[#282828] hover:bg-[#3E3E3E] disabled:bg-[#282828]/50 text-white text-sm rounded-full transition-colors disabled:cursor-not-allowed"
                  >
                    {isAddingUrl ? 'Adding...' : 'Add All URLs'}
                  </button>
                </div>
              )}

              {/* File Upload */}
              <div>
                <label className="text-[#B3B3B3] text-xs uppercase tracking-wider block mb-2">Upload Files</label>
                <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 flex items-center justify-center gap-2 bg-[#242424] hover:bg-[#3E3E3E] text-white text-sm rounded-md transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choose Files
                </button>
              </div>

              {/* Sample Tracks */}
              <div>
                <label className="text-[#B3B3B3] text-xs uppercase tracking-wider block mb-2">Sample Tracks</label>
                <button
                  onClick={() => {
                    const newSongs = SAMPLE_TRACKS.map((t) => ({ ...t, id: generateId() }));
                    setPlaylist((prev) => [...prev, ...newSongs]);
                    setShuffledPlaylist((prev) => shuffleArray([...prev, ...newSongs]));
                  }}
                  className="w-full py-2.5 text-[#B3B3B3] hover:text-white text-sm transition-colors border border-[#535353] hover:border-white rounded-md"
                >
                  + Add Sample Tracks
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 bg-[#121212] overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto">
            {/* Hero Section */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-b from-[#FFAB91] via-[#E57355] to-[#121212] h-[340px]" />

              <div className="relative p-6 pt-8">
                <div className="flex items-end gap-6">
                  {/* Album Art */}
                  <div className="w-[200px] h-[200px] bg-gradient-to-br from-[#FFAB91] to-[#E57355] rounded shadow-2xl flex items-center justify-center flex-shrink-0">
                    <Music className="w-20 h-20 text-white/80" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pb-2">
                    <p className="text-sm font-medium text-white/80 mb-2">Playlist</p>
                    <h1 className="text-5xl md:text-6xl font-black text-white mb-4 tracking-tight">
                      My Music Scheduler
                    </h1>
                    <p className="text-[#B3B3B3] text-sm">
                      {playlist.length} songs • ~{Math.ceil(playlist.length * 3.5)} min
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-4 mt-6">
                  <button
                    onClick={togglePlayPause}
                    className="w-14 h-14 bg-[#FFAB91] hover:bg-[#FFCCBC] hover:scale-105 rounded-full flex items-center justify-center shadow-lg transition-all"
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6 text-black" fill="black" />
                    ) : (
                      <Play className="w-6 h-6 text-black ml-1" fill="black" />
                    )}
                  </button>

                  <button
                    onClick={toggleShuffle}
                    className={`p-3 rounded-full transition-colors ${isShuffleEnabled ? 'text-[#FFAB91] bg-[#FFAB91]/20' : 'text-[#B3B3B3] hover:text-white'}`}
                    title={isShuffleEnabled ? 'Shuffle On' : 'Shuffle Off'}
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Song List */}
            <div className="px-6">
              <div className="grid grid-cols-[32px_1fr_80px] gap-4 px-4 py-2 border-b border-[#282828] text-[#B3B3B3] text-sm">
                <span>#</span>
                <span>Title</span>
                <span className="flex justify-end">
                  <Clock className="w-4 h-4" />
                </span>
              </div>

              <div className="mt-2">
                {activePlaylist.length === 0 ? (
                  <div className="text-center py-16">
                    <Music className="w-16 h-16 text-[#535353] mx-auto mb-4" />
                    <p className="text-[#B3B3B3] text-lg">No songs in playlist</p>
                    <p className="text-[#535353] text-sm mt-2">Click the + button to add music</p>
                  </div>
                ) : (
                  activePlaylist.map((song, index) => (
                    <div
                      key={song.id}
                      onClick={() => playSong(index)}
                      className={`song-row grid grid-cols-[32px_1fr_80px] gap-4 px-4 py-2 rounded-md cursor-pointer group ${
                        currentSong?.id === song.id ? 'bg-[#ffffff1a]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center">
                        {currentSong?.id === song.id && isPlaying ? (
                          <div className="flex items-end gap-0.5 h-4">
                            <div className="w-0.5 bg-[#FFAB91] equalizer-bar" />
                            <div className="w-0.5 bg-[#FFAB91] equalizer-bar" />
                            <div className="w-0.5 bg-[#FFAB91] equalizer-bar" />
                          </div>
                        ) : (
                          <>
                            <span className={`track-number text-sm ${currentSong?.id === song.id ? 'text-[#FFAB91]' : 'text-[#B3B3B3]'}`}>
                              {index + 1}
                            </span>
                            <Play className="track-play w-4 h-4 text-white" fill="white" />
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-[#282828] rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {song.type === 'youtube' && song.videoId ? (
                            <img
                              src={`https://img.youtube.com/vi/${song.videoId}/default.jpg`}
                              alt={song.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music className="w-5 h-5 text-[#B3B3B3]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium truncate ${currentSong?.id === song.id ? 'text-[#FFAB91]' : 'text-white'}`}>
                            {song.title}
                          </p>
                          <p className="text-[#B3B3B3] text-sm truncate">
                            {song.type === 'youtube' ? 'YouTube' : 'Audio File'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSong(song.id); }}
                          className="menu-btn p-1.5 text-[#B3B3B3] hover:text-red-500 rounded-full transition-all"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Schedules Section */}
            <div className="px-6 py-8">
              <h2 className="text-2xl font-bold text-white mb-6">Schedules</h2>

              <div className="bg-[#181818] rounded-lg p-6 mb-6">
                <h3 className="text-white font-semibold mb-4">Create New Schedule</h3>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="text-[#B3B3B3] text-xs uppercase tracking-wider block mb-2">Start Time</label>
                    <input
                      type="time"
                      value={newScheduleStart}
                      onChange={(e) => setNewScheduleStart(e.target.value)}
                      className="px-4 py-2 bg-[#242424] text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#FFAB91]"
                    />
                  </div>
                  <div>
                    <label className="text-[#B3B3B3] text-xs uppercase tracking-wider block mb-2">Stop Time</label>
                    <input
                      type="time"
                      value={newScheduleStop}
                      onChange={(e) => setNewScheduleStop(e.target.value)}
                      className="px-4 py-2 bg-[#242424] text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#FFAB91]"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={newScheduleRepeat}
                      onChange={(e) => setNewScheduleRepeat(e.target.checked)}
                      className="w-4 h-4 rounded bg-[#242424] border-[#535353] text-[#FFAB91] focus:ring-[#FFAB91]"
                    />
                    <span className="text-[#B3B3B3] text-sm">Repeat daily</span>
                  </label>
                  <button
                    onClick={addSchedule}
                    className="px-6 py-2 bg-[#FFAB91] hover:bg-[#FFCCBC] text-black font-semibold rounded-full transition-colors"
                  >
                    Add Schedule
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {schedules.length === 0 ? (
                  <div className="col-span-full text-center py-12 bg-[#181818] rounded-lg">
                    <Clock className="w-12 h-12 text-[#535353] mx-auto mb-4" />
                    <p className="text-[#B3B3B3]">No schedules created</p>
                  </div>
                ) : (
                  schedules.map((schedule) => {
                    const status = getScheduleStatus(schedule);
                    const isEditing = editingScheduleId === schedule.id;

                    return (
                      <div key={schedule.id} className="spotify-card p-4 group relative">
                        {isEditing ? (
                          <div className="space-y-3">
                            <input type="time" value={editScheduleStart} onChange={(e) => setEditScheduleStart(e.target.value)} className="w-full px-3 py-2 bg-[#242424] text-white rounded-md" />
                            <input type="time" value={editScheduleStop} onChange={(e) => setEditScheduleStop(e.target.value)} className="w-full px-3 py-2 bg-[#242424] text-white rounded-md" />
                            <label className="flex items-center gap-2">
                              <input type="checkbox" checked={editScheduleRepeat} onChange={(e) => setEditScheduleRepeat(e.target.checked)} className="w-4 h-4 rounded" />
                              <span className="text-[#B3B3B3] text-sm">Repeat</span>
                            </label>
                            <div className="flex gap-2">
                              <button onClick={saveEditSchedule} className="flex-1 py-2 bg-[#FFAB91] text-black rounded-full"><Check className="w-4 h-4 mx-auto" /></button>
                              <button onClick={() => setEditingScheduleId(null)} className="flex-1 py-2 bg-[#535353] text-white rounded-full"><X className="w-4 h-4 mx-auto" /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="aspect-square bg-gradient-to-br from-[#282828] to-[#121212] rounded-md mb-3 flex items-center justify-center relative overflow-hidden">
                              {schedule.isPlaying && currentSongThumbnail ? (
                                <img
                                  src={currentSongThumbnail}
                                  alt="Now playing"
                                  className="w-full h-full object-cover"
                                />
                              ) : schedule.previewVideoId ? (
                                <img
                                  src={`https://img.youtube.com/vi/${schedule.previewVideoId}/mqdefault.jpg`}
                                  alt="Schedule preview"
                                  className="w-full h-full object-cover opacity-80"
                                />
                              ) : (
                                <Clock className="w-12 h-12 text-[#535353]" />
                              )}
                              <button
                                onClick={() => schedule.isPlaying ? stopScheduleTest(schedule.id) : testSchedule(schedule.id)}
                                className="absolute bottom-2 right-2 w-10 h-10 bg-[#FFAB91] rounded-full flex items-center justify-center shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all"
                              >
                                {schedule.isPlaying ? <Pause className="w-5 h-5 text-black" fill="black" /> : <Play className="w-5 h-5 text-black ml-0.5" fill="black" />}
                              </button>
                            </div>
                            <h4 className="text-white font-semibold truncate">{schedule.startTime} - {schedule.stopTime}</h4>
                            <p className="text-[#B3B3B3] text-sm">{playlist.length} songs</p>
                            <div className="flex gap-1 mt-2">
                              <span className={`px-2 py-0.5 text-xs font-bold rounded ${status.className}`}>{status.label}</span>
                              {schedule.repeatDaily && <span className="px-2 py-0.5 text-xs font-bold rounded bg-[#7C3AED] text-white flex items-center gap-1"><Repeat className="w-3 h-3" />DAILY</span>}
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEditSchedule(schedule)} className="p-1.5 bg-black/60 rounded-full text-[#B3B3B3] hover:text-white"><Edit2 className="w-3 h-3" /></button>
                              <button onClick={() => deleteSchedule(schedule.id)} className="p-1.5 bg-black/60 rounded-full text-[#B3B3B3] hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="h-24" />
          </div>
        </main>
      </div>

      {/* Bottom Player Bar */}
      <footer className="h-[90px] bg-[#181818] border-t border-[#282828] flex items-center px-4 flex-shrink-0">
        {/* Left: Now playing */}
        <div className="w-[30%] min-w-[180px] flex items-center gap-3">
          {currentSong ? (
            <>
              <div className="w-14 h-14 bg-[#282828] rounded flex items-center justify-center flex-shrink-0 overflow-hidden">
                {currentSong.type === 'youtube' && currentSong.videoId ? (
                  <img
                    src={`https://img.youtube.com/vi/${currentSong.videoId}/mqdefault.jpg`}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-6 h-6 text-[#B3B3B3]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
                <p className="text-[#B3B3B3] text-xs truncate">{currentSong.type === 'youtube' ? 'YouTube' : 'Audio File'}</p>
              </div>
            </>
          ) : (
            <div className="text-[#B3B3B3] text-sm">No song playing</div>
          )}
        </div>

        {/* Center: Controls */}
        <div className="flex-1 max-w-[722px] flex flex-col items-center gap-2">
          <div className="flex items-center gap-4">
            <button onClick={toggleShuffle} className={`p-1.5 ${isShuffleEnabled ? 'text-[#FFAB91]' : 'text-[#B3B3B3] hover:text-white'}`}>
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={playPrevSong} className="p-1.5 text-[#B3B3B3] hover:text-white">
              <SkipBack className="w-5 h-5" fill="currentColor" />
            </button>
            <button onClick={togglePlayPause} className="w-9 h-9 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform">
              {isPlaying ? <Pause className="w-5 h-5 text-black" fill="black" /> : <Play className="w-5 h-5 text-black ml-0.5" fill="black" />}
            </button>
            <button onClick={playNextSong} className="p-1.5 text-[#B3B3B3] hover:text-white">
              <SkipForward className="w-5 h-5" fill="currentColor" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full flex items-center gap-2 text-[#B3B3B3] text-xs">
            <span className="w-10 text-right">{formatTime(progress)}</span>
            <div
              className="flex-1 h-1 bg-[#4D4D4D] rounded-full relative group cursor-pointer"
              onClick={handleSeek}
            >
              <div className="absolute inset-y-0 left-0 bg-white group-hover:bg-[#FFAB91] rounded-full transition-colors" style={{ width: `${progressPercent}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `calc(${progressPercent}% - 6px)` }} />
            </div>
            <span className="w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume */}
        <div className="w-[30%] min-w-[180px] flex items-center justify-end gap-2">
          <button onClick={() => setVolume(volume === 0 ? 70 : 0)} className="p-1.5 text-[#B3B3B3] hover:text-white">
            {getVolumeIcon()}
          </button>
          <div className="w-28 h-1 bg-[#4D4D4D] rounded-full relative group cursor-pointer">
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="absolute inset-y-0 left-0 bg-white group-hover:bg-[#FFAB91] rounded-full pointer-events-none transition-colors" style={{ width: `${volume}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" style={{ left: `calc(${volume}% - 6px)` }} />
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-lg z-50 border-t border-[#282828]">
        <div className="flex justify-around py-3">
          <button className="flex flex-col items-center gap-1 text-white">
            <Home className="w-6 h-6" />
            <span className="text-xs">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-[#B3B3B3]" onClick={() => setShowAddMusic(true)}>
            <Plus className="w-6 h-6" />
            <span className="text-xs">Add</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-[#B3B3B3]">
            <Library className="w-6 h-6" />
            <span className="text-xs">Library</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
