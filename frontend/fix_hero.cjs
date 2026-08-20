const fs = require('fs');
let code = fs.readFileSync('src/components/HeroSection.tsx', 'utf8');

// The Pill
code = code.replace(
  '</span>\n              <span>Turn Your Cameras Into Smarter Security</span>\n            </div>',
  '</span>\n              <span>Turn Your Cameras Into Smarter Security</span>\n            </motion.div>'
);

// The buttons
code = code.replace(
  'Check System Compatibility\n              </button>\n            </div>',
  'Check System Compatibility\n              </button>\n            </motion.div>'
);

fs.writeFileSync('src/components/HeroSection.tsx', code);
