const fs = require('fs');
let code = fs.readFileSync('src/components/PricingSection.tsx', 'utf8');

const oldUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16.75 12h3.632a1 1 0 0 1 .894 1.447l-2.034 4.069a1 1 0 0 1-1.708.134l-2.124-2.97'/%3E%3Cpath d='M17.106 9.053a1 1 0 0 1 1.053-.447l1.36.34a1 1 0 0 1 .632 1.487l-1.352 2.224a1 1 0 0 1-1.636-.073l-1.124-1.72'/%3E%3Cpath d='M2 19h5'/%3E%3Cpath d='M4 19v-5'/%3E%3Cpath d='M7.743 14.5a3 3 0 1 1 4.514-3.5'/%3E%3Cpath d='M7 10.5 4.5 13'/%3E%3Cpath d='M9 13.5l-2.5 2.5'/%3E%3C/svg%3E")`;

const newUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230ea5e9' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5'/%3E%3Crect x='2' y='6' width='14' height='12' rx='2'/%3E%3C/svg%3E")`;

code = code.split(oldUrl).join(newUrl);

fs.writeFileSync('src/components/PricingSection.tsx', code);
console.log('Camera icon updated');
