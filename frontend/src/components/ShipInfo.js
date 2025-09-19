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
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>선박 정보</h3>

      {/* Ship Dropdown Selector */}
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={shipDropdownValue}
          onChange={handleShipSelect}
          style={{
            width: '100%',
            padding: '0.6rem',
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '10px',
            fontSize: '0.95rem',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
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
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--panel-bg)',
          borderRadius: '4px',
          maxHeight: editMode ? 'calc(100vh - 400px)' : 'auto',
          overflowY: editMode ? 'auto' : 'visible',
          color: 'var(--text-primary)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: '0' }}>상세 정보</h4>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                padding: '4px 12px',
                background: editMode ? '#dc3545' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {editMode ? '취소' : '위치 편집'}
            </button>
          </div>

          {!editMode && (
            <div style={{ fontSize: '0.9rem' }}>
              <p style={{ margin: '0.5rem 0' }}>
                {selectedShip.name} ({selectedShip.shipId}) {selectedShip.type}
                {selectedShip.length && selectedShip.breath && selectedShip.depth && selectedShip.gt && (
                  <> (길이: {selectedShip.length?.toFixed(2) || selectedShip.length}m 폭: {selectedShip.breath?.toFixed(2) || selectedShip.breath}m 깊이: {selectedShip.depth?.toFixed(2) || selectedShip.depth}m 톤수: {selectedShip.gt?.toFixed(2) || selectedShip.gt}톤)</>
                )}
              </p>
              {selectedShip.pol && <p style={{ margin: '0.5rem 0' }}><strong>모항:</strong> {selectedShip.pol}</p>}
            </div>
          )}

          {editMode && (
            <div style={{ fontSize: '0.9rem' }}>
              <p style={{ margin: '0.2rem 0' }}><strong>{selectedShip.name}</strong> ({selectedShip.type})</p>

              <hr style={{ margin: '0.5rem 0', borderTop: '1px solid #dee2e6' }} />
            </div>
          )}

          <div style={{ fontSize: '0.9rem' }}>
            {selectedShip.type === '어선' && (
              <div style={{ marginBottom: '0.8rem' }}>
                <h5 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem' }}>어장 위치</h5>
                {editMode ? (
                  <div>
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
                  <p style={{ margin: '0', color: positions.fishingAreaLat ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {positions.fishingAreaLat && positions.fishingAreaLng
                      ? `${parseFloat(positions.fishingAreaLat).toFixed(4)}, ${parseFloat(positions.fishingAreaLng).toFixed(4)}`
                      : '미설정'}
                  </p>
                )}
              </div>
            )}

            <div style={{ marginBottom: '0.8rem' }}>
              <h5 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem' }}>정박 위치</h5>
              {editMode ? (
                <div>
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
                <p style={{ margin: '0', color: positions.dockingLat ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {positions.dockingLat && positions.dockingLng
                    ? `${parseFloat(positions.dockingLat).toFixed(4)}, ${parseFloat(positions.dockingLng).toFixed(4)}`
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