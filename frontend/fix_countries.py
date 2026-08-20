import json
import re

with open('src/data/countries.ts', 'r') as f:
    content = f.read()

# Extract json part
match = re.search(r'export const COUNTRIES: Country\[\] = (\[.*\]);', content, re.DOTALL)
if match:
    data = json.loads(match.group(1))
    
    for c in data:
        c['iso2'] = c['countryCode']
        c['dialCode'] = c['phoneCode']
        # Generate flag emoji
        code = c['countryCode'].upper()
        c['flag'] = chr(ord(code[0]) + 127397) + chr(ord(code[1]) + 127397)
        c['aliases'] = []
    
    new_json = json.dumps(data, indent=2)
    
    # Update interface
    interface = """export interface Country {
  name: string;
  countryCode: string;
  iso2: string;
  iso3: string;
  region: string;
  currency: string;
  currencyCode: string;
  phoneCode: string;
  dialCode: string;
  flag: string;
  aliases?: string[];
}
"""
    new_content = interface + "\nexport const COUNTRIES: Country[] = " + new_json + ";\n"
    
    # Also add CountryMetadata alias for backwards compatibility
    new_content += "\nexport type CountryMetadata = Country;\n"
    
    with open('src/data/countries.ts', 'w') as f2:
        f2.write(new_content)
