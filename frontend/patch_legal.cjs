const fs = require('fs');
let code = fs.readFileSync('src/components/LegalModal.tsx', 'utf8');

code = "import { motion, AnimatePresence } from 'motion/react';\n" + code;

code = code.replace(
  'return (\n    <div \n      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"',
  'return (\n    <AnimatePresence>\n      {isOpen && (\n        <motion.div\n          initial={{ opacity: 0 }}\n          animate={{ opacity: 1 }}\n          exit={{ opacity: 0 }}\n          transition={{ duration: 0.2 }}\n          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"'
);

// find closing tags
code = code.replace(
  /<\/div>\n    <\/div>\n  \);\n};/,
  '</div>\n        </motion.div>\n      )}\n    </AnimatePresence>\n  );\n};'
);

fs.writeFileSync('src/components/LegalModal.tsx', code);
