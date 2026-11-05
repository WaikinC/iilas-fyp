import './risk-score-breakdown.css';

type Score = {label: string; value: number};

const validScore = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;

export default function RiskScoreBreakdown({scores, selectedLabel}: {scores: Score[]; selectedLabel?: string}) {
  if (!scores.length) return null;
  return <details className="risk-score-breakdown">
    <summary>How to read the model scores</summary>
    <p>The Random Forest combines estimates from its decision trees. The largest score determines the saved label. Compare these percentages within this assessment. Real-world outcome rates need separate validation.</p>
    <dl aria-label="Model scores by label">
      {scores.map(({label, value}) => {
        const valid = validScore(value);
        const chosen = label === selectedLabel;
        return <div className="risk-score-row" key={label} data-chosen={chosen}>
          <dt>{label}{chosen && <span className="risk-score-choice">Model choice</span>}</dt>
          <dd>{valid ? `${(value * 100).toFixed(1)}%` : 'Unavailable'}</dd>
          {valid && <dd className="risk-score-track" aria-hidden="true">
            <span style={{width: `${value * 100}%`}}/>
          </dd>}
        </div>;
      })}
    </dl>
  </details>;
}
