import { useEffect, useMemo, useState } from 'react';
import { getAllEntityStates } from '../../api/ha-rest';

export interface EntityOption {
  entity_id: string;
  label: string;
  domain: string;
}

/** Shared by every picker instance so the full entity list is fetched once, not per mount. */
let entityOptionsRequest: Promise<EntityOption[]> | null = null;

function loadEntityOptions(): Promise<EntityOption[]> {
  if (!entityOptionsRequest) {
    entityOptionsRequest = getAllEntityStates()
      .then((states) => states
        .map((state) => ({
          entity_id: state.entity_id,
          label: typeof state.attributes.friendly_name === 'string'
            ? state.attributes.friendly_name
            : state.entity_id,
          domain: state.entity_id.split('.')[0],
        }))
        .sort((a, b) => a.label.localeCompare(b.label)))
      .catch(() => {
        entityOptionsRequest = null;
        return [];
      });
  }
  return entityOptionsRequest;
}

export function invalidateEntityOptions(): void {
  entityOptionsRequest = null;
}

export function useEntityOptions(): EntityOption[] {
  const [options, setOptions] = useState<EntityOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadEntityOptions().then((loaded) => {
      if (!cancelled) setOptions(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}

export function filterEntityOptions(options: EntityOption[], search: string, domain: string): EntityOption[] {
  const term = search.trim().toLowerCase();
  return options.filter((option) => {
    if (domain && option.domain !== domain) return false;
    if (!term) return true;
    return option.label.toLowerCase().includes(term) || option.entity_id.toLowerCase().includes(term);
  });
}

/** Search + domain filters, so big Home Assistant installs stay navigable. */
function EntityFilters({ search, domain, domains, onSearch, onDomain }: {
  search: string;
  domain: string;
  domains: string[];
  onSearch: (value: string) => void;
  onDomain: (value: string) => void;
}) {
  return (
    <div className="dash-entity-filters">
      <input
        className="form-input"
        type="search"
        placeholder="Search entities…"
        aria-label="Search entities"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <select
        className="form-select"
        aria-label="Filter by domain"
        value={domain}
        onChange={(e) => onDomain(e.target.value)}
      >
        <option value="">All domains</option>
        {domains.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>
  );
}

function useDomains(options: EntityOption[]): string[] {
  return useMemo(
    () => Array.from(new Set(options.map((option) => option.domain))).sort(),
    [options],
  );
}

interface EntityPickerProps {
  value: string;
  onChange: (entityId: string) => void;
  id?: string;
}

/** Single-entity picker dropdown, like Lovelace's entity config field. */
export function EntityPicker({ value, onChange, id }: EntityPickerProps) {
  const options = useEntityOptions();
  const domains = useDomains(options);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');

  const visible = useMemo(() => {
    const filtered = filterEntityOptions(options, search, domain);
    // Keep the saved entity selectable even when it falls outside the filters.
    if (!value || filtered.some((option) => option.entity_id === value)) return filtered;
    const selected = options.find((option) => option.entity_id === value);
    return selected ? [selected, ...filtered] : filtered;
  }, [options, search, domain, value]);

  return (
    <div className="dash-entity-picker">
      <EntityFilters
        search={search}
        domain={domain}
        domains={domains}
        onSearch={setSearch}
        onDomain={setDomain}
      />
      <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select an entity…</option>
        {visible.map((option) => (
          <option key={option.entity_id} value={option.entity_id}>
            {option.label} ({option.entity_id})
          </option>
        ))}
      </select>
    </div>
  );
}

interface EntityMultiPickerProps {
  selectedIds: string[];
  onToggle: (entityId: string) => void;
}

/** Checkbox list for card fields that accept several entities. */
export function EntityMultiPicker({ selectedIds, onToggle }: EntityMultiPickerProps) {
  const options = useEntityOptions();
  const domains = useDomains(options);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');

  const visible = useMemo(() => {
    const filtered = filterEntityOptions(options, search, domain);
    const missingSelected = options.filter(
      (option) => selectedIds.includes(option.entity_id) && !filtered.includes(option),
    );
    return [...missingSelected, ...filtered];
  }, [options, search, domain, selectedIds]);

  return (
    <div className="dash-entity-picker">
      <EntityFilters
        search={search}
        domain={domain}
        domains={domains}
        onSearch={setSearch}
        onDomain={setDomain}
      />
      <div className="dash-card-picker-entity-list">
        {visible.map((option) => (
          <label key={option.entity_id} className="dash-card-picker-entity-option">
            <input
              type="checkbox"
              checked={selectedIds.includes(option.entity_id)}
              onChange={() => onToggle(option.entity_id)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
