import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Box,
  Activity,
  Layers,
  MapPin
} from 'lucide-react';

interface ControlPanelProps {
  shipCount: number;
  is3D: boolean;
  showCongestion: boolean;
  showClustering: boolean;
  showAllRoutes: boolean;
  onToggle3D: () => void;
  onToggleCongestion: () => void;
  onToggleClustering: () => void;
  onToggleAllRoutes: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  shipCount,
  is3D,
  showCongestion,
  showClustering,
  showAllRoutes,
  onToggle3D,
  onToggleCongestion,
  onToggleClustering,
  onToggleAllRoutes
}) => {
  return (
    <div className="absolute top-5 left-5 backdrop-blur-xl rounded-3xl p-4 w-[180px] space-y-3 shadow-xl transition-all duration-300 bg-white/10 text-white">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">
          선박 관제 시스템
        </h2>
        <p className="text-sm text-white">
          포항 구룡포 해역
        </p>
        <p className="text-sm text-white">
          활성 선박: {shipCount}척
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={onToggle3D}
          className="w-full border border-white/30 transition-all duration-300 hover:scale-[1.02] bg-black/2 hover:bg-black/5 text-white"
          variant="ghost"
        >
          <Box className="w-4 h-4 mr-2" />
          {is3D ? '2D 지도로 전환' : '3D 위성뷰로 전환'}
        </Button>


        <Button
          onClick={onToggleCongestion}
          className={`w-full border border-white/30 transition-all duration-300 hover:scale-[1.02] ${
            showCongestion
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-black/2 hover:bg-black/5 text-white'
          }`}
          variant="ghost"
        >
          <Activity className="w-4 h-4 mr-2" />
          {showCongestion ? '혼잡도 숨기기' : '혼잡도 표시'}
        </Button>

        <Button
          onClick={onToggleClustering}
          className={`w-full border border-white/30 transition-all duration-300 hover:scale-[1.02] ${
            showClustering
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
              : 'bg-black/2 hover:bg-black/5 text-white'
          }`}
          variant="ghost"
        >
          <Layers className="w-4 h-4 mr-2" />
          {showClustering ? '클러스터링 ON' : '클러스터링 OFF'}
        </Button>

        <Button
          onClick={onToggleAllRoutes}
          className={`w-full border border-white/30 transition-all duration-300 hover:scale-[1.02] ${
            showAllRoutes
              ? 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/30'
              : 'bg-black/2 hover:bg-black/5 text-white'
          }`}
          variant="ghost"
        >
          <MapPin className="w-4 h-4 mr-2" />
          {showAllRoutes ? '모든 경로 숨기기' : '모든 경로 표시'}
        </Button>

      </div>
    </div>
  );
};

export default ControlPanel;
