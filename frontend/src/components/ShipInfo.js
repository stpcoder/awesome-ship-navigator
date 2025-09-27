import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const ShipInfo = ({ ships, selectedShip, onSelectShip, onUpdatePositions, onMapClick }) => {
  const [editMode, setEditMode] = useState(false);
  const [mapClickMode, setMapClickMode] = useState(null); // 'fishing' or 'docking'
  const [shipDropdownValue, setShipDropdownValue] = useState('');
  const [positions, setPositions] = useState({
    fishingAreaLat: '',
    fishingAreaLng: '',
    dockingLat: '',
    dockingLng: ''
  });

  useEffect(() => {
    if (selectedShip) {
      setPositions({
        fishingAreaLat: selectedShip.fishingAreaLat || '',
        fishingAreaLng: selectedShip.fishingAreaLng || '',
        dockingLat: selectedShip.dockingLat || '',
        dockingLng: selectedShip.dockingLng || ''
      });
      setShipDropdownValue(selectedShip.shipId);
    }
  }, [selectedShip]);

  const handleMapClick = useCallback((lat, lng) => {
    if (mapClickMode === 'fishing') {
      setPositions(prev => ({
        ...prev,
        fishingAreaLat: lat.toFixed(6),
        fishingAreaLng: lng.toFixed(6)
      }));
      setMapClickMode(null);
    } else if (mapClickMode === 'docking') {
      setPositions(prev => ({
        ...prev,
        dockingLat: lat.toFixed(6),
        dockingLng: lng.toFixed(6)
      }));
      setMapClickMode(null);
    }
  }, [mapClickMode]);

  useEffect(() => {
    if (onMapClick && mapClickMode) {
      console.log('Setting map click handler for:', mapClickMode);
      onMapClick(handleMapClick);
    } else if (onMapClick) {
      console.log('Clearing map click handler');
      onMapClick(null);
    }
  }, [mapClickMode, onMapClick, handleMapClick]);

  const handleSavePositions = async () => {
    if (!selectedShip) return;

    try {
      await axios.put(`${API_BASE}/api/eum/ships/${selectedShip.shipId}/positions`, positions);

      // Update the ship in parent component
      if (onUpdatePositions) {
        onUpdatePositions(selectedShip.shipId, positions);
      }

      setEditMode(false);
      setMapClickMode(null);
      alert('위치 정보가 업데이트되었습니다.');
    } catch (error) {
      console.error('Failed to update positions:', error);
      alert('위치 업데이트 실패: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleShipSelect = (e) => {
    const shipId = e.target.value;
    setShipDropdownValue(shipId);
    if (shipId) {
      const ship = ships.find(s => s.shipId === shipId);
      if (ship) {
        onSelectShip(ship);
      }
    } else {
      onSelectShip(null);
    }
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>선박 정보</h3>

      {/* Ship Dropdown Selector */}
      <div style={{ marginBottom: '12px' }}>
        <select
          value={shipDropdownValue}
          onChange={handleShipSelect}
          className="modern-select"
        >
          <option value="">선박 선택...</option>
          {ships.map(ship => (
            <option key={ship.shipId} value={ship.shipId}>
              {ship.name} ({ship.shipId}) - {ship.type}
            </option>
          ))}
        </select>
      </div>

      {selectedShip && (
        <div style={{
          marginTop: '0.5rem',
          padding: '1rem',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          flex: 1,
          overflowY: 'auto',
          color: 'var(--text-primary)'
        }}>
          {/* Removed header section with 상세 정보 text and 위치 편집 button */}

          {!editMode && (
            <div style={{ fontSize: '0.9rem' }}>
              {(selectedShip.length || selectedShip.breath || selectedShip.depth) && (
                <p style={{ margin: '0.3rem 0', color: 'var(--text-primary)' }}>
                  <strong>크기:</strong> {selectedShip.length?.toFixed(1) || selectedShip.length || '0'} x {selectedShip.breath?.toFixed(1) || selectedShip.breath || '0'} x {selectedShip.depth?.toFixed(1) || selectedShip.depth || '0'}m
                </p>
              )}
              {selectedShip.gt && (
                <p style={{ margin: '0.3rem 0', color: 'var(--text-primary)' }}>
                  <strong>무게:</strong> {selectedShip.gt?.toFixed(0) || selectedShip.gt || '0'}t
                </p>
              )}
              {selectedShip.pol && <p style={{ margin: '0.3rem 0' }}><strong>모항:</strong> {selectedShip.pol}</p>}
            </div>
          )}

          {editMode && (
            <div style={{ fontSize: '0.9rem' }}>
              <hr style={{ margin: '0.5rem 0', borderTop: '1px solid #dee2e6' }} />
            </div>
          )}

          <div style={{ fontSize: '0.9rem' }}>
            {selectedShip.type === '어선' && (
              <div style={{ marginBottom: '0.3rem' }}>
                {editMode ? (
                  <div>
                    <h5 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem' }}>어장 위치</h5>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="위도"
                        value={positions.fishingAreaLat}
                        onChange={e => setPositions({...positions, fishingAreaLat: e.target.value})}
                        style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
                      />
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="경도"
                        value={positions.fishingAreaLng}
                        onChange={e => setPositions({...positions, fishingAreaLng: e.target.value})}
                        style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
                      />
                    </div>
                    <button
                      onClick={() => setMapClickMode(mapClickMode === 'fishing' ? null : 'fishing')}
                      style={{
                        width: '100%',
                        padding: '6px',
                        background: mapClickMode === 'fishing' ? '#ffc107' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {mapClickMode === 'fishing' ? '지도에서 클릭하세요' : '지도에서 선택'}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: '0.3rem 0' }}>
                    <strong>어장 위치:</strong> {positions.fishingAreaLat && positions.fishingAreaLng
                      ? `(${parseFloat(positions.fishingAreaLat).toFixed(1)}, ${parseFloat(positions.fishingAreaLng).toFixed(1)})`
                      : '미설정'}
                  </p>
                )}
              </div>
            )}

            <div style={{ marginBottom: '0.3rem' }}>
              {editMode ? (
                <div>
                  <h5 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem' }}>정박 위치</h5>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="위도"
                      value={positions.dockingLat}
                      onChange={e => setPositions({...positions, dockingLat: e.target.value})}
                      style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="경도"
                      value={positions.dockingLng}
                      onChange={e => setPositions({...positions, dockingLng: e.target.value})}
                      style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid #ced4da' }}
                    />
                  </div>
                  <button
                    onClick={() => setMapClickMode(mapClickMode === 'docking' ? null : 'docking')}
                    style={{
                      width: '100%',
                      padding: '6px',
                      background: mapClickMode === 'docking' ? '#ffc107' : '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    {mapClickMode === 'docking' ? '지도에서 클릭하세요' : '지도에서 선택'}
                  </button>
                </div>
              ) : (
                <p style={{ margin: '0.3rem 0' }}>
                  <strong>정박 위치:</strong> {positions.dockingLat && positions.dockingLng
                    ? `(${parseFloat(positions.dockingLat).toFixed(1)}, ${parseFloat(positions.dockingLng).toFixed(1)})`
                    : '미설정'}
                </p>
              )}
            </div>

            {editMode && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  onClick={handleSavePositions}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setPositions({
                      fishingAreaLat: selectedShip.fishingAreaLat || '',
                      fishingAreaLng: selectedShip.fishingAreaLng || '',
                      dockingLat: selectedShip.dockingLat || '',
                      dockingLng: selectedShip.dockingLng || ''
                    });
                    setMapClickMode(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}
                >
                  취소
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShipInfo;