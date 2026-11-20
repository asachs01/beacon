import { useEffect, useRef, useState } from 'react';
import type { FontApplyStatus } from '../hooks/useAppliedFonts';
import { idbFontStore } from '../fonts/store';
import {
  BUILTIN_FONT_IDS,
  DEFAULT_BODY_FONT,
  DEFAULT_HEADING_FONT,
  sanitizeGoogleFamily,
  type BuiltinFontId,
  type FontSelection,
} from '../fonts/selection';
import { displayFileName, readValidWoff2 } from '../fonts/woff2';
import { useTranslation, type TranslationKey } from '../i18n';

const BUILTIN_LABEL_KEYS: Record<BuiltinFontId, TranslationKey> = {
  system: 'settings.appearance.font.system',
  fraunces: 'settings.appearance.font.fraunces',
  inter: 'settings.appearance.font.inter',
  'atkinson-hyperlegible': 'settings.appearance.font.atkinson',
  lexend: 'settings.appearance.font.lexend',
  nunito: 'settings.appearance.font.nunito',
  'source-sans-3': 'settings.appearance.font.sourceSans',
  literata: 'settings.appearance.font.literata',
};

type UploadError = 'type' | 'size' | 'invalid' | 'storage';

const UPLOAD_ERROR_KEYS: Record<UploadError, TranslationKey> = {
  type: 'settings.appearance.fontErrorType',
  size: 'settings.appearance.fontErrorSize',
  invalid: 'settings.appearance.fontErrorInvalid',
  storage: 'settings.appearance.fontErrorStorage',
};

interface FontSettingsProps {
  headingFont: FontSelection;
  bodyFont: FontSelection;
  status: FontApplyStatus;
  onUpdate: (patch: { headingFont?: FontSelection; bodyFont?: FontSelection }) => void;
}

export function FontSettings({ headingFont, bodyFont, status, onUpdate }: FontSettingsProps) {
  const { t } = useTranslation();
  const notice = status.headingFellBack && status.bodyFellBack
    ? t('settings.appearance.fontFallbackBoth')
    : status.headingFellBack
      ? t('settings.appearance.fontFallbackHeading')
      : status.bodyFellBack
        ? t('settings.appearance.fontFallbackBody')
        : null;

  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('settings.appearance.fontsTitle')}</div>
      <p className="settings-font-intro">{t('settings.appearance.fontsDesc')}</p>
      {notice && (
        <div className="settings-font-notice" role="status">
          {notice}
        </div>
      )}
      <FontChoice
        role="heading"
        label={t('settings.appearance.headingFontLabel')}
        selection={headingFont}
        previewFamily="var(--font-family-heading)"
        onChange={(headingFontNext) => onUpdate({ headingFont: headingFontNext })}
      />
      <FontChoice
        role="body"
        label={t('settings.appearance.bodyFontLabel')}
        selection={bodyFont}
        previewFamily="var(--font-family-body)"
        onChange={(bodyFontNext) => onUpdate({ bodyFont: bodyFontNext })}
      />
    </div>
  );
}

function selectValue(selection: FontSelection): string {
  return selection.kind === 'builtin' ? selection.id : selection.kind;
}

function FontChoice({
  role,
  label,
  selection,
  previewFamily,
  onChange,
}: {
  role: 'heading' | 'body';
  label: string;
  selection: FontSelection;
  previewFamily: string;
  onChange: (next: FontSelection) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [googleDraft, setGoogleDraft] = useState(
    selection.kind === 'google' ? selection.family : '',
  );
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (selection.kind === 'google') setGoogleDraft(selection.family);
  }, [selection]);

  useEffect(() => {
    if (selection.kind !== 'google') return;
    if (googleDraft === selection.family) return;
    const timer = window.setTimeout(() => {
      onChangeRef.current({ kind: 'google', family: googleDraft });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [googleDraft, selection]);

  useEffect(() => {
    if (selection.kind !== 'upload') {
      setFileName(null);
      return;
    }
    let cancelled = false;
    const uploadId = selection.id;
    void idbFontStore.get(uploadId).then((record) => {
      if (!cancelled) setFileName(record?.fileName ?? null);
    }).catch(() => {
      if (!cancelled) setFileName(null);
    });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const googleInvalid = selection.kind === 'google'
    && googleDraft.trim().length > 0
    && sanitizeGoogleFamily(googleDraft) === null;

  const openFilePicker = () => {
    setUploadError(null);
    fileRef.current?.click();
  };

  const handleSelect = (value: string) => {
    setUploadError(null);
    if (value === 'upload') {
      openFilePicker();
      return;
    }
    if (value === 'google') {
      onChange({
        kind: 'google',
        family: selection.kind === 'google' ? selection.family : '',
      });
      return;
    }
    if ((BUILTIN_FONT_IDS as readonly string[]).includes(value)) {
      onChange({ kind: 'builtin', id: value as BuiltinFontId });
    }
  };

  const handleFile = async (file: File) => {
    const checked = await readValidWoff2(file);
    if (!checked.ok) {
      setUploadError(checked.error);
      return;
    }
    const id = crypto.randomUUID();
    const previousId = selection.kind === 'upload' ? selection.id : null;
    try {
      await idbFontStore.put({
        id,
        fileName: displayFileName(file.name),
        data: checked.data,
      });
    } catch {
      setUploadError('storage');
      return;
    }
    if (previousId && previousId !== id) {
      void idbFontStore.delete(previousId).catch(() => {
        /* the new file is already the active choice */
      });
    }
    setUploadError(null);
    onChange({ kind: 'upload', id });
  };

  const removeUpload = () => {
    if (selection.kind === 'upload') {
      void idbFontStore.delete(selection.id).catch(() => {
        /* dropping the choice still leaves settings consistent */
      });
    }
    onChange(role === 'heading' ? DEFAULT_HEADING_FONT : DEFAULT_BODY_FONT);
  };

  const selectId = `settings-font-${role}`;

  return (
    <div className="settings-font-choice">
      <label className="settings-row-label" htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        className="settings-select settings-font-select"
        value={selectValue(selection)}
        onChange={(event) => handleSelect(event.target.value)}
      >
        <optgroup label={t('settings.appearance.builtinGroup')}>
          {BUILTIN_FONT_IDS.map((id) => (
            <option key={id} value={id}>{t(BUILTIN_LABEL_KEYS[id])}</option>
          ))}
        </optgroup>
        <optgroup label={t('settings.appearance.customGroup')}>
          <option value="google">{t('settings.appearance.font.google')}</option>
          <option value="upload">{t('settings.appearance.font.upload')}</option>
        </optgroup>
      </select>

      {selection.kind === 'google' && (
        <div className="settings-font-custom">
          <label className="settings-font-note" htmlFor={`${selectId}-google`}>
            {t('settings.appearance.googleFamilyLabel')}
          </label>
          <input
            id={`${selectId}-google`}
            className="settings-input settings-font-input"
            value={googleDraft}
            placeholder={t('settings.appearance.googleFamilyPlaceholder')}
            spellCheck={false}
            autoCapitalize="words"
            maxLength={60}
            onChange={(event) => setGoogleDraft(event.target.value)}
          />
          <p className="settings-font-note">{t('settings.appearance.googleNeedsInternet')}</p>
          {googleInvalid && (
            <p className="settings-font-error">{t('settings.appearance.googleFamilyInvalid')}</p>
          )}
        </div>
      )}

      {selection.kind === 'upload' && (
        <div className="settings-font-custom">
          {fileName && (
            <p className="settings-font-note">
              {t('settings.appearance.uploadCurrent', { name: fileName })}
            </p>
          )}
          <p className="settings-font-note">{t('settings.appearance.uploadHint')}</p>
          <div className="settings-font-actions">
            <button type="button" className="settings-btn" onClick={openFilePicker}>
              {fileName ? t('settings.appearance.uploadReplace') : t('settings.appearance.uploadButton')}
            </button>
            <button type="button" className="settings-btn" onClick={removeUpload}>
              {t('settings.appearance.uploadRemove')}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".woff2,font/woff2"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {uploadError && (
        <p className="settings-font-error">{t(UPLOAD_ERROR_KEYS[uploadError])}</p>
      )}

      <p
        className={`settings-font-preview ${role === 'heading' ? 'settings-font-preview--heading' : ''}`}
        style={{ fontFamily: previewFamily }}
      >
        {t('settings.appearance.fontPreview')}
      </p>
    </div>
  );
}
