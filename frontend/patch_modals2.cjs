const fs = require('fs');

const modals = [
  'src/components/SignupModal.tsx',
  'src/components/ContactSalesModal.tsx',
  'src/components/LegalModal.tsx',
  'src/components/CompatibilityModal.tsx'
];

for (const file of modals) {
  let code = fs.readFileSync(file, 'utf8');

  if (!code.includes("from 'motion/react'")) {
    code = "import { motion, AnimatePresence } from 'motion/react';\n" + code;
  }

  code = code.replace("if (!isOpen) return null;", "");
  code = code.replace("if (!isOpen) return null", "");

  code = code.replace(
    /return \(\s*<div className="fixed inset-0 z-50/,
    'return (\n    <AnimatePresence>\n      {isOpen && (\n        <motion.div\n          initial={{ opacity: 0 }}\n          animate={{ opacity: 1 }}\n          exit={{ opacity: 0 }}\n          transition={{ duration: 0.2 }}\n          className="fixed inset-0 z-50'
  );

  code = code.replace(
    /<\/div>\s*\);\s*};/g,
    '        </motion.div>\n      )}\n    </AnimatePresence>\n  );\n};'
  );

  fs.writeFileSync(file, code);
  console.log(file, 'patched');
}
