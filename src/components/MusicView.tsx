import { useState, useEffect, useRef, useCallback } from 'react';
import { getConfig } from '../config';
import {
  Play, Pause, Rewind, FastForward, Volume, Volume2, Speaker, Check, ChevronDown, Music, Shuffle, Repeat, Repeat1,
} from 'lucide-react';
import { MediaPlayer, MediaRepeat } from '../types/music';
import { positionAt, canDo, MediaFeature } from '../api/music';
import '../styles/music.css';

interface MusicViewProps {
  players: MediaPlayer[];
  /** The default speaker (Settings > Default Player), or the last one picked. */
  selectedPlayerId: string | null;
  onSelectPlayer: (entityId: string) => void;
  onPlay: (entityId?: string) => void;
  onPause: (entityId?: string) => void;
  onNext: (entityId?: string) => void;
  onPrevious: (entityId?: string) => void;
  onSetVolume: (level: number, entityId?: string) => void;
  onSeek: (position: number, entityId?: string) => void;
  onSetShuffle: (shuffle: boolean, entityId?: string) => void;
  onSetRepeat: (repeat: MediaRepeat, entityId?: string) => void;
}

/** Repeat taps go off → all → one → off, as in Apple Music. */
const NEXT_REPEAT: Record<MediaRepeat, MediaRepeat> = { off: 'all', all: 'one', one: 'off' };

/** Seconds as m:ss. */
function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The artwork's address: HA's entity_picture is usually a path on HA itself. */
function artworkUrl(player: MediaPlayer | null): string | null {
  const picture = player?.entity_picture;
  if (!picture) return null;
  if (/^(https?:|data:)/.test(picture)) return picture;
  return `${getConfig().ha_url.replace(/\/$/, '')}${picture}`;
}

function stateLabel(player: MediaPlayer): string {
  if (player.state === 'playing') return 'Playing';
  if (player.state === 'paused') return 'Paused';
  if (player.state === 'off') return 'Off';
  return 'Not playing';
}

function Artwork({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return <img key={src} className={className} src={src} alt={alt} onError={() => setFailed(src)} />;
  }
  return (
    <div className={`${className} music-art--placeholder`} role="img" aria-label={alt}>
      <Music strokeWidth={1.5} />
    </div>
  );
}

/**
 * Volume, set as the slider moves but at most every quarter second: every
 * move used to be a Home Assistant service call, dozens per drag.
 */
function VolumeSlider({ level, onChange }: { level: number; onChange: (level: number) => void }) {
  const [dragged, setDragged] = useState<number | null>(null);
  const lastSent = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);

  const set = (value: number) => {
    setDragged(value);
    clearTimeout(pending.current);
    const wait = 250 - (Date.now() - lastSent.current);
    const send = () => {
      lastSent.current = Date.now();
      onChange(value);
    };
    if (wait <= 0) send();
    else pending.current = setTimeout(send, wait);
  };
  // What's set shows until the player reports it back.
  useEffect(() => setDragged(null), [level]);

  const shown = dragged ?? level;
  return (
    <div className="music-volume">
      <Volume className="music-volume-icon" aria-hidden="true" />
      <input
        type="range"
        className="music-slider"
        min={0}
        max={1}
        step={0.01}
        value={shown}
        style={{ '--fill': `${shown * 100}%` } as React.CSSProperties}
        onChange={(e) => set(parseFloat(e.target.value))}
        aria-label="Volume"
      />
      <Volume2 className="music-volume-icon" aria-hidden="true" />
    </div>
  );
}

/**
 * The track position. Dragging it (or tapping a point on it) seeks when
 * let go; the arrow keys move 5 s at a time. The dragged spot shows until
 * the player reports a new position.
 */
function ProgressScrubber({
  position,
  duration,
  measuredAt,
  canSeek,
  onSeek,
}: {
  position: number | null;
  duration: number;
  /** When the player last reported its position: a new one ends the hold. */
  measuredAt: string | undefined;
  canSeek: boolean;
  onSeek: (position: number) => void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  draggingRef.current = dragging;
  useEffect(() => {
    if (!draggingRef.current) setDragged(null);
  }, [measuredAt]);

  const known = duration > 0 && position !== null;
  const interactive = known && canSeek;
  const shown = dragged ?? position ?? 0;
  const fraction = known ? Math.min(1, Math.max(0, shown / duration)) : 0;

  const at = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1))) * duration;
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    setDragged(at(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) setDragged(at(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const to = at(e.clientX);
    setDragged(to);
    onSeek(to);
  };
  const onPointerCancel = () => {
    setDragging(false);
    setDragged(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 }[e.key];
    let to: number | undefined;
    if (step) to = shown + step;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = duration;
    if (to === undefined) return;
    e.preventDefault();
    to = Math.min(duration, Math.max(0, to));
    setDragged(to);
    onSeek(to);
  };

  return (
    <div
      className={`music-progress${known ? '' : ' music-progress--none'}${interactive ? ' music-progress--seekable' : ''}${dragging ? ' music-progress--dragging' : ''}`}
    >
      <div
        ref={trackRef}
        className="music-progress-hit"
        role={interactive ? 'slider' : 'progressbar'}
        tabIndex={interactive ? 0 : undefined}
        aria-label="Track position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={known ? `${formatTime(shown)} of ${formatTime(duration)}` : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
      >
        <div className="music-progress-track">
          <div className="music-progress-fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>
      <div className="music-progress-times">
        <span>{known ? formatTime(shown) : '--:--'}</span>
        <span>{known ? `-${formatTime(duration - shown)}` : '--:--'}</span>
      </div>
    </div>
  );
}

function SpeakerSheet({
  players,
  currentId,
  onPick,
  onClose,
}: {
  players: MediaPlayer[];
  currentId: string | undefined;
  onPick: (entityId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="music-sheet-backdrop" onClick={onClose}>
      <div className="music-sheet" role="dialog" aria-label="Speakers" onClick={(e) => e.stopPropagation()}>
        <div className="music-sheet-grabber" aria-hidden="true" />
        <h3 className="music-sheet-title">Speakers</h3>
        <ul className="music-sheet-list">
          {players.map((p) => {
            const art = artworkUrl(p);
            const current = p.entity_id === currentId;
            const nowPlaying = p.state === 'playing' || p.state === 'paused'
              ? [p.media_title, p.media_artist].filter(Boolean).join(' · ')
              : '';
            return (
              <li key={p.entity_id}>
                <button
                  type="button"
                  className={`music-sheet-item${current ? ' music-sheet-item--current' : ''}`}
                  onClick={() => onPick(p.entity_id)}
                  aria-pressed={current}
                >
                  {art ? (
                    <Artwork src={art} alt="" className="music-sheet-art" />
                  ) : (
                    <span className="music-sheet-art music-sheet-art--speaker" aria-hidden="true"><Speaker /></span>
                  )}
                  <span className="music-sheet-text">
                    <span className="music-sheet-name">{p.friendly_name}</span>
                    <span className="music-sheet-state">
                      {stateLabel(p)}{nowPlaying ? ` · ${nowPlaying}` : ''}
                    </span>
                  </span>
                  {current && <Check className="music-sheet-check" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * The Music screen: an iOS-style Now Playing. The artwork, blurred, fills
 * the screen behind it; the artwork sits beside the controls on landscape
 * displays and above them on portrait ones, sized to fit without scrolling.
 */
export function MusicView({
  players,
  selectedPlayerId,
  onSelectPlayer,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onSetVolume,
  onSeek,
  onSetShuffle,
  onSetRepeat,
}: MusicViewProps) {
  // Which speaker shows: one picked here, else the one showing while it's
  // playing or paused (pausing it used to switch to whichever other one was
  // playing, or to the first), else one that's playing, else the default.
  // A picked one shows even while another plays; the playing one always
  // won, so the others couldn't be seen or controlled.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const byId = (id: string | null) => (id ? players.find((p) => p.entity_id === id) : undefined);
  const lastShown = byId(shownId);
  const player = byId(pickedId)
    ?? (lastShown?.state === 'playing' || lastShown?.state === 'paused' ? lastShown : undefined)
    ?? players.find((p) => p.state === 'playing')
    ?? byId(selectedPlayerId)
    ?? lastShown
    ?? players[0]
    ?? null;
  const playerId = player?.entity_id ?? null;
  if (playerId !== shownId) setShownId(playerId);
  const isPlaying = player?.state === 'playing';

  // Ticks while playing, for the elapsed time.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isPlaying) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const pick = useCallback((entityId: string) => {
    setPickedId(entityId);
    onSelectPlayer(entityId);
    setSheetOpen(false);
  }, [onSelectPlayer]);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  if (players.length === 0 || !player) {
    return (
      <div className="music-view music-view--empty">
        <div className="music-bg" aria-hidden="true">
          <div className="music-backdrop" />
        </div>
        <div className="music-empty">
          <Speaker className="music-empty-icon" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="music-empty-title">No speakers</h2>
          <p className="music-empty-text">Add a media player in Home Assistant to play and control music here.</p>
        </div>
      </div>
    );
  }

  const art = artworkUrl(player);
  const hasTrack = !!player.media_title;
  const title = player.media_title || player.app_name || 'Not Playing';
  const subtitle = hasTrack
    ? [player.media_artist, player.media_album_name].filter(Boolean).join(' — ')
    : player.friendly_name;
  const duration = player.media_duration ?? 0;
  const position = positionAt(player, now);
  const entityId = player.entity_id;
  const canShuffle = canDo(player, MediaFeature.SHUFFLE_SET);
  const canRepeat = canDo(player, MediaFeature.REPEAT_SET);
  const repeat = player.repeat ?? 'off';

  return (
    <div className={`music-view ${isPlaying ? 'music-view--playing' : 'music-view--paused'}`}>
      <div className="music-bg" aria-hidden="true">
        <div
          className={`music-backdrop${art ? '' : ' music-backdrop--plain'}`}
          style={art ? { backgroundImage: `url("${art}")` } : undefined}
        />
        <div className="music-scrim" />
      </div>

      <div className="music-layout">
        <div className="music-art-frame">
          <Artwork src={art} alt={player.media_album_name || title} className="music-art" />
        </div>

        <div className="music-panel">
          <div className="music-titles">
            <h2 className="music-title" title={title}>{title}</h2>
            {subtitle && <p className="music-subtitle" title={subtitle}>{subtitle}</p>}
          </div>

          {/* Per speaker: switching speakers doesn't slide the bar across */}
          <ProgressScrubber
            key={entityId}
            position={position}
            duration={duration}
            measuredAt={player.media_position_updated_at}
            canSeek={canDo(player, MediaFeature.SEEK)}
            onSeek={(to) => onSeek(to, entityId)}
          />

          <div className="music-transport">
            {canShuffle && (
              <button
                type="button"
                className={`music-mode-btn${player.shuffle ? ' music-mode-btn--on' : ''}`}
                onClick={() => onSetShuffle(!player.shuffle, entityId)}
                aria-label="Shuffle"
                aria-pressed={!!player.shuffle}
              >
                <Shuffle />
              </button>
            )}
            <button type="button" className="music-transport-btn" onClick={() => onPrevious(entityId)} aria-label="Previous track">
              <Rewind fill="currentColor" />
            </button>
            <button
              type="button"
              className="music-transport-btn music-transport-btn--main"
              onClick={() => (isPlaying ? onPause : onPlay)(entityId)}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
            <button type="button" className="music-transport-btn" onClick={() => onNext(entityId)} aria-label="Next track">
              <FastForward fill="currentColor" />
            </button>
            {canRepeat && (
              <button
                type="button"
                className={`music-mode-btn${repeat !== 'off' ? ' music-mode-btn--on' : ''}`}
                onClick={() => onSetRepeat(NEXT_REPEAT[repeat], entityId)}
                aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off'}
              >
                {repeat === 'one' ? <Repeat1 /> : <Repeat />}
              </button>
            )}
          </div>

          <VolumeSlider
            level={player.is_volume_muted ? 0 : (player.volume_level ?? 0)}
            onChange={(level) => onSetVolume(level, entityId)}
          />

          <button
            type="button"
            className="music-output"
            onClick={() => setSheetOpen(true)}
            disabled={players.length < 2}
            aria-label={`Speaker: ${player.friendly_name}${players.length > 1 ? ', change speaker' : ''}`}
          >
            <Speaker className="music-output-icon" aria-hidden="true" />
            <span className="music-output-name">{player.friendly_name}</span>
            {players.length > 1 && <ChevronDown className="music-output-chevron" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {sheetOpen && (
        <SpeakerSheet players={players} currentId={entityId} onPick={pick} onClose={closeSheet} />
      )}
    </div>
  );
}
