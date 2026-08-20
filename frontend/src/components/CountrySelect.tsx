import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { COUNTRIES, Country } from '../data/countries';

interface CountrySelectProps {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredCountries.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredCountries.length) {
        onChange(filteredCountries[highlightedIndex].countryCode);
        setIsOpen(false);
      }
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const selectedCountry = COUNTRIES.find(c => c.countryCode === value);

  const filteredCountries = COUNTRIES.filter(c => {
    const s = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(s) ||
      c.countryCode.toLowerCase().includes(s) ||
      c.iso3.toLowerCase().includes(s) ||
      c.phoneCode.toLowerCase().includes(s)
    );
  });

  return (
    <div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-64 bg-[#030303] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5fa9f2] disabled:opacity-50"
      >
        <span className="truncate">{selectedCountry ? selectedCountry.name : 'Select Country'}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 ml-2 flex-shrink-0" />
      </button>

      <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -5, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50 top-full left-0 mt-1 w-64 bg-[#0A0E17] border border-white/10 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-white/5 flex items-center bg-[#030303]">
            <Search className="w-4 h-4 text-slate-400 mr-2" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search countries..."
              className="w-full bg-transparent text-sm text-white focus:outline-none placeholder:text-slate-500"
            />
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar" ref={listRef}>
            {filteredCountries.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">No countries found</div>
            ) : (
              filteredCountries.map((country, index) => (
<button
                  key={country.countryCode}
                  type="button"
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => {
                    onChange(country.countryCode);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                    highlightedIndex === index ? 'bg-white/10' : 'hover:bg-white/5'
                  } ${
                    value === country.countryCode ? 'text-[#5fa9f2]' : 'text-slate-300'
                  }`}
                >
                  <span className="truncate">{country.name}</span>
                  {value === country.countryCode && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};
