import { useState, useEffect, useRef } from 'react';
import { utils, write } from 'xlsx';

const CURRENCIES = ['PLN', 'EUR', 'USD'];

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// Entries saved before incomes existed have no type and are expenses.
const isIncome = e => e?.type === 'income';

const money = (n, currency) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(n);
const number = n =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const symbol = currency =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency })
    .formatToParts(0).find(p => p.type === 'currency').value;

const sameDay = (a, b) => a.toDateString() === b.toDateString();
function dayLabel(date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export default function App() {
  const [price, setPrice] = useState('');
  const [what, setWhat] = useState('');
  const [type, setType] = useState('expense');
  const [expenses, setExpenses] = useState(() => load('expenses', []));
  const [currency, setCurrency] = useState(() => load('currency', 'PLN'));
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [shake, setShake] = useState(null);
  const [hint, setHint] = useState('');
  const [armed, setArmed] = useState(null);
  const [justAdded, setJustAdded] = useState(null);
  const [toast, setToast] = useState(null);
  const priceRef = useRef(null);
  const whatRef = useRef(null);
  const toastTimer = useRef(null);
  const jumpTimer = useRef(null);

  useEffect(() => { save('expenses', expenses); }, [expenses]);
  useEffect(() => { save('currency', currency); }, [currency]);
  useEffect(() => () => { clearTimeout(toastTimer.current); clearTimeout(jumpTimer.current); }, []);

  // The phone's number pad has no Next key, so move on to "What" by itself:
  // right away once cents are typed, or after a short pause on a whole amount.
  function changePrice(value) {
    setPrice(value);
    clearTimeout(jumpTimer.current);
    const parsed = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(parsed) || parsed <= 0) return;
    const jump = () => { if (document.activeElement === priceRef.current) whatRef.current?.focus(); };
    if (/[.,]\d{2}$/.test(value)) jump();
    else if (!/[.,]$/.test(value)) jumpTimer.current = setTimeout(jump, 1200);
  }

  function showToast(text, undo) {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function triggerShake(field, message) {
    setShake(field);
    setHint(message);
    setTimeout(() => setShake(null), 400);
  }

  function switchType(next) {
    setType(next);
    setHint('');
    priceRef.current?.focus();
  }

  function addExpense() {
    const trimmed = what.trim();
    const parsed = parseFloat(price.replace(/\s/g, '').replace(',', '.'));

    if (!price || isNaN(parsed) || parsed <= 0) { triggerShake('price', 'Enter an amount above 0.'); priceRef.current?.focus(); return; }
    if (!trimmed) { triggerShake('what', 'Add a short description, like "coffee".'); whatRef.current?.focus(); return; }

    const entry = { id: Date.now(), type, price: parsed, what: trimmed, currency, date: new Date().toISOString() };
    setExpenses(prev => [entry, ...prev]);
    setJustAdded(entry.id);
    setArmed(null);
    clearTimeout(jumpTimer.current);
    setPrice('');
    setWhat('');
    setHint('');
    // Income is a rare detour: always come back to expense.
    setType('expense');
    showToast(
      `Added ${isIncome(entry) ? 'income ' : ''}${money(parsed, currency)}`,
      () => setExpenses(prev => prev.filter(e => e.id !== entry.id)),
    );
    priceRef.current?.focus();
  }

  function deleteExpense(id) {
    const index = expenses.findIndex(e => e.id === id);
    if (index === -1) return;
    const removed = expenses[index];
    setExpenses(prev => prev.filter(e => e.id !== id));
    setArmed(null);
    showToast(`Deleted "${removed.what}"`, () =>
      setExpenses(prev => [...prev.slice(0, index), removed, ...prev.slice(index)]));
  }

  async function exportXlsx() {
    if (expenses.length === 0) return;

    const rows = expenses.map(e => ({
      Date: new Date(e.date).toLocaleDateString('pl-PL'),
      Type: isIncome(e) ? 'Income' : 'Expense',
      What: e.what,
      Price: isIncome(e) ? e.price : -e.price,
      Currency: e.currency,
    }));

    const ws = utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 32 }, { wch: 10 }, { wch: 8 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Expenses');

    const buf = write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const filename = `expenses_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] })) {
      await navigator.share({ files: [new File([blob], filename, { type: blob.type })], title: 'Expenses' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // This month's summary, in the selected currency only.
  const now = new Date();
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const inCurrency = thisMonth.filter(e => e.currency === currency);
  const spent = inCurrency.filter(e => !isIncome(e)).reduce((s, e) => s + e.price, 0);
  const [spentWhole, spentFraction] = number(spent).split(',');

  // Feed grouped by day, newest first.
  const groups = [];
  for (const e of [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date))) {
    const date = new Date(e.date);
    const last = groups[groups.length - 1];
    if (last && sameDay(last.date, date)) last.items.push(e);
    else groups.push({ date, items: [e] });
  }

  const incomeMode = type === 'income';

  return (
    <div className="root">
      {/* This month */}
      <div className="spent">
        <div className="header">
          <span className="spent-value" aria-label={`Spent this month: ${money(spent, currency)}`}>
            {spentWhole}<small>,{spentFraction} {symbol(currency)}</small>
          </span>
          <button
            className="currency-btn"
            onClick={() => setShowCurrencyPicker(p => !p)}
            aria-expanded={showCurrencyPicker}
            aria-label={`Currency: ${currency}`}
          >
            {currency} ▾
          </button>
        </div>

        {/* Currency picker */}
        {showCurrencyPicker && (
          <div className="currency-picker">
            {CURRENCIES.map(c => (
              <button
                key={c}
                className={`currency-opt${c === currency ? ' active' : ''}`}
                onClick={() => { setCurrency(c); setShowCurrencyPicker(false); }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input card */}
      <form
        className={`card${incomeMode ? ' income' : ''}`}
        noValidate
        onSubmit={e => { e.preventDefault(); addExpense(); }}
      >
        {incomeMode && (
          <div className="entry-mode">
            <span>New income</span>
            <button type="button" onClick={() => switchType('expense')}>Cancel</button>
          </div>
        )}
        <div className={`amount-row${shake === 'price' ? ' shake' : ''}`}>
          <input
            ref={priceRef}
            id="amount"
            className="price-input"
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Amount"
            autoComplete="off"
            value={price}
            onChange={e => changePrice(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(jumpTimer.current); whatRef.current?.focus(); } }}
            autoFocus
          />
          <span className="amount-currency">{symbol(currency)}</span>
        </div>
        <input
          ref={whatRef}
          id="what"
          className={`what-input${shake === 'what' ? ' shake' : ''}`}
          type="text"
          aria-label="What"
          autoComplete="off"
          placeholder={incomeMode ? 'Salary, refund…' : 'What was it?'}
          value={what}
          onChange={e => setWhat(e.target.value)}
        />
        {hint && <div className="hint" role="alert">{hint}</div>}
        <button type="submit" className={`add-btn${incomeMode ? ' income' : ''}`}>
          {incomeMode ? 'Add income' : 'Add expense'}
        </button>
        {!incomeMode && (
          <button type="button" className="quiet-btn" onClick={() => switchType('income')}>
            Add income instead
          </button>
        )}
      </form>

      {/* Entries by day */}
      {groups.length === 0 ? (
        <p className="empty">Nothing here yet. Your first expense will show up here.</p>
      ) : (
        <div className="list">
          {groups.map(g => {
            return (
              <div key={g.date.toDateString()} className="day">
                <div className="day-head">{dayLabel(g.date)}</div>
                <div className="day-group">
                  {g.items.map(e => (
                    <div
                      key={e.id}
                      className={`expense-item${isIncome(e) ? ' income' : ''}${e.id === justAdded ? ' new' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${e.what}, ${money(e.price, e.currency)}${isIncome(e) ? ', income' : ''}. Tap for options`}
                      onClick={() => setArmed(a => (a === e.id ? null : e.id))}
                      onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); setArmed(a => (a === e.id ? null : e.id)); } }}
                      onAnimationEnd={() => setJustAdded(null)}
                    >
                      <span className="expense-what">{e.what}</span>
                      {armed === e.id ? (
                        <button
                          type="button"
                          className="delete-btn"
                          onClick={ev => { ev.stopPropagation(); deleteExpense(e.id); }}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="expense-price">
                          {isIncome(e) ? '+' : ''}{number(e.price)}
                          {e.currency !== currency && <span className="expense-currency"> {e.currency}</span>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Export */}
      {expenses.length > 0 && (
        <button className="quiet-btn export-btn" onClick={exportXlsx}>Export to Excel</button>
      )}

      {/* Toast */}
      <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite">
        <span>{toast?.text}</span>
        {toast?.undo && (
          <button
            type="button"
            onClick={() => { toast.undo(); clearTimeout(toastTimer.current); setToast(null); }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
