import re

with open('src/components/CountrySelect.tsx', 'r') as f:
    content = f.read()

# Add highlightedIndex state
state_injection = """  const [highlightedIndex, setHighlightedIndex] = useState(-1);
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
  }, [highlightedIndex]);"""

# Replace state and effects
content = content.replace("const inputRef = useRef<HTMLInputElement>(null);", "const inputRef = useRef<HTMLInputElement>(null);\n" + state_injection)

# Add onKeyDown to the wrapping div or button
content = content.replace('<div className="relative" ref={dropdownRef}>', '<div className="relative" ref={dropdownRef} onKeyDown={handleKeyDown}>')

# Add listRef to the max-h-60 div
content = content.replace('<div className="max-h-60 overflow-y-auto custom-scrollbar">', '<div className="max-h-60 overflow-y-auto custom-scrollbar" ref={listRef}>')

# Update the button rendering to highlight
button_regex = r'<button\s+key=\{country\.countryCode\}.*?</button>'
new_button = """<button
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
                </button>"""

content = re.sub(r'filteredCountries\.map\(country => \(.*?</button>', r'filteredCountries.map((country, index) => (\n' + new_button, content, flags=re.DOTALL)

with open('src/components/CountrySelect.tsx', 'w') as f:
    f.write(content)
