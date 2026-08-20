const http = require('http');

http.get('http://localhost:3000/api/pricing/IN', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => { console.log("IN:", data); });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});

http.get('http://localhost:3000/api/pricing/US', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => { console.log("US:", data); });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
