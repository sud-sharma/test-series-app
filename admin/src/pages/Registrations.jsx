import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatInr, formatDate, typeLabel, isConcession } from '../api.js';

const PAGE_SIZE = 20;

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function Detail({ id, onClose, onDeleted }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.registration(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function remove() {
    if (!window.confirm('Delete this unpaid registration? This cannot be undone.')) return;
    try {
      await api.deleteRegistration(id);
      onDeleted();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Registration details" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Registration #{id}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <p className="alert">{error}</p>}
        {!data ? (
          !error && <p className="muted">Loading…</p>
        ) : (
          <>
            <dl className="details">
              <dt>Name</dt><dd>{data.name}</dd>
              <dt>Phone</dt><dd><a href={`tel:+91${data.phone}`}>{data.phone}</a></dd>
              <dt>Email</dt><dd><a href={`mailto:${data.email}`}>{data.email}</a></dd>
              <dt>Category</dt>
              <dd>
                {typeLabel[data.studentType]}
                {isConcession(data.studentType) && data.status !== 'paid' && (
                  <span className="badge badge-concession">Call to confirm concession fee</span>
                )}
              </dd>
              <dt>City</dt><dd>{data.city || '—'}</dd>
              <dt>Status</dt><dd><StatusBadge status={data.status} /></dd>
              <dt>Fee</dt><dd>{formatInr(data.amountPaise)}</dd>
              <dt>Registered</dt><dd>{formatDate(data.createdAt)}</dd>
              <dt>Paid at</dt><dd>{formatDate(data.paidAt)}</dd>
            </dl>
            <h3>Payment attempts</h3>
            {data.payments.length === 0 ? (
              <p className="muted">No payment started yet.</p>
            ) : (
              <ul className="attempts">
                {data.payments.map((p) => (
                  <li key={p.id}>
                    <div className="attempt-top">
                      <StatusBadge status={p.status === 'created' ? 'pending' : p.status} />
                      <span>{formatInr(p.amountPaise)}{p.method ? ` · ${p.method}` : ''}</span>
                    </div>
                    <code>Order: {p.orderId}</code>
                    {p.paymentId && <code>Payment: {p.paymentId}</code>}
                    {p.errorDescription && <span className="muted">{p.errorDescription}</span>}
                    <span className="muted">{formatDate(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.status !== 'paid' && (
              <button type="button" className="btn btn-danger" onClick={remove}>Delete registration</button>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

export default function Registrations() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState(() =>
    params.get('concession')
      ? { search: '', status: 'pending', studentType: 'concession' }
      : { search: '', status: '', studentType: '' }
  );
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === search ? f : { ...f, search }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .registrations({ ...filters, page, limit: PAGE_SIZE })
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(load, [load]);

  const setFilter = (key) => (e) => {
    setFilters((f) => ({ ...f, [key]: e.target.value }));
    setPage(1);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      await api.exportCsv(filters);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <>
      <header className="page-head">
        <h1>Registrations</h1>
        <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </header>

      <div className="card filters">
        <label className="field grow">
          Search
          <input type="search" placeholder="Name, email, phone or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="field">
          Status
          <select value={filters.status} onChange={setFilter('status')}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="field">
          Category
          <select value={filters.studentType} onChange={setFilter('studentType')}>
            <option value="">All</option>
            <option value="concession">All concession categories</option>
            <option value="new">New student</option>
            <option value="old_student">Old student</option>
            <option value="repeater">Repeater</option>
            <option value="optional_student">Optional student</option>
          </select>
        </label>
      </div>

      {error && <p className="alert">{error}</p>}

      <div className="card table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Phone</th>
                <th>Category</th>
                <th>City</th>
                <th>Status</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setOpenId(r.id)}>{r.name}</button>
                    <span className="sub">{r.email}</span>
                  </td>
                  <td>{r.phone}</td>
                  <td>{typeLabel[r.studentType]}</td>
                  <td>{r.city || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{formatDate(r.createdAt)}</td>
                </tr>
              ))}
              {!loading && result.data.length === 0 && (
                <tr><td colSpan={7} className="empty">No registrations match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="muted">{loading ? 'Loading…' : `${result.total} total`}</span>
          <div className="pager-btns">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {openId && (
        <Detail
          id={openId}
          onClose={() => setOpenId(null)}
          onDeleted={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
    </>
  );
}
