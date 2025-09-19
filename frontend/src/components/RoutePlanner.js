import React, { useState, useEffect } from 'react';

const RoutePlanner = ({ ships, selectedShip, onPlanRoute }) => {
  const [departureTime, setDepartureTime] = useState(30);
  const [tripMode, setTripMode] = useState('departure'); // 'departure' or 'arrival'
  const [timeAcceptance, setTimeAcceptance] = useState('O'); // 'O' or 'X'

  const handlePlanRoute = () => {
    if (!selectedShip) {
      alert('먼저 선박을 선택해주세요');
      return;
    }

    // Determine start and goal based on trip mode
    let startPosition, goalPosition;

    if (tripMode === 'departure') {
      // 출항: 정박지 → 어장
      if (!selectedShip.dockingLat || !selectedShip.dockingLng) {
        alert('선택한 선박의 정박 위치가 설정되지 않았습니다.');
        return;
      }
      if (!selectedShip.fishingAreaLat || !selectedShip.fishingAreaLng) {
        alert('선택한 선박의 어장 위치가 설정되지 않았습니다.');
        return;
      }
      startPosition = [selectedShip.dockingLat, selectedShip.dockingLng];
      goalPosition = [selectedShip.fishingAreaLat, selectedShip.fishingAreaLng];
    } else {
      // 입항: 어장 → 정박지
      if (!selectedShip.fishingAreaLat || !selectedShip.fishingAreaLng) {
        alert('선택한 선박의 어장 위치가 설정되지 않았습니다.');
        return;
      }
      if (!selectedShip.dockingLat || !selectedShip.dockingLng) {
        alert('선택한 선박의 정박 위치가 설정되지 않았습니다.');
        return;
      }
      startPosition = [selectedShip.fishingAreaLat, selectedShip.fishingAreaLng];
      goalPosition = [selectedShip.dockingLat, selectedShip.dockingLng];
    }

    // Call the planning function with acceptance mode
    onPlanRoute(
      selectedShip.shipId,
      departureTime,
      timeAcceptance === 'O', // true if accepting time recommendations
      startPosition,
      goalPosition
    );
  };

  return (
    <div className="panel">
      <h3>경로 계획</h3>

      <div className="route-planner">
        {/* Selected Ship Display */}
        {selectedShip ? (
          <div style={{
            padding: '0.75rem',
            background: 'rgba(102, 126, 234, 0.1)',
            borderRadius: '10px',
            marginBottom: '1rem'
          }}>
            <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
              선택된 선박
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {selectedShip.name} ({selectedShip.shipId}) - {selectedShip.type}
            </div>
          </div>
        ) : (
          <div style={{
            padding: '0.75rem',
            background: 'rgba(220, 53, 69, 0.1)',
            borderRadius: '10px',
            marginBottom: '1rem',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            textAlign: 'center'
          }}>
            좌측에서 선박을 먼저 선택해주세요
          </div>
        )}

        {/* Trip Mode Selection */}
        <div className="input-group">
          <label style={{ marginBottom: '0.5rem', fontWeight: '500' }}>운항 모드</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setTripMode('departure')}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: tripMode === 'departure'
                  ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.7), rgba(118, 75, 162, 0.7))'
                  : 'rgba(108, 117, 125, 0.7)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              출항 (정박지 → 어장)
            </button>
            <button
              onClick={() => setTripMode('arrival')}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: tripMode === 'arrival'
                  ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.7), rgba(118, 75, 162, 0.7))'
                  : 'rgba(108, 117, 125, 0.7)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              입항 (어장 → 정박지)
            </button>
          </div>
        </div>

        {/* Departure Time */}
        <div className="input-group">
          <label style={{ marginBottom: '0.5rem', fontWeight: '500' }}>출발 시간 (분 후)</label>
          <input
            type="number"
            value={departureTime}
            onChange={(e) => setDepartureTime(Number(e.target.value))}
            min="0"
            max="180"
            style={{
              padding: '0.6rem',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '10px',
              fontSize: '0.95rem',
              color: 'var(--text-primary)',
              transition: 'all 0.3s ease'
            }}
          />
        </div>

        {/* Time Acceptance */}
        <div className="input-group">
          <label style={{ marginBottom: '0.5rem', fontWeight: '500' }}>시간 수용 여부</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setTimeAcceptance('O')}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: timeAcceptance === 'O'
                  ? 'rgba(40, 167, 69, 0.7)'
                  : 'rgba(108, 117, 125, 0.7)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              O (최적 시간 추천)
            </button>
            <button
              onClick={() => setTimeAcceptance('X')}
              style={{
                flex: 1,
                padding: '0.6rem',
                background: timeAcceptance === 'X'
                  ? 'rgba(220, 53, 69, 0.7)'
                  : 'rgba(108, 117, 125, 0.7)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                fontSize: '0.9rem',
                fontWeight: '500'
              }}
            >
              X (입력 시간 유지)
            </button>
          </div>
          <div style={{
            fontSize: '0.85rem',
            color: 'var(--text-secondary)',
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px'
          }}>
            {timeAcceptance === 'O'
              ? '시스템이 추천하는 최적 시간으로 출발합니다.'
              : '입력한 시간에 출발하며 필요시 경로를 조정합니다.'}
          </div>
        </div>

        {/* Plan Route Button */}
        <div className="button-group" style={{ marginTop: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={handlePlanRoute}
            disabled={!selectedShip}
            style={{
              width: '100%',
              padding: '0.8rem',
              fontSize: '1rem',
              fontWeight: '600',
              opacity: selectedShip ? 1 : 0.5,
              cursor: selectedShip ? 'pointer' : 'not-allowed'
            }}
          >
            경로 계획 시작
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoutePlanner;