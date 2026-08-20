import re

with open('src/components/PricingSection.tsx', 'r') as f:
    content = f.read()

# 1. Add import for CountrySelect
if 'import { CountrySelect }' not in content:
    content = content.replace("import { formatPrice, CurrencyCode } from '../data/pricingCatalog';", "import { formatPrice, CurrencyCode } from '../data/pricingCatalog';\nimport { CountrySelect } from './CountrySelect';")

# 2. Replace the select element
select_block_regex = r'<select\s+value=\{country\}.*?</select>'
replacement = '<CountrySelect value={country} onChange={setCountry} disabled={isLoading} />'
content = re.sub(select_block_regex, replacement, content, flags=re.DOTALL)

with open('src/components/PricingSection.tsx', 'w') as f:
    f.write(content)
