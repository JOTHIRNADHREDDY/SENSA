const fs = require('fs');
const worldCountries = require('world-countries');

const un_members = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe",
    "Palestine", "Vatican City"
];

const remaining = new Set(un_members.map(c => c.toLowerCase()));
const name_mapping = {
    "bolivia (plurinational state of)": "bolivia",
    "brunei darussalam": "brunei",
    "cape verde": "cabo verde",
    "republic of the congo": "congo",
    "congo, republic of the": "congo",
    "congo, democratic republic of the": "democratic republic of the congo",
    "dr congo": "democratic republic of the congo",
    "czech republic": "czechia",
    "côte d'ivoire": "ivory coast",
    "swaziland": "eswatini",
    "iran, islamic republic of": "iran",
    "lao people's democratic republic": "laos",
    "micronesia, federated states of": "micronesia",
    "moldova, republic of": "moldova",
    "korea, democratic people's republic of": "north korea",
    "macedonia, the former yugoslav republic of": "north macedonia",
    "north macedonia": "north macedonia",
    "russian federation": "russia",
    "são tomé and príncipe": "sao tome and principe",
    "korea, republic of": "south korea",
    "syrian arab republic": "syria",
    "tanzania, united republic of": "tanzania",
    "türkiye": "turkey",
    "united kingdom of great britain and northern ireland": "united kingdom",
    "united states of america": "united states",
    "venezuela, bolivarian republic of": "venezuela",
    "viet nam": "vietnam",
    "palestine, state of": "palestine",
    "holy see (vatican city state)": "vatican city",
    "holy see": "vatican city",
};

const matched = [];

for (const c of worldCountries) {
    const commonName = c.name.common.toLowerCase();
    const officialName = c.name.official.toLowerCase();
    let matchName = null;

    if (remaining.has(commonName)) {
        matchName = commonName;
    } else if (remaining.has(officialName)) {
        matchName = officialName;
    } else if (name_mapping[commonName] && remaining.has(name_mapping[commonName])) {
        matchName = name_mapping[commonName];
    } else if (name_mapping[officialName] && remaining.has(name_mapping[officialName])) {
        matchName = name_mapping[officialName];
    }

    if (matchName) {
        remaining.delete(matchName);
        const origName = un_members.find(u => u.toLowerCase() === matchName) || c.name.common;
        
        let currency = '';
        let currencyCode = '';
        if (c.currencies && Object.keys(c.currencies).length > 0) {
            currencyCode = Object.keys(c.currencies)[0];
            currency = c.currencies[currencyCode].name;
        }

        let phoneCode = '';
        if (c.idd && c.idd.root) {
            phoneCode = c.idd.root;
            if (c.idd.suffixes && c.idd.suffixes.length === 1) {
                phoneCode += c.idd.suffixes[0];
            }
        }

        matched.push({
            name: origName,
            countryCode: c.cca2,
            iso3: c.cca3,
            region: c.region,
            currency: currency,
            currencyCode: currencyCode,
            phoneCode: phoneCode
        });
    }
}

console.log("Remaining missing:", Array.from(remaining));

matched.sort((a, b) => a.name.localeCompare(b.name));

let output = `export interface Country {
  name: string;
  countryCode: string;
  iso3: string;
  region: string;
  currency: string;
  currencyCode: string;
  phoneCode: string;
}

export const COUNTRIES: Country[] = ${JSON.stringify(matched, null, 2)};
`;

fs.writeFileSync('src/data/countries.ts', output);
console.log("Written to src/data/countries.ts. Count:", matched.length);
