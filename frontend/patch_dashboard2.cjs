const fs = require('fs');
let code = fs.readFileSync('src/components/CameraGridDashboard.tsx', 'utf8');

const regex = /{cameras\.map\(\(cam(, idx)?\)? => \(\s*<(motion\.)?div[\s\S]*?key={cam\.id}/;
const match = code.match(regex);
console.log(match ? "Found map" : "Did not find map");
