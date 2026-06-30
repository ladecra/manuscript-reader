import { ChevronRightIcon } from '../ui/Icons';
import { PRIMARY_EDITIONS, studioFormat, type StudioFormatId } from './studioFormats';

const selectedEdition = (id: StudioFormatId) => studioFormat(id).edition;

interface StudioEditionPickerProps {
  selected: StudioFormatId;
  onSelect: (id: StudioFormatId) => void;
  disabled?: boolean;
  /** Opens the first assembly stage that needs attention, or the first stage. */
  onContinue: () => void;
  /** Markdown advanced-export escape hatch (no assembly stage). */
  onAdvanced?: () => void;
}

/** Hero edition control: the author picks *what they are preparing*. A mode
 *  switch, not a step — changing it recomputes the rail with no data loss. */
export function StudioEditionPicker({
  selected,
  onSelect,
  disabled,
  onContinue,
  onAdvanced,
}: StudioEditionPickerProps) {
  return (
    <div className="studio-edition">
      <div className="studio-edition-head">
        <h3 className="studio-edition-section-label">Publish an edition</h3>
        <button
          type="button"
          className="studio-edition-forward"
          disabled={disabled}
          onClick={onContinue}
        >
          Continue to {selectedEdition(selected)}
          <ChevronRightIcon size={13} className="studio-edition-forward-icon" aria-hidden="true" />
        </button>
      </div>
      <div
        className="studio-edition-cards"
        role="radiogroup"
        aria-label="Choose an edition to prepare"
      >
        {PRIMARY_EDITIONS.map(id => {
          const f = studioFormat(id);
          const active = id === selected;
          const Art = f.Art;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`studio-edition-card${active ? ' studio-edition-card--selected' : ''}`}
              disabled={disabled}
              onClick={() => onSelect(id)}
            >
              <span className="studio-edition-card-art" aria-hidden="true">
                {Art && <Art size={62} />}
              </span>
              <span className="studio-edition-card-name">{f.edition}</span>
              <span className="studio-edition-card-format">{f.formatLine}</span>
              <span className="studio-edition-card-spec">{f.specLine}</span>
            </button>
          );
        })}
      </div>
      {onAdvanced && (
        <div className="studio-edition-advanced-wrap">
          <button type="button" className="studio-edition-advanced" disabled={disabled} onClick={onAdvanced}>
            Advanced export · Markdown
          </button>
        </div>
      )}
    </div>
  );
}
