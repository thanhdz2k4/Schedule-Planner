export default function StatsGrid({ items }) {
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <article className="stat" key={item.label}>
          <span className="stat-label">{item.label}</span>
          <strong className="stat-value">{item.value}</strong>
        </article>
      ))}
    </div>
  );
}
