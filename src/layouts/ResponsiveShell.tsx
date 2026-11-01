import React, { ReactNode } from 'react';
import { motion } from 'motion/react';

interface ResponsiveShellProps {
  globeComponent: ReactNode;
  panelComponent: ReactNode;
  isBezelMode: boolean;
  isDay: boolean;
}

export function ResponsiveShell({ globeComponent, panelComponent, isBezelMode, isDay }: ResponsiveShellProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (isBezelMode) {
    return (
        <div className="flex-1 w-full flex flex-col overflow-hidden">
            <div className="h-[46%] w-full relative">{globeComponent}</div>
            <div className="w-full h-[2px] bg-cyan-400/30" />
            <div className="flex-1 overflow-hidden">{panelComponent}</div>
        </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col md:flex-row overflow-hidden relative">
      {/* Globe Area - Mobile: 55vh, Tablet/Desktop: Widescreen split */}
      <div className="h-[55vh] md:h-full w-full md:w-[60%] lg:w-[16:9] relative flex items-center justify-center">
        {globeComponent}
      </div>

      {/* Panel Area - Mobile: Draggable Sheet */}
      <motion.div
        className={`absolute bottom-0 left-0 w-full z-20 rounded-t-3xl overflow-hidden ${isDay ? 'bg-[#0a223f]' : 'bg-[#050714]'} md:relative md:w-[40%] md:h-full md:rounded-none`}
        animate={{ top: isExpanded ? '8%' : '85%' }}
        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
      >
        {/* Draggable Handle */}
        <div 
            className="w-full h-8 flex items-center justify-center cursor-grab active:cursor-grabbing"
            onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>
        
        <div className="h-[calc(100%-2rem)] overflow-y-auto">
            {panelComponent}
        </div>
      </motion.div>
    </div>
  );
}
