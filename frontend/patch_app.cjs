const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

if (!code.includes("from 'motion/react'")) {
  code = code.replace(
    "import React, { useState, useEffect } from 'react';",
    "import React, { useState, useEffect } from 'react';\nimport { motion, AnimatePresence } from 'motion/react';"
  );
}

const mainStartPattern = "<main className={`w-full flex-1 ${activeTab === 'hero' ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8'}`}>\n";
const mainEndPattern = "      </main>";

let mainStartIdx = code.indexOf(mainStartPattern);
let mainEndIdx = code.indexOf(mainEndPattern);

if (mainStartIdx !== -1 && mainEndIdx !== -1) {
  let beforeMain = code.substring(0, mainStartIdx + mainStartPattern.length);
  let insideMain = code.substring(mainStartIdx + mainStartPattern.length, mainEndIdx);
  let afterMain = code.substring(mainEndIdx);

  let newInsideMain = `        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full flex flex-col h-full"
          >
${insideMain}          </motion.div>
        </AnimatePresence>\n`;

  code = beforeMain + newInsideMain + afterMain;
  fs.writeFileSync('src/App.tsx', code);
  console.log("App.tsx patched with Framer Motion");
} else {
  console.log("Could not find main start or end");
}
