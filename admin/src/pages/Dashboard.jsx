import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatInr, typeLabel } from '../api.js';

function Stat({ label, value, tone }) {
  return (
    <div className={`card stat stat-${tone}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function BarList({ title, rows, empty = 'No registrations yet.' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="barlist">
          {rows.map((r) => (
            <li key={r.label}>
              <span className="barlist-label">{r.label}</span>
              <span className="barlist-track"><span className="barlist-bar" style={{ width: `${(r.value / max) * 100}%` }} /></span>
              <span className="barlist-value">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Daily({ rows }) {
  // Fill the last 14 days so gaps show as zero
  const map = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    days.push({ key, label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), registrations: r?.registrations || 0, paid: r?.paid || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.registrations));
  return (
    <div className="card span-2">
      <div className="card-head">
        <h3>Last 14 days</h3>
        <div className="legend">
          <span><i className="dot dot-all" /> Registered</span>
          <span><i className="dot dot-paid" /> Paid</span>
        </div>
      </div>
      <div className="columns" role="img" aria-label="Registrations and paid registrations per day for the last 14 days">
        {days.map((d) => (
          <div className="col" key={d.key} title={`${d.label}: ${d.registrations} registered, ${d.paid} paid`}>
            <div className="col-bars">
              <span className="col-bar col-all" style={{ height: `${(d.registrations / max) * 100}%` }} />
              <span className="col-bar col-paid" style={{ height: `${(d.paid / max) * 100}%` }} />
            </div>
            <span className="col-label">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.stats().then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="alert">{error}</p>;
  if (!stats) return <p className="muted">Loading…</p>;

  const conversion = stats.total ? Math.round((stats.paid / stats.total) * 100) : 0;

  return (
    <>
      <header className="page-head">
        <h1>Dashboard</h1>
        <Link className="btn btn-primary" to="/registrations">View registrations</Link>
      </header>
      <div className="grid stats-grid">
        <Stat label="Revenue collected" value={formatInr(stats.revenuePaise)} tone="teal" />
        <Stat label="Paid students" value={stats.paid} tone="violet" />
        <Stat label="Payment pending" value={stats.pending} tone="yellow" />
        <Stat label="Payment failed" value={stats.failed} tone="coral" />
        <Stat label="Total registrations" value={stats.total} tone="plain" />
        <Stat label="Conversion to paid" value={`${conversion}%`} tone="plain" />
        <Stat label="New in last 24 hours" value={stats.last24h} tone="plain" />
        <Link className="card stat stat-link" to="/registrations?concession=1">
          <span className="stat-label">Concession requests to call</span>
          <span className="stat-value">{stats.concessionPending}</span>
        </Link>
      </div>
      <div className="grid two-col">
        <Daily rows={stats.daily} />
        <BarList
          title="Registrations by category"
          rows={stats.byType.map((r) => ({ label: typeLabel[r.studentType] || r.studentType, value: r.count }))}
        />
        <BarList
          title="Paid by category"
          empty="No paid registrations yet."
          rows={stats.byType.filter((r) => r.paid > 0).map((r) => ({ label: typeLabel[r.studentType] || r.studentType, value: r.paid }))}
        />
      </div>
    </>
  );
}
