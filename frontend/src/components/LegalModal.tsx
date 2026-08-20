import { motion, AnimatePresence } from 'motion/react';
import React, { useState } from 'react';
import { X, Shield, FileText, CheckCircle2, Search } from 'lucide-react';
import { legalDocuments } from '../data/legalDocuments';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: string | null;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, type }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  if (!isOpen || !type || !legalDocuments[type]) return null;

  const doc = legalDocuments[type];
  
  const filteredSections = doc.sections.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (typeof s.content === 'string' && s.content.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ type: "spring", duration: 0.5, bounce: 0 }} className="relative w-full max-w-4xl bg-[#0b0e14] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Sticky Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-white/10 bg-[#0b0e14] z-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center shrink-0">
              {type === 'terms' ? <FileText className="w-6 h-6 text-sky-400" /> : <Shield className="w-6 h-6 text-emerald-400" />}
            </div>
            <div>
              <h2 id="modal-title" className="text-xl sm:text-2xl font-bold text-white">
                {doc.title}
              </h2>
              <div className="flex items-center gap-3 mt-1 text-xs font-mono text-slate-400">
                <span>Version: {doc.version}</span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span>Effective Date: {doc.effectiveDate}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-black/50 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-sky-500 transition-colors w-48 focus:w-64"
              />
            </div>
            <button 
              onClick={onClose}
              className="p-2.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 sm:p-8 overflow-y-auto text-sm text-slate-300 space-y-8 scroll-smooth" tabIndex={0}>
          {filteredSections.length > 0 ? (
            filteredSections.map((section) => (
              <section key={section.id} className="space-y-3">
                <h3 className="text-white font-bold text-base sm:text-lg">{section.title}</h3>
                <div className="leading-relaxed text-slate-400">
                  {section.content}
                </div>
              </section>
            ))
          ) : (
            <div className="text-center py-12 text-slate-500">
              No sections match your search.
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-6 border-t border-white/10 bg-[#0b0e14] flex justify-end gap-3 z-10">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-full font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            I Understand
          </button>
        </div>
      </motion.div>
            </motion.div>
      )}
    </AnimatePresence>
  );
};
