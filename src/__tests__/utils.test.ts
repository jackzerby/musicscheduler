import {
  extractVideoId,
  shuffleArray,
  generateId,
  formatTime,
  isWithinSchedule,
  validateScheduleTimes,
} from '../lib/utils';

describe('extractVideoId', () => {
  describe('standard YouTube watch URLs', () => {
    it('should extract video ID from standard watch URL', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL without www', () => {
      expect(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL without https', () => {
      expect(extractVideoId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL with http', () => {
      expect(extractVideoId('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL with additional parameters', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL with parameter before v', () => {
      expect(extractVideoId('https://www.youtube.com/watch?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from watch URL with timestamp', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('short YouTube URLs (youtu.be)', () => {
    it('should extract video ID from short URL', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from short URL without https', () => {
      expect(extractVideoId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from short URL with www', () => {
      expect(extractVideoId('https://www.youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('embed URLs', () => {
    it('should extract video ID from embed URL', () => {
      expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from embed URL without www', () => {
      expect(extractVideoId('https://youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('old style v/ URLs', () => {
    it('should extract video ID from v/ URL', () => {
      expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('shorts URLs', () => {
    it('should extract video ID from shorts URL', () => {
      expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from shorts URL without www', () => {
      expect(extractVideoId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
  });

  describe('direct video ID', () => {
    it('should accept a valid 11-character video ID directly', () => {
      expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should accept video ID with underscores and hyphens', () => {
      expect(extractVideoId('abc_def-123')).toBe('abc_def-123');
    });
  });

  describe('invalid inputs', () => {
    it('should return null for empty string', () => {
      expect(extractVideoId('')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(extractVideoId(null as unknown as string)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(extractVideoId(undefined as unknown as string)).toBeNull();
    });

    it('should return null for whitespace only', () => {
      expect(extractVideoId('   ')).toBeNull();
    });

    it('should return null for invalid URL', () => {
      expect(extractVideoId('https://google.com')).toBeNull();
    });

    it('should return null for video ID that is too short', () => {
      expect(extractVideoId('abc123')).toBeNull();
    });

    it('should return null for video ID that is too long', () => {
      expect(extractVideoId('dQw4w9WgXcQextra')).toBeNull();
    });

    it('should return null for non-YouTube URL', () => {
      expect(extractVideoId('https://vimeo.com/123456789')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle URL with leading/trailing whitespace', () => {
      expect(extractVideoId('  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
    });

    it('should handle various real video IDs', () => {
      expect(extractVideoId('https://www.youtube.com/watch?v=9bZkp7q19f0')).toBe('9bZkp7q19f0');
      expect(extractVideoId('https://www.youtube.com/watch?v=kJQP7kiw5Fk')).toBe('kJQP7kiw5Fk');
      expect(extractVideoId('https://www.youtube.com/watch?v=JGwWNGJdvx8')).toBe('JGwWNGJdvx8');
    });
  });
});

describe('shuffleArray', () => {
  it('should return an array of the same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.length).toBe(arr.length);
  });

  it('should contain all the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  it('should not modify the original array', () => {
    const arr = [1, 2, 3, 4, 5];
    const original = [...arr];
    shuffleArray(arr);
    expect(arr).toEqual(original);
  });

  it('should handle empty array', () => {
    const arr: number[] = [];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toEqual([]);
  });

  it('should handle single element array', () => {
    const arr = [1];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toEqual([1]);
  });

  it('should work with objects', () => {
    const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const shuffled = shuffleArray(arr);
    expect(shuffled.length).toBe(3);
    expect(shuffled.map(x => x.id).sort()).toEqual([1, 2, 3]);
  });

  it('should produce different orders (statistical test)', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = new Set<string>();

    // Run shuffle 100 times and check we get different results
    for (let i = 0; i < 100; i++) {
      results.add(shuffleArray(arr).join(','));
    }

    // Should have multiple different orderings
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('generateId', () => {
  it('should generate a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('should generate unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });

  it('should generate IDs of consistent length', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(9);
  });
});

describe('formatTime', () => {
  it('should format time with leading zeros for single digit hours', () => {
    const date = new Date(2024, 0, 1, 8, 30);
    expect(formatTime(date)).toBe('08:30');
  });

  it('should format time with leading zeros for single digit minutes', () => {
    const date = new Date(2024, 0, 1, 10, 5);
    expect(formatTime(date)).toBe('10:05');
  });

  it('should format midnight correctly', () => {
    const date = new Date(2024, 0, 1, 0, 0);
    expect(formatTime(date)).toBe('00:00');
  });

  it('should format noon correctly', () => {
    const date = new Date(2024, 0, 1, 12, 0);
    expect(formatTime(date)).toBe('12:00');
  });

  it('should format late evening correctly', () => {
    const date = new Date(2024, 0, 1, 23, 59);
    expect(formatTime(date)).toBe('23:59');
  });
});

describe('isWithinSchedule', () => {
  it('should return true when current time is within schedule', () => {
    expect(isWithinSchedule('08:30', '08:00', '09:00')).toBe(true);
  });

  it('should return true when current time equals start time', () => {
    expect(isWithinSchedule('08:00', '08:00', '09:00')).toBe(true);
  });

  it('should return false when current time equals stop time', () => {
    expect(isWithinSchedule('09:00', '08:00', '09:00')).toBe(false);
  });

  it('should return false when current time is before schedule', () => {
    expect(isWithinSchedule('07:30', '08:00', '09:00')).toBe(false);
  });

  it('should return false when current time is after schedule', () => {
    expect(isWithinSchedule('09:30', '08:00', '09:00')).toBe(false);
  });

  it('should handle edge case at midnight', () => {
    expect(isWithinSchedule('00:00', '00:00', '01:00')).toBe(true);
  });
});

describe('validateScheduleTimes', () => {
  it('should return true for valid schedule (start before stop)', () => {
    expect(validateScheduleTimes('08:00', '09:00')).toBe(true);
  });

  it('should return false for invalid schedule (start equals stop)', () => {
    expect(validateScheduleTimes('08:00', '08:00')).toBe(false);
  });

  it('should return false for invalid schedule (start after stop)', () => {
    expect(validateScheduleTimes('10:00', '09:00')).toBe(false);
  });

  it('should handle midnight edge cases', () => {
    expect(validateScheduleTimes('00:00', '01:00')).toBe(true);
    expect(validateScheduleTimes('23:00', '23:59')).toBe(true);
  });
});
