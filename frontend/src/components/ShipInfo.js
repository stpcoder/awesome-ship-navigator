import React from 'react';

const ShipInfo = ({ ships, selectedShip, onSelectShip }) => {
  return (
    <div className="panel">
      <h3>선박 정보</h3>
      <div className="ship-list">
        {ships.map(ship => (
          <div
            key={ship.shipId}
            className={`ship-item ${selectedShip?.shipId === ship.shipId ? 'selected' : ''}`}
            onClick={() => onSelectShip(ship)}
          >
            <div><strong>{ship.name}</strong></div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              ID: {ship.shipId}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              유형: {ship.type}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>
              크기: {ship.length}m × {ship.breath}m
            </div>
          </div>
        ))}
      </div>

      {selectedShip && (
        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8f9fa', borderRadius: '4px' }}>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>상세 정보</h4>
          <div style={{ fontSize: '0.9rem' }}>
            <p><strong>선박명:</strong> {selectedShip.name}</p>
            <p><strong>등록번호:</strong> {selectedShip.shipId}</p>
            <p><strong>유형:</strong> {selectedShip.type}</p>
            <p><strong>길이:</strong> {selectedShip.length}m</p>
            <p><strong>폭:</strong> {selectedShip.breath}m</p>
            <p><strong>깊이:</strong> {selectedShip.depth}m</p>
            <p><strong>총톤수:</strong> {selectedShip.gt}톤</p>
            <p><strong>모항:</strong> {selectedShip.pol}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShipInfo;