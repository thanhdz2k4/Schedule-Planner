export function BarChart({ title, labels, values }) {
  const max = Math.max(...values, 1);

  return (
    <div className="chart-card premium-chart">
      <h4>{title}</h4>
      <div className="bars">
        {labels.map((label, index) => {
          const value = values[index] || 0;
          const height = Math.max(8, Math.round((value / max) * 140));
          return (
            <div className="bar-item" key={`${label}-${index}`}>
              <small className="bar-value">{value}</small>
              <div className="bar" style={{ height }} title={`${label}: ${value}`} />
              <small>{label}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LineChart({ title, labels, values }) {
  const max = Math.max(...values, 1);

  return (
    <div className="chart-card premium-chart">
      <h4>{title}</h4>
      <div className="line-grid">
        {labels.map((label, index) => {
          const value = values[index] || 0;
          const top = 100 - Math.round((value / max) * 100);
          return (
            <div className="line-point" key={`${label}-${index}`}>
              <div className="dot" style={{ top: `${top}%` }} title={`${label}: ${value}`} />
              <small className="dot-value">{value}</small>
              <small>{label}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
