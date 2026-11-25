import { useTranslation } from '../i18n';

/** Small marker while guest mode limits what this screen shows. */
export function GuestBadge() {
  const { t } = useTranslation();
  return (
    <div className="guest-badge" role="status">
      {t('guest.badge')}
    </div>
  );
}
