import urllib.request
import json

url = "https://restcountries.com/v3.1/all"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())

un_members_and_observers = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
    "Palestine", "Vatican City"
]

# Create a set for faster lookup, normalize to lowercase
target_countries = {c.lower() for c in un_members_and_observers}

# Mapping specific country names that might differ
name_mapping = {
    "bolivia (plurinational state of)": "bolivia",
    "brunei darussalam": "brunei",
    "cabo verde": "cabo verde",
    "democratic republic of the congo": "dr congo", # Wait, we have "congo" in our list. Let's assume Congo means both? The list has "Congo". Let's use DR Congo and Congo Republic.
    "republic of the congo": "congo",
    "congo, republic of the": "congo",
    "dr congo": "dr congo",
    "czechia": "czechia",
    "czech republic": "czechia",
    "côte d'ivoire": "ivory coast", # ivory coast is missing? Wait, is it in the list? Let's check: 195
    "eswatini": "eswatini",
    "swaziland": "eswatini",
    "iran (islamic republic of)": "iran",
    "lao people's democratic republic": "laos",
    "micronesia (federated states of)": "micronesia",
    "republic of moldova": "moldova",
    "democratic people's republic of korea": "north korea",
    "korea (democratic people's republic of)": "north korea",
    "north macedonia": "north macedonia",
    "macedonia": "north macedonia",
    "russian federation": "russia",
    "sao tome and principe": "sao tome and principe",
    "korea, republic of": "south korea",
    "south korea": "south korea",
    "syrian arab republic": "syria",
    "united republic of tanzania": "tanzania",
    "turkey": "turkey",
    "türkiye": "turkey",
    "united kingdom of great britain and northern ireland": "united kingdom",
    "united states of america": "united states",
    "venezuela (bolivarian republic of)": "venezuela",
    "viet nam": "vietnam",
    "palestine, state of": "palestine",
    "state of palestine": "palestine",
    "holy see": "vatican city",
    "vatican city": "vatican city",
    "vatican city state": "vatican city"
}

# Actually, the user provided a 195 count. The UN has 193 members + 2 observers.
un_members = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
    "Palestine", "Vatican City"
]
print("Total expected:", len(un_members))

matched = []
remaining = {c.lower(): c for c in un_members}

for item in data:
    c_name = item['name']['common']
    c_name_lower = c_name.lower()
    
    # Try direct match
    if c_name_lower in remaining:
        matched_name = remaining.pop(c_name_lower)
    elif c_name_lower in name_mapping and name_mapping[c_name_lower] in remaining:
        matched_name = remaining.pop(name_mapping[c_name_lower])
    elif item['name'].get('official', '').lower() in remaining:
        matched_name = remaining.pop(item['name']['official'].lower())
    elif item['name'].get('official', '').lower() in name_mapping and name_mapping[item['name']['official'].lower()] in remaining:
        matched_name = remaining.pop(name_mapping[item['name']['official'].lower()])
    elif item.get('cca2') == 'VA':
        if 'vatican city' in remaining: matched_name = remaining.pop('vatican city')
        else: continue
    elif item.get('cca2') == 'PS':
        if 'palestine' in remaining: matched_name = remaining.pop('palestine')
        else: continue
    elif item.get('cca2') == 'CD':
        if 'democratic republic of the congo' in remaining: matched_name = remaining.pop('democratic republic of the congo')
        else: continue
    elif item.get('cca2') == 'CG':
        if 'congo' in remaining: matched_name = remaining.pop('congo')
        else: continue
    elif item.get('cca2') == 'CI':
        if 'ivory coast' in remaining: matched_name = remaining.pop('ivory coast')
        else: continue
    elif item.get('cca2') == 'CZ':
        if 'czechia' in remaining: matched_name = remaining.pop('czechia')
        else: continue
    elif item.get('cca2') == 'SZ':
        if 'eswatini' in remaining: matched_name = remaining.pop('eswatini')
        else: continue
    elif item.get('cca2') == 'KP':
        if 'north korea' in remaining: matched_name = remaining.pop('north korea')
        else: continue
    elif item.get('cca2') == 'KR':
        if 'south korea' in remaining: matched_name = remaining.pop('south korea')
        else: continue
    elif item.get('cca2') == 'FM':
        if 'micronesia' in remaining: matched_name = remaining.pop('micronesia')
        else: continue
    else:
        continue
        
    currencies = item.get('currencies', {})
    curr_code = list(currencies.keys())[0] if currencies else ""
    curr_name = currencies[curr_code]['name'] if currencies and 'name' in currencies[curr_code] else ""
    
    phone_code = ""
    idd = item.get('idd', {})
    if 'root' in idd:
        phone_code = idd['root']
        if 'suffixes' in idd and len(idd['suffixes']) == 1:
            phone_code += idd['suffixes'][0]

    matched.append({
        "name": matched_name,
        "countryCode": item.get('cca2', ''),
        "iso3": item.get('cca3', ''),
        "region": item.get('region', ''),
        "currency": curr_name,
        "currencyCode": curr_code,
        "phoneCode": phone_code
    })

print("Remaining:", remaining)

matched.sort(key=lambda x: x['name'])

with open('src/data/countries.ts', 'w') as f:
    f.write('export interface Country {\n')
    f.write('  name: string;\n')
    f.write('  countryCode: string;\n')
    f.write('  iso3: string;\n')
    f.write('  region: string;\n')
    f.write('  currency: string;\n')
    f.write('  currencyCode: string;\n')
    f.write('  phoneCode: string;\n')
    f.write('}\n\n')
    f.write('export const COUNTRIES: Country[] = ')
    f.write(json.dumps(matched, indent=2))
    f.write(';\n')

