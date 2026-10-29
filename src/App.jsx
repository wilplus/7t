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

export default function App() {
  const [price, setPrice] = useState('');
  const [what, setWhat] = useState('');
  const [type, setType] = useState('expense');
  const [expenses, setExpenses] = useState(() => load('expenses', []));
  const [currency, setCurrency] = useState(() => load('currency', 'PLN'));
  const [showList, setShowList] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [shake, setShake] = useState(null);
  const priceRef = useRef(null);
  const whatRef = useRef(null);

  useEffect(() => { save('expenses', expenses); }, [expenses]);
  useEffect(() => { save('currency', currency); }, [currency]);

  function triggerShake(field) {
    setShake(field);
    setTimeout(() => setShake(null), 400);
  }

  function addExpense() {
    const trimmed = what.trim();
    const parsed = parseFloat(price.replace(',', '.'));

    if (!trimmed) { triggerShake('what'); whatRef.current?.focus(); return; }
    if (!price || isNaN(parsed) || parsed <= 0) { triggerShake('price'); priceRef.current?.focus(); return; }

    const entry = { id: Date.now(), type, price: parsed, what: trimmed, currency, date: new Date().toISOString() };
    setExpenses(prev => [entry, ...prev]);
    setPrice('');
    setWhat('');
    priceRef.current?.focus();
  }

  function deleteExpense(id) {
    const entry = expenses.find(e => e.id === id);
    if (window.confirm(`Remove this ${isIncome(entry) ? 'income' : 'expense'}?`)) {
      setExpenses(prev => prev.filter(e => e.id !== id));
    }
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

  const incomeTotal = expenses.filter(isIncome).reduce((s, e) => s + e.price, 0);
  const expenseTotal = expenses.filter(e => !isIncome(e)).reduce((s, e) => s + e.price, 0);
  const balance = incomeTotal - expenseTotal;
  const fmt = n => Number.isInteger(n) ? n.toString() : n.toFixed(2);

  return (
    <div className="root">
      {/* Header */}
      <div className="header">
        <h1 className="title">Expenses</h1>
        <button className="currency-btn" onClick={() => setShowCurrencyPicker(p => !p)}>
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

      {/* Input card */}
      <div className="card">
        <div className="type-toggle">
          <button
            className={`type-opt${type === 'expense' ? ' active expense' : ''}`}
            onClick={() => { setType('expense'); priceRef.current?.focus(); }}
          >
            Expense
          </button>
          <button
            className={`type-opt${type === 'income' ? ' active income' : ''}`}
            onClick={() => { setType('income'); priceRef.current?.focus(); }}
          >
            Income
          </button>
        </div>
        <div className="input-row">
          <div className="field">
            <label className="label">{type === 'income' ? 'Amount' : 'Price'}</label>
            <input
              ref={priceRef}
              className={`price-input${shake === 'price' ? ' shake' : ''}`}
              type="decimal"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && whatRef.current?.focus()}
              autoFocus
            />
          </div>
          <div className="field field-what">
            <label className="label">What</label>
            <input
              ref={whatRef}
              className={`what-input${shake === 'what' ? ' shake' : ''}`}
              type="text"
              placeholder={type === 'income' ? 'salary, refund…' : 'coffee, groceries…'}
              value={what}
              onChange={e => setWhat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExpense()}
            />
          </div>
        </div>
        <button className={`add-btn${type === 'income' ? ' income' : ''}`} onClick={addExpense}>
          {type === 'income' ? '+ Add income' : '+ Add expense'}
        </button>
      </div>

      {/* Totals */}
      {expenses.length > 0 && (
        <div className="totals">
          <div className="totals-cell">
            <span className="label">Income</span>
            <span className="totals-value income">+{fmt(incomeTotal)}</span>
          </div>
          <div className="totals-cell">
            <span className="label">Expenses</span>
            <span className="totals-value expense">−{fmt(expenseTotal)}</span>
          </div>
        </div>
      )}

      {/* Summary row */}
      {expenses.length > 0 && (
        <div className="summary-row">
          <button className="list-toggle" onClick={() => setShowList(p => !p)}>
            {showList ? 'Hide list' : `Show list (${expenses.length})`}
          </button>
          <span className={`total${balance < 0 ? ' negative' : ''}`}>
            <span className="balance-label">Balance</span>
            {balance < 0 ? '−' : ''}{fmt(Math.abs(balance))} {currency}
          </span>
        </div>
      )}

      {/* Expense list */}
      {showList && (
        <div className="list">
          {expenses.map(e => (
            <div key={e.id} className={`expense-item${isIncome(e) ? ' income' : ''}`} onContextMenu={ev => { ev.preventDefault(); deleteExpense(e.id); }}>
              <div className="expense-left">
                <span className="expense-what">{e.what}</span>
                <span className="expense-date">{new Date(e.date).toLocaleDateString('pl-PL')}</span>
              </div>
              <div className="expense-right">
                <span className="expense-price">{isIncome(e) ? '+' : '−'}{fmt(e.price)}</span>
                <span className="expense-currency">{e.currency}</span>
              </div>
              <button className="delete-btn" onClick={() => deleteExpense(e.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Export */}
      {expenses.length > 0 && (
        <button className="export-btn" onClick={exportXlsx}>Export to Excel</button>
      )}
    </div>
  );
}
