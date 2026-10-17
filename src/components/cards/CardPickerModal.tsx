import { cardRegistry } from './registry';
import { DashboardRegion } from '../../types/dashboard-cards';
import { useTranslation } from '../../i18n';

interface CardPickerModalProps {
  region: DashboardRegion;
  onPick: (type: string) => void;
  onClose: () => void;
}

/** Modal listing card types addable to a given dashboard region. */
export function CardPickerModal({ region, onPick, onClose }: CardPickerModalProps) {
  const { t } = useTranslation();
  const options = Object.values(cardRegistry).filter((def) => def.allowedRegions.includes(region));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('cardPicker.title')}</h2>
          <button type="button" className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="modal-body">
          <div className="dash-card-picker-list">
            {options.map((def) => (
              <button
                key={def.type}
                type="button"
                className="dash-card-picker-option"
                onClick={() => onPick(def.type)}
              >
                <span className="dash-card-picker-icon">{def.icon}</span>
                <span className="dash-card-picker-name">{t(def.displayNameKey)}</span>
              </button>
            ))}
            {options.length === 0 && (
              <div className="dash-ha-card-empty">{t('cardPicker.empty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
