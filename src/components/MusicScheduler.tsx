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
  Repeat,
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

const STORAGE_KEY = 'musicscheduler_playlist';

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

  // Save playlist to localStorage whenever it changes
  useEffect(() => {
    if (playlist.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playlist));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [playlist]);

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
    if (schedule.isPlaying) return { label: 'LIVE', className: 'bg-[#00d68f] text-black' };
    const now = new Date();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (currentTimeStr < schedule.startTime) return { label: 'SCHEDULED', className: 'bg-[#0070f3] text-white' };
    return { label: 'INACTIVE', className: 'bg-[#333] text-[#888]' };
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
                    <p className="text-xs font-medium text-[#0070f3] uppercase tracking-wider mb-3">Now Playing</p>
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
                <h2 className="text-xl font-semibold text-white">Schedules</h2>
                <span className="text-[#666] text-sm">{schedules.length} active</span>
              </div>

              {/* Create Schedule */}
              <div className="vercel-card p-6 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="text-[#666] text-xs uppercase tracking-wider block mb-2">Start</label>
                    <input
                      type="time"
                      value={newScheduleStart}
                      onChange={(e) => setNewScheduleStart(e.target.value)}
                      className="px-4 py-2.5 bg-[#111] border border-[#262626] text-white rounded-lg focus:outline-none focus:border-[#0070f3] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[#666] text-xs uppercase tracking-wider block mb-2">End</label>
                    <input
                      type="time"
                      value={newScheduleStop}
                      onChange={(e) => setNewScheduleStop(e.target.value)}
                      className="px-4 py-2.5 bg-[#111] border border-[#262626] text-white rounded-lg focus:outline-none focus:border-[#0070f3] transition-colors"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer py-2.5">
                    <input
                      type="checkbox"
                      checked={newScheduleRepeat}
                      onChange={(e) => setNewScheduleRepeat(e.target.checked)}
                      className="w-4 h-4 rounded bg-[#111] border-[#262626] text-[#0070f3] focus:ring-[#0070f3]"
                    />
                    <span className="text-[#888] text-sm">Repeat daily</span>
                  </label>
                  <button
                    onClick={addSchedule}
                    className="px-6 py-2.5 bg-white hover:bg-[#e5e5e5] text-black font-medium text-sm rounded-lg transition-colors"
                  >
                    Create Schedule
                  </button>
                </div>
              </div>

              {/* Schedule Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {schedules.length === 0 ? (
                  <div className="col-span-full text-center py-16 vercel-card">
                    <Clock className="w-10 h-10 text-[#333] mx-auto mb-4" />
                    <p className="text-[#666]">No schedules created</p>
                    <p className="text-[#444] text-sm mt-1">Create one above to get started</p>
                  </div>
                ) : (
                  schedules.map((schedule) => {
                    const status = getScheduleStatus(schedule);
                    const isEditing = editingScheduleId === schedule.id;

                    return (
                      <div key={schedule.id} className="vercel-card p-5 group relative">
                        {isEditing ? (
                          <div className="space-y-3">
                            <input type="time" value={editScheduleStart} onChange={(e) => setEditScheduleStart(e.target.value)} className="w-full px-3 py-2 bg-[#111] border border-[#262626] text-white rounded-lg" />
                            <input type="time" value={editScheduleStop} onChange={(e) => setEditScheduleStop(e.target.value)} className="w-full px-3 py-2 bg-[#111] border border-[#262626] text-white rounded-lg" />
                            <label className="flex items-center gap-2">
                              <input type="checkbox" checked={editScheduleRepeat} onChange={(e) => setEditScheduleRepeat(e.target.checked)} className="w-4 h-4 rounded" />
                              <span className="text-[#888] text-sm">Repeat</span>
                            </label>
                            <div className="flex gap-2">
                              <button onClick={saveEditSchedule} className="flex-1 py-2.5 bg-white text-black rounded-lg hover:bg-[#e5e5e5] transition-colors"><Check className="w-4 h-4 mx-auto" /></button>
                              <button onClick={() => setEditingScheduleId(null)} className="flex-1 py-2.5 bg-[#262626] text-white rounded-lg hover:bg-[#333] transition-colors"><X className="w-4 h-4 mx-auto" /></button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h4 className="text-white font-semibold text-lg">{schedule.startTime}</h4>
                                <p className="text-[#666] text-sm">to {schedule.stopTime}</p>
                              </div>
                              <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${status.className}`}>
                                {status.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[#666] text-sm mb-4">
                              <Music className="w-4 h-4" />
                              <span>{playlist.length} tracks</span>
                              {schedule.repeatDaily && (
                                <>
                                  <span className="text-[#333]">•</span>
                                  <Repeat className="w-3 h-3" />
                                  <span>Daily</span>
                                </>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                onClick={() => schedule.isPlaying ? stopScheduleTest(schedule.id) : testSchedule(schedule.id)}
                                className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                                  schedule.isPlaying
                                    ? 'bg-[#f31260] text-white hover:bg-[#d60b54]'
                                    : 'bg-white text-black hover:bg-[#e5e5e5]'
                                }`}
                              >
                                {schedule.isPlaying ? 'Stop' : 'Test'}
                              </button>
                              <button
                                onClick={() => startEditSchedule(schedule)}
                                className="w-10 h-10 bg-[#1a1a1a] border border-[#262626] hover:border-[#404040] rounded-lg flex items-center justify-center transition-colors"
                              >
                                <Edit2 className="w-4 h-4 text-[#888]" />
                              </button>
                              <button
                                onClick={() => deleteSchedule(schedule.id)}
                                className="w-10 h-10 bg-[#1a1a1a] border border-[#262626] hover:border-[#f31260] rounded-lg flex items-center justify-center transition-colors group/del"
                              >
                                <Trash2 className="w-4 h-4 text-[#888] group-hover/del:text-[#f31260]" />
                              </button>
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
                <p className="text-white text-sm font-medium truncate">{currentSong.title}</p>
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
