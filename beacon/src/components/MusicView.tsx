import { useState, useEffect, useRef, useCallback } from 'react';
import { getConfig } from '../config';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ChevronDown,
  Search,
  X,
  ListMusic,
  Plus,
  Music,
  Disc3,
  User,
  Radio,
  Loader2,
} from 'lucide-react';
import { MediaPlayer } from '../types/music';
import { useMusicSearch, MusicSearchResult, SearchResultType } from '../hooks/useMusicSearch';

interface MusicViewProps {
  players: MediaPlayer[];
  activePlayer: MediaPlayer | null;
  selectedPlayerId: string | null;
  onSelectPlayer: (entityId: string) => void;
  onPlay: (entityId?: string) => void;
  onPause: (entityId?: string) => void;
  onNext: (entityId?: string) => void;
  onPrevious: (entityId?: string) => void;
  onSetVolume: (level: number, entityId?: string) => void;
}

/**
 * Formats seconds into m:ss.
 */
function formatTime(seconds: number | undefined): string {
  if (seconds == null || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Icon for a search result type */
function TypeIcon({ type, size = 16 }: { type: SearchResultType; size?: number }) {
  switch (type) {
    case 'track': return <Music size={size} />;
    case 'album': return <Disc3 size={size} />;
    case 'artist': return <User size={size} />;
    case 'playlist': return <ListMusic size={size} />;
    case 'radio': return <Radio size={size} />;
  }
}

/** Tab options for the music view */
type MusicTab = 'nowplaying' | 'search' | 'queue';

export function MusicView({
  players,
  activePlayer,
  selectedPlayerId,
  onSelectPlayer,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSetVolume,
}: MusicViewProps) {
  // Empty state when no media players found
  if (players.length === 0) {
    return (
      <div className="music-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: 8 }}>No Media Players</h2>
          <p style={{ fontSize: '0.9rem' }}>Connect a media player in Home Assistant to control music from here.</p>
        </div>
      </div>
    );
  }

  const player = activePlayer || players.find((p) => p.entity_id === selectedPlayerId) || players[0] || null;
  const isPlaying = player?.state === 'playing';
  const resolvedPlayerId = player?.entity_id || selectedPlayerId;

  // Track elapsed position locally for smooth progress bar
  const [position, setPosition] = useState(player?.media_position ?? 0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPosition(player?.media_position ?? 0);
  }, [player?.media_position]);

  // Tick the position forward while playing
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    if (!isPlaying) return;

    animRef.current = setInterval(() => {
      setPosition((prev) => prev + 1);
    }, 1000);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [isPlaying, player?.media_position]);

  const duration = player?.media_duration ?? 0;
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  const haUrl = getConfig().ha_url.replace(/\/$/, '');
  const artSrc = player?.entity_picture
    ? (player.entity_picture.startsWith('http')
      ? player.entity_picture
      : `${haUrl}${player.entity_picture}`)
    : null;

  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<MusicTab>('nowplaying');

  // Search hook
  const {
    results,
    loading: searchLoading,
    search,
    playItem,
    queue,
    refreshQueue,
  } = useMusicSearch(resolvedPlayerId || null);

  const [searchQuery, setSearchQuery] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      search(value);
    }, 300);
  }, [search]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    search('');
    searchInputRef.current?.focus();
  }, [search]);

  // Refresh queue when switching to queue tab
  useEffect(() => {
    if (activeTab === 'queue') {
      refreshQueue();
    }
  }, [activeTab, refreshQueue]);

  // Group search results by type
  const groupedResults = results.reduce<Record<SearchResultType, MusicSearchResult[]>>(
    (acc, r) => {
      if (!acc[r.type]) acc[r.type] = [];
      acc[r.type].push(r);
      return acc;
    },
    {} as Record<SearchResultType, MusicSearchResult[]>,
  );

  const typeLabels: Record<SearchResultType, string> = {
    track: 'Tracks',
    album: 'Albums',
    artist: 'Artists',
    playlist: 'Playlists',
    radio: 'Radio',
  };

  const typeOrder: SearchResultType[] = ['track', 'album', 'artist', 'playlist', 'radio'];

  return (
    <div className="music-view music-view--enhanced">
      {/* Player selector */}
      {players.length > 1 && (
        <div className="music-player-selector">
          <button
            type="button"
            className="music-player-selector-btn"
            onClick={() => setShowPlayerDropdown(!showPlayerDropdown)}
          >
            <span>{player?.friendly_name || 'Select Player'}</span>
            <ChevronDown size={16} />
          </button>
          {showPlayerDropdown && (
            <div className="music-player-dropdown">
              {players.map((p) => (
                <button
                  key={p.entity_id}
                  type="button"
                  className={`music-player-dropdown-item ${
                    p.entity_id === player?.entity_id ? 'music-player-dropdown-item--active' : ''
                  }`}
                  onClick={() => {
                    onSelectPlayer(p.entity_id);
                    setShowPlayerDropdown(false);
                  }}
                >
                  <span>{p.friendly_name}</span>
                  {p.state === 'playing' && (
                    <span className="music-player-dropdown-playing">Playing</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="music-tabs">
        <button
          type="button"
          className={`music-tab ${activeTab === 'nowplaying' ? 'music-tab--active' : ''}`}
          onClick={() => setActiveTab('nowplaying')}
        >
          <Music size={16} />
          <span>Now Playing</span>
        </button>
        <button
          type="button"
          className={`music-tab ${activeTab === 'search' ? 'music-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('search');
            // Focus search input after tab switch
            setTimeout(() => searchInputRef.current?.focus(), 100);
          }}
        >
          <Search size={16} />
          <span>Search</span>
        </button>
        <button
          type="button"
          className={`music-tab ${activeTab === 'queue' ? 'music-tab--active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <ListMusic size={16} />
          <span>Queue</span>
        </button>
      </div>

      {/* ============ NOW PLAYING TAB ============ */}
      {activeTab === 'nowplaying' && (
        <div className="music-tab-content">
          {/* Album art */}
          <div className="music-art-container">
            {artSrc ? (
              <img
                className="music-art"
                src={artSrc}
                alt={player?.media_album_name || 'Album art'}
              />
            ) : (
              <div className="music-art music-art--placeholder">
                <Volume2 size={64} strokeWidth={1} />
              </div>
            )}
          </div>

          {/* Track info */}
          <div className="music-track-info">
            <h2 className="music-track-title">
              {player?.media_title || player?.app_name || 'Nothing Playing'}
            </h2>
            <p className="music-track-artist">
              {player?.media_artist || ''}
            </p>
            {player?.media_album_name && (
              <p className="music-track-album">
                {player.media_album_name}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="music-progress">
            <span className="music-progress-time">{formatTime(position)}</span>
            <div className="music-progress-bar">
              <div
                className="music-progress-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="music-progress-time">{formatTime(duration)}</span>
          </div>

          {/* Playback controls */}
          <div className="music-controls">
            <button
              type="button"
              className="music-control-btn"
              onClick={() => onPrevious(player?.entity_id)}
              aria-label="Previous track"
            >
              <SkipBack size={28} />
            </button>
            <button
              type="button"
              className="music-control-btn music-control-btn--play"
              onClick={() => (isPlaying ? onPause : onPlay)(player?.entity_id)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={32} /> : <Play size={32} />}
            </button>
            <button
              type="button"
              className="music-control-btn"
              onClick={() => onNext(player?.entity_id)}
              aria-label="Next track"
            >
              <SkipForward size={28} />
            </button>
          </div>

          {/* Volume slider */}
          <div className="music-volume">
            <button
              type="button"
              className="music-volume-btn"
              onClick={() =>
                onSetVolume(
                  player?.is_volume_muted ? (player.volume_level || 0.5) : 0,
                  player?.entity_id,
                )
              }
              aria-label={player?.is_volume_muted ? 'Unmute' : 'Mute'}
            >
              {player?.is_volume_muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range"
              className="music-volume-slider"
              min={0}
              max={1}
              step={0.02}
              value={player?.is_volume_muted ? 0 : (player?.volume_level ?? 0.5)}
              onChange={(e) => onSetVolume(parseFloat(e.target.value), player?.entity_id)}
              aria-label="Volume"
            />
          </div>
        </div>
      )}

      {/* ============ SEARCH TAB ============ */}
      {activeTab === 'search' && (
        <div className="music-tab-content music-tab-content--search">
          {/* Search bar */}
          <div className="music-search-bar">
            <Search size={18} className="music-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="music-search-input"
              placeholder="Search for songs, albums, artists..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {searchQuery && (
              <button
                type="button"
                className="music-search-clear"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Search results */}
          <div className="music-search-results">
            {searchLoading && (
              <div className="music-search-loading">
                <Loader2 size={24} className="music-spinner" />
                <span>Searching...</span>
              </div>
            )}

            {!searchLoading && searchQuery && results.length === 0 && (
              <div className="music-search-empty">
                <p>No results found for "{searchQuery}"</p>
              </div>
            )}

            {!searchLoading && !searchQuery && (
              <div className="music-search-empty">
                <Search size={32} strokeWidth={1} />
                <p>Search your music library</p>
              </div>
            )}

            {!searchLoading && results.length > 0 && (
              <div className="music-search-groups">
                {typeOrder.map((type) => {
                  const group = groupedResults[type];
                  if (!group || group.length === 0) return null;
                  return (
                    <div key={type} className="music-search-group">
                      <h3 className="music-search-group-title">{typeLabels[type]}</h3>
                      <div className="music-search-group-items">
                        {group.map((item, idx) => (
                          <div key={`${item.uri}-${idx}`} className="music-search-item">
                            <div className="music-search-item-art">
                              {item.image_url ? (
                                <img src={item.image_url} alt="" />
                              ) : (
                                <div className="music-search-item-art-placeholder">
                                  <TypeIcon type={item.type} size={18} />
                                </div>
                              )}
                            </div>
                            <div className="music-search-item-info">
                              <span className="music-search-item-name">{item.name}</span>
                              {item.artist && (
                                <span className="music-search-item-artist">{item.artist}</span>
                              )}
                              {item.album && item.type === 'track' && (
                                <span className="music-search-item-album">{item.album}</span>
                              )}
                            </div>
                            {item.duration && (
                              <span className="music-search-item-duration">
                                {formatTime(item.duration)}
                              </span>
                            )}
                            <div className="music-search-item-actions">
                              <button
                                type="button"
                                className="music-search-item-btn"
                                onClick={() => playItem(item.uri, item.type, false)}
                                aria-label={`Play ${item.name}`}
                                title="Play now"
                              >
                                <Play size={16} />
                              </button>
                              <button
                                type="button"
                                className="music-search-item-btn"
                                onClick={() => playItem(item.uri, item.type, true)}
                                aria-label={`Add ${item.name} to queue`}
                                title="Add to queue"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ QUEUE TAB ============ */}
      {activeTab === 'queue' && (
        <div className="music-tab-content music-tab-content--queue">
          {queue.length === 0 ? (
            <div className="music-queue-empty">
              <ListMusic size={32} strokeWidth={1} />
              <p>Queue is empty</p>
              <span>Search for music and add it to the queue</span>
            </div>
          ) : (
            <div className="music-queue-list">
              {queue.map((item, idx) => (
                <div
                  key={`${item.uri}-${idx}`}
                  className={`music-queue-item ${item.is_current ? 'music-queue-item--current' : ''}`}
                >
                  <div className="music-queue-item-index">
                    {item.is_current ? (
                      <Music size={14} className="music-queue-playing-icon" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </div>
                  <div className="music-queue-item-art">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" />
                    ) : (
                      <div className="music-queue-item-art-placeholder">
                        <Music size={14} />
                      </div>
                    )}
                  </div>
                  <div className="music-queue-item-info">
                    <span className="music-queue-item-name">{item.name}</span>
                    {item.artist && (
                      <span className="music-queue-item-artist">{item.artist}</span>
                    )}
                  </div>
                  {item.duration && (
                    <span className="music-queue-item-duration">
                      {formatTime(item.duration)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
