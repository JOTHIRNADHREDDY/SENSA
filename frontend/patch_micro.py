with open('src/data/countries.ts', 'r') as f:
    content = f.read()

content = content.replace('"currency": "",\n    "currencyCode": ""', '"currency": "United States dollar",\n    "currencyCode": "USD"')

with open('src/data/countries.ts', 'w') as f:
    f.write(content)
