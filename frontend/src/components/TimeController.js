import React, { useEffect, useRef } from 'react';

const TimeController = ({ currentTime, onTimeChange, isPlaying, onPlayPause }) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        onTimeChange(prevTime => Math.min(prevTime + 0.1, 180));
      }, 100); // Update every 100ms for smooth animation
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, onTimeChange]);

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  return (
    <div className="time-controller">
      <button
        className={`btn ${isPlaying ? 'btn-warning' : 'btn-success'}`}
        onClick={onPlayPause}
        style={{ minWidth: '100px' }}
      >
        {isPlaying ? '일시정지' : '재생'}
      </button>

      <div className="time-slider">
        <span style={{ minWidth: '45px', fontSize: '0.9rem' }}>0:00</span>
        <input
          type="range"
          min="0"
          max="180"
          value={currentTime}
          onChange={(e) => onTimeChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ minWidth: '45px', fontSize: '0.9rem' }}>3:00</span>
      </div>

      <div className="time-display">
        {formatTime(currentTime)}
      </div>

      <button
        className="btn btn-secondary"
        onClick={() => onTimeChange(0)}
        style={{ minWidth: '80px' }}
      >
        리셋
      </button>
    </div>
  );
};

export default TimeController;