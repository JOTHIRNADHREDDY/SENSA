import re

with open('server.ts', 'r') as f:
    content = f.read()

eurozone = ["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "MC", "SM", "VA", "AD", "ME", "XK"]

patch = f"""
      // Determine fallback
      const eurozone = {eurozone};
      let fallbackCountry = "US";
      if (eurozone.includes(country.toUpperCase())) {{
        fallbackCountry = "DE"; // Eurozone fallback
      }}
      
      if (Object.keys(prices).length === 0) {{
        const fallbackQ = query(collection(db, "regional_prices"), where("country", "==", fallbackCountry));
"""

content = re.sub(r'// If no prices found for the country, fallback to US\s+if \(Object\.keys\(prices\)\.length === 0\) \{\s+const fallbackQ = query\(collection\(db, "regional_prices"\), where\("country", "==", "US"\)\);', patch, content)

with open('server.ts', 'w') as f:
    f.write(content)
