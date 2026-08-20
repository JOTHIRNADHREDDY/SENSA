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
    code = code.replace(
      "import React, { useState",
      "import React, { useState"
    ); // just to anchor, actually let's just do a blanket insert at the top
    code = "import { motion, AnimatePresence } from 'motion/react';\n" + code;
  }

  // Remove `if (!isOpen) return null;`
  code = code.replace("if (!isOpen) return null;", "");
  code = code.replace("if (!isOpen) return null", "");

  // Find return (
  // We want to wrap the returned JSX in AnimatePresence and {isOpen && (...)}
  
  // Replace the first return ( with return (<AnimatePresence>{isOpen && (
  // This is tricky if there are multiple returns (e.g. early returns).
  // But typically it's the main render return.
  
  // Let's do a regex to find the main return block.
  // Actually, I'll just look for:
  // return (
  //   <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  
  const returnTarget1 = `return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">`;
  const returnTarget2 = `return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">`;

  // We can just find `<div className="fixed inset-0` and replace it with:
  // `<AnimatePresence>{isOpen && (<div className="fixed inset-0`
  code = code.replace(
    /<div className="fixed inset-0 z-50([^"]*)">/g, 
    '<AnimatePresence>\n      {isOpen && (\n        <div className="fixed inset-0 z-50$1">'
  );

  // The overlay is `<div className="absolute inset-0 bg-black/80 backdrop-blur-sm"`
  code = code.replace(
    /<div className="absolute inset-0 bg-black\/80 backdrop-blur-sm" onClick={([^}]*)} \/>/g,
    '<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={$1} />'
  );

  // The modal content is typically `<div className="relative w-full`
  code = code.replace(
    /<div className="relative w-full/g,
    '<motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} className="relative w-full'
  );
  code = code.replace(
    /<div className="relative max-w-2xl w-full/g,
    '<motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} className="relative max-w-2xl w-full'
  );

  // And the closing tags.
  // We need to add `)}</AnimatePresence>` at the very end of the component return.
  // This can be done by finding the last `</div>\n  );\n}` or `</div>\n    </div>\n  );\n};`
  
  const closingRegex = /<\/div>\n\s*\);\n};/g;
  code = code.replace(closingRegex, "        </div>\n      )}\n    </AnimatePresence>\n  );\n};");

  // Fix up closing tag for motion.div
  // We replaced `<div className="relative w-full` with `<motion.div className="relative w-full`
  // so we have a mismatching `</div>` for it.
  // We can't regex that easily. 
  
  // So instead of replacing `<div className="relative`, we can just replace `<div className="fixed inset-0` with `<AnimatePresence>{isOpen && (<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0`
  // Let's just reset code and do this simpler approach.
  
  fs.writeFileSync(file + '.bak', code);
}
console.log('Modals backed up.');
