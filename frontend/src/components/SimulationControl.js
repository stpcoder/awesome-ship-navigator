import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

// Use environment-based API base URL
const API_BASE = process.env.NODE_ENV === 'production'
  ? ''  // Empty because endpoints already include /api
  : 'http://localhost:8000';

const SimulationControl = ({ onSimulationStatusChange }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [simulationTime, setSimulationTime] = useState(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(5); // Default 5x speed
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  // Check simulation status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/simulation/status`);
        if (response.ok) {
          const data = await response.json();
          setIsPlaying(data.is_running);
          setSimulationTime(data.simulation_time);
          setSpeedMultiplier(data.speed_multiplier || 1);
          setElapsedMinutes(Math.round(data.elapsed_minutes || 0));

          // Notify parent component
          if (onSimulationStatusChange) {
            onSimulationStatusChange(data);
          }
        }
      } catch (err) {
        console.error('Failed to check simulation status:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000); // Check every second

    return () => clearInterval(interval);
  }, [onSimulationStatusChange]);

  // No more auto-update - backend controls the time

  const handlePlayPause = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isPlaying) {
        // Pause simulation
        const response = await fetch(`${API_BASE}/api/simulation/stop`, {
          method: 'POST',
        });

        if (response.ok) {
          setIsPlaying(false);
        } else {
          throw new Error('Failed to pause simulation');
        }
      } else {
        // Start/Resume simulation
        const response = await fetch(`${API_BASE}/api/simulation/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            speed_multiplier: speedMultiplier
          }),
        });

        if (response.ok) {
          setIsPlaying(true);
        } else {
          throw new Error('Failed to start simulation');
        }
      }
    } catch (err) {
      setError(err.message);
      console.error('Simulation control error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeedChange = async (newSpeed) => {
    setSpeedMultiplier(newSpeed);

    // If simulation is running, update speed without stopping
    if (isPlaying) {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE}/api/simulation/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            speed_multiplier: newSpeed
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to change speed');
        }
      } catch (err) {
        setError(err.message);
        console.error('Speed change error:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleReset = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/simulation/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        setIsPlaying(false);
        setElapsedMinutes(0);
        setSimulationTime(null);
        console.log('Simulation reset');
      } else {
        throw new Error('Failed to reset simulation');
      }
    } catch (err) {
      setError(err.message);
      console.error('Reset error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '--:--:--';

    const date = new Date(timeStr);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  };

  const formatElapsedTime = () => {
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = Math.floor(elapsedMinutes % 60);
    if (hours > 0) {
      return `${hours}시간 ${mins}분 경과`;
    }
    return `${mins}분 경과`;
  };

  // Removed slider handler - no longer needed

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginBottom: '1rem' }}>시뮬레이션</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            onClick={handlePlayPause}
            disabled={isLoading}
            title={isPlaying ? '일시정지' : '재생'}
            className={`modern-button ${isPlaying ? 'button-danger' : 'button-success'}`}
            style={{
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            <span>{isPlaying ? '정지' : '재생'}</span>
          </button>

          <button
            onClick={handleReset}
            disabled={isLoading}
            title="초기화"
            className="modern-button button-primary"
            style={{
              opacity: isLoading ? 0.6 : 1
            }}
          >
            <RotateCcw size={16} />
            <span>초기화</span>
          </button>
        </div>

        {/* Speed Control */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          {[5, 10, 20].map(speed => (
            <button
              key={speed}
              onClick={() => handleSpeedChange(speed)}
              disabled={isLoading}
              className={`speed-button ${speedMultiplier === speed ? 'active' : ''}`}
              style={{
                flex: 1,
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Current Simulation Time Display */}
        {simulationTime && (
          <div className="info-item">
            <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-primary)' }}>시뮬레이션 시각:</span>
            <span style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#FF6B00',
              fontFamily: '"SF Mono", Monaco, "Courier New", monospace'
            }}>{formatTime(simulationTime)}</span>
          </div>
        )}


        {/* Error Display */}
        {error && (
          <div style={{
            padding: '0.8rem',
            background: 'rgba(220, 53, 69, 0.1)',
            border: '1px solid rgba(220, 53, 69, 0.3)',
            borderRadius: '8px',
            color: '#dc3545',
            fontSize: '0.85rem',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimulationControl;