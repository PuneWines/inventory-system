import React, { useState, useEffect, useRef, useMemo } from 'react';

export default function SearchableDropdown({ value, onChange, items = [], placeholder = 'Search item...', error }) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);

  // Filter items based on search input
  const filtered = useMemo(() => {
    return items.filter(item =>
      (item.item_name || item.name || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [search, items]);

  // Sync search input with value from parent
  useEffect(() => {
    const selectedItem = items.find(item => (item.item_name || item.name) === value);
    if (selectedItem) {
      setSearch(selectedItem.item_name || selectedItem.name);
    } else {
      setSearch(value || '');
    }
  }, [value, items]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      setHighlightedIndex(prev => (prev + 1) % filtered.length);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
        selectItem(filtered[highlightedIndex]);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      e.preventDefault();
    }
  };

  const selectItem = (item) => {
    onChange(item);
    setSearch(item.item_name || item.name);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
            if (!e.target.value) {
              onChange({ id: null, item_name: '', name: '', rate: 0, lastClosing: 0 });
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full bg-white border rounded-xl pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${
            error ? 'border-rose-500 ring-2 ring-rose-500/10' : 'border-slate-300 focus:border-indigo-500'
          }`}
        />
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <ul className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 focus:outline-none shadow-none scrollbar-thin scrollbar-thumb-slate-200">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => {
              const name = item.item_name || item.name;
              return (
                <li
                  key={item.id || idx}
                  onClick={() => selectItem(item)}
                  className={`px-4 py-2.5 text-sm text-slate-800 cursor-pointer transition-colors flex items-center justify-between ${
                    idx === highlightedIndex || name === value
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <span>{name}</span>
                  {item.rate !== undefined && item.rate !== null && (
                    <span className={`text-xs ${idx === highlightedIndex || name === value ? 'text-indigo-200' : 'text-slate-500'}`}>
                      ₹{item.rate}
                    </span>
                  )}
                </li>
              );
            })
          ) : (
            <li className="px-4 py-3 text-sm text-slate-500 italic text-center">
              No matching items
            </li>
          )}
        </ul>
      )}
      {error && <span className="text-[11px] font-medium text-rose-500 mt-1 block">{error}</span>}
    </div>
  );
}
