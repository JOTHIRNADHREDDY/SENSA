import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';
import { COUNTRIES, CountryMetadata } from '../data/countries';

export interface PhoneData {
  country_code: string;
  country_iso2: string;
  country_name: string;
  phone_number: string;
  phone_e164: string;
  is_valid: boolean;
}

interface PhoneInputProps {
  value: PhoneData;
  onChange: (val: PhoneData) => void;
  error?: string;
}

// Popular countries to show at the top
const POPULAR_ISO2 = ['US', 'GB', 'IN', 'CA', 'AU'];

export const PhoneInput: React.FC<PhoneInputProps> = ({ value, onChange, error }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track recently used
  const [recentIso2s, setRecentIso2s] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sensa_recent_countries');
      if (stored) {
        setRecentIso2s(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  const saveRecent = (iso2: string) => {
    try {
      const updated = [iso2, ...recentIso2s.filter(code => code !== iso2)].slice(0, 5);
      setRecentIso2s(updated);
      localStorage.setItem('sensa_recent_countries', JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  };

  // Group countries
  const groupedCountries = useMemo(() => {
    const s = search.trim().toLowerCase();
    
    let filtered = COUNTRIES;
    if (s) {
      filtered = COUNTRIES.filter(c => 
        c.name.toLowerCase().includes(s) || 
        c.dialCode.includes(s) ||
        c.iso2.toLowerCase().includes(s) ||
        c.iso3.toLowerCase().includes(s) ||
        c.aliases.some(a => a.toLowerCase().includes(s))
      );
      
      // If searching, just return the flat filtered list
      return { searchResults: filtered };
    }

    // Default view: Recent, Popular, All
    const recent = recentIso2s
      .map(iso2 => COUNTRIES.find(c => c.iso2 === iso2))
      .filter(Boolean) as CountryMetadata[];
      
    const popular = POPULAR_ISO2
      .filter(iso2 => !recentIso2s.includes(iso2))
      .map(iso2 => COUNTRIES.find(c => c.iso2 === iso2))
      .filter(Boolean) as CountryMetadata[];

    // All countries (excluding recent and popular from the top, or just show all below)
    // Actually, usually "All" shows everything to avoid confusion if someone scrolls.
    const all = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));

    return { recent, popular, all };
  }, [search, recentIso2s]);

  const selectedCountry = COUNTRIES.find(c => c.iso2 === value.country_iso2) || COUNTRIES.find(c => c.iso2 === 'US') || COUNTRIES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      // Try to scroll selected into view slightly after render
      setTimeout(() => {
        const selectedEl = dropdownRef.current?.querySelector('[aria-selected="true"]');
        if (selectedEl) {
          selectedEl.scrollIntoView({ block: 'nearest' });
        }
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const cleanNumber = rawValue.replace(/[^\d\s\-\(\)]/g, '');
    
    validateAndEmit(selectedCountry, cleanNumber);
  };

  const selectCountry = (country: CountryMetadata) => {
    saveRecent(country.iso2);
    validateAndEmit(country, value.phone_number);
    setIsOpen(false);
    setSearch('');
    inputRef.current?.focus();
  };

  const validateAndEmit = (country: CountryMetadata, localNumber: string) => {
    const justDigits = localNumber.replace(/\D/g, '');
    let e164 = `${country.dialCode}${justDigits}`;
    let isValid = false;

    if (justDigits) {
      try {
        // Try parsing with libphonenumber-js
        const phoneNumber = parsePhoneNumberFromString(localNumber, country.iso2 as CountryCode);
        if (phoneNumber) {
          e164 = phoneNumber.number;
          isValid = phoneNumber.isValid();
        } else {
           // Fallback to basic length validation if parsing fails completely but some digits exist
           // This handles partial entries gracefully
           isValid = justDigits.length >= 5;
        }
      } catch (err) {
        // Fallback
        isValid = justDigits.length >= 5;
      }
    }

    onChange({
      country_code: country.dialCode,
      country_iso2: country.iso2,
      country_name: country.name,
      phone_number: localNumber,
      phone_e164: e164,
      is_valid: isValid
    });
  };

  const renderCountryOption = (country: CountryMetadata) => {
    const isSelected = country.iso2 === value.country_iso2;
    return (
      <li key={`${country.iso2}-${country.dialCode}`}>
        <button
          type="button"
          onClick={() => selectCountry(country)}
          className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800 transition-colors ${isSelected ? 'bg-slate-800/50' : ''}`}
          role="option"
          aria-selected={isSelected}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">{country.flag}</span>
            <span className="text-sm text-slate-200">{country.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">{country.dialCode}</span>
            {isSelected && <Check className="w-4 h-4 text-sky-500" />}
          </div>
        </button>
      </li>
    );
  };

  return (
    <div className="relative">
      <div className={`flex items-center gap-2 rounded-xl bg-slate-950 border transition-colors ${error ? 'border-rose-500/50' : 'border-slate-800 focus-within:border-sky-500'}`}>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 h-12 px-3 rounded-l-xl hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label={`Select country code. Current selection: ${selectedCountry.name} ${selectedCountry.dialCode}`}
          >
            <span className="text-xl" aria-hidden="true">{selectedCountry.flag}</span>
            <span className="text-sm font-mono text-slate-300 w-10 text-left">{selectedCountry.dialCode}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 max-h-[320px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-2 border-b border-slate-800 bg-slate-900/95 backdrop-blur z-10 sticky top-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search countries or codes..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-sky-500 transition-colors"
                    autoFocus
                    aria-label="Search countries"
                  />
                </div>
              </div>
              <ul className="overflow-y-auto custom-scrollbar flex-1 pb-2" role="listbox">
                {groupedCountries.searchResults ? (
                  <>
                    {groupedCountries.searchResults.length === 0 ? (
                      <li className="px-4 py-8 text-sm text-slate-500 text-center">No countries found</li>
                    ) : (
                      groupedCountries.searchResults.map(renderCountryOption)
                    )}
                  </>
                ) : (
                  <>
                    {groupedCountries.recent?.length > 0 && (
                      <div className="mb-2">
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase bg-slate-950/50">
                          Recent
                        </div>
                        {groupedCountries.recent.map(renderCountryOption)}
                      </div>
                    )}
                    {groupedCountries.popular?.length > 0 && (
                      <div className="mb-2">
                        <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase bg-slate-950/50">
                          Popular
                        </div>
                        {groupedCountries.popular.map(renderCountryOption)}
                      </div>
                    )}
                    <div>
                      <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase bg-slate-950/50">
                        All Countries
                      </div>
                      {groupedCountries.all.map(renderCountryOption)}
                    </div>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-800 shrink-0" />

        <input
          ref={inputRef}
          id="phone-input"
          type="tel"
          value={value.phone_number}
          onChange={handlePhoneChange}
          placeholder="Enter mobile number"
          className="flex-1 bg-transparent border-none text-white px-3 py-3 text-sm font-mono outline-none min-w-0"
          required
        />
      </div>
      {error && (
        <p className="text-[10px] text-rose-400 mt-1.5 ml-1 animate-in fade-in flex items-center gap-1.5" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};
