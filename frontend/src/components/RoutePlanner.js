import React, { useState } from 'react';

const RoutePlanner = ({ ships, onPlanRoute, onSetStart, onSetGoal, routePoints }) => {
  const [selectedShipId, setSelectedShipId] = useState('');
  const [departureTime, setDepartureTime] = useState(30);
  const [acceptMode, setAcceptMode] = useState('flexible');

  const handlePlanRoute = () => {
    console.log('Planning route with:', {
      selectedShipId,
      departureTime,
      acceptMode,
      routePoints
    });

    if (!selectedShipId) {
      alert('선박을 선택해주세요');
      return;
    }

    if (!routePoints.start || !routePoints.goal) {
      alert('출발점과 도착점을 지도에서 선택해주세요');
      return;
    }

    onPlanRoute(selectedShipId, departureTime, acceptMode === 'flexible');
  };

  return (
    <div className="panel">
      <h3>경로 계획</h3>

      <div className="route-planner">
        <div className="input-group">
          <label>선박 선택</label>
          <select
            value={selectedShipId}
            onChange={(e) => setSelectedShipId(e.target.value)}
          >
            <option value="">선박을 선택하세요</option>
            {ships && ships.length > 0 ? (
              ships.map(ship => (
                <option key={ship.shipId || ship.id} value={ship.shipId}>
                  {ship.name} ({ship.shipId})
                </option>
              ))
            ) : (
              <option disabled>선박 목록을 불러오는 중...</option>
            )}
          </select>
        </div>

        <div className="input-group">
          <label>출발/도착 위치</label>
          <div className="button-group">
            <button className="btn btn-secondary" onClick={onSetStart}>
              출발점 설정
            </button>
            <button className="btn btn-secondary" onClick={onSetGoal}>
              도착점 설정
            </button>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
            {routePoints.start && (
              <div>출발: ({routePoints.start[0].toFixed(0)}, {routePoints.start[1].toFixed(0)})</div>
            )}
            {routePoints.goal && (
              <div>도착: ({routePoints.goal[0].toFixed(0)}, {routePoints.goal[1].toFixed(0)})</div>
            )}
          </div>
        </div>

        <div className="input-group">
          <label>출발 시간 (분 후)</label>
          <input
            type="number"
            value={departureTime}
            onChange={(e) => setDepartureTime(Number(e.target.value))}
            min="0"
            max="180"
          />
        </div>

        <div className="input-group">
          <label>시간 수용 모드</label>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                value="flexible"
                checked={acceptMode === 'flexible'}
                onChange={(e) => {
                  console.log('Mode changed to:', e.target.value);
                  setAcceptMode(e.target.value);
                }}
              />
              <span>수용 O (Flexible)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                value="fixed"
                checked={acceptMode === 'fixed'}
                onChange={(e) => {
                  console.log('Mode changed to:', e.target.value);
                  setAcceptMode(e.target.value);
                }}
              />
              <span>수용 X (Fixed)</span>
            </label>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem' }}>
            {acceptMode === 'flexible'
              ? '시스템이 추천하는 최적 시간을 사용합니다.'
              : '입력한 시간을 유지하고 경로를 조정합니다.'}
          </div>
        </div>

        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={handlePlanRoute}
            disabled={!selectedShipId || !routePoints.start || !routePoints.goal}
          >
            경로 계획
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoutePlanner;