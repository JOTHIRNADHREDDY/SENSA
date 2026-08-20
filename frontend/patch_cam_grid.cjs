const fs = require('fs');
let code = fs.readFileSync('src/components/CameraGridDashboard.tsx', 'utf8');

code = code.replace(
  "{cameras.map((cam) => {",
  "{cameras.map((cam, idx) => {"
);

code = code.replace(
  "return (\n                <div\n                  key={cam.id}",
  "return (\n                <motion.div\n                  key={cam.id}\n                  initial={{ opacity: 0, scale: 0.95, y: 10 }}\n                  animate={{ opacity: 1, scale: 1, y: 0 }}\n                  transition={{ duration: 0.3, delay: idx * 0.05, ease: 'easeOut' }}"
);

code = code.replace(
  "                </div>\n              );\n            })}\n          </div>",
  "                </motion.div>\n              );\n            })}\n          </div>"
);

fs.writeFileSync('src/components/CameraGridDashboard.tsx', code);
console.log('CameraGridDashboard patched');
