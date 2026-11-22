import { useCallback, useEffect, useState } from 'react';
import { haFetch } from '../api/ha-rest';
import {
  isGoogleShareUrl,
  loadGoogleAlbums,
  refreshGoogleAlbums,
  saveGoogleAlbums,
  type GoogleAlbumStatus,
  type GooglePhotoStatus,
} from '../api/google-photos';
import { useTranslation, type TranslationKey } from '../i18n';

interface MediaChild {
  media_content_id?: string;
  title?: string;
  media_content_type?: string;
}

function isFolder(child: MediaChild): boolean {
  const type = child.media_content_type || '';
  return !type.startsWith('image') && !type.startsWith('video') && !type.startsWith('audio');
}

function MediaFolderField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [trail, setTrail] = useState<Array<{ id: string | null; title: string }>>([
    { id: null, title: 'Media' },
  ]);
  const [entries, setEntries] = useState<MediaChild[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string | null) => {
    setError('');
    try {
      const path = id
        ? `/api/media_source/browse_media/${encodeURIComponent(id)}`
        : '/api/media_source/browse_media';
      const data = await haFetch(path) as { children?: MediaChild[] };
      setEntries((data.children || []).filter(isFolder));
    } catch {
      setEntries([]);
      setError(t('settings.integrations.mediaBrowseFailed'));
    }
  }, [t]);

  const openBrowser = () => {
    setOpen(true);
    setFolderId(null);
    setTrail([{ id: null, title: 'Media' }]);
    load(null);
  };

  return (
    <div className="photo-source-editor">
      <input
        type="text"
        className="settings-input settings-input--wide"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/media/beacon/photos"
      />
      <div className="photo-source-actions">
        <button type="button" className="settings-btn" onClick={openBrowser}>
          {t('settings.integrations.browseMedia')}
        </button>
        {open && folderId && (
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            onClick={() => { onChange(folderId); setOpen(false); }}
          >
            {t('settings.integrations.useThisFolder')}
          </button>
        )}
        {open && trail.length > 1 && (
          <button
            type="button"
            className="settings-btn"
            onClick={() => {
              const next = trail.slice(0, -1);
              const parent = next[next.length - 1];
              setTrail(next);
              setFolderId(parent.id);
              load(parent.id);
            }}
          >
            {t('settings.integrations.mediaUp')}
          </button>
        )}
      </div>
      {open && (
        <div className="media-folder-browser">
          {error && <p className="photo-album-note photo-album-note--warn">{error}</p>}
          {!error && entries.length === 0 && (
            <p className="photo-album-note">{t('settings.integrations.mediaFolderEmpty')}</p>
          )}
          {entries.map((entry, index) => (
            <button
              key={entry.media_content_id || String(index)}
              type="button"
              className="settings-btn"
              onClick={() => {
                const id = entry.media_content_id || '';
                setFolderId(id);
                setTrail((prev) => [...prev, { id, title: entry.title || id }]);
                load(id);
              }}
            >
              {entry.title || entry.media_content_id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function albumNote(
  album: GoogleAlbumStatus,
  formatTime: (iso: string) => string,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  if (album.lastError === 'partial') return t('settings.integrations.albumPartial');
  if (album.lastError && album.lastSuccess) {
    return t('settings.integrations.albumStale', { time: formatTime(album.lastSuccess) });
  }
  if (album.lastError) return t('settings.integrations.albumFailed');
  if (album.lastSuccess) {
    return `${t('settings.integrations.albumPhotoCount', { count: album.count })} · ${t('settings.integrations.albumUpdated', { time: formatTime(album.lastSuccess) })}`;
  }
  return t('settings.integrations.albumPending');
}

export function PhotoSourceSettings({
  photoDirectory,
  onPhotoDirectory,
}: {
  photoDirectory: string;
  onPhotoDirectory: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<string[]>(['']);
  const [status, setStatus] = useState<GooglePhotoStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [urlError, setUrlError] = useState('');

  const applyStatus = useCallback((next: GooglePhotoStatus | null, replaceUrls: boolean) => {
    if (!next) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setStatus(next);
    if (replaceUrls) setUrls(next.albums.length > 0 ? next.albums.map((album) => album.url) : ['']);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGoogleAlbums().then((next) => {
      if (!cancelled) applyStatus(next, true);
    });
    return () => { cancelled = true; };
  }, [applyStatus]);

  useEffect(() => {
    if (!status?.refreshing) return undefined;
    const timer = setInterval(() => {
      loadGoogleAlbums().then((next) => applyStatus(next, false));
    }, 2000);
    return () => clearInterval(timer);
  }, [status?.refreshing, applyStatus]);

  const cleaned = urls.map((url) => url.trim()).filter(Boolean);

  const persist = async (draft: string[]) => {
    const next = draft.map((url) => url.trim()).filter(Boolean);
    if (next.some((url) => !isGoogleShareUrl(url))) {
      setUrlError(t('settings.integrations.invalidAlbumUrl'));
      return false;
    }
    setUrlError('');
    try {
      const saved = await saveGoogleAlbums(next);
      applyStatus(saved, false);
      return saved != null;
    } catch {
      setUrlError(t('settings.integrations.invalidAlbumUrl'));
      return false;
    }
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  };

  const statusFor = (url: string) => status?.albums.find((album) => album.url === url.trim());

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.integrations.sourceDirectoryLabel')}</div>
          <div className="settings-row-sublabel">{t('settings.integrations.sourceDirectorySublabel')}</div>
        </div>
        <MediaFolderField value={photoDirectory} onChange={onPhotoDirectory} />
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">{t('settings.integrations.googleAlbumsLabel')}</div>
          <div className="settings-row-sublabel">{t('settings.integrations.googleAlbumsSublabel')}</div>
        </div>
        <div className="photo-source-editor">
          {unavailable && (
            <p className="photo-album-note">{t('settings.integrations.googleAlbumsUnavailable')}</p>
          )}
          <div className="photo-album-list">
            {urls.map((url, index) => {
              const album = statusFor(url);
              return (
                <div key={index} className="photo-album-row">
                  <input
                    type="url"
                    className="settings-input settings-input--wide"
                    value={url}
                    placeholder={t('settings.integrations.googleAlbumPlaceholder')}
                    onChange={(e) => {
                      const next = urls.slice();
                      next[index] = e.target.value;
                      setUrls(next);
                    }}
                    onBlur={(e) => {
                      const next = urls.slice();
                      next[index] = e.target.value;
                      setUrls(next);
                      persist(next);
                    }}
                  />
                  <button
                    type="button"
                    className="settings-btn"
                    aria-label={t('settings.integrations.removeAlbum')}
                    onClick={() => {
                      const next = urls.filter((_, item) => item !== index);
                      const draft = next.length > 0 ? next : [''];
                      setUrls(draft);
                      persist(draft);
                    }}
                  >
                    {t('common.remove')}
                  </button>
                  {album && (
                    <p className={`photo-album-note${album.warning ? ' photo-album-note--warn' : ''}`}>
                      {album.title ? `${album.title}. ` : ''}
                      {albumNote(album, formatTime, t)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {urlError && <p className="photo-album-note photo-album-note--warn">{urlError}</p>}
          <div className="photo-source-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setUrls((prev) => [...prev, ''])}
            >
              {t('settings.integrations.addAlbum')}
            </button>
            <button
              type="button"
              className="settings-btn settings-btn--primary"
              disabled={status?.refreshing || cleaned.some((url) => !isGoogleShareUrl(url))}
              onClick={async () => {
                const ok = await persist(urls);
                if (!ok) return;
                const next = await refreshGoogleAlbums();
                if (next) {
                  setStatus({ ...next, refreshing: true });
                }
              }}
            >
              {status?.refreshing
                ? t('settings.integrations.refreshingAlbums')
                : t('settings.integrations.refreshAlbums')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
