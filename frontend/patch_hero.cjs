const fs = require('fs');
let code = fs.readFileSync('src/components/HeroSection.tsx', 'utf8');

if (!code.includes("from 'motion/react'")) {
  code = "import { motion } from 'motion/react';\n" + code;
}

// Convert main max-w-4xl container to motion.div with variants
code = code.replace(
  '<div className="max-w-4xl mx-auto space-y-8">',
  `<motion.div 
          initial="hidden" 
          animate="visible" 
          variants={{
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
          }} 
          className="max-w-4xl mx-auto space-y-8"
        >`
);

code = code.replace(
  '          <div className="inline-flex items-center',
  '          <motion.div variants={{ hidden: { opacity: 0, y: 15 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="inline-flex items-center'
);

code = code.replace(
  '          <h1 className="text-4xl md:text-6xl font-bold',
  '          <motion.h1 variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="text-4xl md:text-6xl font-bold'
);

code = code.replace(
  '          <p className="text-lg md:text-xl text-slate-400',
  '          <motion.p variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="text-lg md:text-xl text-slate-400'
);

code = code.replace(
  '          <div className="flex flex-col sm:flex-row items-center',
  '          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="flex flex-col sm:flex-row items-center'
);

code = code.replace(
  '          <div className="pt-8 flex flex-wrap justify-center',
  '          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring" } } }} className="pt-8 flex flex-wrap justify-center'
);

code = code.replace(
  '        </div>\n      </section>',
  '        </motion.div>\n      </section>'
);

fs.writeFileSync('src/components/HeroSection.tsx', code);
console.log('HeroSection patched');
