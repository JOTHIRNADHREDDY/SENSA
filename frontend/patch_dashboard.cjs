const fs = require('fs');
let code = fs.readFileSync('src/components/CameraGridDashboard.tsx', 'utf8');

if (!code.includes("from 'motion/react'")) {
  code = code.replace(
    "import React, { useState, useEffect, useRef } from 'react';",
    "import React, { useState, useEffect, useRef } from 'react';\nimport { motion, AnimatePresence } from 'motion/react';"
  );
}

// Find the map where cameras are rendered
// Probably something like: {cameras.map((cam) => (
// Let's replace the outer div of the camera card with motion.div and add an entrance animation.
const replaceTarget = `{cameras.map(cam => (
          <div 
            key={cam.id}
            className={\`relative bg-[#0b0e14] border \${cam.status === 'recording' ? 'border-sky-900/50' : 'border-white/5'} rounded-xl overflow-hidden shadow-2xl flex flex-col group\`}`;

const newTarget = `{cameras.map((cam, idx) => (
          <motion.div 
            key={cam.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.1, ease: 'easeOut' }}
            className={\`relative bg-[#0b0e14] border \${cam.status === 'recording' ? 'border-sky-900/50' : 'border-white/5'} rounded-xl overflow-hidden shadow-2xl flex flex-col group\`}
          >`;

code = code.replace(replaceTarget, newTarget);
// also replace the closing </div> for the map
// We can't easily regex the closing tag, but let's see if we can do a global replace for the active dot.
// Find: <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
// We can use framer motion for it or just keep `animate-pulse` which is already subtle and performant (CSS opacity). The prompt says use CSS where possible.

fs.writeFileSync('src/components/CameraGridDashboard.tsx', code);
console.log('CameraGridDashboard patched');
