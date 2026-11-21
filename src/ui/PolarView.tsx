import { useState } from 'react';
import { useApp } from './AppContext';
import { PolarChart } from './PolarChart';
import { optimums } from '../performance/polar';
import { recommendSail } from '../performance/sails';
import { num } from '../format';

export function PolarView() {
  const { activeBoat: boat } = useApp();
  const [tws, setTws] = useState(10);
  if (!boat?.polar) return <p className="card">Το σκάφος δεν έχει polars. Πρόσθεσέ τα από «Σκάφη» → «Επεξεργασία» ή από το πιστοποιητικό ORC.</p>;
  const p = boat.polar;
  const f = boat.performanceFactor || 1;

  return (
    <div className="polar-view">
      <div className="chips" role="group" aria-label="TWS">
        {p.tws.map((t) => (
          <button key={t} className={`chip ${t === tws ? 'on' : ''}`} onClick={() => setTws(t)}>
            {t} kt
          </button>
        ))}
      </div>
      <div className="card">
        <PolarChart boat={boat} twsList={p.tws.filter((t) => t !== tws)} tws={tws} />
        {f !== 1 && <p className="muted small">Οι ταχύτητες είναι στο {Math.round(f * 100)}% των polars του πιστοποιητικού.</p>}
      </div>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>TWS</th>
              <th>Όρτσα °</th>
              <th>BSP</th>
              <th>VMG</th>
              <th>Πρίμα °</th>
              <th>BSP</th>
              <th>VMG</th>
              <th>Πανί όρτσας</th>
              <th>Πανί πρίμα</th>
            </tr>
          </thead>
          <tbody>
            {p.tws.map((t) => {
              const o = optimums(p, t);
              return (
                <tr key={t} className={t === tws ? 'hl' : ''} onClick={() => setTws(t)}>
                  <td>{t}</td>
                  <td>{num(o.beat.angle)}</td>
                  <td>{num(o.beat.bsp * f, 2)}</td>
                  <td>{num(o.beat.vmg * f, 2)}</td>
                  <td>{num(o.run.angle)}</td>
                  <td>{num(o.run.bsp * f, 2)}</td>
                  <td>{num(o.run.vmg * f, 2)}</td>
                  <td>{recommendSail(boat, t, o.beat.angle)?.name ?? '—'}</td>
                  <td>{recommendSail(boat, t, o.run.angle)?.name ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
