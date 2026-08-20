const fs = require('fs');
let code = fs.readFileSync('src/components/CountrySelect.tsx', 'utf8');

if (!code.includes("from 'motion/react'")) {
  code = code.replace(
    "import React, { useState, useRef, useEffect } from 'react';",
    "import React, { useState, useRef, useEffect } from 'react';\nimport { motion, AnimatePresence } from 'motion/react';"
  );
}

// Replace {isOpen && ( ... )} with <AnimatePresence> {isOpen && ( <motion.div ... > )}
const replaceTarget = `{isOpen && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-[#0A0E17] border border-white/10 rounded-lg shadow-xl overflow-hidden">`;

const newTarget = `<AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0, y: -5, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -5, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50 top-full left-0 mt-1 w-64 bg-[#0A0E17] border border-white/10 rounded-lg shadow-xl overflow-hidden"
        >`;

code = code.replace(replaceTarget, newTarget);

const endTarget = `        </div>
      )}
    </div>`;

const newEndTarget = `        </motion.div>
      )}
      </AnimatePresence>
    </div>`;

code = code.replace(endTarget, newEndTarget);
fs.writeFileSync('src/components/CountrySelect.tsx', code);
console.log('CountrySelect patched');
