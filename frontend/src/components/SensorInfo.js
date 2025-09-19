import React, { useState } from 'react';

const SensorInfo = ({ sensorData, onSensorSelect }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedCCTV, setSelectedCCTV] = useState('');
  const [selectedLiDAR, setSelectedLiDAR] = useState('');

  const handleCCTVSelect = (e) => {
    const cctvId = e.target.value;
    setSelectedCCTV(cctvId);

    if (cctvId && onSensorSelect) {
      const cctv = sensorData.cctv?.find(c => c.id.toString() === cctvId);
      if (cctv) {
        onSensorSelect('cctv', {
          id: cctv.id,
          name: cctv.name,
          lat: parseFloat(cctv.latitude),
          lng: parseFloat(cctv.longitude),
          address: cctv.address
        });
      }
    }
  };

  const handleLiDARSelect = (e) => {
    const lidarId = e.target.value;
    setSelectedLiDAR(lidarId);

    if (lidarId && onSensorSelect) {
      const lidar = sensorData.lidar?.find(l => l.id.toString() === lidarId);
      if (lidar) {
        onSensorSelect('lidar', {
          id: lidar.id,
          name: lidar.name,
          lat: parseFloat(lidar.latitude),
          lng: parseFloat(lidar.longitude),
          address: lidar.address
        });
      }
    }
  };

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>센서 정보</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            background: isExpanded ? 'rgba(220, 53, 69, 0.7)' : 'rgba(40, 167, 69, 0.7)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
          }}
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {isExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* CCTV Dropdown */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              CCTV ({sensorData.cctv?.length || 0}개)
            </label>
            <select
              value={selectedCCTV}
              onChange={handleCCTVSelect}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <option value="">CCTV 선택...</option>
              {sensorData.cctv?.map(cctv => (
                <option key={cctv.id} value={cctv.id}>
                  {cctv.name} - {cctv.address}
                </option>
              ))}
            </select>
            {selectedCCTV && sensorData.cctv?.find(c => c.id.toString() === selectedCCTV) && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(102, 126, 234, 0.1)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <div>위치: {parseFloat(sensorData.cctv.find(c => c.id.toString() === selectedCCTV).latitude).toFixed(4)},
                     {parseFloat(sensorData.cctv.find(c => c.id.toString() === selectedCCTV).longitude).toFixed(4)}</div>
              </div>
            )}
          </div>

          {/* LiDAR Dropdown */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              LiDAR ({sensorData.lidar?.length || 0}개)
            </label>
            <select
              value={selectedLiDAR}
              onChange={handleLiDARSelect}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <option value="">LiDAR 선택...</option>
              {sensorData.lidar?.map(lidar => (
                <option key={lidar.id} value={lidar.id}>
                  {lidar.name} - {lidar.address}
                </option>
              ))}
            </select>
            {selectedLiDAR && sensorData.lidar?.find(l => l.id.toString() === selectedLiDAR) && (
              <div style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(102, 126, 234, 0.1)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)'
              }}>
                <div>위치: {parseFloat(sensorData.lidar.find(l => l.id.toString() === selectedLiDAR).latitude).toFixed(4)},
                     {parseFloat(sensorData.lidar.find(l => l.id.toString() === selectedLiDAR).longitude).toFixed(4)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SensorInfo;