import { useState } from 'react';
import { useApp } from './AppContext';
import { Icon } from './Icons';
import { SheetFrame } from './Sheet';
import { openTab } from './openTab';

/**
 * The active boat on Home's top bar (P-049 A8), instead of the old `<select>`: a chip with the
 * boat's name (cut with «…») that opens «Ενεργό σκάφος». Without boats it opens «Σκάφη».
 */
export function BoatChip() {
  const { boats, activeBoat, updateSettings } = useApp();
  const [open, setOpen] = useState(false);
  const name = activeBoat?.name;
  return (
    <>
      <button
        type="button"
        className="boat-chip"
        data-testid="boat-chip"
        data-boat-id={activeBoat?.id ?? ''}
        aria-haspopup={boats.length ? 'dialog' : undefined}
        aria-label={`Ενεργό σκάφος: ${name ?? 'κανένα'}. Αλλαγή`}
        title={name}
        onClick={() => (boats.length ? setOpen(true) : openTab('boats'))}
      >
        <Icon name="boat" size={20} />
        <span className="bc-name">{name ?? 'Χωρίς σκάφος'}</span>
        <Icon name="chev-down" size={18} stroke={2.4} />
      </button>
      {open && (
        <SheetFrame title="Ενεργό σκάφος" testId="boat-sheet" onClose={() => setOpen(false)}>
          <div className="boat-pick" role="radiogroup" aria-label="Ενεργό σκάφος">
            {boats.map((b) => {
              const on = b.id === activeBoat?.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="bp-row"
                  onClick={() => {
                    updateSettings({ activeBoatId: b.id });
                    setOpen(false);
                  }}
                >
                  <span>
                    <b>{b.name}</b>
                    {b.sailNumber && <span className="small">{b.sailNumber}</span>}
                  </span>
                  {on ? <Icon name="check" size={22} stroke={2.6} /> : <span aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn text boat-pick-more"
            onClick={() => {
              setOpen(false);
              openTab('boats');
            }}
          >
            Σκάφη ›
          </button>
        </SheetFrame>
      )}
    </>
  );
}
